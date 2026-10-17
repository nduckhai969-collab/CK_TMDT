const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const db = require('../data/db');
const { auth } = require('../firebase');
const { authenticate, requireSignedIn, requireAdmin } = require('./customerAuth');

// Đăng ký / đăng nhập / đăng xuất / quên mật khẩu / gửi email xác nhận
// do Firebase Authentication (frontend) xử lý. Server chỉ quản lý HỒ SƠ người dùng.

function publicUser(user) {
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
        .filter(t => t.type === 'escrow' || t.type === 'order_payment' || t.type === 'withdraw')
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

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    address: user.address || '',
    bio: user.bio || '',
    role: user.role,
    balance: typeof bal === 'number' ? bal : (Number(user.balance) || 0),
    avatar: user.avatar,
    joinDate: user.joinDate
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

// Tạo hồ sơ sau khi frontend đã tạo tài khoản Firebase (token có thể chưa xác nhận email)
router.post('/register', authenticate({ allowNoProfile: true, allowUnverified: true }), async (req, res) => {
  if (req.authUser) {
    return res.status(409).json({ success: false, message: 'Tài khoản này đã có hồ sơ trên hệ thống!' });
  }

  const { name, phone, role } = req.body || {};
  const email = req.firebaseUser.email;

  if (!name || !String(name).trim() || !email) {
    return res.status(400).json({ success: false, message: 'Vui lòng điền đầy đủ họ tên và email!' });
  }
  if (phone && !/^[0-9+\s().-]{8,16}$/.test(String(phone).trim())) {
    return res.status(400).json({ success: false, message: 'Số điện thoại không hợp lệ!' });
  }

  const users = db.getCollection('users');
  const existingUser = users.find(u => String(u.email || '').toLowerCase() === email.toLowerCase());
  if (existingUser) {
    if (!existingUser.uid) {
      existingUser.uid = req.firebaseUser.uid;
      if (name) existingUser.name = String(name).trim();
      if (phone) existingUser.phone = String(phone).trim();
      if (role === 'Provider' || role === 'Customer') existingUser.role = role;
      db.saveCollection('users', users);
      try {
        await auth.setCustomUserClaims(req.firebaseUser.uid, { role: existingUser.role });
      } catch (err) {
        console.error('[auth] Không gán được custom claims:', err.message);
      }
      return res.status(201).json({
        success: true,
        message: 'Đăng ký tài khoản thành công! Vui lòng kiểm tra email để xác nhận.',
        user: publicUser(existingUser)
      });
    }
    return res.status(409).json({ success: false, message: 'Email này đã được sử dụng trên hệ thống!' });
  }

  // Chỉ cho phép tự đăng ký Customer hoặc Provider, KHÔNG cho tự chọn Admin
  const safeRole = role === 'Provider' ? 'Provider' : 'Customer';
  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

  const newUser = {
    id: nextUserId(users),
    uid: req.firebaseUser.uid,
    name: String(name).trim(),
    email,
    phone: phone ? String(phone).trim() : '',
    role: safeRole,
    joinDate: dateStr,
    spentOrEarned: '0đ',
    balance: 0,
    status: 'active',
    avatar: '',
    bio: ''
  };

  users.push(newUser);
  db.saveCollection('users', users);

  try {
    await auth.setCustomUserClaims(req.firebaseUser.uid, { role: safeRole });
  } catch (err) {
    console.error('[auth] Không gán được custom claims:', err.message);
  }

  res.status(201).json({
    success: true,
    message: 'Đăng ký tài khoản thành công! Vui lòng kiểm tra email để xác nhận.',
    user: publicUser(newUser)
  });
});

// Đăng nhập: frontend đăng nhập Firebase, gửi token lên đây để lấy hồ sơ
router.post('/login', requireSignedIn, (req, res) => {
  res.json({ success: true, message: 'Đăng nhập thành công!', user: publicUser(req.authUser) });
});

// Hồ sơ hiện tại
router.get('/me', requireSignedIn, (req, res) => {
  res.json({ success: true, user: publicUser(req.authUser) });
});

// Danh sách user (chỉ Admin)
router.get('/users', requireAdmin, (req, res) => {
  const users = db.getCollection('users');
  res.json({
    success: true,
    users: users.map(u => ({
      id: u.id, name: u.name, email: u.email, role: u.role,
      balance: u.balance, avatar: u.avatar, status: u.status
    }))
  });
});

// Upload file avatar lên backend; Firestore chỉ lưu URL, không lưu nội dung ảnh.
router.put('/profile/avatar', requireSignedIn, express.raw({ type: 'image/*', limit: '5mb' }), async (req, res) => {
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

  const uid = String(req.firebaseUser.uid || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!uid) return res.status(400).json({ success: false, message: 'Không xác định được tài khoản Firebase.' });

  const fileName = `${randomUUID()}.${extension}`;
  const relativePath = path.posix.join('avatars', uid, fileName);
  const uploadRoot = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads'));
  const absolutePath = path.resolve(uploadRoot, ...relativePath.split('/'));
  if (!absolutePath.startsWith(uploadRoot + path.sep)) {
    return res.status(400).json({ success: false, message: 'Đường dẫn lưu ảnh không hợp lệ.' });
  }

  try {
    await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.promises.writeFile(absolutePath, req.body, { flag: 'wx', mode: 0o640 });
    const avatar = `${req.protocol}://${req.get('host')}/uploads/${relativePath.split('/').map(encodeURIComponent).join('/')}`;
    const previousAvatar = users[index].avatar;
    users[index].avatar = avatar;
    db.saveCollection('users', users);

    // Xóa file cũ chỉ khi nó nằm trong thư mục upload do ứng dụng quản lý.
    if (previousAvatar) {
      try {
        const previousUrl = new URL(previousAvatar, avatar);
        const previousPath = decodeURIComponent(previousUrl.pathname);
        if (previousUrl.origin === new URL(avatar).origin && previousPath.startsWith('/uploads/avatars/')) {
          const oldFile = path.resolve(uploadRoot, ...previousPath.slice('/uploads/'.length).split('/'));
          if (oldFile.startsWith(uploadRoot + path.sep) && oldFile !== absolutePath) await fs.promises.unlink(oldFile).catch(() => {});
        }
      } catch (_) { /* URL cũ có thể thuộc dịch vụ lưu trữ khác */ }
    }

    return res.json({ success: true, message: 'Đã cập nhật ảnh đại diện.', user: publicUser(users[index]) });
  } catch (err) {
    console.error('[auth] Upload avatar:', err.message);
    return res.status(500).json({ success: false, message: 'Không thể lưu ảnh đại diện lúc này.' });
  }
});

// Cập nhật hồ sơ
router.put('/profile', requireSignedIn, (req, res) => {
  const { name, phone, address, avatar, bio } = req.body || {};

  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: 'Họ tên không được để trống!' });
  }

  const users = db.getCollection('users');
  const index = users.findIndex(u => u.id === req.authUser.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng!' });
  }

  users[index].name = name.trim();
  users[index].phone = phone ? phone.trim() : '';
  users[index].address = address ? address.trim() : '';
  if (avatar) users[index].avatar = avatar;
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'bio')) {
    const trimmedBio = String(bio || '').trim();
    if (trimmedBio.length > 1000) {
      return res.status(400).json({ success: false, message: 'Giới thiệu bản thân không được vượt quá 1000 ký tự.' });
    }
    users[index].bio = trimmedBio;
  }
  db.saveCollection('users', users);

  res.json({ success: true, message: 'Cập nhật thông tin thành công!', user: publicUser(users[index]) });
});

