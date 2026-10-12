const express = require('express');
const router = express.Router();
const db = require('../data/db');
const { requireSignedIn } = require('./customerAuth');

// Get list of chat conversations for a user
router.get('/threads', requireSignedIn, (req, res) => {
  const userId = req.authUser.id;
  const messages = db.getCollection('messages') || [];
  const users = db.getCollection('users') || [];
  const providers = db.getCollection('providers') || [];

  const partnerIds = new Set();
  messages.forEach(m => {
    if (m.fromUserId === userId) partnerIds.add(m.toUserId);
    if (m.toUserId === userId) partnerIds.add(m.fromUserId);
  });

  const threads = Array.from(partnerIds).map(pid => {
    const partner = users.find(u => u.id === pid) || {};
    const prov = providers.find(p => p.userId === pid || p.id === pid) || {};
    const threadMsgs = messages.filter(m =>
      (m.fromUserId === userId && m.toUserId === pid) ||
      (m.fromUserId === pid && m.toUserId === userId)
    );
    const lastMsg = threadMsgs[threadMsgs.length - 1] || null;

    return {
      partnerId: pid,
      providerId: prov.id || pid,
      name: partner.name || prov.name || 'Tài khoản',
      avatar: partner.avatar || prov.avatar || '',
      role: prov.specialty || partner.role || '',
      lastMessage: lastMsg ? lastMsg.text : '',
      lastTime: lastMsg ? lastMsg.time : '',
      unread: 0
    };
  });

  res.json({
    success: true,
    threads
  });
});

// Get messages between two users or for a user
router.get('/', requireSignedIn, (req, res) => {
  const { user1, user2 } = req.query;
  if (user1 && user1 !== req.authUser.id) {
    return res.status(403).json({ success: false, message: 'Bạn không có quyền xem cuộc trò chuyện này.' });
  }
  let messages = db.getCollection('messages') || [];

  if (user2) {
    messages = messages.filter(m =>
      (m.fromUserId === req.authUser.id && m.toUserId === user2) ||
      (m.fromUserId === user2 && m.toUserId === req.authUser.id)
    );
  } else {
    messages = messages.filter(m => m.fromUserId === req.authUser.id || m.toUserId === req.authUser.id);
  }

  res.json({
    success: true,
    total: messages.length,
    messages
  });
});

// Send a new chat message
router.post('/', requireSignedIn, (req, res) => {
  const { fromUserId, toUserId, text } = req.body;

  if (!fromUserId || !toUserId || !text) {
    return res.status(400).json({ success: false, message: 'Nội dung tin nhắn không được để trống!' });
  }

  if (fromUserId !== req.authUser.id) {
    return res.status(403).json({ success: false, message: 'Không thể gửi tin nhắn thay cho tài khoản khác.' });
  }

  const messages = db.getCollection('messages');
  const now = new Date();
  const timeStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const newId = `MSG${String(messages.length + 1).padStart(3, '0')}`;

  const newMsg = {
    id: newId,
    fromUserId,
    toUserId,
    text: text.trim(),
    time: timeStr
  };

  messages.push(newMsg);
  db.saveCollection('messages', messages);

  res.status(201).json({
    success: true,
    message: newMsg
  });
});

module.exports = router;
