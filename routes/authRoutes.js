const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { randomUUID } = crypto;
const db = require('../data/db');
const { auth } = require('../firebase');
const { authenticate, requireSignedIn, requireAdmin } = require('./customerAuth');
const sessionStore = require('../data/sessionStore');
const { hashPassword, comparePassword } = require('../utils/password');

function publicUser(user) {
  if (!user) return null;
  let bal = user.balance;
  if (user && user.role === 'Customer') {
    const txns = db.getCollection('walletTransactions') || [];
    const userTxns = txns.filter(t => 
      (t.userId === user.id || (user.uid && t.userId === user.uid)) &&
      (t.status === 'success' || t.status === 'completed')
    );
    const hasDeposit = userTxns.some(t => t.type === 'deposit');
    if (!hasDeposit) {
      bal = 0;
      if (Number(user.balance) !== 0) {
        user.balance = 0;
        const users = db.getCollection('users');
        const found = users.find(u => u.id === user.id);
        if (found) { found.balance = 0; db.saveCollection('users', users); }
      }
    } else {
      const totalDeposits = userTxns
        .filter(t => t.type === 'deposit' || t.type === 'refund')
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      const totalDeductions = userTxns
        .filter(t => t.type === 'escrow' || t.type === 'order_payment' || t.type === 'withdraw' || t.type === 'refund_reversal')
        .reduce((sum, t) => sum + Math.abs(Number(t.amount) || 0), 0);
      bal = Math.max(0, totalDeposits - totalDeductions);
      if (user.balance !== bal) {
        user.balance = bal;
        const users = db.getCollection('users');
        const found = users.find(u => u.id === user.id);
        if (found) { found.balance = bal; db.saveCollection('users', users); }
      }
    }
  }

  let providerId = undefined;
  if (user && user.role === 'Provider') {
    const providers = db.getCollection('providers') || [];
    const prv = providers.find(p => p.userId === user.id || p.id === user.id || (p.email && p.email.toLowerCase() === (user.email || '').toLowerCase()));
    if (prv) {
      providerId = prv.id;
    }
  }

  return {
    id: user.id,
    providerId: providerId,
    name: user.name,
    email: user.email,
    phone: user.phone,
    address: user.address || '',
    bio: user.bio || '',
    role: user.role,
    balance: typeof bal === 'number' ? bal : (Number(user.balance) || 0),
    avatar: user.avatar,
    cover: user.cover || '',
    joinDate: user.joinDate,
    is_active: user.is_active !== false,
    status: user.status || 'active'
  };
}

function nextUserId(users) {
  const max = users.reduce((m, u) => {
    const match = /^USR(\d+)$/.exec(u.id || '');
    return match ? Math.max(m, parseInt(match[1], 10)) : m;
  }, 0);
  return `USR${String(max + 1).padStart(3, '0')}`;
}

