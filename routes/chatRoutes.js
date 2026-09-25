const express = require('express');
const router = express.Router();
const db = require('../data/db');

// Get messages between two users or for a user
router.get('/', (req, res) => {
  const { user1, user2 } = req.query;
  let messages = db.getCollection('messages');

  if (user1 && user2) {
    messages = messages.filter(m =>
      (m.fromUserId === user1 && m.toUserId === user2) ||
      (m.fromUserId === user2 && m.toUserId === user1)
    );
  } else if (user1) {
    messages = messages.filter(m => m.fromUserId === user1 || m.toUserId === user1);
  }

  res.json({
    success: true,
    total: messages.length,
    messages
  });
});

// Send a new chat message
router.post('/', (req, res) => {
  const { fromUserId, toUserId, text } = req.body;

  if (!fromUserId || !toUserId || !text) {
    return res.status(400).json({ success: false, message: 'Nội dung tin nhắn không được để trống!' });
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
