const express = require('express');
const router = express.Router();
const db = require('../data/db');
const { requireSignedIn, requireCustomer } = require('./customerAuth');
const vnpay = require('../services/vnpayService');
const checkout = require('../services/checkoutService');
const { createNotification } = require('../services/notificationService');
const { formatDateTime } = require('../utils/dates');

// ---------------------------------------------------------------------------
// Cấu hình VNPay nằm trong .env (xem .env.example):
//   VNPAY_TMN_CODE, VNPAY_HASH_SECRET, VNPAY_URL, VNPAY_RETURN_URL
// Khóa mặc định chỉ để chạy demo cục bộ; cổng VNPay thật sẽ từ chối vì sai TMN code.
// ---------------------------------------------------------------------------
if (vnpay.isUsingDemoCredentials()) {
  console.warn('[VNPay] Chưa cấu hình VNPAY_TMN_CODE / VNPAY_HASH_SECRET trong .env: đang dùng khóa demo, cổng VNPay sandbox sẽ không chấp nhận giao dịch.');
}

const MIN_DEPOSIT = checkout.MIN_PAYMENT;
const MAX_DEPOSIT = checkout.MAX_PAYMENT;

// ---------------------------------------------------------------------------
// 1. Nạp tiền vào ví
// ---------------------------------------------------------------------------
router.post('/vnpay/create', requireSignedIn, (req, res) => {
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
    ipAddr: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
    orderInfo: `Nap tien vi SkillRental ${req.authUser.id}`,
    orderType: 'other'
  });

  res.json({ success: true, paymentUrl, txnRef: txn.id });
});

// ---------------------------------------------------------------------------
// 2. Thanh toán (lại) một đơn đang chờ thanh toán
// ---------------------------------------------------------------------------
router.post('/vnpay/orders/:orderId', requireCustomer, (req, res) => {
  try {
    const { order, txn, paymentUrl } = checkout.startGatewayRetry({
      orderId: req.params.orderId,
      customerId: req.authUser.id,
      ipAddr: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
      bankCode: req.body.bankCode
    });
    res.json({ success: true, paymentUrl, txnRef: txn.id, order });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, message: err.message });
  }
});

// ---------------------------------------------------------------------------
// 3. Xử lý kết quả VNPay (dùng chung cho Return URL và IPN, chạy đúng 1 lần cho mỗi giao dịch)
//    Mã trả về theo chuẩn IPN của VNPay: 00 ok | 01 không thấy đơn | 02 đã xác nhận trước đó
//    | 04 sai số tiền | 97 sai chữ ký | 99 lỗi khác
// ---------------------------------------------------------------------------
function processGatewayResult(query) {
  const { valid, params } = vnpay.verifyQuery(query);
  if (!valid) return { code: '97', message: 'Invalid signature' };

  const transactions = db.getCollection('walletTransactions') || [];
  const txn = transactions.find((t) => t.id === params.vnp_TxnRef && (t.type === 'deposit' || t.type === 'order_payment'));
  if (!txn) return { code: '01', message: 'Order not found' };

  if (Number(params.vnp_Amount) !== Math.round(txn.amount) * 100) {
    return { code: '04', message: 'Invalid amount', txn };
  }

  // Chỉ xử lý khi giao dịch còn chờ ('expired' vẫn xử lý: khách có thể trả muộn một chút sau khi đơn tự hủy)
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
    // markOrdersPaid có thể ghi thêm thông tin vào txn (creditedToWallet): lưu lại lần nữa
    const latest = db.getCollection('walletTransactions') || [];
    const stored = latest.find((t) => t.id === txn.id);
    if (stored && txn.creditedToWallet) { stored.creditedToWallet = txn.creditedToWallet; db.saveCollection('walletTransactions', latest); }
  }
  return { code: '00', message: 'Confirm Success', txn, success: true };
}

// Return URL: VNPay chuyển trình duyệt của khách về đây. Xử lý kết quả rồi đưa khách về trang tương ứng.
router.get('/vnpay/return', (req, res) => {
  const result = processGatewayResult(req.query);
  if (result.code === '97') {
    return res.status(400).send('Sai chữ ký (Invalid Signature)');
  }
  if (!result.txn) {
    return res.redirect('/customer_wallet.html?payment=failed&reason=notfound');
  }

  const txn = result.txn;
  const page = txn.type === 'deposit' ? '/customer_wallet.html' : '/customer_orders.html';
  const ok = txn.status === 'success';
  const query = new URLSearchParams({
    payment: ok ? 'success' : 'failed',
    txn: txn.id,
    code: String(req.query.vnp_ResponseCode || txn.responseCode || '')
  });
  res.redirect(`${page}?${query.toString()}`);
});

// IPN: VNPay gọi ngầm từ máy chủ của họ (cần địa chỉ công khai, ví dụ ngrok khi chạy local).
router.get('/vnpay/ipn', (req, res) => {
  const result = processGatewayResult(req.query);
  res.status(200).json({ RspCode: result.code, Message: result.message });
});

// ---------------------------------------------------------------------------
// 4. Tra cứu trạng thái / lịch sử giao dịch của chính mình
// ---------------------------------------------------------------------------
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

module.exports = router;
module.exports.processGatewayResult = processGatewayResult;
