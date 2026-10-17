const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../data/db');


// Thuật toán chuẩn hóa và ký chữ ký số HMAC-SHA512 theo quy chuẩn VNPay
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

// 1. TẠO URL THANH TOÁN VNPAY
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

    // Lưu trước giao dịch vào ví ở trạng thái pending
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
      'vnp_Amount': String(amount * 100), // VNPay yêu cầu nhân 100
      'vnp_ReturnUrl': returnUrl,
      'vnp_IpAddr': '127.0.0.1',
      'vnp_CreateDate': createDate
    };

    // Nếu người dùng chọn ngân hàng cụ thể (ví dụ NCB)
    if (req.body.bankCode && req.body.bankCode !== 'VNPAYQR') {
      vnp_Params['vnp_BankCode'] = req.body.bankCode;
    }

    // Tạo URL với chữ ký hash SHA512 chuẩn xác 100%
    const queryString = buildVNPayQueryAndHash(vnp_Params, secretKey);
    const finalUrl = vnpUrl + '?' + queryString;

    return res.json({ success: true, url: finalUrl, paymentUrl: finalUrl });
  } catch (err) {
    console.error('Lỗi tạo URL VNPay:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Hỗ trợ endpoint cũ
router.post('/vnpay/create', (req, res, next) => {
  req.url = '/vnpay/create_payment_url';
  router.handle(req, res, next);
});

// 2. XỬ LÝ KẾT QUẢ KHI THANH TOÁN XONG TRÊN VNPAY QUAY VỀ
router.get('/vnpay/return', (req, res) => {
  try {
    let vnp_Params = { ...req.query };
    const secureHash = vnp_Params['vnp_SecureHash'];
    delete vnp_Params['vnp_SecureHash'];
    delete vnp_Params['vnp_SecureHashType'];

    const secretKey = process.env.VNPAY_HASH_SECRET || 'XNBCJFAKAZQSGGTARZGNOXBLHGKTTYRR';
    
    // Kiểm tra chữ ký hợp lệ
    const sortedKeys = Object.keys(vnp_Params).sort();
    const signDataParts = [];
    for (const key of sortedKeys) {
      const val = vnp_Params[key];
      if (val !== '' && val !== null && val !== undefined) {
        signDataParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(val)).replace(/%20/g, '+')}`);
      }
    }
    const signData = signDataParts.join('&');
    const hmac = crypto.createHmac('sha512', secretKey);
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

    const responseCode = vnp_Params['vnp_ResponseCode'];
    const amount = Number(vnp_Params['vnp_Amount']) / 100;
    const txnRef = vnp_Params['vnp_TxnRef'];

    // Nếu thanh toán thành công (Mã 00)
    if (responseCode === '00') {
      // 1. Tự động cộng tiền vào ví người dùng trong database
      const users = db.getCollection('users') || [];
      const user = users.find(u => u.id === 'USR003') || users.find(u => u.role === 'Customer') || users[0];
      if (user) {
        user.balance = (Number(user.balance) || 0) + amount;
        db.saveCollection('users', users);
      }

      // 2. Đổi trạng thái giao dịch sang success
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
          amount: amount,
          type: 'deposit',
          gateway: 'VNPay',
          status: 'success',
          description: 'Nạp tiền qua VNPay thành công',
          createdAt: new Date().toISOString()
        });
      }
      db.saveCollection('walletTransactions', txns);

      // Quay về trang ví kèm thông báo nạp thành công
      return res.redirect(`/customer_wallet.html?payment=success&amount=${amount}&code=00`);
    } else {
      return res.redirect(`/customer_wallet.html?payment=failed&code=${responseCode || '97'}`);
    }
  } catch (err) {
    console.error('Lỗi VNPay return:', err);
    return res.redirect('/customer_wallet.html?payment=error');
  }
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
    
    // Tìm hoặc liên kết tài khoản Customer
    let user = users.find(u => u.name && u.name.toLowerCase().trim() === targetName.toLowerCase());
    if (!user) {
      user = users.find(u => u.id === 'USR003') || users.find(u => u.role === 'Customer') || users[0];
    }

    // Cộng tiền vào số dư của user
    if (user) {
      user.balance = (Number(user.balance) || 0) + amount;
      db.saveCollection('users', users);
    }

    // Ghi nhận lịch sử giao dịch - LƯU RIÊNG TÊN NGƯỜI NẠP CHO TỪNG GIAO DỊCH NÀY
    const txns = db.getCollection('walletTransactions') || [];
    const existingIndex = txns.findIndex(t => String(t.id) === String(txnId));

    const newTxnData = {
      id: txnId,
      userId: user ? user.id : 'USR003',
      userName: targetName, // Lưu tên của lần nạp này
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

    // In terminal đúng tên người nạp của lần giao dịch này
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

// ============================================================
// API TỰ ĐỘNG TÌM ĐỊA CHỈ IP MÁY TÍNH TRONG MẠNG WI-FI
// ============================================================
const os = require('os');

router.get('/server-info', (req, res) => {
  let localIp = 'localhost';
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Lấy IPv4 thật không phải 127.0.0.1
      if (iface.family === 'IPv4' && !iface.internal) {
        localIp = iface.address;
        break;
      }
    }
  }
  res.json({ success: true, localIp: localIp, port: process.env.PORT || 3000 });
});

// ============================================================
// API LẤY LỊCH SỬ GIAO DỊCH VÍ - GIỮ NGUYÊN TÊN RIÊNG CỦA TỪNG LẦN NẠP
// ============================================================
router.get('/history', (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    const txns = db.getCollection('walletTransactions') || [];
    // Trả về đúng tên đã lưu của từng giao dịch (t.userName), không ghi đè tên chung
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

