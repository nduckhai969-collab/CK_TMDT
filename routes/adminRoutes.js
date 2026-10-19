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

  // Cộng doanh thu từ các gói dịch vụ bán cho Provider
  const packagePurchases = db.getCollection('packagePurchases') || [];
  packagePurchases.forEach(pkg => {
    const amt = Number(pkg.amountNum || String(pkg.amount || '').replace(/[^0-9]/g, '')) || 0;
    totalRevenue += amt;
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
// 3. USER MANAGEMENT (UC-52, UC-53, UC-53b) - FIRESTORE SINGLE SOURCE OF TRUTH
// ============================================================================
router.get('/users', (req, res) => {
  const { role, status, q } = req.query;
  let users = db.getCollection('users');

  if (role && role !== 'all') {
    users = users.filter(u => u.role && u.role.toLowerCase() === role.toLowerCase());
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

// Single user detail from Firestore
router.get('/users/:id', (req, res) => {
  const users = db.getCollection('users');
  const user = users.find(u => u.id === req.params.id);

  if (!user) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng trong Firestore!' });
  }

  res.json({ success: true, user });
});

// Lock user account (UC-53) - Firestore Single Source of Truth
router.post('/users/:id/lock', async (req, res) => {
  try {
    const { reason, duration } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp lý do khóa tài khoản!' });
    }

    const users = db.getCollection('users');
    const user = users.find(u => u.id === req.params.id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng trong Firestore!' });
    }

    // Nghiệp vụ bảo mật: Không được phép tự khóa tài khoản Quản trị viên hệ thống
    if (user.role === 'Admin' || user.id === 'ADM001' || user.id === 'ADM002') {
      return res.status(400).json({ success: false, message: 'Không thể khóa tài khoản Quản trị viên hệ thống!' });
    }

    const isPermanent = duration === 'permanent';
    const durationDays = parseInt(duration, 10) || 7;
    const durationText = isPermanent ? 'Vĩnh viễn' : `${durationDays} ngày`;

    const now = new Date();
    const expiresDate = isPermanent ? null : new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

    user.status = 'locked';
    user.lockReason = reason.trim();
    user.lockDuration = durationText;
    user.isPermanentLock = isPermanent;
    user.lockedAt = now.toLocaleString('vi-VN');
    user.lockExpiresAt = expiresDate ? expiresDate.toISOString() : null;
    user.lockExpiresAtFormatted = expiresDate ? expiresDate.toLocaleString('vi-VN') : 'Vĩnh viễn';
    user.lockedBy = (req.authUser && (req.authUser.name || req.authUser.email)) || 'Admin Quản Trị B4';

    // Đồng bộ vô hiệu hóa tài khoản Firebase Authentication (nếu có tài khoản đăng nhập)
    const { auth } = require('../firebase');
    if (auth && (user.uid || user.email)) {
      try {
        let fbUid = user.uid;
        if (!fbUid && user.email) {
          const record = await auth.getUserByEmail(user.email).catch(() => null);
          if (record) fbUid = record.uid;
        }
        if (fbUid) {
          await auth.updateUser(fbUid, { disabled: true }).catch(err => {
            console.warn('[Admin] Firebase Auth disable warning:', err.message);
          });
        }
      } catch (authErr) {
        console.warn('[Admin] Firebase Auth disable check failed:', authErr.message);
      }
    }

    // Ghi đè bền vững trực tiếp vào Firestore
    await db.saveCollectionAndWait('users', users);

    res.json({
      success: true,
      message: `Đã khóa tài khoản ${user.name} (${durationText}) thành công.`,
      user
    });
  } catch (error) {
    console.error('[Admin] Lỗi khóa người dùng:', error);
    res.status(500).json({ success: false, message: 'Lỗi khi cập nhật Firestore: ' + error.message });
  }
});

// Unlock user account - Firestore Single Source of Truth
router.post('/users/:id/unlock', async (req, res) => {
  try {
    const users = db.getCollection('users');
    const user = users.find(u => u.id === req.params.id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng trong Firestore!' });
    }

    user.status = 'active';
    user.lockReason = '';
    user.lockDuration = '';
    user.isPermanentLock = false;
    user.lockExpiresAt = null;
    user.lockExpiresAtFormatted = null;
    user.unlockedAt = new Date().toLocaleString('vi-VN');
    user.unlockedBy = (req.authUser && (req.authUser.name || req.authUser.email)) || 'Admin Quản Trị B4';

    // Khôi phục quyền đăng nhập Firebase Authentication (nếu có)
    const { auth } = require('../firebase');
    if (auth && (user.uid || user.email)) {
      try {
        let fbUid = user.uid;
        if (!fbUid && user.email) {
          const record = await auth.getUserByEmail(user.email).catch(() => null);
          if (record) fbUid = record.uid;
        }
        if (fbUid) {
          await auth.updateUser(fbUid, { disabled: false }).catch(err => {
            console.warn('[Admin] Firebase Auth enable warning:', err.message);
          });
        }
      } catch (authErr) {
        console.warn('[Admin] Firebase Auth enable check failed:', authErr.message);
      }
    }

    // Ghi đè bền vững trực tiếp vào Firestore
    await db.saveCollectionAndWait('users', users);

    res.json({
      success: true,
      message: `Đã mở khóa tài khoản ${user.name} thành công.`,
      user
    });
  } catch (error) {
    console.error('[Admin] Lỗi mở khóa người dùng:', error);
    res.status(500).json({ success: false, message: 'Lỗi khi cập nhật Firestore: ' + error.message });
  }
});

// Unlock Requests / Appeals (UC-53b)
router.get('/unlock-requests', (req, res) => {
  const requests = db.getCollection('unlockRequests');
  res.json({ success: true, total: requests.length, requests });
});

router.post('/unlock-requests/:id/decide', async (req, res) => {
  try {
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
    const now = new Date();

    if (decision === 'approve') {
      if (user) {
        user.status = 'active';
        user.lockReason = '';
        user.lockDuration = '';
        user.isPermanentLock = false;
        user.lockExpiresAt = null;
        user.unlockedAt = now.toLocaleString('vi-VN');
      }
      message = `Tài khoản ${request.name} đã được phục hồi quyền truy cập thành công.`;
      requests.splice(reqIndex, 1);
    } else if (decision === 'probation') {
      if (user) {
        user.status = 'active';
        user.lockReason = 'Đang theo dõi thử thách 30 ngày';
        user.lockDuration = '30 ngày thử thách';
        user.isPermanentLock = false;
        user.lockExpiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
      }
      message = `Tài khoản ${request.name} được chuyển sang chế độ theo dõi thử thách 30 ngày.`;
      requests.splice(reqIndex, 1);
    } else if (decision === 'reject_perm') {
      if (user) {
        user.status = 'locked';
        user.lockDuration = 'Vĩnh viễn';
        user.isPermanentLock = true;
        user.lockExpiresAt = null;
      }
      message = `Đã giữ nguyên án khóa vĩnh viễn với tài khoản ${request.name}.`;
      requests.splice(reqIndex, 1);
    } else {
      message = `Đã từ chối đơn mở khóa của ${request.name}.`;
      requests.splice(reqIndex, 1);
    }

    await db.saveCollectionAndWait('users', users);
    await db.saveCollectionAndWait('unlockRequests', requests);

    res.json({ success: true, message });
  } catch (error) {
    console.error('[Admin] Lỗi xử lý yêu cầu mở khóa:', error);
    res.status(500).json({ success: false, message: 'Lỗi khi cập nhật Firestore: ' + error.message });
  }
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
  const { status, priority, search } = req.query;
  let complaints = db.getCollection('complaints') || [];

  if (status && status !== 'all') {
    if (status === 'pending') {
      complaints = complaints.filter(c => ['submitted', 'pending', 'under_review', 'awaiting_information'].includes(c.status));
    } else if (status === 'resolved') {
      complaints = complaints.filter(c => ['resolved', 'rejected'].includes(c.status));
    } else {
      complaints = complaints.filter(c => c.status === status);
    }
  }

  if (priority && priority !== 'all') {
    complaints = complaints.filter(c => c.priority === priority);
  }

  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    complaints = complaints.filter(c =>
      (c.id && c.id.toLowerCase().includes(q)) ||
      (c.orderId && c.orderId.toLowerCase().includes(q)) ||
      (c.complainant && c.complainant.toLowerCase().includes(q)) ||
      (c.defendant && c.defendant.toLowerCase().includes(q)) ||
      (c.reason && c.reason.toLowerCase().includes(q))
    );
  }

  res.json({ success: true, total: complaints.length, complaints });
});

// Admin updates complaint status (e.g. under_review or awaiting_information)
router.post('/complaints/:id/status', async (req, res) => {
  try {
    const { status, note } = req.body;
    if (!status || !['under_review', 'awaiting_information', 'submitted', 'pending'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Trạng thái không hợp lệ. Chọn under_review hoặc awaiting_information.' });
    }

    const complaints = db.getCollection('complaints') || [];
    const complaint = complaints.find(c => c.id === req.params.id);

    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ khiếu nại!' });
    }

    if (['resolved', 'rejected'].includes(complaint.status)) {
      return res.status(400).json({ success: false, message: 'Khiếu nại đã có phán quyết cuối cùng, không thể đổi trạng thái trung gian.' });
    }

    const now = new Date();
    const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    complaint.status = status;
    complaint.updatedAt = dateStr;

    if (!complaint.timeline) complaint.timeline = [];
    const statusLabels = {
      under_review: 'Admin tiếp nhận & Đang xem xét chứng cứ',
      awaiting_information: 'Admin yêu cầu các bên bổ sung thông tin chứng cứ',
      submitted: 'Chờ phân xử'
    };
    complaint.timeline.push({
      time: dateStr,
      actor: req.authUser.id,
      actorName: req.authUser.name || 'Admin',
      role: 'Admin',
      action: 'admin_status_change',
      note: `${statusLabels[status] || status}${note ? ': ' + note : ''}`,
      status
    });

    await db.saveCollectionAndWait('complaints', complaints);

    // Notify parties
    const { createNotification, notifyProvider } = require('../services/notificationService');
    if (complaint.complainantId) {
      createNotification(complaint.complainantId, 'Cập nhật tiến độ khiếu nại',
        `Khiếu nại ${complaint.id} đã được chuyển sang trạng thái: "${statusLabels[status] || status}". ${note || ''}`,
        'info', '/customer_complaints.html');
    }
    if (complaint.defendantId) {
      notifyProvider(complaint.defendantId, 'Cập nhật tiến độ khiếu nại',
        `Khiếu nại ${complaint.id} đã được Admin cập nhật trạng thái: "${statusLabels[status] || status}". ${note || ''}`,
        'info', '/complaint.html');
    }

    res.json({
      success: true,
      message: `Đã cập nhật trạng thái khiếu nại thành "${statusLabels[status] || status}"!`,
      complaint
    });
  } catch (err) {
    console.error('[adminRoutes] Lỗi cập nhật trạng thái complaint:', err);
    res.status(500).json({ success: false, message: 'Lỗi ghi Firestore: ' + err.message });
  }
});

router.post('/complaints/:id/resolve', async (req, res) => {
  try {
    const { resolution, refundPercentage = 100, note, verdict } = req.body;
    const complaints = db.getCollection('complaints') || [];
    const complaint = complaints.find(c => c.id === req.params.id);

    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ khiếu nại!' });
    }

    if (complaint.status === 'resolved' || complaint.status === 'rejected') {
      return res.status(400).json({ success: false, message: 'Khiếu nại này đã có phán quyết trước đó. Không thể phán quyết lại!' });
    }

    const now = new Date();
    const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    complaint.resolution = resolution;
    complaint.resolutionNote = note || '';
    complaint.resolvedAt = dateStr;
    complaint.resolvedBy = req.authUser.name || 'Admin';
    complaint.updatedAt = dateStr;

    let decisionLabel = verdict || '';

    const orders = db.getCollection('orders') || [];
    const order = orders.find(o => o.id === complaint.orderId);
    const users = db.getCollection('users') || [];
    const { createNotification, notifyProvider } = require('../services/notificationService');

    if (resolution === 'refund_customer') {
      complaint.status = 'resolved';
      if (!decisionLabel) decisionLabel = 'Hoàn tiền 100% cho Khách hàng';
      complaint.verdict = decisionLabel;

      if (order) {
        order.escrowStatus = 'refunded';
        order.orderStatus = 'cancelled';
        if (!order.milestones) order.milestones = [];
        order.milestones.push({ title: 'Admin giải quyết khiếu nại: Hoàn 100% tiền ký quỹ cho khách hàng', done: true, time: dateStr });

        const totalDeposit = Number(order.escrowDeposit) || Number(order.price) || 0;
        const cust = users.find(u => u.id === order.customerId || u.name === order.customerName);
        if (cust) {
          cust.balance = (cust.balance || 0) + totalDeposit;
        }
      }
    } else if (resolution === 'pay_provider') {
      complaint.status = 'resolved';
      if (!decisionLabel) decisionLabel = 'Giải ngân 100% cho Provider';
      complaint.verdict = decisionLabel;

      if (order) {
        order.escrowStatus = 'completed';
        order.orderStatus = 'completed';
        if (!order.milestones) order.milestones = [];
        order.milestones.push({ title: 'Admin giải quyết khiếu nại: Bác bỏ khiếu nại và giải ngân tiền cho Provider', done: true, time: dateStr });

        const priceNum = Number(order.price) || 0;
        const prov = users.find(u => u.id === order.providerId || u.name === order.providerName);
        if (prov) {
          prov.balance = (prov.balance || 0) + priceNum;
        }
      }
    } else if (resolution === 'partial_refund') {
      complaint.status = 'resolved';
      const pct = Math.max(0, Math.min(100, Number(refundPercentage) || 50));
      if (!decisionLabel) decisionLabel = `Bồi thường ${pct}/${100 - pct} giữa hai bên`;
      complaint.verdict = decisionLabel;
      complaint.refundPercentage = pct;

      if (order) {
        const priceNum = Number(order.price) || 0;
        const refundAmt = Math.round(priceNum * (pct / 100));
        const payAmt = priceNum - refundAmt;

        order.escrowStatus = 'partial_refunded';
        order.orderStatus = 'cancelled';
        if (!order.milestones) order.milestones = [];
        order.milestones.push({ title: `Admin giải quyết khiếu nại: Bồi thường ${pct}% cho khách và giải ngân ${100 - pct}% cho provider`, done: true, time: dateStr });

        const cust = users.find(u => u.id === order.customerId || u.name === order.customerName);
        if (cust) cust.balance = (cust.balance || 0) + refundAmt;

        const prov = users.find(u => u.id === order.providerId || u.name === order.providerName);
        if (prov) prov.balance = (prov.balance || 0) + payAmt;
      }
    } else if (resolution === 'reject') {
      complaint.status = 'rejected';
      if (!decisionLabel) decisionLabel = 'Bác bỏ khiếu nại của Khách hàng';
      complaint.verdict = decisionLabel;

      if (order) {
        order.escrowStatus = 'escrow_held';
        order.orderStatus = 'processing';
        if (!order.milestones) order.milestones = [];
        order.milestones.push({ title: 'Admin bác bỏ khiếu nại: Đơn hàng tiếp tục thực hiện', done: true, time: dateStr });
      }
    }

    if (!complaint.timeline) complaint.timeline = [];
    complaint.timeline.push({
      time: dateStr,
      actor: req.authUser.id,
      actorName: req.authUser.name || 'Admin',
      role: 'Admin',
      action: 'admin_resolution',
      note: `Phán quyết: ${decisionLabel}${note ? '. Lý do: ' + note : ''}`,
      status: complaint.status
    });

    if (order) await db.saveCollectionAndWait('orders', orders);
    await db.saveCollectionAndWait('users', users);
    await db.saveCollectionAndWait('complaints', complaints);

    // Notify Customer & Provider
    if (complaint.complainantId) {
      createNotification(complaint.complainantId, 'Phán quyết khiếu nại đã có kết quả',
        `Admin đã đưa ra phán quyết cho khiếu nại ${complaint.id}: ${decisionLabel}. ${note ? 'Ghi chú: ' + note : ''}`,
        'success', '/customer_complaints.html');
    }
    if (complaint.defendantId) {
      notifyProvider(complaint.defendantId, 'Phán quyết khiếu nại đã có kết quả',
        `Admin đã đưa ra phán quyết cho khiếu nại ${complaint.id}: ${decisionLabel}. ${note ? 'Ghi chú: ' + note : ''}`,
        'info', '/complaint.html');
    }

    res.json({
      success: true,
      message: `Phán quyết tranh chấp đã được thực thi thành công: "${decisionLabel}"!`,
      complaint
    });
  } catch (err) {
    console.error('[adminRoutes] Lỗi resolve complaint:', err);
    res.status(500).json({ success: false, message: 'Lỗi ghi Firestore: ' + err.message });
  }
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
  // Đơn đang chờ thanh toán (hoặc đã tự hủy vì không thanh toán) chưa phải đơn hàng thật nên không đưa vào thống kê
  const countedOrders = orders.filter(o => o.paymentStatus !== 'pending' && o.paymentStatus !== 'cancelled');
  let filteredOrders = countedOrders;
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
    filteredOrders = countedOrders.filter(o => {
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
