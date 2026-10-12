const express = require('express');
const router = express.Router();
const db = require('../data/db');
const { requireCustomer } = require('./customerAuth');
const { slotsForDate } = require('./providerAvailability');

function getBookingList(customerId) {
  const bookingLists = db.getCollection('bookingLists') || [];
  let bookingList = bookingLists.find(c => c.customerId === customerId);
  if (!bookingList) {
    bookingList = { customerId, items: [] };
    bookingLists.push(bookingList);
    db.saveCollection('bookingLists', bookingLists);
  }
  return bookingList;
}

function updateBookingList(bookingList) {
  const bookingLists = db.getCollection('bookingLists') || [];
  const index = bookingLists.findIndex(c => c.customerId === bookingList.customerId);
  if (index !== -1) {
    bookingLists[index] = bookingList;
  } else {
    bookingLists.push(bookingList);
  }
  db.saveCollection('bookingLists', bookingLists);
}

// Lấy danh sách đặt lịch (trước là giỏ hàng)
router.get('/', requireCustomer, (req, res) => {
  const bookingList = getBookingList(req.authUser.id);
  
  // Nạp thêm chi tiết service
  const services = db.getCollection('services') || [];
  const itemsWithDetails = bookingList.items.map(item => {
    const s = services.find(srv => srv.id === item.serviceId);
    if (!s) return item;
    
    // Luôn lấy giá mới nhất từ DB
    return {
      ...item,
      serviceTitle: s.title,
      price: Number(s.price),
      providerId: s.providerId,
      providerName: s.providerName,
      providerAvatar: s.providerAvatar || '',
      thumbnail: s.thumbnail || '',
      status: s.status || 'active'
    };
  });
  
  res.json({
    success: true,
    bookingList: {
      customerId: bookingList.customerId,
      items: itemsWithDetails
    }
  });
});

// Thêm vào danh sách đặt lịch
router.post('/items', requireCustomer, (req, res) => {
  const { serviceId, hours } = req.body;
  
  if (!serviceId) {
    return res.status(400).json({ success: false, message: 'Thiếu thông tin dịch vụ.' });
  }
  
  const services = db.getCollection('services') || [];
  const s = services.find(srv => srv.id === serviceId);
  if (!s) {
    return res.status(404).json({ success: false, message: 'Dịch vụ không tồn tại.' });
  }
  if (s.status && s.status !== 'active') {
    return res.status(400).json({ success: false, message: 'Dịch vụ hiện không nhận đặt hàng.' });
  }

  const bookingList = getBookingList(req.authUser.id);
  const qty = hours === undefined ? 1 : Number(hours);
  if (!Number.isInteger(qty) || qty < 1 || qty > 99) {
    return res.status(400).json({ success: false, message: 'Số lượng phải là số nguyên từ 1 đến 99.' });
  }

  const existingItem = bookingList.items.find(i => i.serviceId === serviceId);
  if (existingItem) {
    const nextQty = Number(existingItem.hours || 0) + qty;
    if (nextQty > 99) {
      return res.status(400).json({ success: false, message: 'Tổng số lượng của một dịch vụ không được vượt quá 99.' });
    }
    existingItem.hours = nextQty;
  } else {
    bookingList.items.push({
      serviceId,
      hours: qty
    });
  }

  updateBookingList(bookingList);
  res.json({ success: true, message: 'Đã thêm dịch vụ vào danh sách đặt lịch!', bookingList });
});

// Cập nhật số giờ
router.put('/items/:serviceId', requireCustomer, (req, res) => {
  const { hours } = req.body;
  const bookingList = getBookingList(req.authUser.id);
  
  const item = bookingList.items.find(i => i.serviceId === req.params.serviceId);
  if (!item) {
    return res.status(404).json({ success: false, message: 'Sản phẩm không có trong danh sách đặt lịch.' });
  }

  const qty = Number(hours);
  if (!Number.isInteger(qty) || qty < 0 || qty > 99) {
    return res.status(400).json({ success: false, message: 'Số lượng phải là số nguyên từ 0 đến 99.' });
  }
  if (qty === 0) {
    bookingList.items = bookingList.items.filter(i => i.serviceId !== req.params.serviceId);
  } else {
    item.hours = qty;
  }

  updateBookingList(bookingList);
  res.json({ success: true, message: 'Đã cập nhật danh sách đặt lịch!', bookingList });
});