function detectImageType(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

// ============================================================================
// 1. ĐĂNG KÝ (GỬI EMAIL XÁC NHẬN) - MÔ HÌNH TRUYỀN THỐNG
// ============================================================================
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone, role } = req.body || {};

    if (!name || !String(name).trim() || !email || !String(email).trim()) {
      return res.status(400).json({ success: false, message: 'Vui lòng điền đầy đủ họ tên và email!' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const users = db.getCollection('users') || [];

    // Kiểm tra xem email đã tồn tại chưa
    const existingUser = users.find(u => String(u.email || '').toLowerCase() === normalizedEmail);
    if (existingUser) {
      if (existingUser.is_active === false && existingUser.verification_token) {
        // Cho phép gửi lại email kích hoạt nếu tài khoản cũ chưa kích hoạt
        const verifyUrl = `${req.protocol}://${req.get('host')}/api/auth/verify-email?token=${existingUser.verification_token}`;
        console.log('====================================================');
        console.log(`📧 [GỬI LẠI EMAIL KÍCH HOẠT TỚI]: ${normalizedEmail}`);
        console.log(`🔗 [LINK XÁC NHẬN TÀI KHOẢN]: ${verifyUrl}`);
        console.log('====================================================');

        return res.status(200).json({
          success: true,
          verifyEmail: true,
          verificationSent: true,
          email: normalizedEmail,
          verifyUrl: process.env.NODE_ENV !== 'production' ? verifyUrl : undefined,
          message: `Email này đã đăng ký nhưng chưa kích hoạt. Chúng tôi đã gửi lại liên kết kích hoạt tới ${normalizedEmail}.`
        });
      }
      return res.status(409).json({ success: false, message: 'Email này đã được sử dụng trên hệ thống!' });
    }

    // 1. Băm mật khẩu bằng PBKDF2 (hoặc bcrypt)
    const rawPassword = password || '123456';
    const passwordHash = hashPassword(rawPassword);

    // 2. Tạo mã verification_token ngẫu nhiên kèm thời gian hết hạn 24 giờ
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const safeRole = role === 'Provider' ? 'Provider' : 'Customer';
    const now = new Date();
    const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

    const newId = nextUserId(users);
    const newUser = {
      id: newId,
      name: String(name).trim(),
      email: normalizedEmail,
      phone: phone ? String(phone).trim() : '',
      role: safeRole,
      password: rawPassword, // Giữ để tương thích dữ liệu cũ
      password_hash: passwordHash, // Băm mật khẩu theo chuẩn mới
      is_active: false, // MẶC ĐỊNH LÀ FALSE theo mô hình truyền thống
      status: 'pending_verification',
      verification_token: verificationToken,
      verification_token_expires: tokenExpires,
      joinDate: dateStr,
      spentOrEarned: '0đ',
      balance: 0,
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
      bio: ''
    };

    users.push(newUser);
    db.saveCollection('users', users);

    // Khởi tạo hồ sơ Provider sẵn sàng nếu đăng ký làm Provider
    if (safeRole === 'Provider') {
      const providers = db.getCollection('providers') || [];
      const defaultSlots = [
        { day: 'T2', morning: true, afternoon: true, evening: true },
        { day: 'T3', morning: true, afternoon: true, evening: true },
        { day: 'T4', morning: true, afternoon: true, evening: true },
        { day: 'T5', morning: true, afternoon: true, evening: true },
        { day: 'T6', morning: true, afternoon: true, evening: true },
        { day: 'T7', morning: true, afternoon: true, evening: true },
        { day: 'CN', morning: true, afternoon: true, evening: false }
      ];
      providers.unshift({
        id: `PRV${newId.slice(3)}`,
        userId: newId,
        name: newUser.name,
        email: newUser.email,
        phone: newUser.phone,
        avatar: newUser.avatar,
        rating: 5.0,
        reviews: 0,
        completedOrders: 0,
        createdAt: dateStr,
        verified: false,
        hourlyRate: 200000,
        specialty: 'Chuyên gia dịch vụ mới',
        category: 'IT',
        skills: ['Chuyên môn', 'Làm việc chuyên nghiệp'],
        availabilityStatus: 'ready',
        workingHours: 'T2-T7, 08:00-20:00',
        schedule: { mode: 'ready', slots: defaultSlots },
        dateExceptions: {}
      });
      db.saveCollection('providers', providers);
    }

    // 3. Hệ thống tạo đường link xác thực kèm token
    const verifyUrl = `${req.protocol}://${req.get('host')}/api/auth/verify-email?token=${verificationToken}`;

    // In đường dẫn xác thực trực quan ra Terminal để kiểm thử ngay lập tức
    console.log('====================================================');
    console.log(`📧 [EMAIL XÁC THỰC SKILLRENTAL]`);
    console.log(`   - Gửi đến: ${normalizedEmail}`);
    console.log(`   - Họ tên:  ${newUser.name}`);
    console.log(`   - Vai trò: ${newUser.role}`);
    console.log(`   - Link kích hoạt: ${verifyUrl}`);
    console.log('====================================================');

    return res.status(201).json({
      success: true,
      verifyEmail: true,
      verificationSent: true,
      email: normalizedEmail,
      message: `Đăng ký thành công! Chúng tôi đã gửi liên kết kích hoạt đến ${normalizedEmail}. Vui lòng mở email để kích hoạt tài khoản.`,
      verifyUrl: process.env.NODE_ENV !== 'production' ? verifyUrl : undefined,
      user: publicUser(newUser)
    });
  } catch (err) {
    console.error('[auth] Lỗi đăng ký:', err.message);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi đăng ký tài khoản.' });
  }
});