// Đổi mật khẩu: kiểm tra mật khẩu hiện tại qua Firebase Auth REST API rồi cập nhật
router.put('/change-password', requireSignedIn, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập đầy đủ mật khẩu hiện tại và mật khẩu mới!' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ success: false, message: 'Mật khẩu mới phải có ít nhất 6 ký tự!' });
  }
  if (currentPassword === newPassword) {
    return res.status(400).json({ success: false, message: 'Mật khẩu mới phải khác mật khẩu hiện tại!' });
  }

  const apiKey = process.env.FIREBASE_WEB_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ success: false, message: 'Server chưa cấu hình FIREBASE_WEB_API_KEY.' });
  }

  try {
    const verify = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: req.firebaseUser.email, password: currentPassword, returnSecureToken: false })
      }
    );
    if (!verify.ok) {
      return res.status(401).json({ success: false, message: 'Mật khẩu hiện tại không chính xác!' });
    }

    await auth.updateUser(req.firebaseUser.uid, { password: newPassword });
    res.json({ success: true, message: 'Đổi mật khẩu thành công!' });
  } catch (err) {
    console.error('[auth] change-password:', err.message);
    res.status(500).json({ success: false, message: 'Không thể đổi mật khẩu lúc này.' });
  }
});

// Gửi lại email xác nhận từ server qua Firebase Admin SDK
router.post('/resend-verification', async (req, res) => {
  const { email } = req.body || {};
  if (!email || !String(email).trim()) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập địa chỉ email!' });
  }
  const cleanEmail = String(email).trim().toLowerCase();
  try {
    const userRecord = await auth.getUserByEmail(cleanEmail);
    if (userRecord.emailVerified) {
      return res.json({ success: true, alreadyVerified: true, message: 'Email này đã được xác nhận. Bạn có thể đăng nhập ngay!' });
    }
    let verifyLink;
    try {
      const appUrl = process.env.APP_URL || 'https://skillrental-30a5e.firebaseapp.com';
      verifyLink = await auth.generateEmailVerificationLink(cleanEmail, {
        url: `${appUrl}/verify.html`,
        handleCodeInApp: false
      });
    } catch (_) {
      verifyLink = await auth.generateEmailVerificationLink(cleanEmail);
    }

    res.json({
      success: true,
      message: `Đã tạo liên kết xác nhận cho ${cleanEmail}. Vui lòng kiểm tra hộp thư của bạn.`,
      verifyLink: process.env.NODE_ENV !== 'production' ? verifyLink : undefined
    });
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản với email này.' });
    }
    console.error('[auth] resend-verification:', err.message);
    res.status(500).json({ success: false, message: 'Không thể gửi lại email xác nhận lúc này.' });
  }
});

