const express = require('express');
const router = express.Router();

const db = require('../data/db');
const { auth, firestore } = require('../firebase');
const { slotsForDate } = require('./providerAvailability');
const { requireCustomer, requireProvider, requireSignedIn } = require('./customerAuth');
const { generateId } = require('../utils/id');
const { formatDateTime } = require('../utils/dates');
const { processAcceptOrder, processDeliverOrder, processProgressOrder, processCancelOrder, checkAutoReleaseOrders } = require('../services/orderService');
const { isVisibleToProvider } = require('../services/checkoutService');
const { replyToReview } = require('../services/reviewService');

function getMyProvider(req) {
  const providers = db.getCollection('providers') || [];
  let p = providers.find(p => p.userId === req.authUser.id || p.id === req.authUser.id);
  if (!p && req.authUser.email) {
    p = providers.find(p => p.email && p.email.toLowerCase() === req.authUser.email.toLowerCase());
    if (p && !p.userId) {
      p.userId = req.authUser.id;
      db.saveCollection('providers', providers);
    }
  }
  if (!p) {
    p = {
      id: generateId('PRV'),
      userId: req.authUser.id,
      name: req.authUser.name,
      avatar: req.authUser.avatar,
      email: req.authUser.email,
      phone: req.authUser.phone,
      rating: 5.0,
      reviews: 0,
      completedOrders: 0,
      createdAt: formatDateTime(new Date()),
      verified: false
    };
    providers.unshift(p);
    db.saveCollection('providers', providers);
  }
  return p;
}

async function getMyProviderFresh(req) {
  const providers = await db.getCollectionFresh('providers');
  return providers.find(p => p.userId === req.authUser.id || p.id === req.authUser.id) ||
    (req.authUser.email && providers.find(p => p.email && p.email.toLowerCase() === req.authUser.email.toLowerCase())) || null;
}

// Homepage summaries and provider detail endpoints used by the customer portal.
router.get('/stats', async (req, res) => {
  const [providers, jobs, services] = await Promise.all([
    db.getCollectionFresh('providers'), db.getCollectionFresh('jobRequests'), db.getCollectionFresh('services')
  ]);
  const ratings = providers.map(p => Number(p.rating)).filter(Number.isFinite);
  const skills = new Set(providers.flatMap(p => Array.isArray(p.skills) ? p.skills : []));
  res.json({
    success: true,
    stats: {
      activeProviders: providers.length,
      skillsCount: skills.size + services.length,
      requestsCreated: jobs.length,
      avgRating: ratings.length ? `${(ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length).toFixed(1)}/5` : '0/5'
    }
  });
});

router.get('/featured', async (req, res) => {
  const providers = [...(await db.getCollectionFresh('providers'))]
    .sort((a, b) => Number(b.completedOrders || 0) - Number(a.completedOrders || 0) || Number(b.rating || 0) - Number(a.rating || 0))
    .slice(0, 6);
  res.json({ success: true, providers });
});

router.get('/newest', async (req, res) => {
  const providers = [...(await db.getCollectionFresh('providers'))]
    .sort((a, b) => new Date(b.createdAt || b.joinDate || 0) - new Date(a.createdAt || a.joinDate || 0));
  // When the demo records have no registration timestamp, show the most recently
  // appended provider records first.
  if (providers.every(p => !p.createdAt && !p.joinDate)) providers.reverse();
  res.json({ success: true, providers: providers.slice(0, 6) });
});

// LƯU Ý: các route cố định ('/me', '/dashboard/stats'...) phải đứng TRƯỚC '/:id', nếu không Express coi 'me' là một id.
/* ==========================================================
   PROVIDER DASHBOARD APIs
========================================================== */

router.get('/me', requireProvider, (req, res) => {
  const provider = getMyProvider(req);
  res.json({ success: true, provider });
});

