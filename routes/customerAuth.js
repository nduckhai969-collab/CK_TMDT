// Xác thực bằng Session Cookie (session_id) hoặc Firebase ID token (Authorization: Bearer <token>)
// và phân quyền theo role lưu trong collection "users".
const db = require('../data/db');
const { auth } = require('../firebase');
const sessionStore = require('../data/sessionStore');

function nextUserId(users) {
  const max = users.reduce((m, u) => {
    const match = /^USR(\d+)$/.exec(u.id || '');
    return match ? Math.max(m, parseInt(match[1], 10)) : m;
  }, 0);
  return `USR${String(max + 1).padStart(3, '0')}`;
}

function bearerToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
}

/**
 * Middleware xác thực.
 * - Hỗ trợ cả 2 cơ chế:
 *   1. Traditional Session Cookie (session_id) từ req.cookies
 *   2. Token Bearer / devUserId (cho tương thích các client hiện có)
 * - allowNoProfile: cho phép token hợp lệ nhưng chưa có hồ sơ (dùng cho /register)
 * - allowUnverified: cho phép email chưa xác nhận (dùng cho /register)
 * Thành công: req.authUser (hồ sơ trong DB), req.session (dữ liệu session)
 */
function authenticate({ allowNoProfile = false, allowUnverified = false } = {}) {
  return async (req, res, next) => {
    // ------------------------------------------------------------------------
    // 1. KIỂM TRA SESSION COOKIE TRUYỀN THỐNG (HttpOnly Cookie: session_id)
    // ------------------------------------------------------------------------
    const sessionId = (req.cookies && req.cookies.session_id) || (req.headers && req.headers['x-session-id']);
    if (sessionId) {
      const session = sessionStore.getSession(sessionId);
      if (session && session.userId) {
        const users = db.getCollection('users') || [];
        const profile = users.find(u => u.id === session.userId || (u.email && u.email.toLowerCase() === String(session.email).toLowerCase()));

        if (profile) {
          if (profile.status === 'locked') {
            return res.status(403).json({
              success: false,
              code: 'ACCOUNT_LOCKED',
              message: `Tài khoản đã bị tạm khóa: ${profile.lockReason || 'Liên hệ Admin'}`
            });
          }

          if (!allowUnverified && profile.is_active === false) {
            return res.status(403).json({
              success: false,
              code: 'EMAIL_NOT_VERIFIED',
              message: 'Tài khoản chưa được kích hoạt email. Vui lòng kiểm tra hộp thư kích hoạt.'
            });
          }

          req.authUser = profile;
          req.session = session;
          req.session.userId = session.userId || profile.id;
          req.session.userRole = (session.role || profile.role || '').toLowerCase();
          req.firebaseUser = {
            uid: profile.uid || profile.id,
            email: profile.email,
            email_verified: profile.is_active !== false,
            name: profile.name
          };
          return next();
        }
      }
    }

    // ------------------------------------------------------------------------
    // 2. FALLBACK: BEARER TOKEN HOẶC DEV USER ID (Cho client Firebase / scripts)
    // ------------------------------------------------------------------------
    const token = bearerToken(req);
    if (!token) {
      const devUserId = req.headers['x-user-id'] || req.query.userId;
      if (devUserId) {
        const users = db.getCollection('users') || [];
        let profile = users.find(u => u.id === devUserId || u.uid === devUserId);
        if (!profile) {
          const providers = db.getCollection('providers') || [];
          const prv = providers.find(p => p.id === devUserId);
          if (prv) {
            profile = users.find(u => u.id === prv.userId) || (prv.email ? users.find(u => u.email && u.email.toLowerCase() === prv.email.toLowerCase()) : null);
          }
        }
        if (profile) {
          if (profile.status === 'locked') {
            return res.status(403).json({
              success: false,
              code: 'ACCOUNT_LOCKED',
              message: `Tài khoản đã bị tạm khóa: ${profile.lockReason || 'Liên hệ Admin'}`
            });
          }
          req.authUser = profile;
          req.firebaseUser = { uid: profile.uid || profile.id, email: profile.email, email_verified: true, name: profile.name };
          return next();
        }
      }
      return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập để thực hiện thao tác này.' });
    }

    let decoded;
    try {
      decoded = await auth.verifyIdToken(token);
    } catch (err) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_TOKEN',
        message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.'
      });
    }

    if (!allowUnverified && !decoded.email_verified) {
      return res.status(403).json({
        success: false,
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Email chưa được xác nhận. Vui lòng kiểm tra hộp thư.'
      });
    }

    req.firebaseUser = decoded;

    const users = db.getCollection('users');
    let profile = users.find(u => u.uid === decoded.uid) || null;

    // Liên kết tài khoản cũ theo email đã được xác nhận (đặc biệt khi đăng nhập bằng Google)
    if (!profile && decoded.email && decoded.email_verified) {
      const email = decoded.email.toLowerCase();
      const byEmail = users.find(u => String(u.email || '').toLowerCase() === email);
      if (byEmail) {
        if (!byEmail.uid || byEmail.uid !== decoded.uid) {
          byEmail.uid = decoded.uid;
        }
        if (decoded.picture && (!byEmail.avatar || byEmail.avatar.includes('unsplash'))) {
          byEmail.avatar = decoded.picture;
        }
        if (decoded.name && (!byEmail.name || byEmail.name.includes('@'))) {
          byEmail.name = decoded.name;
        }
        db.saveCollection('users', users);
        profile = byEmail;
      }
    }

    // Nếu profile đã có, tự động đồng bộ avatar từ Google nếu đang dùng placeholder
    if (profile && decoded.picture && (!profile.avatar || profile.avatar.includes('unsplash'))) {
      profile.avatar = decoded.picture;
      db.saveCollection('users', users);
    }

    // Tự động tạo hồ sơ cho tài khoản Firebase đã xác thực email nhưng chưa có trong Firestore (vd: Google Sign-In)
    if (!profile && !allowNoProfile && decoded.email && decoded.email_verified) {
      const email = decoded.email.toLowerCase();
      const now = new Date();
      const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
      const defaultName = decoded.name || email.split('@')[0];
      const isKnownProviderEmail = email === 'ngochannnn130@gmail.com';
      const roleClaim = (decoded.role || (decoded.customClaims && decoded.customClaims.role) || (isKnownProviderEmail ? 'Provider' : 'Customer'));
      const safeRole = (roleClaim === 'Provider' || isKnownProviderEmail) ? 'Provider' : (roleClaim === 'Admin' ? 'Admin' : 'Customer');

      const newProf = {
        id: nextUserId(users),
        uid: decoded.uid,
        name: defaultName,
        email: decoded.email,
        phone: decoded.phone_number || '0900 000 000',
        role: safeRole,
        joinDate: dateStr,
        spentOrEarned: '0đ',
        balance: 0,
        status: 'active',
        is_active: true,
        avatar: decoded.picture || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150'
      };
      users.push(newProf);
      db.saveCollection('users', users);
      profile = newProf;

      try {
        await auth.setCustomUserClaims(decoded.uid, { role: safeRole });
      } catch (_) {}
    }

    if (profile && profile.email && profile.email.toLowerCase() === 'ngochannnn130@gmail.com') {
      if (profile.role !== 'Provider') {
        profile.role = 'Provider';
        db.saveCollection('users', users);
        try {
          await auth.setCustomUserClaims(profile.uid, { role: 'Provider' });
        } catch (_) {}
      }
    }

    if (profile && profile.role === 'Provider') {
      const providers = db.getCollection('providers') || [];
      let prv = providers.find(p => p.userId === profile.id || p.id === profile.id || (p.email && p.email.toLowerCase() === profile.email.toLowerCase()));
      if (!prv) {
        const maxPrv = providers.reduce((m, p) => {
          const match = /^PRV(\d+)$/.exec(p.id || '');
          return match ? Math.max(m, parseInt(match[1], 10)) : m;
        }, 0);
        const defaultSlots = [
          { day: 'T2', morning: true, afternoon: true, evening: true },
          { day: 'T3', morning: true, afternoon: true, evening: true },
          { day: 'T4', morning: true, afternoon: true, evening: true },
          { day: 'T5', morning: true, afternoon: true, evening: true },
          { day: 'T6', morning: true, afternoon: true, evening: true },
          { day: 'T7', morning: true, afternoon: true, evening: true },
          { day: 'CN', morning: true, afternoon: true, evening: true }
        ];
        prv = {
          id: `PRV${String(maxPrv + 1).padStart(3, '0')}`,
          userId: profile.id,
          name: profile.name || 'Ngọc Hân',
          email: profile.email,
          phone: profile.phone || '',
          avatar: profile.avatar || '',
          cover: profile.cover || '',
          rating: 5.0,
          reviews: 0,
          completedOrders: 0,
          createdAt: profile.joinDate || '22/10/2026',
          verified: true,
          hourlyRate: 350000,
          specialty: 'Chuyên gia dịch vụ & Tư vấn',
          category: 'IT',
          skills: ['Chuyên môn', 'Làm việc chuyên nghiệp'],
          availabilityStatus: 'ready',
          workingHours: 'T2-CN, 08:00-22:00',
          schedule: { mode: 'ready', slots: defaultSlots },
          dateExceptions: {}
        };
        providers.unshift(prv);
        db.saveCollection('providers', providers);
      }
    }

    if (profile && profile.role !== 'Provider' && (req.baseUrl?.includes('/providers') || req.originalUrl?.includes('/providers'))) {
      const devUserId = req.headers['x-user-id'] || req.query.userId;
      const pList = db.getCollection('providers') || [];
      let prv = devUserId ? pList.find(p => p.id === devUserId || p.userId === devUserId || (p.email && p.email.toLowerCase() === String(devUserId).toLowerCase())) : null;
      if (!prv) {
        prv = pList.find(p => p.userId === profile.id || p.id === profile.id || (p.email && p.email.toLowerCase() === (profile.email || '').toLowerCase()));
      }
      if (prv) {
        const pUser = users.find(u => u.id === prv.userId || u.id === prv.id || (prv.email && u.email && u.email.toLowerCase() === prv.email.toLowerCase()));
        if (pUser) {
          req.authUser = pUser;
          return next();
        }
      }
      if (devUserId) {
        req.authUser = { ...profile, role: 'Provider' };
        return next();
      }
    }

    if (!profile) {
      if (allowNoProfile) {
        req.authUser = null;
        return next();
      }
      return res.status(403).json({
        success: false,
        code: 'NO_PROFILE',
        message: 'Tài khoản chưa có hồ sơ trên hệ thống.'
      });
    }

    if (profile.status === 'locked') {
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_LOCKED',
        message: `Tài khoản đã bị tạm khóa: ${profile.lockReason || 'Liên hệ Admin'}`
      });
    }

    req.authUser = profile;
    next();
  };
}

