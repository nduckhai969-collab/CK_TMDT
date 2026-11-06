// Lõi gợi ý theo sở thích: TF-IDF + cosine similarity.
// Chỉ ĐỌC dữ liệu (services, orders) và trả về danh sách xếp hạng, không ghi gì.
const db = require('../data/db');
const { parseDateTime, daysBetween } = require('../utils/dates');

// Các tham số gom về 1 chỗ để dễ chỉnh.
const CFG = {
  TITLE_WEIGHT: 2,   // tiêu đề lặp 2 lần: ngắn nhưng chứa tín hiệu mạnh
  DECAY_DAYS: 30,    // trọng số độ mới: 1 / (1 + soNgay / DECAY_DAYS)
  MIN_SCORE: 0.01,   // ngưỡng điểm tối thiểu; hiệu chỉnh theo dữ liệu nhỏ (6 dịch vụ)
  TOP_K: 3,          // số gợi ý tối đa mỗi email
  MIN_ORDERS: 2,     // cần tối thiểu bao nhiêu đơn hoàn tất mới dựng hồ sơ
  TRIGGER_DAYS: 0    // số ngày sau đơn hoàn tất gần nhất mới kích hoạt (tạm hạ để test)
};

// Từ chức năng tiếng Việt. IDF chỉ hạ được trọng số khi corpus đủ lớn; với dữ liệu
// nhỏ (vài dịch vụ) thì stopword vẫn lọt lên đầu bảng đóng góp, nên cần loại tay.
const STOPWORDS = new Set([
  'và', 'của', 'cho', 'các', 'có', 'là', 'một', 'với', 'được', 'trong', 'khi', 'này',
  'để', 'từ', 'trên', 'theo', 'như', 'hoặc', 'bạn', 'chúng', 'tôi', 'mình', 'hay',
  'thì', 'mà', 'nên', 'rất', 'cũng', 'đã', 'sẽ', 'đang', 'bị', 'về', 'ra', 'vào',
  'lên', 'xuống', 'tại', 'bởi', 'do', 'nếu', 'vì', 'những', 'đến', 'tới', 'không',
  'cần', 'thực', 'từng', 'kèm', 'hơn', 'sau', 'trước', 'mỗi', 'nhiều', 'ít'
]);

// Bỏ dấu câu, giữ dấu tiếng Việt (bỏ dấu sẽ làm "tài" lẫn với "tai").
function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2 && !/^\d+$/.test(t) && !STOPWORDS.has(t));
}

// Document của một dịch vụ = title (nhân trọng số) + desc + category.
function serviceTokens(service) {
  const tokens = [];
  for (let i = 0; i < CFG.TITLE_WEIGHT; i++) tokens.push(...tokenize(service.title));
  tokens.push(...tokenize(service.desc));
  tokens.push(...tokenize(service.category));
  return tokens;
}

// Chuẩn hoá L2: sau bước này cosine = tích vô hướng.
function normalize(counts, idf) {
  const vec = new Map();
  let sum = 0;
  for (const [t, c] of counts) {
    const w = c * (idf.get(t) || 0);
    if (!w) continue;
    vec.set(t, w);
    sum += w * w;
  }
  const norm = Math.sqrt(sum) || 1;
  for (const [t, w] of vec) vec.set(t, w / norm);
  return vec;
}

// Dựng chỉ mục TF-IDF trên toàn bộ dịch vụ.
function buildIndex(services) {
  const docs = services.map(s => ({ id: s.id, tokens: serviceTokens(s) }));
  const n = docs.length || 1;

  const df = new Map();
  for (const d of docs) {
    for (const t of new Set(d.tokens)) df.set(t, (df.get(t) || 0) + 1);
  }

  const idf = new Map();
  for (const [t, count] of df) idf.set(t, Math.log(n / (1 + count)) + 1);

  const vectors = new Map();
  for (const d of docs) {
    const counts = new Map();
    for (const t of d.tokens) counts.set(t, (counts.get(t) || 0) + 1);
    vectors.set(d.id, normalize(counts, idf));
  }

  return { idf, vectors, servicesById: new Map(services.map(s => [s.id, s])) };
}