// Quên mật khẩu: tạo liên kết đặt lại mật khẩu từ server qua Firebase Admin SDK
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body || {};
  if (!email || !String(email).trim()) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập địa chỉ email!' });
  }
  const cleanEmail = String(email).trim().toLowerCase();
  try {
    let resetLink;
    try {
      const appUrl = process.env.APP_URL || 'https://skillrental-30a5e.firebaseapp.com';
      resetLink = await auth.generatePasswordResetLink(cleanEmail, {
        url: `${appUrl}/verify.html`,
        handleCodeInApp: false
      });
    } catch (_) {
      resetLink = await auth.generatePasswordResetLink(cleanEmail);
    }
    res.json({
      success: true,
      message: `Nếu email ${cleanEmail} tồn tại trong hệ thống, liên kết khôi phục mật khẩu đã được tạo.`,
      resetLink: process.env.NODE_ENV !== 'production' ? resetLink : undefined
    });
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      return res.json({
        success: true,
        message: `Nếu email ${cleanEmail} tồn tại trong hệ thống, liên kết khôi phục mật khẩu đã được tạo.`
      });
    }
    console.error('[auth] forgot-password:', err.message);
    res.status(500).json({ success: false, message: 'Không thể xử lý yêu cầu đặt lại mật khẩu lúc này.' });
  }
});

module.exports = router;
