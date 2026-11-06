const express = require('express');
const router = express.Router();
const db = require('../data/db');
const { requireProvider } = require('./customerAuth');

// Get all services with filtering & search
router.get('/', (req, res) => {
  const { category, search, minPrice, maxPrice, sort } = req.query;
  let services = db.getCollection('services');

  // Filter category
  if (category && category !== 'all') {
    services = services.filter(s => s.category.toLowerCase() === category.toLowerCase());
  }

  // Filter search keyword
  if (search) {
    const q = search.toLowerCase().trim();
    services = services.filter(s =>
      s.title.toLowerCase().includes(q) ||
      s.desc.toLowerCase().includes(q) ||
      s.providerName.toLowerCase().includes(q)
    );
  }

  // Filter price range
  if (minPrice) {
    services = services.filter(s => s.price >= Number(minPrice));
  }
  if (maxPrice) {
    services = services.filter(s => s.price <= Number(maxPrice));
  }

  // Sort
  if (sort === 'price-asc') {
    services.sort((a, b) => a.price - b.price);
  } else if (sort === 'price-desc') {
    services.sort((a, b) => b.price - a.price);
  } else if (sort === 'rating') {
    services.sort((a, b) => b.rating - a.rating);
  } else if (sort === 'sold') {
    services.sort((a, b) => (b.sold || 0) - (a.sold || 0));
  } else if (sort === 'newest') {
    services.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }

  res.json({
    success: true,
    total: services.length,
    services
  });
});

// ============================================================================
// 5. XEM CHI TIẾT SẢN PHẨM & THÔNG TIN PROVIDER (SQL JOIN MÔ HÌNH TRUYỀN THỐNG)
// ============================================================================
// Câu lệnh SQL tương đương trong cơ sở dữ liệu quan hệ:
// SELECT p.*, pr.name as provider_name, pr.address as provider_address,
//        pr.avatar as provider_logo, pr.rating as provider_rating
// FROM products p
// JOIN providers pr ON p.provider_id = pr.id
// WHERE p.id = ?;
router.get('/:id', (req, res) => {
  const { id } = req.params;
  const services = db.getCollection('services') || [];
  const s = services.find(item => item.id === id || String(item.id).toLowerCase() === String(id).toLowerCase());

  if (!s) {
    return res.status(404).json({ success: false, message: 'Sản phẩm/dịch vụ không tồn tại!' });
  }

  // Kết hợp bảng providers (JOIN ON s.providerId = pr.id)
  const providers = db.getCollection('providers') || [];
  const pr = providers.find(p => p.id === s.providerId || p.userId === s.providerId || (p.email && p.email.toLowerCase() === String(s.providerId).toLowerCase())) || {
    id: s.providerId || 'PRV001',
    name: s.providerName || 'Nhà Cung Cấp',
    avatar: s.providerAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100',
    location: 'TP. Hồ Chí Minh',
    rating: 5.0
  };

  // Cấu trúc sản phẩm chuẩn hóa kết hợp thông tin nhà cung cấp
  const productData = {
    id: s.id,
    name: s.title || s.name || 'Dịch vụ chuyên nghiệp',
    title: s.title || s.name || 'Dịch vụ chuyên nghiệp',
    price: Number(s.price) || 0,
    priceUnit: s.priceUnit || 'đ',
    duration: s.duration || '1 giờ',
    category: s.category || 'Khác',
    description: s.desc || s.description || 'Chuyên gia cung cấp dịch vụ kỹ năng chất lượng cao, hoàn thành đúng cam kết.',
    desc: s.desc || s.description || 'Chuyên gia cung cấp dịch vụ kỹ năng chất lượng cao, hoàn thành đúng cam kết.',
    image: s.thumbnail || s.image || 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=600',
    thumbnail: s.thumbnail || s.image || 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=600',
    rating: s.rating || pr.rating || 5.0,
    sold: s.sold || 0,
    status: s.status || 'active',
    // Khóa ngoại liên kết nhà cung cấp
    provider_id: pr.id,
    providerId: pr.id,
    // Thông tin nhà cung cấp (JOIN từ bảng providers)
    provider_name: pr.name,
    providerName: pr.name,
    provider_address: pr.location || pr.address || 'Việt Nam',
    address: pr.location || pr.address || 'Việt Nam',
    provider_logo: pr.avatar || '',
    providerAvatar: pr.avatar || '',
    provider_rating: pr.rating || 5.0,
    provider: {
      id: pr.id,
      name: pr.name,
      avatar: pr.avatar || '',
      logo: pr.avatar || '',
      address: pr.location || pr.address || 'Việt Nam',
      location: pr.location || pr.address || 'Việt Nam',
      rating: pr.rating || 5.0,
      specialty: pr.specialty || '',
      verified: pr.verified || false,
      hourlyRate: pr.hourlyRate || 200000
    }
  };

  return res.json({
    success: true,
    product: productData,
    service: productData,
    provider: productData.provider
  });
});

/* old router.get('/:id') */
/* old get
router.get('/:id', (req, res) => {
  const services = db.getCollection('services');
  const service = services.find(s => s.id === req.params.id);

  if (!service) {
    return res.status(404).json({ success: false, message: 'Dịch vụ không tồn tại!' });
  }

  // Also include provider details
  const providers = db.getCollection('providers');
  const provider = providers.find(p => p.id === service.providerId);

  res.json({
    success: true,
    service,
    provider: provider || null
  });
});

*/
// Create new service (Provider)
router.post('/', requireProvider, (req, res) => {
  const { title, category, price, priceUnit, duration, desc, thumbnail } = req.body;

  // Dịch vụ luôn gắn với hồ sơ người bán của tài khoản đang đăng nhập (không tin dữ liệu client gửi)
  const myProvider = db.getCollection('providers').find(p => p.userId === req.authUser.id);
  if (!myProvider) {
    return res.status(403).json({ success: false, message: 'Tài khoản chưa có hồ sơ người bán.' });
  }
  const providerId = myProvider.id;
  const providerName = myProvider.name || req.authUser.name;

  if (!title || !price || !category) {
    return res.status(400).json({ success: false, message: 'Thiếu thông tin dịch vụ bắt buộc!' });
  }

  const services = db.getCollection('services');
  const newId = `SVC${String(services.length + 1).padStart(3, '0')}`;

  const newService = {
    id: newId,
    title: title.trim(),
    category,
    providerId: providerId || 'PRV001',
    providerName: providerName || 'Nguyễn Văn An',
    providerAvatar: myProvider.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100',
    price: Number(price),
    priceUnit: priceUnit || 'Dự án',
    duration: duration || '3-5 ngày',
    rating: 5.0,
    reviewCount: 0,
    status: 'active',
    desc: desc || '',
    thumbnail: thumbnail || 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600',
    sold: 0,
    createdAt: new Date().toISOString()
  };

  services.push(newService);
  db.saveCollection('services', services);

  res.status(201).json({
    success: true,
    message: 'Tạo dịch vụ thành công!',
    service: newService
  });
});

module.exports = router;