router.put('/profile', requireProvider, async (req, res) => {
  const provider = getMyProvider(req);
  const providers = db.getCollection('providers');
  const index = providers.findIndex(p => p.id === provider.id);
  
  if (index !== -1) {
    const { name, phone, avatar, bio, specialty, category, location, skills, hourlyRate, bankAccount, bankName } = req.body;
    if (name !== undefined && String(name).trim()) providers[index].name = String(name).trim();
    if (phone !== undefined) providers[index].phone = String(phone).trim();
    if (avatar !== undefined && avatar) providers[index].avatar = avatar;
    if (bio !== undefined) providers[index].bio = bio;
    if (specialty !== undefined) providers[index].specialty = specialty;
    if (category !== undefined) providers[index].category = category;
    if (location !== undefined) providers[index].location = location;
    if (skills !== undefined) providers[index].skills = Array.isArray(skills) ? skills : skills.split(',').map(s => s.trim());
    if (hourlyRate !== undefined) providers[index].hourlyRate = Number(hourlyRate);
    if (bankAccount !== undefined) providers[index].bankAccount = bankAccount;
    if (bankName !== undefined) providers[index].bankName = bankName;
    
    db.saveCollection('providers', providers);

    // Đồng bộ sang collection 'users'
    const users = db.getCollection('users');
    const uIndex = users.findIndex(u => u.id === req.authUser.id);
    if (uIndex !== -1) {
      if (name !== undefined && String(name).trim()) users[uIndex].name = String(name).trim();
      if (phone !== undefined) users[uIndex].phone = String(phone).trim();
      if (avatar !== undefined && avatar) users[uIndex].avatar = avatar;
      if (location !== undefined) users[uIndex].address = location;
      db.saveCollection('users', users);
    }

    // Đồng bộ lên Firebase Auth
    if (req.firebaseUser && req.firebaseUser.uid) {
      try {
        const fbUpdate = {};
        if (name && String(name).trim()) fbUpdate.displayName = String(name).trim();
        if (avatar && (avatar.startsWith('http://') || avatar.startsWith('https://'))) {
          fbUpdate.photoURL = avatar;
        }
        if (Object.keys(fbUpdate).length > 0) {
          await auth.updateUser(req.firebaseUser.uid, fbUpdate);
        }
      } catch (err) {
        console.warn('[provider] Cập nhật Firebase Auth profile thất bại:', err.message);
      }
    }

    res.json({ success: true, message: 'Cập nhật hồ sơ thành công!', provider: providers[index] });
  } else {
    res.status(404).json({ success: false, message: 'Lỗi đồng bộ hồ sơ.' });
  }
});

router.get('/dashboard/stats', requireProvider, (req, res) => {
  const provider = getMyProvider(req);
  const orders = db.getCollection('orders') || [];
  
  const myOrders = orders.filter(o => o.providerId === provider.id && isVisibleToProvider(o));
  
  const pending = myOrders.filter(o => o.orderStatus === 'pending').length;
  const processing = myOrders.filter(o => o.orderStatus === 'processing').length;
  const completed = myOrders.filter(o => o.orderStatus === 'completed').length;
  
  // Tổng doanh thu từ các đơn completed
  const totalRevenue = myOrders
    .filter(o => o.orderStatus === 'completed')
    .reduce((sum, o) => sum + Number(o.price || 0), 0);
    
  res.json({
    success: true,
    stats: {
      pendingOrders: pending,
      processingOrders: processing,
      completedOrders: completed,
      totalRevenue,
      rating: provider.rating || 5.0,
      balance: req.authUser.balance || 0
    }
  });
});

router.get('/me/services', requireProvider, (req, res) => {
  const provider = getMyProvider(req);
  const services = (db.getCollection('services') || []).filter(s => s.providerId === provider.id);
  res.json({ success: true, services });
});

router.get('/me/orders', requireProvider, (req, res) => {
  checkAutoReleaseOrders();
  const provider = getMyProvider(req);
  const orders = (db.getCollection('orders') || []).filter(o => o.providerId === provider.id && isVisibleToProvider(o));
  res.json({ success: true, orders });
});

router.get('/me/wallet', requireProvider, (req, res) => {
  const provider = getMyProvider(req);
  const transactions = (db.getCollection('walletTransactions') || []).filter(t => t.userId === req.authUser.id);
  res.json({ 
    success: true, 
    balance: req.authUser.balance || 0,
    transactions 
  });
});

