const express = require('express');
const router = express.Router();
const db = require('../data/db');
const { requireCustomer } = require('./customerAuth');

// List complaints
router.get('/', requireCustomer, (req, res) => {
  const { status, complainantId } = req.query;
  if (complainantId && complainantId !== req.authUser.id) {
    return res.status(403).json({ success: false, message: 'Bạn không có quyền xem khiếu nại của tài khoản khác.' });
  }
  let complaints = (db.getCollection('complaints') || []).filter(c => c.complainantId === req.authUser.id);

  if (status) {
    complaints = complaints.filter(c => c.status === status);
  }
  if (complainantId) {
    complaints = complaints.filter(c => c.complainantId === complainantId);
  }

  res.json({
    success: true,
    total: complaints.length,
    complaints
  });
});

// Submit new dispute / complaint
router.post('/', requireCustomer, (req, res) => {
  const { orderId, defendantId, defendant, reason, amount, userClaim, priority } = req.body;

  if (!orderId || !reason || !userClaim) {
    return res.status(400).json({ success: false, message: 'Vui lòng điền mã đơn hàng, lý do và nội dung khiếu nại chi tiết!' });
  }

  const orders = db.getCollection('orders');
  const order = orders.find(item => item.id === orderId);
  if (!order || order.customerId !== req.authUser.id) {
    return res.status(403).json({ success: false, message: 'Chỉ khách hàng sở hữu đơn hàng mới có thể gửi khiếu nại.' });
  }

  const complaints = db.getCollection('complaints');
  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const newId = `KN-${now.getFullYear()}-${String(complaints.length + 1).padStart(2, '0')}`;

  const newComplaint = {
    id: newId,
    orderId,
    complainantId: req.authUser.id,
    complainant: `${req.authUser.name} (Khách hàng)`,
    defendantId: defendantId || 'PRV001',
    defendant: defendant || 'Nguyễn Văn An (Provider)',
    reason: reason.trim(),
    amount: amount || 'Theo giá trị đơn',
    priority: priority || 'high',
    status: 'pending',
    createdAt: dateStr,
    userClaim: userClaim.trim(),
    providerClaim: 'Chờ Provider phản hồi giải trình'
  };

  complaints.unshift(newComplaint);
  db.saveCollection('complaints', complaints);

  // Freeze order escrow status
  order.escrowStatus = 'disputed';
  order.orderStatus = 'disputed';
  db.saveCollection('orders', orders);

  res.status(201).json({
    success: true,
    message: 'Khiếu nại tranh chấp đã được gửi tới Ban Quản Trị sàn! Tiền ký quỹ Escrow được tạm khóa bảo vệ.',
    complaint: newComplaint
  });
});

// Admin resolves complaint
router.put('/:id/resolve', (req, res) => {
  const { resolution, refundPercentage = 100 } = req.body; // 'refund_customer' or 'pay_provider'
  const complaints = db.getCollection('complaints');
  const complaint = complaints.find(c => c.id === req.params.id);

  if (!complaint) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ khiếu nại!' });
  }

  complaint.status = 'resolved';
  complaint.resolution = resolution;

  const orders = db.getCollection('orders');
  const order = orders.find(o => o.id === complaint.orderId);
  if (order) {
    if (resolution === 'refund_customer') {
      order.escrowStatus = 'refunded';
      order.orderStatus = 'cancelled';
    } else {
      order.escrowStatus = 'completed';
      order.orderStatus = 'completed';
    }
    db.saveCollection('orders', orders);
  }

  db.saveCollection('complaints', complaints);

  res.json({
    success: true,
    message: 'Đã giải quyết tranh chấp Escrow thành công!',
    complaint
  });
});

module.exports = router;
