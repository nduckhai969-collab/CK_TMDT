const express = require('express');
const router = express.Router();
const db = require('../data/db');

// Helper to resolve current provider based on header or query
function resolveProvider(req) {
  const userId = req.headers['x-user-id'] || req.query.userId;
  const providers = db.getCollection('providers');
  let provider = null;

  if (userId) {
    provider = providers.find(p => p.userId === userId || p.id === userId);
  }
  // Default to first provider (Nguyễn Văn An - PRV001) for smooth demo experience
  if (!provider) {
    provider = providers.find(p => p.id === 'PRV001') || providers[0];
  }
  return provider;
}

// ============================================================================
// 1. PUBLIC PROVIDER DIRECTORY & DETAIL (Customer facing)
// ============================================================================
router.get('/', (req, res) => {
  const { category, search, minRating } = req.query;
  let providers = db.getCollection('providers');

  if (category && category !== 'all') {
    providers = providers.filter(p => p.category && p.category.toLowerCase() === category.toLowerCase());
  }

  if (search) {
    const q = search.toLowerCase().trim();
    providers = providers.filter(p =>
      (p.name && p.name.toLowerCase().includes(q)) ||
      (p.specialty && p.specialty.toLowerCase().includes(q)) ||
      (p.skills && p.skills.some(s => s.toLowerCase().includes(q)))
    );
  }

  if (minRating) {
    providers = providers.filter(p => p.rating >= Number(minRating));
  }

  res.json({
    success: true,
    total: providers.length,
    providers
  });
});

// ============================================================================
// 2. CURRENT PROVIDER PROFILE & DASHBOARD (Provider Channel)
// ============================================================================
router.get('/me', (req, res) => {
  const provider = resolveProvider(req);
  if (!provider) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ chuyên gia!' });
  }

  const users = db.getCollection('users');
  const user = users.find(u => u.id === provider.userId || u.name === provider.name);

  const services = db.getCollection('services').filter(s => s.providerId === provider.id || s.providerName === provider.name);
  const orders = db.getCollection('orders').filter(o => o.providerId === provider.id || o.providerName === provider.name);
  const reviews = db.getCollection('reviews').filter(r => r.providerId === provider.id || r.providerName === provider.name);
  const packagePurchases = db.getCollection('packagePurchases').filter(p => p.providerId === provider.id || p.provider === provider.name);

  res.json({
    success: true,
    provider: {
      ...provider,
      balance: user ? user.balance : 25000000,
      email: user ? user.email : 'an.nguyen@example.com',
      phone: user ? user.phone : '0901 234 567'
    },
    servicesCount: services.length,
    ordersCount: orders.length,
    reviewsCount: reviews.length,
    activePackage: packagePurchases[0] || null
  });
});

// Dashboard stats for Provider
router.get('/dashboard/stats', (req, res) => {
  const provider = resolveProvider(req);
  if (!provider) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy chuyên gia!' });
  }

  const orders = db.getCollection('orders').filter(o => o.providerId === provider.id || o.providerName === provider.name);
  const reviews = db.getCollection('reviews').filter(r => r.providerId === provider.id || r.providerName === provider.name);
  const jobs = db.getCollection('jobRequests');

  const activeProjects = orders.filter(o => o.orderStatus === 'processing' || o.orderStatus === 'confirmed' || o.orderStatus === 'delivered');
  const completedOrders = orders.filter(o => o.orderStatus === 'completed');

  // Calculate earnings
  let monthlyEarnings = provider.monthlyEarnings || 35500000;
  let escrowHeldAmount = 0;

  activeProjects.forEach(o => {
    escrowHeldAmount += (Number(o.price) || 0);
  });

  // Calculate rating
  const avgRating = reviews.length > 0
    ? (reviews.reduce((acc, r) => acc + (Number(r.rating) || 5), 0) / reviews.length).toFixed(1)
    : provider.rating || 4.9;

  // Proposals submitted by this provider
  let submittedProposalsCount = 0;
  jobs.forEach(j => {
    if (j.applicants && j.applicants.some(a => a.providerId === provider.id || a.providerName === provider.name)) {
      submittedProposalsCount++;
    }
  });

  res.json({
    success: true,
    stats: {
      monthlyEarnings,
      monthlyEarningsFormatted: monthlyEarnings.toLocaleString('vi-VN') + 'đ',
      activeProjectsCount: activeProjects.length || provider.activeProjectsCount || 12,
      completedOrdersCount: completedOrders.length || provider.completedOrders || 42,
      escrowHeldAmount,
      escrowHeldFormatted: escrowHeldAmount.toLocaleString('vi-VN') + 'đ',
      averageRating: avgRating,
      reviewCount: reviews.length || provider.reviewCount || 38,
      submittedProposalsCount,
      availabilityStatus: provider.availabilityStatus || 'ready'
    },
    recentOrders: orders.slice(0, 5),
    recentReviews: reviews.slice(0, 3)
  });
});

