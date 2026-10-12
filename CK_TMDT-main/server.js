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
//const adminRoutes = require('./routes/adminRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. CORS Middleware - BẮT BUỘC ĐẶT TRƯỚC TẤT CẢ ROUTES để hỗ trợ WebStorm (port 63342), Live Server (port 5500)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id']
}));

// 2. Body Parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 3. Phục vụ tĩnh toàn bộ thư mục Frontend (HTML, CSS, JS, Images)
app.use(express.static(path.join(__dirname, 'Frontend')));

// 4. API Routes
app.use('/api/auth', authRoutes);
//app.use('/api/admin', adminRoutes);
app.use('/api/providers', providerRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/services', serviceRoutes);

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

// Route gốc vào trang chủ
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'Frontend', 'index.html'));
});

// Khởi động server
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`  SKILL RENTAL PLATFORM - FULL-STACK NODE.JS SERVER `);
  console.log(`====================================================`);
  console.log(`  - URL Máy Chủ:         http://localhost:${PORT}`);
  console.log(`  - Trang Chủ:           http://localhost:${PORT}/index.html`);
  console.log(`  - Khám Phá Kỹ Năng:    http://localhost:${PORT}/customer.html`);
  console.log(`  - Kênh Provider:       http://localhost:${PORT}/dashboard.html`);
  console.log(`  - Cổng Quản Trị:       http://localhost:${PORT}/admin.html`);
  console.log(`  - Hỗ trợ CORS:         WebStorm, LiveServer, Fetch All Origins`);
  console.log(`====================================================`);
});

module.exports = app;