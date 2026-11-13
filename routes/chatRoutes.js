const express = require('express');
const router = express.Router();
const db = require('../data/db');
const { requireSignedIn } = require('./customerAuth');

function getAssociatedIds(userId) {
  const ids = new Set([userId]);
  const providers = db.getCollection('providers') || [];
  const prov = providers.find(p => p.userId === userId || p.id === userId);
  if (prov) {
    if (prov.id) ids.add(prov.id);
    if (prov.userId) ids.add(prov.userId);
  }
  return Array.from(ids);
}

function resolveUserId(id) {
  if (!id) return id;
  const providers = db.getCollection('providers') || [];
  const prov = providers.find(p => p.id === id);
  if (prov && prov.userId) return prov.userId;
  return id;
}

function getProviderProfile(userId) {
  const providers = db.getCollection('providers') || [];
  return providers.find(p => p.userId === userId || p.id === userId) || null;
}

const DEFAULT_AUTO_REPLY_TEXT = 'Chào bạn! Cảm ơn bạn đã liên hệ với tôi. Tôi đã nhận được tin nhắn và sẽ phản hồi bạn trong ít phút. Bạn có thể để lại yêu cầu cụ thể hoặc gửi tài liệu nhé!';

// 1. Lấy cài đặt phản hồi mặc định (Auto-Reply) của Provider
router.get('/auto-reply', requireSignedIn, (req, res) => {
  const prov = getProviderProfile(req.authUser.id);
  if (!prov) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ Chuyên gia.' });
  }

  const autoReply = prov.autoReply || {
    enabled: true,
    message: DEFAULT_AUTO_REPLY_TEXT
  };

  res.json({
    success: true,
    autoReply
  });
});

// 2. Cập nhật cài đặt phản hồi mặc định (Auto-Reply) của Provider
router.put('/auto-reply', requireSignedIn, (req, res) => {
  const providers = db.getCollection('providers') || [];
  const provIndex = providers.findIndex(p => p.userId === req.authUser.id || p.id === req.authUser.id);

  if (provIndex === -1) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ Chuyên gia.' });
  }

  const { enabled, message } = req.body;
  const cleanMessage = String(message || '').trim() || DEFAULT_AUTO_REPLY_TEXT;

  providers[provIndex].autoReply = {
    enabled: enabled !== undefined ? Boolean(enabled) : true,
    message: cleanMessage,
    updatedAt: new Date().toISOString()
  };

  db.saveCollection('providers', providers);

  res.json({
    success: true,
    message: 'Đã lưu cấu hình phản hồi mặc định thành công!',
    autoReply: providers[provIndex].autoReply
  });
});

// 3. Danh sách các cuộc hội thoại (Threads) — có đếm tin nhắn chưa đọc
router.get('/threads', requireSignedIn, (req, res) => {
  const userId = req.authUser.id;
  const myIds = getAssociatedIds(userId);
  const messages = db.getCollection('messages') || [];
  const users = db.getCollection('users') || [];
  const providers = db.getCollection('providers') || [];

  const partnerIds = new Set();
  messages.forEach(m => {
    if (myIds.includes(m.fromUserId)) {
      partnerIds.add(resolveUserId(m.toUserId));
    }
    if (myIds.includes(m.toUserId)) {
      partnerIds.add(resolveUserId(m.fromUserId));
    }
  });

  // Loại bỏ chính mình ra khỏi danh sách đối tác
  myIds.forEach(id => partnerIds.delete(id));

  const threads = Array.from(partnerIds).map(pid => {
    const partnerUser = users.find(u => u.id === pid) || {};
    const partnerProv = providers.find(p => p.userId === pid || p.id === pid) || {};
    const partnerIdsList = getAssociatedIds(pid);

    const threadMsgs = messages.filter(m =>
      (myIds.includes(m.fromUserId) && partnerIdsList.includes(m.toUserId)) ||
      (partnerIdsList.includes(m.fromUserId) && myIds.includes(m.toUserId))
    );

    const lastMsg = threadMsgs[threadMsgs.length - 1] || null;

    // Đếm tin nhắn chưa đọc: tin từ đối phương gửi cho mình mà chưa có readAt[myId]
    const unread = threadMsgs.filter(m => {
      // Tin từ partner gửi đến mình
      if (!partnerIdsList.includes(m.fromUserId)) return false;
      if (!myIds.includes(m.toUserId)) return false;
      // Chưa được đánh dấu đọc bởi mình
      const readBy = m.readBy || {};
      return !myIds.some(myId => readBy[myId]);
    }).length;

    return {
      partnerId: pid,
      providerId: partnerProv.id || pid,
      // The user account is the source of truth for the person in the conversation.
      // Provider profiles can contain stale/demo names and must not override it.
      name: partnerUser.name || partnerProv.name || 'Người dùng',
      avatar: partnerUser.avatar || partnerProv.avatar || '',
      role: partnerProv.specialty || (partnerUser.role === 'Provider' ? 'Chuyên gia' : 'Khách hàng'),
      lastMessage: lastMsg ? lastMsg.text : '',
      lastTime: lastMsg ? lastMsg.time : '',
      unread,
      lastMsgRaw: lastMsg
    };
  });

  // Sắp xếp: ưu tiên có tin chưa đọc, rồi mới nhất lên đầu
  threads.sort((a, b) => {
    if (!a.lastMsgRaw) return 1;
    if (!b.lastMsgRaw) return -1;
    return b.lastMsgRaw.id.localeCompare(a.lastMsgRaw.id);
  });

  res.json({
    success: true,
    threads
  });
});