// Update profile info (UC-30)
router.put('/profile', (req, res) => {
  const provider = resolveProvider(req);
  if (!provider) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ chuyên gia!' });
  }

  const { name, specialty, bio, location, hourlyRate, avatar, cover } = req.body;
  const providers = db.getCollection('providers');
  const index = providers.findIndex(p => p.id === provider.id);

  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ trong database!' });
  }

  if (name) providers[index].name = name.trim();
  if (specialty) providers[index].specialty = specialty.trim();
  if (bio) providers[index].bio = bio.trim();
  if (location) providers[index].location = location.trim();
  if (hourlyRate) providers[index].hourlyRate = Number(hourlyRate);
  if (avatar) providers[index].avatar = avatar;
  if (cover) providers[index].cover = cover;

  // Also update users collection if matched
  const users = db.getCollection('users');
  const user = users.find(u => u.id === providers[index].userId || u.name === provider.name);
  if (user && name) {
    user.name = name.trim();
    if (avatar) user.avatar = avatar;
    db.saveCollection('users', users);
  }

  db.saveCollection('providers', providers);

  res.json({
    success: true,
    message: 'Cập nhật thông tin hồ sơ Provider thành công!',
    provider: providers[index]
  });
});

// Update availability status & working hours (UC-31)
router.put('/availability', (req, res) => {
  const provider = resolveProvider(req);
  if (!provider) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ chuyên gia!' });
  }

  const { mode, schedule } = req.body; // mode: 'ready', 'limited', 'paused'
  const providers = db.getCollection('providers');
  const index = providers.findIndex(p => p.id === provider.id);

  if (mode) {
    providers[index].availabilityStatus = mode;
  }
  if (schedule) {
    providers[index].schedule = schedule;
  }

  db.saveCollection('providers', providers);

  const statusMap = {
    ready: 'Đang sẵn sàng nhận việc',
    limited: 'Nhận việc có giới hạn',
    paused: 'Đang tạm dừng / Nghỉ phép'
  };

  res.json({
    success: true,
    message: `Trạng thái nhận việc đã chuyển sang: [${statusMap[mode] || mode}].`,
    availabilityStatus: providers[index].availabilityStatus,
    schedule: providers[index].schedule
  });
});

// Update hourly rate
router.put('/hourly-rate', (req, res) => {
  const provider = resolveProvider(req);
  const { hourlyRate } = req.body;

  if (!hourlyRate || isNaN(hourlyRate)) {
    return res.status(400).json({ success: false, message: 'Vui lòng cung cấp đơn giá theo giờ hợp lệ!' });
  }

  const providers = db.getCollection('providers');
  const index = providers.findIndex(p => p.id === provider.id);

  providers[index].hourlyRate = Number(hourlyRate);
  db.saveCollection('providers', providers);

  res.json({
    success: true,
    message: `Đã cập nhật đơn giá theo giờ: ${Number(hourlyRate).toLocaleString('vi-VN')}đ / giờ.`,
    hourlyRate: providers[index].hourlyRate
  });
});

// ============================================================================
// 3. SKILLS & CERTIFICATIONS (UC-32)
// ============================================================================
router.post('/skills', (req, res) => {
  const provider = resolveProvider(req);
  const { name, level, group } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập tên kỹ năng!' });
  }

  const providers = db.getCollection('providers');
  const index = providers.findIndex(p => p.id === provider.id);

  providers[index].skills = providers[index].skills || [];
  if (!providers[index].skills.includes(name.trim())) {
    providers[index].skills.push(name.trim());
    db.saveCollection('providers', providers);
  }

  res.status(201).json({
    success: true,
    message: `Đã thêm kỹ năng [${name.trim()}] vào hồ sơ!`,
    skills: providers[index].skills
  });
});

