const express = require('express');
const router = express.Router();
const db = require('../data/db');
const { processReleaseEscrow, processForceRefund } = require('../services/orderService');

// ============================================================================
// 1. DASHBOARD & SYSTEM OVERVIEW (UC-51)
// ============================================================================
router.get('/dashboard', (req, res) => {
  const users = db.getCollection('users');
  const providers = db.getCollection('providers');
  const services = db.getCollection('services');
  const orders = db.getCollection('orders');
  const complaints = db.getCollection('complaints');
  const pendingProviders = db.getCollection('pendingProviders');
  const skillApprovals = db.getCollection('skillApprovals');
  const payouts = db.getCollection('payouts');
  const unlockRequests = db.getCollection('unlockRequests');

  // Calculate Escrow held and platform revenue
  let escrowHeld = 0;
  let totalRevenue = 0;
  let totalVolume = 0;

  orders.forEach(o => {
    const price = Number(o.price) || 0;
    const fee = Number(o.platformFee) || Math.round(price * 0.05);
    totalVolume += price;
    if (o.escrowStatus === 'escrow_held' || o.escrowStatus === 'Đã giữ ký quỹ') {
      escrowHeld += (Number(o.escrowDeposit) || (price + fee));
    }
    if (o.escrowStatus === 'completed' || o.orderStatus === 'completed' || o.escrowStatus === 'Đã giải ngân') {
      totalRevenue += fee;
    }
  });

  const pendingSvcCount = services.filter(s => s.status === 'pending' || s.status === 'price_pending').length;
  const pendingProvCount = pendingProviders.filter(p => p.status === 'pending').length;
  const pendingSkillCount = skillApprovals.filter(s => s.status === 'pending').length;
  const pendingCompCount = complaints.filter(c => c.status === 'pending').length;
  const pendingPayoutCount = payouts.filter(p => p.status === 'pending').length;
  const pendingUnlockCount = unlockRequests.filter(u => u.status === 'pending').length;

  res.json({
    success: true,
    data: {
      stats: {
        totalUsers: users.length,
        totalProviders: providers.length,
        activeOrders: orders.filter(o => o.orderStatus === 'processing' || o.orderStatus === 'confirmed').length,
        completedOrders: orders.filter(o => o.orderStatus === 'completed').length,
        escrowHeld,
        escrowHeldFormatted: escrowHeld.toLocaleString('vi-VN') + 'đ',
        totalRevenue,
        totalRevenueFormatted: totalRevenue.toLocaleString('vi-VN') + 'đ',
        totalVolume,
        totalVolumeFormatted: totalVolume.toLocaleString('vi-VN') + 'đ'
      },
      badges: {
        pendingProviders: pendingProvCount,
        pendingSkills: pendingSkillCount,
        pendingServices: pendingSvcCount,
        pendingComplaints: pendingCompCount,
        pendingPayouts: pendingPayoutCount,
        pendingUnlockRequests: pendingUnlockCount
      },
      recentOrders: orders.slice(0, 5),
      recentComplaints: complaints.slice(0, 5),
      recentPendingProviders: pendingProviders.filter(p => p.status === 'pending').slice(0, 5)
    }
  });
});

// ============================================================================
// 2. FULL STATE SYNC (For common.js / getAppState / saveAppState)
// ============================================================================
router.get('/state', (req, res) => {
  const users = db.getCollection('users');
  const pendingProviders = db.getCollection('pendingProviders');
  const skillApprovals = db.getCollection('skillApprovals');
  const services = db.getCollection('services');
  const orders = db.getCollection('orders');
  const reviews = db.getCollection('reviews');
  const complaints = db.getCollection('complaints');
  const reports = db.getCollection('reports');
  const payouts = db.getCollection('payouts');
  const packages = db.getCollection('packages');
  const packagePurchases = db.getCollection('packagePurchases');
  const unlockRequests = db.getCollection('unlockRequests');

  res.json({
    success: true,
    state: {
      users,
      pendingProviders,
      skillApprovals,
      services,
      orders,
      reviews,
      complaints,
      reports,
      payouts,
      packages,
      packagePurchases,
      unlockRequests
    }
  });
});

