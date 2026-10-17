const express = require('express');
const router = express.Router();
const { requireSignedIn } = require('./customerAuth');
const { getNotifications, markAsRead, markAllAsRead } = require('../services/notificationService');

// Lấy danh sách thông báo
router.get('/', requireSignedIn, (req, res) => {
  const notifications = getNotifications(req.authUser.id);
  res.json({
    success: true,
    notifications
  });
});

// Đánh dấu 1 thông báo đã đọc
router.put('/:id/read', requireSignedIn, (req, res) => {
  markAsRead(req.authUser.id, req.params.id);
  res.json({ success: true, message: 'Đã đánh dấu đọc' });
});

// Đánh dấu tất cả đã đọc
router.put('/read-all', requireSignedIn, (req, res) => {
  markAllAsRead(req.authUser.id);
  res.json({ success: true, message: 'Đã đánh dấu tất cả là đã đọc' });
});

module.exports = router;