// Alias: /register-traditional
router.post('/register-traditional', (req, res, next) => {
  req.url = '/register';
  router.handle(req, res, next);
});

// ============================================================================
// 1.1 XÁC THỰC EMAIL & TỰ ĐỘNG CẤP SESSION (Click Link Email)
// ============================================================================
router.get('/verify-email', (req, res) => {
  try {
    const { token } = req.query;
    if (!token || typeof token !== 'string') {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html><head><meta charset="utf-8"><title>Lỗi kích hoạt - SkillRental</title></head>
        <body style="font-family:sans-serif;text-align:center;padding:50px;">
          <h2 style="color:#DC2626;">❌ Liên kết kích hoạt không hợp lệ!</h2>
          <p>Mã xác thực bị thiếu hoặc không chính xác.</p>
          <a href="/index.html?auth=login" style="color:#16A34A;font-weight:bold;">Quay lại Trang Chủ</a>
        </body></html>
      `);
    }

    const users = db.getCollection('users') || [];
    const user = users.find(u => u.verification_token === token.trim());

    if (!user) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html><head><meta charset="utf-8"><title>Lỗi kích hoạt - SkillRental</title></head>
        <body style="font-family:sans-serif;text-align:center;padding:50px;">
          <h2 style="color:#DC2626;">❌ Liên kết kích hoạt không tồn tại hoặc đã được kích hoạt trước đó!</h2>
          <p>Bạn có thể thử đăng nhập ngay vào hệ thống.</p>
          <a href="/index.html?auth=login" style="display:inline-block;margin-top:15px;background:#16A34A;color:#fff;padding:10px 20px;text-decoration:none;border-radius:8px;font-weight:bold;">Đến Trang Đăng Nhập</a>
        </body></html>
      `);
    }

    // Kiểm tra thời gian hết hạn token (24h)
    if (user.verification_token_expires && new Date(user.verification_token_expires) < new Date()) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html><head><meta charset="utf-8"><title>Liên kết hết hạn - SkillRental</title></head>
        <body style="font-family:sans-serif;text-align:center;padding:50px;">
          <h2 style="color:#D97706;">⚠️ Liên kết kích hoạt đã hết hạn!</h2>
          <p>Mã xác nhận chỉ có hiệu lực trong vòng 24 giờ. Vui lòng yêu cầu gửi lại email mới.</p>
          <a href="/index.html?auth=login" style="color:#16A34A;font-weight:bold;">Đến trang Đăng Nhập để gửi lại</a>
        </body></html>
      `);
    }

    // 1. Cập nhật is_active = true, xóa token
    user.is_active = true;
    user.status = 'active';
    delete user.verification_token;
    delete user.verification_token_expires;
    db.saveCollection('users', users);

    // 2. ĐẶC TRƯNG TRUYỀN THỐNG: Tự động khởi tạo Session ID mới
    const sessionId = sessionStore.createSession(user);

    // Gửi Set-Cookie về trình duyệt: session_id=sess_...; HttpOnly; SameSite=Lax
    res.cookie('session_id', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/'
    });

    const redirectTarget = user.role === 'Provider' ? '/dashboard.html' : '/customer.html';
    const userJson = JSON.stringify(publicUser(user)).replace(/'/g, "\\'");

    // Trả về trang HTML thông báo kích hoạt thành công, tự động lưu session vào localStorage và chuyển hướng
    return res.send(`
      <!DOCTYPE html>
      <html lang="vi">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Kích hoạt thành công - SkillRental</title>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
        <style>
          body { font-family: 'Inter', sans-serif; background: #F8FAFC; margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; box-sizing: border-box; }
          .card { background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 16px; padding: 36px 32px; max-width: 440px; width: 100%; text-align: center; box-shadow: 0 10px 25px -5px rgba(15,23,42,.08); }
          .icon-box { width: 68px; height: 68px; background: #DCFCE7; color: #16A34A; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 32px; margin: 0 auto 20px; }
          h2 { color: #0F172A; font-size: 22px; font-weight: 800; margin: 0 0 10px; }
          p { color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 24px; }
          .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; background: #16A34A; color: #FFFFFF; padding: 12px 24px; border-radius: 10px; font-weight: 700; font-size: 14px; text-decoration: none; transition: background .15s; }
          .btn:hover { background: #15803D; }
          .note { font-size: 12px; color: #94A3B8; margin-top: 16px; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon-box"><i class="fa-solid fa-check"></i></div>
          <h2>Kích Hoạt Tài Khoản Thành Công!</h2>
          <p>Xin chào <strong>${user.name}</strong>, tài khoản của bạn đã được xác thực thành công. Hệ thống đã tự động khởi tạo phiên đăng nhập an toàn.</p>
          <a href="${redirectTarget}" class="btn" id="btnRedirect"><i class="fa-solid fa-house"></i> Vào Trang Chính Ngay</a>
          <div class="note">Đang tự động chuyển hướng sau <span id="countdown">2</span> giây...</div>
        </div>
        <script>
          try {
            const user = JSON.parse('${userJson}');
            localStorage.setItem('SKILLRENTAL_CURRENT_USER', JSON.stringify(user));
            if ('${user.role}' === 'Provider') {
              localStorage.setItem('SKILLRENTAL_PROVIDER_USER', JSON.stringify(user));
            } else {
              localStorage.setItem('SKILLRENTAL_CUSTOMER_USER', JSON.stringify(user));
            }
          } catch (e) {}

          let sec = 2;
          const timer = setInterval(() => {
            sec--;
            const el = document.getElementById('countdown');
            if (el) el.textContent = sec;
            if (sec <= 0) {
              clearInterval(timer);
              window.location.href = '${redirectTarget}';
            }
          }, 1000);
        </script>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('[auth] Lỗi verify-email:', err.message);
    return res.status(500).send('<h1>Lỗi máy chủ khi xác nhận email.</h1>');
  }
});

// ============================================================================
// 2. ĐĂNG NHẬP (KHỞI TẠO SESSION) - MÔ HÌNH TRUYỀN THỐNG
// ============================================================================
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập đầy đủ email và mật khẩu!' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const users = db.getCollection('users') || [];
    const user = users.find(u => String(u.email || '').toLowerCase() === normalizedEmail);

    if (!user) {
      return res.status(401).json({ success: false, message: 'Email hoặc mật khẩu không chính xác!' });
    }

    // 1. Kiểm tra tài khoản đã kích hoạt chưa
    if (user.is_active === false) {
      return res.status(403).json({
        success: false,
        code: 'EMAIL_NOT_VERIFIED',
        email: user.email,
        message: 'Tài khoản chưa được kích hoạt! Vui lòng kiểm tra hộp thư kích hoạt hoặc yêu cầu gửi lại email xác nhận.'
      });
    }

    // 2. Kiểm tra tài khoản có bị khóa không
    if (user.status === 'locked') {
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_LOCKED',
        message: `Tài khoản đã bị tạm khóa: ${user.lockReason || 'Liên hệ Admin'}`
      });
    }

    // 3. So khớp mật khẩu an toàn (Bcrypt / PBKDF2)
    const storedSecret = user.password_hash || user.password;
    const isValid = comparePassword(String(password), storedSecret);

    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Email hoặc mật khẩu không chính xác!' });
    }

    // 4. KHỞI TẠO SESSION TRUYỀN THỐNG TRONG RAM (Memory Store)
    const sessionId = sessionStore.createSession(user);

    // 5. GỬI RESPONSE KÈM TIÊU ĐỀ: Set-Cookie: session_id=sess_...; HttpOnly; SameSite=Lax
    res.cookie('session_id', sessionId, {
      httpOnly: true,                               // Chống mã độc JavaScript đánh cắp cookie (XSS Protection)
      secure: process.env.NODE_ENV === 'production',// Bật HTTPS khi lên production
      sameSite: 'lax',                              // Chống tấn công CSRF
      maxAge: 24 * 60 * 60 * 1000,                  // 24 giờ
      path: '/'
    });

    console.log(`[auth] ✅ Đăng nhập thành công: ${user.email} -> Session: ${sessionId}`);

    return res.json({
      success: true,
      message: 'Đăng nhập thành công!',
      session_id: sessionId,
      user: publicUser(user)
    });
  } catch (err) {
    console.error('[auth] Lỗi đăng nhập:', err.message);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi đăng nhập.' });
  }
});