router.post('/state', (req, res) => {
  const clientState = req.body;
  if (!clientState || typeof clientState !== 'object') {
    return res.status(400).json({ success: false, message: 'Dữ liệu state không hợp lệ!' });
  }

  // Update collections passed
  const allowedKeys = [
    'users', 'pendingProviders', 'skillApprovals', 'services', 'orders',
    'reviews', 'complaints', 'reports', 'payouts', 'packages', 'packagePurchases', 'unlockRequests'
  ];

  for (const key of allowedKeys) {
    if (Array.isArray(clientState[key])) {
      db.saveCollection(key, clientState[key]);
    }
  }

  res.json({ success: true, message: 'Đồng bộ dữ liệu Admin với Server thành công!' });
});

// ============================================================================
// 3. USER MANAGEMENT (UC-52, UC-53, UC-53b)
// ============================================================================
router.get('/users', (req, res) => {
  const { role, status, q } = req.query;
  let users = db.getCollection('users');

  if (role && role !== 'all') {
    users = users.filter(u => u.role.toLowerCase() === role.toLowerCase());
  }
  if (status && status !== 'all') {
    users = users.filter(u => u.status === status);
  }
  if (q) {
    const keyword = q.toLowerCase().trim();
    users = users.filter(u =>
      (u.name && u.name.toLowerCase().includes(keyword)) ||
      (u.email && u.email.toLowerCase().includes(keyword)) ||
      (u.phone && u.phone.includes(keyword)) ||
      (u.id && u.id.toLowerCase().includes(keyword))
    );
  }

  res.json({ success: true, total: users.length, users });
});

// Lock user account (UC-53)
router.post('/users/:id/lock', (req, res) => {
  const { reason, duration } = req.body;
  if (!reason || !reason.trim()) {
    return res.status(400).json({ success: false, message: 'Vui lòng cung cấp lý do khóa tài khoản!' });
  }

  const users = db.getCollection('users');
  const user = users.find(u => u.id === req.params.id);

  if (!user) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng!' });
  }

  const durationText = duration === 'permanent' ? 'Vĩnh viễn' : (duration ? `${duration} ngày` : '7 ngày');
  user.status = 'locked';
  user.lockReason = reason.trim();
  user.lockDuration = durationText;

  db.saveCollection('users', users);

  res.json({
    success: true,
    message: `Đã khóa tài khoản ${user.name} (${durationText}).`,
    user
  });
});

// Unlock user account
router.post('/users/:id/unlock', (req, res) => {
  const users = db.getCollection('users');
  const user = users.find(u => u.id === req.params.id);

  if (!user) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng!' });
  }

  user.status = 'active';
  user.lockReason = '';
  user.lockDuration = '';

  db.saveCollection('users', users);

  res.json({
    success: true,
    message: `Đã mở khóa tài khoản ${user.name} thành công.`,
    user
  });
});

// Unlock Requests / Appeals (UC-53b)
router.get('/unlock-requests', (req, res) => {
  const requests = db.getCollection('unlockRequests');
  res.json({ success: true, total: requests.length, requests });
});

router.post('/unlock-requests/:id/decide', (req, res) => {
  const { decision } = req.body; // 'approve', 'probation', 'reject', 'reject_perm'
  const requests = db.getCollection('unlockRequests');
  const reqIndex = requests.findIndex(r => r.id === req.params.id || r.userId === req.params.id);

  if (reqIndex === -1) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy đơn khiếu nại mở khóa!' });
  }

  const request = requests[reqIndex];
  const users = db.getCollection('users');
  const user = users.find(u => u.id === request.id || u.id === request.userId);

  let message = '';
  if (decision === 'approve') {
    if (user) {
      user.status = 'active';
      user.lockReason = '';
      user.lockDuration = '';
    }
    message = `Tài khoản ${request.name} đã được phục hồi quyền truy cập thành công.`;
    requests.splice(reqIndex, 1);
  } else if (decision === 'probation') {
    if (user) {
      user.status = 'active';
      user.lockReason = 'Đang theo dõi thử thách 30 ngày';
      user.lockDuration = '30 ngày thử thách';
    }
    message = `Tài khoản ${request.name} được chuyển sang chế độ theo dõi thử thách 30 ngày.`;
    requests.splice(reqIndex, 1);
  } else if (decision === 'reject_perm') {
    if (user) {
      user.status = 'locked';
      user.lockDuration = 'Vĩnh viễn';
    }
    message = `Đã giữ nguyên án khóa vĩnh viễn với tài khoản ${request.name}.`;
    requests.splice(reqIndex, 1);
  } else {
    message = `Đã từ chối đơn mở khóa của ${request.name}.`;
    requests.splice(reqIndex, 1);
  }

  db.saveCollection('users', users);
  db.saveCollection('unlockRequests', requests);

  res.json({ success: true, message });
});

