const express = require('express');
const router = express.Router();
const { requireAdmin } = require('./customerAuth');
const { addSuppression, recordEvent, findEmail, listEmails, getStats, isSuppressed } = require('../services/emailQueue');
const { BASE_URL, renderRecommendation } = require('../services/emailService');
const { recommendForUser } = require('../services/recommendService');
const { daysBetween } = require('../utils/dates');
const db = require('../data/db');

const MIN_ORDERS = 2;
const TRIGGER_DAYS = 0; // tạm hạ để test

// Lọc khách hàng đủ điều kiện nhận email marketing (M3).
function collectRecipients() {
  const customers = (db.getCollection('users') || []).filter(u => u.role === 'Customer' && u.email);
  const list = [];
  for (const user of customers) {
    if (isSuppressed(user.email)) continue;
    const result = recommendForUser(user.id);
    if (!result.eligible || result.profileOrders < MIN_ORDERS) continue;
    const elapsed = result.lastOrderAt ? daysBetween(result.lastOrderAt) : null;
    if (elapsed == null || elapsed < TRIGGER_DAYS) continue;
    list.push({ user, result, daysSinceLastOrder: Math.floor(elapsed) });
  }
  return list;
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

// Xem log email (chỉ admin).
router.get('/logs', requireAdmin, (req, res) => {
  res.json({ success: true, stats: getStats(), emails: listEmails().slice(0, 200) });
});

// Xem trước danh sách khách đủ điều kiện (chỉ admin).
router.get('/preview', requireAdmin, async (req, res) => {
  try {
    const preview = collectRecipients().map(({ user, result, daysSinceLastOrder }) => ({
      email: user.email,
      name: user.name,
      daysSinceLastOrder,
      items: result.items,
      reason: result.reason
    }));
    res.json({ success: true, preview });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Xem trước nội dung email sẽ gửi cho từng khách (chỉ admin).
router.get('/preview-content', requireAdmin, async (req, res) => {
  try {
    const preview = collectRecipients().map(({ user, result }) => {
      const content = renderRecommendation(user, result.items, 'PREVIEW');
      return { name: user.name, email: user.email, subject: content.subject, html: content.html };
    });
    res.json({ success: true, preview });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Gửi chiến dịch ngay lập tức (chỉ admin).
router.post('/send-campaign', requireAdmin, async (req, res) => {
  try {
    const { enqueueAndSend } = require('../services/emailQueue');
    let sent = 0;
    for (const { user, result } of collectRecipients()) {
      const outcome = await enqueueAndSend({ user, items: result.items, reason: result.reason });
      if (outcome.sent) sent += 1;
    }
    res.json({ success: true, message: `Đã xử lý xong chiến dịch. Gửi thành công ${sent} email.` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
