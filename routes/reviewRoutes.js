const express = require('express');
const router = express.Router();
const db = require('../data/db');
const { requireCustomer, requireProvider } = require('./customerAuth');
const { generateId } = require('../utils/id');
const { replyToReview, deleteReviewReply, findProvider } = require('../services/reviewService');

function recalculateRatings(providerId, serviceId) {
  const reviews = (db.getCollection('reviews') || []).filter(r => r.status !== 'hidden');
  if (providerId) {
    const providers = db.getCollection('providers') || [];
    const provider = providers.find(p => p.id === providerId);
    if (provider) {
      const provReviews = reviews.filter(r => r.providerId === providerId);
      if (provReviews.length > 0) {
        const avg = provReviews.reduce((sum, r) => sum + Number(r.rating || 0), 0) / provReviews.length;
        provider.rating = Math.round(avg * 10) / 10;
        provider.reviewCount = provReviews.length;
      } else {
        provider.rating = 5.0;
        provider.reviewCount = 0;
      }
      db.saveCollection('providers', providers);
    }
  }
  if (serviceId) {
    const services = db.getCollection('services') || [];
    const service = services.find(item => item.id === serviceId);
    if (service) {
      const serviceReviews = reviews.filter(item => item.serviceId === serviceId);
      if (serviceReviews.length > 0) {
        service.rating = Math.round(serviceReviews.reduce((sum, item) => sum + Number(item.rating || 0), 0) / serviceReviews.length * 10) / 10;
        service.reviewCount = serviceReviews.length;
      } else {
        service.rating = 5.0;
        service.reviewCount = 0;
      }
      db.saveCollection('services', services);
    }
  }
}

// Public reviews for a provider or service with breakdown statistics
router.get('/public', (req, res) => {
  const { providerId, serviceId } = req.query;
  if (!providerId && !serviceId) {
    return res.status(400).json({ success: false, message: 'Cần cung cấp providerId hoặc serviceId.' });
  }

  let reviews = (db.getCollection('reviews') || []).filter(r => r.status !== 'hidden');
  if (providerId) reviews = reviews.filter(r => r.providerId === providerId);
  if (serviceId) reviews = reviews.filter(r => r.serviceId === serviceId);

  const breakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  let totalRatingSum = 0;

  reviews.forEach(r => {
    const star = Math.min(5, Math.max(1, Math.round(Number(r.rating) || 5)));
    breakdown[star] = (breakdown[star] || 0) + 1;
    totalRatingSum += Number(r.rating || 0);
  });

  const avg = reviews.length ? Math.round((totalRatingSum / reviews.length) * 10) / 10 : 5.0;

  res.json({
    success: true,
    total: reviews.length,
    stats: {
      averageRating: avg,
      reviewCount: reviews.length,
      breakdown
    },
    reviews
  });
});

// List reviews for the current authenticated user (Customer or Provider)
router.get('/', (req, res, next) => {
  // Support both customer and provider callers
  const user = req.authUser;
  if (!user) {
    return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập để xem danh sách đánh giá.' });
  }

  const { providerId, customerId } = req.query;
  const allReviews = db.getCollection('reviews') || [];
  let reviews = [];

  if (user.role === 'Customer') {
    if (customerId && customerId !== user.id) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền xem đánh giá của tài khoản khác.' });
    }
    reviews = allReviews.filter(r => r.customerId === user.id);
    if (providerId) {
      reviews = reviews.filter(r => r.providerId === providerId);
    }
  } else if (user.role === 'Provider') {
    const prov = findProvider(user.id);
    const targetPrvId = prov ? prov.id : (providerId || user.id);
    reviews = allReviews.filter(r => r.providerId === targetPrvId);
  } else if (user.role === 'Admin') {
    reviews = allReviews;
    if (providerId) reviews = reviews.filter(r => r.providerId === providerId);
    if (customerId) reviews = reviews.filter(r => r.customerId === customerId);
  }

  res.json({
    success: true,
    total: reviews.length,
    reviews
  });
});

