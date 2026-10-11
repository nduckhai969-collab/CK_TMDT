const db = require('../data/db');
const { httpError, findProviderByUserId } = require('./orderService');
const { createNotification } = require('./notificationService');

// Người bán trả lời đánh giá của khách (chỉ đánh giá thuộc hồ sơ của mình).
function replyToReview(reviewId, userId, content) {
  const text = String(content || '').trim();
  if (!text) throw httpError(400, 'Nội dung trả lời không được để trống.');

  const reviews = db.getCollection('reviews');
  const review = reviews.find(r => r.id === reviewId);
  if (!review) throw httpError(404, 'Đánh giá không tồn tại.');

  const provider = findProviderByUserId(userId);
  if (!provider || review.providerId !== provider.id) {
    throw httpError(403, 'Bạn không có quyền trả lời đánh giá này.');
  }

  review.reply = { content: text, createdAt: new Date().toISOString() };
  db.saveCollection('reviews', reviews);

  createNotification(review.customerId, 'Người bán đã trả lời đánh giá',
    `${provider.name || 'Chuyên gia'} đã trả lời đánh giá của bạn.`, 'info');
  return review;
}

module.exports = { replyToReview };
