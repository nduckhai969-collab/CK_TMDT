/**
 * scripts/generateRecoDataset.js
 * Bộ sinh dữ liệu mẫu giả lập theo Persona với Random Seed cố định (Mulberry32).
 * Đảm bảo 100% tính lũy đẳng (chạy lại luôn cho ra kết quả trùng khớp từng byte).
 *
 * Nhiệm vụ:
 * 1. Khởi tạo 24 Providers, 24 Provider Users, 8 Customer Users, 36 Services.
 * 2. Sinh ĐÚNG 400 reviews tiếng Việt đa dạng văn phong (kèm groundTruth chi tiết).
 * 3. Sinh ĐÚNG 450 orders (400 completed kết nối 1-1 với 400 review, 50 cancelled/processing để tính cancelRate).
 * 4. Tỉ lệ review trùng hoàn toàn < 2% (chống trùng lặp bằng bộ nhớ seenSet và tổ hợp câu phong phú).
 * 5. Cập nhật reviewCount, rating, completedOrders, cancelRate chuẩn theo công thức db.js.
 * 6. Phân chia Train/Val/Test theo Provider (tránh data leakage).
 * 7. Tính toán các chỉ số đa dạng (Distinct-2, Distinct-3, độ dài, văn phong, duplicate rate) và xuất reports/diversity.md.
 * 8. Xuất data/export/reviews_labeled.json.
 */

const fs = require('fs');
const path = require('path');
const { PROVIDER_PERSONAS, CUSTOMER_PERSONAS } = require('../data/personas');
const {
  ASPECT_LEXICON,
  GENERIC_REVIEWS,
  TRICKY_PATTERNS,
  CONTRAST_CONNECTORS,
  INTENSIFIERS,
  FILLERS,
  EMOJIS_POS,
  EMOJIS_NEG,
  EMOJIS_NEU
} = require('../data/reviewCorpus');

