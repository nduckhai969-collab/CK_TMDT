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
  if (order.cancellationRequest?.status === 'pending') order.cancellationRequest.status = 'escalated_to_admin';
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
  if (!['refund_customer', 'pay_provider', 'partial_refund'].includes(resolution)) {
    return res.status(400).json({ success: false, message: 'Phương án xử lý khiếu nại không hợp lệ.' });
  }
  const complaints = db.getCollection('complaints');
  const complaint = complaints.find(c => c.id === req.params.id);

  if (!complaint) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ khiếu nại!' });
  }
  if (complaint.status === 'resolved') {
    return res.status(409).json({ success: false, message: 'Khiếu nại này đã được giải quyết.' });
  }

  const orders = db.getCollection('orders') || [];
  const order = orders.find(o => o.id === complaint.orderId);
  if (order) {
    if (order.orderStatus !== 'disputed' || order.escrowStatus !== 'disputed') {
      return res.status(409).json({ success: false, message: 'Đơn hàng không còn ở trạng thái tranh chấp.' });
    }
    const refundPercent = resolution === 'refund_customer' ? 100
      : resolution === 'pay_provider' ? 0
        : Math.max(0, Math.min(100, Number(refundPercentage) || 0));
    const escrowTotal = Math.max(0, Number(order.escrowDeposit) || Number(order.price) || 0);
    const refundAmount = Math.round(escrowTotal * refundPercent / 100);
    const providerAmount = escrowTotal - refundAmount;
    const now = new Date();
    const timeStr = now.toLocaleString('vi-VN');
    const users = db.getCollection('users') || [];
    const customer = users.find(u => u.id === order.customerId);
    const providers = db.getCollection('providers') || [];
    const provider = providers.find(p => p.id === order.providerId);
    const providerUser = provider && users.find(u => u.id === provider.userId);
    if ((refundAmount > 0 && !customer) || (providerAmount > 0 && !providerUser)) {
      return res.status(409).json({ success: false, message: 'Không tìm thấy tài khoản nhận tiền; chưa ghi nhận phán quyết.' });
    }
    const transactions = db.getCollection('walletTransactions') || [];

    if (refundAmount > 0 && customer) {
      customer.balance = (Number(customer.balance) || 0) + refundAmount;
      transactions.unshift({ id: `TXN_${Date.now()}_R`, userId: customer.id, type: 'refund', amount: refundAmount, status: 'completed', createdAt: timeStr, description: `Hoàn ${refundPercent}% Escrow từ khiếu nại ${complaint.id} / đơn ${order.id}` });
    }
    if (providerAmount > 0 && providerUser) {
      providerUser.balance = (Number(providerUser.balance) || 0) + providerAmount;
      transactions.unshift({ id: `TXN_${Date.now()}_P`, userId: providerUser.id, type: 'disbursement', amount: providerAmount, status: 'completed', createdAt: timeStr, description: `Thanh toán phần Escrow còn lại từ khiếu nại ${complaint.id} / đơn ${order.id}` });
    }
    db.saveCollection('users', users);
    db.saveCollection('walletTransactions', transactions);
    order.refundAmount = refundAmount;
    order.refundedAt = refundAmount > 0 ? timeStr : null;
    order.escrowStatus = refundPercent === 100 ? 'refunded' : refundPercent === 0 ? 'completed' : 'partially_settled';
    order.orderStatus = refundPercent === 100 ? 'cancelled' : 'completed';
    order.disputeResolution = { complaintId: complaint.id, refundPercent, refundAmount, providerAmount, resolvedAt: now.toISOString() };
    db.saveCollection('orders', orders);
    complaint.refundPercentage = refundPercent;
    complaint.refundAmount = refundAmount;
    complaint.providerAmount = providerAmount;
  }

  complaint.status = 'resolved';
  complaint.resolution = resolution;
  complaint.resolvedAt = new Date().toLocaleString('vi-VN');
  db.saveCollection('complaints', complaints);

  res.json({
    success: true,
    message: 'Đã giải quyết tranh chấp Escrow thành công!',
    complaint
  });
});

module.exports = router;
