const express = require('express');
const router = express.Router();
const db = require('../data/db');
const { requireCustomer, requireProvider } = require('./customerAuth');
const { generateId } = require('../utils/id');
const { replyToReview } = require('../services/reviewService');
const { predictAspects } = require('../services/aspectInference');

const ASPECT_VN = {
  quality: 'Chất lượng',
  price: 'Giá cả',
  speed: 'Tốc độ',
  attitude: 'Thái độ',
  warranty: 'Bảo hành'
};

function analyzeReviewContent(content, rating) {
  if (!content || typeof content !== 'string' || !content.trim()) return null;
  try {
    const pred = predictAspects(content);
    const aspectMap = {};
    (pred.aspects || []).forEach(a => {
      aspectMap[a.aspect] = {
        aspect: a.aspect,
        sentiment: a.sentiment,
        confidence: Math.round((a.confidence || 0.8) * 100)
      };
    });

    const lower = content.toLowerCase();

    // Domain booster cho ngữ cảnh thực tế tiếng Việt
    // 1. Quality
    if (/(web|giao diện|sản phẩm|chất lượng|thiết kế|code|ảnh)\s*(xấu|tệ|kém|dở|hỏng|lỗi|sơ sài)/i.test(lower)) {
      aspectMap.quality = { aspect: 'quality', sentiment: 'neg', confidence: 92 };
    } else if (/(web|giao diện|sản phẩm|chất lượng|thiết kế|code|ảnh|dịch vụ)\s*(đẹp|tốt|chuẩn|xịn|chuyên nghiệp|ưng ý|xuất sắc|rất tốt)/i.test(lower)) {
      aspectMap.quality = { aspect: 'quality', sentiment: 'pos', confidence: 92 };
    }

    // 2. Price
    if (/(giá|chi phí|tiền)\s*(phải chăng|rẻ|hợp lý|ổn|mềm|vừa túi|tốt|hạt dẻ)/i.test(lower)) {
      aspectMap.price = { aspect: 'price', sentiment: 'pos', confidence: 90 };
    } else if (/(giá|chi phí|tiền)\s*(đắt|chát|cao|cắt cổ|quá đắt|phát sinh)/i.test(lower)) {
      aspectMap.price = { aspect: 'price', sentiment: 'neg', confidence: 90 };
    }

    // 3. Speed
    if (/(giao|hoàn thành|bàn giao|tiến độ|làm việc|làm|rep|phản hồi)\s*(đúng hẹn|nhanh|đúng giờ|sớm|siêu nhanh|cực nhanh)/i.test(lower)) {
      aspectMap.speed = { aspect: 'speed', sentiment: 'pos', confidence: 91 };
    } else if (/(giao|hoàn thành|bàn giao|tiến độ|làm việc|làm|rep|phản hồi)\s*(chậm|trễ|muộn|chậm trễ|lề mề|delay)/i.test(lower) || /đến muộn|trễ hẹn/i.test(lower)) {
      aspectMap.speed = { aspect: 'speed', sentiment: 'neg', confidence: 91 };
    }

    // 4. Attitude
    if (/thái độ\s*(với khách|kém|tệ|lồi lõm|cáu|khó chịu|bất lịch sự|xúc phạm|coi thường|ngang ngược)/i.test(lower)) {
      aspectMap.attitude = { aspect: 'attitude', sentiment: 'neg', confidence: 93 };
    } else if (/(thái độ|phục vụ|hỗ trợ|thợ|chuyên gia|anh|chị|bạn)\s*(tốt|nhiệt tình|lịch sự|chu đáo|thân thiện|dễ thương)/i.test(lower)) {
      aspectMap.attitude = { aspect: 'attitude', sentiment: 'pos', confidence: 93 };
    }

    // 5. Warranty
    if (/(không|chẳng|chưa|từ chối|hết|mất)\s*(chịu\s*)?bảo hành/i.test(lower) || /bảo hành\s*(kém|tệ|lừa đảo|không có)/i.test(lower)) {
      aspectMap.warranty = { aspect: 'warranty', sentiment: 'neg', confidence: 92 };
    } else if (/(bảo hành|hỗ trợ sau|sửa lỗi)\s*(chu đáo|đầy đủ|nhiệt tình|uy tín|tận tâm|dài hạn)/i.test(lower)) {
      aspectMap.warranty = { aspect: 'warranty', sentiment: 'pos', confidence: 92 };
    }

    const aspectList = Object.values(aspectMap);
    const numPos = aspectList.filter(a => a.sentiment === 'pos').length;
    const numNeg = aspectList.filter(a => a.sentiment === 'neg').length;

    // Lời khuyên phủ định mạnh (VETO)
    const hasStrongNegVeto = /(đừng|không nên|k nên|chớ|tẩy chay|tránh xa)\s*(thuê|tuyển|dùng|mua|hợp tác)/i.test(lower) ||
      /lừa đảo|thất vọng hoàn toàn|quá tệ hại|cạch mặt/i.test(lower);

    let overallSentiment = 'neutral';
    if (hasStrongNegVeto) {
      overallSentiment = 'neg';
    } else if (numPos > 0 && numNeg > 0) {
      overallSentiment = numNeg > numPos ? 'neg' : 'mixed';
    } else if (numPos > 0) {
      overallSentiment = 'pos';
    } else if (numNeg > 0) {
      overallSentiment = 'neg';
    } else if (typeof rating === 'number') {
      if (rating >= 4) overallSentiment = 'pos';
      else if (rating <= 2) overallSentiment = 'neg';
    }

    return {
      overallSentiment,
      aspects: aspectList.map(a => ({
        aspect: a.aspect,
        aspectName: ASPECT_VN[a.aspect] || a.aspect,
        sentiment: a.sentiment,
        confidence: a.confidence
      }))
    };
  } catch (err) {
    console.warn('[reviewRoutes] Lỗi suy luận AI:', err.message);
    return null;
  }
}

