const { Server } = require('socket.io');
const sessionStore = require('../data/sessionStore');

let io = null;
// Map: userId -> Set of socketId
const userSocketMap = new Map();
// Map: socketId -> userId
const socketUserMap = new Map();

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach(c => {
    const idx = c.indexOf('=');
    if (idx !== -1) {
      const key = c.slice(0, idx).trim();
      const val = c.slice(idx + 1).trim();
      try {
        cookies[key] = decodeURIComponent(val);
      } catch (_) {
        cookies[key] = val;
      }
    }
  });
  return cookies;
}

function registerUserSocket(userId, socketId) {
  if (!userId || !socketId) return;
  const sUserId = String(userId);
  if (!userSocketMap.has(sUserId)) {
    userSocketMap.set(sUserId, new Set());
  }
  userSocketMap.get(sUserId).add(socketId);
  socketUserMap.set(socketId, sUserId);
  console.log(`[Socket.io] 🟢 User ${sUserId} kết nối (Socket ID: ${socketId}). Tổng kết nối của user: ${userSocketMap.get(sUserId).size}`);
}

function unregisterUserSocket(socketId) {
  const userId = socketUserMap.get(socketId);
  if (userId && userSocketMap.has(userId)) {
    const set = userSocketMap.get(userId);
    set.delete(socketId);
    if (set.size === 0) {
      userSocketMap.delete(userId);
    }
    console.log(`[Socket.io] 🔴 Socket ${socketId} của User ${userId} ngắt kết nối.`);
  }
  socketUserMap.delete(socketId);
}

function initSocket(httpServer) {
  if (io) return io;

  io = new Server(httpServer, {
    cors: {
      origin: true,
      credentials: true,
      methods: ['GET', 'POST']
    },
    pingTimeout: 30000,
    pingInterval: 15000
  });

  io.on('connection', (socket) => {
    let resolvedUserId = null;

    // 1. Kiểm tra xác thực từ handshake auth hoặc query
    const authPayload = socket.handshake.auth || {};
    const queryPayload = socket.handshake.query || {};
    let candidateUserId = authPayload.userId || queryPayload.userId;
    let candidateSessionId = authPayload.sessionId || queryPayload.sessionId;

    // 2. Kiểm tra xác thực từ cookie session_id trong handshake headers
    if (!candidateUserId) {
      const cookies = parseCookies(socket.handshake.headers.cookie);
      if (cookies.session_id) {
        candidateSessionId = cookies.session_id;
      }
    }

    if (candidateSessionId) {
      const session = sessionStore.getSession(candidateSessionId);
      if (session && session.userId) {
        resolvedUserId = session.userId;
      }
    }

    if (!resolvedUserId && candidateUserId) {
      resolvedUserId = candidateUserId;
    }

    if (resolvedUserId) {
      registerUserSocket(resolvedUserId, socket.id);
      socket.emit('authenticated', { success: true, userId: resolvedUserId });
    }

    // 3. Cho phép client chủ động authenticate sau khi kết nối
    socket.on('authenticate', (data) => {
      let uid = data?.userId;
      if (!uid && data?.sessionId) {
        const sess = sessionStore.getSession(data.sessionId);
        if (sess && sess.userId) uid = sess.userId;
      }
      if (uid) {
        registerUserSocket(uid, socket.id);
        socket.emit('authenticated', { success: true, userId: uid });
      }
    });

    socket.on('disconnect', () => {
      unregisterUserSocket(socket.id);
    });
  });

  console.log('[Socket.io] ✅ Máy chủ Realtime Socket.io đã sẵn sàng.');
  return io;
}

function getIO() {
  return io;
}

/**
 * Phát sự kiện cập nhật số dư ví thời gian thực tới user
 * @param {string} userId - ID người nhận (Customer hoặc Provider)
 * @param {number} newBalance - Số dư ví mới nhất
 * @param {object} details - Thông tin bổ sung { change, type, message, orderId }
 */
function sendWalletUpdate(userId, newBalance, details = {}) {
  if (!io || !userId) return false;
  const sUserId = String(userId);
  const sockets = userSocketMap.get(sUserId);

  const payload = {
    userId: sUserId,
    balance: Number(newBalance) || 0,
    change: Number(details.change) || 0,
    type: details.type || 'wallet_updated',
    message: details.message || 'Số dư ví đã được cập nhật.',
    orderId: details.orderId || null,
    timestamp: new Date().toISOString()
  };

  if (sockets && sockets.size > 0) {
    for (const sid of sockets) {
      io.to(sid).emit('wallet_updated', payload);
      // Gửi kèm notification popup nếu có message
      if (payload.message) {
        io.to(sid).emit('notification', {
          title: 'Ví SkillRental',
          message: payload.message,
          type: payload.change >= 0 ? 'success' : 'info',
          data: payload
        });
      }
    }
    console.log(`[Socket.io] ⚡ Đã bắn sự kiện 'wallet_updated' tới User ${sUserId} (Số dư mới: ${payload.balance.toLocaleString('vi-VN')}đ)`);
    return true;
  } else {
    // Nếu client chưa mở socket, khi nào client load lại trang sẽ đọc số dư từ DB
    return false;
  }
}

/**
 * Bắn sự kiện bất kỳ tới user cụ thể
 */
function emitToUser(userId, eventName, data) {
  if (!io || !userId) return false;
  const sUserId = String(userId);
  const sockets = userSocketMap.get(sUserId);
  if (sockets && sockets.size > 0) {
    for (const sid of sockets) {
      io.to(sid).emit(eventName, data);
    }
    return true;
  }
  return false;
}

module.exports = {
  initSocket,
  getIO,
  sendWalletUpdate,
  emitToUser,
  userSocketMap
};
