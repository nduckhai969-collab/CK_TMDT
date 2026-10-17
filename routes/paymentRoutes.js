const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const os = require('os');
const db = require('../data/db');
const { requireSignedIn, requireCustomer } = require('./customerAuth');
const vnpay = require('../services/vnpayService');
const checkout = require('../services/checkoutService');
const { createNotification } = require('../services/notificationService');
const { formatDateTime } = require('../utils/dates');
const { allowedFrontendOrigin } = require('../utils/webOrigin');

// ---------------------------------------------------------------------------
// Cấu hình VNPay nằm trong .env (xem .env.example):
// ---------------------------------------------------------------------------
if (vnpay.isUsingDemoCredentials()) {
  console.warn('[VNPay] Chưa cấu hình VNPAY_TMN_CODE / VNPAY_HASH_SECRET trong .env: đang dùng khóa demo.');
}

const MIN_DEPOSIT = checkout.MIN_PAYMENT || 10000;
const MAX_DEPOSIT = checkout.MAX_PAYMENT || 50000000;

// Thuật toán chuẩn hóa và ký chữ ký số HMAC-SHA512
function buildVNPayQueryAndHash(params, secretKey) {
  const sortedKeys = Object.keys(params).sort();
  const signDataParts = [];
  const queryParts = [];

  for (const key of sortedKeys) {
    const val = params[key];
    if (val !== '' && val !== null && val !== undefined) {
      const encodedKey = encodeURIComponent(key);
      const encodedVal = encodeURIComponent(String(val)).replace(/%20/g, '+');
      signDataParts.push(`${encodedKey}=${encodedVal}`);
      queryParts.push(`${encodedKey}=${encodedVal}`);
    }
  }

  const signData = signDataParts.join('&');
  const hmac = crypto.createHmac('sha512', secretKey);
  const secureHash = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

  return queryParts.join('&') + `&vnp_SecureHash=${secureHash}`;
}

