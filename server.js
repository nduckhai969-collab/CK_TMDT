require('dotenv').config();
const mysqlDb = require('./data/mysql');
const express = require('express');
const path = require('path');
const cors = require('cors');

const authRoutes = require('./routes/authRoutes');
const providerRoutes = require('./routes/providerRoutes');
const chatRoutes = require('./routes/chatRoutes');
const complaintRoutes = require('./routes/complaintRoutes');
const jobRoutes = require('./routes/jobRoutes');
const orderRoutes = require('./routes/orderRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const serviceRoutes = require('./routes/serviceRoutes');
const commentRoutes = require('./routes/commentRoutes');
const adminRoutes = require('./routes/adminRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const bookingListRoutes = require('./routes/bookingListRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const emailRoutes = require('./routes/emailRoutes');
const { requireAdmin } = require('./routes/customerAuth');
const db = require('./data/db');
const { passport } = require('./config/passport');

const app = express();
const PORT = process.env.PORT || 3000;

// Khai báo biến server ở đây để hàm shutdown có thể truy cập được (Sửa lỗi Scope)
let server; 

// 1. CORS Middleware - Hỗ trợ Cookie Credentials cho Session truyền thống và các cổng dev (Live Server, WebStorm)
const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || !allowedOrigins.length || allowedOrigins.includes(origin) || origin.includes('localhost') || origin.includes('127.0.0.1')) {
      callback(null, true);
    } else {
      callback(null, origin);
    }
  },
  credentials: true, // Bắt buộc để trình duyệt nhận và gửi Cookie session_id
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id']
}));

// 2. Cookie Parser Middleware (Thuần Node.js - Tự động bóc tách req.cookies)
app.use((req, res, next) => {
  req.cookies = {};
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    cookieHeader.split(';').forEach(c => {
      const idx = c.indexOf('=');
      if (idx !== -1) {
        const key = c.slice(0, idx).trim();
        const val = c.slice(idx + 1).trim();
        try {
          req.cookies[key] = decodeURIComponent(val);
        } catch (_) {
          req.cookies[key] = val;
        }
      }
    });
  }
  next();
});

// 3. Body Parser
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(passport.initialize());

// 4. Avatar là file riêng trên backend; Firestore chỉ lưu URL của file.
const avatarStorageDir = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, 'uploads'));
app.use('/uploads', express.static(avatarStorageDir, {
  fallthrough: false,
  index: false,
  maxAge: '1d',
  setHeaders(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  }
}));

// 5. Phục vụ tĩnh toàn bộ thư mục Frontend (HTML, CSS, JS, Images)
app.use(express.static(path.join(__dirname, 'Frontend')));

// Điều hướng xem chi tiết sản phẩm / dịch vụ: /products/:id
app.get('/products/:id', (req, res) => {
  res.redirect(`/customer_service_detail.html?id=${encodeURIComponent(req.params.id)}`);
});

