const express = require('express');
const router = express.Router();
const db = require('../data/db');

// List providers with search & filter
router.get('/', (req, res) => {
  const { category, search, minRating } = req.query;
  let providers = db.getCollection('providers');

  if (category && category !== 'all') {
    providers = providers.filter(p => p.category.toLowerCase() === category.toLowerCase());
  }

  if (search) {
    const q = search.toLowerCase().trim();
    providers = providers.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.specialty.toLowerCase().includes(q) ||
      p.skills.some(s => s.toLowerCase().includes(q))
    );
  }

  if (minRating) {
    providers = providers.filter(p => p.rating >= Number(minRating));
  }

  res.json({
    success: true,
    total: providers.length,
    providers
  });
});

// Single provider detail with their services & reviews
router.get('/:id', (req, res) => {
  const providers = db.getCollection('providers');
  const provider = providers.find(p => p.id === req.params.id);

  if (!provider) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ chuyên gia!' });
  }

  const services = db.getCollection('services').filter(s => s.providerId === provider.id);
  const reviews = db.getCollection('reviews').filter(r => r.providerId === provider.id);

  res.json({
    success: true,
    provider,
    services,
    reviews
  });
});

module.exports = router;