function enrichReviewWithAI(r) {
  if (!r) return r;
  if (r.aiAnalysis) return r;
  const analysis = analyzeReviewContent(r.content, Number(r.rating) || 5);
  return {
    ...r,
    aiAnalysis: analysis
  };
}

// Real-time AI analysis preview endpoint
router.post('/analyze', (req, res) => {
  const content = (req.body && (req.body.content || req.body.text)) || '';
  const analysis = analyzeReviewContent(content);
  res.json({
    success: true,
    analysis
  });
});

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
    reviews: reviews.map(enrichReviewWithAI)
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
    reviews: reviews.map(enrichReviewWithAI)
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

  let order = (db.getCollection('orders') || []).find(item => item.id === orderId);
  if (!order) {
    order = {
      id: orderId || 'DH001231',
      customerId: req.authUser.id,
      providerId: providerId || 'PRV001',
      providerName: providerName || 'Nguyễn Văn An',
      serviceTitle: serviceTitle || 'Dịch vụ hoàn tất',
      orderStatus: 'completed'
    };
  }

  const reviews = db.getCollection('reviews') || [];
  const existingIndex = reviews.findIndex(r => r.orderId === orderId);

  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

  if (existingIndex !== -1) {
    reviews[existingIndex].rating = numericRating;
    reviews[existingIndex].content = reviewContent;
    reviews[existingIndex].date = dateStr;
    reviews[existingIndex].criteria = Array.isArray(criteria) ? criteria : ['Chuyên nghiệp', 'Đúng hẹn'];
    reviews[existingIndex].aiAnalysis = analyzeReviewContent(reviewContent, numericRating);
    db.saveCollection('reviews', reviews);
    return res.status(200).json({
      success: true,
      message: 'Cập nhật đánh giá thành công!',
      review: reviews[existingIndex]
    });
  }

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
    criteria: Array.isArray(criteria) ? criteria : ['Chuyên nghiệp', 'Đúng hẹn'],
    aiAnalysis: analyzeReviewContent(reviewContent, numericRating)
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

router.enrichReviewWithAI = enrichReviewWithAI;
router.analyzeReviewContent = analyzeReviewContent;

module.exports = router;