router.delete('/skills/:skillName', (req, res) => {
  const provider = resolveProvider(req);
  const skillName = decodeURIComponent(req.params.skillName);

  const providers = db.getCollection('providers');
  const index = providers.findIndex(p => p.id === provider.id);

  providers[index].skills = (providers[index].skills || []).filter(s => s.toLowerCase() !== skillName.toLowerCase());
  db.saveCollection('providers', providers);

  res.json({
    success: true,
    message: `Đã xóa kỹ năng [${skillName}] khỏi hồ sơ.`,
    skills: providers[index].skills
  });
});

// Submit certification for Admin approval (UC-32b)
router.post('/certifications/submit', (req, res) => {
  const provider = resolveProvider(req);
  const { skillName, certTitle, issuer } = req.body;

  if (!skillName || !certTitle) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập tên kỹ năng và tên chứng chỉ!' });
  }

  const skillApprovals = db.getCollection('skillApprovals');
  const newId = `SKL${String(skillApprovals.length + 1).padStart(3, '0')}`;
  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

  const newApproval = {
    id: newId,
    providerId: provider.id,
    providerName: provider.name,
    skillName: skillName.trim(),
    certTitle: certTitle.trim(),
    issuer: issuer ? issuer.trim() : 'Tổ chức chuyên môn uy tín',
    date: dateStr,
    status: 'pending'
  };

  skillApprovals.push(newApproval);
  db.saveCollection('skillApprovals', skillApprovals);

  res.status(201).json({
    success: true,
    message: `Chứng chỉ [${certTitle}] đã được gửi lên Ban Quản Trị sàn kiểm duyệt!`,
    approval: newApproval
  });
});

// ============================================================================
// 4. PROVIDER'S SERVICES MANAGEMENT (UC-33)
// ============================================================================
router.get('/me/services', (req, res) => {
  const provider = resolveProvider(req);
  const services = db.getCollection('services').filter(s => s.providerId === provider.id || s.providerName === provider.name);
  res.json({ success: true, total: services.length, services });
});

router.post('/services', (req, res) => {
  const provider = resolveProvider(req);
  const { title, category, price, priceUnit, duration, desc, thumbnail } = req.body;

  if (!title || !price || !category) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập đầy đủ tiêu đề, danh mục và giá dịch vụ!' });
  }

  const services = db.getCollection('services');
  const newId = `SVC${String(services.length + 1).padStart(3, '0')}`;

  const newService = {
    id: newId,
    title: title.trim(),
    category,
    providerId: provider.id,
    providerName: provider.name,
    providerAvatar: provider.avatar,
    price: Number(price),
    priceUnit: priceUnit || 'Dự án',
    duration: duration || '3-5 ngày',
    rating: 5.0,
    reviewCount: 0,
    status: 'active',
    desc: desc || '',
    thumbnail: thumbnail || 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600'
  };

  services.unshift(newService);
  db.saveCollection('services', services);

  res.status(201).json({
    success: true,
    message: 'Tạo dịch vụ kỹ năng mới thành công!',
    service: newService
  });
});

router.put('/services/:id', (req, res) => {
  const provider = resolveProvider(req);
  const { title, category, price, priceUnit, duration, desc } = req.body;

  const services = db.getCollection('services');
  const service = services.find(s => s.id === req.params.id);

  if (!service) {
    return res.status(404).json({ success: false, message: 'Dịch vụ không tồn tại!' });
  }

  if (title) service.title = title.trim();
  if (category) service.category = category;
  if (price !== undefined) service.price = Number(price);
  if (priceUnit) service.priceUnit = priceUnit;
  if (duration) service.duration = duration;
  if (desc) service.desc = desc;

  db.saveCollection('services', services);

  res.json({
    success: true,
    message: 'Cập nhật dịch vụ thành công!',
    service
  });
});

// Request price adjustment for review (UC-58)
router.put('/services/:id/request-price', (req, res) => {
  const { newPrice, reason } = req.body;
  if (!newPrice || isNaN(newPrice) || !reason) {
    return res.status(400).json({ success: false, message: 'Vui lòng cung cấp mức giá mới và lý do điều chỉnh!' });
  }

  const services = db.getCollection('services');
  const service = services.find(s => s.id === req.params.id);

  if (!service) {
    return res.status(404).json({ success: false, message: 'Dịch vụ không tồn tại!' });
  }

  service.newPrice = Number(newPrice);
  service.reason = reason.trim();
  service.status = 'price_pending';

  db.saveCollection('services', services);

  res.json({
    success: true,
    message: 'Yêu cầu điều chỉnh giá đã được gửi tới Ban Quản Trị sàn phê duyệt!',
    service
  });
});

