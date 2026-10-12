const db = require('../data/db');

function findSignedInUser(req) {
  const userId = req.headers['x-user-id'];
  if (!userId) return null;
  return (db.getCollection('users') || []).find(user => user.id === userId && user.status !== 'locked') || null;
}

function requireSignedIn(req, res, next) {
  const user = findSignedInUser(req);
  if (!user) return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập để thực hiện thao tác này.' });
  req.authUser = user;
  next();
}

function requireCustomer(req, res, next) {
  requireSignedIn(req, res, () => {
    if (req.authUser.role !== 'Customer') {
      return res.status(403).json({ success: false, message: 'Thao tác này chỉ dành cho tài khoản khách hàng.' });
    }
    next();
  });
}

module.exports = { requireSignedIn, requireCustomer };