// ============================================================================
// 4. PROVIDER & SKILL APPROVALS (UC-54, UC-55, UC-56)
// ============================================================================
router.get('/providers/pending', (req, res) => {
  const pending = db.getCollection('pendingProviders');
  res.json({ success: true, total: pending.length, pendingProviders: pending });
});

router.post('/providers/:id/approve', (req, res) => {
  const pending = db.getCollection('pendingProviders');
  const item = pending.find(p => p.id === req.params.id);

  if (!item) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ đăng ký Provider!' });
  }

  item.status = 'approved';
  db.saveCollection('pendingProviders', pending);

  // Upgrade or add to providers collection
  const providers = db.getCollection('providers');
  let provider = providers.find(p => p.name === item.name || (p.userId && p.userId === item.userId));

  if (!provider) {
    const newId = `PRV${String(providers.length + 1).padStart(3, '0')}`;
    provider = {
      id: newId,
      userId: item.userId || `USR_P_${Date.now()}`,
      name: item.name,
      specialty: item.specialty,
      category: 'IT',
      rating: 5.0,
      reviewCount: 0,
      hourlyRate: 300000,
      completedOrders: 0,
      location: 'Việt Nam',
      verified: true,
      badge: 'VERIFIED PROVIDER',
      bio: item.bio || '',
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200',
      cover: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=800',
      skills: item.specialty ? item.specialty.split(/[,/]/).map(s => s.trim()) : ['Chuyên môn'],
      certifications: item.cert ? item.cert.split(/[,]/).map(c => c.trim()) : [],
      packages: [],
      availabilityStatus: 'ready'
    };
    providers.push(provider);
    db.saveCollection('providers', providers);
  } else {
    provider.verified = true;
    db.saveCollection('providers', providers);
  }

  // Update user role if user exists
  const users = db.getCollection('users');
  const user = users.find(u => u.email === item.email || u.id === item.userId);
  if (user) {
    user.role = 'Provider';
    db.saveCollection('users', users);
  }

  res.json({
    success: true,
    message: `Đã phê duyệt hồ sơ Provider thành công cho [${item.name}].`,
    provider
  });
});

router.post('/providers/:id/reject', (req, res) => {
  const { reason } = req.body;
  const pending = db.getCollection('pendingProviders');
  const item = pending.find(p => p.id === req.params.id);

  if (!item) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ đăng ký Provider!' });
  }

  item.status = 'rejected';
  item.rejectReason = reason || 'Thông tin chưa đầy đủ hoặc không hợp lệ';
  db.saveCollection('pendingProviders', pending);

  res.json({
    success: true,
    message: `Đã từ chối hồ sơ Provider của [${item.name}].`
  });
});

// Skills & Certifications Approvals (UC-56)
router.get('/skills/pending', (req, res) => {
  const skills = db.getCollection('skillApprovals');
  res.json({ success: true, total: skills.length, skillApprovals: skills });
});

router.post('/skills/:id/approve', (req, res) => {
  const skills = db.getCollection('skillApprovals');
  const item = skills.find(s => s.id === req.params.id);

  if (!item) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy yêu cầu duyệt kỹ năng!' });
  }

  item.status = 'approved';
  db.saveCollection('skillApprovals', skills);

  // Add verified skill/cert to provider
  const providers = db.getCollection('providers');
  const provider = providers.find(p => p.id === item.providerId || p.name === item.providerName);
  if (provider) {
    if (item.skillName && !provider.skills.includes(item.skillName)) {
      provider.skills.push(item.skillName);
    }
    if (item.certTitle && !provider.certifications.includes(item.certTitle)) {
      provider.certifications.push(item.certTitle);
    }
    db.saveCollection('providers', providers);
  }

  res.json({
    success: true,
    message: `Đã xác thực và phê duyệt kỹ năng [${item.skillName}] cho chuyên gia [${item.providerName}].`
  });
});