// ============================================================================
// 5. BOOKINGS & ORDER EXECUTION (UC-37, UC-38, UC-39, UC-40)
// ============================================================================
router.get('/me/orders', (req, res) => {
  const provider = resolveProvider(req);
  const { status } = req.query;
  let orders = db.getCollection('orders').filter(o => o.providerId === provider.id || o.providerName === provider.name);

  if (status && status !== 'all') {
    orders = orders.filter(o => o.orderStatus === status);
  }

  res.json({ success: true, total: orders.length, orders });
});

// Accept booking to start order (UC-38)
router.post('/orders/:id/accept', (req, res) => {
  const orders = db.getCollection('orders');
  const order = orders.find(o => o.id === req.params.id);

  if (!order) {
    return res.status(404).json({ success: false, message: 'Đơn hàng không tồn tại!' });
  }

  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  order.orderStatus = 'processing';
  if (order.milestones && order.milestones[1]) {
    order.milestones[1].done = true;
    order.milestones[1].time = dateStr;
  }

  db.saveCollection('orders', orders);

  res.json({
    success: true,
    message: `Đã xác nhận lịch hẹn! Đơn hàng #${order.id} đang bắt đầu triển khai.`,
    order
  });
});

// Update progress percent and milestones (UC-39)
router.post('/orders/:id/progress', (req, res) => {
  const { progressPercent, completedTasks, notes } = req.body;
  const orders = db.getCollection('orders');
  const order = orders.find(o => o.id === req.params.id);

  if (!order) {
    return res.status(404).json({ success: false, message: 'Đơn hàng không tồn tại!' });
  }

  order.progressPercent = progressPercent !== undefined ? Number(progressPercent) : 65;
  if (Array.isArray(completedTasks)) {
    order.completedTasks = completedTasks;
  }
  if (notes) {
    order.latestProgressNote = notes;
  }

  db.saveCollection('orders', orders);

  res.json({
    success: true,
    message: `Đã cập nhật tiến độ đơn hàng: ${order.progressPercent}%.`,
    order
  });
});

// Complete & deliver job for inspection (UC-40)
router.post('/orders/:id/deliver', (req, res) => {
  const { handoverNotes, attachments } = req.body;
  const orders = db.getCollection('orders');
  const order = orders.find(o => o.id === req.params.id);

  if (!order) {
    return res.status(404).json({ success: false, message: 'Đơn hàng không tồn tại!' });
  }

  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  order.orderStatus = 'delivered';
  order.progressPercent = 100;
  order.deliveredAt = dateStr;
  order.handoverNotes = handoverNotes || 'Đã hoàn tất bàn giao toàn bộ sản phẩm và tài liệu.';
  if (Array.isArray(attachments)) {
    order.attachments = attachments;
  }

  if (order.milestones && order.milestones[2]) {
    order.milestones[2].done = true;
    order.milestones[2].time = dateStr;
  }

  db.saveCollection('orders', orders);

  res.json({
    success: true,
    message: 'Đã gửi tài liệu bàn giao và yêu cầu nghiệm thu giải ngân Escrow thành công!',
    order
  });
});

// ============================================================================
// 6. WALLET, PAYOUTS & BANK ACCOUNT (UC-42, UC-43)
// ============================================================================
router.get('/me/wallet', (req, res) => {
  const provider = resolveProvider(req);
  const users = db.getCollection('users');
  const user = users.find(u => u.id === provider.userId || u.name === provider.name);
  const balance = user ? user.balance : 25000000;

  const payouts = db.getCollection('payouts').filter(p => p.providerId === provider.id || p.provider === provider.name);
  const orders = db.getCollection('orders').filter(o => o.providerId === provider.id || o.providerName === provider.name);

  let escrowHeldAmount = 0;
  orders.forEach(o => {
    if (o.orderStatus === 'processing' || o.orderStatus === 'delivered') {
      escrowHeldAmount += (Number(o.price) || 0);
    }
  });

  res.json({
    success: true,
    wallet: {
      balance,
      balanceFormatted: balance.toLocaleString('vi-VN') + ' VNĐ',
      escrowHeldAmount,
      escrowHeldFormatted: escrowHeldAmount.toLocaleString('vi-VN') + 'đ',
      cumulativeEarnings: provider.spentOrEarned || '142.000.000đ',
      bankAccount: provider.bankAccount || { bank: 'MB Bank', account: '0987.654.321', holder: 'NGUYEN VAN PRO' },
      payoutHistory: payouts
    }
  });
});

