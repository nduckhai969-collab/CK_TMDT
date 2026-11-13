const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const db = require('../data/db');
const { slotsForDate } = require('./providerAvailability');
const { requireCustomer, requireProvider, requireSignedIn } = require('./customerAuth');
const { generateId } = require('../utils/id');
const { formatDateTime } = require('../utils/dates');
const { processAcceptOrder, processDeliverOrder, processProgressOrder, processCancelOrder, checkAutoReleaseOrders } = require('../services/orderService');
const { isVisibleToProvider, createGatewayTransaction, MIN_PAYMENT, MAX_PAYMENT } = require('../services/checkoutService');
const { replyToReview } = require('../services/reviewService');
const walletService = require('../services/walletService');
const providerPackageService = require('../services/providerPackageService');
const { attachProviderReputation, addReviewSentimentPoints } = require('../services/providerReputation');
const { allowedFrontendOrigin } = require('../utils/webOrigin');

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
      name: req.authUser.name || 'Chuyên Gia Mới',
      avatar: req.authUser.avatar || '',
      cover: req.authUser.cover || '',
      email: req.authUser.email || '',
      phone: req.authUser.phone || '',
      rating: 5.0,
      reviews: 0,
      completedOrders: 0,
      createdAt: formatDateTime(new Date()),
      verified: false,
      hourlyRate: null,
      specialty: '',
      category: '',
      skills: [],
      availabilityStatus: 'inactive',
      profileCompleted: false,
      workingHours: '',
      schedule: { mode: 'inactive', slots: [] },
      dateExceptions: {}
    };
    providers.unshift(p);
    db.saveCollection('providers', providers);
  } else {
    let changed = false;
    const templateSkills = Array.isArray(p.skills) && p.skills.length === 2 && p.skills[0] === 'Chuyên môn' && p.skills[1] === 'Làm việc chuyên nghiệp';
    if (!p.profileCompleted && p.specialty === 'Chuyên gia kỹ năng & Tư vấn' && p.category === 'IT' && templateSkills && Number(p.hourlyRate) === 200000) {
      p.specialty = '';
      p.category = '';
      p.skills = [];
      p.hourlyRate = null;
      p.availabilityStatus = 'inactive';
      changed = true;
    }
    if (!p.schedule || !Array.isArray(p.schedule.slots) || p.schedule.slots.length === 0) {
      p.schedule = { mode: p.availabilityStatus || 'inactive', slots: [] };
      changed = true;
    }
    if (!p.availabilityStatus) {
      p.availabilityStatus = 'ready';
      changed = true;
    }
    if (p.workingHours === undefined || p.workingHours === null) {
      p.workingHours = '';
      changed = true;
    }
    if (changed) {
      db.saveCollection('providers', providers);
    }
  }
  return p;
}

async function getMyProviderFresh(req) {
  const providers = await db.getCollectionFresh('providers');
  return providers.find(p => p.userId === req.authUser.id || p.id === req.authUser.id) ||
    (req.authUser.email && providers.find(p => p.email && p.email.toLowerCase() === req.authUser.email.toLowerCase())) || null;
}

function attachPublicServiceSummary(provider, services = []) {
  const providerServices = services.filter(service =>
    String(service.providerId) === String(provider.id) &&
    (service.status || 'active') === 'active'
  );
  const prices = providerServices.map(service => Number(service.price)).filter(price => Number.isFinite(price) && price > 0);
  return {
    ...provider,
    servicePackageCount: providerServices.length,
    startingPackagePrice: prices.length ? Math.min(...prices) : null
  };
}

// Homepage summaries and provider detail endpoints used by the customer portal.
router.get('/stats', async (req, res) => {
  const [providers, jobs, services, reviews] = await Promise.all([
    db.getCollectionFresh('providers'), db.getCollectionFresh('jobRequests'), db.getCollectionFresh('services'), db.getCollectionFresh('reviews')
  ]);
  const ratings = providers.map(provider => attachProviderReputation(provider, reviews.filter(review => review.providerId === provider.id)).rating).filter(Number.isFinite);
  const skills = new Set(providers.flatMap(p => Array.isArray(p.skills) ? p.skills : []));
  res.json({
    success: true,
    stats: {
      activeProviders: providers.filter(provider => provider.verified === true).length,
      skillsCount: skills.size + services.length,
      requestsCreated: jobs.length,
      avgRating: ratings.length ? `${(ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length).toFixed(1)}/5` : '0/5'
    }
  });
});

router.get('/featured', async (req, res) => {
  const [allProviders, reviews, services] = await Promise.all([db.getCollectionFresh('providers'), db.getCollectionFresh('reviews'), db.getCollectionFresh('services')]);
  const providers = allProviders
    .filter(provider => provider.verified === true)
    .map(provider => attachPublicServiceSummary(attachProviderReputation(provider, reviews.filter(review => review.providerId === provider.id)), services))
    .sort((a, b) => Number(b.completedOrders || 0) - Number(a.completedOrders || 0) || Number(b.rating || 0) - Number(a.rating || 0))
    .slice(0, 6);
  res.json({ success: true, providers });
});

router.get('/newest', async (req, res) => {
  const [allProviders, reviews, services] = await Promise.all([db.getCollectionFresh('providers'), db.getCollectionFresh('reviews'), db.getCollectionFresh('services')]);
  const providers = allProviders
    .filter(provider => provider.verified === true)
    .map(provider => attachPublicServiceSummary(attachProviderReputation(provider, reviews.filter(review => review.providerId === provider.id)), services))
    .sort((a, b) => new Date(b.createdAt || b.joinDate || 0) - new Date(a.createdAt || a.joinDate || 0));
  if (providers.every(p => !p.createdAt && !p.joinDate)) providers.reverse();
  res.json({ success: true, providers: providers.slice(0, 6) });
});