// Post review (customer only)
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
    customerAvatar: req.authUser.avatar || '',
    serviceId: order.serviceId || null,
    providerId: order.providerId,
    providerName: order.providerName || providerName || 'Chuyên gia SkillRental',
    serviceTitle: order.serviceTitle || serviceTitle || 'Dịch vụ hoàn tất',
    rating: numericRating,
    content: reviewContent,
    date: dateStr,
    status: 'published',
    criteria: Array.isArray(criteria) && criteria.length ? criteria : ['Chuyên nghiệp', 'Đúng hẹn']
  };

  reviews.unshift(newReview);
  db.saveCollection('reviews', reviews);

  // Recalculate provider & service rating
  recalculateRatings(newReview.providerId, newReview.serviceId);

  const { notifyProvider } = require('../services/notificationService');
  notifyProvider(order.providerId, 'Khách hàng đã đánh giá dịch vụ', `Bạn nhận được đánh giá ${numericRating}/5 sao cho đơn ${order.id}.`, 'success', '/review.html');

  res.status(201).json({
    success: true,
    message: 'Cảm ơn bạn đã gửi đánh giá dịch vụ!',
    review: newReview
  });
});

// Update review (customer can edit their review)
router.put('/:id', requireCustomer, (req, res) => {
  const { rating, content, criteria } = req.body;
  const reviews = db.getCollection('reviews');
  const review = reviews.find(r => r.id === req.params.id);

  if (!review) {
    return res.status(404).json({ success: false, message: 'Đánh giá không tồn tại.' });
  }

  if (review.customerId !== req.authUser.id) {
    return res.status(403).json({ success: false, message: 'Bạn không có quyền chỉnh sửa đánh giá này.' });
  }

  if (rating !== undefined) {
    const num = Number(rating);
    if (!Number.isInteger(num) || num < 1 || num > 5) {
      return res.status(400).json({ success: false, message: 'Số sao phải từ 1 đến 5.' });
    }
    review.rating = num;
  }

  if (content !== undefined) {
    const text = String(content).trim();
    if (text.length < 3) {
      return res.status(400).json({ success: false, message: 'Nội dung đánh giá tối thiểu 3 ký tự.' });
    }
    review.content = text;
  }

  if (Array.isArray(criteria)) {
    review.criteria = criteria;
  }

  review.updatedAt = new Date().toISOString();
  db.saveCollection('reviews', reviews);

  recalculateRatings(review.providerId, review.serviceId);

  res.json({
    success: true,
    message: 'Cập nhật đánh giá thành công!',
    review
  });
});

// Delete review (customer can remove their review or Admin can delete)
router.delete('/:id', (req, res) => {
  const user = req.authUser;
  if (!user) {
    return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập.' });
  }

  const reviews = db.getCollection('reviews');
  const index = reviews.findIndex(r => r.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Đánh giá không tồn tại.' });
  }

  const target = reviews[index];
  if (user.role !== 'Admin' && target.customerId !== user.id) {
    return res.status(403).json({ success: false, message: 'Bạn không có quyền xóa đánh giá này.' });
  }

  reviews.splice(index, 1);
  db.saveCollection('reviews', reviews);

  recalculateRatings(target.providerId, target.serviceId);

  res.json({
    success: true,
    message: 'Đã xóa đánh giá thành công.'
  });
});

// Reply to a review (provider only)
router.post('/:id/reply', requireProvider, (req, res) => {
  try {
    const review = replyToReview(req.params.id, req.authUser.id, req.body.content || req.body.reply);
    res.json({ success: true, message: 'Đã gửi phản hồi đánh giá thành công.', review });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, message: err.message });
  }
});

// Delete reply to a review (provider only)
router.delete('/:id/reply', requireProvider, (req, res) => {
  try {
    const review = deleteReviewReply(req.params.id, req.authUser.id);
    res.json({ success: true, message: 'Đã gỡ phản hồi đánh giá.', review });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, message: err.message });
  }
});

module.exports = router;

