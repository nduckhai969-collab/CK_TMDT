const express = require('express');
const router = express.Router();
const db = require('../data/db');
const { requireCustomer } = require('./customerAuth');

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

  if (!rating || !content) {
    return res.status(400).json({ success: false, message: 'Vui lòng chọn số sao và nhập nội dung đánh giá!' });
  }

  const order = (db.getCollection('orders') || []).find(item => item.id === orderId && item.customerId === req.authUser.id);
  if (!order) {
    return res.status(403).json({ success: false, message: 'Chỉ khách hàng sở hữu đơn hàng mới có thể gửi đánh giá.' });
  }

  const reviews = db.getCollection('reviews');
  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  const newId = `REV${String(reviews.length + 1).padStart(3, '0')}`;

  const newReview = {
    id: newId,
    orderId: orderId || 'DH_MANUAL',
    customerId: req.authUser.id,
    customerName: req.authUser.name,
    providerId: providerId || 'PRV001',
    providerName: providerName || 'Nguyễn Văn An',
    serviceTitle: serviceTitle || 'Dịch vụ hoàn tất',
    rating: Number(rating) || 5,
    content: content.trim(),
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

  res.status(201).json({
    success: true,
    message: 'Cảm ơn bạn đã gửi đánh giá dịch vụ!',
    review: newReview
  });
});

module.exports = router;