router.post('/skills/:id/reject', (req, res) => {
  const { reason } = req.body;
  const skills = db.getCollection('skillApprovals');
  const item = skills.find(s => s.id === req.params.id);

  if (!item) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy yêu cầu duyệt kỹ năng!' });
  }

  item.status = 'rejected';
  item.rejectReason = reason || 'Chứng chỉ không đủ điều kiện xác thực';
  db.saveCollection('skillApprovals', skills);

  res.json({
    success: true,
    message: `Đã từ chối chứng chỉ [${item.certTitle}] của [${item.providerName}].`
  });
});

// ============================================================================
// 5. SERVICE MODERATION & PRICE APPROVALS (UC-57, UC-58, UC-59)
// ============================================================================
router.get('/services', (req, res) => {
  const { status, category, q } = req.query;
  let services = db.getCollection('services');

  if (status && status !== 'all') {
    services = services.filter(s => s.status === status);
  }
  if (category && category !== 'all') {
    services = services.filter(s => s.category.toLowerCase() === category.toLowerCase());
  }
  if (q) {
    const keyword = q.toLowerCase().trim();
    services = services.filter(s =>
      s.title.toLowerCase().includes(keyword) ||
      s.providerName.toLowerCase().includes(keyword) ||
      s.id.toLowerCase().includes(keyword)
    );
  }

  res.json({ success: true, total: services.length, services });
});

router.post('/services/:id/approve', (req, res) => {
  const services = db.getCollection('services');
  const service = services.find(s => s.id === req.params.id);

  if (!service) {
    return res.status(404).json({ success: false, message: 'Dịch vụ không tồn tại!' });
  }

  service.status = 'active';
  db.saveCollection('services', services);

  res.json({
    success: true,
    message: `Dịch vụ [${service.title}] đã được phê duyệt và niêm yết công khai!`,
    service
  });
});

router.post('/services/:id/approve-price', (req, res) => {
  const services = db.getCollection('services');
  const service = services.find(s => s.id === req.params.id);

  if (!service) {
    return res.status(404).json({ success: false, message: 'Dịch vụ không tồn tại!' });
  }

  if (service.newPrice) {
    service.price = Number(service.newPrice);
    delete service.newPrice;
    delete service.reason;
  }
  service.status = 'active';
  db.saveCollection('services', services);

  res.json({
    success: true,
    message: `Đã phê duyệt điều chỉnh giá cho dịch vụ [${service.title}]. Đơn giá mới: ${Number(service.price).toLocaleString('vi-VN')}đ.`,
    service
  });
});

router.post('/services/:id/lock', (req, res) => {
  const { reason } = req.body;
  if (!reason || !reason.trim()) {
    return res.status(400).json({ success: false, message: 'Vui lòng cung cấp lý do tạm ngưng dịch vụ!' });
  }

  const services = db.getCollection('services');
  const service = services.find(s => s.id === req.params.id);

  if (!service) {
    return res.status(404).json({ success: false, message: 'Dịch vụ không tồn tại!' });
  }

  service.status = 'locked';
  service.lockReason = reason.trim();
  db.saveCollection('services', services);

  res.json({
    success: true,
    message: `Dịch vụ [${service.title}] đã bị tạm ngưng hiển thị do vi phạm: ${reason.trim()}.`,
    service
  });
});

router.post('/services/:id/unlock', (req, res) => {
  const services = db.getCollection('services');
  const service = services.find(s => s.id === req.params.id);

  if (!service) {
    return res.status(404).json({ success: false, message: 'Dịch vụ không tồn tại!' });
  }

  service.status = 'active';
  service.lockReason = '';
  db.saveCollection('services', services);

  res.json({
    success: true,
    message: `Dịch vụ [${service.title}] đã được mở khóa hiển thị bình thường.`,
    service
  });
});

