const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../data/db');
const { requireSignedIn } = require('./customerAuth');
const { generateId } = require('../utils/id');
const { formatDateTime } = require('../utils/dates');

// VNPay Sandbox: đặt các giá trị thật trong .env (đăng ký merchant sandbox tại VNPay để lấy TMN code + secret).
// Giá trị mặc định bên dưới chỉ để chạy demo cục bộ, KHÔNG dùng cho môi trường thật.
const vnp_TmnCode = process.env.VNPAY_TMN_CODE || 'SKILLRENTAL';
const vnp_HashSecret = process.env.VNPAY_HASH_SECRET || 'MYSECRETKEY1234567890';
const vnp_Url = process.env.VNPAY_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
const vnp_ReturnUrl = process.env.VNPAY_RETURN_URL || `http://localhost:${process.env.PORT || 3000}/api/payments/vnpay/return`;

// Helpers to sort object
function sortObject(obj) {
  let sorted = {};
  let str = [];
  let key;
  for (key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      str.push(encodeURIComponent(key));
    }
  }
  str.sort();
  for (key = 0; key < str.length; key++) {
    sorted[str[key]] = encodeURIComponent(obj[str[key]]).replace(/%20/g, "+");
  }
  return sorted;
}

// Ghép "k1=v1&k2=v2" từ object đã được sortObject() mã hóa sẵn.
// (Không dùng require('querystring').stringify(obj, { encode: false }): tham số thứ 2 của hàm đó là
//  dấu phân tách, nên sẽ sinh ra chuỗi chứa "[object Object]" và VNPay luôn báo sai chữ ký.)
function toQueryString(obj) {
  return Object.keys(obj).map(key => `${key}=${obj[key]}`).join('&');
}

// 1. Tạo URL thanh toán
router.post('/vnpay/create', requireSignedIn, (req, res) => {
  const { amount } = req.body; // Số tiền nạp
  const ipAddr = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
  
  if (!amount || Number(amount) < 10000) {
    return res.status(400).json({ success: false, message: 'Số tiền không hợp lệ (tối thiểu 10.000đ).' });
  }

  let date = new Date();
  let createDate = date.getFullYear() +
    String(date.getMonth() + 1).padStart(2, '0') +
    String(date.getDate()).padStart(2, '0') +
    String(date.getHours()).padStart(2, '0') +
    String(date.getMinutes()).padStart(2, '0') +
    String(date.getSeconds()).padStart(2, '0');

  let orderId = generateId('VNP');

  // Ghi vào CSDL trạng thái pending
  const transactions = db.getCollection('walletTransactions') || [];
  transactions.unshift({
    id: orderId,
    userId: req.authUser.id,
    type: 'deposit',
    amount: Number(amount),
    status: 'pending',
    createdAt: formatDateTime(date),
    description: `Nạp tiền ví VNPay`
  });
  db.saveCollection('walletTransactions', transactions);

  let vnp_Params = {};
  vnp_Params['vnp_Version'] = '2.1.0';
  vnp_Params['vnp_Command'] = 'pay';
  vnp_Params['vnp_TmnCode'] = vnp_TmnCode;
  vnp_Params['vnp_Locale'] = 'vn';
  vnp_Params['vnp_CurrCode'] = 'VND';
  vnp_Params['vnp_TxnRef'] = orderId;
  vnp_Params['vnp_OrderInfo'] = 'Nap tien vi SkillRental: ' + orderId;
  vnp_Params['vnp_OrderType'] = 'other';
  vnp_Params['vnp_Amount'] = amount * 100;
  vnp_Params['vnp_ReturnUrl'] = vnp_ReturnUrl;
  vnp_Params['vnp_IpAddr'] = ipAddr;
  vnp_Params['vnp_CreateDate'] = createDate;

  vnp_Params = sortObject(vnp_Params);

  const signData = toQueryString(vnp_Params);
  const hmac = crypto.createHmac("sha512", vnp_HashSecret);
  const signed = hmac.update(new Buffer.from(signData, 'utf-8')).digest("hex");
  vnp_Params['vnp_SecureHash'] = signed;

  const vnpUrl = vnp_Url + '?' + toQueryString(vnp_Params);

  res.json({
    success: true,
    paymentUrl: vnpUrl
  });
});

