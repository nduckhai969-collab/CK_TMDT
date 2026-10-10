const express = require('express');
const router = express.Router();
const db = require('../data/db');
const { auth } = require('../firebase');
const { authenticate, requireSignedIn, requireAdmin } = require('./customerAuth');

// Đăng ký / đăng nhập / đăng xuất / quên mật khẩu / gửi email xác nhận
// do Firebase Authentication (frontend) xử lý. Server chỉ quản lý HỒ SƠ người dùng.

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    address: user.address || '',
    role: user.role,
    balance: user.balance,
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
  if (users.some(u => String(u.email || '').toLowerCase() === email.toLowerCase())) {
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
    phone: phone ? String(phone).trim() : '0900 000 000',
    role: safeRole,
    joinDate: dateStr,
    spentOrEarned: '0đ',
    balance: safeRole === 'Customer' ? 5000000 : 0, // số dư thử nghiệm
    status: 'active',
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150'
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

// Cập nhật hồ sơ
router.put('/profile', requireSignedIn, (req, res) => {
  const { name, phone, address, avatar } = req.body || {};

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

module.exports = router;
