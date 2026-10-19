const express = require('express');
const router = express.Router();
const db = require('../data/db');
const { requireSignedIn, requireCustomer, requireProvider, requireAdmin } = require('./customerAuth');
const { findProviderByUserId, processForceRefund, processReleaseEscrow } = require('../services/orderService');
const { createNotification, notifyProvider } = require('../services/notificationService');

function formatNow() {
  const now = new Date();
  return `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function nextComplaintId(complaints) {
  const year = new Date().getFullYear();
  const prefix = `KN-${year}-`;
  let maxNum = 0;
  for (const c of complaints) {
    if (c.id && c.id.startsWith(prefix)) {
      const num = parseInt(c.id.replace(prefix, ''), 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }
  }
  return `${prefix}${String(maxNum + 1).padStart(2, '0')}`;
}

// 1. List complaints for Customer
router.get('/', requireCustomer, (req, res) => {
  const { status, complainantId } = req.query;
  if (complainantId && complainantId !== req.authUser.id) {
    return res.status(403).json({ success: false, message: 'Bạn không có quyền xem khiếu nại của tài khoản khác.' });
  }

  const allComplaints = db.getCollection('complaints') || [];
  let complaints = allComplaints.filter(c =>
    c.complainantId === req.authUser.id ||
    (c.complainant && c.complainant.includes(req.authUser.name))
  );

  if (status) {
    if (status === 'pending') {
      complaints = complaints.filter(c => ['submitted', 'pending', 'under_review', 'awaiting_information'].includes(c.status));
    } else if (status === 'resolved') {
      complaints = complaints.filter(c => ['resolved', 'rejected'].includes(c.status));
    } else {
      complaints = complaints.filter(c => c.status === status);
    }
  }

  res.json({
    success: true,
    total: complaints.length,
    complaints
  });
});

// 2. List complaints for Provider
router.get('/provider', requireProvider, (req, res) => {
  const { status } = req.query;
  const provider = findProviderByUserId(req.authUser.id);
  const providerId = provider ? provider.id : null;
  const providerName = provider ? provider.name : req.authUser.name;

  const allComplaints = db.getCollection('complaints') || [];
  let complaints = allComplaints.filter(c => {
    if (providerId && (c.defendantId === providerId || c.defendantUserId === req.authUser.id)) return true;
    if (c.defendantId === req.authUser.id) return true;
    if (c.defendant && providerName && c.defendant.includes(providerName)) return true;
    return false;
  });

  if (status) {
    if (status === 'active') {
      complaints = complaints.filter(c => ['submitted', 'pending', 'under_review', 'awaiting_information'].includes(c.status));
    } else if (status === 'resolved') {
      complaints = complaints.filter(c => ['resolved', 'rejected'].includes(c.status));
    } else {
      complaints = complaints.filter(c => c.status === status);
    }
  }

  res.json({
    success: true,
    total: complaints.length,
    complaints
  });
});

// 3. Single complaint detail (with permission check)
router.get('/:id', requireSignedIn, (req, res) => {
  const complaints = db.getCollection('complaints') || [];
  const complaint = complaints.find(c => c.id === req.params.id);

  if (!complaint) {
    return res.status(404).json({ success: false, message: 'Hồ sơ khiếu nại không tồn tại!' });
  }

  const role = req.authUser.role;
  if (role !== 'Admin') {
    const isCustomer = complaint.complainantId === req.authUser.id ||
      (complaint.complainant && complaint.complainant.includes(req.authUser.name));
    const provider = findProviderByUserId(req.authUser.id);
    const providerId = provider ? provider.id : null;
    const providerName = provider ? provider.name : req.authUser.name;
    const isProvider = (providerId && (complaint.defendantId === providerId || complaint.defendantUserId === req.authUser.id)) ||
      complaint.defendantId === req.authUser.id ||
      (complaint.defendant && providerName && complaint.defendant.includes(providerName));

    if (!isCustomer && !isProvider) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền truy cập hồ sơ khiếu nại này.' });
    }
  }

  res.json({
    success: true,
    complaint
  });
});

// 4. Submit new dispute / complaint (Customer)
router.post('/', requireCustomer, async (req, res) => {
  try {
    const { orderId, reason, userClaim, amount, priority, attachments } = req.body;

    if (!orderId || !reason || !userClaim || !reason.trim() || !userClaim.trim()) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp đầy đủ mã đơn hàng, lý do và nội dung khiếu nại chi tiết!' });
    }

    const orders = db.getCollection('orders') || [];
    const order = orders.find(item => item.id === orderId);

    if (!order) {
      return res.status(404).json({ success: false, message: 'Đơn hàng không tồn tại trên hệ thống.' });
    }

    if (order.customerId && order.customerId !== req.authUser.id) {
      return res.status(403).json({ success: false, message: 'Chỉ khách hàng sở hữu đơn hàng mới có thể gửi khiếu nại.' });
    }

    if (order.paymentStatus === 'pending' || order.escrowStatus === 'payment_cancelled') {
      return res.status(400).json({ success: false, message: 'Đơn hàng chưa thanh toán ký quỹ nên chưa phát sinh tranh chấp giữ tiền.' });
    }

    if (order.orderStatus === 'cancelled' && order.escrowStatus !== 'disputed') {
      return res.status(400).json({ success: false, message: 'Đơn hàng đã được hủy trước đó, không thể mở khiếu nại.' });
    }

    const complaints = db.getCollection('complaints') || [];
    const activeDispute = complaints.find(c => c.orderId === orderId && !['resolved', 'rejected'].includes(c.status));
    if (activeDispute) {
      return res.status(409).json({
        success: false,
        message: `Đơn hàng này hiện đã có hồ sơ khiếu nại đang xử lý (Mã: ${activeDispute.id}). Bạn không thể mở thêm khiếu nại mới.`,
        complaint: activeDispute
      });
    }

    const newId = nextComplaintId(complaints);
    const dateStr = formatNow();
    const defendantId = order.providerId || 'PRV001';
    const defendantName = order.providerName || order.provider || 'Provider';

    let formattedAmount = 'Theo giá trị đơn';
    if (amount) {
      const cleanNum = Number(String(amount).replace(/\D/g, ''));
      formattedAmount = cleanNum ? cleanNum.toLocaleString('vi-VN') + 'đ' : String(amount);
    } else if (order.priceFormatted) {
      formattedAmount = order.priceFormatted;
    } else if (order.price) {
      const cleanNum = Number(order.price);
      formattedAmount = cleanNum ? cleanNum.toLocaleString('vi-VN') + 'đ' : String(order.price);
    }

    const evidenceList = Array.isArray(attachments)
      ? attachments
      : (attachments ? [{ name: String(attachments), type: 'file', uploadedAt: dateStr }] : []);

    const newComplaint = {
      id: newId,
      orderId,
      serviceTitle: order.serviceTitle || order.service || 'Dịch vụ đã đặt',
      complainantId: req.authUser.id,
      complainant: `${req.authUser.name} (Khách hàng)`,
      defendantId,
      defendant: `${defendantName} (Provider)`,
      reason: reason.trim(),
      amount: formattedAmount,
      amountNum: Number(String(formattedAmount).replace(/\D/g, '')) || Number(order.price) || 0,
      priority: priority || 'high',
      status: 'submitted',
      createdAt: dateStr,
      updatedAt: dateStr,
      userClaim: userClaim.trim(),
      providerClaim: 'Chờ Provider phản hồi giải trình',
      evidence: evidenceList,
      timeline: [
        {
          time: dateStr,
          actor: req.authUser.id,
          actorName: req.authUser.name,
          role: 'Customer',
          action: 'create_complaint',
          note: `Khách hàng mở khiếu nại: ${reason.trim()}`,
          status: 'submitted'
        }
      ]
    };

    complaints.unshift(newComplaint);

    // Freeze order escrow & order status
    order.escrowStatus = 'disputed';
    order.orderStatus = 'disputed';
    if (!order.milestones) order.milestones = [];
    order.milestones.push({
      title: 'Khách hàng mở khiếu nại tranh chấp - Tiền ký quỹ Escrow được tạm khóa bảo vệ',
      done: true,
      time: dateStr
    });

    // Save to Firestore and wait for persistence confirmation
    await db.saveCollectionAndWait('complaints', complaints);
    await db.saveCollectionAndWait('orders', orders);

    // Notify provider and customer
    notifyProvider(defendantId, 'Đơn hàng có khiếu nại tranh chấp mới',
      `Khách hàng đã mở khiếu nại tranh chấp trên đơn hàng ${order.id}. Vui lòng vào Trung Tâm Khiếu Nại để gửi bản giải trình.`,
      'warning', '/complaint.html');

    createNotification(req.authUser.id, 'Đã mở tranh chấp đơn hàng',
      `Khiếu nại ${newId} cho đơn ${order.id} đã được gửi. Toàn bộ tiền ký quỹ Escrow đã được đóng băng an toàn.`,
      'info', '/customer_complaints.html');

    res.status(201).json({
      success: true,
      message: 'Khiếu nại tranh chấp đã được gửi tới Ban Quản Trị sàn! Tiền ký quỹ Escrow được tạm khóa bảo vệ.',
      complaint: newComplaint
    });
  } catch (err) {
    console.error('[complaintRoutes] Lỗi submit complaint:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ hoặc không thể ghi vào Firestore: ' + err.message });
  }
});

// 5. Provider submits defense / evidence
router.post('/:id/defense', requireProvider, async (req, res) => {
  try {
    const { defenseText, attachments } = req.body;

    if (!defenseText || !defenseText.trim()) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập nội dung giải trình chi tiết!' });
    }

    const complaints = db.getCollection('complaints') || [];
    const complaint = complaints.find(c => c.id === req.params.id);

    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Hồ sơ khiếu nại không tồn tại!' });
    }

    const provider = findProviderByUserId(req.authUser.id);
    const providerId = provider ? provider.id : null;
    const providerName = provider ? provider.name : req.authUser.name;
    const isDefendant = (providerId && (complaint.defendantId === providerId || complaint.defendantUserId === req.authUser.id)) ||
      complaint.defendantId === req.authUser.id ||
      (complaint.defendant && providerName && complaint.defendant.includes(providerName));

    if (!isDefendant) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền phản hồi khiếu nại của Provider khác.' });
    }

    if (['resolved', 'rejected'].includes(complaint.status)) {
      return res.status(400).json({ success: false, message: 'Khiếu nại này đã có phán quyết cuối cùng, không thể gửi thêm giải trình.' });
    }

    const dateStr = formatNow();
    complaint.providerClaim = defenseText.trim();
    if (['submitted', 'pending', 'awaiting_information'].includes(complaint.status)) {
      complaint.status = 'under_review';
    }
    complaint.updatedAt = dateStr;

    if (Array.isArray(attachments) && attachments.length) {
      complaint.evidence = (complaint.evidence || []).concat(attachments);
    }

    if (!complaint.timeline) complaint.timeline = [];
    complaint.timeline.push({
      time: dateStr,
      actor: req.authUser.id,
      actorName: req.authUser.name,
      role: 'Provider',
      action: 'provider_defense',
      note: `Provider gửi bản giải trình: ${defenseText.trim().substring(0, 150)}${defenseText.trim().length > 150 ? '...' : ''}`,
      status: complaint.status
    });

    await db.saveCollectionAndWait('complaints', complaints);

    createNotification(complaint.complainantId, 'Chuyên gia đã gửi bản giải trình',
      `Chuyên gia đã bổ sung nội dung giải trình cho khiếu nại ${complaint.id}. BQT sàn đang thụ lý xem xét.`,
      'info', '/customer_complaints.html');

    res.json({
      success: true,
      message: 'Đã gửi bản giải trình chứng cứ tới Ban Quản Trị sàn thành công!',
      complaint
    });
  } catch (err) {
    console.error('[complaintRoutes] Lỗi submit defense:', err);
    res.status(500).json({ success: false, message: 'Lỗi ghi Firestore: ' + err.message });
  }
});

// 6. Provider voluntarily accepts 100% refund to Customer
router.post('/:id/accept-refund', requireProvider, async (req, res) => {
  try {
    const { note } = req.body;
    const complaints = db.getCollection('complaints') || [];
    const complaint = complaints.find(c => c.id === req.params.id);

    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Hồ sơ khiếu nại không tồn tại!' });
    }

    const provider = findProviderByUserId(req.authUser.id);
    const providerId = provider ? provider.id : null;
    const providerName = provider ? provider.name : req.authUser.name;
    const isDefendant = (providerId && (complaint.defendantId === providerId || complaint.defendantUserId === req.authUser.id)) ||
      complaint.defendantId === req.authUser.id ||
      (complaint.defendant && providerName && complaint.defendant.includes(providerName));

    if (!isDefendant) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền thao tác trên khiếu nại này.' });
    }

    if (['resolved', 'rejected'].includes(complaint.status)) {
      return res.status(400).json({ success: false, message: 'Khiếu nại này đã được giải quyết trước đó.' });
    }

    const dateStr = formatNow();
    complaint.status = 'resolved';
    complaint.resolution = 'refund_customer';
    complaint.verdict = 'Provider tự nguyện chấp thuận hoàn lại 100% tiền ký quỹ Escrow cho khách hàng';
    complaint.resolutionNote = note || 'Chuyên gia tự nguyện hoàn tiền theo thỏa thuận';
    complaint.resolvedAt = dateStr;
    complaint.resolvedBy = `${req.authUser.name} (Provider)`;
    complaint.updatedAt = dateStr;

    if (!complaint.timeline) complaint.timeline = [];
    complaint.timeline.push({
      time: dateStr,
      actor: req.authUser.id,
      actorName: req.authUser.name,
      role: 'Provider',
      action: 'voluntary_refund',
      note: 'Chuyên gia tự nguyện chấp nhận hoàn 100% tiền ký quỹ cho khách hàng',
      status: 'resolved'
    });

    // Execute refund on order & customer balance
    try {
      processForceRefund(complaint.orderId);
    } catch (orderErr) {
      console.warn('[complaintRoutes] Cập nhật hoàn tiền order cảnh báo:', orderErr.message);
      const orders = db.getCollection('orders') || [];
      const order = orders.find(o => o.id === complaint.orderId);
      if (order) {
        order.escrowStatus = 'refunded';
        order.orderStatus = 'cancelled';
        const users = db.getCollection('users') || [];
        const cust = users.find(u => u.id === order.customerId);
        if (cust) cust.balance = (cust.balance || 0) + (Number(order.escrowDeposit) || Number(order.price) || 0);
        db.saveCollection('users', users);
        db.saveCollection('orders', orders);
      }
    }

    await db.saveCollectionAndWait('complaints', complaints);

    createNotification(complaint.complainantId, 'Chuyên gia đã đồng ý hoàn tiền',
      `Chuyên gia đã đồng ý hoàn 100% tiền ký quỹ đơn hàng ${complaint.orderId} vào ví của bạn. Vụ tranh chấp đã kết thúc.`,
      'success', '/customer_complaints.html');

    res.json({
      success: true,
      message: 'Đã hoàn tất chấp nhận hoàn tiền 100% cho khách hàng!',
      complaint
    });
  } catch (err) {
    console.error('[complaintRoutes] Lỗi accept refund:', err);
    res.status(500).json({ success: false, message: 'Lỗi ghi Firestore: ' + err.message });
  }
});

module.exports = router;
