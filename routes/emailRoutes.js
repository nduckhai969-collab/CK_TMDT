const express = require('express');
const router = express.Router();
const { requireAdmin } = require('./customerAuth');
const {
  addSuppression,
  recordEvent,
  findEmail,
  listEmails,
  getStats,
  isSuppressed,
  getMarketingCooldown,
  CYCLE_DAYS,
  enqueueAndSend
} = require('../services/emailQueue');
const { BASE_URL, renderRecommendation, verifySmtp } = require('../services/emailService');
const { recommendForMarketing } = require('../services/recommendService');
const { daysBetween } = require('../utils/dates');
const db = require('../data/db');

// Thu thập toàn bộ khách hàng Customer đang active (bỏ qua locked, pending_verification, đã hủy nhận).
function collectRecipients(segment = 'all') {
  const allUsers = db.getCollection('users') || [];
  const excludedStats = { locked: 0, pendingVerification: 0, suppressed: 0 };
  const list = [];

  for (const user of allUsers) {
    if (user.role !== 'Customer' || !user.email) continue;
    if (user.status === 'locked') { excludedStats.locked += 1; continue; }
    if (user.status === 'pending_verification' || user.status !== 'active') {
      excludedStats.pendingVerification += 1;
      continue;
    }
    if (isSuppressed(user.email)) { excludedStats.suppressed += 1; continue; }

    const result = recommendForMarketing(user.id);
    if (!result.eligible || !result.items.length) continue;

    if (segment !== 'all' && result.campaignType !== segment) continue;

    const elapsed = result.lastOrderAt ? daysBetween(result.lastOrderAt) : null;
    const cooldown = getMarketingCooldown(user.id);
    const isSampleDomain = /@example\.com$/i.test(String(user.email).trim());
    const marketingApproved = user.marketingApproved === true;

    let sendState = 'ready';
    if (!marketingApproved) sendState = 'not_approved';
    else if (cooldown.inCooldown) sendState = 'cooldown';
    else if (isSampleDomain) sendState = 'sample_domain';

    list.push({
      user,
      result,
      daysSinceLastOrder: elapsed != null ? Math.floor(elapsed) : null,
      cooldown,
      isSampleDomain,
      marketingApproved,
      sendState
    });
  }

  return { list, excludedStats };
}

const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