// Xóa khỏi danh sách đặt lịch
router.delete('/items/:serviceId', requireCustomer, (req, res) => {
  const bookingList = getBookingList(req.authUser.id);
  bookingList.items = bookingList.items.filter(i => i.serviceId !== req.params.serviceId);
  
  updateBookingList(bookingList);
  res.json({ success: true, message: 'Đã xóa dịch vụ khỏi danh sách đặt lịch.', bookingList });
});

// Thanh toán toàn bộ danh sách đặt lịch
router.post('/checkout', requireCustomer, (req, res) => {
  const { customerPhone, notes, paymentMethod, schedulesByProvider } = req.body;
  const bookingList = getBookingList(req.authUser.id);

  if (bookingList.items.length === 0) {
    return res.status(400).json({ success: false, message: 'Danh sách đặt lịch đang trống.' });
  }

  const services = db.getCollection('services') || [];
  const users = db.getCollection('users') || [];
  const orders = db.getCollection('orders') || [];
  const walletPayment = paymentMethod === 'Số dư tài khoản (Escrow)';
  const supportedPaymentMethods = ['Số dư tài khoản (Escrow)', 'Chuyển khoản VietQR (Escrow)', 'Ví VNPay / MoMo (Escrow)', 'Thẻ Tín Dụng Quốc Tế (Escrow)'];
  if (!supportedPaymentMethods.includes(paymentMethod)) {
    return res.status(400).json({ success: false, message: 'Vui lòng chọn một phương thức thanh toán hợp lệ.' });
  }
  if (!walletPayment) {
    return res.status(501).json({
      success: false,
      code: 'ORDER_PAYMENT_NOT_CONFIGURED',
      message: paymentMethod === 'Chuyển khoản VietQR (Escrow)'
        ? 'VietQR chưa được cấu hình xác nhận thanh toán. Chưa tạo đơn hàng.'
        : paymentMethod === 'Thẻ Tín Dụng Quốc Tế (Escrow)'
          ? 'Thanh toán thẻ chưa được kết nối cổng xử lý. Chưa tạo đơn hàng.'
          : 'VNPay/MoMo hiện chỉ hỗ trợ nạp ví, chưa thanh toán đơn trực tiếp. Hãy nạp ví rồi checkout bằng số dư. Chưa tạo đơn hàng.'
    });
  }

  const customer = users.find(u => u.id === req.authUser.id);
  if (!customer) {
    return res.status(401).json({ success: false, message: 'Không tìm thấy thông tin khách hàng.' });
  }

  // Bước 1: Tính toán tổng tiền và nhóm theo Provider
  let totalEscrowNeeded = 0;
  const providerGroups = {};

  for (const item of bookingList.items) {
    const srv = services.find(s => s.id === item.serviceId);
    if (!srv || (srv.status && srv.status !== 'active')) {
      return res.status(400).json({ success: false, message: `Dịch vụ ${item.serviceId} không còn khả dụng. Hãy cập nhật giỏ rồi thử lại.` });
    }
    const qty = Number(item.hours);
    if (!Number.isInteger(qty) || qty < 1 || qty > 99 || !Number.isFinite(Number(srv.price)) || Number(srv.price) < 0) {
      return res.status(400).json({ success: false, message: `Thông tin dịch vụ ${item.serviceId} trong giỏ không hợp lệ.` });
    }
    if (!srv.providerId) {
      return res.status(400).json({ success: false, message: `Dịch vụ ${item.serviceId} chưa được gán Provider.` });
    }
    if (!providerGroups[srv.providerId]) {
      providerGroups[srv.providerId] = {
        providerId: srv.providerId,
        providerName: srv.providerName,
        items: [],
        totalPrice: 0
      };
    }
    
    const itemPrice = Number(srv.price) * qty;
    providerGroups[srv.providerId].items.push({
      serviceId: srv.id,
      serviceTitle: srv.title,
      quantity: qty,
      itemPrice
    });
    providerGroups[srv.providerId].totalPrice += itemPrice;
  }

  for (const pid in providerGroups) {
    const pGroup = providerGroups[pid];
    const schedule = schedulesByProvider?.[pid];
    if (!schedule || !/^\d{4}-\d{2}-\d{2}$/.test(schedule.scheduledDate || '') || !schedule.scheduledTime) {
      return res.status(400).json({ success: false, message: `Chọn ngày và giờ hẹn cho Provider ${pGroup.providerName || pid}.` });
    }
    const [year, month, day] = schedule.scheduledDate.split('-').map(Number);
    const appointmentDate = new Date(year, month - 1, day, 12);
    const provider = (db.getCollection('providers') || []).find(item => item.id === pid);
    if (!provider || appointmentDate.getFullYear() !== year || appointmentDate.getMonth() !== month - 1 || appointmentDate.getDate() !== day) {
      return res.status(400).json({ success: false, message: `Ngày hẹn của Provider ${pGroup.providerName || pid} không hợp lệ.` });
    }
    const availableSlots = slotsForDate(provider, appointmentDate, orders);
    if (!availableSlots.includes(schedule.scheduledTime)) {
      return res.status(409).json({ success: false, message: `Khung giờ của Provider ${pGroup.providerName || pid} không còn trống. Hãy chọn lịch khác.` });
    }
    pGroup.scheduledDate = schedule.scheduledDate;
    pGroup.scheduledTime = schedule.scheduledTime;
    const platformFee = Math.round(pGroup.totalPrice * 0.05);
    const escrowDeposit = pGroup.totalPrice + platformFee;
    totalEscrowNeeded += escrowDeposit;
    
    pGroup.platformFee = platformFee;
    pGroup.escrowDeposit = escrowDeposit;
  }

  const customerBalance = Number(customer.balance);
  if (!Number.isFinite(customerBalance) || customerBalance < 0 || customerBalance < totalEscrowNeeded) {
    return res.status(400).json({ 
      success: false, 
      message: `Số dư không đủ. Bạn cần ${totalEscrowNeeded.toLocaleString('vi-VN')}đ, nhưng số dư hiện tại là ${(Number.isFinite(customerBalance) ? customerBalance : 0).toLocaleString('vi-VN')}đ.`
    });
  }

  // Bước 2: Trừ tiền và tạo đơn hàng
  customer.balance -= totalEscrowNeeded;
  db.saveCollection('users', users);

  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  
  const createdOrders = [];

  for (const pid in providerGroups) {
    const pGroup = providerGroups[pid];
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    let newId = `DH00${randomSuffix}`;
    while (orders.some(order => order.id === newId) || createdOrders.some(order => order.id === newId)) {
      newId = `DH00${Math.floor(1000 + Math.random() * 9000)}`;
    }

    const titles = pGroup.items.map(i => `${i.serviceTitle} (×${i.quantity})`).join(', ');

    const newOrder = {
      id: newId,
      customerId: req.authUser.id,
      customerName: req.authUser.name,
      customerPhone: customerPhone || customer.phone || '',
      providerId: pGroup.providerId,
      providerName: pGroup.providerName,
      serviceId: pGroup.items[0].serviceId, 
      serviceTitle: titles,
      items: pGroup.items,
      price: pGroup.totalPrice,
      priceFormatted: pGroup.totalPrice.toLocaleString('vi-VN') + 'đ',
      platformFee: pGroup.platformFee,
      escrowDeposit: pGroup.escrowDeposit,
      escrowStatus: 'escrow_held',
      paymentStatus: 'paid',
      orderStatus: 'pending',
      paymentMethod: paymentMethod || 'Ví điện tử VNPay (Escrow 100%)',
      date: dateStr,
      deadline: '7 ngày sau đặt cọc',
      scheduledDate: pGroup.scheduledDate,
      scheduledTime: pGroup.scheduledTime,
      notes: notes || '',
      milestones: [
        { title: 'Ký quỹ Escrow bảo vệ 100% thành công', done: true, time: dateStr },
        { title: 'Provider tiếp nhận yêu cầu & triển khai công việc', done: false, time: 'Chờ tiếp nhận' },
        { title: 'Bàn giao sản phẩm / hoàn thành dịch vụ', done: false, time: 'Chờ bàn giao' },
        { title: 'Khách hàng nghiệm thu & Giải ngân Escrow', done: false, time: 'Chờ nghiệm thu' }
      ]
    };

    orders.unshift(newOrder);
    createdOrders.push(newOrder);

    const { createNotification } = require('../services/notificationService');
    createNotification(
      pGroup.providerId,
      'Đơn đặt lịch mới',
      `Bạn có lịch đặt mới từ ${req.authUser.name}. Tổng giá trị: ${pGroup.totalPrice.toLocaleString('vi-VN')}đ.`,
      'info'
    );
  }

  db.saveCollection('orders', orders);

  // Xóa danh sách đặt lịch
  bookingList.items = [];
  updateBookingList(bookingList);

  res.json({
    success: true,
    message: 'Thanh toán & Ký quỹ Escrow thành công!',
    orders: createdOrders
  });
});

module.exports = router;
