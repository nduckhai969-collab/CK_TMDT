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

module.exports = router;
