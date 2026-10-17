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

    const targetUserId = req.body.userId || req.headers['x-user-id'] || (req.authUser ? req.authUser.id : null);
    if (!targetUserId) {
      return res.status(400).json({ success: false, message: 'Vui lòng đăng nhập hoặc cung cấp userId để nạp tiền.' });
    }
    const users = db.getCollection('users') || [];
    const targetUser = users.find(u => u.id === targetUserId || u.uid === targetUserId);

    const transactions = db.getCollection('walletTransactions') || [];
    transactions.push({
      id: txnId,
      userId: targetUserId,
      userName: targetUser ? targetUser.name : 'Khách hàng',
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
      const txns = db.getCollection('walletTransactions') || [];
      const t = txns.find(x => String(x.id) === String(txnRef));

      const users = db.getCollection('users') || [];
      const targetUserId = (t && t.userId) ? t.userId : (req.query.userId || req.headers['x-user-id']);
      let user = null;
      if (targetUserId) {
        user = users.find(u => u.id === targetUserId || u.uid === targetUserId);
      }
      if (!user && !targetUserId) {
        return res.redirect('/customer_wallet.html?payment=error&message=' + encodeURIComponent('Không xác định được tài khoản người nhận tiền.'));
      }
      const assignedUserId = user ? user.id : targetUserId;

      if (t) {
        t.status = 'success';
        t.paidAt = new Date().toISOString();
        if (user && !t.userName) t.userName = user.name;
      } else {
        txns.unshift({
          id: txnRef || ('WT_' + Date.now()),
          userId: assignedUserId,
          userName: user ? user.name : 'Khách hàng',
          amount: amount || 50000,
          type: 'deposit',
          gateway: 'VNPay',
          status: 'success',
          description: 'Nạp tiền qua VNPay thành công',
          paidAt: new Date().toISOString(),
          createdAt: new Date().toISOString()
        });
      }

      // Tính toán số dư chuẩn từ lịch sử giao dịch thực tế của user
      const userTxns = txns.filter(x => 
        (x.userId === assignedUserId) &&
        (x.status === 'success' || x.status === 'completed')
      );
      const totalDeposits = userTxns
        .filter(x => x.type === 'deposit' || x.type === 'refund')
        .reduce((sum, x) => sum + (Number(x.amount) || 0), 0);
      const totalDeductions = userTxns
        .filter(x => x.type === 'escrow' || x.type === 'order_payment' || x.type === 'withdraw')
        .reduce((sum, x) => sum + Math.abs(Number(x.amount) || 0), 0);
      const calculatedBalance = Math.max(0, totalDeposits - totalDeductions);

      if (user) {
        user.balance = calculatedBalance;
        db.saveCollection('users', users);
      }

      const activeTxn = t || txns[0];
      if (activeTxn) {
        activeTxn.balanceAfter = calculatedBalance;
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
// 3. API LẤY SỐ DƯ TỨC THÌ (CHO TỪNG TÀI KHOẢN RIÊNG)
// ============================================================
router.get('/balance', (req, res) => {
  const users = db.getCollection('users') || [];
  const targetUserId = req.headers['x-user-id'] || req.query.userId;
  let customer = null;
  if (targetUserId) {
    customer = users.find(u => u.id === targetUserId || u.uid === targetUserId);
    if (!customer) {
      return res.json({ 
        success: true, 
        userId: targetUserId,
        balance: 0,
        userName: 'Khách hàng'
      });
    }
  } else if (req.authUser) {
    customer = users.find(u => u.id === req.authUser.id || u.uid === req.authUser.uid);
  }

  // Nếu không xác định được tài khoản -> trả về số dư 0đ
  if (!customer) {
    return res.json({ 
      success: true, 
      userId: null,
      balance: 0,
      userName: 'Khách hàng'
    });
  }

  // Kiểm tra lịch sử giao dịch của tài khoản
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
    // Tài khoản chưa có bất kỳ giao dịch nạp nào thành công -> về 0đ
    realBalance = 0;
  }

  if (customer.balance !== realBalance) {
    customer.balance = realBalance;
    db.saveCollection('users', users);
  }

  res.json({ 
    success: true, 
    userId: customer.id,
    balance: realBalance,
    userName: customer.name || 'Khách hàng'
  });
});

// ============================================================
// API XÁC NHẬN THANH TOÁN QR VÀ TỰ ĐỘNG CỘNG TIỀN VÍ CHO ĐÚNG USER
// ============================================================
router.all('/qr-confirm', (req, res) => {
  try {
    const amount = Number(req.body.amount || req.query.amount) || 0;
    const targetName = (req.body.userName || req.body.name || req.body.senderName || req.query.userName || req.query.name || '').trim() || 'Khách hàng';
    const txnId = req.body.txn || req.query.txn || ('WT_' + Date.now());
    const targetUserId = req.body.userId || req.query.userId || req.headers['x-user-id'];

    const users = db.getCollection('users') || [];
    
    let user = null;
    if (targetUserId) {
      user = users.find(u => u.id === targetUserId || u.uid === targetUserId);
    }
    if (!user && targetName && targetName !== 'Khách hàng') {
      user = users.find(u => u.name && u.name.toLowerCase().trim() === targetName.toLowerCase());
    }

    if (!user && !targetUserId) {
      return res.status(400).json({
        success: false,
        message: 'Không tìm thấy thông tin tài khoản cần nạp tiền. Vui lòng đăng nhập trước khi quét mã.'
      });
    }

    const assignedUserId = user ? user.id : targetUserId;
    const finalName = targetName && targetName !== 'Khách hàng' ? targetName : (user ? user.name : 'Khách hàng');

    const txns = db.getCollection('walletTransactions') || [];
    const existingIndex = txns.findIndex(t => String(t.id) === String(txnId));

    const newTxnData = {
      id: txnId,
      userId: assignedUserId,
      userName: finalName,
      amount: amount,
      type: 'deposit',
      gateway: 'VNPAY-QR',
      status: 'success',
      description: `Nạp tiền qua VNPAY-QR (${finalName})`,
      paidAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      txns[existingIndex] = { ...txns[existingIndex], ...newTxnData };
    } else {
      txns.unshift(newTxnData);
    }

    // Tính lại balance chính xác từ toàn bộ giao dịch của riêng user này
    const userTxns = txns.filter(t => 
      (t.userId === assignedUserId) &&
      (t.status === 'success' || t.status === 'completed')
    );
    const totalDeposits = userTxns
      .filter(t => t.type === 'deposit' || t.type === 'refund')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const totalDeductions = userTxns
      .filter(t => t.type === 'escrow' || t.type === 'order_payment' || t.type === 'withdraw')
      .reduce((sum, t) => sum + Math.abs(Number(t.amount) || 0), 0);
    const calculatedBalance = Math.max(0, totalDeposits - totalDeductions);

    if (user) {
      user.balance = calculatedBalance;
      db.saveCollection('users', users);
    }

    const updatedTxn = txns.find(t => String(t.id) === String(txnId));
    if (updatedTxn) {
      updatedTxn.balanceAfter = calculatedBalance;
    }
    db.saveCollection('walletTransactions', txns);

    console.log(`[VNPAY-QR] Nạp thành công +${amount.toLocaleString('vi-VN')}đ cho user ${finalName} (${assignedUserId}). Số dư mới: ${calculatedBalance.toLocaleString('vi-VN')}đ`);

    return res.json({ 
      success: true, 
      userId: assignedUserId,
      userName: finalName, 
      newBalance: calculatedBalance 
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
    userName: uName,
    userId: txn ? txn.userId : null,
    amount: txn ? txn.amount : null,
    balanceAfter: txn ? txn.balanceAfter : null
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

// API lấy lịch sử giao dịch ví (phân tách theo từng user)
router.get('/history', (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    const targetUserId = req.headers['x-user-id'] || req.query.userId || (req.authUser ? req.authUser.id : null);
    const txns = db.getCollection('walletTransactions') || [];

    let filtered = [];
    if (targetUserId) {
      filtered = txns.filter(t => t.userId === targetUserId || t.customerId === targetUserId);
    }

    const data = filtered.slice(0, 50).map(t => {
      let uName = t.userName || '';
      if (!uName && t.description && t.description.includes('(')) {
        const m = t.description.match(/\((.*?)\)/);
        if (m && m[1] && isNaN(Number(m[1].replace(/[\.đ]/g, '')))) {
          uName = m[1].trim();
        }
      }
      return {
        ...t,
        userName: uName || 'Khách hàng'
      };
    });

    return res.json({ success: true, data: data });
  } catch (e) {
    return res.json({ success: true, data: [] });
  }
});

module.exports = router;
module.exports.processGatewayResult = processGatewayResult;
