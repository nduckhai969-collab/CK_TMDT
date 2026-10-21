require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const os = require('os');

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
const { requireAdmin } = require('./routes/customerAuth');
const db = require('./data/db');

const app = express();
const PORT = process.env.PORT || 3000;

// Khai báo biến server ở đây để hàm shutdown có thể truy cập được (Sửa lỗi Scope)
let server; 

// 1. CORS Middleware - BẮT BUỘC ĐẶT TRƯỚC TẤT CẢ ROUTES để hỗ trợ WebStorm (port 63342), Live Server (port 5500)
const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);
app.use(cors({
  // Không cấu hình CORS_ORIGINS => cho phép tất cả (chỉ nên dùng khi dev)
  origin: allowedOrigins.length ? allowedOrigins : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// 2. Body Parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 3. Avatar là file riêng trên backend; Firestore chỉ lưu URL của file.
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

// 4. Phục vụ tĩnh toàn bộ thư mục Frontend (HTML, CSS, JS, Images)
app.use(express.static(path.join(__dirname, 'Frontend')));

// 5. API Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', requireAdmin, adminRoutes);
app.use('/api/providers', providerRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/booking-list', bookingListRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/notifications', notificationRoutes);

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
  // Listen on all network interfaces so other devices on the LAN can use this
  // single backend instance instead of starting a private server per device.
  server = app.listen(PORT, '0.0.0.0', () => {
    const lanAddresses = Object.values(os.networkInterfaces())
      .flatMap(interfaces => interfaces || [])
      .filter(address => address.family === 'IPv4' && !address.internal)
      .map(address => `http://${address.address}:${PORT}`);
    console.log(`====================================================`);
    console.log(`  SKILL RENTAL PLATFORM - FULL-STACK NODE.JS SERVER `);
    console.log(`====================================================`);
    console.log(`  - Máy này:             http://localhost:${PORT}`);
    console.log(`  - Trên mạng LAN:       ${lanAddresses.join(', ') || 'Không tìm thấy IPv4 LAN'}`);
    console.log(`  - Trang chủ:           /index.html`);
    console.log(`  - Khám phá kỹ năng:    /customer.html`);
    console.log(`  - Kênh Provider:       /dashboard.html`);
    console.log(`  - Cổng quản trị:       /admin.html`);
    console.log(`  - Hỗ trợ CORS:         WebStorm, LiveServer, Fetch All Origins`);
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