// Hủy nhận email marketing (1 click, không cần đăng nhập).
router.get('/unsubscribe', (req, res) => {
  const record = findEmail(req.query.e);
  const email = (record && record.to) || req.query.email || '';
  addSuppression(email, 'unsubscribe');
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!doctype html><html><body style="font-family:Arial,sans-serif;text-align:center;padding:60px">
    <h2>Đã hủy nhận email marketing</h2>
    <p>${email ? 'Địa chỉ ' + String(email).replace(/[<>&]/g, '') : 'Tài khoản của bạn'} sẽ không nhận thêm email gợi ý từ SkillRental.</p>
  </body></html>`);
});

// Ảnh 1x1 ghi nhận lượt mở (chỉ để tham khảo).
router.get('/o/:id', (req, res) => {
  recordEvent(req.params.id, 'open');
  res.set('Content-Type', 'image/gif');
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.end(PIXEL);
});

// Ghi nhận lượt click rồi chuyển hướng về đích.
router.get('/c/:id', (req, res) => {
  const target = String(req.query.u || '');
  recordEvent(req.params.id, 'click', target);
  const safe = target.startsWith(BASE_URL) ? target : `${BASE_URL}/customer.html`;
  res.redirect(safe);
});

// Kiểm tra trạng thái SMTP & thống kê đối tượng (chỉ admin).
router.get('/status', requireAdmin, async (_req, res) => {
  try {
    const smtp = await verifySmtp();
    const { list, excludedStats } = collectRecipients('all');
    const approvedCount = list.filter(x => x.marketingApproved).length;
    res.json({
      success: true,
      smtp,
      cycleDays: CYCLE_DAYS,
      audience: {
        activeCustomers: list.length,
        approvedCustomers: approvedCount,
        personalizedCount: list.filter(x => x.result.campaignType === 'personalized').length,
        discoveryCount: list.filter(x => x.result.campaignType === 'discovery').length,
        excludedStats
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Xem log email (chỉ admin).
router.get('/logs', requireAdmin, (_req, res) => {
  res.json({ success: true, stats: getStats(), emails: listEmails().slice(0, 200) });
});

// Admin chấp thuận hoặc hủy chấp thuận nhận email marketing cho khách hàng.
router.put('/approvals', requireAdmin, async (req, res) => {
  try {
    const { userId, userIds, approved } = req.body || {};
    const targetIds = Array.isArray(userIds) ? userIds.map(String) : (userId ? [String(userId)] : []);
    if (!targetIds.length || typeof approved !== 'boolean') {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp danh sách userId và trạng thái approved (true/false).' });
    }

    const users = db.getCollection('users') || [];
    const targetSet = new Set(targetIds);
    let updated = 0;
    const skipped = [];

    for (const user of users) {
      if (!targetSet.has(String(user.id))) continue;
      if (user.role !== 'Customer') {
        skipped.push({ id: user.id, reason: 'Không phải tài khoản Customer' });
        continue;
      }
      if (approved && user.status !== 'active') {
        skipped.push({ id: user.id, reason: `Tài khoản đang ở trạng thái ${user.status}` });
        continue;
      }
      user.marketingApproved = approved;
      user.marketingApprovedAt = approved ? new Date().toISOString() : null;
      updated += 1;
    }

    await db.saveCollectionAndWait('users', users);
    return res.json({
      success: true,
      updated,
      skipped,
      message: approved
        ? `Đã chấp thuận ${updated} tài khoản tham gia chiến dịch marketing (chu kỳ mỗi ${CYCLE_DAYS} ngày).`
        : `Đã tắt quyền nhận marketing cho ${updated} tài khoản.`
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Xem trước danh sách khách đủ điều kiện (chỉ admin).
router.get('/preview', requireAdmin, async (req, res) => {
  try {
    const segment = String(req.query.segment || 'all');
    const { list, excludedStats } = collectRecipients(segment);
    const preview = list.map(({ user, result, daysSinceLastOrder, cooldown, isSampleDomain, marketingApproved, sendState }) => ({
      userId: user.id,
      email: user.email,
      name: user.name,
      profileOrders: result.profileOrders,
      campaignType: result.campaignType,
      daysSinceLastOrder,
      marketingApproved,
      isSampleDomain,
      inCooldown: cooldown.inCooldown,
      daysSinceLastEmail: cooldown.daysSinceLast,
      nextEligibleInDays: cooldown.nextEligibleInDays,
      lastEmailStatus: cooldown.lastEmail ? cooldown.lastEmail.status : null,
      sendState,
      items: result.items,
      reason: result.reason
    }));
    res.json({ success: true, cycleDays: CYCLE_DAYS, excludedStats, preview });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Xem trước nội dung email sẽ gửi cho từng khách (chỉ admin).
router.get('/preview-content', requireAdmin, async (req, res) => {
  try {
    const segment = String(req.query.segment || 'all');
    const approvedOnly = req.query.approvedOnly === '1';
    const { list } = collectRecipients(segment);
    const targetList = approvedOnly ? list.filter(x => x.marketingApproved) : list;
    const preview = targetList.map(({ user, result, marketingApproved }) => {
      const content = renderRecommendation(user, result.items, 'PREVIEW', result.campaignType);
      return {
        userId: user.id,
        name: user.name,
        email: user.email,
        campaignType: result.campaignType,
        marketingApproved,
        subject: content.subject,
        html: content.html
      };
    });
    res.json({ success: true, preview });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Gửi email test nhanh tới 1 địa chỉ email bất kỳ để kiểm tra SMTP thật (chỉ admin).
router.post('/test', requireAdmin, async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const mode = req.body?.mode === 'personalized' ? 'personalized' : 'discovery';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: 'Địa chỉ email kiểm thử không hợp lệ.' });
    }

    const activeServices = (db.getCollection('services') || [])
      .filter(s => s && s.status !== 'inactive' && s.status !== 'locked' && s.status !== 'pending');
    const items = activeServices.slice(0, mode === 'personalized' ? 3 : activeServices.length).map(s => ({
      id: s.id,
      title: s.title,
      category: s.category,
      price: s.price,
      priceUnit: s.priceUnit,
      providerName: s.providerName,
      desc: s.desc || s.description || '',
      score: 1,
      matched: mode === 'personalized' ? ['dịch vụ', 'uy tín'] : []
    }));

    if (!items.length) {
      return res.status(400).json({ success: false, message: 'Chưa có dịch vụ đang hoạt động để dựng nội dung email mẫu.' });
    }

    const outcome = await enqueueAndSend({
      user: { id: 'TEST', name: req.authUser?.name || 'Admin Test', email },
      items,
      reason: 'Kiểm thử kết nối SMTP từ Admin',
      template: 'M3_TEST',
      campaignType: mode,
      forceResend: true,
      type: 'test'
    });

    if (outcome.sent) {
      return res.json({
        success: true,
        ...outcome,
        message: `Đã gửi email test thật tới ${email} (MessageID: ${outcome.messageId || 'OK'}). Nếu chưa thấy ở Hộp thư đến, hãy kiểm tra mục Spam/Quảng cáo.`
      });
    }
    if (outcome.dryRun) {
      return res.json({
        success: true,
        ...outcome,
        message: `Hệ thống đang ở chế độ Dry-run (chưa có SMTP hoặc chưa verify), mới ghi log cho ${email}, CHƯA gửi mail thật ra ngoài.`
      });
    }
    return res.status(502).json({
      success: false,
      ...outcome,
      message: `Gửi email test thất bại: ${outcome.error || 'Lỗi SMTP không xác định'}`
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Gửi chiến dịch ngay tới các tài khoản được Admin chấp thuận (chỉ admin).
router.post('/send-campaign', requireAdmin, async (req, res) => {
  try {
    const { userIds, segment = 'all', forceResend = false, autoApproveSelected = false } = req.body || {};
    const selectedSet = Array.isArray(userIds) && userIds.length ? new Set(userIds.map(String)) : null;

    if (autoApproveSelected && selectedSet) {
      const users = db.getCollection('users') || [];
      let changed = false;
      for (const u of users) {
        if (selectedSet.has(String(u.id)) && u.role === 'Customer' && u.status === 'active' && u.marketingApproved !== true) {
          u.marketingApproved = true;
          u.marketingApprovedAt = new Date().toISOString();
          changed = true;
        }
      }
      if (changed) await db.saveCollectionAndWait('users', users);
    }

    const { list } = collectRecipients(segment);
    const targets = selectedSet ? list.filter(item => selectedSet.has(String(item.user.id))) : list;

    let sent = 0;
    let logged = 0;
    let failed = 0;
    let skipped = 0;
    const details = [];

    for (const { user, result, marketingApproved } of targets) {
      if (!marketingApproved) {
        skipped += 1;
        details.push({ userId: user.id, email: user.email, status: 'skipped', reason: 'Chưa được Admin chấp thuận' });
        continue;
      }

      const outcome = await enqueueAndSend({
        user,
        items: result.items,
        reason: result.reason,
        template: result.template,
        campaignType: result.campaignType,
        forceResend: Boolean(forceResend)
      });

      if (outcome.sent) {
        sent += 1;
        details.push({ userId: user.id, email: user.email, campaignType: result.campaignType, status: 'sent', messageId: outcome.messageId });
      } else if (outcome.dryRun) {
        logged += 1;
        details.push({ userId: user.id, email: user.email, campaignType: result.campaignType, status: 'logged', reason: 'Dry-run (chưa cấu hình SMTP)' });
      } else if (outcome.status === 'failed') {
        failed += 1;
        details.push({ userId: user.id, email: user.email, campaignType: result.campaignType, status: 'failed', error: outcome.error });
      } else {
        skipped += 1;
        const reasonMap = {
          'frequency-cap': `Đang trong chu kỳ chờ ${CYCLE_DAYS} ngày (còn ${outcome.nextEligibleInDays || '?'} ngày)`,
          'suppressed': 'Khách hàng đã hủy nhận email',
          'no-items': 'Không có dịch vụ phù hợp'
        };
        details.push({ userId: user.id, email: user.email, status: 'skipped', reason: reasonMap[outcome.skipped] || outcome.skipped });
      }
    }

    res.json({
      success: true,
      sent,
      logged,
      failed,
      skipped,
      details,
      message: `Hoàn tất chiến dịch: Gửi thật ${sent} email, Dry-run ${logged}, Bỏ qua ${skipped}, Lỗi ${failed}.`
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
