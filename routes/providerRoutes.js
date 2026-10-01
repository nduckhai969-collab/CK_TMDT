const express = require('express');
const router = express.Router();

const db = require('../data/db');
const { slotsForDate } = require('./providerAvailability');
const { requireCustomer } = require('./customerAuth');

// Homepage summaries and provider detail endpoints used by the customer portal.
router.get('/stats', (req, res) => {
  const providers = db.getCollection('providers') || [];
  const jobs = db.getCollection('jobs') || [];
  const services = db.getCollection('services') || [];
  const ratings = providers.map(p => Number(p.rating)).filter(Number.isFinite);
  const skills = new Set(providers.flatMap(p => Array.isArray(p.skills) ? p.skills : []));
  res.json({
    success: true,
    stats: {
      activeProviders: providers.length,
      skillsCount: skills.size + services.length,
      requestsCreated: jobs.length,
      avgRating: ratings.length ? `${(ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length).toFixed(1)}/5` : '0/5'
    }
  });
});

router.get('/featured', (req, res) => {
  const providers = [...(db.getCollection('providers') || [])]
    .sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0) || Number(b.reviewCount || 0) - Number(a.reviewCount || 0))
    .slice(0, 6);
  res.json({ success: true, providers });
});

router.get('/newest', (req, res) => {
  const providers = [...(db.getCollection('providers') || [])]
    .sort((a, b) => new Date(b.createdAt || b.joinDate || 0) - new Date(a.createdAt || a.joinDate || 0));
  // When the demo records have no registration timestamp, show the most recently
  // appended provider records first.
  if (providers.every(p => !p.createdAt && !p.joinDate)) providers.reverse();
  res.json({ success: true, providers: providers.slice(0, 6) });
});

// Customer favorites are stored per signed-in customer in the database.
router.get('/favorites', requireCustomer, (req, res) => {
  const favorites = (db.getCollection('favoriteProviders') || []).filter(item => item.customerId === req.authUser.id);
  const providers = db.getCollection('providers') || [];
  const favoriteProviders = favorites
    .map(item => providers.find(provider => provider.id === item.providerId))
    .filter(Boolean);
  res.json({ success: true, providerIds: favorites.map(item => item.providerId), providers: favoriteProviders });
});

router.put('/:id/favorite', requireCustomer, (req, res) => {
  const providers = db.getCollection('providers') || [];
  if (!providers.some(provider => provider.id === req.params.id)) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy Provider.' });
  }
  const favorites = db.getCollection('favoriteProviders') || [];
  const exists = favorites.some(item => item.customerId === req.authUser.id && item.providerId === req.params.id);
  if (!exists) favorites.unshift({ customerId: req.authUser.id, providerId: req.params.id, createdAt: new Date().toISOString() });
  db.saveCollection('favoriteProviders', favorites);
  res.json({ success: true, favorited: true, message: 'Đã thêm Provider vào danh sách yêu thích.' });
});

router.delete('/:id/favorite', requireCustomer, (req, res) => {
  const favorites = db.getCollection('favoriteProviders') || [];
  const nextFavorites = favorites.filter(item => !(item.customerId === req.authUser.id && item.providerId === req.params.id));
  db.saveCollection('favoriteProviders', nextFavorites);
  res.json({ success: true, favorited: false, message: 'Đã bỏ Provider khỏi danh sách yêu thích.' });
});

router.get('/:id/availability', (req, res) => {
  const provider = (db.getCollection('providers') || []).find(p => p.id === req.params.id);
  if (!provider) return res.status(404).json({ success: false, message: 'Không tìm thấy Provider.' });
  const monthMatch = String(req.query.month || '').match(/^(\d{4})-(\d{2})$/);
  if (!monthMatch) return res.status(400).json({ success: false, message: 'Tháng không hợp lệ.' });
  const year = Number(monthMatch[1]);
  const month = Number(monthMatch[2]) - 1;
  if (month < 0 || month > 11) return res.status(400).json({ success: false, message: 'Tháng không hợp lệ.' });
  const orders = db.getCollection('orders') || [];
  const availability = {};
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day, 12);
    const slots = slotsForDate(provider, date, orders);
    if (slots.length) {
      const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      availability[iso] = slots;
    }
  }
  res.json({ success: true, availability });
});

router.get('/:id', (req, res) => {
  const provider = (db.getCollection('providers') || []).find(p => p.id === req.params.id);
  if (!provider) return res.status(404).json({ success: false, message: 'Không tìm thấy Provider.' });
  const services = (db.getCollection('services') || []).filter(s => s.providerId === provider.id && s.status !== 'inactive');
  const reviews = (db.getCollection('reviews') || []).filter(r => r.providerId === provider.id);
  res.json({ success: true, provider, services, reviews });
});


/* ============================================================
   GET /api/providers
   Danh sách Provider + filter + sort + priceRange
============================================================ */