router.post('/wallet/withdraw', requireProvider, (req, res) => {
  const { amount, bankCode, bankAccount } = req.body;
  const numAmount = Number(amount);
  
  if (!numAmount || numAmount <= 0) {
    return res.status(400).json({ success: false, message: 'Số tiền rút không hợp lệ.' });
  }
  
  if (req.authUser.balance < numAmount) {
    return res.status(400).json({ success: false, message: 'Số dư không đủ để rút.' });
  }
  
  // Trừ tiền user
  const users = db.getCollection('users');
  const userIndex = users.findIndex(u => u.id === req.authUser.id);
  if (userIndex !== -1) {
    users[userIndex].balance -= numAmount;
    db.saveCollection('users', users);
  }
  
  // Ghi log giao dịch
  const transactions = db.getCollection('walletTransactions') || [];
  transactions.unshift({
    id: generateId('TXN'),
    userId: req.authUser.id,
    type: 'withdraw',
    amount: numAmount,
    status: 'pending',
    bankCode,
    bankAccount,
    createdAt: formatDateTime(new Date()),
    description: `Yêu cầu rút ${numAmount.toLocaleString('vi-VN')}đ về ngân hàng`
  });
  db.saveCollection('walletTransactions', transactions);
  
  res.json({ success: true, message: 'Đã gửi yêu cầu rút tiền thành công!' });
});


// ---- Thao tác đơn hàng của người bán (đường dẫn mà provider.js đang gọi) ----
function orderAction(handler) {
  return (req, res) => {
    try {
      const order = handler(req);
      res.json({ success: true, message: 'Cập nhật đơn hàng thành công!', order });
    } catch (err) {
      res.status(err.status || 400).json({ success: false, message: err.message });
    }
  };
}
router.post('/orders/:id/accept', requireProvider, orderAction(req => processAcceptOrder(req.params.id, req.authUser.id)));
router.post('/orders/:id/deliver', requireProvider, orderAction(req => processDeliverOrder(req.params.id, req.authUser.id, req.body)));
router.post('/orders/:id/progress', requireProvider, orderAction(req => processProgressOrder(req.params.id, req.authUser.id, req.body)));
router.post('/orders/:id/reject', requireProvider, orderAction(req => processCancelOrder(req.params.id, req.authUser.id, 'Provider', req.body.reason || 'Provider từ chối nhận việc')));
router.post('/orders/:id/cancel', requireProvider, orderAction(req => processCancelOrder(req.params.id, req.authUser.id, 'Provider', req.body.reason || 'Provider hủy đơn hàng')));

// ---- Đánh giá của tôi + trả lời đánh giá ----
router.get('/me/reviews', requireProvider, (req, res) => {
  const provider = getMyProvider(req);
  const reviews = (db.getCollection('reviews') || []).filter(r => r.providerId === provider.id);
  res.json({ success: true, total: reviews.length, reviews });
});

router.post('/reviews/:id/reply', requireProvider, (req, res) => {
  try {
    const review = replyToReview(req.params.id, req.authUser.id, req.body.reply || req.body.content);
    res.json({ success: true, message: 'Đã trả lời đánh giá.', review });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, message: err.message });
  }
});


// Route cố định phải đứng TRƯỚC '/:id' (nếu không Express coi 'packages' là một id).
router.get('/packages', (req, res) => {
  const packages = db.getCollection('packages') || [];
  res.json({ success: true, packages });
});

// Customer favorites are stored per signed-in customer in the database.
router.get('/favorites', requireCustomer, (req, res) => {
  const favorites = (db.getCollection('favoriteProviders') || []).filter(item => item.customerId === req.authUser.id);
  const providers = db.getCollection('providers') || [];
  const favoriteProviders = favorites
    .map(item => providers.find(provider => provider.id === item.providerId))
    .filter(Boolean);
  res.json({ success: true, providerIds: favorites.map(item => item.providerId), providers: favoriteProviders });
});

