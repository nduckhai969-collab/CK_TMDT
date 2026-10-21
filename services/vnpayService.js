// Dịch vụ dùng chung cho cổng thanh toán VNPay (sandbox / production).
//  - Sinh URL thanh toán có chữ ký HMAC-SHA512
//  - Kiểm tra chữ ký của Return URL / IPN
//  - Ánh xạ phương thức thanh toán của SkillRental sang "kênh" (bankCode) của VNPay
const crypto = require('crypto');

// Đọc cấu hình lúc gọi hàm (không cache) để đổi .env là có hiệu lực ngay sau khi khởi động lại.
function getConfig() {
  const port = process.env.PORT || 3000;
  const rawUrl = process.env.VNPAY_URL || '';
  // Nếu trỏ tới sandbox.vnpayment.vn (nơi các mã demo/test thường xuyên bị VNPay thu hồi gây lỗi 72)
  // hoặc để trống -> tự động dùng cổng giả lập VNPay Sandbox nội bộ (/vnpay_gateway.html)
  const isSandboxExpired = !rawUrl || rawUrl.includes('sandbox.vnpayment.vn') || rawUrl.includes('/vnpay_gateway.html');
  const finalUrl = isSandboxExpired ? '/vnpay_gateway.html' : rawUrl;

  return {
    tmnCode: process.env.VNPAY_TMN_CODE || 'SKILLRENTAL',
    hashSecret: process.env.VNPAY_HASH_SECRET || 'RAIQUIVYHUANZVOMLMWUNYGUMGNHUZZE',
    url: finalUrl,
    returnUrl: process.env.VNPAY_RETURN_URL || `http://localhost:${port}/api/payments/vnpay/return`,
    expireMinutes: Number(process.env.VNPAY_EXPIRE_MINUTES) || 15
  };
}

// true nếu chưa điền VNPAY_TMN_CODE / VNPAY_HASH_SECRET thật (đang chạy bằng khóa demo)
function isUsingDemoCredentials() {
  return !process.env.VNPAY_TMN_CODE || !process.env.VNPAY_HASH_SECRET;
}

// ---- Phương thức thanh toán của SkillRental -> kênh trên cổng VNPay ----
const WALLET_METHODS = ['Số dư tài khoản (Escrow)', 'Số dư tài khoản'];
const GATEWAY_METHODS = {
  // Khách tự chọn ngân hàng / ví / QR ngay trên trang VNPay
  'Ví VNPay / MoMo (Escrow)': '',
  'Ví VNPay / MoMo': '',
  // Quét mã QR (kênh VNPAYQR của VNPay)
  'Chuyển khoản VietQR (Escrow)': 'VNPAYQR',
  'Chuyển khoản VietQR': 'VNPAYQR',
  // Thẻ quốc tế Visa / Mastercard / JCB
  'Thẻ Tín Dụng Quốc Tế (Escrow)': 'INTCARD',
  'Thẻ Tín Dụng Quốc Tế': 'INTCARD'
};
const ALLOWED_BANK_CODES = ['', 'VNPAYQR', 'VNBANK', 'INTCARD'];

function isWalletMethod(label) { return WALLET_METHODS.includes(label); }
function isGatewayMethod(label) { return Object.prototype.hasOwnProperty.call(GATEWAY_METHODS, label); }
function bankCodeForMethod(label) { return isGatewayMethod(label) ? GATEWAY_METHODS[label] : ''; }
function sanitizeBankCode(code) { return ALLOWED_BANK_CODES.includes(code) ? code : ''; }