// 1. TẠO URL THANH TOÁN VNPAY ONLINE
router.post('/vnpay/create_payment_url', (req, res) => {
  try {
    const tmnCode = process.env.VNPAY_TMN_CODE || 'CGXZLS0Z';
    const secretKey = process.env.VNPAY_HASH_SECRET || 'XNBCJFAKAZQSGGTARZGNOXBLHGKTTYRR';
    const vnpUrl = process.env.VNPAY_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
    const returnUrl = process.env.VNPAY_RETURN_URL || 'http://localhost:3000/api/payments/vnpay/return';

    const amount = Number(req.body.amount);
    if (!amount || amount < 10000) {
      return res.status(400).json({ success: false, message: 'Số tiền nạp tối thiểu là 10.000đ.' });
    }

    const date = new Date();
    const createDate = date.getFullYear().toString() +
      String(date.getMonth() + 1).padStart(2, '0') +
      String(date.getDate()).padStart(2, '0') +
      String(date.getHours()).padStart(2, '0') +
      String(date.getMinutes()).padStart(2, '0') +
      String(date.getSeconds()).padStart(2, '0');

    const txnId = date.getTime().toString();
    const cleanOrderInfo = 'Nap tien vi SkillRental ' + txnId;

    const transactions = db.getCollection('walletTransactions') || [];
    transactions.push({
      id: txnId,
      userId: req.body.userId || 'USR003',
      amount: amount,
      type: 'deposit',
      gateway: 'VNPay',
      status: 'pending',
      description: cleanOrderInfo,
      createdAt: new Date().toISOString()
    });
    db.saveCollection('walletTransactions', transactions);

    let vnp_Params = {
      'vnp_Version': '2.1.0',
      'vnp_Command': 'pay',
      'vnp_TmnCode': tmnCode,
      'vnp_Locale': 'vn',
      'vnp_CurrCode': 'VND',
      'vnp_TxnRef': txnId,
      'vnp_OrderInfo': cleanOrderInfo,
      'vnp_OrderType': 'other',
      'vnp_Amount': String(amount * 100),
      'vnp_ReturnUrl': returnUrl,
      'vnp_IpAddr': '127.0.0.1',
      'vnp_CreateDate': createDate
    };

    if (req.body.bankCode && req.body.bankCode !== 'VNPAYQR') {
      vnp_Params['vnp_BankCode'] = req.body.bankCode;
    }

    const queryString = buildVNPayQueryAndHash(vnp_Params, secretKey);
    const finalUrl = vnpUrl + '?' + queryString;

    return res.json({ success: true, url: finalUrl, paymentUrl: finalUrl });
  } catch (err) {
    console.error('Lỗi tạo URL VNPay:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/vnpay/create', (req, res, next) => {
  if (req.body && !req.headers.authorization && !req.cookies) {
    req.url = '/vnpay/create_payment_url';
    return router.handle(req, res, next);
  }
  requireSignedIn(req, res, () => {
    const amount = Number(req.body.amount);
    if (!Number.isInteger(amount) || amount < MIN_DEPOSIT || amount > MAX_DEPOSIT) {
      return res.status(400).json({
        success: false,
        message: `Số tiền nạp phải là số nguyên từ ${MIN_DEPOSIT.toLocaleString('vi-VN')}đ đến ${MAX_DEPOSIT.toLocaleString('vi-VN')}đ.`
      });
    }

    const { txn, paymentUrl } = checkout.createGatewayTransaction({
      userId: req.authUser.id,
      type: 'deposit',
      amount,
      description: 'Nạp tiền ví qua VNPay',
      bankCode: req.body.bankCode,
      returnOrigin: allowedFrontendOrigin(req.headers.origin),
      ipAddr: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
      orderInfo: `Nap tien vi SkillRental ${req.authUser.id}`,
      orderType: 'other'
    });

    res.json({ success: true, paymentUrl, url: paymentUrl, txnRef: txn.id });
  });
});

// Thanh toán (lại) một đơn đang chờ thanh toán
router.post('/vnpay/orders/:orderId', requireCustomer, (req, res) => {
  try {
    const { order, txn, paymentUrl } = checkout.startGatewayRetry({
      orderId: req.params.orderId,
      customerId: req.authUser.id,
      ipAddr: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
      returnOrigin: allowedFrontendOrigin(req.headers.origin),
      bankCode: req.body.bankCode
    });
    res.json({ success: true, paymentUrl, txnRef: txn.id, order });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, message: err.message });
  }
});

// 2. XỬ LÝ KẾT QUẢ KHI THANH TOÁN XONG TRÊN VNPAY QUAY VỀ
function processGatewayResult(query) {
  const { valid, params } = vnpay.verifyQuery(query);
  if (!valid) return { code: '97', message: 'Invalid signature' };

  const transactions = db.getCollection('walletTransactions') || [];
  const txn = transactions.find((t) => t.id === params.vnp_TxnRef && (t.type === 'deposit' || t.type === 'order_payment'));
  if (!txn) return { code: '01', message: 'Order not found' };

  if (Number(params.vnp_Amount) !== Math.round(txn.amount) * 100) {
    return { code: '04', message: 'Invalid amount', txn };
  }

  if (txn.status !== 'pending' && txn.status !== 'expired') {
    return { code: '02', message: 'Order already confirmed', txn, alreadyProcessed: true };
  }

  const responseCode = params.vnp_ResponseCode;
  const transactionStatus = params.vnp_TransactionStatus;
  const success = responseCode === '00' && (transactionStatus === undefined || transactionStatus === '00');
  txn.responseCode = responseCode;
  txn.gatewayTxnNo = params.vnp_TransactionNo || '';
  txn.bankTranNo = params.vnp_BankTranNo || '';

  if (!success) {
    txn.status = 'failed';
    db.saveCollection('walletTransactions', transactions);
    return { code: '00', message: 'Confirm Success', txn, success: false };
  }

  txn.status = 'success';
  txn.paidAt = new Date().toISOString();
  txn.paidAtFormatted = formatDateTime(new Date());

  if (txn.type === 'deposit') {
    const users = db.getCollection('users');
    const user = users.find((u) => u.id === txn.userId);
    if (user) {
      user.balance = (Number(user.balance) || 0) + txn.amount;
      db.saveCollection('users', users);
    }
    db.saveCollection('walletTransactions', transactions);
    createNotification(txn.userId, 'Nạp tiền thành công',
      `Ví của bạn vừa được cộng ${txn.amount.toLocaleString('vi-VN')}đ qua VNPay.`, 'success', '/customer_wallet.html');
  } else {
    db.saveCollection('walletTransactions', transactions);
    checkout.markOrdersPaid(txn);
    const latest = db.getCollection('walletTransactions') || [];
    const stored = latest.find((t) => t.id === txn.id);
    if (stored && txn.creditedToWallet) { stored.creditedToWallet = txn.creditedToWallet; db.saveCollection('walletTransactions', latest); }
  }
  return { code: '00', message: 'Confirm Success', txn, success: true };
}

router.get('/vnpay/return', (req, res) => {
  try {
    let vnp_Params = { ...req.query };
    const responseCode = vnp_Params['vnp_ResponseCode'];
    const amount = Number(vnp_Params['vnp_Amount']) / 100;
    const txnRef = vnp_Params['vnp_TxnRef'];

    if (responseCode === '00') {
      const users = db.getCollection('users') || [];
      const user = users.find(u => u.id === 'USR003') || users.find(u => u.role === 'Customer') || users[0];
      if (user) {
        user.balance = (Number(user.balance) || 0) + (amount || 0);
        db.saveCollection('users', users);
      }

      const txns = db.getCollection('walletTransactions') || [];
      const t = txns.find(x => String(x.id) === String(txnRef));
      if (t) {
        t.status = 'success';
        t.paidAt = new Date().toISOString();
      } else {
        txns.unshift({
          id: txnRef || ('WT_' + Date.now()),
          userId: user ? user.id : 'USR003',
          userName: user ? user.name : 'Lê Hoàng Long',
          amount: amount || 50000,
          type: 'deposit',
          gateway: 'VNPay',
          status: 'success',
          description: 'Nạp tiền qua VNPay thành công',
          createdAt: new Date().toISOString()
        });
      }
      db.saveCollection('walletTransactions', txns);
      return res.redirect(`/customer_wallet.html?payment=success&amount=${amount}&code=00`);
    } else {
      return res.redirect(`/customer_wallet.html?payment=failed&code=${responseCode || '97'}`);
    }
  } catch (err) {
    console.error('Lỗi VNPay return:', err);
    return res.redirect('/customer_wallet.html?payment=error');
  }
});

router.get('/vnpay/ipn', (req, res) => {
  const result = processGatewayResult(req.query);
  res.status(200).json({ RspCode: result.code, Message: result.message });
});

router.get('/status/:txnRef', requireSignedIn, (req, res) => {
  const txn = (db.getCollection('walletTransactions') || []).find((t) => t.id === req.params.txnRef);
  if (!txn || txn.userId !== req.authUser.id) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy giao dịch.' });
  }
  res.json({
    success: true,
    transaction: checkout.sanitizeTransaction(txn),
    message: txn.status === 'failed' ? vnpay.describeResponseCode(txn.responseCode) : undefined
  });
});