router.put('/:id/favorite', requireCustomer, (req, res) => {
  const providers = db.getCollection('providers') || [];
  if (!providers.some(provider => provider.id === req.params.id)) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy Provider.' });
  }
  const favorites = db.getCollection('favoriteProviders') || [];
  const exists = favorites.some(item => item.customerId === req.authUser.id && item.providerId === req.params.id);
  if (!exists) favorites.unshift({ customerId: req.authUser.id, providerId: req.params.id, createdAt: new Date().toISOString() });
  db.saveCollection('favoriteProviders', favorites);
  res.json({ success: true, favorited: true, message: 'Đã thêm Provider vào danh sách yêu thích.' });
});

router.delete('/:id/favorite', requireCustomer, (req, res) => {
  const favorites = db.getCollection('favoriteProviders') || [];
  const nextFavorites = favorites.filter(item => !(item.customerId === req.authUser.id && item.providerId === req.params.id));
  db.saveCollection('favoriteProviders', nextFavorites);
  res.json({ success: true, favorited: false, message: 'Đã bỏ Provider khỏi danh sách yêu thích.' });
});

router.get('/:id/availability', (req, res) => {
  const provider = (db.getCollection('providers') || []).find(p => p.id === req.params.id);
  if (!provider) return res.status(404).json({ success: false, message: 'Không tìm thấy Provider.' });
  const monthMatch = String(req.query.month || '').match(/^(\d{4})-(\d{2})$/);
  if (!monthMatch) return res.status(400).json({ success: false, message: 'Tháng không hợp lệ.' });
  const year = Number(monthMatch[1]);
  const month = Number(monthMatch[2]) - 1;
  if (month < 0 || month > 11) return res.status(400).json({ success: false, message: 'Tháng không hợp lệ.' });
  const orders = db.getCollection('orders') || [];
  const availability = {};
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day, 12);
    const slots = slotsForDate(provider, date, orders);
    if (slots.length) {
      const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      availability[iso] = slots;
    }
  }
  res.json({ success: true, availability });
});

router.get('/:id', async (req, res) => {
  const [providers, allServices, allReviews] = await Promise.all([
    db.getCollectionFresh('providers'), db.getCollectionFresh('services'), db.getCollectionFresh('reviews')
  ]);
  const provider = providers.find(p => p.id === req.params.id);
  if (!provider) return res.status(404).json({ success: false, message: 'Không tìm thấy Provider.' });
  const services = allServices.filter(s => s.providerId === provider.id && s.status !== 'inactive');
  const reviews = allReviews.filter(r => r.providerId === provider.id);
  res.json({ success: true, provider, services, reviews });
});

// Thêm các endpoint còn thiếu cho provider
router.put('/hourly-rate', requireProvider, (req, res) => {
  const { hourlyRate } = req.body;
  const providers = db.getCollection('providers');
  const provider = getMyProvider(req);
  const index = providers.findIndex(p => p.id === provider.id);
  if (index !== -1) {
    providers[index].hourlyRate = Number(hourlyRate);
    db.saveCollection('providers', providers);
    res.json({ success: true, message: 'Cập nhật giá giờ thành công' });
  } else {
    res.status(404).json({ success: false, message: 'Không tìm thấy Provider' });
  }
});

router.post('/skills', requireProvider, (req, res) => {
  const { name } = req.body;
  const providers = db.getCollection('providers');
  const provider = getMyProvider(req);
  const index = providers.findIndex(p => p.id === provider.id);
  if (index !== -1) {
    if (!providers[index].skills) providers[index].skills = [];
    if (!providers[index].skills.includes(name)) {
      providers[index].skills.push(name);
      db.saveCollection('providers', providers);
    }
    res.json({ success: true, message: 'Thêm kỹ năng thành công' });
  } else {
    res.status(404).json({ success: false, message: 'Không tìm thấy Provider' });
  }
});