// ---- Tiện ích ----
// VNPay yêu cầu thời gian theo giờ Việt Nam (GMT+7) dù máy chủ đặt ở múi giờ nào.
function formatVnpDate(date) {
  const d = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

function normalizeIp(raw) {
  let ip = String(raw || '').split(',')[0].trim();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (!ip || ip === '::1') ip = '127.0.0.1';
  return ip;
}

function sortObject(obj) {
  const sorted = {};
  const keys = Object.keys(obj).map(encodeURIComponent).sort();
  keys.forEach((key) => {
    sorted[key] = encodeURIComponent(obj[decodeURIComponent(key)]).replace(/%20/g, '+');
  });
  return sorted;
}

// Ghép "k1=v1&k2=v2" từ object đã được sortObject() mã hóa sẵn.
// (Không dùng require('querystring').stringify(obj, { encode: false }): tham số thứ 2 của hàm đó là
//  dấu phân tách, nên sẽ sinh ra chuỗi lỗi và VNPay luôn báo sai chữ ký.)
function toQueryString(obj) {
  return Object.keys(obj).map((key) => `${key}=${obj[key]}`).join('&');
}

function sign(sortedParams, secret) {
  return crypto.createHmac('sha512', secret).update(Buffer.from(toQueryString(sortedParams), 'utf-8')).digest('hex');
}

// Tạo URL chuyển khách sang cổng VNPay.
function createPaymentUrl({ txnRef, amount, orderInfo, ipAddr, bankCode = '', orderType = 'other', locale = 'vn', now = new Date() }) {
  const cfg = getConfig();
  const params = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: cfg.tmnCode,
    vnp_Locale: locale === 'en' ? 'en' : 'vn',
    vnp_CurrCode: 'VND',
    vnp_TxnRef: txnRef,
    vnp_OrderInfo: orderInfo,
    vnp_OrderType: orderType,
    vnp_Amount: Math.round(Number(amount)) * 100,
    vnp_ReturnUrl: cfg.returnUrl,
    vnp_IpAddr: normalizeIp(ipAddr),
    vnp_CreateDate: formatVnpDate(now),
    vnp_ExpireDate: formatVnpDate(new Date(now.getTime() + cfg.expireMinutes * 60 * 1000))
  };
  const channel = sanitizeBankCode(bankCode);
  if (channel) params.vnp_BankCode = channel;

  const sorted = sortObject(params);
  sorted.vnp_SecureHash = sign(sorted, cfg.hashSecret);
  return `${cfg.url}?${toQueryString(sorted)}`;
}

// Kiểm tra chữ ký của dữ liệu VNPay gửi về (Return URL hoặc IPN).
function verifyQuery(query) {
  const params = {};
  Object.keys(query || {}).forEach((key) => { params[key] = String(query[key]); });
  const received = String(params.vnp_SecureHash || '');
  delete params.vnp_SecureHash;
  delete params.vnp_SecureHashType;

  const expected = sign(sortObject(params), getConfig().hashSecret);
  const a = Buffer.from(received.toLowerCase());
  const b = Buffer.from(expected.toLowerCase());
  const valid = a.length === b.length && crypto.timingSafeEqual(a, b);
  return { valid, params };
}

const RESPONSE_MESSAGES = {
  '00': 'Giao dịch thành công.',
  '07': 'Tiền đã bị trừ nhưng giao dịch bị nghi ngờ (gian lận/bất thường). Vui lòng liên hệ hỗ trợ.',
  '09': 'Thẻ/tài khoản chưa đăng ký dịch vụ Internet Banking.',
  '10': 'Xác thực thông tin thẻ/tài khoản sai quá 3 lần.',
  '11': 'Đã hết thời gian chờ thanh toán.',
  '12': 'Thẻ/tài khoản đang bị khóa.',
  '13': 'Nhập sai mật khẩu xác thực giao dịch (OTP).',
  '24': 'Bạn đã hủy giao dịch.',
  '51': 'Tài khoản không đủ số dư.',
  '65': 'Tài khoản đã vượt hạn mức giao dịch trong ngày.',
  '75': 'Ngân hàng đang bảo trì.',
  '79': 'Nhập sai mật khẩu thanh toán quá số lần quy định.',
  '99': 'Lỗi không xác định.'
};
function describeResponseCode(code) {
  return RESPONSE_MESSAGES[code] || `Giao dịch không thành công (mã ${code || 'không rõ'}).`;
}

module.exports = {
  getConfig,
  isUsingDemoCredentials,
  isWalletMethod,
  isGatewayMethod,
  bankCodeForMethod,
  sanitizeBankCode,
  normalizeIp,
  formatVnpDate,
  createPaymentUrl,
  verifyQuery,
  describeResponseCode
};
