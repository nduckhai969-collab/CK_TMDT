const express = require('express');
const router = express.Router();
const db = require('../data/db');
const { slotsForDate } = require('./providerAvailability');
const { requireCustomer } = require('./customerAuth');

// List orders
router.get('/', requireCustomer, (req, res) => {
  const { customerId, providerId, status, escrowStatus } = req.query;
  let orders = db.getCollection('orders');

  if (customerId && customerId !== req.authUser.id) {
    return res.status(403).json({ success: false, message: 'Bạn không có quyền xem đơn hàng của tài khoản khác.' });
  }
  orders = orders.filter(o => o.customerId === req.authUser.id);

  if (customerId) {
    orders = orders.filter(o => o.customerId === customerId);
  }
  if (providerId) {
    orders = orders.filter(o => o.providerId === providerId);
  }
  if (status) {
    orders = orders.filter(o => o.orderStatus === status);
  }
  if (escrowStatus) {
    orders = orders.filter(o => o.escrowStatus === escrowStatus);
  }

  res.json({
    success: true,
    total: orders.length,
    orders
  });
});

// Single order detail
router.get('/:id', requireCustomer, (req, res) => {
  const orders = db.getCollection('orders');
  const order = orders.find(o => o.id === req.params.id);

  if (!order) {
    return res.status(404).json({ success: false, message: 'Đơn hàng không tồn tại!' });
  }

  if (order.customerId !== req.authUser.id) {
    return res.status(403).json({ success: false, message: 'Bạn không có quyền xem đơn hàng này.' });
  }

  res.json({
    success: true,
    order
  });
});

// Create new booking / order with Escrow Deposit
router.post('/', requireCustomer, (req, res) => {
  const {
    customerPhone,
    providerId,
    providerName,
    serviceId,
    serviceTitle,
    price,
    deadline,
    scheduledDate,
    scheduledTime,
    notes,
    paymentMethod
  } = req.body;

  if (!providerId || !price) {
    return res.status(400).json({ success: false, message: 'Thông tin đặt dịch vụ không hợp lệ!' });
  }

  if (scheduledDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) {
      return res.status(400).json({ success: false, message: 'Ngày đặt lịch không hợp lệ.' });
    }
    const [year, month, day] = scheduledDate.split('-').map(Number);
    const appointmentDate = new Date(year, month - 1, day, 12);
    const provider = (db.getCollection('providers') || []).find(item => item.id === providerId);
    if (!provider || appointmentDate.getFullYear() !== year || appointmentDate.getMonth() !== month - 1 || appointmentDate.getDate() !== day) {
      return res.status(400).json({ success: false, message: 'Không tìm thấy Provider hoặc ngày đặt lịch không hợp lệ.' });
    }
    const availableSlots = slotsForDate(provider, appointmentDate, db.getCollection('orders') || []);
    if (!scheduledTime || !availableSlots.includes(scheduledTime)) {
      return res.status(409).json({ success: false, message: 'Khung giờ này đã qua hoặc Provider không còn rảnh. Vui lòng chọn ngày và giờ khác.' });
    }
  }

  const orders = db.getCollection('orders');
  const priceNum = Number(price);
  const platformFee = Math.round(priceNum * 0.05); // 5% escrow protection & platform fee
  const escrowDeposit = priceNum + platformFee;

  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const newId = `DH00${randomSuffix}`;

  const newOrder = {
    id: newId,
    customerId: req.authUser.id,
    customerName: req.authUser.name,
    customerPhone: customerPhone || '0988 776 655',
    providerId: providerId,
    providerName: providerName || 'Chuyên gia SkillRental',
    providerPhone: '0901 234 567',
    serviceId: serviceId || 'SVC_CUSTOM',
    serviceTitle: serviceTitle || 'Dịch vụ kỹ năng chuyên nghiệp',
    price: priceNum,
    priceFormatted: priceNum.toLocaleString('vi-VN') + 'đ',
    platformFee: platformFee,
    escrowDeposit: escrowDeposit,
    escrowStatus: 'escrow_held', // Funds securely locked in Escrow vault
    orderStatus: 'processing',   // Started
    paymentMethod: paymentMethod || 'Ví điện tử VNPay (Escrow 100%)',
    date: dateStr,
    deadline: deadline || '7 ngày sau đặt cọc',
    scheduledDate: scheduledDate || '',
    scheduledTime: scheduledTime || '',
    notes: notes || '',
    milestones: [
      { title: 'Ký quỹ Escrow bảo vệ 100% thành công', done: true, time: dateStr },
      { title: 'Provider tiếp nhận yêu cầu & triển khai công việc', done: true, time: dateStr },
      { title: 'Bàn giao sản phẩm / hoàn thành dịch vụ', done: false, time: 'Đang triển khai' },
      { title: 'Khách hàng nghiệm thu & Giải ngân Escrow', done: false, time: 'Chờ nghiệm thu' }
    ]
  };

  orders.unshift(newOrder);
  db.saveCollection('orders', orders);

  // Deduct balance or register escrow
  const users = db.getCollection('users');
  const customer = users.find(u => u.id === newOrder.customerId);
  if (customer && customer.balance >= escrowDeposit) {
    customer.balance -= escrowDeposit;
    db.saveCollection('users', users);
  }

  res.status(201).json({
    success: true,
    message: 'Tạo đơn đặt lịch & Ký quỹ Escrow thành công! Tiền được bảo vệ an toàn 100% tại sàn.',
    order: newOrder
  });
});

