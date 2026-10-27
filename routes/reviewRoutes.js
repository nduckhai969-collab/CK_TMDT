const express = require('express');
const router = express.Router();
const db = require('../data/db');
const { requireCustomer, requireProvider } = require('./customerAuth');
const { generateId } = require('../utils/id');
const { replyToReview } = require('../services/reviewService');

// Public reviews
router.get('/public', (req, res) => {
  const { providerId } = req.query;
  if (!providerId) {
    return res.status(400).json({ success: false, message: 'Thiếu providerId' });
  }
  const reviews = (db.getCollection('reviews') || []).filter(r => r.providerId === providerId);
  res.json({
    success: true,
    total: reviews.length,
    reviews
  });
});

// List reviews
router.get('/', requireCustomer, (req, res) => {
  const { providerId, customerId } = req.query;
  if (customerId && customerId !== req.authUser.id) {
    return res.status(403).json({ success: false, message: 'Bạn không có quyền xem đánh giá của tài khoản khác.' });
  }
  let reviews = (db.getCollection('reviews') || []).filter(review => review.customerId === req.authUser.id);

  if (providerId) {
    reviews = reviews.filter(r => r.providerId === providerId);
  }
  res.json({
    success: true,
    total: reviews.length,
    reviews
  });
});

// Post review
router.post('/', requireCustomer, (req, res) => {
  const { orderId, providerId, providerName, serviceTitle, rating, content, criteria } = req.body;
  const reviewContent = typeof content === 'string' ? content.trim() : '';
  const numericRating = Number(rating);

  if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5 || reviewContent.length < 3 || reviewContent.length > 2000) {
    return res.status(400).json({ success: false, message: 'Chọn từ 1 đến 5 sao và nhập đánh giá từ 3 đến 2.000 ký tự.' });
  }

  const order = (db.getCollection('orders') || []).find(item => item.id === orderId && item.customerId === req.authUser.id);
  if (!order) {
    return res.status(403).json({ success: false, message: 'Chỉ khách hàng sở hữu đơn hàng mới có thể gửi đánh giá.' });
  }

  if (order.orderStatus !== 'completed') {
    return res.status(400).json({ success: false, message: 'Chỉ có thể đánh giá các đơn hàng đã hoàn thành.' });
  }

  const reviews = db.getCollection('reviews');
  const existingReview = reviews.find(r => r.orderId === orderId);
  if (existingReview) {
    return res.status(400).json({ success: false, message: 'Đơn hàng này đã được đánh giá.' });
  }

  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  const newId = generateId('REV');

  const newReview = {
    id: newId,
    orderId: order.id,
    customerId: req.authUser.id,
    customerName: req.authUser.name,
    serviceId: order.serviceId || null,
    providerId: order.providerId,
    providerName: order.providerName || providerName || 'Chuyên gia SkillRental',
    serviceTitle: order.serviceTitle || serviceTitle || 'Dịch vụ hoàn tất',
    rating: numericRating,
    content: reviewContent,
    date: dateStr,
    criteria: Array.isArray(criteria) ? criteria : ['Chuyên nghiệp', 'Đúng hẹn']
  };

  reviews.unshift(newReview);
  db.saveCollection('reviews', reviews);

  // Recalculate provider rating
  const providers = db.getCollection('providers');
  const provider = providers.find(p => p.id === newReview.providerId);
  if (provider) {
    const provReviews = reviews.filter(r => r.providerId === provider.id);
    const avg = provReviews.reduce((sum, r) => sum + r.rating, 0) / provReviews.length;
    provider.rating = Math.round(avg * 10) / 10;
    provider.reviewCount = provReviews.length;
    db.saveCollection('providers', providers);
  }
  if (newReview.serviceId) {
    const services = db.getCollection('services') || [];
    const service = services.find(item => item.id === newReview.serviceId);
    if (service) {
      const serviceReviews = reviews.filter(item => item.serviceId === service.id);
      service.rating = Math.round(serviceReviews.reduce((sum, item) => sum + item.rating, 0) / serviceReviews.length * 10) / 10;
      service.reviewCount = serviceReviews.length;
      db.saveCollection('services', services);
    }
  }

  const { notifyProvider } = require('../services/notificationService');
  notifyProvider(order.providerId, 'Khách hàng đã đánh giá dịch vụ', `Bạn nhận được đánh giá ${numericRating}/5 cho đơn ${order.id}.`, 'success');

  res.status(201).json({
    success: true,
    message: 'Cảm ơn bạn đã gửi đánh giá dịch vụ!',
    review: newReview
  });
});

// Reply to a review (provider only)
router.post('/:id/reply', requireProvider, (req, res) => {
  try {
    const review = replyToReview(req.params.id, req.authUser.id, req.body.content || req.body.reply);
    res.json({ success: true, message: 'Đã trả lời đánh giá.', review });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, message: err.message });
  }
});

module.exports = router;