router.put('/me/bank-account', (req, res) => {
  const provider = resolveProvider(req);
  const { bank, account, holder } = req.body;

  if (!bank || !account || !holder) {
    return res.status(400).json({ success: false, message: 'Vui lòng cung cấp đầy đủ tên ngân hàng, số tài khoản và tên chủ thẻ!' });
  }

  const providers = db.getCollection('providers');
  const index = providers.findIndex(p => p.id === provider.id);

  providers[index].bankAccount = {
    bank: bank.trim(),
    account: account.trim(),
    holder: holder.trim().toUpperCase()
  };

  db.saveCollection('providers', providers);

  res.json({
    success: true,
    message: 'Cập nhật tài khoản ngân hàng thành công!',
    bankAccount: providers[index].bankAccount
  });
});

router.post('/wallet/withdraw', (req, res) => {
  const provider = resolveProvider(req);
  const { amount, password } = req.body;
  const num = Number(amount);

  if (!num || num <= 0) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập số tiền hợp lệ cần rút!' });
  }

  const users = db.getCollection('users');
  const user = users.find(u => u.id === provider.userId || u.name === provider.name);

  if (!user || user.balance < num) {
    return res.status(400).json({ success: false, message: 'Số dư khả dụng không đủ để thực hiện rút tiền!' });
  }

  // Deduct balance
  user.balance -= num;
  db.saveCollection('users', users);

  // Create payout record
  const payouts = db.getCollection('payouts');
  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const newId = `WD-${Math.floor(1000 + Math.random() * 9000)}`;

  const bankAcc = provider.bankAccount || { bank: 'MB Bank', account: '0987.654.321' };

  const newPayout = {
    id: newId,
    providerId: provider.id,
    provider: provider.name,
    bank: bankAcc.bank,
    account: bankAcc.account,
    amount: num.toLocaleString('vi-VN') + 'đ',
    amountNum: num,
    date: dateStr,
    status: 'pending'
  };

  payouts.unshift(newPayout);
  db.saveCollection('payouts', payouts);

  res.status(201).json({
    success: true,
    message: `Đã gửi yêu cầu rút ${newPayout.amount} về tài khoản ngân hàng thành công! Sàn sẽ xử lý trong vòng 5-15 phút.`,
    payout: newPayout,
    newBalance: user.balance
  });
});

// ============================================================================
// 7. REVIEWS & CUSTOMER FEEDBACK (UC-44)
// ============================================================================
router.get('/me/reviews', (req, res) => {
  const provider = resolveProvider(req);
  const reviews = db.getCollection('reviews').filter(r => r.providerId === provider.id || r.providerName === provider.name);
  res.json({ success: true, total: reviews.length, reviews });
});

router.post('/reviews/:id/reply', (req, res) => {
  const { reply } = req.body;
  if (!reply || !reply.trim()) {
    return res.status(400).json({ success: false, message: 'Nội dung phản hồi không được để trống!' });
  }

  const reviews = db.getCollection('reviews');
  const review = reviews.find(r => r.id === req.params.id);

  if (!review) {
    return res.status(404).json({ success: false, message: 'Đánh giá không tồn tại!' });
  }

  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

  review.reply = {
    content: reply.trim(),
    date: dateStr
  };

  db.saveCollection('reviews', reviews);

  res.json({
    success: true,
    message: 'Đã gửi phản hồi đánh giá của khách hàng thành công!',
    review
  });
});

// ============================================================================
// 8. DISPUTES & COMPLAINT DEFENSE (UC-45)
// ============================================================================
router.get('/me/complaints', (req, res) => {
  const provider = resolveProvider(req);
  const complaints = db.getCollection('complaints').filter(c =>
    c.defendantId === provider.id ||
    (c.defendant && c.defendant.includes(provider.name))
  );
  res.json({ success: true, total: complaints.length, complaints });
});

router.post('/complaints/:id/defense', (req, res) => {
  const { providerClaim } = req.body;
  if (!providerClaim || !providerClaim.trim()) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập nội dung giải trình chi tiết!' });
  }

  const complaints = db.getCollection('complaints');
  const complaint = complaints.find(c => c.id === req.params.id);

  if (!complaint) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ khiếu nại!' });
  }

  complaint.providerClaim = providerClaim.trim();
  complaint.providerClaimAt = new Date().toLocaleString('vi-VN');
  db.saveCollection('complaints', complaints);

  res.json({
    success: true,
    message: 'Đã gửi bản giải trình của Provider tới Ban Quản Trị sàn thành công!',
    complaint
  });
});