// Update order milestone / delivery status (Provider or System)
router.put('/:id/status', (req, res) => {
  const { status, milestoneTitle } = req.body;
  const orders = db.getCollection('orders');
  const order = orders.find(o => o.id === req.params.id);

  if (!order) {
    return res.status(404).json({ success: false, message: 'Đơn hàng không tồn tại!' });
  }

  const now = new Date();
  const timeStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  if (status) {
    order.orderStatus = status;
  }

  if (status === 'delivered') {
    // Mark delivery milestone as done
    if (order.milestones && order.milestones[2]) {
      order.milestones[2].done = true;
      order.milestones[2].time = timeStr;
    }
  }

  db.saveCollection('orders', orders);

  res.json({
    success: true,
    message: 'Cập nhật trạng thái đơn hàng thành công!',
    order
  });
});

// Customer releases Escrow funds to Provider
router.put('/:id/release-escrow', requireCustomer, (req, res) => {
  const orders = db.getCollection('orders');
  const order = orders.find(o => o.id === req.params.id);

  if (!order) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng!' });
  }

  if (order.customerId !== req.authUser.id) {
    return res.status(403).json({ success: false, message: 'Bạn không có quyền thao tác đơn hàng này.' });
  }

  if (order.escrowStatus === 'completed') {
    return res.status(400).json({ success: false, message: 'Đơn hàng này đã được giải ngân Escrow trước đó!' });
  }

  const now = new Date();
  const timeStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  order.escrowStatus = 'completed';
  order.orderStatus = 'completed';

  // Mark all milestones as done
  if (order.milestones) {
    order.milestones.forEach(m => m.done = true);
    if (order.milestones[3]) {
      order.milestones[3].time = timeStr;
    }
  }

  // Credit Provider wallet
  const users = db.getCollection('users');
  const providerUser = users.find(u => u.name === order.providerName || u.id === order.providerId);
  if (providerUser) {
    providerUser.balance = (providerUser.balance || 0) + Number(order.price);
  }

  db.saveCollection('orders', orders);
  db.saveCollection('users', users);

  res.json({
    success: true,
    message: `Đã nghiệm thu thành công! Số tiền ${order.priceFormatted} đã được giải ngân an toàn vào ví Provider.`,
    order
  });
});

// Cancel / Dispute order
router.put('/:id/cancel', requireCustomer, (req, res) => {
  const { reason } = req.body;
  const orders = db.getCollection('orders');
  const order = orders.find(o => o.id === req.params.id);

  if (!order) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng!' });
  }

  if (order.customerId !== req.authUser.id) {
    return res.status(403).json({ success: false, message: 'Bạn không có quyền thao tác đơn hàng này.' });
  }

  order.orderStatus = 'disputed';
  order.escrowStatus = 'disputed';
  order.disputeReason = reason || 'Khách hàng yêu cầu hủy / khiếu nại chất lượng';

  db.saveCollection('orders', orders);

  res.json({
    success: true,
    message: 'Đơn hàng đã được chuyển sang trạng thái Tranh chấp. Tiền ký quỹ Escrow được tạm khóa chờ Admin xử lý!',
    order
  });
});

module.exports = router;
