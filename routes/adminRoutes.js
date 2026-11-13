const express = require('express');
const router = express.Router();
const db = require('../data/db');
const { processReleaseEscrow } = require('../services/orderService');
const walletService = require('../services/walletService');
const { hashPassword } = require('../utils/authTokens');

function safeAdminUser(u) {
  if (!u) return null;
  const copy = { ...u };
  delete copy.passwordHash;
  delete copy.password;
  return copy;
}

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
      if (key === 'users') {
        const existingMap = new Map((db.getCollection('users') || []).map(u => [String(u.id), u]));
        const mergedUsers = clientState[key].map(incoming => {
          const prev = incoming && existingMap.get(String(incoming.id));
          if (!prev) return incoming;
          const next = { ...prev, ...incoming };
          if (!incoming.passwordHash && prev.passwordHash) next.passwordHash = prev.passwordHash;
          if (!incoming.password && prev.password) next.password = prev.password;
          if (incoming.tokenVersion === undefined && prev.tokenVersion !== undefined) next.tokenVersion = prev.tokenVersion;
          if (incoming.emailVerified === undefined && prev.emailVerified !== undefined) next.emailVerified = prev.emailVerified;
          if (incoming.marketingApproved === undefined && prev.marketingApproved !== undefined) next.marketingApproved = prev.marketingApproved;
          if (incoming.marketingApprovedAt === undefined && prev.marketingApprovedAt !== undefined) next.marketingApprovedAt = prev.marketingApprovedAt;
          return next;
        });
        db.saveCollection('users', mergedUsers);
      } else {
        db.saveCollection(key, clientState[key]);
      }
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

  res.json({ success: true, total: users.length, users: users.map(safeAdminUser) });
});

// ============================================================================
// Cập nhật thông tin tài khoản (Email, Mật khẩu, Họ tên, SĐT, Quyền Marketing) — giữ nguyên ID & lịch sử đơn hàng.
router.put('/users/:id', async (req, res) => {
  try {
    const { name, email, phone, status, newPassword, marketingApproved } = req.body || {};
    const users = db.getCollection('users') || [];
    const index = users.findIndex(u => String(u.id) === String(req.params.id) || (u.uid && String(u.uid) === String(req.params.id)));

    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng!' });
    }

    const user = users[index];
    if (name !== undefined) {
      if (!String(name).trim()) {
        return res.status(400).json({ success: false, message: 'Họ tên không được để trống.' });
      }
      user.name = String(name).trim();
    }

    if (email !== undefined) {
      const cleanEmail = String(email).trim().toLowerCase();
      if (!cleanEmail || cleanEmail.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return res.status(400).json({ success: false, message: 'Địa chỉ email không hợp lệ.' });
      }
      const duplicate = users.some(u => String(u.id) !== String(user.id) && String(u.email || '').trim().toLowerCase() === cleanEmail);
      if (duplicate) {
        return res.status(409).json({ success: false, message: 'Email này đã được sử dụng bởi tài khoản khác.' });
      }
      user.email = cleanEmail;
      user.emailVerified = true;
    }

    if (phone !== undefined) {
      user.phone = String(phone || '').trim();
    }

    if (status && ['active', 'locked', 'pending_verification'].includes(status)) {
      user.status = status;
      if (status === 'active') {
        user.lockReason = '';
        user.lockDuration = '';
        user.emailVerified = true;
      }
    }

    if (marketingApproved !== undefined) {
      if (Boolean(marketingApproved) && user.status !== 'active') {
        return res.status(400).json({ success: false, message: 'Chỉ được chấp thuận nhận marketing cho tài khoản đang hoạt động (active).' });
      }
      user.marketingApproved = Boolean(marketingApproved);
      user.marketingApprovedAt = user.marketingApproved ? new Date().toISOString() : null;
    }

    if (newPassword !== undefined && String(newPassword).length > 0) {
      if (String(newPassword).length < 8) {
        return res.status(400).json({ success: false, message: 'Mật khẩu mới phải có ít nhất 8 ký tự.' });
      }
      user.passwordHash = await hashPassword(String(newPassword));
      delete user.password;
      user.tokenVersion = (Number(user.tokenVersion) || 0) + 1;
    }

    user.updatedAt = new Date().toISOString();
    await db.saveCollectionAndWait('users', users);

    // Đồng bộ email/name/phone sang bảng providers nếu là Provider
    const providers = db.getCollection('providers') || [];
    const pIndex = providers.findIndex(p => p.userId === user.id || p.id === user.id);
    if (pIndex !== -1) {
      providers[pIndex].name = user.name;
      providers[pIndex].email = user.email;
      providers[pIndex].phone = user.phone;
      await db.saveCollectionAndWait('providers', providers);
    }

    return res.json({
      success: true,
      message: `Đã cập nhật thông tin tài khoản ${user.name} (${user.email}) thành công!`,
      user: safeAdminUser(user)
    });
  } catch (err) {
    console.error('[Admin] Lỗi cập nhật user:', err);
    return res.status(500).json({ success: false, message: err.message || 'Lỗi máy chủ khi cập nhật người dùng.' });
  }
});

