const express = require('express');
const router = express.Router();
const db = require('../data/db');
const { requireCustomer } = require('./customerAuth');
const vnpay = require('../services/vnpayService');
const { buildCartSpecs, createOrders, startGatewayCheckout, expireUnpaidOrders } = require('../services/checkoutService');

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
//  - "Số dư tài khoản": trừ ví, ký quỹ ngay.
//  - Ví VNPay / VietQR / Thẻ quốc tế: tạo đơn CHỜ THANH TOÁN rồi trả về paymentUrl để chuyển khách sang VNPay.
router.post('/checkout', requireCustomer, (req, res) => {
  try {
    expireUnpaidOrders();
    const { customerPhone, notes, paymentMethod, schedulesByProvider, bankCode } = req.body;
    const bookingList = getBookingList(req.authUser.id);

    if (bookingList.items.length === 0) {
      return res.status(400).json({ success: false, message: 'Danh sách đặt lịch đang trống.' });
    }

    const walletPayment = vnpay.isWalletMethod(paymentMethod);
    if (!walletPayment && !vnpay.isGatewayMethod(paymentMethod)) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn một phương thức thanh toán hợp lệ.' });
    }

    const customer = (db.getCollection('users') || []).find(u => u.id === req.authUser.id);
    if (!customer) {
      return res.status(401).json({ success: false, message: 'Không tìm thấy thông tin khách hàng.' });
    }

    // Giá, lịch và khung giờ đều được kiểm tra lại ở server
    const { specs, total } = buildCartSpecs(bookingList, schedulesByProvider);

    if (walletPayment) {
      const customerBalance = Number(customer.balance);
      if (!Number.isFinite(customerBalance) || customerBalance < 0 || customerBalance < total) {
        return res.status(400).json({
          success: false,
          message: `Số dư không đủ. Bạn cần ${total.toLocaleString('vi-VN')}đ, nhưng số dư hiện tại là ${(Number.isFinite(customerBalance) ? customerBalance : 0).toLocaleString('vi-VN')}đ.`
        });
      }
      const orders = createOrders(customer, specs, { mode: 'wallet', paymentMethod, customerPhone, notes });
      bookingList.items = [];
      updateBookingList(bookingList);
      return res.json({ success: true, message: 'Thanh toán & Ký quỹ Escrow thành công!', orders });
    }

    // Thanh toán qua cổng VNPay: đơn ở trạng thái chờ thanh toán, chỉ vào ký quỹ khi VNPay xác nhận
    const { orders, txn, paymentUrl } = startGatewayCheckout({
      customer,
      specs,
      paymentMethod,
      customerPhone,
      notes,
      bankCode,
      ipAddr: req.headers['x-forwarded-for'] || req.socket.remoteAddress
    });
    bookingList.items = [];
    updateBookingList(bookingList);
    res.json({
      success: true,
      requiresPayment: true,
      message: 'Đã tạo đơn chờ thanh toán. Đang chuyển tới cổng VNPay...',
      paymentUrl,
      txnRef: txn.id,
      orders
    });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, message: err.message });
  }
});

module.exports = router;