router.delete('/skills/:skillName', requireProvider, (req, res) => {
  const { skillName } = req.params;
  const providers = db.getCollection('providers');
  const provider = getMyProvider(req);
  const index = providers.findIndex(p => p.id === provider.id);
  if (index !== -1) {
    if (providers[index].skills) {
      providers[index].skills = providers[index].skills.filter(s => s !== skillName);
      db.saveCollection('providers', providers);
    }
    res.json({ success: true, message: 'Xóa kỹ năng thành công' });
  } else {
    res.status(404).json({ success: false, message: 'Không tìm thấy Provider' });
  }
});

router.post('/certifications/submit', requireProvider, (req, res) => {
  const { certTitle, issuer, skillName } = req.body;
  const approvals = db.getCollection('skillApprovals') || [];
  approvals.push({
    id: generateId('SKL'),
    providerId: getMyProvider(req).id,
    providerName: getMyProvider(req).name,
    skillName,
    certTitle,
    issuer,
    date: formatDateTime(new Date()),
    status: 'pending'
  });
  db.saveCollection('skillApprovals', approvals);
  res.json({ success: true, message: 'Đã gửi chứng chỉ chờ duyệt' });
});

router.post('/services', requireProvider, (req, res) => {
  const serviceData = req.body;
  const services = db.getCollection('services') || [];
  const p = getMyProvider(req);
  const newSvc = {
    ...serviceData,
    id: generateId('SVC'),
    providerId: p.id,
    providerName: p.name,
    providerAvatar: p.avatar,
    status: 'active'
  };
  services.unshift(newSvc);
  db.saveCollection('services', services);
  res.json({ success: true, message: 'Thêm dịch vụ thành công', service: newSvc });
});

router.put('/services/:id', requireProvider, (req, res) => {
  const serviceData = req.body;
  const services = db.getCollection('services') || [];
  const idx = services.findIndex(s => s.id === req.params.id && s.providerId === getMyProvider(req).id);
  if (idx !== -1) {
    services[idx] = { ...services[idx], ...serviceData };
    db.saveCollection('services', services);
    res.json({ success: true, message: 'Cập nhật dịch vụ thành công', service: services[idx] });
  } else {
    res.status(404).json({ success: false, message: 'Không tìm thấy dịch vụ' });
  }
});

router.put('/services/:id/request-price', requireProvider, (req, res) => {
  // Mock request price change
  res.json({ success: true, message: 'Yêu cầu thay đổi giá đã được gửi' });
});

router.put('/me/bank-account', requireProvider, (req, res) => {
  const { bank, account, holder } = req.body;
  const providers = db.getCollection('providers');
  const provider = getMyProvider(req);
  const index = providers.findIndex(p => p.id === provider.id);
  if (index !== -1) {
    providers[index].bankAccount = { bank, account, holder };
    db.saveCollection('providers', providers);
    res.json({ success: true, message: 'Cập nhật tài khoản ngân hàng thành công' });
  } else {
    res.status(404).json({ success: false, message: 'Không tìm thấy Provider' });
  }
});

router.get('/me/complaints', requireProvider, (req, res) => {
  const complaints = (db.getCollection('complaints') || []).filter(c => c.defendantId === getMyProvider(req).id);
  res.json({ success: true, complaints });
});

router.post('/complaints/:id/defense', requireProvider, (req, res) => {
  const { providerClaim } = req.body;
  const complaints = db.getCollection('complaints') || [];
  const idx = complaints.findIndex(c => c.id === req.params.id && c.defendantId === getMyProvider(req).id);
  if (idx !== -1) {
    complaints[idx].providerClaim = providerClaim;
    complaints[idx].status = 'pending_review';
    db.saveCollection('complaints', complaints);
    res.json({ success: true, message: 'Đã gửi giải trình' });
  } else {
    res.status(404).json({ success: false, message: 'Không tìm thấy khiếu nại' });
  }
});