// 6. API Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', requireAdmin, adminRoutes);
app.use('/admin', requireAdmin, adminRoutes);
app.use('/api/providers', providerRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/orders', orderRoutes);
app.use('/orders', orderRoutes);
app.use('/order', orderRoutes);
app.use('/api/booking-list', bookingListRoutes);
app.use('/api/cart', bookingListRoutes);
app.use('/api/products', serviceRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/analytics', analyticsRoutes);
app.use('/api/email', emailRoutes);

// ============================================================================
// CHỨC NĂNG 7: TÍCH HỢP CỔNG THANH TOÁN VNPAY & CHECKOUT TRUYỀN THỐNG
// ============================================================================
const sessionStore = require('./data/sessionStore');
const vnpayService = require('./services/vnpayService');
const crypto = require('crypto');

// Hàm bổ trợ sắp xếp tham số A-Z theo yêu cầu của VNPay
function sortObject(obj) {
  let sorted = {};
  let str = [];
  let key;
  for (key in obj) {
    if (obj.hasOwnProperty(key)) {
      str.push(encodeURIComponent(key));
    }
  }
  str.sort();
  for (key = 0; key < str.length; key++) {
    sorted[str[key]] = encodeURIComponent(obj[decodeURIComponent(str[key])]).replace(/%20/g, "+");
  }
  return sorted;
}

// ROUTE 1: TẠO URL THANH TOÁN (REDIRECT SANG VNPAY)
app.post(['/order/create-vnpay-url', '/api/orders/create-vnpay-url', '/api/payment/create-vnpay-url'], (req, res) => {
  // 1. Kiểm tra session xem người dùng đã đăng nhập chưa
  const sessionId = (req.cookies && req.cookies.session_id) || (req.headers && req.headers['x-session-id']);
  const session = sessionId ? sessionStore.getSession(sessionId) : null;
  const userId = (session && session.userId) || req.session?.userId || req.headers['x-user-id'];

  if (!userId) {
    return res.status(401).json({ success: false, message: "Chưa đăng nhập" });
  }

  const { orderId, amount } = req.body;
  const orders = db.getCollection('orders') || [];
  const order = orders.find(o => o.id === orderId);

  let finalAmount = Number(amount);
  if (!finalAmount && order) {
    finalAmount = Number(order.total_price || order.escrowDeposit || order.price || 0);
  }
  if (!finalAmount || finalAmount <= 0) {
    finalAmount = 50000;
  }

  const cfg = vnpayService.getConfig();
  const tmnCode = cfg.tmnCode || 'COCOS001';
  const secretKey = cfg.hashSecret || 'RAIQUIVYHUANZVOMLMWUNYGUMGNHUZZE';
  const returnUrl = cfg.returnUrl || `http://localhost:${PORT}/vnpay-return`;
  const ipAddr = vnpayService.normalizeIp(req.headers['x-forwarded-for'] || req.socket.remoteAddress);
  const createDate = vnpayService.formatVnpDate(new Date());

  const txnRef = orderId || `DH${Date.now()}`;
  let vnp_Params = {
    'vnp_Version': '2.1.0',
    'vnp_Command': 'pay',
    'vnp_TmnCode': tmnCode,
    'vnp_Locale': 'vn',
    'vnp_CurrCode': 'VND',
    'vnp_TxnRef': txnRef,
    'vnp_OrderInfo': 'Thanh toan don hang #' + txnRef,
    'vnp_OrderType': 'other',
    'vnp_Amount': Math.round(finalAmount) * 100, // Nhân 100 theo quy định VNPay
    'vnp_ReturnUrl': returnUrl,
    'vnp_IpAddr': ipAddr,
    'vnp_CreateDate': createDate
  };

  vnp_Params = sortObject(vnp_Params);
  const signData = Object.keys(vnp_Params).map(k => `${k}=${vnp_Params[k]}`).join('&');
  let hmac = crypto.createHmac("sha512", secretKey);
  let signed = hmac.update(Buffer.from(signData, 'utf-8')).digest("hex");
  vnp_Params['vnp_SecureHash'] = signed;

  let finalUrl = cfg.url + '?' + Object.keys(vnp_Params).map(k => `${k}=${vnp_Params[k]}`).join('&');
  return res.status(200).json({ success: true, paymentUrl: finalUrl });
});

// ROUTE 2: ĐÓN NHẬN KẾT QUẢ NGẦM (API IPN) - PUBLIC (Không check auth session)
app.all(['/api/payment/vnpay-ipn', '/api/payments/vnpay-ipn', '/api/payment/vnpay/ipn'], (req, res) => {
  const queryData = req.method === 'POST' ? req.body : req.query;
  const result = paymentRoutes.processGatewayResult(queryData);
  return res.status(200).json({ RspCode: result.code, Message: result.message });
});

// ROUTE 3: RETURN URL ĐIỀU HƯỚNG NGƯỜI DÙNG QUAY VỀ
app.get(['/vnpay-return', '/order/vnpay-return'], (req, res) => {
  const queryStr = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  res.redirect(`/api/payments/vnpay/return${queryStr}`);
});

app.use('/order', orderRoutes);
app.use('/api/payment', paymentRoutes);

// ============================================================================
// PUBLIC SEED ENDPOINT — No auth required
// Returns all admin-relevant data from database.json with field mapping.
// Used by common.js syncStateWithServer() to seed localStorage.
// ============================================================================
app.get('/api/data/seed', (req, res) => {
  try {
    const fmt = (n) => Number(n) ? Number(n).toLocaleString('vi-VN') + 'đ' : (n || '0đ');
    const escrowLabel = (s) => {
      const map = {
        escrow_held: 'Đã giữ ký quỹ',
        completed: 'Đã giải ngân',
        refunded: 'Đã hoàn tiền',
        disputed: 'Đang tranh chấp',
        force_released: 'Giải ngân bắt buộc',
        pending: 'Chờ xử lý'
      };
      return map[s] || s || 'Chờ xử lý';
    };

    const rawOrders = db.getCollection('orders').map(o => ({
      id: o.id,
      customer: o.customerName || o.customer || '',
      customerId: o.customerId || '',
      provider: o.providerName || o.provider || '',
      providerId: o.providerId || '',
      service: o.serviceTitle || o.service || '',
      price: o.priceFormatted || fmt(o.price),
      priceRaw: Number(o.price) || 0,
      platformFee: o.platformFee || Math.round((Number(o.price) || 0) * 0.05),
      escrowDeposit: o.escrowDeposit || ((Number(o.price) || 0) + (o.platformFee || Math.round((Number(o.price) || 0) * 0.05))),
      escrowStatus: escrowLabel(o.escrowStatus),
      orderStatus: o.orderStatus || 'pending',
      date: o.date || '',
      deadline: o.deadline || '',
      note: o.note || ''
    }));

    res.json({
      success: true,
      state: {
        users: db.getCollection('users'),
        pendingProviders: db.getCollection('pendingProviders'),
        skillApprovals: db.getCollection('skillApprovals'),
        services: db.getCollection('services'),
        orders: rawOrders,
        reviews: db.getCollection('reviews'),
        complaints: db.getCollection('complaints'),
        reports: db.getCollection('reports'),
        payouts: db.getCollection('payouts'),
        packages: db.getCollection('packages'),
        packagePurchases: db.getCollection('packagePurchases'),
        unlockRequests: db.getCollection('unlockRequests')
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Không thể đọc dữ liệu hệ thống.' });
  }
});

// Test server API
app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: 'Backend TMDT SkillRental đang hoạt động!',
    time: new Date().toISOString()
  });
});

// Google OAuth Shortcuts (Tự động chuyển hướng sang API OAuth)
app.get(['/auth/google', '/login/google'], (req, res) => {
  const queryStr = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  res.redirect(`/api/auth/google${queryStr}`);
});
app.get(['/auth/google/callback', '/login/google/callback'], (req, res) => {
  const queryStr = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  res.redirect(`/api/auth/google/callback${queryStr}`);
});

// Chuyển hướng trang login cũ sang modal index
app.get(['/customer_login.html', '/login'], (req, res) => {
  res.redirect('/index.html?auth=login');
});

// Route tìm provider
app.get(['/find-provider', '/find_provider', '/find_provider.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'Frontend', 'find_provider.html'));
});

// Route xác thực tài khoản và Firebase email action handler
app.get(['/verify', '/verify.html', '/__/auth/action'], (req, res) => {
  res.sendFile(path.join(__dirname, 'Frontend', 'verify.html'));
});

// Route gốc vào trang chủ
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'Frontend', 'index.html'));
});