// 4. Lấy tin nhắn chi tiết giữa 2 bên
router.get('/', requireSignedIn, (req, res) => {
  const { user1, user2 } = req.query;
  const myUserId = req.authUser.id;

  if (user1 && user1 !== myUserId && !getAssociatedIds(myUserId).includes(user1)) {
    return res.status(403).json({ success: false, message: 'Bạn không có quyền xem cuộc trò chuyện này.' });
  }

  const myIds = getAssociatedIds(myUserId);
  let messages = db.getCollection('messages') || [];

  if (user2) {
    const partnerIds = getAssociatedIds(user2);
    messages = messages.filter(m =>
      (myIds.includes(m.fromUserId) && partnerIds.includes(m.toUserId)) ||
      (partnerIds.includes(m.fromUserId) && myIds.includes(m.toUserId))
    );
  } else {
    messages = messages.filter(m => myIds.includes(m.fromUserId) || myIds.includes(m.toUserId));
  }

  res.json({
    success: true,
    total: messages.length,
    messages
  });
});

// 5. Gửi tin nhắn mới & Tự động phản hồi (Auto-Reply) nếu gửi tới Provider
router.post('/', requireSignedIn, (req, res) => {
  const { fromUserId, toUserId, text } = req.body;

  if (!fromUserId || !toUserId || !text || !text.trim()) {
    return res.status(400).json({ success: false, message: 'Nội dung tin nhắn không được để trống!' });
  }

  const myIds = getAssociatedIds(req.authUser.id);
  if (!myIds.includes(fromUserId)) {
    return res.status(403).json({ success: false, message: 'Không thể gửi tin nhắn thay cho tài khoản khác.' });
  }

  const messages = db.getCollection('messages') || [];
  const providers = db.getCollection('providers') || [];
  const resolvedToUserId = resolveUserId(toUserId);

  const now = new Date();
  const timeStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const newMsgId = `MSG${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const newMsg = {
    id: newMsgId,
    fromUserId: req.authUser.id,
    toUserId: resolvedToUserId,
    text: text.trim(),
    time: timeStr,
    // Người gửi tự đánh dấu đã đọc tin của chính mình
    readBy: { [req.authUser.id]: new Date().toISOString() }
  };

  messages.push(newMsg);

  // Kiểm tra xem đối phương có phải là Provider để kích hoạt Phản hồi mặc định (Auto-Reply) hay không
  let autoReplyMsg = null;
  const targetProvider = providers.find(p => p.id === toUserId || p.userId === resolvedToUserId);

  if (targetProvider && targetProvider.userId !== req.authUser.id) {
    const autoReplyConfig = targetProvider.autoReply || {
      enabled: true,
      message: DEFAULT_AUTO_REPLY_TEXT
    };

    if (autoReplyConfig.enabled) {
      const partnerIds = getAssociatedIds(targetProvider.userId || targetProvider.id);

      // Kiểm tra xem Provider đã từng phản hồi tin nhắn cho Khách này chưa
      const prevMsgs = messages.filter(m =>
        m.id !== newMsgId &&
        ((myIds.includes(m.fromUserId) && partnerIds.includes(m.toUserId)) ||
         (partnerIds.includes(m.fromUserId) && myIds.includes(m.toUserId)))
      );

      const hasRepliedBefore = prevMsgs.some(m => partnerIds.includes(m.fromUserId));

      // Nếu đây là cuộc trò chuyện mới hoặc Provider chưa từng gửi tin phản hồi nào trước đó
      if (!hasRepliedBefore) {
        const autoSenderId = targetProvider.userId || targetProvider.id;
        autoReplyMsg = {
          id: `MSG_AUTO_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          fromUserId: autoSenderId,
          toUserId: req.authUser.id,
          text: autoReplyConfig.message || DEFAULT_AUTO_REPLY_TEXT,
          time: timeStr,
          isAutoReply: true,
          // Auto-reply được đánh dấu đã đọc bởi provider (vì chính provider "gửi")
          readBy: { [autoSenderId]: new Date().toISOString() }
        };
        messages.push(autoReplyMsg);
      }
    }
  }

  db.saveCollection('messages', messages);

  res.status(201).json({
    success: true,
    message: newMsg,
    autoReply: autoReplyMsg
  });
});

// 6. Đánh dấu đã đọc tất cả tin nhắn trong cuộc trò chuyện với một đối tác
router.post('/read', requireSignedIn, (req, res) => {
  const { partnerId } = req.body;
  if (!partnerId) {
    return res.status(400).json({ success: false, message: 'Thiếu partnerId.' });
  }

  const myIds = getAssociatedIds(req.authUser.id);
  const partnerIdsList = getAssociatedIds(partnerId);
  const messages = db.getCollection('messages') || [];

  let count = 0;
  messages.forEach(m => {
    // Chỉ đánh dấu tin từ đối phương gửi đến mình
    if (partnerIdsList.includes(m.fromUserId) && myIds.includes(m.toUserId)) {
      if (!m.readBy) m.readBy = {};
      if (!m.readBy[req.authUser.id]) {
        m.readBy[req.authUser.id] = new Date().toISOString();
        count++;
      }
    }
  });

  if (count > 0) {
    db.saveCollection('messages', messages);
  }

  res.json({ success: true, marked: count });
});

module.exports = router;