// Hồ sơ sở thích của khách = gộp dịch vụ đã thuê, nhân trọng số theo độ mới.
function buildProfile(index, orders) {
  const counts = new Map();
  let used = 0;
  let lastOrderAt = null;

  for (const order of orders) {
    // Mốc "đơn hoàn tất gần nhất" tính cho MỌI đơn, kể cả đơn không tra được dịch vụ.
    const at = parseDateTime(order.date);
    if (at && (!lastOrderAt || at > lastOrderAt)) lastOrderAt = at;

    const service = index.servicesById.get(order.serviceId)
      // Đơn từ yêu cầu (job) không gắn dịch vụ danh mục: dựng "dịch vụ ảo" từ tiêu đề + lĩnh vực.
      || { title: order.serviceTitle || '', category: order.category || '', desc: '' };
    if (!service.title) continue;

    const days = daysBetween(order.date);
    const weight = 1 / (1 + Math.max(days == null ? 0 : days, 0) / CFG.DECAY_DAYS);
    for (const t of serviceTokens(service)) counts.set(t, (counts.get(t) || 0) + weight);
    used += 1;
  }

  if (!used) return { vector: null, used: 0, lastOrderAt };
  return { vector: normalize(counts, index.idf), used, lastOrderAt };
}

function dot(a, b) {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let total = 0;
  for (const [t, w] of small) {
    const other = large.get(t);
    if (other) total += w * other;
  }
  return total;
}

// Lý do gợi ý: các token đóng góp nhiều nhất vào điểm số.
function topTokens(a, b, limit = 3) {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  const contrib = [];
  for (const [t, w] of small) {
    const other = large.get(t);
    if (other) contrib.push([t, w * other]);
  }
  return contrib.sort((x, y) => y[1] - x[1]).slice(0, limit).map(([t]) => t);
}

// Gợi ý cho 1 khách. Trả về { eligible, reason, items, lastOrderAt, profileOrders }.
function recommendForUser(userId, options = {}) {
  const cfg = { ...CFG, ...options };

  const services = (db.getCollection('services') || []).filter(s => s && s.status !== 'inactive');
  const orders = (db.getCollection('orders') || [])
    .filter(o => o.customerId === userId && o.orderStatus === 'completed');

  if (orders.length < cfg.MIN_ORDERS) {
    return { eligible: false, reason: `Chưa đủ ${cfg.MIN_ORDERS} đơn hoàn tất`, items: [], lastOrderAt: null, profileOrders: orders.length };
  }

  const index = buildIndex(services);
  const profile = buildProfile(index, orders);
  if (!profile.vector) {
    return { eligible: false, reason: 'Không tra được dịch vụ của các đơn để dựng hồ sơ', items: [], lastOrderAt: null, profileOrders: orders.length };
  }

  const hiredServices = new Set(orders.map(o => o.serviceId));
  const hiredProviders = new Set(orders.map(o => o.providerId));

  const scored = [];
  for (const service of services) {
    if (hiredServices.has(service.id)) continue;
    if (hiredProviders.has(service.providerId)) continue;
    const vec = index.vectors.get(service.id);
    if (!vec) continue;
    const score = dot(profile.vector, vec);
    if (score <= 0) continue;
    scored.push({ service, score, matched: topTokens(profile.vector, vec) });
  }

  scored.sort((a, b) => b.score - a.score);
  const items = scored
    .filter(x => x.score >= cfg.MIN_SCORE)
    .slice(0, cfg.TOP_K)
    .map(x => ({
      id: x.service.id,
      title: x.service.title,
      category: x.service.category,
      price: x.service.price,
      priceUnit: x.service.priceUnit,
      providerName: x.service.providerName,
      score: Number(x.score.toFixed(4)),
      matched: x.matched
    }));

  return {
    eligible: items.length > 0,
    reason: items.length ? `Khớp ${items.length} dịch vụ theo sở thích` : 'Không có dịch vụ nào đạt ngưỡng',
    items,
    lastOrderAt: profile.lastOrderAt,
    profileOrders: orders.length
  };
}

module.exports = { CFG, tokenize, buildIndex, buildProfile, recommendForUser };