// ============================================================================
// 3. ĐĂNG XUẤT (HỦY SESSION) - MÔ HÌNH TRUYỀN THỐNG
// ============================================================================
const handleLogout = (req, res) => {
  try {
    // 1. Backend đọc Cookie để lấy ra session_id đang gửi lên
    const sessionId = (req.cookies && req.cookies.session_id) || req.body?.session_id || req.headers['x-session-id'];

    if (sessionId) {
      // 2. Thực hiện Xóa (Delete) bản ghi của session_id đó trong Memory Store (RAM)
      sessionStore.destroySession(sessionId);
    }

    // 3. Gửi phản hồi về trình duyệt kèm tiêu đề xóa cookie
    res.clearCookie('session_id', {
      path: '/',
      httpOnly: true,
      sameSite: 'lax'
    });

    return res.json({
      success: true,
      message: 'Đăng xuất thành công! Phiên làm việc đã bị hủy hoàn toàn trên máy chủ.'
    });
  } catch (err) {
    console.error('[auth] Lỗi đăng xuất:', err.message);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi đăng xuất.' });
  }
};

router.post('/logout', handleLogout);
router.get('/logout', handleLogout);

// ============================================================================
// 4. KIỂM TRA PHIÊN LÀM VIỆC HIỆN TẠI (GET /api/auth/me)
// ============================================================================
router.get('/me', requireSignedIn, (req, res) => {
  res.json({
    success: true,
    user: publicUser(req.authUser),
    session: req.session || null
  });
});

