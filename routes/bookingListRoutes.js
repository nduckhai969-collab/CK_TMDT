const express = require('express');
const router = express.Router();
const db = require('../data/db');
const { requireCustomer } = require('./customerAuth');

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
      providerName: s.providerName
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

  const bookingList = getBookingList(req.authUser.id);
  const qty = Number(hours) || 1;

  const existingItem = bookingList.items.find(i => i.serviceId === serviceId);
  if (existingItem) {
    existingItem.hours += qty;
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
  if (qty <= 0) {
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
  const { customerPhone, notes, paymentMethod, scheduledDate, scheduledTime } = req.body;
  const bookingList = getBookingList(req.authUser.id);

  if (bookingList.items.length === 0) {
    return res.status(400).json({ success: false, message: 'Danh sách đặt lịch đang trống.' });
  }

  const services = db.getCollection('services') || [];
  const providers = db.getCollection('providers') || [];
  const users = db.getCollection('users') || [];
  const orders = db.getCollection('orders') || [];

  const customer = users.find(u => u.id === req.authUser.id);
  if (!customer) {
    return res.status(401).json({ success: false, message: 'Không tìm thấy thông tin khách hàng.' });
  }

  // Bước 1: Tính toán tổng tiền và nhóm theo Provider
  let totalEscrowNeeded = 0;
  const providerGroups = {};

  for (const item of bookingList.items) {
    const srv = services.find(s => s.id === item.serviceId);
    if (!srv) continue;

    if (!providerGroups[srv.providerId]) {
      providerGroups[srv.providerId] = {
        providerId: srv.providerId,
        providerName: srv.providerName,
        items: [],
        totalPrice: 0
      };
    }
    
    const itemPrice = Number(srv.price) * (Number(item.hours) || 1);
    providerGroups[srv.providerId].items.push({
      serviceId: srv.id,
      serviceTitle: srv.title,
      hours: item.hours,
      itemPrice
    });
    providerGroups[srv.providerId].totalPrice += itemPrice;
  }

  for (const pid in providerGroups) {
    const pGroup = providerGroups[pid];
    const platformFee = Math.round(pGroup.totalPrice * 0.05);
    const escrowDeposit = pGroup.totalPrice + platformFee;
    totalEscrowNeeded += escrowDeposit;
    
    pGroup.platformFee = platformFee;
    pGroup.escrowDeposit = escrowDeposit;
  }

  if (customer.balance < totalEscrowNeeded) {
    return res.status(400).json({ 
      success: false, 
      message: `Số dư không đủ. Bạn cần ${totalEscrowNeeded.toLocaleString('vi-VN')}đ, nhưng số dư hiện tại là ${(customer.balance || 0).toLocaleString('vi-VN')}đ.`
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
    const newId = `DH00${randomSuffix}`;

    const titles = pGroup.items.map(i => `${i.serviceTitle} (${i.hours}h)`).join(', ');

    const newOrder = {
      id: newId,
      customerId: req.authUser.id,
      customerName: req.authUser.name,
      customerPhone: customerPhone || customer.phone || '',
      providerId: pGroup.providerId,
      providerName: pGroup.providerName,
      serviceId: pGroup.items[0].serviceId, 
      serviceTitle: titles,
      price: pGroup.totalPrice,
      priceFormatted: pGroup.totalPrice.toLocaleString('vi-VN') + 'đ',
      platformFee: pGroup.platformFee,
      escrowDeposit: pGroup.escrowDeposit,
      escrowStatus: 'escrow_held', 
      orderStatus: 'pending',
      paymentMethod: paymentMethod || 'Ví điện tử VNPay (Escrow 100%)',
      date: dateStr,
      deadline: '7 ngày sau đặt cọc',
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