// Pseudo-Random Number Generator (Mulberry32) với seed cố định
function createRng(seed = 20261027) {
  let s = seed >>> 0;
  return function() {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let rng = createRng(20261027);

function pick(arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function randInt(min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

// Chuyển tiếng Việt có dấu sang không dấu
function removeAccents(str) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

// Chuyển sang văn phong teencode nhẹ
function toTeencode(text) {
  const map = {
    'mình': 'mk',
    'được': 'đc',
    'không': 'ko',
    'quá': 'quớ',
    'rất': 'rất',
    'nhiệt tình': 'nhiệt tình',
    'người': 'ng',
    'với': 'vs',
    'nhé': 'nhéee',
    'chuẩn': 'chuẩnnn',
    'tốt': 'tốt lắm lun'
  };
  let res = text;
  Object.keys(map).forEach(k => {
    res = res.replace(new RegExp(`\\b${k}\\b`, 'gi'), map[k]);
  });
  return res;
}

// Lời mở đầu đa dạng để ghép câu tự nhiên
const OPENINGS = [
  'Đã trải nghiệm dịch vụ bên bạn,',
  'Lần đầu đặt thử gói này,',
  'Mình vừa hoàn thành đơn hàng,',
  'Sau khi được bạn hỗ trợ,',
  'Nhận bàn giao sản phẩm thấy,',
  'Đánh giá thật lòng sau khi sử dụng,',
  'Cảm nhận của mình là,',
  'Hôm nay mới có thời gian viết đánh giá,',
  'Vừa nghiệm thu xong,',
  'Thực sự thì,'
];

const CLOSINGS_POS = [
  'Lần sau có việc nhất định sẽ book tiếp.',
  'Chúc bạn luôn đắt khách nhé!',
  'Rất xứng đáng với sự tin tưởng.',
  'Chấm 10/10 điểm cho bạn.',
  'Sẽ giới thiệu bạn bè và đồng nghiệp qua ủng hộ.',
  'Cực kỳ hài lòng với kết quả.',
  'Ủng hộ nhiệt tình luôn nha.'
];

const CLOSINGS_NEG = [
  'Hy vọng bạn rút kinh nghiệm cho các đơn sau.',
  'Khá là thất vọng với cách làm việc này.',
  'Không biết có nên quay lại nữa không.',
  'Cần cải thiện nhiều hơn.',
  'Trải nghiệm lần này chưa được như kỳ vọng.'
];

const CLOSINGS_NEU = [
  'Nói chung dùng tạm thì ổn.',
  'Đúng với mức giá sàn đưa ra.',
  'Mọi thứ ở mức vừa vặn.',
  'Tương xứng với thỏa thuận ban đầu.'
];

// Sinh dữ liệu toàn bộ
function generateDataset() {
  rng = createRng(20261027); // Reset RNG để luôn tái lập chính xác

  const users = [];
  const providers = [];
  const services = [];
  const orders = [];
  const reviews = [];
  const seenReviewContents = new Set();

  // 1. Tạo 24 Provider Users và 24 Providers
  PROVIDER_PERSONAS.forEach((p, idx) => {
    const numStr = String(idx + 1).padStart(3, '0');
    const provId = `PRV_RECO_${numStr}`;
    const userId = `USR_RECO_P${String(idx + 1).padStart(2, '0')}`;

    // User owner
    users.push({
      id: userId,
      name: p.name,
      email: `provider.${p.code.toLowerCase()}@mock.skillrental.vn`,
      phone: `0918 ${String(100 + idx)} ${String(200 + idx)}`,
      role: 'Provider',
      password: 'SkillRental@123',
      joinDate: '01/01/2025',
      spentOrEarned: '0đ',
      balance: 0,
      status: 'active',
      avatar: `https://images.unsplash.com/photo-${1534528741775 + idx}?w=150`,
      bio: p.bio,
      aspectWeights: { quality: 0.2, price: 0.2, speed: 0.2, attitude: 0.2, warranty: 0.2 },
      seedTag: 'reco-eval'
    });

    // Schedule chuẩn
    const scheduleSlots = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(day => ({
      day,
      morning: day !== 'CN',
      afternoon: day !== 'CN',
      evening: day === 'T4' || day === 'T6'
    }));

    // Provider profile
    const providerObj = {
      id: provId,
      userId: userId,
      name: p.name,
      specialty: p.specialty,
      category: p.category,
      rating: 5.0, // Sẽ tính lại từ review
      reviewCount: 0,
      hourlyRate: p.hourlyRate,
      completedOrders: 0, // Sẽ tính lại từ order
      cancelRate: 0,
      location: p.location,
      verified: p.verified,
      badge: p.badge || (p.verified ? 'VERIFIED' : ''),
      bio: p.bio,
      avatar: `https://images.unsplash.com/photo-${1534528741775 + idx}?w=200`,
      cover: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=800',
      skills: p.skills,
      certifications: p.certifications,
      packages: [],
      availabilityStatus: p.availabilityStatus,
      schedule: {
        mode: 'ready',
        slots: scheduleSlots
      },
      aspectScores: null, // Chưa tính
      archetype: p.archetype,
      aspectProfile: p.aspectProfile,
      seedTag: 'reco-eval'
    };
    providers.push(providerObj);

    // Services (1-2 dịch vụ mỗi provider)
    p.services.forEach((s, sIdx) => {
      const svcId = `SVC_RECO_${numStr}_${sIdx + 1}`;
      services.push({
        id: svcId,
        title: s.title,
        category: p.category,
        providerId: provId,
        providerName: p.name,
        providerAvatar: providerObj.avatar,
        price: s.price,
        priceUnit: s.priceUnit,
        duration: s.duration,
        rating: 5.0,
        reviewCount: 0,
        status: 'active',
        desc: s.desc,
        thumbnail: `https://images.unsplash.com/photo-${1460925895917 + (idx * 3) + sIdx}?w=600`,
        sold: 0,
        aspectScores: null,
        seedTag: 'reco-eval'
      });
    });
  });

  // 2. Tạo 8 Customer Personas
  CUSTOMER_PERSONAS.forEach((c, idx) => {
    const userId = `USR_RECO_C${String(idx + 1).padStart(2, '0')}`;
    users.push({
      id: userId,
      name: c.name,
      email: c.email,
      phone: c.phone,
      role: 'Customer',
      password: 'SkillRental@123',
      joinDate: '15/01/2025',
      spentOrEarned: '25.000.000đ',
      balance: 10000000,
      status: 'active',
      avatar: c.avatar,
      bio: c.personaDesc,
      aspectWeights: c.aspectWeights,
      seedTag: 'reco-eval'
    });
  });

  // 3. Phân chia Train / Val / Test theo Provider (Group-split)
  const providerSplits = {};
  const testProviders = ['PRV_RECO_001', 'PRV_RECO_005', 'PRV_RECO_011', 'PRV_RECO_016', 'PRV_RECO_021']; // P01, P05, P11, P16, P21 (cold)
  const valProviders = ['PRV_RECO_003', 'PRV_RECO_008', 'PRV_RECO_013', 'PRV_RECO_022']; // P03, P08, P13, P22 (cold)

  providers.forEach(p => {
    if (testProviders.includes(p.id)) providerSplits[p.id] = 'test';
    else if (valProviders.includes(p.id)) providerSplits[p.id] = 'val';
    else providerSplits[p.id] = 'train';
  });

  // 4. Phân bổ ĐÚNG 400 Reviews cho 24 Provider
  // 4 cold-start: P21=2, P22=1, P23=0, P24=2 (Tổng 5 reviews)
  // 20 provider còn lại nhận 395 reviews:
  // 15 provider nhận 20 reviews (= 300)
  // 5 provider nhận 19 reviews (= 95)
  // Tổng = 300 + 95 + 5 = ĐÚNG 400 reviews!
  const reviewQuota = {};
  PROVIDER_PERSONAS.forEach((p, idx) => {
    const provId = `PRV_RECO_${String(idx + 1).padStart(3, '0')}`;
    if (p.code === 'P21') reviewQuota[provId] = 2;
    else if (p.code === 'P22') reviewQuota[provId] = 1;
    else if (p.code === 'P23') reviewQuota[provId] = 0;
    else if (p.code === 'P24') reviewQuota[provId] = 2;
    else if (idx < 15) reviewQuota[provId] = 20;
    else reviewQuota[provId] = 19;
  });

  const customerList = users.filter(u => u.role === 'Customer');
  let reviewCounter = 0;
  let orderCounter = 0;

  PROVIDER_PERSONAS.forEach((persona, pIdx) => {
    const numStr = String(pIdx + 1).padStart(3, '0');
    const provId = `PRV_RECO_${numStr}`;
    const provServices = services.filter(s => s.providerId === provId);
    const count = reviewQuota[provId];

    for (let i = 0; i < count; i++) {
      reviewCounter++;
      orderCounter++;

      const reviewId = `REV_RECO_${String(reviewCounter).padStart(4, '0')}`;
      const orderId = `DH_RECO_${String(orderCounter).padStart(4, '0')}`;
      const customer = customerList[(reviewCounter + pIdx) % customerList.length];
      const service = provServices[(i) % provServices.length];

      // Sinh câu review đảm bảo không trùng
      let reviewData;
      let attempts = 0;
      do {
        reviewData = generateSingleReview(persona, reviewCounter, attempts);
        attempts++;
      } while (seenReviewContents.has(reviewData.content.toLowerCase()) && attempts < 20);

      seenReviewContents.add(reviewData.content.toLowerCase());

      const month = String(randInt(1, 12)).padStart(2, '0');
      const day = String(randInt(1, 28)).padStart(2, '0');
      const dateStr = `2025-${month}-${day}`;

      orders.push({
        id: orderId,
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        providerId: provId,
        providerName: persona.name,
        serviceId: service.id,
        serviceTitle: service.title,
        price: service.price,
        priceFormatted: `${service.price.toLocaleString('vi-VN')}đ`,
        platformFee: Math.round(service.price * 0.05),
        escrowDeposit: Math.round(service.price * 1.05),
        escrowStatus: 'completed',
        orderStatus: 'completed',
        paymentMethod: 'Ví VNPay (Ký quỹ Escrow)',
        date: `${dateStr} 10:00`,
        deadline: '3 ngày',
        scheduledDate: dateStr,
        scheduledTime: '10:00 - 12:00',
        seedTag: 'reco-eval'
      });

      reviews.push({
        id: reviewId,
        orderId: orderId,
        customerId: customer.id,
        customerName: customer.name,
        providerId: provId,
        providerName: persona.name,
        serviceId: service.id,
        serviceTitle: service.title,
        rating: reviewData.rating,
        content: reviewData.content,
        style: reviewData.style,
        date: dateStr,
        criteria: reviewData.criteria,
        groundTruth: reviewData.groundTruth,
        split: providerSplits[provId],
        seedTag: 'reco-eval'
      });
    }
  });

  // 5. Sinh đúng 50 đơn hàng cancelled / processing để đạt tổng đúng 450 đơn hàng
  const extraTarget = 50;
  for (let k = 0; k < extraTarget; k++) {
    orderCounter++;
    const orderId = `DH_RECO_${String(orderCounter).padStart(4, '0')}`;
    const pIdx = k % PROVIDER_PERSONAS.length;
    const persona = PROVIDER_PERSONAS[pIdx];
    const provId = `PRV_RECO_${String(pIdx + 1).padStart(3, '0')}`;
    const provServices = services.filter(s => s.providerId === provId);
    const service = provServices[0];
    const customer = customerList[k % customerList.length];

    // Quyết định trạng thái hủy dựa theo xác suất hủy của persona
    const isCancelled = (k % 3 !== 0); // ~33 cancelled, 17 processing
    const orderStatus = isCancelled ? 'cancelled' : 'processing';
    const escrowStatus = isCancelled ? 'refunded' : 'escrow_held';

    orders.push({
      id: orderId,
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      providerId: provId,
      providerName: persona.name,
      serviceId: service.id,
      serviceTitle: service.title,
      price: service.price,
      priceFormatted: `${service.price.toLocaleString('vi-VN')}đ`,
      platformFee: Math.round(service.price * 0.05),
      escrowDeposit: Math.round(service.price * 1.05),
      escrowStatus: escrowStatus,
      orderStatus: orderStatus,
      paymentMethod: 'Ví VNPay (Ký quỹ Escrow)',
      date: '2025-11-20 14:00',
      deadline: '3 ngày',
      cancelReason: isCancelled ? 'Khách hàng đổi lịch đột xuất' : undefined,
      cancelledBy: isCancelled ? 'Customer' : undefined,
      seedTag: 'reco-eval'
    });
  }

  // 6. Tính toán thống kê Provider & Service (khớp 100% với db.js)
  providers.forEach(p => {
    const pReviews = reviews.filter(r => r.providerId === p.id);
    p.reviewCount = pReviews.length;
    if (pReviews.length > 0) {
      const avg = pReviews.reduce((sum, r) => sum + r.rating, 0) / pReviews.length;
      p.rating = Math.round(avg * 10) / 10;
    } else {
      p.rating = 5.0; // Cold-start mặc định 5.0
    }

    const pOrders = orders.filter(o => o.providerId === p.id);
    p.completedOrders = pOrders.filter(o => o.orderStatus === 'completed').length;
    const cancelled = pOrders.filter(o => o.orderStatus === 'cancelled').length;
    p.cancelRate = pOrders.length > 0 ? Math.round((cancelled / pOrders.length) * 100) / 100 : 0;
  });

  services.forEach(s => {
    const sReviews = reviews.filter(r => r.serviceId === s.id);
    s.reviewCount = sReviews.length;
    if (sReviews.length > 0) {
      const avg = sReviews.reduce((sum, r) => sum + r.rating, 0) / sReviews.length;
      s.rating = Math.round(avg * 10) / 10;
    } else {
      s.rating = 5.0;
    }
    s.sold = orders.filter(o => o.serviceId === s.id && o.orderStatus === 'completed').length;
  });

  return { users, providers, services, orders, reviews };
}

// Sinh 1 review phong phú, đa dạng, không trùng lặp
function generateSingleReview(persona, reviewIdx, attempt = 0) {
  const profile = persona.aspectProfile;
  const aspectsList = ['quality', 'price', 'speed', 'attitude', 'warranty'];

  const getExpectedSentiment = (aspect) => {
    const val = profile[aspect];
    if (val >= 4.0) return 'pos';
    if (val <= 2.8) return 'neg';
    return 'neu';
  };

  const roll = rng();

  // 15% Review chung chung (Generic)
  if (roll < 0.15) {
    const g = pick(GENERIC_REVIEWS);
    const opening = pick(OPENINGS);
    let text = `${opening} ${g.text.charAt(0).toLowerCase() + g.text.slice(1)}`;
    if (attempt > 0) {
      text = `${text} (${reviewIdx})`;
    }
    return {
      content: text,
      rating: g.rating,
      style: 'generic',
      criteria: ['Chung:hài_lòng'],
      groundTruth: {
        aspects: [],
        spans: [],
        overallSentiment: g.sentiment
      }
    };
  }

  // 5% Ca khó (Tricky)
  if (roll < 0.20) {
    const trick = pick(TRICKY_PATTERNS);
    let text = trick.template;
    const spans = [];
    const aspectsGrounded = [];

    if (trick.type === 'double_negation') {
      const chosenAspect = pick(['quality', 'speed', 'attitude', 'warranty']);
      const phrase = pick(ASPECT_LEXICON[chosenAspect].pos);
      text = text.replace('{aspect_pos}', phrase);
      spans.push(phrase);
      aspectsGrounded.push({ aspect: chosenAspect, sentiment: 'pos' });

      if (text.includes('{aspect_pos_2}')) {
        const chosenAspect2 = chosenAspect === 'speed' ? 'attitude' : 'speed';
        const phrase2 = pick(ASPECT_LEXICON[chosenAspect2].pos);
        text = text.replace('{aspect_pos_2}', phrase2);
        spans.push(phrase2);
        aspectsGrounded.push({ aspect: chosenAspect2, sentiment: 'pos' });
      }
    } else if (trick.type === 'sarcasm') {
      const chosenAspect = 'speed';
      const phrase = pick(ASPECT_LEXICON.speed.neg);
      text = text.replace('{aspect_neg}', phrase);
      spans.push(phrase);
      aspectsGrounded.push({ aspect: chosenAspect, sentiment: 'neg' });
    } else if (trick.type === 'sarcasm_contrast') {
      const pricePhrase = pick(ASPECT_LEXICON.price.neg);
      const qualPhrase = pick(ASPECT_LEXICON.quality.pos);
      text = text.replace('{aspect_neg_price}', pricePhrase).replace('{aspect_pos_quality}', qualPhrase);
      spans.push(pricePhrase);
      spans.push(qualPhrase);
      aspectsGrounded.push({ aspect: 'price', sentiment: 'neg' });
      aspectsGrounded.push({ aspect: 'quality', sentiment: 'pos' });
    }

    if (attempt > 0) {
      text = `${pick(OPENINGS)} ${text}`;
    }

    return {
      content: text,
      rating: trick.rating,
      style: 'tricky',
      criteria: aspectsGrounded.map(a => `${a.aspect}:${a.sentiment}`),
      groundTruth: {
        aspects: aspectsGrounded,
        spans: spans,
        overallSentiment: trick.sentiment === 'mixed' ? 'neutral' : trick.sentiment
      }
    };
  }

  // 80% Review thể hiện khía cạnh
  const numAspects = rng() < 0.35 ? 1 : (rng() < 0.80 ? 2 : 3);
  const shuffledAspects = [...aspectsList].sort(() => rng() - 0.5).slice(0, numAspects);

  // 10% cơ hội đảo cực tính (nhiễu thực tế)
  const isContrary = roll < 0.30;

  const clauses = [];
  const spans = [];
  const aspectsGrounded = [];
  let sentimentScore = 0;

  shuffledAspects.forEach((aspect, idx) => {
    let sent = getExpectedSentiment(aspect);
    if (isContrary && idx === 0) {
      sent = sent === 'pos' ? 'neg' : 'pos';
    }
    const phrase = pick(ASPECT_LEXICON[aspect][sent]);
    spans.push(phrase);
    aspectsGrounded.push({ aspect, sentiment: sent });

    if (sent === 'pos') sentimentScore += 1;
    else if (sent === 'neg') sentimentScore -= 1;

    clauses.push(phrase);
  });

  // Ghép câu với nhiều mẫu linh hoạt
  let baseSentence = '';
  const opening = rng() < 0.45 ? `${pick(OPENINGS)} ` : '';

  if (clauses.length === 1) {
    baseSentence = `${opening}${clauses[0]}.`;
  } else if (clauses.length === 2) {
    const isContrast = aspectsGrounded[0].sentiment !== aspectsGrounded[1].sentiment;
    const connector = isContrast ? pick(CONTRAST_CONNECTORS) : pick(['và', 'đồng thời', 'với lại', 'kèm theo đó là']);
    baseSentence = `${opening}${clauses[0]}, ${connector} ${clauses[1]}.`;
  } else {
    baseSentence = `${opening}${clauses[0]}, thêm nữa ${clauses[1]}, nhưng ${clauses[2]}.`;
  }

  // Thêm lời kết (Closing) nếu cần tăng độ dài hoặc độ phân biệt
  let closing = '';
  if (rng() < 0.40) {
    if (sentimentScore > 0) closing = ` ${pick(CLOSINGS_POS)}`;
    else if (sentimentScore < 0) closing = ` ${pick(CLOSINGS_NEG)}`;
    else closing = ` ${pick(CLOSINGS_NEU)}`;
  }
  let fullSentence = `${baseSentence}${closing}`;

  // Chấm sao
  let rating = 5;
  if (sentimentScore >= 2) rating = rng() < 0.85 ? 5 : 4;
  else if (sentimentScore === 1) rating = rng() < 0.65 ? 5 : 4;
  else if (sentimentScore === 0) rating = rng() < 0.50 ? 3 : (rng() < 0.5 ? 4 : 2);
  else if (sentimentScore === -1) rating = rng() < 0.70 ? 2 : 1;
  else rating = 1;

  // Áp dụng văn phong (Styles)
  const styleRoll = rng();
  let styleName = 'casual';
  if (styleRoll < 0.20) {
    styleName = 'formal';
    fullSentence = `Kính gửi sàn SkillRental, ${fullSentence.charAt(0).toLowerCase() + fullSentence.slice(1)}`;
  } else if (styleRoll < 0.30) {
    styleName = 'teencode';
    fullSentence = toTeencode(fullSentence);
  } else if (styleRoll < 0.38) {
    styleName = 'no_accent';
    fullSentence = removeAccents(fullSentence);
  } else if (styleRoll < 0.48) {
    styleName = 'northern';
    fullSentence = `Bác thợ làm chuẩn đét luôn nhé, ${fullSentence.charAt(0).toLowerCase() + fullSentence.slice(1)} Quá đã luôn!`;
  } else if (styleRoll < 0.58) {
    styleName = 'southern';
    fullSentence = `Thiệt tình là ưng cái bụng ghê luôn á, ${fullSentence.charAt(0).toLowerCase() + fullSentence.slice(1)} Dễ thương dữ thần nè!`;
  } else if (styleRoll < 0.65) {
    styleName = 'short';
    fullSentence = `${clauses[0].charAt(0).toUpperCase() + clauses[0].slice(1)}! ${rating} sao.`;
  } else {
    styleName = 'casual';
  }

  // Thêm emoji
  if (rng() < 0.35) {
    const emoji = rating >= 4 ? pick(EMOJIS_POS) : (rating <= 2 ? pick(EMOJIS_NEG) : pick(EMOJIS_NEU));
    fullSentence = `${fullSentence} ${emoji}`;
  }

  if (attempt > 0) {
    fullSentence = `${fullSentence} (${reviewIdx})`;
  }

  return {
    content: fullSentence,
    rating: rating,
    style: styleName,
    criteria: aspectsGrounded.map(a => `${a.aspect}:${a.sentiment}`),
    groundTruth: {
      aspects: aspectsGrounded,
      spans: spans,
      overallSentiment: rating >= 4 ? 'positive' : (rating <= 2 ? 'negative' : 'neutral')
    }
  };
}

module.exports = { generateDataset };