// ============================================================================
// 6. ORDERS & ESCROW INTERVENTION (UC-60, UC-61)
// ============================================================================
router.get('/orders', (req, res) => {
  const { status, escrowStatus } = req.query;
  let orders = db.getCollection('orders');

  if (status && status !== 'all') {
    orders = orders.filter(o => o.orderStatus === status);
  }
  if (escrowStatus && escrowStatus !== 'all') {
    orders = orders.filter(o => o.escrowStatus === escrowStatus);
  }

  res.json({ success: true, total: orders.length, orders });
});

router.post('/orders/:id/force-release', (req, res) => {
  try {
    const order = processReleaseEscrow(req.params.id, { force: true });
    res.json({
      success: true,
      message: `Admin đã can thiệp giải ngân số tiền ${order.priceFormatted || order.price} cho Provider!`,
      order
    });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, message: err.message });
  }
});

router.post('/orders/:id/force-refund', (req, res) => {
  try {
    const order = processForceRefund(req.params.id);
    res.json({ success: true, message: 'Admin đã hoàn trả 100% tiền ký quỹ Escrow cho khách hàng!', order });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, message: err.message });
  }
});

// ============================================================================
// 7. REVIEW MODERATION (UC-62, UC-63)
// ============================================================================
router.get('/reviews', (req, res) => {
  const reviews = db.getCollection('reviews');
  res.json({ success: true, total: reviews.length, reviews });
});

router.post('/reviews/:id/status', (req, res) => {
  const { status, note } = req.body; // 'published' or 'hidden'
  const reviews = db.getCollection('reviews');
  const review = reviews.find(r => r.id === req.params.id);

  if (!review) {
    return res.status(404).json({ success: false, message: 'Đánh giá không tồn tại!' });
  }

  review.status = status || 'hidden';
  if (note) review.note = note;
  db.saveCollection('reviews', reviews);

  res.json({
    success: true,
    message: status === 'hidden' ? 'Đã ẩn đánh giá vi phạm khỏi hệ thống!' : 'Đã công khai lại đánh giá!',
    review
  });
});

// ============================================================================
// 7B. COMMENT MODERATION
// ============================================================================
router.get('/comments', (req, res) => {
  const comments = db.getCollection('comments') || [];
  res.json({ success: true, total: comments.length, comments });
});

router.post('/comments/:id/status', (req, res) => {
  const { status, note } = req.body;
  const comments = db.getCollection('comments') || [];
  const comment = comments.find(c => c.id === req.params.id);

  if (!comment) {
    return res.status(404).json({ success: false, message: 'Bình luận không tồn tại!' });
  }

  comment.status = status || 'hidden';
  if (note) comment.note = note;
  db.saveCollection('comments', comments);

  res.json({
    success: true,
    message: status === 'hidden' ? 'Đã ẩn bình luận vi phạm!' : 'Đã công khai lại bình luận!',
    comment
  });
});

// ============================================================================
// 8. DISPUTES & COMPLAINTS RESOLUTION (UC-64, UC-65)
// ============================================================================
router.get('/complaints', (req, res) => {
  const complaints = db.getCollection('complaints');
  res.json({ success: true, total: complaints.length, complaints });
});

router.post('/complaints/:id/resolve', (req, res) => {
  const { resolution, refundPercentage = 100, note } = req.body;
  const complaints = db.getCollection('complaints');
  const complaint = complaints.find(c => c.id === req.params.id);

  if (!complaint) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ khiếu nại!' });
  }

  complaint.status = 'resolved';
  complaint.resolution = resolution;
  complaint.resolutionNote = note || '';

  const orders = db.getCollection('orders');
  const order = orders.find(o => o.id === complaint.orderId);
  const users = db.getCollection('users');

  if (order) {
    const totalDeposit = Number(order.escrowDeposit) || Number(order.price) || 0;
    const priceNum = Number(order.price) || 0;

    if (resolution === 'refund_customer') {
      order.escrowStatus = 'refunded';
      order.orderStatus = 'cancelled';
      // Refund customer
      const cust = users.find(u => u.id === order.customerId || u.name === order.customerName);
      if (cust) cust.balance = (cust.balance || 0) + totalDeposit;
    } else if (resolution === 'pay_provider') {
      order.escrowStatus = 'completed';
      order.orderStatus = 'completed';
      // Pay provider
      const prov = users.find(u => u.id === order.providerId || u.name === order.providerName);
      if (prov) prov.balance = (prov.balance || 0) + priceNum;
    } else if (resolution === 'partial_refund') {
      const pct = Math.max(0, Math.min(100, Number(refundPercentage)));
      const refundAmt = Math.round(priceNum * (pct / 100));
      const payAmt = priceNum - refundAmt;

      order.escrowStatus = 'partial_refunded';
      order.orderStatus = 'completed';

      const cust = users.find(u => u.id === order.customerId || u.name === order.customerName);
      if (cust) cust.balance = (cust.balance || 0) + refundAmt;

      const prov = users.find(u => u.id === order.providerId || u.name === order.providerName);
      if (prov) prov.balance = (prov.balance || 0) + payAmt;
    }

    db.saveCollection('orders', orders);
    db.saveCollection('users', users);
  }

  db.saveCollection('complaints', complaints);

  res.json({
    success: true,
    message: 'Phán quyết tranh chấp đã được thực thi và tiền ký quỹ Escrow đã được xử lý thỏa đáng!',
    complaint
  });
});