// ============================================================================
// 5. GỬI LẠI EMAIL KÍCH HOẠT (Resend Verification Token)
// ============================================================================
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email || !String(email).trim()) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập địa chỉ email!' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const users = db.getCollection('users') || [];
    const user = users.find(u => String(u.email || '').toLowerCase() === cleanEmail);

    if (!user) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản với email này.' });
    }

    if (user.is_active === true) {
      return res.json({
        success: true,
        alreadyVerified: true,
        message: 'Tài khoản này đã được kích hoạt trước đó. Bạn có thể đăng nhập ngay!'
      });
    }

    // Sinh token mới và gia hạn 24h
    user.verification_token = crypto.randomBytes(32).toString('hex');
    user.verification_token_expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    db.saveCollection('users', users);

    const verifyUrl = `${req.protocol}://${req.get('host')}/api/auth/verify-email?token=${user.verification_token}`;

    console.log('====================================================');
    console.log(`📧 [GỬI LẠI EMAIL XÁC THỰC SKILLRENTAL]`);
    console.log(`   - Gửi đến: ${cleanEmail}`);
    console.log(`   - Link kích hoạt: ${verifyUrl}`);
    console.log('====================================================');

    return res.json({
      success: true,
      message: `Đã gửi lại liên kết kích hoạt tới ${cleanEmail}. Vui lòng kiểm tra hộp thư!`,
      verifyUrl: process.env.NODE_ENV !== 'production' ? verifyUrl : undefined
    });
  } catch (err) {
    console.error('[auth] Lỗi gửi lại email xác nhận:', err.message);
    return res.status(500).json({ success: false, message: 'Không thể gửi lại email xác nhận lúc này.' });
  }
});

