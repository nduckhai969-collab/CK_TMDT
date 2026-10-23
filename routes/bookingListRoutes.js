const express = require('express');
const router = express.Router();
const db = require('../data/db');
const { requireCustomer } = require('./customerAuth');

const vnpay = require('../services/vnpayService');
const { buildCartSpecs, createOrders, startGatewayCheckout, expireUnpaidOrders } = require('../services/checkoutService');
const { slotsForDate } = require('./providerAvailability');
const { notifyProvider } = require('../services/notificationService');
const { allowedFrontendOrigin } = require('../utils/webOrigin');

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
  const { serviceId, providerId, serviceTitle, price, hours } = req.body || {};
  
  let effectiveServiceId = serviceId;
  const services = db.getCollection('services') || [];
  let s = null;

  // Trường hợp Customer đặt trực tiếp Provider chưa có gói niêm yết (serviceId === 'default' hoặc không có serviceId)
  if (!serviceId || serviceId === 'default') {
    if (!providerId) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin Provider.' });
    }
    const providers = db.getCollection('providers') || [];
    const prv = providers.find(p => p.id === providerId || p.userId === providerId || (p.email && p.email.toLowerCase() === String(providerId).toLowerCase()));
    if (!prv) {
      return res.status(404).json({ success: false, message: 'Provider không tồn tại.' });
    }

    const baseId = `SVC_BASE_${prv.id}`;
    s = services.find(x => x.id === baseId || (x.providerId === prv.id && x.isHourlyBase));
    if (!s) {
      const title = serviceTitle || (prv.specialty ? `Thuê theo giờ - ${prv.specialty}` : `Dịch vụ theo giờ (${prv.name})`);
      const unitPrice = Number(price) > 0 ? Number(price) : (Number(prv.hourlyRate) > 0 ? Number(prv.hourlyRate) : 200000);
      s = {
        id: baseId,
        providerId: prv.id,
        providerName: prv.name,
        providerAvatar: prv.avatar || '',
        title: title,
        name: title,
        price: unitPrice,
        category: prv.category || 'Khác',
        duration: '1 giờ',
        status: 'active',
        isHourlyBase: true,
        description: `Dịch vụ chuyên môn trực tiếp theo giờ của ${prv.name}.`,
        createdAt: new Date().toISOString()
      };
      services.push(s);
      db.saveCollection('services', services);
    }
    effectiveServiceId = s.id;

    // Gửi thông báo cho Provider
    const cName = req.authUser?.name || 'Khách hàng';
    notifyProvider(
      prv.id,
      'Khách hàng mong muốn đặt lịch trực tiếp',
      `Khách hàng ${cName} vừa thêm dịch vụ của bạn vào giỏ hàng và mong muốn đặt lịch trực tiếp. Bạn chưa có gói dịch vụ niêm yết, hãy cập nhật bảng giá và thiết lập gói niêm yết trong Hồ sơ để tiến hành đơn hàng!`,
      'info',
      'profile.html'
    );
  } else {
    s = services.find(srv => srv.id === effectiveServiceId);
    if (!s) {
      return res.status(404).json({ success: false, message: 'Dịch vụ không tồn tại.' });
    }
  }

  if (s.status && s.status !== 'active') {
    return res.status(400).json({ success: false, message: 'Dịch vụ hiện không nhận đặt hàng.' });
  }

  const bookingList = getBookingList(req.authUser.id);
  const qty = hours === undefined ? 1 : Number(hours);
  if (!Number.isInteger(qty) || qty < 1 || qty > 99) {
    return res.status(400).json({ success: false, message: 'Số lượng phải là số nguyên từ 1 đến 99.' });
  }

  const existingItem = bookingList.items.find(i => i.serviceId === effectiveServiceId);
  if (existingItem) {
    const nextQty = Number(existingItem.hours || 0) + qty;
    if (nextQty > 99) {
      return res.status(400).json({ success: false, message: 'Tổng số lượng của một dịch vụ không được vượt quá 99.' });
    }
    existingItem.hours = nextQty;
  } else {
    bookingList.items.push({
      serviceId: effectiveServiceId,
      hours: qty
    });
  }

  updateBookingList(bookingList);
  res.json({
    success: true,
    message: 'Đã thêm dịch vụ vào danh sách đặt lịch!',
    serviceId: effectiveServiceId,
    bookingList
  });
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
    const { customerPhone, customerAddress, notes, paymentMethod, schedulesByProvider, bankCode } = req.body;
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
      // Đối soát số dư thực tế từ lịch sử ví
      const txns = db.getCollection('walletTransactions') || [];
      const userTxns = txns.filter(t => 
        (t.userId === customer.id || (customer.uid && t.userId === customer.uid)) &&
        (t.status === 'success' || t.status === 'completed')
      );
      const hasDeposit = userTxns.some(t => t.type === 'deposit');
      let realBalance = 0;
      if (hasDeposit) {
        const totalDeposits = userTxns
          .filter(t => t.type === 'deposit' || t.type === 'refund')
          .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
        const totalDeductions = userTxns
          .filter(t => t.type === 'escrow' || t.type === 'order_payment' || t.type === 'withdraw')
          .reduce((sum, t) => sum + Math.abs(Number(t.amount) || 0), 0);
        realBalance = Math.max(0, totalDeposits - totalDeductions);
      } else {
        realBalance = Math.max(0, Number(customer.balance) || 0);
      }

      if (realBalance < total) {
        return res.status(400).json({
          success: false,
          message: `Số dư ví không đủ. Bạn cần ${total.toLocaleString('vi-VN')}đ, nhưng số dư khả dụng hiện tại là ${realBalance.toLocaleString('vi-VN')}đ. Vui lòng nạp thêm tiền hoặc chọn VietQR.`
        });
      }
      customer.balance = realBalance;

      const orders = createOrders(customer, specs, { mode: 'wallet', paymentMethod, customerPhone, customerAddress, notes });
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
      customerAddress,
      notes,
      bankCode,
      returnOrigin: allowedFrontendOrigin(req.headers.origin),
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