// 2. Return URL (VNPay gọi lại sau khi khách thanh toán)
router.get('/vnpay/return', (req, res) => {
  let vnp_Params = req.query;

  const secureHash = vnp_Params['vnp_SecureHash'];
  delete vnp_Params['vnp_SecureHash'];
  delete vnp_Params['vnp_SecureHashType'];

  vnp_Params = sortObject(vnp_Params);

  const signData = toQueryString(vnp_Params);
  const hmac = crypto.createHmac("sha512", vnp_HashSecret);
  const signed = hmac.update(new Buffer.from(signData, 'utf-8')).digest("hex");

  if (secureHash === signed) {
    const orderId = vnp_Params['vnp_TxnRef'];
    const rspCode = vnp_Params['vnp_ResponseCode'];
    
    // Tìm giao dịch
    const transactions = db.getCollection('walletTransactions') || [];
    const txn = transactions.find(t => t.id === orderId);
    
    if (txn && txn.status === 'pending') {
      if (rspCode === '00') {
        // Cập nhật trạng thái
        txn.status = 'success';
        
        // Cộng tiền cho user
        const users = db.getCollection('users');
        const user = users.find(u => u.id === txn.userId);
        if (user) {
          user.balance = (user.balance || 0) + txn.amount;
          db.saveCollection('users', users);
        }
      } else {
        txn.status = 'failed';
      }
      db.saveCollection('walletTransactions', transactions);
    }

    res.send(`
      <html>
        <head>
          <meta charset="utf-8">
          <title>Kết quả thanh toán</title>
          <style>body { font-family: Arial; text-align: center; padding-top: 50px; }</style>
        </head>
        <body>
          <h2>Giao dịch ${rspCode === '00' ? 'THÀNH CÔNG' : 'THẤT BẠI'}</h2>
          <p>Mã GD: ${orderId}</p>
          <a href="/index.html">Trở về trang chủ</a>
        </body>
      </html>
    `);
  } else {
    res.send('Sai chữ ký (Invalid Signature)');
  }
});

// 3. IPN URL (VNPay gọi ngầm Server to Server)
router.get('/vnpay/ipn', (req, res) => {
  let vnp_Params = req.query;
  const secureHash = vnp_Params['vnp_SecureHash'];
  delete vnp_Params['vnp_SecureHash'];
  delete vnp_Params['vnp_SecureHashType'];

  vnp_Params = sortObject(vnp_Params);
  const signData = toQueryString(vnp_Params);
  const hmac = crypto.createHmac("sha512", vnp_HashSecret);
  const signed = hmac.update(new Buffer.from(signData, 'utf-8')).digest("hex");

  if (secureHash === signed) {
    const orderId = vnp_Params['vnp_TxnRef'];
    const rspCode = vnp_Params['vnp_ResponseCode'];

    const transactions = db.getCollection('walletTransactions') || [];
    const txn = transactions.find(t => t.id === orderId);

    if (txn) {
      if (txn.status === 'pending') {
        if (rspCode === '00') {
          txn.status = 'success';
          const users = db.getCollection('users');
          const user = users.find(u => u.id === txn.userId);
          if (user) {
            user.balance = (user.balance || 0) + txn.amount;
            db.saveCollection('users', users);
          }
        } else {
          txn.status = 'failed';
        }
        db.saveCollection('walletTransactions', transactions);
        res.status(200).json({ RspCode: '00', Message: 'Confirm Success' });
      } else {
        res.status(200).json({ RspCode: '02', Message: 'Order already confirmed' });
      }
    } else {
      res.status(200).json({ RspCode: '01', Message: 'Order not found' });
    }
  } else {
    res.status(200).json({ RspCode: '97', Message: 'Invalid signature' });
  }
});

module.exports = router;