// CHỨC NĂNG 12.1: KHÓA TÀI KHOẢN VI PHẠM & HỦY TOÀN BỘ PHIÊN LÀM VIỆC (SESSION)
// PUT /admin/users/:id/ban
// ============================================================================
router.put('/users/:id/ban', (req, res) => {
  const { reason } = req.body;
  const users = db.getCollection('users');
  const user = users.find(u => u.id === req.params.id || u.uid === req.params.id);

  if (!user) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng!' });
  }

  // 1. Cập nhật trạng thái trong Database
  user.is_active = false;
  user.status = 'locked';
  user.lockReason = (reason && String(reason).trim()) || 'Vi phạm điều khoản dịch vụ hệ thống';
  user.bannedAt = new Date().toISOString();

  db.saveCollection('users', users);

  res.json({
    success: true,
    message: `Đã khóa tài khoản [${user.name || user.email}] (is_active = false). Người dùng sẽ bị đăng xuất ngay lập tức.`,
    user
  });
});

router.post('/users/:id/ban', (req, res) => {
  const { reason } = req.body;
  const users = db.getCollection('users');
  const user = users.find(u => u.id === req.params.id || u.uid === req.params.id);

  if (!user) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng!' });
  }

  user.is_active = false;
  user.status = 'locked';
  user.lockReason = (reason && String(reason).trim()) || 'Vi phạm điều khoản dịch vụ hệ thống';
  user.bannedAt = new Date().toISOString();

  db.saveCollection('users', users);

  res.json({
    success: true,
    message: `Đã khóa tài khoản [${user.name || user.email}] (is_active = false). Người dùng sẽ bị đăng xuất ngay lập tức.`,
    user
  });
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
router.get('/providers/pending', async (req, res) => {
  const [pending, providers, users] = await Promise.all([
    db.getCollectionFresh('pendingProviders'),
    db.getCollectionFresh('providers'),
    db.getCollectionFresh('users')
  ]);
  const providerApplications = providers
    .filter(provider => provider.verified !== true && provider.reviewStatus !== 'rejected')
    .map(provider => {
      const user = users.find(item => item.id === provider.userId || item.email?.toLowerCase() === provider.email?.toLowerCase());
      return {
        id: provider.id, providerId: provider.id, userId: provider.userId,
        name: provider.name || user?.name || 'Provider', email: provider.email || user?.email || '',
        phone: provider.phone || user?.phone || '', specialty: provider.specialty || '',
        category: provider.category || '', location: provider.location || '', skills: provider.skills || [],
        bio: provider.bio || '', experience: provider.experience || '',
        cert: provider.certifications || [], date: provider.createdAt || provider.joinDate || '',
        status: provider.profileCompleted === true ? 'pending' : 'incomplete', source: 'provider-profile'
      };
    });
  const profileUserIds = new Set(providerApplications.map(item => item.userId).filter(Boolean));
  const legacyPending = pending.filter(item => item.status === 'pending' && !profileUserIds.has(item.userId));
  const allPending = [...legacyPending, ...providerApplications];
  res.json({ success: true, total: allPending.length, pendingProviders: allPending });
});

router.post('/providers/:id/approve', async (req, res) => {
  const pending = await db.getCollectionFresh('pendingProviders');
  const item = pending.find(p => p.id === req.params.id);
  const providers = await db.getCollectionFresh('providers');
  const users = await db.getCollectionFresh('users');
  let provider = providers.find(p => p.id === req.params.id || p.userId === req.params.id || (item && p.userId === item.userId));
  if (!item && !provider) return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ đăng ký Provider!' });
  if (item) {
    item.status = 'approved';
    db.saveCollection('pendingProviders', pending);
  }

  if (!provider) {
    const user = users.find(u => u.id === item.userId || u.email?.toLowerCase() === item.email?.toLowerCase());
    const maxId = providers.reduce((max, p) => Math.max(max, Number((/^PRV(\d+)$/.exec(p.id || '') || [])[1]) || 0), 0);
    const profileIsComplete = Boolean(
      String(item.specialty || '').trim() && String(item.category || '').trim() &&
      String(item.location || '').trim() && Number(item.hourlyRate) >= 50000 &&
      (Array.isArray(item.skills) ? item.skills.length > 0 : String(item.specialty || '').trim()) &&
      String(item.bio || '').trim()
    );
    provider = {
      id: `PRV${String(maxId + 1).padStart(3, '0')}`, userId: item.userId || user?.id || `USR_P_${Date.now()}`,
      name: item.name || user?.name || 'Provider', email: item.email || user?.email || '', phone: item.phone || user?.phone || '',
      specialty: item.specialty || '', category: item.category || 'IT', rating: 5, reviewCount: 0,
      hourlyRate: Number(item.hourlyRate) || 300000, completedOrders: 0, location: item.location || 'Việt Nam',
      verified: true, profileCompleted: profileIsComplete, reviewStatus: 'approved', badge: 'VERIFIED PROVIDER',
      bio: item.bio || '', avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200',
      cover: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=800',
      skills: Array.isArray(item.skills) ? item.skills : (item.specialty ? item.specialty.split(/[,/]/).map(s => s.trim()) : ['Chuyên môn']),
      certifications: Array.isArray(item.cert) ? item.cert : (item.cert ? item.cert.split(/[,]/).map(c => c.trim()) : []),
      packages: [], availabilityStatus: profileIsComplete ? 'ready' : 'inactive'
    };
    providers.push(provider);
  } else {
    provider.verified = true;
    provider.reviewStatus = 'approved';
    provider.profileCompleted = provider.profileCompleted === true;
    if (provider.profileCompleted === true) {
      if (!provider.availabilityStatus || provider.availabilityStatus === 'inactive') provider.availabilityStatus = 'ready';
    } else {
      provider.availabilityStatus = 'inactive';
    }
  }
  db.saveCollection('providers', providers);

  const user = users.find(u => u.email?.toLowerCase() === (item?.email || provider.email || '').toLowerCase() || u.id === (item?.userId || provider.userId));
  if (user) {
    user.role = 'Provider';
    if (user.status === 'pending_verification') user.status = 'active';
    db.saveCollection('users', users);
  }
  res.json({ success: true, message: `Đã phê duyệt hồ sơ Provider thành công cho [${item?.name || provider.name}].`, provider });
});

router.post('/providers/:id/reject', async (req, res) => {
  const { reason } = req.body;
  const pending = await db.getCollectionFresh('pendingProviders');
  const item = pending.find(p => p.id === req.params.id);
  const providers = await db.getCollectionFresh('providers');
  const provider = providers.find(p => p.id === req.params.id || p.userId === req.params.id || (item && p.userId === item.userId));
  if (!item && !provider) return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ đăng ký Provider!' });
  const rejectReason = reason || 'Thông tin chưa đầy đủ hoặc không hợp lệ';
  if (item) {
    item.status = 'rejected';
    item.rejectReason = rejectReason;
    db.saveCollection('pendingProviders', pending);
  }
  if (provider) {
    provider.verified = false;
    provider.reviewStatus = 'rejected';
    provider.rejectReason = rejectReason;
    provider.availabilityStatus = 'inactive';
    db.saveCollection('providers', providers);
  }
  res.json({ success: true, message: `Đã từ chối hồ sơ Provider của [${item?.name || provider?.name || 'Provider'}].` });
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
// ============================================================================
// CHỨC NĂNG 12.2: QUẢN LÝ SẢN PHẨM / DỊCH VỤ (PRODUCTS)
// ============================================================================
// GET /admin/products -> Xem danh sách sản phẩm
router.get('/products', (req, res) => {
  const { status, category, q } = req.query;
  let services = db.getCollection('services') || [];

  if (status && status !== 'all') {
    services = services.filter(s => s.status === status);
  }
  if (category && category !== 'all') {
    services = services.filter(s => s.category?.toLowerCase() === category.toLowerCase());
  }
  if (q) {
    const keyword = q.toLowerCase().trim();
    services = services.filter(s =>
      (s.title && s.title.toLowerCase().includes(keyword)) ||
      (s.name && s.name.toLowerCase().includes(keyword)) ||
      (s.providerName && s.providerName.toLowerCase().includes(keyword)) ||
      (s.id && s.id.toLowerCase().includes(keyword))
    );
  }

  res.json({ success: true, total: services.length, products: services });
});

// POST /admin/products -> Admin duyệt hoặc đăng sản phẩm mới
router.post(['/products', '/services'], (req, res) => {
  const { name, title, price, stock, category, provider_id, providerId, description, desc, image, thumbnail } = req.body;
  const services = db.getCollection('services') || [];
  const products = db.getCollection('products') || [];
  const providers = db.getCollection('providers') || [];

  const id = `PRD${Date.now()}`;
  const prv = providers.find(p => p.id === (providerId || provider_id)) || {};

  const newProduct = {
    id,
    name: name || title || 'Sản phẩm mới',
    title: title || name || 'Sản phẩm mới',
    price: Number(price) || 0,
    stock: Number(stock !== undefined ? stock : 100),
    category: category || 'IT',
    provider_id: providerId || provider_id || prv.id || 'PRV001',
    providerId: providerId || provider_id || prv.id || 'PRV001',
    providerName: prv.name || 'Nhà cung cấp',
    description: description || desc || '',
    desc: desc || description || '',
    image: image || thumbnail || 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600',
    thumbnail: thumbnail || image || 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600',
    status: 'active',
    is_deleted: false,
    createdAt: new Date().toISOString()
  };

  services.unshift(newProduct);
  products.unshift(newProduct);
  db.saveCollection('services', services);
  db.saveCollection('products', products);

  res.status(201).json({
    success: true,
    message: `Admin đã đăng / duyệt sản phẩm [${newProduct.name}] thành công!`,
    product: newProduct
  });
});

// PUT /admin/products/:id -> Cập nhật giá, kho hàng
router.put(['/products/:id', '/services/:id'], (req, res) => {
  const { name, title, price, stock, category, description, desc, status } = req.body;
  const services = db.getCollection('services') || [];
  const products = db.getCollection('products') || [];

  const itemSvc = services.find(s => s.id === req.params.id);
  const itemPrd = products.find(p => p.id === req.params.id);
  const item = itemSvc || itemPrd;

  if (!item) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm!' });
  }

  if (name !== undefined) item.name = name;
  if (title !== undefined) item.title = title;
  if (price !== undefined) item.price = Number(price);
  if (stock !== undefined) item.stock = Number(stock);
  if (category !== undefined) item.category = category;
  if (description !== undefined) item.description = description;
  if (desc !== undefined) item.desc = desc;
  if (status !== undefined) item.status = status;
  item.updatedAt = new Date().toISOString();

  if (itemSvc) Object.assign(itemSvc, item);
  if (itemPrd) Object.assign(itemPrd, item);

  db.saveCollection('services', services);
  db.saveCollection('products', products);

  res.json({
    success: true,
    message: `Admin đã cập nhật sản phẩm [${item.name || item.title}] thành công!`,
    product: item
  });
});

// DELETE /admin/products/:id -> Xóa sản phẩm (Soft Delete - ẩn sản phẩm chứ không xóa hẳn khỏi DB)
router.delete(['/products/:id', '/services/:id'], (req, res) => {
  const services = db.getCollection('services') || [];
  const products = db.getCollection('products') || [];

  const itemSvc = services.find(s => s.id === req.params.id);
  const itemPrd = products.find(p => p.id === req.params.id);
  const item = itemSvc || itemPrd;

  if (!item) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm!' });
  }

  item.is_deleted = true;
  item.status = 'inactive';
  item.deletedAt = new Date().toISOString();

  if (itemSvc) {
    itemSvc.is_deleted = true;
    itemSvc.status = 'inactive';
  }
  if (itemPrd) {
    itemPrd.is_deleted = true;
    itemPrd.status = 'inactive';
  }

  db.saveCollection('services', services);
  db.saveCollection('products', products);

  res.json({
    success: true,
    message: `Đã xóa (ẩn) sản phẩm [${item.name || item.title}] thành công (Soft delete)!`,
    product: item
  });
});

// 6. ORDERS & ESCROW INTERVENTION (UC-60, UC-61)
// ============================================================================
router.get('/orders', async (req, res) => {
  const { status, escrowStatus } = req.query;
  const [allOrders, users, providers, services] = await Promise.all([
    db.getCollectionFresh('orders'), db.getCollectionFresh('users'),
    db.getCollectionFresh('providers'), db.getCollectionFresh('services')
  ]);
  let orders = allOrders.map(order => {
    const customer = users.find(user => user.id === order.customerId || user.uid === order.customerId);
    const provider = providers.find(item => item.id === order.providerId);
    const service = services.find(item => item.id === order.serviceId);
    const escrowLabels = {
      escrow_held: 'Đã giữ ký quỹ', refunded: 'Đã hoàn tiền', disputed: 'Tạm giữ tranh chấp',
      completed: 'Đã giải ngân', payment_cancelled: 'Chưa thanh toán', partial_refunded: 'Hoàn tiền một phần'
    };
    const createdAt = order.createdAt || order.created_at || '';
    return {
      ...order,
      customer: order.customer || customer?.name || order.customerName || order.customerId || 'Khách hàng',
      provider: order.provider || provider?.name || order.providerName || order.providerId || 'Provider',
      service: order.service || order.serviceTitle || service?.title || 'Dịch vụ',
      price: order.priceFormatted || `${(Number(order.price) || 0).toLocaleString('vi-VN')}đ`,
      escrowStatusLabel: escrowLabels[order.escrowStatus] || order.escrowStatus || 'Chưa cập nhật',
      date: order.date || createdAt
    };
  });

  if (status && status !== 'all') {
    orders = orders.filter(o => o.orderStatus === status);
  }
  if (escrowStatus && escrowStatus !== 'all') {
    orders = orders.filter(o => o.escrowStatus === escrowStatus);
  }

  res.json({ success: true, total: orders.length, orders });
});

// ============================================================================
// CHỨC NĂNG 12.3: CAN THIỆP ĐỔI TRẠNG THÁI ĐƠN HÀNG KHI TRANH CHẤP
// PATCH /admin/orders/:id/status
// ============================================================================
router.patch('/orders/:id/status', (req, res) => {
  const { status, note } = req.body;
  if (!status) {
    return res.status(400).json({ success: false, message: 'Vui lòng cung cấp trạng thái đơn hàng mới!' });
  }
  if (String(status).toLowerCase() === 'cancelled' || String(status).toLowerCase() === 'canceled') {
    return res.status(403).json({ success: false, message: 'Admin không được hủy hoặc mở lại đơn hàng. Đơn chỉ được hủy trong 24 giờ đầu bởi Khách hàng hoặc Provider liên quan.' });
  }

  const orders = db.getCollection('orders') || [];
  const order = orders.find(o => o.id === req.params.id);

  if (!order) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng!' });
  }

  const prevStatus = order.status || order.orderStatus;
  const normalized = String(status).toUpperCase();

  order.status = normalized;
  order.orderStatus = status.toLowerCase();
  if (note) order.adminNote = note;
  order.updatedAt = new Date().toISOString();

  // Nếu Admin can thiệp hủy đơn hàng (CANCELLED) -> Hoàn lại kho nếu chưa hoàn
  if ((normalized === 'CANCELLED' || status.toLowerCase() === 'cancelled') && prevStatus !== 'CANCELLED' && prevStatus !== 'cancelled') {
    const orderItems = db.getCollection('order_items') || [];
    const services = db.getCollection('services') || [];
    const products = db.getCollection('products') || [];
    const items = orderItems.filter(oi => String(oi.order_id) === String(order.id));

    if (items.length > 0) {
      items.forEach(oi => {
        const p = services.find(s => s.id === oi.product_id) || products.find(s => s.id === oi.product_id);
        if (p && typeof p.stock === 'number') {
          p.stock += Number(oi.quantity) || 1;
        }
      });
      db.saveCollection('services', services);
      db.saveCollection('products', products);
    }
  }

  db.saveCollection('orders', orders);

  res.json({
    success: true,
    message: `Admin đã can thiệp đổi trạng thái đơn hàng #${order.id} sang [${order.status}].`,
    order
  });
});