router.post('/packages/purchase', requireProvider, (req, res) => {
  const { packageId } = req.body;
  const packages = db.getCollection('packages') || [];
  const pkg = packages.find(p => p.id === packageId);
  if (!pkg) return res.status(404).json({ success: false, message: 'Gói dịch vụ không tồn tại.' });
  
  const purchases = db.getCollection('packagePurchases') || [];
  const provider = getMyProvider(req);
  const users = db.getCollection('users') || [];
  const uidx = users.findIndex(u => u.id === req.authUser.id);
  
  if (uidx === -1) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản người dùng.' });
  }

  const currentBal = Number(users[uidx].balance) || 0;

  // Kiểm tra số dư ví nếu gói có phí
  if (pkg.price > 0) {
    if (currentBal < pkg.price) {
      return res.status(400).json({
        success: false,
        message: `Số dư ví không đủ (Cần ${pkg.price.toLocaleString('vi-VN')}đ, hiện có ${currentBal.toLocaleString('vi-VN')}đ). Vui lòng nạp thêm tiền vào ví để kích hoạt gói.`
      });
    }

    // Khấu trừ số dư ví chuyên gia
    users[uidx].balance = currentBal - pkg.price;
    db.saveCollection('users', users);
    
    // Ghi log giao dịch ví chuyên gia (tiền vào doanh thu sàn)
    const transactions = db.getCollection('walletTransactions') || [];
    transactions.unshift({
      id: generateId('TXN'),
      userId: req.authUser.id,
      userName: provider.name || req.authUser.name || 'Chuyên gia',
      type: 'package_purchase',
      amount: -pkg.price,
      balanceAfter: users[uidx].balance,
      status: 'completed',
      createdAt: formatDateTime(new Date()),
      description: `Mua gói dịch vụ sàn: ${pkg.name}`
    });
    db.saveCollection('walletTransactions', transactions);
  }

  // Cập nhật huy hiệu và đặc quyền cho Provider
  const providers = db.getCollection('providers') || [];
  const provIdx = providers.findIndex(p => p.id === provider.id || p.userId === req.authUser.id);
  if (provIdx !== -1) {
    if (pkg.id === 'PKG_PRO') {
      providers[provIdx].badge = 'PRO PROVIDER';
      providers[provIdx].verified = true;
      providers[provIdx].activePackage = 'PKG_PRO';
    } else if (pkg.id === 'PKG_VIP') {
      providers[provIdx].badge = 'VIP ELITE';
      providers[provIdx].verified = true;
      providers[provIdx].activePackage = 'PKG_VIP';
    }
    db.saveCollection('providers', providers);
  }

  // Lưu lịch sử đăng ký gói
  purchases.unshift({
    id: generateId('PKG-ORD'),
    providerId: provider.id,
    provider: provider.name,
    packageName: pkg.name,
    amount: (pkg.price || 0).toLocaleString('vi-VN') + 'đ',
    amountNum: pkg.price || 0,
    activeDate: formatDateTime(new Date()).split(' ')[0],
    expireDate: 'Tự động gia hạn 30 ngày',
    status: 'Đang hoạt động'
  });
  db.saveCollection('packagePurchases', purchases);

  const { createNotification } = require('../services/notificationService');
  createNotification(req.authUser.id, 'Kích hoạt gói dịch vụ thành công',
    `Bạn đã kích hoạt thành công ${pkg.name}. Huy hiệu và đặc quyền ưu tiên của bạn đã hiển thị trên toàn sàn!`,
    'success', '/package.html');

  res.json({
    success: true,
    message: `Đã kích hoạt thành công ${pkg.name}!`,
    newBalance: users[uidx].balance,
    package: pkg
  });
});

router.get('/me/posts', requireProvider, async (req, res) => {
  try {
    const provider = await getMyProviderFresh(req);
    if (!provider) return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ Provider.' });
    const snapshot = await firestore.collection('posts').where('providerId', '==', provider.id).get();
    const posts = snapshot.docs.map(doc => doc.data())
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    res.json({ success: true, posts });
  } catch (err) {
    console.error('[providers] Không tải được bài đăng:', err.message);
    res.status(503).json({ success: false, message: 'Chưa tải được bài đăng từ hệ thống.' });
  }
});

