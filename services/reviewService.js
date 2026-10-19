const db = require('../data/db');
const { httpError } = require('./orderService');
const { createNotification } = require('./notificationService');

function findProvider(userId) {
  const providers = db.getCollection('providers') || [];
  let p = providers.find(item => item.id === userId || item.userId === userId);
  if (!p) {
    const user = (db.getCollection('users') || []).find(u => u.id === userId || u.uid === userId);
    if (user && user.email) {
      p = providers.find(item => item.email && item.email.toLowerCase() === user.email.toLowerCase());
    }
  }
  return p || null;
}

// Người bán trả lời đánh giá của khách (chỉ đánh giá thuộc hồ sơ của mình).
function replyToReview(reviewId, userId, content) {
  const text = String(content || '').trim();
  if (!text) throw httpError(400, 'Nội dung trả lời không được để trống.');

  const reviews = db.getCollection('reviews');
  const review = reviews.find(r => r.id === reviewId);
  if (!review) throw httpError(404, 'Đánh giá không tồn tại.');

  const provider = findProvider(userId);
  if (!provider || review.providerId !== provider.id) {
    throw httpError(403, 'Bạn không có quyền trả lời đánh giá này.');
  }

  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

  review.reply = {
    content: text,
    createdAt: now.toISOString(),
    date: dateStr,
    providerId: provider.id,
    providerName: provider.name || 'Chuyên gia',
    providerAvatar: provider.avatar || ''
  };
  db.saveCollection('reviews', reviews);

  const snippet = text.length > 60 ? text.slice(0, 60) + '...' : text;
  createNotification(
    review.customerId,
    'Chuyên gia đã phản hồi đánh giá',
    `${provider.name || 'Chuyên gia'} đã phản hồi: "${snippet}"`,
    'info',
    '/customer_reviews.html'
  );
  return review;
}

// Người bán xóa phản hồi đánh giá
function deleteReviewReply(reviewId, userId) {
  const reviews = db.getCollection('reviews');
  const review = reviews.find(r => r.id === reviewId);
  if (!review) throw httpError(404, 'Đánh giá không tồn tại.');

  const provider = findProvider(userId);
  if (!provider || review.providerId !== provider.id) {
    throw httpError(403, 'Bạn không có quyền xóa phản hồi đánh giá này.');
  }

  delete review.reply;
  db.saveCollection('reviews', reviews);
  return review;
}

module.exports = { replyToReview, deleteReviewReply, findProvider };