router.put('/orders/:id/status', (req, res) => {
  const { status, note } = req.body;
  if (!status) {
    return res.status(400).json({ success: false, message: 'Vui lòng cung cấp trạng thái đơn hàng mới!' });
  }
  if (String(status).toLowerCase() === 'cancelled') {
    return res.status(403).json({ success: false, message: 'Admin không được hủy đơn hoặc can thiệp vào luồng hủy. Quyền hủy chỉ có trong 24 giờ đầu.' });
  }

  const orders = db.getCollection('orders') || [];
  const order = orders.find(o => o.id === req.params.id);

  if (!order) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng!' });
  }

  const prevStatus = order.status || order.orderStatus;
  const normalized = String(status).toUpperCase();

  order.status = normalized;
  order.orderStatus = status.toLowerCase();
  if (note) order.adminNote = note;
  order.updatedAt = new Date().toISOString();

  if ((normalized === 'CANCELLED' || status.toLowerCase() === 'cancelled') && prevStatus !== 'CANCELLED' && prevStatus !== 'cancelled') {
    const orderItems = db.getCollection('order_items') || [];
    const services = db.getCollection('services') || [];
    const products = db.getCollection('products') || [];
    const items = orderItems.filter(oi => String(oi.order_id) === String(order.id));

    if (items.length > 0) {
      items.forEach(oi => {
        const p = services.find(s => s.id === oi.product_id) || products.find(s => s.id === oi.product_id);
        if (p && typeof p.stock === 'number') {
          p.stock += Number(oi.quantity) || 1;
        }
      });
      db.saveCollection('services', services);
      db.saveCollection('products', products);
    }
  }

  db.saveCollection('orders', orders);

  res.json({
    success: true,
    message: `Admin đã can thiệp đổi trạng thái đơn hàng #${order.id} sang [${order.status}].`,
    order
  });
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

router.post('/orders/:id/force-refund', (req, res) => res.status(403).json({ success: false, message: 'Admin không được ép hủy hoặc hoàn tiền đơn hàng. Khách/Provider chỉ có thể hủy trong 24 giờ đầu.' }));

// Admin phân xử yêu cầu hủy đơn (cancel_requested / cancel_rejected / disputed)
// Body: {
//   action: 'continue' | 'cancel',
//   adminNote: string (bắt buộc — căn cứ phán quyết),
//   refundPercentage: number 0–100 (chỉ khi action === 'cancel', mặc định 100)
// }
// - continue: đơn tiếp tục theo trạng thái trước yêu cầu hủy, tiền vẫn giữ
// - cancel  : hủy đơn, hoàn refundPercentage% cho khách, (100-pct)% trả Provider
router.post('/orders/:id/arbitrate-cancel', (req, res) => res.status(403).json({ success: false, message: 'Admin không tham gia phân xử hoặc thay đổi quyết định hủy đơn.' }));

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
  if (complaint.status === 'resolved') {
    return res.status(409).json({ success: false, message: 'Khiếu nại này đã được xử lý trước đó.' });
  }

  const orders = db.getCollection('orders');
  const order = orders.find(o => o.id === complaint.orderId);
  const users = db.getCollection('users');

  if (order) {
    if (resolution === 'refund_customer' || (resolution === 'partial_refund' && Number(refundPercentage) >= 100)) {
      return res.status(403).json({ success: false, message: 'Admin không thể hủy đơn hoặc hoàn tiền toàn bộ theo luồng hủy. Quy tắc hủy 24 giờ được áp dụng trực tiếp cho Khách hàng/Provider.' });
    }
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
      if (prov && !((db.getCollection('walletTransactions') || []).some(t => t.orderId === order.id && t.type === 'disbursement'))) {
        prov.balance = (prov.balance || 0) + priceNum;
        const provider = (db.getCollection('providers') || []).find(p => p.userId === prov.id || p.id === order.providerId);
        const walletTransactions = db.getCollection('walletTransactions') || [];
        walletTransactions.unshift({ id: `TXN_${Date.now()}_CP`, userId: prov.id, providerId: provider?.id || order.providerId, orderId: order.id, complaintId: complaint.id, type: 'disbursement', amount: priceNum, balanceAfter: prov.balance, status: 'completed', description: `Thu nhập theo khiếu nại ${complaint.id} cho đơn ${order.id}`, createdAt: new Date().toISOString() });
        db.saveCollection('walletTransactions', walletTransactions);
      }
    } else if (resolution === 'partial_refund') {
      const pct = Math.max(0, Math.min(100, Number(refundPercentage)));
      const refundAmt = Math.round(priceNum * (pct / 100));
      const payAmt = priceNum - refundAmt;

      order.escrowStatus = 'partial_refunded';
      order.orderStatus = 'completed';

      const cust = users.find(u => u.id === order.customerId || u.name === order.customerName);
      if (cust) {
        cust.balance = (cust.balance || 0) + refundAmt;
        const walletTransactions = db.getCollection('walletTransactions') || [];
        walletTransactions.unshift({ id: `TXN_${Date.now()}_CR`, userId: cust.id, orderId: order.id, complaintId: complaint.id, type: 'refund', amount: refundAmt, balanceAfter: cust.balance, status: 'completed', description: `Hoàn tiền theo khiếu nại ${complaint.id} cho đơn ${order.id}`, createdAt: new Date().toISOString() });
        db.saveCollection('walletTransactions', walletTransactions);
      }

      const prov = users.find(u => u.id === order.providerId || u.name === order.providerName);
      if (prov && payAmt > 0) {
        prov.balance = (prov.balance || 0) + payAmt;
        const provider = (db.getCollection('providers') || []).find(p => p.userId === prov.id || p.id === order.providerId);
        const walletTransactions = db.getCollection('walletTransactions') || [];
        walletTransactions.unshift({ id: `TXN_${Date.now()}_CP`, userId: prov.id, providerId: provider?.id || order.providerId, orderId: order.id, complaintId: complaint.id, type: 'disbursement', amount: payAmt, balanceAfter: prov.balance, status: 'completed', description: `Thu nhập theo khiếu nại ${complaint.id} cho đơn ${order.id}`, createdAt: new Date().toISOString() });
        db.saveCollection('walletTransactions', walletTransactions);
      }
    }

    db.saveCollection('orders', orders);
    db.saveCollection('users', users);
  }

  complaint.status = 'resolved';
  complaint.resolution = resolution;
  complaint.resolutionNote = note || '';

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

router.post('/payouts/:id/approve', async (req, res) => {
  try {
    const payout = await walletService.settleWithdrawal(req.params.id, 'approve');
    res.json({ success: true, message: `Đã xác nhận đã chi ${payout.amount} cho ${payout.provider}.`, payout });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Không thể cập nhật yêu cầu rút tiền.' });
  }
});

router.post('/payouts/:id/reject', async (req, res) => {
  try {
    const payout = await walletService.settleWithdrawal(req.params.id, 'reject', req.body?.reason);
    res.json({ success: true, message: `Đã từ chối yêu cầu rút tiền của ${payout.provider}; tiền đã được hoàn lại ví.`, payout });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Không thể cập nhật yêu cầu rút tiền.' });
  }
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
    disputed: filteredOrders.filter(o => ['disputed', 'cancel_requested', 'cancel_rejected'].includes(o.orderStatus)).length
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