router.get('/', (req, res) => {

  const {
    category,
    search,
    skill,
    minRating,
    minPrice,
    maxPrice,
    verified,
    sort,
    limit
  } = req.query;


  /* ==========================================================
     LẤY TOÀN BỘ PROVIDER
  ========================================================== */

  const allProviders =
      db.getCollection('providers') || [];


  /* ==========================================================
     TÍNH KHOẢNG GIÁ THỰC TẾ TỪ DATABASE

     HTML slider sẽ dùng:
     priceRange.min
     priceRange.max

     Không hard-code 0 - 2.000.000
  ========================================================== */

  const providerPrices = allProviders

      .map(provider =>
          Number(provider.hourlyRate)
      )

      .filter(price =>
          Number.isFinite(price) &&
          price >= 0
      );


  let priceRange = {
    min: 0,
    max: 0
  };


  if (providerPrices.length > 0) {

    priceRange.min =
        Math.min(...providerPrices);

    priceRange.max =
        Math.max(...providerPrices);

  }


  /* ==========================================================
     COPY ARRAY

     Không filter trực tiếp lên collection gốc.
  ========================================================== */

  let providers =
      [...allProviders];


  /* ==========================================================
     CATEGORY

     HTML gửi:
     ?category=IT
     ?category=Design
     ?category=Marketing
     ...
  ========================================================== */

  if (
      category &&
      category !== 'all'
  ) {

    const categoryLower =
        category
            .toLowerCase()
            .trim();


    providers =
        providers.filter(provider => {

          if (!provider.category) {
            return false;
          }


          return provider.category
              .toLowerCase()
              .includes(categoryLower);

        });

  }


  /* ==========================================================
     SKILL

     HTML gửi:
     ?skill=...
  ========================================================== */

  if (skill) {

    const skillLower =
        skill
            .toLowerCase()
            .trim();


    providers =
        providers.filter(provider => {

          if (
              !Array.isArray(
                  provider.skills
              )
          ) {

            return false;

          }


          return provider.skills.some(
              item =>
                  String(item)
                      .toLowerCase()
                      .includes(skillLower)
          );

        });

  }


  /* ==========================================================
     SEARCH

     HTML gửi:
     ?search=...

     Tìm trong:
     name
     specialty
     bio
     location
     skills
  ========================================================== */

  if (search) {

    const normalizeSearchText = value => String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

    const searchTerms = normalizeSearchText(search).split(/\s+/).filter(Boolean);


    providers =
        providers.filter(provider => {
          const searchableText = normalizeSearchText([
            provider.name,
            provider.specialty,
            provider.bio,
            provider.location,
            provider.category,
            ...(Array.isArray(provider.skills) ? provider.skills : [])
          ].join(' '));

          return searchTerms.length > 0 && searchTerms.every(term => searchableText.includes(term));

        });

  }


  /* ==========================================================
     MIN RATING

     HTML gửi:
     ?minRating=4.5
     ?minRating=4.8
  ========================================================== */

  if (
      minRating !== undefined &&
      minRating !== ''
  ) {

    const ratingValue =
        Number(minRating);


    if (
        Number.isFinite(ratingValue) &&
        ratingValue > 0
    ) {

      providers =
          providers.filter(provider => {

            const rating =
                Number(
                    provider.rating || 0
                );


            return rating >= ratingValue;

          });

    }

  }


  /* ==========================================================
     MIN PRICE

     HTML slider gửi:
     ?minPrice=...
  ========================================================== */

  if (
      minPrice !== undefined &&
      minPrice !== ''
  ) {

    const minPriceValue =
        Number(minPrice);


    if (
        Number.isFinite(
            minPriceValue
        )
    ) {

      providers =
          providers.filter(provider => {

            const hourlyRate =
                Number(
                    provider.hourlyRate || 0
                );


            return (
                hourlyRate >=
                minPriceValue
            );

          });

    }

  }


  /* ==========================================================
     MAX PRICE

     HTML slider gửi:
     ?maxPrice=...
  ========================================================== */

  if (
      maxPrice !== undefined &&
      maxPrice !== ''
  ) {

    const maxPriceValue =
        Number(maxPrice);


    if (
        Number.isFinite(
            maxPriceValue
        )
    ) {

      providers =
          providers.filter(provider => {

            const hourlyRate =
                Number(
                    provider.hourlyRate || 0
                );


            return (
                hourlyRate <=
                maxPriceValue
            );

          });

    }

  }


  /* ==========================================================
     VERIFIED

     HTML gửi:
     ?verified=true
  ========================================================== */

  if (
      verified === 'true'
  ) {

    providers =
        providers.filter(provider =>
            provider.verified === true
        );

  }


  /* ==========================================================
     SORT

     HTML có:

     rating
     price-asc
     price-desc
     orders
  ========================================================== */

  if (
      sort === 'rating'
  ) {

    providers.sort(
        (a, b) =>
            Number(b.rating || 0) -
            Number(a.rating || 0)
    );

  }


  else if (
      sort === 'price-asc'
  ) {

    providers.sort(
        (a, b) =>
            Number(a.hourlyRate || 0) -
            Number(b.hourlyRate || 0)
    );

  }


  else if (
      sort === 'price-desc'
  ) {

    providers.sort(
        (a, b) =>
            Number(b.hourlyRate || 0) -
            Number(a.hourlyRate || 0)
    );

  }


  else if (
      sort === 'orders'
  ) {

    providers.sort(
        (a, b) =>
            Number(b.completedOrders || 0) -
            Number(a.completedOrders || 0)
    );

  }


  /* ==========================================================
     TOTAL

     total phải được tính SAU KHI FILTER
     nhưng TRƯỚC khi limit.
  ========================================================== */

  const total =
      providers.length;


  /* ==========================================================
     LIMIT

     Ví dụ:
     /api/providers?limit=10
  ========================================================== */

  if (
      limit &&
      !isNaN(limit)
  ) {

    const limitNumber =
        Number(limit);


    if (
        limitNumber > 0
    ) {

      providers =
          providers.slice(
              0,
              limitNumber
          );

    }

  }


  /* ==========================================================
     RESPONSE

     HTML cần:

     success
     total
     providers
     priceRange
  ========================================================== */

  res.json({

    success: true,

    total: total,

    providers: providers,

    priceRange: priceRange

  });

});


module.exports = router;