function compose(first, second) {
  return (req, res, next) => first(req, res, err => (err ? next(err) : second(req, res, next)));
}

function checkRole(roles, message) {
  return (req, res, next) => {
    const roleList = roles.map(r => String(r).toLowerCase());
    const currentRole = String(
      (req.session && (req.session.userRole || req.session.role)) || 
      (req.authUser && req.authUser.role) || 
      ''
    ).toLowerCase();

    if (!roleList.includes(currentRole)) {
      return res.status(403).json({ 
        success: false, 
        message: message || "Từ chối truy cập! Bạn không có quyền truy cập khu vực này." 
      });
    }
    next();
  };
}

const requireSignedIn = authenticate();
const requireCustomer = compose(requireSignedIn,
  checkRole(['Customer'], 'Thao tác này chỉ dành cho tài khoản khách hàng.'));
const requireProvider = compose(requireSignedIn,
  checkRole(['Provider'], 'Thao tác này chỉ dành cho tài khoản người bán.'));
const requireAdmin = compose(requireSignedIn,
  checkRole(['Admin'], 'Thao tác này chỉ dành cho quản trị viên.'));
const requireRole = (...roles) => compose(requireSignedIn,
  checkRole(roles, 'Bạn không có quyền thực hiện thao tác này.'));

module.exports = {
  authenticate,
  requireSignedIn,
  requireCustomer,
  requireProvider,
  requireAdmin,
  requireRole
};