function detectImageType(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

// LƯU Ý: các route cố định ('/me', '/dashboard/stats'...) phải đứng TRƯỚC '/:id', nếu không Express coi 'me' là một id.
/* ==========================================================
   PROVIDER DASHBOARD APIs
========================================================== */

router.get('/me', requireProvider, async (req, res) => {
  const provider = getMyProvider(req);
  providerPackageService.getPlan(provider);
  const providers = db.getCollection('providers') || [];
  const pIdx = providers.findIndex(p => p.id === provider.id);
  if (pIdx !== -1) {
    let needSave = false;
    if (req.authUser && req.authUser.avatar && (!providers[pIdx].avatar || providers[pIdx].avatar.includes('unsplash')) && !req.authUser.avatar.includes('unsplash')) {
      providers[pIdx].avatar = req.authUser.avatar;
      provider.avatar = req.authUser.avatar;
      needSave = true;
    } else if (providers[pIdx].avatar && req.authUser && (!req.authUser.avatar || req.authUser.avatar.includes('unsplash')) && !providers[pIdx].avatar.includes('unsplash')) {
      req.authUser.avatar = providers[pIdx].avatar;
      const users = db.getCollection('users') || [];
      const uIdx = users.findIndex(u => u.id === req.authUser.id || u.id === provider.userId);
      if (uIdx !== -1) {
        users[uIdx].avatar = providers[pIdx].avatar;
        db.saveCollection('users', users);
      }
    }
    if (needSave) {
      db.saveCollection('providers', providers);
    }
  }
  const [servicesCollection, freshReviews] = await Promise.all([
    db.getCollectionFresh('services'),
    require('./reviewRoutes').refreshStoredReviewAnalyses()
  ]);
  const services = (servicesCollection || []).filter(s => s.providerId === provider.id);
  const reviews = freshReviews.filter(review => review.providerId === provider.id);
  return res.json({ success: true, provider: attachProviderReputation(provider, reviews), services });
});

router.put('/profile', requireProvider, async (req, res) => {
  const provider = getMyProvider(req);
  const providers = db.getCollection('providers');
  const index = providers.findIndex(p => p.id === provider.id);
  
  if (index !== -1) {
    const { name, phone, avatar, cover, bio, specialty, category, location, skills, hourlyRate, hourlyEnabled, minWeeklyHours, bankAccount, bankName, profileCompleted, experiences, education, certifications, portfolioLinks, languages, responseRate, onTimeRate, maxProjects, leadTime } = req.body || {};
    const cleanSkills = Array.isArray(skills) ? skills.map(skill => String(skill).trim()).filter(Boolean) : (typeof skills === 'string' ? skills.split(',').map(skill => skill.trim()).filter(Boolean) : null);
    if (profileCompleted) {
      const price = Number(hourlyRate);
      if (!String(specialty || '').trim() || !String(category || '').trim() || !String(location || '').trim() || !Number.isFinite(price) || price < 50000 || !cleanSkills?.length || !String(bio || '').trim()) {
        return res.status(400).json({ success: false, message: 'Vui lòng nhập chức danh, lĩnh vực, khu vực, giá giờ, kỹ năng và phần giới thiệu trước khi hoàn tất hồ sơ.' });
      }
    }
    if (name !== undefined && String(name).trim()) providers[index].name = String(name).trim();
    if (phone !== undefined) providers[index].phone = String(phone).trim();
    if (avatar !== undefined && avatar) providers[index].avatar = avatar;
    if (cover !== undefined) providers[index].cover = cover;
    if (bio !== undefined) providers[index].bio = bio;
    if (specialty !== undefined) providers[index].specialty = specialty;
    if (category !== undefined) providers[index].category = category;
    if (location !== undefined) providers[index].location = location;
    if (skills !== undefined) providers[index].skills = cleanSkills || [];
    if (hourlyRate !== undefined) providers[index].hourlyRate = Number(hourlyRate);
    if (hourlyEnabled !== undefined) providers[index].hourlyEnabled = Boolean(hourlyEnabled);
    if (minWeeklyHours !== undefined) providers[index].minWeeklyHours = Number(minWeeklyHours) || null;
    if (experiences !== undefined) providers[index].experiences = Array.isArray(experiences) ? experiences : [];
    if (education !== undefined) providers[index].education = Array.isArray(education) ? education : [];
    if (certifications !== undefined) providers[index].certifications = Array.isArray(certifications) ? certifications : [];
    if (portfolioLinks !== undefined) providers[index].portfolioLinks = portfolioLinks && typeof portfolioLinks === 'object' ? portfolioLinks : {};
    if (languages !== undefined) providers[index].languages = languages;
    if (responseRate !== undefined) providers[index].responseRate = Number(responseRate);
    if (onTimeRate !== undefined) providers[index].onTimeRate = Number(onTimeRate);
    if (maxProjects !== undefined) providers[index].maxProjects = Number(maxProjects);
    if (leadTime !== undefined) providers[index].leadTime = Number(leadTime);
    if (bankAccount !== undefined) providers[index].bankAccount = bankAccount;
    if (bankName !== undefined) providers[index].bankName = bankName;
    if (profileCompleted === true) {
      providers[index].profileCompleted = true;
      if (providers[index].verified !== true) {
        providers[index].availabilityStatus = 'inactive';
        providers[index].reviewStatus = 'pending';
        delete providers[index].rejectReason;
      } else {
        providers[index].availabilityStatus = 'ready';
      }
    }
    
    db.saveCollection('providers', providers);

    // Đồng bộ sang collection 'users'
    const users = db.getCollection('users');
    const uIndex = users.findIndex(u => u.id === req.authUser.id || u.id === provider.userId);
    if (uIndex !== -1) {
      if (name !== undefined && String(name).trim()) users[uIndex].name = String(name).trim();
      if (phone !== undefined) users[uIndex].phone = String(phone).trim();
      if (avatar !== undefined && avatar) users[uIndex].avatar = avatar;
      if (cover !== undefined) users[uIndex].cover = cover;
      if (location !== undefined) users[uIndex].address = location;
      if (bio !== undefined) users[uIndex].bio = bio;
      db.saveCollection('users', users);
    }

    res.json({ success: true, message: 'Cập nhật hồ sơ thành công!', provider: providers[index] });
  } else {
    res.status(404).json({ success: false, message: 'Lỗi đồng bộ hồ sơ.' });
  }
});

// Upload avatar cho Provider (Hỗ trợ cả Base64 JSON và Raw Binary, PUT & POST, /profile/avatar & /avatar)
const handleProviderAvatarUpload = async (req, res) => {
  let fileBuffer = null;
  let extension = null;
  let customUrl = null;

  if (Buffer.isBuffer(req.body) && req.body.length > 0) {
    fileBuffer = req.body;
    extension = detectImageType(fileBuffer);
  } else if (req.body && typeof req.body === 'object' && req.body.avatar) {
    const rawVal = String(req.body.avatar).trim();
    if (rawVal.startsWith('data:image/')) {
      const match = /^data:image\/([a-zA-Z0-9+.-]+);base64,([\s\S]+)$/.exec(rawVal);
      if (match) {
        let ext = match[1].toLowerCase();
        if (ext === 'jpeg') ext = 'jpg';
        fileBuffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
        extension = detectImageType(fileBuffer) || (['jpg', 'png', 'webp', 'gif'].includes(ext) ? ext : 'jpg');
      }
    } else if (rawVal.startsWith('http://') || rawVal.startsWith('https://')) {
      customUrl = rawVal;
    }
  }

  if (!fileBuffer && !customUrl) {
    return res.status(400).json({ success: false, message: 'Vui lòng chọn ảnh JPG, PNG hoặc WebP.' });
  }

  try {
    const provider = getMyProvider(req);
    const providers = db.getCollection('providers') || [];
    let index = providers.findIndex(p => p.id === provider.id);
    if (index === -1) {
      providers.unshift(provider);
      index = 0;
    }

    const uid = String(req.authUser?.id || provider.id).replace(/[^a-zA-Z0-9_-]/g, '');
    let avatar = customUrl;
    if (fileBuffer) {
      if (!extension) {
        extension = 'jpg';
      }
      const fileName = `${randomUUID()}.${extension}`;
      const relativePath = path.posix.join('avatars', uid, fileName);
      const uploadRoot = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads'));
      const absolutePath = path.resolve(uploadRoot, ...relativePath.split('/'));
      if (!absolutePath.toLowerCase().startsWith(uploadRoot.toLowerCase() + path.sep)) {
        return res.status(400).json({ success: false, message: 'Đường dẫn lưu ảnh không hợp lệ.' });
      }
      await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.promises.writeFile(absolutePath, fileBuffer);
      avatar = `${req.protocol}://${req.get('host')}/uploads/${relativePath.split('/').map(encodeURIComponent).join('/')}`;
    }
    const previousAvatar = providers[index].avatar;
    providers[index].avatar = avatar;
    db.saveCollection('providers', providers);

    // Đồng bộ sang collection 'users'
    const users = db.getCollection('users') || [];
    const uIndex = users.findIndex(u => u.id === req.authUser.id || u.id === provider.userId);
    if (uIndex !== -1) {
      users[uIndex].avatar = avatar;
      db.saveCollection('users', users);
    }

    // Xóa file cũ
    if (previousAvatar) {
      try {
        const previousUrl = new URL(previousAvatar, avatar);
        const previousPath = decodeURIComponent(previousUrl.pathname);
        if (previousUrl.origin === new URL(avatar).origin && previousPath.startsWith('/uploads/avatars/')) {
          const oldFile = path.resolve(uploadRoot, ...previousPath.slice('/uploads/'.length).split('/'));
          if (oldFile.toLowerCase().startsWith(uploadRoot.toLowerCase() + path.sep) && oldFile !== absolutePath) {
            await fs.promises.unlink(oldFile).catch(() => {});
          }
        }
      } catch (_) {}
    }

    return res.json({ success: true, message: 'Đã cập nhật ảnh đại diện.', avatar, provider: providers[index] });
  } catch (err) {
    console.error('[provider] Upload avatar:', err.message);
    return res.status(500).json({ success: false, message: 'Không thể lưu ảnh đại diện lúc này: ' + err.message });
  }
};

router.put(['/profile/avatar', '/avatar'], requireProvider, express.raw({ type: ['image/*', 'application/octet-stream'], limit: '15mb' }), handleProviderAvatarUpload);
router.post(['/profile/avatar', '/avatar'], requireProvider, express.raw({ type: ['image/*', 'application/octet-stream'], limit: '15mb' }), handleProviderAvatarUpload);

// Upload cover (ảnh bìa) cho Provider (Hỗ trợ cả PUT & POST, /profile/cover & /cover)
const handleProviderCoverUpload = async (req, res) => {
  let fileBuffer = null;
  let extension = null;
  let customUrl = null;

  if (Buffer.isBuffer(req.body) && req.body.length > 0) {
    fileBuffer = req.body;
    extension = detectImageType(fileBuffer);
  } else if (req.body && typeof req.body === 'object' && (req.body.cover || req.body.avatar)) {
    const rawVal = String(req.body.cover || req.body.avatar).trim();
    if (rawVal.startsWith('data:image/')) {
      const match = /^data:image\/([a-zA-Z0-9+.-]+);base64,([\s\S]+)$/.exec(rawVal);
      if (match) {
        let ext = match[1].toLowerCase();
        if (ext === 'jpeg') ext = 'jpg';
        fileBuffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
        extension = detectImageType(fileBuffer) || (['jpg', 'png', 'webp', 'gif'].includes(ext) ? ext : 'jpg');
      }
    } else if (rawVal.startsWith('http://') || rawVal.startsWith('https://')) {
      customUrl = rawVal;
    }
  }

  if (!fileBuffer && !customUrl) {
    return res.status(400).json({ success: false, message: 'Vui lòng chọn ảnh JPG, PNG hoặc WebP.' });
  }

  try {
    const provider = getMyProvider(req);
    const providers = db.getCollection('providers') || [];
    let index = providers.findIndex(p => p.id === provider.id);
    if (index === -1) {
      providers.unshift(provider);
      index = 0;
    }

    const uid = String(req.authUser?.id || provider.id).replace(/[^a-zA-Z0-9_-]/g, '');
    let cover = customUrl;

    if (fileBuffer) {
      if (!extension) {
        extension = 'jpg';
      }
      const fileName = `${randomUUID()}.${extension}`;
      const relativePath = path.posix.join('covers', uid, fileName);
      const uploadRoot = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads'));
      const absolutePath = path.resolve(uploadRoot, ...relativePath.split('/'));
      if (!absolutePath.toLowerCase().startsWith(uploadRoot.toLowerCase() + path.sep)) {
        return res.status(400).json({ success: false, message: 'Đường dẫn lưu ảnh không hợp lệ.' });
      }

      await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.promises.writeFile(absolutePath, fileBuffer);
      cover = `${req.protocol}://${req.get('host')}/uploads/${relativePath.split('/').map(encodeURIComponent).join('/')}`;
    }
    const previousCover = providers[index].cover;
    providers[index].cover = cover;
    db.saveCollection('providers', providers);

    // Đồng bộ sang collection 'users'
    const users = db.getCollection('users') || [];
    const uIndex = users.findIndex(u => u.id === req.authUser.id || u.id === provider.userId);
    if (uIndex !== -1) {
      users[uIndex].cover = cover;
      db.saveCollection('users', users);
    }

    // Xóa file cũ
    if (previousCover) {
      try {
        const previousUrl = new URL(previousCover, cover);
        const previousPath = decodeURIComponent(previousUrl.pathname);
        if (previousUrl.origin === new URL(cover).origin && previousPath.startsWith('/uploads/covers/')) {
          const oldFile = path.resolve(uploadRoot, ...previousPath.slice('/uploads/'.length).split('/'));
          if (oldFile.toLowerCase().startsWith(uploadRoot.toLowerCase() + path.sep) && oldFile !== absolutePath) {
            await fs.promises.unlink(oldFile).catch(() => {});
          }
        }
      } catch (_) {}
    }

    return res.json({ success: true, message: 'Đã cập nhật ảnh bìa thành công!', cover, provider: providers[index] });
  } catch (err) {
    console.error('[provider] Upload cover:', err.message);
    return res.status(500).json({ success: false, message: 'Không thể lưu ảnh bìa lúc này: ' + err.message });
  }
};

router.put(['/profile/cover', '/cover'], requireProvider, express.raw({ type: ['image/*', 'application/octet-stream'], limit: '15mb' }), handleProviderCoverUpload);
router.post(['/profile/cover', '/cover'], requireProvider, express.raw({ type: ['image/*', 'application/octet-stream'], limit: '15mb' }), handleProviderCoverUpload);

// ============================================================================
// 14. CẬP NHẬT THÔNG TIN HỒ SƠ NGƯỜI BÁN (PROVIDER PROFILE)
// GET & PUT /api/providers/profile
// Đối với Người bán (Provider), ngoài họ tên/số điện thoại, họ sẽ cần cập nhật thêm
// các trường đặc thù vào bảng providers như: Tên thương hiệu/Kỹ năng, Mô tả dịch vụ,
// Giá thuê theo giờ/ngày, và Ảnh đại diện/Ảnh bìa.
// ============================================================================
router.get(['/profile', '/me/profile'], requireSignedIn, (req, res) => {
  const provider = getMyProvider(req);
  res.json({
    success: true,
    provider,
    user: req.authUser
  });
});

router.put(['/me/profile'], requireSignedIn, (req, res) => {
  try {
    const {
      name,
      phone,
      specialty,
      brandName,
      headline,
      category,
      skills,
      bio,
      description,
      hourlyRate,
      dailyRate,
      location,
      address,
      avatar,
      cover,
      availabilityStatus,
      workingHours
    } = req.body || {};

    const provider = getMyProvider(req);
    const providers = db.getCollection('providers') || [];
    let pIndex = providers.findIndex(p => p.id === provider.id);
    if (pIndex === -1) {
      providers.unshift(provider);
      pIndex = 0;
    }
    const prov = providers[pIndex];

    // Cập nhật các trường đặc thù của Provider vào bảng providers
    const effectiveSpecialty = specialty !== undefined ? specialty : (brandName !== undefined ? brandName : headline);
    if (effectiveSpecialty !== undefined) prov.specialty = String(effectiveSpecialty).trim();

    if (category !== undefined) prov.category = String(category).trim();

    const effectiveBio = bio !== undefined ? bio : description;
    if (effectiveBio !== undefined) prov.bio = String(effectiveBio).trim();

    if (hourlyRate !== undefined && hourlyRate !== null && hourlyRate !== '') {
      prov.hourlyRate = Number(String(hourlyRate).replace(/[^0-9]/g, '')) || 0;
    }

    if (dailyRate !== undefined && dailyRate !== null && dailyRate !== '') {
      prov.dailyRate = Number(String(dailyRate).replace(/[^0-9]/g, '')) || 0;
    } else if (prov.hourlyRate > 0 && !prov.dailyRate) {
      prov.dailyRate = prov.hourlyRate * 8; // Ước tính 8h/ngày
    }

    if (skills !== undefined) {
      if (Array.isArray(skills)) {
        prov.skills = skills.map(s => String(s).trim()).filter(Boolean);
      } else if (typeof skills === 'string') {
        prov.skills = skills.split(',').map(s => s.trim()).filter(Boolean);
      }
    }

    const effectiveLocation = location !== undefined ? location : address;
    if (effectiveLocation !== undefined) prov.location = String(effectiveLocation).trim();

    if (name !== undefined && String(name).trim()) prov.name = String(name).trim();
    if (phone !== undefined) prov.phone = String(phone).trim();
    if (avatar) prov.avatar = String(avatar).trim();
    if (cover) prov.cover = String(cover).trim();
    if (availabilityStatus) prov.availabilityStatus = availabilityStatus;
    if (workingHours !== undefined) prov.workingHours = String(workingHours).trim();

    prov.profileCompleted = true;
    prov.updatedAt = new Date().toISOString();
    db.saveCollection('providers', providers);

    // Đồng bộ các trường thông tin cơ bản sang bảng users
    const users = db.getCollection('users') || [];
    const uIndex = users.findIndex(u => u.id === req.authUser.id || u.id === prov.userId);
    let updatedUser = null;
    if (uIndex !== -1) {
      const u = users[uIndex];
      if (prov.name) u.name = prov.name;
      if (prov.phone) u.phone = prov.phone;
      if (prov.avatar) u.avatar = prov.avatar;
      if (prov.cover) u.cover = prov.cover;
      if (prov.location) u.address = prov.location;
      if (prov.bio) u.bio = prov.bio;
      u.updatedAt = new Date().toISOString();
      db.saveCollection('users', users);
      updatedUser = u;
    }

    console.log(`[provider] ✅ Đã cập nhật hồ sơ Người bán: ${prov.name} (${prov.id})`);
    return res.json({
      success: true,
      message: 'Cập nhật thông tin hồ sơ Người bán thành công!',
      provider: prov,
      user: updatedUser
    });
  } catch (err) {
    console.error('[provider] Lỗi cập nhật profile:', err);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi cập nhật hồ sơ người bán: ' + err.message });
  }
});

router.get('/dashboard/stats', requireProvider, async (req, res) => {
  const provider = getMyProvider(req);
  const orders = db.getCollection('orders') || [];
  const myOrders = orders.filter(o => o.providerId === provider.id && isVisibleToProvider(o));
  const jobRequests = (await db.getCollectionFresh('jobRequests')) || [];
  const myApplications = jobRequests.flatMap(job => (job.applicants || []).filter(applicant =>
    applicant.providerId === provider.id || applicant.providerUserId === req.authUser.id
  ));
  const complaints = (db.getCollection('complaints') || []).filter(complaint =>
    complaint.defendantId === provider.id ||
    complaint.defendantId === provider.userId ||
    complaint.defendantId === req.authUser.id
  );

  const pending = myOrders.filter(o => o.orderStatus === 'pending').length;
  const processing = myOrders.filter(o => o.orderStatus === 'processing').length;
  const completed = myOrders.filter(o => o.orderStatus === 'completed').length;
  const totalRevenue = myOrders
    .filter(o => o.orderStatus === 'completed')
    .reduce((sum, o) => sum + Number(o.price || 0), 0);

  res.json({
    success: true,
    stats: {
      pendingOrders: pending,
      processingOrders: processing,
      completedOrders: completed,
      activeProjectsCount: processing,
      submittedProposalsCount: myApplications.length,
      unresolvedComplaintsCount: complaints.filter(complaint => complaint.status !== 'resolved').length,
      totalRevenue,
      totalRevenueFormatted: `${totalRevenue.toLocaleString('vi-VN')}đ`,
      rating: provider.rating || 5.0,
      averageRating: provider.rating || 5.0,
      balance: req.authUser.balance || 0
    }
  });
});

router.get('/me/services', requireProvider, async (req, res) => {
  const provider = getMyProvider(req);
  const services = ((await db.getCollectionFresh('services')) || []).filter(s => s.providerId === provider.id);
  res.json({ success: true, services });
});

router.get('/me/orders', requireProvider, (req, res) => {
  checkAutoReleaseOrders();
  const provider = getMyProvider(req);
  const orders = (db.getCollection('orders') || []).filter(o => o.providerId === provider.id && isVisibleToProvider(o));
  res.json({ success: true, orders });
});

router.get('/me/wallet', requireProvider, (req, res) => {
  const user = (db.getCollection('users') || []).find(row => row.id === req.authUser.id) || req.authUser;
  getMyProvider(req);
  res.json({ success: true, wallet: walletService.getWallet(user) });
});

router.post('/wallet/deposit', requireProvider, (req, res) => {
  try {
    const amount = Number(req.body?.amount);
    if (!Number.isSafeInteger(amount) || amount < MIN_PAYMENT || amount > MAX_PAYMENT) {
      return res.status(400).json({ success: false, message: `Số tiền nạp phải từ ${MIN_PAYMENT.toLocaleString('vi-VN')}đ đến ${MAX_PAYMENT.toLocaleString('vi-VN')}đ.` });
    }
    const { txn, paymentUrl } = createGatewayTransaction({
      userId: req.authUser.id,
      type: 'deposit',
      amount,
      description: 'Nạp tiền ví Provider qua VNPay',
      bankCode: req.body?.bankCode,
      returnOrigin: allowedFrontendOrigin(req.headers.origin),
      ipAddr: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
      orderInfo: `Nap tien Provider ${String(req.authUser.id).replace(/[^a-zA-Z0-9]/g, '').slice(-20)}`,
      orderType: 'other'
    });
    res.json({ success: true, paymentUrl, txnRef: txn.id });
  } catch (error) {
    res.status(error.status || 400).json({ success: false, message: error.message || 'Không thể tạo giao dịch nạp tiền.' });
  }
});

router.post('/wallet/withdraw', requireProvider, async (req, res) => {
  try {
    const payout = await walletService.requestWithdrawal(req.authUser.id, req.body?.amount);
    res.json({ success: true, message: 'Đã gửi yêu cầu rút tiền. Số tiền được giữ trong lúc chờ Admin xử lý.', payout });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Không thể lưu yêu cầu rút tiền lúc này.' });
  }
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
router.post('/orders/:id/reject', requireProvider, orderAction(req => processCancelOrder(req.params.id, req.authUser.id, 'Provider', req.body.reason)));
router.post('/orders/:id/cancel', requireProvider, orderAction(req => processCancelOrder(req.params.id, req.authUser.id, 'Provider', req.body.reason)));
router.post('/orders/:id/cancellation-response', requireProvider, (req, res) => res.status(410).json({ success: false, message: 'Luồng duyệt yêu cầu hủy đã đóng. Provider có thể tự hủy đơn trong 24 giờ đầu kể từ lúc tạo đơn.' }));

// ---- Đánh giá của tôi + trả lời đánh giá ----
router.get('/me/reviews', requireProvider, async (req, res) => {
  const provider = getMyProvider(req);
  const allReviews = await require('./reviewRoutes').refreshStoredReviewAnalyses();
  const reviews = allReviews.filter(r => r.providerId === provider.id).map(addReviewSentimentPoints);
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

router.get('/me/package', requireProvider, async (req, res) => {
  const provider = await getMyProviderFresh(req) || getMyProvider(req);
  const entitlement = providerPackageService.getPlan(provider);
  entitlement.proposalsUsed = providerPackageService.countMonthlyProposals(provider);
  const providerIds = new Set([provider.id, provider.userId, req.authUser.id].filter(Boolean).map(String));
  const allServices = await db.getCollectionFresh('services');
  const services = allServices.filter(item => providerIds.has(String(item.providerId)) && !['inactive', 'rejected'].includes(item.status));
  const purchases = (db.getCollection('packagePurchases') || []).filter(item => item.providerId === provider.id);
  res.json({
    success: true,
    entitlement: { ...entitlement, activeServiceCount: services.length },
    purchases: purchases.slice(0, 10)
  });
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

router.get('/:id/availability', async (req, res) => {
  const providers = await db.getCollectionFresh('providers');
  const provider = providers.find(p => p.id === req.params.id || p.userId === req.params.id || (p.email && p.email.toLowerCase() === req.params.id.toLowerCase()));
  if (!provider || provider.verified !== true) return res.status(404).json({ success: false, message: 'Không tìm thấy Provider.' });
  const monthMatch = String(req.query.month || '').match(/^(\d{4})-(\d{2})$/);
  if (!monthMatch) return res.status(400).json({ success: false, message: 'Tháng không hợp lệ.' });
  const year = Number(monthMatch[1]);
  const month = Number(monthMatch[2]) - 1;
  if (month < 0 || month > 11) return res.status(400).json({ success: false, message: 'Tháng không hợp lệ.' });
  const orders = await db.getCollectionFresh('orders');
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
  return res.json({ success: true, availability });
});

const _dummy_router = { get: () => {} }; _dummy_router.get('/_old', (req, res) => {
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
  const [providers, allServices] = await Promise.all([
    db.getCollectionFresh('providers'), db.getCollectionFresh('services')
  ]);
  const allReviews = await require('./reviewRoutes').refreshStoredReviewAnalyses();
  const provider = providers.find(p => p.id === req.params.id || p.userId === req.params.id || (p.email && p.email.toLowerCase() === req.params.id.toLowerCase()));
  if (!provider || provider.verified !== true) return res.status(404).json({ success: false, message: 'Không tìm thấy Provider.' });
  const services = allServices.filter(s => s.providerId === provider.id && (s.status || 'active') === 'active');
  const reviews = allReviews.filter(r => r.providerId === provider.id).map(addReviewSentimentPoints);
  res.json({ success: true, provider: attachProviderReputation(provider, reviews), services, reviews });
});

// Thêm các endpoint còn thiếu cho provider
router.put('/availability', requireProvider, (req, res) => {
  const { mode, status, schedule, vacation, leadTime, maxProjects, dateExceptions } = req.body || {};
  const providers = db.getCollection('providers');
  const provider = getMyProvider(req);
  const index = providers.findIndex(p => p.id === provider.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy Provider' });
  }

  const prov = providers[index];
  if (mode || status) {
    prov.availabilityStatus = mode || status;
  }
  if (schedule) {
    if (Array.isArray(schedule)) {
      prov.schedule = { slots: schedule };
    } else if (schedule.slots) {
      prov.schedule = schedule;
    }
  }
  if (vacation) {
    prov.vacation = vacation;
  }
  if (dateExceptions !== undefined) {
    prov.dateExceptions = dateExceptions;
  }
  if (leadTime !== undefined) prov.leadTime = Number(leadTime);
  if (maxProjects !== undefined) prov.maxProjects = Number(maxProjects);

  db.saveCollection('providers', providers);
  res.json({
    success: true,
    message: 'Cập nhật lịch rảnh & tình trạng làm việc thành công!',
    provider: prov
  });
});

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

router.post('/services', requireProvider, async (req, res) => {
  const serviceData = req.body;
  const p = await getMyProviderFresh(req) || getMyProvider(req);
  const entitlement = providerPackageService.getPlan(p);
  const providerIds = new Set([p.id, p.userId, req.authUser.id].filter(Boolean).map(String));
  const services = await db.getCollectionFresh('services');
  const currentCount = services.filter(item => providerIds.has(String(item.providerId)) && !['inactive', 'rejected'].includes(item.status)).length;
  if (entitlement.serviceLimit !== null && currentCount >= entitlement.serviceLimit) {
    return res.status(403).json({ success: false, code: 'PACKAGE_SERVICE_LIMIT', message: `Gói ${entitlement.package.name} giới hạn ${entitlement.serviceLimit} dịch vụ. Hãy nâng cấp gói hoặc ẩn một dịch vụ hiện có.` });
  }
  const newSvc = {
    ...serviceData,
    id: generateId('SVC'),
    providerId: p.id,
    providerName: p.name,
    providerAvatar: p.avatar,
    // Dịch vụ mới của Provider phải chờ Admin duyệt mới hiển thị công khai.
    status: 'pending',
    dateSubmitted: formatDateTime(new Date())
  };
  services.unshift(newSvc);
  try {
    await db.saveCollectionAndWait('services', services);
  } catch (error) {
    console.error('[providers] Không lưu được dịch vụ:', error.message);
    return res.status(503).json({ success: false, message: 'Chưa lưu được dịch vụ lên hệ thống. Vui lòng thử lại.' });
  }
  res.json({ success: true, message: 'Đã gửi dịch vụ, vui lòng chờ Admin duyệt trước khi hiển thị công khai.', service: newSvc });
});

router.put('/services/:id', requireProvider, async (req, res) => {
  const serviceData = req.body;
  const provider = await getMyProviderFresh(req) || getMyProvider(req);
  const services = await db.getCollectionFresh('services');
  const idx = services.findIndex(s => s.id === req.params.id && String(s.providerId) === String(provider.id));
  if (idx !== -1) {
    if (serviceData.status === 'active' && services[idx].status === 'inactive') {
      const entitlement = providerPackageService.getPlan(provider);
      const providerIds = new Set([provider.id, provider.userId, req.authUser.id].filter(Boolean).map(String));
      const currentCount = services.filter(item =>
        item.id !== services[idx].id &&
        providerIds.has(String(item.providerId)) &&
        !['inactive', 'rejected'].includes(item.status)
      ).length;
      if (entitlement.serviceLimit !== null && currentCount >= entitlement.serviceLimit) {
        return res.status(403).json({
          success: false,
          code: 'PACKAGE_SERVICE_LIMIT',
          message: `Gói ${entitlement.package.name} giới hạn ${entitlement.serviceLimit} dịch vụ. Hãy ẩn một dịch vụ khác hoặc nâng cấp gói trước khi hiển thị lại dịch vụ này.`
        });
      }
    }
    services[idx] = { ...services[idx], ...serviceData };
    await db.saveCollectionAndWait('services', services);
    res.json({ success: true, message: 'Cập nhật dịch vụ thành công', service: services[idx] });
  } else {
    res.status(404).json({ success: false, message: 'Không tìm thấy dịch vụ' });
  }
});

router.delete('/services/:id', requireProvider, (req, res) => {
  const services = db.getCollection('services') || [];
  const idx = services.findIndex(s => s.id === req.params.id && s.providerId === getMyProvider(req).id);
  if (idx !== -1) {
    const deleted = services.splice(idx, 1)[0];
    db.saveCollection('services', services);
    res.json({ success: true, message: 'Xóa dịch vụ thành công', service: deleted });
  } else {
    res.status(404).json({ success: false, message: 'Không tìm thấy dịch vụ' });
  }
});

router.post('/services/:id/boost', requireProvider, (req, res) => {
  const provider = getMyProvider(req);
  const entitlement = providerPackageService.getPlan(provider);
  if (entitlement.boostLimit <= entitlement.boostsUsed) {
    return res.status(403).json({ success: false, code: 'PACKAGE_BOOST_LIMIT', message: 'Gói hiện tại đã dùng hết lượt đẩy dịch vụ trong tháng. Nâng cấp gói hoặc chờ sang tháng mới.' });
  }
  const services = db.getCollection('services') || [];
  const service = services.find(item => item.id === req.params.id && item.providerId === provider.id && item.status === 'active');
  if (!service) return res.status(404).json({ success: false, message: 'Không tìm thấy dịch vụ đã được duyệt để đẩy lên Top.' });

  const now = new Date();
  service.boostedAt = now.toISOString();
  service.boostedUntil = new Date(now.getTime() + 7 * 86400000).toISOString();
  db.saveCollection('services', services);

  const providers = db.getCollection('providers') || [];
  const index = providers.findIndex(item => item.id === provider.id);
  if (index >= 0) {
    const current = providerPackageService.getPlan(providers[index]);
    providers[index].packageUsage.boostsUsed = current.boostsUsed + 1;
    db.saveCollection('providers', providers);
  }
  res.json({ success: true, message: 'Đã đẩy dịch vụ lên vị trí ưu tiên trong 7 ngày.', service, entitlement: providerPackageService.getPlan(provider) });
});

router.put('/services/:id/request-price', requireProvider, (req, res) => {
  res.json({ success: true, message: 'Yêu cầu thay đổi giá đã được gửi' });
});

router.put('/me/bank-account', requireProvider, (req, res) => {
  const bank = String(req.body?.bank || '').trim();
  const account = String(req.body?.account || '').trim();
  const holder = String(req.body?.holder || '').trim();
  if (!bank || !account || !holder || bank.length > 100 || account.length > 40 || holder.length > 120) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập hợp lệ tên ngân hàng, số tài khoản và chủ tài khoản.' });
  }
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
  const provider = getMyProvider(req);
  const complaints = (db.getCollection('complaints') || []).filter(c =>
    c.defendantId === provider.id ||
    c.defendantId === provider.userId ||
    c.defendantId === req.authUser.id
  );
  res.json({ success: true, total: complaints.length, complaints });
});

router.post('/complaints/:id/defense', requireProvider, (req, res) => {
  const { providerClaim, evidence = [] } = req.body;
  if (!providerClaim || String(providerClaim).trim().length < 10) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập nội dung giải trình chi tiết (tối thiểu 10 ký tự).' });
  }
  if (!Array.isArray(evidence) || evidence.length > 5 || evidence.reduce((total, item) => total + (typeof item?.data === 'string' ? item.data.length : 0), 0) > 19 * 1024 * 1024 || evidence.some(item =>
    !item || typeof item.name !== 'string' || typeof item.data !== 'string' ||
    !/^data:image\/(png|jpeg|webp);base64,/.test(item.data) || item.data.length > 15 * 1024 * 1024 * 1.4
  )) {
    return res.status(400).json({ success: false, message: 'Chỉ nhận tối đa 5 ảnh PNG/JPG/WEBP, mỗi ảnh tối đa 15MB (tổng tối đa 14MB).' });
  }
  const provider = getMyProvider(req);
  const complaints = db.getCollection('complaints') || [];
  const idx = complaints.findIndex(c =>
    c.id === req.params.id && (
      c.defendantId === provider.id ||
      c.defendantId === provider.userId ||
      c.defendantId === req.authUser.id
    )
  );
  if (idx !== -1) {
    complaints[idx].providerClaim = String(providerClaim).trim();
    complaints[idx].providerEvidence = evidence.map(item => ({ name: item.name.slice(0, 160), data: item.data }));
    complaints[idx].status = 'pending_review';
    complaints[idx].defenseSubmittedAt = new Date().toLocaleString('vi-VN');
    db.saveCollection('complaints', complaints);
    res.json({ success: true, message: 'Đã gửi bằng chứng giải trình thành công! Admin sẽ xem xét trong vòng 5 ngày làm việc.' });
  } else {
    res.status(404).json({ success: false, message: 'Không tìm thấy khiếu nại hoặc bạn không có quyền giải trình.' });
  }
});

router.post('/complaints/:id/accept-refund', requireProvider, (req, res) => {
  const provider = getMyProvider(req);
  const complaints = db.getCollection('complaints') || [];
  const complaint = complaints.find(c => c.id === req.params.id && (
    c.defendantId === provider.id || c.defendantId === provider.userId || c.defendantId === req.authUser.id
  ));
  if (!complaint) return res.status(404).json({ success: false, message: 'Không tìm thấy khiếu nại hoặc bạn không có quyền xử lý.' });
  if (complaint.status === 'resolved') return res.status(409).json({ success: false, message: 'Khiếu nại này đã được giải quyết.' });
  complaint.providerAcceptedRefund = true;
  complaint.providerAcceptedRefundAt = new Date().toLocaleString('vi-VN');
  complaint.providerClaim = 'Provider chấp nhận hoàn tiền cho khách hàng; chờ Admin xác nhận phán quyết.';
  complaint.status = 'pending_review';
  db.saveCollection('complaints', complaints);
  res.json({ success: true, message: 'Đã ghi nhận việc chấp nhận hoàn tiền. Admin sẽ xác nhận phán quyết.' });
});

router.post('/packages/purchase', requireProvider, (req, res) => {
  const { packageId } = req.body;
  const packages = db.getCollection('packages') || [];
  const pkg = packages.find(p => p.id === packageId && ['PKG_PRO', 'PKG_VIP'].includes(p.id));
  if (!pkg) return res.status(404).json({ success: false, message: 'Gói dịch vụ không tồn tại.' });

  const provider = getMyProvider(req);
  const currentEntitlement = providerPackageService.getPlan(provider);
  const users = db.getCollection('users') || [];
  const uidx = users.findIndex(u => u.id === req.authUser.id);
  if (uidx === -1) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản người dùng.' });
  }

  const price = Math.max(0, Number(pkg.price) || 0);
  const currentBal = Number(users[uidx].balance) || 0;
  if (price > 0) {
    if (currentBal < price) {
      return res.status(400).json({
        success: false,
        message: `Số dư ví không đủ (cần ${price.toLocaleString('vi-VN')}đ, hiện có ${currentBal.toLocaleString('vi-VN')}đ). Vui lòng nạp thêm tiền.`
      });
    }
  }

  const now = new Date();
  const durationDays = Math.max(1, Number(pkg.duration) || 30);
  const extendingSamePlan = currentEntitlement.packageId === packageId && currentEntitlement.expiresAt;
  const startsAt = extendingSamePlan && Date.parse(currentEntitlement.expiresAt) > now.getTime()
    ? new Date(currentEntitlement.expiresAt)
    : now;
  const expiresAt = new Date(startsAt.getTime() + durationDays * 86400000);
  users[uidx].balance = currentBal - price;

  const providers = db.getCollection('providers') || [];
  const provIdx = providers.findIndex(p => p.id === provider.id || p.userId === req.authUser.id);
  if (provIdx === -1) return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ Provider.' });
  providers[provIdx].activePackage = packageId;
  providers[provIdx].packageStartedAt = extendingSamePlan ? providers[provIdx].packageStartedAt || now.toISOString() : now.toISOString();
  providers[provIdx].packageExpiresAt = expiresAt.toISOString();
  providers[provIdx].badge = packageId === 'PKG_PRO' ? 'PRO PROVIDER' : 'VIP ELITE';
  if (!extendingSamePlan || !providers[provIdx].packageUsage) {
    providers[provIdx].packageUsage = { month: providerPackageService.monthKey(now), boostsUsed: 0, proposalsUsed: 0 };
  }

  const purchases = db.getCollection('packagePurchases') || [];
  purchases.forEach(item => {
    if (item.providerId === provider.id && item.status === 'Đang hoạt động') {
      item.status = extendingSamePlan && item.packageId === packageId ? 'Đã gia hạn' : 'Đã thay thế';
    }
  });
  const purchase = {
    id: generateId('PKG-ORD'),
    providerId: provider.id,
    provider: providers[provIdx].name || req.authUser.name,
    packageId: pkg.id,
    packageName: pkg.name,
    amount: price.toLocaleString('vi-VN') + 'đ',
    amountNum: price,
    activeDate: startsAt.toLocaleDateString('vi-VN'),
    startedAt: startsAt.toISOString(),
    expireDate: expiresAt.toLocaleDateString('vi-VN'),
    expiresAt: expiresAt.toISOString(),
    status: 'Đang hoạt động'
  };
  purchases.unshift(purchase);

  // Persist the balance, entitlement, ledger entry and receipt for every purchase,
  // including zero-cost or extension purchases.
  db.saveCollection('users', users);
  db.saveCollection('providers', providers);
  db.saveCollection('packagePurchases', purchases);
  const transactions = db.getCollection('walletTransactions') || [];
  if (price > 0) {
    transactions.unshift({
      id: generateId('TXN'), userId: req.authUser.id, userName: providers[provIdx].name || req.authUser.name || 'Chuyên gia',
      type: 'package_purchase', amount: -price, balanceAfter: users[uidx].balance, status: 'completed',
      createdAt: formatDateTime(now), description: `Mua ${pkg.name} (${durationDays} ngày)`, packagePurchaseId: purchase.id
    });
    db.saveCollection('walletTransactions', transactions);
  }

  const { createNotification } = require('../services/notificationService');
  createNotification(req.authUser.id, 'Kích hoạt gói dịch vụ thành công',
    `Bạn đã kích hoạt thành công ${pkg.name}. Huy hiệu và đặc quyền ưu tiên của bạn đã hiển thị trên toàn sàn!`,
    'success', '/package.html');

  res.json({
    success: true,
    message: `Đã kích hoạt thành công ${pkg.name}!`,
    newBalance: users[uidx].balance,
    package: pkg,
    entitlement: providerPackageService.getPlan(providers[provIdx]),
    purchase
  });
});

router.get('/me/posts', requireProvider, async (req, res) => {
  try {
    const provider = await getMyProviderFresh(req);
    if (!provider) return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ Provider.' });
    const posts = (await db.getCollectionFresh('posts')).filter(post => post.providerId === provider.id)
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    res.json({ success: true, posts });
  } catch (err) {
    console.error('[providers] Không tải được bài đăng:', err.message);
    res.status(503).json({ success: false, message: 'Chưa tải được bài đăng từ hệ thống.' });
  }
});

router.get('/:id/posts', async (req, res) => {
  try {
    const posts = (await db.getCollectionFresh('posts')).filter(post => post.providerId === req.params.id)
      .filter(post => post.status !== 'draft')
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
    status: postData.status === 'draft' ? 'draft' : 'published',
    id,
    providerId: provider.id,
    providerName: provider.name,
    date: formatDateTime(now).split(' ')[0],
    createdAt: now.toISOString(),
    likes: 0
  };
  try {
    const posts = await db.getCollectionFresh('posts');
    posts.unshift(post);
    await db.saveCollectionAndWait('posts', posts);
    res.status(201).json({ success: true, message: 'Đăng bài thành công', post });
  } catch (err) {
    console.error('[providers] Không lưu được bài đăng:', err.message);
    res.status(503).json({ success: false, message: 'Chưa lưu được bài đăng lên hệ thống. Vui lòng thử lại.' });
  }
});

router.put('/posts/:id', requireProvider, async (req, res) => {
  const postData = req.body || {};
  const title = String(postData.title || '').trim();
  const content = String(postData.content || '').trim();
  if (!title || !content) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập tiêu đề và nội dung bài viết.' });
  }

  try {
    const provider = await getMyProviderFresh(req);
    if (!provider) return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ Provider.' });
    const posts = await db.getCollectionFresh('posts');
    const index = posts.findIndex(item => item.id === req.params.id && item.providerId === provider.id);
    if (index < 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy bài viết của bạn.' });
    }

    const post = {
      ...posts[index],
      title,
      category: String(postData.category || '').trim(),
      summary: String(postData.summary || content.slice(0, 150)).trim(),
      content,
      status: postData.status === 'draft' ? 'draft' : 'published',
      updatedAt: new Date().toISOString()
    };
    posts[index] = post;
    await db.saveCollectionAndWait('posts', posts);
    res.json({ success: true, message: 'Đã cập nhật bài viết.', post });
  } catch (err) {
    console.error('[providers] Không cập nhật được bài đăng:', err.message);
    res.status(503).json({ success: false, message: 'Chưa cập nhật được bài viết. Vui lòng thử lại.' });
  }
});

router.delete('/posts/:id', requireProvider, async (req, res) => {
  try {
    const provider = await getMyProviderFresh(req);
    if (!provider) return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ Provider.' });
    const posts = await db.getCollectionFresh('posts');
    const index = posts.findIndex(item => item.id === req.params.id && item.providerId === provider.id);
    if (index < 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy bài viết của bạn.' });
    }
    posts.splice(index, 1);
    await db.saveCollectionAndWait('posts', posts);
    res.json({ success: true, message: 'Đã xóa bài viết.' });
  } catch (err) {
    console.error('[providers] Không xóa được bài đăng:', err.message);
    res.status(503).json({ success: false, message: 'Chưa xóa được bài viết. Vui lòng thử lại.' });
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

  const [allProviders, allReviews, allServices] = await Promise.all([
    db.getCollectionFresh('providers'),
    require('./reviewRoutes').refreshStoredReviewAnalyses(),
    db.getCollectionFresh('services')
  ]);

  let providers = allProviders
    .filter(provider => provider.verified === true)
    .map(provider => attachPublicServiceSummary(attachProviderReputation(provider, allReviews.filter(review => review.providerId === provider.id)), allServices));

  const providerPrices = providers
    .map(provider => Number(provider.startingPackagePrice ?? provider.hourlyRate))
    .filter(price => Number.isFinite(price) && price >= 0);

  let priceRange = { min: 0, max: 0 };
  if (providerPrices.length > 0) {
    priceRange.min = Math.min(...providerPrices);
    priceRange.max = Math.max(...providerPrices);
  }

  // Chỉ cần verified=true (admin đã duyệt) là hiển thị cho customer
  if (category && category !== 'all') {
    const categoryLower = category.toLowerCase().trim();
    providers = providers.filter(provider => {
      if (!provider.category) return false;
      return provider.category.toLowerCase().includes(categoryLower);
    });
  }

  if (skill) {
    const skillLower = skill.toLowerCase().trim();
    providers = providers.filter(provider => {
      if (!Array.isArray(provider.skills)) return false;
      return provider.skills.some(item => String(item).toLowerCase().includes(skillLower));
    });
  }

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

    providers = providers.filter(provider => {
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

  if (minRating !== undefined && minRating !== '') {
    const ratingValue = Number(minRating);
    if (Number.isFinite(ratingValue) && ratingValue > 0) {
      providers = providers.filter(provider => Number(provider.rating || 0) >= ratingValue);
    }
  }

  if (minPrice !== undefined && minPrice !== '') {
    const minPriceValue = Number(minPrice);
    if (Number.isFinite(minPriceValue)) {
      providers = providers.filter(provider => Number(provider.startingPackagePrice ?? provider.hourlyRate ?? 0) >= minPriceValue);
    }
  }

  if (maxPrice !== undefined && maxPrice !== '') {
    const maxPriceValue = Number(maxPrice);
    if (Number.isFinite(maxPriceValue)) {
      providers = providers.filter(provider => Number(provider.startingPackagePrice ?? provider.hourlyRate ?? 0) <= maxPriceValue);
    }
  }

  if (verified === 'true') {
    providers = providers.filter(provider => provider.verified === true);
  }

  if (sort === 'rating') {
    providers.sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0)
      || Number(b.reputationScore || 0) - Number(a.reputationScore || 0));
  } else if (sort === 'price-asc') {
    providers.sort((a, b) => Number(a.startingPackagePrice ?? a.hourlyRate ?? 0) - Number(b.startingPackagePrice ?? b.hourlyRate ?? 0));
  } else if (sort === 'price-desc') {
    providers.sort((a, b) => Number(b.startingPackagePrice ?? b.hourlyRate ?? 0) - Number(a.startingPackagePrice ?? a.hourlyRate ?? 0));
  } else if (sort === 'orders') {
    providers.sort((a, b) => Number(b.completedOrders || 0) - Number(a.completedOrders || 0));
  }

  const total = providers.length;

  if (limit && !isNaN(limit)) {
    const limitNumber = Number(limit);
    if (limitNumber > 0) {
      providers = providers.slice(0, limitNumber);
    }
  }

  res.json({
    success: true,
    total: total,
    providers: providers,
    priceRange: priceRange
  });
});

module.exports = router;