router.get('/transactions', requireSignedIn, (req, res) => {
  checkout.expireUnpaidOrders();
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const { total, transactions } = checkout.listTransactions(req.authUser.id, {
    type: req.query.type,
    status: req.query.status,
    limit,
    offset
  });
  res.json({ success: true, total, transactions, balance: Number(req.authUser.balance) || 0 });
});

// ============================================================
// 3. API LẤY SỐ DƯ TỨC THÌ
// ============================================================
router.get('/balance', (req, res) => {
  const users = db.getCollection('users') || [];
  const customer = users.find(u => u.id === 'USR003') || users.find(u => u.role === 'Customer') || users[0];
  res.json({ 
    success: true, 
    balance: customer ? Number(customer.balance) : 15000000,
    userName: customer ? customer.name : 'Lê Hoàng Long'
  });
});

// ============================================================
// API XÁC NHẬN THANH TOÁN QR VÀ TỰ ĐỘNG CỘNG TIỀN VÍ
// ============================================================
router.all('/qr-confirm', (req, res) => {
  try {
    const amount = Number(req.body.amount || req.query.amount) || 0;
    const targetName = (req.body.userName || req.body.name || req.body.senderName || req.query.userName || req.query.name || '').trim() || 'Lê Hoàng Long';
    const txnId = req.body.txn || req.query.txn || ('WT_' + Date.now());

    const users = db.getCollection('users') || [];
    
    let user = users.find(u => u.name && u.name.toLowerCase().trim() === targetName.toLowerCase());
    if (!user) {
      user = users.find(u => u.id === 'USR003') || users.find(u => u.role === 'Customer') || users[0];
    }

    if (user) {
      user.balance = (Number(user.balance) || 0) + amount;
      db.saveCollection('users', users);
    }

    const txns = db.getCollection('walletTransactions') || [];
    const existingIndex = txns.findIndex(t => String(t.id) === String(txnId));

    const newTxnData = {
      id: txnId,
      userId: user ? user.id : 'USR003',
      userName: targetName,
      amount: amount,
      type: 'deposit',
      gateway: 'VNPAY-QR',
      status: 'success',
      description: `Nạp tiền qua VNPAY-QR (${targetName})`,
      paidAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      txns[existingIndex] = { ...txns[existingIndex], ...newTxnData };
    } else {
      txns.unshift(newTxnData);
    }
    db.saveCollection('walletTransactions', txns);

    console.log(`[VNPAY-QR] Nạp thành công +${amount.toLocaleString('vi-VN')}đ cho user ${targetName}. Số dư mới: ${(user ? user.balance : amount).toLocaleString('vi-VN')}đ`);

    return res.json({ 
      success: true, 
      userName: targetName, 
      newBalance: user ? user.balance : amount 
    });
  } catch (err) {
    console.error('Lỗi QR confirm:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// API kiểm tra xem điện thoại đã bấm xác nhận chưa
router.get('/check-status/:txnId', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  const txns = db.getCollection('walletTransactions') || [];
  const txn = txns.find(t => String(t.id) === String(req.params.txnId));
  let uName = txn ? (txn.userName || '') : '';
  if (!uName && txn && txn.description && txn.description.includes('(')) {
    const m = txn.description.match(/\((.*?)\)/);
    if (m && m[1] && isNaN(Number(m[1].replace(/[\.đ]/g, '')))) {
      uName = m[1].trim();
    }
  }
  res.json({ 
    success: true, 
    isPaid: Boolean(txn && txn.status === 'success'),
    userName: uName
  });
});

// API tự động tìm địa chỉ IP máy tính trong mạng Wi-Fi
router.get('/server-info', (req, res) => {
  let localIp = 'localhost';
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        localIp = iface.address;
        break;
      }
    }
  }
  res.json({ success: true, localIp: localIp, port: process.env.PORT || 3000 });
});

// API lấy lịch sử giao dịch ví
router.get('/history', (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    const txns = db.getCollection('walletTransactions') || [];
    const data = txns.slice(0, 30).map(t => {
      let uName = t.userName || '';
      if (!uName && t.description && t.description.includes('(')) {
        const m = t.description.match(/\((.*?)\)/);
        if (m && m[1] && isNaN(Number(m[1].replace(/[\.đ]/g, '')))) {
          uName = m[1].trim();
        }
      }
      return {
        ...t,
        userName: uName || 'Lê Hoàng Long'
      };
    });

    return res.json({ success: true, data: data });
  } catch (e) {
    return res.json({ success: true, data: [] });
  }
});

module.exports = router;
module.exports.processGatewayResult = processGatewayResult;
