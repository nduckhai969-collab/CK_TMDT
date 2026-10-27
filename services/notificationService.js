const db = require('../data/db');
const { generateId } = require('../utils/id');
const { formatDateTime } = require('../utils/dates');

function createNotification(userId, title, message, type = 'info', detailsUrl = '') {
  if (!userId) return null;
  const notifications = db.getCollection('notifications') || [];

  const notif = {
    id: generateId('NOTIF'),
    userId,
    title,
    message,
    type, // 'info', 'success', 'warning', 'error'
    detailsUrl: typeof detailsUrl === 'string' ? detailsUrl : '',
    isRead: false,
    createdAt: formatDateTime(new Date())
  };

  notifications.unshift(notif);
  db.saveCollection('notifications', notifications);
  return notif;
}

// Thông báo được lưu theo id TÀI KHOẢN (USRxxx). Đơn hàng chỉ lưu id hồ sơ người bán (PRVxxx)
// nên phải đổi sang userId trước khi gửi.
function notifyProvider(providerId, title, message, type = 'info', detailsUrl = '') {
  const provider = (db.getCollection('providers') || []).find(p => p.id === providerId || p.userId === providerId || (p.email && p.email.toLowerCase() === String(providerId).toLowerCase()));
  let targetUserId = provider?.userId; if (!targetUserId && provider?.email) { const u = (db.getCollection('users') || []).find(x => x.email && x.email.toLowerCase() === provider.email.toLowerCase()); if (u) targetUserId = u.id; } if (!targetUserId) targetUserId = provider?.id || providerId; return createNotification(targetUserId, title, message, type, detailsUrl);

}

function getNotifications(userId) {
  const notifications = db.getCollection('notifications') || [];
  return notifications.filter(n => n.userId === userId);
}

function markAsRead(userId, notifId) {
  const notifications = db.getCollection('notifications') || [];
  const notif = notifications.find(n => n.id === notifId && n.userId === userId);
  if (notif) {
    notif.isRead = true;
    db.saveCollection('notifications', notifications);
  }
}

function markAllAsRead(userId) {
  const notifications = db.getCollection('notifications') || [];
  let updated = false;
  notifications.forEach(n => {
    if (n.userId === userId && !n.isRead) {
      n.isRead = true;
      updated = true;
    }
  });
  if (updated) {
    db.saveCollection('notifications', notifications);
  }
}

module.exports = {
  createNotification,
  notifyProvider,
  getNotifications,
  markAsRead,
  markAllAsRead
};