// ============================================================================
// 6. CÁC API PHỤ TRỢ (Quên mật khẩu, Danh sách User Admin, Upload Avatar)
// ============================================================================
router.get('/users', requireAdmin, (req, res) => {
  const users = db.getCollection('users');
  res.json({
    success: true,
    users: users.map(u => ({
      id: u.id, name: u.name, email: u.email, role: u.role,
      balance: u.balance, avatar: u.avatar, status: u.status, is_active: u.is_active !== false
    }))
  });
});

router.put('/profile/avatar', requireSignedIn, express.raw({ type: ['image/*', 'application/octet-stream'], limit: '10mb' }), async (req, res) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) {
    return res.status(400).json({ success: false, message: 'Vui lòng chọn ảnh JPG, PNG hoặc WebP.' });
  }

  const extension = detectImageType(req.body);
  if (!extension) {
    return res.status(415).json({ success: false, message: 'File không phải ảnh JPG, PNG hoặc WebP hợp lệ.' });
  }

  const users = db.getCollection('users');
  const index = users.findIndex(u => u.id === req.authUser.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng!' });
  }

  const uid = String(req.authUser.id).replace(/[^a-zA-Z0-9_-]/g, '');
  const fileName = `${randomUUID()}.${extension}`;
  const relativePath = path.posix.join('avatars', uid, fileName);
  const uploadRoot = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads'));
  const absolutePath = path.resolve(uploadRoot, ...relativePath.split('/'));

  try {
    await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.promises.writeFile(absolutePath, req.body, { flag: 'wx', mode: 0o640 });
    const avatar = `${req.protocol}://${req.get('host')}/uploads/${relativePath.split('/').map(encodeURIComponent).join('/')}`;
    users[index].avatar = avatar;
    db.saveCollection('users', users);

    const providers = db.getCollection('providers') || [];
    const pIndex = providers.findIndex(p => p.userId === req.authUser.id || p.id === req.authUser.id);
    if (pIndex !== -1) {
      providers[pIndex].avatar = avatar;
      db.saveCollection('providers', providers);
    }

    return res.json({ success: true, message: 'Đã cập nhật ảnh đại diện.', user: publicUser(users[index]) });
  } catch (err) {
    console.error('[auth] Upload avatar:', err.message);
    return res.status(500).json({ success: false, message: 'Không thể lưu ảnh đại diện lúc này.' });
  }
});

router.put('/change-password', requireSignedIn, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập đầy đủ mật khẩu hiện tại và mật khẩu mới!' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ success: false, message: 'Mật khẩu mới phải có ít nhất 6 ký tự!' });
  }

  const users = db.getCollection('users') || [];
  const user = users.find(u => u.id === req.authUser.id);
  if (!user) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng.' });
  }

  const storedSecret = user.password_hash || user.password;
  if (!comparePassword(currentPassword, storedSecret)) {
    return res.status(401).json({ success: false, message: 'Mật khẩu hiện tại không chính xác!' });
  }

  user.password_hash = hashPassword(newPassword);
  user.password = newPassword;
  db.saveCollection('users', users);

  res.json({ success: true, message: 'Đổi mật khẩu thành công!' });
});

// ============================================================================
// 4. LẤY LẠI MẬT KHẨU (FORGOT & RESET PASSWORD - MÔ HÌNH TRUYỀN THỐNG)
// ============================================================================