// ============================================================================
// 9. VIOLATION REPORTS (UC-66)
// ============================================================================
router.get('/reports', (req, res) => {
  const reports = db.getCollection('reports');
  res.json({ success: true, total: reports.length, reports });
});

router.post('/reports/:id/resolve', (req, res) => {
  const { action, note } = req.body;
  const reports = db.getCollection('reports');
  const report = reports.find(r => r.id === req.params.id);

  if (!report) {
    return res.status(404).json({ success: false, message: 'Báo cáo vi phạm không tồn tại!' });
  }

  report.status = 'resolved';
  report.resolutionAction = action || 'dismiss';
  report.resolutionNote = note || '';

  db.saveCollection('reports', reports);

  res.json({
    success: true,
    message: 'Đã xử lý báo cáo vi phạm thành công!',
    report
  });
});

// ============================================================================
// 10. CASH FLOW & PAYOUT REQUESTS (UC-69)
// ============================================================================
router.get('/payouts', (req, res) => {
  const payouts = db.getCollection('payouts');
  res.json({ success: true, total: payouts.length, payouts });
});

router.post('/payouts/:id/approve', (req, res) => {
  const payouts = db.getCollection('payouts');
  const payout = payouts.find(p => p.id === req.params.id);

  if (!payout) {
    return res.status(404).json({ success: false, message: 'Yêu cầu rút tiền không tồn tại!' });
  }

  payout.status = 'paid';
  payout.paidAt = new Date().toLocaleString('vi-VN');
  db.saveCollection('payouts', payouts);

  res.json({
    success: true,
    message: `Đã phê duyệt lệnh rút tiền ${payout.amount} của [${payout.provider}] thành công!`,
    payout
  });
});

router.post('/payouts/:id/reject', (req, res) => {
  const { reason } = req.body;
  const payouts = db.getCollection('payouts');
  const payout = payouts.find(p => p.id === req.params.id);

  if (!payout) {
    return res.status(404).json({ success: false, message: 'Yêu cầu rút tiền không tồn tại!' });
  }

  payout.status = 'rejected';
  payout.rejectReason = reason || 'Thông tin số tài khoản hoặc ngân hàng không khớp';

  // Refund back to provider balance
  const users = db.getCollection('users');
  const user = users.find(u => u.name === payout.provider || u.id === payout.providerId);
  if (user) {
    const amt = Number(payout.amountNum) || Number(String(payout.amount).replace(/[^0-9]/g, '')) || 0;
    user.balance = (user.balance || 0) + amt;
    db.saveCollection('users', users);
  }

  db.saveCollection('payouts', payouts);

  res.json({
    success: true,
    message: `Đã từ chối lệnh rút tiền của [${payout.provider}]. Tiền đã hoàn lại ví chuyên gia.`,
    payout
  });
});

// ============================================================================
// 11. PACKAGES CONFIGURATION (UC-70)
// ============================================================================
router.get('/packages', (req, res) => {
  const packages = db.getCollection('packages');
  const purchases = db.getCollection('packagePurchases');
  res.json({ success: true, packages, purchases });
});

