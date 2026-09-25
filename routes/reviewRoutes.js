const express = require('express');
const router = express.Router();
const db = require('../data/db');

// List reviews
router.get('/', (req, res) => {
  const { providerId, customerId } = req.query;
  let reviews = db.getCollection('reviews');

  if (providerId) {
    reviews = reviews.filter(r => r.providerId === providerId);
  }
  if (customerId) {
    reviews = reviews.filter(r => r.customerId === customerId);
  }

  res.json({
    success: true,
    total: reviews.length,
    reviews
  });
});

// Post review
router.post('/', (req, res) => {
  const { orderId, providerId, providerName, customerId, customerName, serviceTitle, rating, content, criteria } = req.body;

  if (!rating || !content) {
    return res.status(400).json({ success: false, message: 'Vui lòng chọn số sao và nhập nội dung đánh giá!' });
  }

  const reviews = db.getCollection('reviews');
  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  const newId = `REV${String(reviews.length + 1).padStart(3, '0')}`;

  const newReview = {
    id: newId,
    orderId: orderId || 'DH_MANUAL',
    customerId: customerId || 'USR003',
    customerName: customerName || 'Lê Hoàng Long',
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