// 4.1 Gửi yêu cầu lấy lại mật khẩu (sinh reset_token ngắn hạn 30 phút)
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body || {};
  if (!email || !String(email).trim()) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập địa chỉ email!' });
  }
  const cleanEmail = String(email).trim().toLowerCase();
  const users = db.getCollection('users') || [];
  const user = users.find(u => String(u.email || '').toLowerCase() === cleanEmail);

  if (!user) {
    return res.json({ success: true, message: `Nếu email ${cleanEmail} tồn tại trong hệ thống, liên kết khôi phục đã được tạo.` });
  }

  // Sinh reset_token ngẫu nhiên an toàn, có thời hạn ngắn (30 phút)
  const resetToken = crypto.randomBytes(32).toString('hex');
  user.reset_password_token = resetToken;
  user.reset_password_expires = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  db.saveCollection('users', users);

  const resetUrl = `${req.protocol}://${req.get('host')}/reset_password.html?token=${resetToken}`;
  console.log('====================================================');
  console.log(`🔑 [YÊU CẦU ĐẶT LẠI MẬT KHẨU - SKILLRENTAL]`);
  console.log(`   - Gửi đến email:  ${cleanEmail}`);
  console.log(`   - Họ tên user:    ${user.name}`);
  console.log(`   - Token ngắn hạn: ${resetToken} (Hiệu lực: 30 phút)`);
  console.log(`   - Link đặt lại:   ${resetUrl}`);
  console.log('====================================================');

  res.json({
    success: true,
    message: `Liên kết khôi phục mật khẩu đã được tạo cho ${cleanEmail}. Vui lòng kiểm tra email hoặc terminal server.`,
    resetLink: process.env.NODE_ENV !== 'production' ? resetUrl : undefined
  });
});

// 4.2 Kiểm tra tính hợp lệ của reset_token
router.get('/verify-reset-token', (req, res) => {
  const { token } = req.query || {};
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ success: false, message: 'Mã xác thực không hợp lệ!' });
  }

  const users = db.getCollection('users') || [];
  const user = users.find(u => u.reset_password_token === token.trim());

  if (!user) {
    return res.status(404).json({ success: false, message: 'Liên kết đặt lại mật khẩu không tồn tại hoặc đã được sử dụng.' });
  }

  if (user.reset_password_expires && new Date(user.reset_password_expires) < new Date()) {
    return res.status(410).json({ success: false, message: 'Liên kết đặt lại mật khẩu đã hết hạn (chỉ có hiệu lực trong 30 phút).' });
  }

  return res.json({
    success: true,
    email: user.email,
    name: user.name
  });
});

// 4.3 Đặt lại mật khẩu mới & Quét xóa toàn bộ Session cũ của User
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body || {};

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ success: false, message: 'Mã xác thực không hợp lệ hoặc bị thiếu!' });
    }

    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Mật khẩu mới phải có ít nhất 6 ký tự!' });
    }

    const users = db.getCollection('users') || [];
    const user = users.find(u => u.reset_password_token === token.trim());

    if (!user) {
      return res.status(404).json({ success: false, message: 'Liên kết đặt lại mật khẩu không tồn tại hoặc đã được sử dụng.' });
    }

    // Kiểm tra thời gian hết hạn
    if (user.reset_password_expires && new Date(user.reset_password_expires) < new Date()) {
      return res.status(410).json({ success: false, message: 'Liên kết đặt lại mật khẩu đã hết hạn. Vui lòng yêu cầu liên kết mới.' });
    }

    // 1. Băm mật khẩu mới bằng PBKDF2
    const passwordHash = hashPassword(newPassword);
    user.password_hash = passwordHash;
    user.password = newPassword;

    // 2. Xóa token đặt lại mật khẩu
    delete user.reset_password_token;
    delete user.reset_password_expires;
    db.saveCollection('users', users);

    // 3. ĐẶC TRƯNG BẢO MẬT TRUYỀN THỐNG:
    // Quét và xóa toàn bộ các Session hiện có của người dùng trong bộ nhớ RAM
    // để ép tất cả các thiết bị/trình duyệt phải đăng nhập lại với mật khẩu mới.
    const destroyedCount = sessionStore.destroyAllUserSessions(user.id);
    console.log(`[auth] 🔒 Đã đổi mật khẩu cho user: ${user.email}. Đã hủy ${destroyedCount} phiên làm việc (Session) trong RAM.`);

    // 4. Xóa cookie của request hiện tại nếu có
    res.clearCookie('session_id', { path: '/' });

    return res.json({
      success: true,
      message: 'Đặt lại mật khẩu thành công! Toàn bộ phiên làm việc cũ đã được hủy an toàn. Bạn có thể đăng nhập ngay với mật khẩu mới.'
    });
  } catch (err) {
    console.error('[auth] Lỗi reset-password:', err.message);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi đặt lại mật khẩu.' });
  }
});

module.exports = router;
