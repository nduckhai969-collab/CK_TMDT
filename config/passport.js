/**
 * ============================================================================
 * SkillRental Platform - Google OAuth 2.0 Configuration (Passport.js)
 * File: config/passport.js
 * ============================================================================
 * Hiện thực: Sử dụng thư viện passport và passport-google-oauth20 trên Node.js.
 * - Luồng đi: Người dùng bấm "Đăng nhập với Google" -> Hệ thống chuyển hướng sang Google.
 * - Luồng về (Callback): Google trả về profile chứa Email, Tên, ID Google.
 * - Xử lý Backend:
 *   + Kiểm tra Email xem đã tồn tại trong bảng users chưa.
 *   + Nếu chưa: Tạo tài khoản mới, mật khẩu ngẫu nhiên băm bằng chuẩn an toàn, role = 'Customer', is_active = true.
 *   + Nếu có rồi: Lấy user_id, tạo Session truyền thống (req.session.userId = user.id) rồi chuyển hướng về trang chủ.
 */

const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const crypto = require('crypto');
const db = require('../data/db');
const sessionStore = require('../data/sessionStore');
const { hashPassword } = require('../utils/password');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'dummy-google-client-id.apps.googleusercontent.com';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'dummy-google-client-secret';
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL || '/api/auth/google/callback';

/**
 * Xử lý tìm hoặc tạo tài khoản người dùng từ profile Google
 * @param {Object} profile - Google Profile từ passport-google-oauth20
 * @returns {Object} user
 */
function findOrCreateGoogleUser(profile) {
  const users = db.getCollection('users') || [];
  const googleId = profile.id;
  const email = (
    (profile.emails && profile.emails[0] ? profile.emails[0].value : '') ||
    (profile._json && profile._json.email ? profile._json.email : '')
  ).toLowerCase().trim();

  if (!email && !googleId) {
    throw new Error('Không lấy được thông tin email hoặc Google ID từ tài khoản Google.');
  }

  // 1. Kiểm tra Email xem đã tồn tại trong bảng users chưa
  let user = users.find(u => 
    (email && u.email && u.email.toLowerCase() === email) || 
    (googleId && u.googleId && u.googleId === googleId)
  );

  const displayName = profile.displayName || 
    (profile.name ? `${profile.name.familyName || ''} ${profile.name.givenName || ''}`.trim() : '') ||
    (email ? email.split('@')[0] : 'Google User');

  const photoUrl = (profile.photos && profile.photos[0] ? profile.photos[0].value : '') ||
    (profile._json && profile._json.picture ? profile._json.picture : '');

  if (!user) {
    // 2. Nếu chưa: Tạo tài khoản mới, đặt mật khẩu ngẫu nhiên với role = 'Customer' (hoặc 'user')
    const randomPassword = crypto.randomBytes(16).toString('hex');
    const nextId = `USR_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    user = {
      id: nextId,
      name: displayName,
      email: email,
      password_hash: hashPassword(randomPassword),
      password: randomPassword, // Lưu để tương thích dữ liệu cũ nếu cần
      role: 'Customer', // Mặc định là user/khách hàng
      is_active: true,  // Tài khoản Google đã được xác thực email
      email_verified: true,
      auth_provider: 'google',
      googleId: googleId,
      avatar: photoUrl,
      balance: 0,
      status: 'active',
      createdAt: new Date().toISOString()
    };

    users.unshift(user);
    db.saveCollection('users', users);
    console.log(`[Google OAuth] ✅ Đã tạo tài khoản mới từ Google: ${email} (${user.id})`);
  } else {
    // 3. Nếu có rồi: Cập nhật googleId, kích hoạt tài khoản nếu chưa kích hoạt
    let changed = false;
    if (!user.googleId) {
      user.googleId = googleId;
      changed = true;
    }
    if (user.is_active === false) {
      user.is_active = true;
      user.email_verified = true;
      changed = true;
    }
    if (!user.avatar && photoUrl) {
      user.avatar = photoUrl;
      changed = true;
    }
    if (changed) {
      db.saveCollection('users', users);
    }
    console.log(`[Google OAuth] ✅ Người dùng hiện hữu đăng nhập Google thành công: ${email} (${user.id})`);
  }

  return user;
}

// Cấu hình Google Strategy cho Passport
passport.use(
  new GoogleStrategy(
    {
      clientID: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      callbackURL: GOOGLE_CALLBACK_URL,
      passReqToCallback: true
    },
    (req, accessToken, refreshToken, profile, done) => {
      try {
        const user = findOrCreateGoogleUser(profile);
        return done(null, user);
      } catch (err) {
        return done(err, null);
      }
    }
  )
);

// Serialization cho Passport session (nếu ứng dụng dùng session của Passport)
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  const users = db.getCollection('users') || [];
  const user = users.find(u => u.id === id);
  done(null, user || null);
});

/**
 * Thiết lập Session truyền thống và Cookie cho người dùng sau khi xác thực Google thành công
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Object} user - User record từ bảng users
 * @param {string} [redirectUrl] - Đường dẫn chuyển hướng (mặc định /index.html)
 */
function createGoogleSessionAndRedirect(req, res, user, redirectUrl = '/index.html?login=google_success') {
  // Tạo Session truyền thống lưu vào RAM (Memory Store)
  const sessionId = sessionStore.createSession(user);

  // Ghi Cookie HttpOnly vào trình duyệt
  res.cookie('session_id', sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000, // 24 giờ
    path: '/'
  });

  // Gán vào req.session để các middleware kế tiếp có thể đọc ngay lập tức
  if (req.session) {
    req.session.userId = user.id;
    req.session.userRole = (user.role || 'Customer').toLowerCase();
  }

  console.log(`[Google OAuth] Đã tạo Session: ${sessionId} cho user: ${user.email} -> Redirect: ${redirectUrl}`);
  return res.redirect(redirectUrl);
}

module.exports = {
  passport,
  findOrCreateGoogleUser,
  createGoogleSessionAndRedirect
};