router.put('/packages/:id', (req, res) => {
  const { name, price, duration, postsCount, features } = req.body;
  const packages = db.getCollection('packages');
  const pkg = packages.find(p => p.id === req.params.id);

  if (!pkg) {
    return res.status(404).json({ success: false, message: 'Gói dịch vụ không tồn tại!' });
  }

  if (name) pkg.name = name;
  if (price !== undefined) pkg.price = Number(price);
  if (duration !== undefined) pkg.duration = Number(duration);
  if (postsCount !== undefined) pkg.postsCount = Number(postsCount);
  if (Array.isArray(features)) pkg.features = features;

  db.saveCollection('packages', packages);

  res.json({
    success: true,
    message: `Cập nhật cấu hình gói [${pkg.name}] thành công!`,
    package: pkg
  });
});

// ============================================================================
// 12. SYSTEM STATISTICS (UC-68)
// ============================================================================
router.get('/statistics', (req, res) => {
  const users = db.getCollection('users') || [];
  const providers = db.getCollection('providers') || [];
  const services = db.getCollection('services') || [];
  const orders = db.getCollection('orders') || [];

  const categories = {
    IT: services.filter(s => s.category === 'IT').length,
    Design: services.filter(s => s.category === 'Design').length,
    Tutor: services.filter(s => s.category === 'Tutor').length,
    Home: services.filter(s => s.category === 'Home').length,
    Repair: services.filter(s => s.category === 'Repair').length
  };

  const { startDate, endDate } = req.query;
  let filteredOrders = orders;
  if (startDate && endDate) {
    // 'YYYY-MM-DD' phải đọc theo giờ địa phương: new Date('2025-04-20') là 00:00 UTC (= 07:00 ở VN)
    // nên đơn lúc 00:00 giờ VN của ngày đầu sẽ bị loại nhầm.
    const toLocalDate = (s) => {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
      return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(s);
    };
    const start = toLocalDate(startDate);
    const end = toLocalDate(endDate);
    end.setHours(23, 59, 59, 999);
    filteredOrders = orders.filter(o => {
      // Parse order date (DD/MM/YYYY HH:mm or ISO)
      let dStr = o.date || o.createdAt;
      let d;
      if (dStr && dStr.includes('/')) {
        const parts = dStr.split(' ')[0].split('/');
        d = new Date(parts[2], parts[1] - 1, parts[0]);
      } else {
        d = new Date(dStr);
      }
      return d >= start && d <= end;
    });
  }

  // Calculate daily revenue for chart
  const revenueByDay = {};
  filteredOrders.forEach(o => {
    if (o.orderStatus === 'completed' || o.orderStatus === 'processing' || o.orderStatus === 'delivered') {
      let dStr = o.date || o.createdAt;
      let d;
      if (dStr && dStr.includes('/')) {
        const parts = dStr.split(' ')[0].split('/');
        d = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      } else {
        const dateObj = new Date(dStr);
        d = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
      }
      const price = Number(o.price || 0);
      if (!revenueByDay[d]) {
        revenueByDay[d] = { volume: 0, revenue: 0, count: 0 };
      }
      revenueByDay[d].volume += price;
      // Giả định doanh thu sàn là 5% giá trị đơn hàng
      revenueByDay[d].revenue += Math.round(price * 0.05);
      revenueByDay[d].count += 1;
    }
  });

  // Also calculate order statuses for pie chart
  const orderStatuses = {
    pending: filteredOrders.filter(o => o.orderStatus === 'pending').length,
    processing: filteredOrders.filter(o => o.orderStatus === 'processing').length,
    delivered: filteredOrders.filter(o => o.orderStatus === 'delivered').length,
    completed: filteredOrders.filter(o => o.orderStatus === 'completed').length,
    cancelled: filteredOrders.filter(o => o.orderStatus === 'cancelled').length,
    disputed: filteredOrders.filter(o => o.orderStatus === 'disputed').length
  };

  res.json({
    success: true,
    data: {
      usersSummary: {
        total: users.length,
        customers: users.filter(u => u.role === 'Customer').length,
        providers: users.filter(u => u.role === 'Provider').length,
        active: users.filter(u => u.status === 'active').length,
        locked: users.filter(u => u.status === 'locked').length
      },
      categories,
      revenueByDay,
      orderStatuses,
      totalOrders: filteredOrders.length
    }
  });
});

module.exports = router;