// Khởi động server (nạp dữ liệu từ Firestore trước khi nhận request)
db.init().then(() => {
  // Gán trực tiếp vào biến server toàn cục đã khai báo ở trên
  server = app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`  SKILL RENTAL PLATFORM - FULL-STACK NODE.JS SERVER `);
    console.log(`====================================================`);
    console.log(`  - URL Máy Chủ:         http://localhost:${PORT}`);
    console.log(`  - Trang Chủ:           http://localhost:${PORT}/index.html`);
    console.log(`  - Khám Phá Kỹ Năng:    http://localhost:${PORT}/customer.html`);
    console.log(`  - Kênh Provider:       http://localhost:${PORT}/dashboard.html`);
    console.log(`  - Cổng Quản Trị:       http://localhost:${PORT}/admin.html`);
    console.log(`  - Xác thực Session:    Cookie session_id (HttpOnly, SameSite=Lax)`);
    console.log(`====================================================`);
  });

  // Mỗi phút tự hủy các đơn chờ thanh toán đã quá hạn (Sửa lỗi Async/Await)
  const expiryTimer = setInterval(async () => {
    try {
      // Đợi hàm async hoàn thành để lấy số lượng đơn chính xác
      const count = await require('./services/checkoutService').expireUnpaidOrders();
      if (count) console.log(`[Payment] Đã tự hủy ${count} đơn quá hạn thanh toán.`);
    } catch (err) {
      console.error('[Payment] Lỗi dọn đơn quá hạn:', err.message);
    }
  }, 60 * 1000);
  expiryTimer.unref();

  const shutdown = async () => {
    await db.flush();
    if (server) {
      server.close(() => process.exit(0));
    } else {
      process.exit(0);
    }
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}).catch((err) => {
  console.error('Không thể kết nối Firestore:', err.message);
  process.exit(1);
});

module.exports = app;