router.get('/:id/posts', async (req, res) => {
  try {
    const snapshot = await firestore.collection('posts').where('providerId', '==', req.params.id).get();
    const posts = snapshot.docs.map(doc => doc.data())
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    res.json({ success: true, posts });
  } catch (err) {
    console.error('[providers] Không tải được bài đăng công khai:', err.message);
    res.status(503).json({ success: false, message: 'Chưa tải được bài đăng từ hệ thống.' });
  }
});

router.post('/posts', requireProvider, async (req, res) => {
  const postData = req.body || {};
  const title = String(postData.title || '').trim();
  const content = String(postData.content || '').trim();
  if (!title || !content) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập tiêu đề và nội dung bài viết.' });
  }
  let provider;
  try {
    provider = await getMyProviderFresh(req);
  } catch (err) {
    console.error('[providers] Không tải được hồ sơ Provider:', err.message);
    return res.status(503).json({ success: false, message: 'Chưa xác minh được hồ sơ Provider.' });
  }
  if (!provider) return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ Provider.' });
  const id = generateId('POST');
  const now = new Date();
  const post = {
    title,
    category: String(postData.category || '').trim(),
    summary: String(postData.summary || content.slice(0, 150)).trim(),
    content,
    id,
    providerId: provider.id,
    providerName: provider.name,
    date: formatDateTime(now).split(' ')[0],
    createdAt: now.toISOString(),
    likes: 0
  };
  try {
    await firestore.collection('posts').doc(id).create(post);
    res.status(201).json({ success: true, message: 'Đăng bài thành công', post });
  } catch (err) {
    console.error('[providers] Không lưu được bài đăng:', err.message);
    res.status(503).json({ success: false, message: 'Chưa lưu được bài đăng lên hệ thống. Vui lòng thử lại.' });
  }
});

/* ============================================================
   GET /api/providers
   Danh sách Provider + filter + sort + priceRange
============================================================ */

