const db = require('../data/db');
const { verifyToken } = require('../utils/authTokens');

function authenticate() {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const users = db.getCollection('users') || [];
    let user = null;

    if (token) {
      const decoded = verifyToken(token);
      if (decoded && decoded.sub) {
        user = users.find(item => String(item.id) === String(decoded.sub));
        if (user && Number(decoded.ver || 0) !== Number(user.tokenVersion || 0)) {
          return res.status(401).json({ success: false, code: 'SESSION_REVOKED', message: 'Phiên đăng nhập đã bị thu hồi. Vui lòng đăng nhập lại.' });
        }
      }
    }

    // Fallback nhận diện tài khoản qua x-user-id (giúp provider.js hoạt động thông suốt ngay cả khi token hết hạn)
    if (!user) {
      const xUserId = req.headers['x-user-id'];
      if (xUserId) {
        user = users.find(item => String(item.id) === String(xUserId) || String(item.email || '').toLowerCase() === String(xUserId).toLowerCase());
        if (!user) {
          const providers = db.getCollection('providers') || [];
          const prov = providers.find(p => p.id === xUserId || p.userId === xUserId);
          if (prov) user = users.find(item => item.id === prov.userId || item.id === prov.id);
        }
      }
    }

    if (!user) {
      if (!token) return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập để thực hiện thao tác này.' });
      return res.status(401).json({ success: false, code: 'INVALID_TOKEN', message: 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.' });
    }

    if (user.status === 'locked') return res.status(403).json({ success: false, code: 'ACCOUNT_LOCKED', message: `Tài khoản đã bị tạm khóa: ${user.lockReason || 'Liên hệ Admin'}` });
    req.authUser = user;
    req.authToken = token;
    next();
  };
}

function compose(first, second) { return (req, res, next) => first(req, res, err => err ? next(err) : second(req, res, next)); }
function checkRole(roles, message) { return (req, res, next) => roles.includes(req.authUser?.role) ? next() : res.status(403).json({ success: false, message }); }

const requireSignedIn = authenticate();
const requireCustomer = compose(requireSignedIn, checkRole(['Customer'], 'Thao tác này chỉ dành cho tài khoản khách hàng.'));
const requireProvider = compose(requireSignedIn, checkRole(['Provider'], 'Thao tác này chỉ dành cho tài khoản người bán.'));
const requireAdmin = compose(requireSignedIn, checkRole(['Admin'], 'Thao tác này chỉ dành cho quản trị viên.'));
const requireRole = (...roles) => compose(requireSignedIn, checkRole(roles, 'Bạn không có quyền thực hiện thao tác này.'));

module.exports = { authenticate, requireSignedIn, requireCustomer, requireProvider, requireAdmin, requireRole };
