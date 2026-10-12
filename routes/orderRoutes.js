const express = require('express');
const router = express.Router();
const db = require('../data/db');
const { slotsForDate } = require('./providerAvailability');
const { requireCustomer, requireRole, requireSignedIn } = require('./customerAuth');
const { processAcceptOrder, processDeliverOrder, processProgressOrder, processCancelOrder, processUndoCancelOrder, processReleaseEscrow } = require('../services/orderService');
const { createNotification, notifyProvider } = require('../services/notificationService');

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
  
  // Calculate price securely from backend
  const services = db.getCollection('services') || [];
  const providers = db.getCollection('providers') || [];
  const provider = providers.find(item => item.id === providerId);
  if (!provider) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy Provider của đơn hàng.' });
  }
  const service = services.find(s => s.id === serviceId);
  
  // Nạp 1 giá trị an toàn, mặc định dùng req.body.price nếu không tìm thấy nhưng cảnh báo
  let priceNum = Number(price);
  if (service && service.price) {
    // Nếu có hours (từ req.body, mặc định 1)
    const hours = Number(req.body.hours) || 1;
    priceNum = Number(service.price) * hours;
  }

  const platformFee = Math.round(priceNum * 0.05); // 5% escrow protection & platform fee
  const escrowDeposit = priceNum + platformFee;

  const users = db.getCollection('users');
  const customer = users.find(u => u.id === req.authUser.id);
  
  if (!customer || customer.balance < escrowDeposit) {
    return res.status(400).json({ 
      success: false, 
      message: `Số dư không đủ. Cần ${escrowDeposit.toLocaleString('vi-VN')}đ (bao gồm phí sàn), nhưng số dư là ${(customer?.balance || 0).toLocaleString('vi-VN')}đ.`
    });
  }

  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  let newId;
  do {
    newId = `DH00${Math.floor(1000 + Math.random() * 9000)}`;
  } while (orders.some(o => o.id === newId));

  const newOrder = {
    id: newId,
    customerId: req.authUser.id,
    customerName: req.authUser.name,
    customerPhone: customerPhone || customer.phone || '',
    providerId: providerId,
    providerName: provider.name || providerName || 'Provider',
    providerPhone: provider.phone || '',
    serviceId: serviceId || null,
    serviceTitle: (service ? service.title : serviceTitle) || 'Hợp đồng dịch vụ',
    price: priceNum,
    priceFormatted: priceNum.toLocaleString('vi-VN') + 'đ',
    platformFee: platformFee,
    escrowDeposit: escrowDeposit,
    escrowStatus: 'escrow_held', // Funds securely locked in Escrow vault
    orderStatus: 'pending',      // Pending provider acceptance
    paymentMethod: paymentMethod || 'Ví điện tử VNPay (Escrow 100%)',
    date: dateStr,
    deadline: deadline || '7 ngày sau đặt cọc',
    scheduledDate: scheduledDate || '',
    scheduledTime: scheduledTime || '',
    notes: notes || '',
    milestones: [
      { title: 'Ký quỹ Escrow bảo vệ 100% thành công', done: true, time: dateStr },
      { title: 'Provider tiếp nhận yêu cầu & triển khai công việc', done: false, time: 'Chờ tiếp nhận' },
      { title: 'Bàn giao sản phẩm / hoàn thành dịch vụ', done: false, time: 'Chờ bàn giao' },
      { title: 'Khách hàng nghiệm thu & Giải ngân Escrow', done: false, time: 'Chờ nghiệm thu' }
    ]
  };

  orders.unshift(newOrder);
  db.saveCollection('orders', orders);

  // Deduct balance
  customer.balance -= escrowDeposit;
  db.saveCollection('users', users);

  // Add Wallet Transaction for Escrow
  const transactions = db.getCollection('walletTransactions') || [];
  transactions.unshift({
    id: `TXN_${Date.now()}_${Math.floor(Math.random()*1000)}`,
    userId: req.authUser.id,
    type: 'escrow',
    amount: -escrowDeposit,
    status: 'completed',
    createdAt: dateStr,
    description: `Ký quỹ Escrow cho đơn hàng ${newId}`
  });
  db.saveCollection('walletTransactions', transactions);

  // Notify Provider
  notifyProvider(
    providerId,
    'Đơn hàng mới',
    `Bạn có một yêu cầu dịch vụ mới từ ${req.authUser.name} với giá trị ${newOrder.priceFormatted}.`,
    'info'
  );

  res.status(201).json({
    success: true,
    message: 'Tạo đơn đặt lịch & Ký quỹ Escrow thành công! Tiền được bảo vệ an toàn 100% tại sàn.',
    order: newOrder
  });
});

// Provider accepts the order
router.put('/:id/accept', requireRole('Provider'), (req, res) => {
  try {
    const order = processAcceptOrder(req.params.id, req.authUser.id);
    res.json({ success: true, message: 'Đã tiếp nhận đơn hàng!', order });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, message: err.message });
  }
});

// Provider delivers the order
router.put('/:id/deliver', requireRole('Provider'), (req, res) => {
  try {
    const order = processDeliverOrder(req.params.id, req.authUser.id);
    res.json({ success: true, message: 'Đã bàn giao đơn hàng!', order });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, message: err.message });
  }
});

// Provider updates progress
router.put('/:id/progress', requireRole('Provider'), (req, res) => {
  try {
    const order = processProgressOrder(req.params.id, req.authUser.id, req.body.note || '');
    res.json({ success: true, message: 'Đã cập nhật tiến độ!', order });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, message: err.message });
  }
});

// For Admin to force status change (legacy support if needed)
router.put('/:id/status', requireRole('Admin'), (req, res) => {
  const { status } = req.body;
  const orders = db.getCollection('orders');
  const order = orders.find(o => o.id === req.params.id);

  if (!order) {
    return res.status(404).json({ success: false, message: 'Đơn hàng không tồn tại!' });
  }

  if (status) {
    order.orderStatus = status;
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
  try {
    const order = processReleaseEscrow(req.params.id, { customerId: req.authUser.id });
    res.json({
      success: true,
      message: `Đã nghiệm thu thành công! Số tiền ${order.priceFormatted || order.price} đã được giải ngân an toàn vào ví Provider.`,
      order
    });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, message: err.message });
  }
});

// Cancel / Dispute order
router.put('/:id/cancel', requireSignedIn, (req, res) => {
  try {
    const order = processCancelOrder(req.params.id, req.authUser.id, req.authUser.role, req.body.reason);
    res.json({
      success: true,
      message: order.orderStatus === 'disputed'
        ? 'Đơn hàng đã chuyển sang tranh chấp. Tiền ký quỹ được tạm khóa chờ Admin xử lý.'
        : order.paymentStatus === 'cancelled'
          ? 'Đơn hàng chờ thanh toán đã được hủy. Không có khoản tiền nào bị trừ.'
          : 'Đơn hàng đã được hủy. Tiền ký quỹ đã hoàn vào ví khách hàng.',
      order
    });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, message: err.message });
  }
});

router.put('/:id/undo-cancel', requireCustomer, (req, res) => {
  try {
    const order = processUndoCancelOrder(req.params.id, req.authUser.id);
    res.json({ success: true, message: 'Đã hoàn tác hủy đơn và khôi phục đơn hàng.', order });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, message: err.message });
  }
});

module.exports = router;