router.get('/', async (req, res) => {

  const {
    category,
    search,
    skill,
    minRating,
    minPrice,
    maxPrice,
    verified,
    sort,
    limit
  } = req.query;


  /* ==========================================================
     LẤY TOÀN BỘ PROVIDER
  ========================================================== */

  const allProviders = await db.getCollectionFresh('providers');


  /* ==========================================================
     TÍNH KHOẢNG GIÁ THỰC TẾ TỪ DATABASE

     HTML slider sẽ dùng:
     priceRange.min
     priceRange.max

     Không hard-code 0 - 2.000.000
  ========================================================== */

  const providerPrices = allProviders

      .map(provider =>
          Number(provider.hourlyRate)
      )

      .filter(price =>
          Number.isFinite(price) &&
          price >= 0
      );


  let priceRange = {
    min: 0,
    max: 0
  };


  if (providerPrices.length > 0) {

    priceRange.min =
        Math.min(...providerPrices);

    priceRange.max =
        Math.max(...providerPrices);

  }


  /* ==========================================================
     COPY ARRAY

     Không filter trực tiếp lên collection gốc.
  ========================================================== */

  let providers =
      [...allProviders];


  /* ==========================================================
     CATEGORY

     HTML gửi:
     ?category=IT
     ?category=Design
     ?category=Marketing
     ...
  ========================================================== */

  if (
      category &&
      category !== 'all'
  ) {

    const categoryLower =
        category
            .toLowerCase()
            .trim();


    providers =
        providers.filter(provider => {

          if (!provider.category) {
            return false;
          }


          return provider.category
              .toLowerCase()
              .includes(categoryLower);

        });

  }


  /* ==========================================================
     SKILL

     HTML gửi:
     ?skill=...
  ========================================================== */

  if (skill) {

    const skillLower =
        skill
            .toLowerCase()
            .trim();


    providers =
        providers.filter(provider => {

          if (
              !Array.isArray(
                  provider.skills
              )
          ) {

            return false;

          }


          return provider.skills.some(
              item =>
                  String(item)
                      .toLowerCase()
                      .includes(skillLower)
          );

        });

  }


  /* ==========================================================
     SEARCH

     HTML gửi:
     ?search=...

     Tìm trong:
     name
     specialty
     bio
     location
     skills
  ========================================================== */

  if (search) {

    const normalizeSearchText = value => String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

    const searchTerms = normalizeSearchText(search).split(/\s+/).filter(Boolean);


    providers =
        providers.filter(provider => {
          const searchableText = normalizeSearchText([
            provider.name,
            provider.specialty,
            provider.bio,
            provider.location,
            provider.category,
            ...(Array.isArray(provider.skills) ? provider.skills : [])
          ].join(' '));

          return searchTerms.length > 0 && searchTerms.every(term => searchableText.includes(term));

        });

  }


  /* ==========================================================
     MIN RATING

     HTML gửi:
     ?minRating=4.5
     ?minRating=4.8
  ========================================================== */

  if (
      minRating !== undefined &&
      minRating !== ''
  ) {

    const ratingValue =
        Number(minRating);


    if (
        Number.isFinite(ratingValue) &&
        ratingValue > 0
    ) {

      providers =
          providers.filter(provider => {

            const rating =
                Number(
                    provider.rating || 0
                );


            return rating >= ratingValue;

          });

    }

  }


  /* ==========================================================
     MIN PRICE

     HTML slider gửi:
     ?minPrice=...
  ========================================================== */

  if (
      minPrice !== undefined &&
      minPrice !== ''
  ) {

    const minPriceValue =
        Number(minPrice);


    if (
        Number.isFinite(
            minPriceValue
        )
    ) {

      providers =
          providers.filter(provider => {

            const hourlyRate =
                Number(
                    provider.hourlyRate || 0
                );


            return (
                hourlyRate >=
                minPriceValue
            );

          });

    }

  }


  /* ==========================================================
     MAX PRICE

     HTML slider gửi:
     ?maxPrice=...
  ========================================================== */

  if (
      maxPrice !== undefined &&
      maxPrice !== ''
  ) {

    const maxPriceValue =
        Number(maxPrice);


    if (
        Number.isFinite(
            maxPriceValue
        )
    ) {

      providers =
          providers.filter(provider => {

            const hourlyRate =
                Number(
                    provider.hourlyRate || 0
                );


            return (
                hourlyRate <=
                maxPriceValue
            );

          });

    }

  }


  /* ==========================================================
     VERIFIED

     HTML gửi:
     ?verified=true
  ========================================================== */

  if (
      verified === 'true'
  ) {

    providers =
        providers.filter(provider =>
            provider.verified === true
        );

  }


  /* ==========================================================
     SORT

     HTML có:

     rating
     price-asc
     price-desc
     orders
  ========================================================== */

  if (
      sort === 'rating'
  ) {

    providers.sort(
        (a, b) =>
            Number(b.rating || 0) -
            Number(a.rating || 0)
    );

  }


  else if (
      sort === 'price-asc'
  ) {

    providers.sort(
        (a, b) =>
            Number(a.hourlyRate || 0) -
            Number(b.hourlyRate || 0)
    );

  }


  else if (
      sort === 'price-desc'
  ) {

    providers.sort(
        (a, b) =>
            Number(b.hourlyRate || 0) -
            Number(a.hourlyRate || 0)
    );

  }


  else if (
      sort === 'orders'
  ) {

    providers.sort(
        (a, b) =>
            Number(b.completedOrders || 0) -
            Number(a.completedOrders || 0)
    );

  }


  /* ==========================================================
     TOTAL

     total phải được tính SAU KHI FILTER
     nhưng TRƯỚC khi limit.
  ========================================================== */

  const total =
      providers.length;


  /* ==========================================================
     LIMIT

     Ví dụ:
     /api/providers?limit=10
  ========================================================== */

  if (
      limit &&
      !isNaN(limit)
  ) {

    const limitNumber =
        Number(limit);


    if (
        limitNumber > 0
    ) {

      providers =
          providers.slice(
              0,
              limitNumber
          );

    }

  }


  /* ==========================================================
     RESPONSE

     HTML cần:

     success
     total
     providers
     priceRange
  ========================================================== */

  res.json({

    success: true,

    total: total,

    providers: providers,

    priceRange: priceRange

  });

});


module.exports = router;