// ============================================================================
// 9. PACKAGES & UPGRADES (UC-46)
// ============================================================================
router.get('/packages', (req, res) => {
  const packages = db.getCollection('packages');
  res.json({ success: true, packages });
});

router.post('/packages/purchase', (req, res) => {
  const provider = resolveProvider(req);
  const { packageId } = req.body;

  const packages = db.getCollection('packages');
  const pkg = packages.find(p => p.id === packageId);

  if (!pkg) {
    return res.status(404).json({ success: false, message: 'Gói dịch vụ không tồn tại!' });
  }

  const users = db.getCollection('users');
  const user = users.find(u => u.id === provider.userId || u.name === provider.name);

  if (pkg.price > 0 && user && user.balance < pkg.price) {
    return res.status(400).json({ success: false, message: `Số dư ví không đủ ${pkg.price.toLocaleString('vi-VN')}đ để mua gói!` });
  }

  if (pkg.price > 0 && user) {
    user.balance -= pkg.price;
    db.saveCollection('users', users);
  }

  // Create package purchase record
  const purchases = db.getCollection('packagePurchases');
  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  const expireDate = new Date();
  expireDate.setDate(expireDate.getDate() + (pkg.duration || 30));
  const expireStr = `${String(expireDate.getDate()).padStart(2, '0')}/${String(expireDate.getMonth() + 1).padStart(2, '0')}/${expireDate.getFullYear()}`;

  const newPurchase = {
    id: `PKG-ORD-${Math.floor(10 + Math.random() * 90)}`,
    providerId: provider.id,
    provider: provider.name,
    packageName: pkg.name,
    amount: pkg.price.toLocaleString('vi-VN') + 'đ',
    activeDate: dateStr,
    expireDate: expireStr,
    status: 'Đang hoạt động'
  };

  purchases.unshift(newPurchase);
  db.saveCollection('packagePurchases', purchases);

  // Update provider badge
  const providers = db.getCollection('providers');
  const provIndex = providers.findIndex(p => p.id === provider.id);
  if (provIndex !== -1) {
    providers[provIndex].badge = pkg.id === 'PKG_VIP' ? 'VIP ELITE' : 'PRO PROVIDER';
    db.saveCollection('providers', providers);
  }

  res.status(201).json({
    success: true,
    message: `Đăng ký thành công [${pkg.name}]! Quyền lợi có hiệu lực đến ngày ${expireStr}.`,
    purchase: newPurchase
  });
});

// ============================================================================
// 10. POSTS & SHOWCASE PORTFOLIO (UC-47)
// ============================================================================
router.get('/me/posts', (req, res) => {
  const provider = resolveProvider(req);
  const posts = db.getCollection('posts').filter(p => p.providerId === provider.id || p.providerName === provider.name);
  res.json({ success: true, total: posts.length, posts });
});

router.post('/posts', (req, res) => {
  const provider = resolveProvider(req);
  const { title, category, summary, image, content } = req.body;

  if (!title || !category || !summary) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập đầy đủ tiêu đề, danh mục và tóm tắt bài viết!' });
  }

  const posts = db.getCollection('posts');
  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  const newId = `POST${String(posts.length + 1).padStart(3, '0')}`;

  const newPost = {
    id: newId,
    providerId: provider.id,
    providerName: provider.name,
    title: title.trim(),
    category,
    date: dateStr,
    readTime: '5 phút đọc',
    likes: 0,
    summary: summary.trim(),
    image: image || 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600',
    content: content || ''
  };

  posts.unshift(newPost);
  db.saveCollection('posts', posts);

  res.status(201).json({
    success: true,
    message: 'Đăng bài viết Showcase Portfolio thành công!',
    post: newPost
  });
});

// Single provider detail with their services & reviews (Must be at the end so it doesn't shadow /me or /dashboard)
router.get('/:id', (req, res) => {
  const providers = db.getCollection('providers');
  const provider = providers.find(p => p.id === req.params.id);

  if (!provider) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ chuyên gia!' });
  }

  const services = db.getCollection('services').filter(s => s.providerId === provider.id);
  const reviews = db.getCollection('reviews').filter(r => r.providerId === provider.id);

  res.json({
    success: true,
    provider,
    services,
    reviews
  });
});

module.exports = router;
