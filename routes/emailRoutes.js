const express = require('express');
const router = express.Router();
const { requireAdmin } = require('./customerAuth');
const { addSuppression, recordEvent, findEmail, listEmails, getStats } = require('../services/emailQueue');
const { BASE_URL } = require('../services/emailService');

const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

// Hủy nhận email marketing (1 click, không cần đăng nhập).
router.get('/unsubscribe', (req, res) => {
  const record = findEmail(req.query.e);
  const email = (record && record.to) || req.query.email || '';
  addSuppression(email, 'unsubscribe');
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!doctype html><html><body style="font-family:Arial,sans-serif;text-align:center;padding:60px">
    <h2>Đã hủy nhận email marketing</h2>
    <p>${email ? 'Địa chỉ ' + String(email).replace(/[<>&]/g, '') : 'Tài khoản của bạn'} sẽ không nhận thêm email gợi ý từ SkillRental.</p>
  </body></html>`);
});

// Ảnh 1x1 ghi nhận lượt mở (chỉ để tham khảo).
router.get('/o/:id', (req, res) => {
  recordEvent(req.params.id, 'open');
  res.set('Content-Type', 'image/gif');
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.end(PIXEL);
});

// Ghi nhận lượt click rồi chuyển hướng về đích.
router.get('/c/:id', (req, res) => {
  const target = String(req.query.u || '');
  recordEvent(req.params.id, 'click', target);
  const safe = target.startsWith(BASE_URL) ? target : `${BASE_URL}/customer.html`;
  res.redirect(safe);
});

// Xem log email (chỉ admin).
router.get('/logs', requireAdmin, (req, res) => {
  res.json({ success: true, stats: getStats(), emails: listEmails().slice(0, 200) });
});

module.exports = router;
