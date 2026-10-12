const express = require('express');
const router = express.Router();
const db = require('../data/db');

// Login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const users = db.getCollection('users');
  const user = users.find(u => u.email.toLowerCase() === (email || '').trim().toLowerCase());

  if (!user) {
    return res.status(401).json({ success: false, message: 'Email hoặc tài khoản không tồn tại!' });
  }

  if (user.password && user.password !== password) {
    return res.status(401).json({ success: false, message: 'Mật khẩu không chính xác!' });
  }

  if (user.status === 'locked') {
    return res.status(403).json({ success: false, message: `Tài khoản đã bị tạm khóa: ${user.lockReason || 'Liên hệ Admin'}` });
  }

  res.json({
    success: true,
    message: 'Đăng nhập thành công!',
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      balance: user.balance,
      avatar: user.avatar
    }
  });
});

// Register
router.post('/register', (req, res) => {
  const { name, email, phone, password, role = 'Customer' } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: 'Vui lòng điền đầy đủ họ tên, email và mật khẩu!' });
  }

  const users = db.getCollection('users');
  const existing = users.find(u => u.email.toLowerCase() === email.trim().toLowerCase());

  if (existing) {
    return res.status(409).json({ success: false, message: 'Email này đã được sử dụng trên hệ thống!' });
  }

  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  const newId = `USR${String(users.length + 1).padStart(3, '0')}`;

  const newUser = {
    id: newId,
    name: name.trim(),
    email: email.trim(),
    phone: phone ? phone.trim() : '0900 000 000',
    role: role === 'Provider' ? 'Provider' : 'Customer',
    password: password,
    joinDate: dateStr,
    spentOrEarned: '0đ',
    balance: role === 'Customer' ? 5000000 : 0, // Free 5M test balance for customer
    status: 'active',
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150'
  };

  users.push(newUser);
  db.saveCollection('users', users);

  res.status(201).json({
    success: true,
    message: 'Đăng ký tài khoản thành công!',
    user: {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      phone: newUser.phone,
      role: newUser.role,
      balance: newUser.balance,
      avatar: newUser.avatar
    }
  });
});

// Get current profile
router.get('/me', (req, res) => {
  const userId = req.headers['x-user-id'] || req.query.userId || 'USR003';
  const users = db.getCollection('users');
  const user = users.find(u => u.id === userId);

  if (!user) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
  }

  res.json({
    success: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      balance: user.balance,
      avatar: user.avatar,
      joinDate: user.joinDate
    }
  });
});

// List all users for demo switcher
router.get('/users', (req, res) => {
  const users = db.getCollection('users');

  res.json({
    success: true,
    users: users.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      balance: u.balance,
      avatar: u.avatar,
      status: u.status
    }))
  });
});


// Update current profile
router.put('/profile', (req, res) => {
  const userId = req.headers['x-user-id'] || req.body.userId;

  if (!userId) {
    return res.status(400).json({
      success: false,
      message: 'Không xác định được tài khoản!'
    });
  }

  const { name, phone, address, avatar } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Họ tên không được để trống!'
    });
  }

  const users = db.getCollection('users');
  const userIndex = users.findIndex(u => u.id === userId);

  if (userIndex === -1) {
    return res.status(404).json({
      success: false,
      message: 'Không tìm thấy người dùng!'
    });
  }

  users[userIndex].name = name.trim();
  users[userIndex].phone = phone ? phone.trim() : '';
  users[userIndex].address = address ? address.trim() : '';

  if (avatar) {
    users[userIndex].avatar = avatar;
  }

  db.saveCollection('users', users);

  res.json({
    success: true,
    message: 'Cập nhật thông tin thành công!',
    user: {
      id: users[userIndex].id,
      name: users[userIndex].name,
      email: users[userIndex].email,
      phone: users[userIndex].phone,
      address: users[userIndex].address || '',
      role: users[userIndex].role,
      balance: users[userIndex].balance,
      avatar: users[userIndex].avatar,
      joinDate: users[userIndex].joinDate
    }
  });
});


// Change password
router.put('/change-password', (req, res) => {
  const userId = req.headers['x-user-id'] || req.body.userId;

  const {
    currentPassword,
    newPassword
  } = req.body;

  if (!userId) {
    return res.status(400).json({
      success: false,
      message: 'Không xác định được tài khoản!'
    });
  }

  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      success: false,
      message: 'Vui lòng nhập đầy đủ mật khẩu hiện tại và mật khẩu mới!'
    });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'Mật khẩu mới phải có ít nhất 6 ký tự!'
    });
  }

  const users = db.getCollection('users');
  const userIndex = users.findIndex(u => u.id === userId);

  if (userIndex === -1) {
    return res.status(404).json({
      success: false,
      message: 'Không tìm thấy người dùng!'
    });
  }

  const user = users[userIndex];

  if (user.password !== currentPassword) {
    return res.status(401).json({
      success: false,
      message: 'Mật khẩu hiện tại không chính xác!'
    });
  }

  if (currentPassword === newPassword) {
    return res.status(400).json({
      success: false,
      message: 'Mật khẩu mới phải khác mật khẩu hiện tại!'
    });
  }

  users[userIndex].password = newPassword;

  db.saveCollection('users', users);

  res.json({
    success: true,
    message: 'Đổi mật khẩu thành công!'
  });
});


// Export router
module.exports = router;