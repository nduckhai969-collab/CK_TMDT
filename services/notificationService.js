const db = require('../data/db');
const { generateId } = require('../utils/id');
const { formatDateTime } = require('../utils/dates');

function buildNotification(userId, title, message, type = 'info', detailsUrl = '') {
  if (!userId) return null;
  return {
    id: generateId('NOTIF'),
    userId,
    title,
    message,
    type, // 'info', 'success', 'warning', 'error'
    detailsUrl: typeof detailsUrl === 'string' ? detailsUrl : '',
    isRead: false,
    createdAt: formatDateTime(new Date())
  };
}

function resolveProviderUserId(providerId) {
  const provider = (db.getCollection('providers') || []).find(p => p.id === providerId || p.userId === providerId || (p.email && p.email.toLowerCase() === String(providerId).toLowerCase()));
  let targetUserId = provider?.userId;
  if (!targetUserId && provider?.email) {
    const user = (db.getCollection('users') || []).find(x => x.email && x.email.toLowerCase() === provider.email.toLowerCase());
    if (user) targetUserId = user.id;
  }
  return targetUserId || provider?.id || providerId;
}

function notificationRecords(records = []) {
  return records.map(record => record.userId
    ? buildNotification(record.userId, record.title, record.message, record.type, record.detailsUrl)
    : buildNotification(resolveProviderUserId(record.providerId), record.title, record.message, record.type, record.detailsUrl))
    .filter(Boolean);
}

// Use this for APIs that must not report success until all notifications have
// been committed. The caller may include the returned records in the same
// saveCollectionsAndWait transaction as its business data.
function createNotification(userId, title, message, type = 'info', detailsUrl = '') {
  const notif = buildNotification(userId, title, message, type, detailsUrl);
  if (!notif) return null;
  const notifications = db.getCollection('notifications') || [];

  notifications.unshift(notif);
  db.saveCollection('notifications', notifications);
  return notif;
}

// Thông báo được lưu theo id TÀI KHOẢN (USRxxx). Đơn hàng chỉ lưu id hồ sơ người bán (PRVxxx)
// nên phải đổi sang userId trước khi gửi.
function notifyProvider(providerId, title, message, type = 'info', detailsUrl = '') {
  return createNotification(resolveProviderUserId(providerId), title, message, type, detailsUrl);
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
  buildNotification,
  notificationRecords,
  createNotification,
  notifyProvider,
  getNotifications,
  markAsRead,
  markAllAsRead
};
