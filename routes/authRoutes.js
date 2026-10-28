const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { randomUUID } = crypto;
const nodemailer = require('nodemailer');
const db = require('../data/db');
const { signToken, hashPassword, verifyPassword } = require('../utils/authTokens');
const { requireSignedIn, requireAdmin } = require('./customerAuth');

// Đăng ký và đăng nhập bằng tài khoản lưu trong MySQL.

function publicUser(user) {
  let bal = user.balance;
  if (user && user.role === 'Customer') {
    const txns = db.getCollection('walletTransactions') || [];
    const userTxns = txns.filter(t => 
      (t.userId === user.id || (user.uid && t.userId === user.uid)) &&
      (t.status === 'success' || t.status === 'completed')
    );
    const hasDeposit = userTxns.some(t => t.type === 'deposit');
    if (!hasDeposit) {
      bal = 0;
      if (Number(user.balance) !== 0) {
        user.balance = 0;
        const users = db.getCollection('users');
        const found = users.find(u => u.id === user.id);
        if (found) { found.balance = 0; db.saveCollection('users', users); }
      }
    } else {
      const totalDeposits = userTxns
        .filter(t => t.type === 'deposit' || t.type === 'refund')
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      const totalDeductions = userTxns
        .filter(t => t.type === 'escrow' || t.type === 'order_payment' || t.type === 'withdraw' || t.type === 'refund_reversal')
        .reduce((sum, t) => sum + Math.abs(Number(t.amount) || 0), 0);
      bal = Math.max(0, totalDeposits - totalDeductions);
      if (user.balance !== bal) {
        user.balance = bal;
        const users = db.getCollection('users');
        const found = users.find(u => u.id === user.id);
        if (found) { found.balance = bal; db.saveCollection('users', users); }
      }
    }
  }

  let providerId = undefined;
  if (user && user.role === 'Provider') {
    const providers = db.getCollection('providers') || [];
    const prv = providers.find(p => p.userId === user.id || p.id === user.id || (p.email && p.email.toLowerCase() === (user.email || '').toLowerCase()));
    if (prv) {
      providerId = prv.id;
    }
  }

  return {
    id: user.id,
    providerId: providerId,
    name: user.name,
    email: user.email,
    phone: user.phone,
    address: user.address || '',
    bio: user.bio || '',
    role: user.role,
    balance: typeof bal === 'number' ? bal : (Number(user.balance) || 0),
    avatar: user.avatar,
    cover: user.cover || '',
    joinDate: user.joinDate
  };
}

function nextUserId(users) {
  const max = users.reduce((m, u) => {
    const match = /^USR(\d+)$/.exec(u.id || '');
    return match ? Math.max(m, parseInt(match[1], 10)) : m;
  }, 0);
  return `USR${String(max + 1).padStart(3, '0')}`;
}

function dateLabel(date = new Date()) {
  return String(date.getDate()).padStart(2, '0') + '/' + String(date.getMonth() + 1).padStart(2, '0') + '/' + date.getFullYear();
}

async function createProviderProfile(user, dateStr = dateLabel()) {
  const providers = db.getCollection('providers') || [];
  const existing = providers.find(item => item.userId === user.id || item.email?.toLowerCase() === user.email?.toLowerCase());
  if (existing) return;
  const maxId = providers.reduce((max, item) => Math.max(max, Number((/^PRV(\d+)$/.exec(item.id || '') || [])[1]) || 0), 0);
  const days = ['T2', 'T3', 'T4', 'T5', 'T6'];
  providers.unshift({
    id: 'PRV' + String(maxId + 1).padStart(3, '0'), userId: user.id, name: user.name, email: user.email,
    phone: user.phone || '', avatar: user.avatar || '', rating: 5, reviews: 0, completedOrders: 0,
    createdAt: dateStr, verified: false, hourlyRate: null, specialty: '',
    category: '', skills: [], availabilityStatus: 'inactive', profileCompleted: false,
    workingHours: 'T2-T7, 08:00-20:00',
    schedule: { mode: 'ready', slots: days.map(day => ({ day, morning: true, afternoon: true, evening: true })).concat([{ day: 'T7', morning: true, afternoon: true, evening: false }, { day: 'CN', morning: false, afternoon: false, evening: false }]) },
    dateExceptions: {}
  });
  await db.saveCollectionAndWait('providers', providers);
}

function getMailTransporter() {
  const smtpUser = String(process.env.SMTP_USER || '').trim();
  const smtpPassword = String(process.env.SMTP_APP_PASSWORD || '').replace(/\s/g, '');
  if (!smtpUser || !smtpPassword) throw new Error('SMTP_NOT_CONFIGURED');
  const port = Number(process.env.SMTP_PORT || 465);
  return { smtpUser, transporter: nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com', port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
    auth: { user: smtpUser, pass: smtpPassword }
  }) };
}

async function sendAccountEmail(to, subject, text, html) {
  const { smtpUser, transporter } = getMailTransporter();
  await transporter.sendMail({ from: process.env.SMTP_FROM || `SkillRental <${smtpUser}>`, to, subject, text, html });
}

async function issueEmailVerification(user) {
  const existing = db.getCollection('emailVerifications') || [];
  if (existing.some(item => item.userId === user.id && Date.now() - Date.parse(item.createdAt) < 60000)) return { sent: false, throttled: true };
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const ttlHours = Math.min(Math.max(Number(process.env.EMAIL_VERIFICATION_TTL_HOURS) || 24, 1), 72);
  const records = existing.filter(item => item.userId !== user.id && Date.parse(item.expiresAt) > Date.now());
  records.push({ id: tokenHash, userId: user.id, tokenHash, expiresAt: new Date(Date.now() + ttlHours * 3600000).toISOString(), createdAt: new Date().toISOString() });
  await db.saveCollectionAndWait('emailVerifications', records);
  const baseUrl = String(process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
  const link = `${baseUrl}/verify.html?mode=verifyEmail&oobCode=${encodeURIComponent(token)}`;
  try {
    await sendAccountEmail(user.email, 'Xác nhận email SkillRental',
      `Xin chào ${user.name},\n\nXác nhận địa chỉ email để kích hoạt tài khoản SkillRental:\n${link}\n\nLiên kết có hiệu lực ${ttlHours} giờ.`,
      `<p>Xin chào ${String(user.name || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))},</p><p>Nhấn liên kết bên dưới để xác nhận email và kích hoạt tài khoản SkillRental. Liên kết có hiệu lực ${ttlHours} giờ.</p><p><a href="${link}">Xác nhận email</a></p>`);
    return { sent: true };
  } catch (error) {
    await db.saveCollectionAndWait('emailVerifications', records.filter(item => item.tokenHash !== tokenHash)).catch(() => {});
    throw error;
  }
}

function detectImageType(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

let googleJwksCache = { keys: [], expiresAt: 0 };
async function verifyGoogleCredential(token, clientId) {
  const parts = String(token).split('.');
  if (parts.length !== 3) return null;
  let header, claims;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch (_) { return null; }
  if (header.alg !== 'RS256' || !header.kid) return null;

  if (Date.now() >= googleJwksCache.expiresAt) {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/certs');
    if (!response.ok) throw new Error('Google public signing keys are unavailable.');
    const body = await response.json();
    const cacheControl = response.headers.get('cache-control') || '';
    const maxAge = Number((/max-age=(\d+)/i.exec(cacheControl) || [])[1] || 300);
    googleJwksCache = { keys: body.keys || [], expiresAt: Date.now() + Math.min(Math.max(maxAge, 60), 3600) * 1000 };
  }

  let jwk = googleJwksCache.keys.find(key => key.kid === header.kid && key.use === 'sig');
  if (!jwk) {
    googleJwksCache.expiresAt = 0;
    const response = await fetch('https://www.googleapis.com/oauth2/v3/certs');
    if (!response.ok) throw new Error('Google public signing keys are unavailable.');
    const body = await response.json();
    googleJwksCache = { keys: body.keys || [], expiresAt: Date.now() + 300000 };
    jwk = googleJwksCache.keys.find(key => key.kid === header.kid && key.use === 'sig');
  }
  if (!jwk) return null;

  const signingInput = Buffer.from(`${parts[0]}.${parts[1]}`);
  const signature = Buffer.from(parts[2], 'base64url');
  const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  if (!crypto.verify('RSA-SHA256', signingInput, publicKey, signature)) return null;
  const now = Math.floor(Date.now() / 1000);
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss) || claims.aud !== clientId ||
      !claims.sub || !claims.email || claims.email_verified !== true || !claims.exp || claims.exp <= now ||
      (claims.iat && claims.iat > now + 60)) return null;
  return claims;
}

// Đăng ký tài khoản trong MySQL.
router.post('/register', async (req, res) => {
  const { name, email, phone, password, role } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!name || !String(name).trim() || !cleanEmail || !password) return res.status(400).json({ success: false, message: 'Vui lòng điền đầy đủ họ tên, email và mật khẩu!' });
  if (String(name).trim().length > 100 || cleanEmail.length > 100) return res.status(400).json({ success: false, message: 'Họ tên tối đa 100 ký tự và email tối đa 100 ký tự.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return res.status(400).json({ success: false, message: 'Địa chỉ email không hợp lệ.' });
  if (String(password).length < 6) return res.status(400).json({ success: false, message: 'Mật khẩu phải có ít nhất 6 ký tự.' });
  if (phone && !/^[0-9+\s().-]{8,16}$/.test(String(phone).trim())) return res.status(400).json({ success: false, message: 'Số điện thoại không hợp lệ!' });
  const users = db.getCollection('users') || [];
  if (users.some(user => String(user.email || '').trim().toLowerCase() === cleanEmail)) return res.status(409).json({ success: false, message: 'Email này đã được sử dụng trên hệ thống!' });
  const safeRole = String(role || '').trim().toLowerCase() === 'provider' ? 'Provider' : 'Customer';
  const now = new Date();
  const dateStr = String(now.getDate()).padStart(2,'0')+'/'+String(now.getMonth()+1).padStart(2,'0')+'/'+now.getFullYear();
  const user = { id: nextUserId(users), name: String(name).trim(), email: cleanEmail, phone: phone ? String(phone).trim() : '', role: safeRole, passwordHash: await hashPassword(password), joinDate: dateStr, spentOrEarned: '0đ', balance: 0, status: 'pending_verification', emailVerified: false, avatar: '', bio: '' };
  users.push(user); await db.saveCollectionAndWait('users', users);
  try {
    await issueEmailVerification(user);
  } catch (error) {
    console.error('[auth] Không gửi được email xác nhận:', error.message);
    return res.status(503).json({ success: false, code: 'EMAIL_SEND_FAILED', message: 'Tài khoản đang chờ xác nhận nhưng chưa gửi được email. Kiểm tra Gmail SMTP rồi dùng chức năng gửi lại email xác nhận.' });
  }
  return res.status(201).json({ success: true, verifyEmail: true, verificationSent: true, email: cleanEmail, role: safeRole, message: `Đã gửi email xác nhận tới ${cleanEmail}. Hãy mở email để kích hoạt tài khoản.` });
});

router.post('/verify-email', async (req, res) => {
  const token = String(req.body?.token || '');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const records = db.getCollection('emailVerifications') || [];
  const record = records.find(item => item.tokenHash === tokenHash && Date.parse(item.expiresAt) > Date.now());
  if (!record) return res.status(400).json({ success: false, message: 'Liên kết xác nhận không hợp lệ hoặc đã hết hạn. Hãy yêu cầu gửi lại email.' });
  const users = db.getCollection('users') || [];
  const user = users.find(item => item.id === record.userId);
  if (!user) return res.status(400).json({ success: false, message: 'Không tìm thấy tài khoản cần xác nhận.' });
  user.status = 'active';
  user.emailVerified = true;
  await db.saveCollectionAndWait('users', users);
  await db.saveCollectionAndWait('emailVerifications', records.filter(item => item.tokenHash !== tokenHash));
  if (user.role === 'Provider') await createProviderProfile(user, user.joinDate || dateLabel());
  return res.json({ success: true, message: 'Email đã được xác nhận. Bạn có thể đăng nhập.' });
});

router.post('/resend-verification', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ success: false, message: 'Vui lòng nhập email cần xác nhận.' });
  const user = (db.getCollection('users') || []).find(item => String(item.email || '').trim().toLowerCase() === email);
  if (!user || user.emailVerified || user.status !== 'pending_verification') return res.json({ success: true, message: 'Nếu tài khoản cần xác nhận, email sẽ được gửi lại.' });
  try {
    const result = await issueEmailVerification(user);
    return res.json({ success: true, message: result.throttled ? 'Hãy chờ một phút trước khi yêu cầu gửi lại.' : `Đã gửi lại email xác nhận tới ${email}.` });
  } catch (error) {
    console.error('[auth] Gửi lại email xác nhận thất bại:', error.message);
    return res.status(503).json({ success: false, message: 'Gửi email thất bại. Kiểm tra Gmail SMTP trong .env.' });
  }
});

// Google proves identity; the account profile and app session remain in MySQL.
router.get('/google/config', (_req, res) => {
  res.json({ success: true, clientId: process.env.GOOGLE_CLIENT_ID || '' });
});

router.post('/google', async (req, res) => {
  const credential = String(req.body?.credential || '');
  const clientId = String(process.env.GOOGLE_CLIENT_ID || '');
  if (!clientId) return res.status(503).json({ success: false, message: 'Chưa cấu hình GOOGLE_CLIENT_ID trong .env.' });
  if (!credential || credential.length > 10000) return res.status(400).json({ success: false, message: 'Thông tin đăng nhập Google không hợp lệ.' });

  let identity;
  try {
    identity = await verifyGoogleCredential(credential, clientId);
  } catch (_) {
    return res.status(502).json({ success: false, message: 'Không thể xác minh tài khoản với Google lúc này.' });
  }
  if (!identity) {
    return res.status(401).json({ success: false, message: 'Thông tin xác thực Google không hợp lệ hoặc email chưa được xác minh.' });
  }

  const cleanEmail = String(identity.email).trim().toLowerCase();
  const users = db.getCollection('users') || [];
  let user = users.find(item => String(item.googleSub || '') === String(identity.sub));
  if (!user) user = users.find(item => String(item.email || '').trim().toLowerCase() === cleanEmail);
  if (user?.status === 'locked') return res.status(403).json({ success: false, code: 'ACCOUNT_LOCKED', message: `Tài khoản đã bị tạm khóa: ${user.lockReason || 'Liên hệ Admin'}` });

  if (user) {
    user.googleSub = String(identity.sub);
    user.emailVerified = true;
    if (user.status === 'pending_verification') user.status = 'active';
    if (!user.avatar && identity.picture) user.avatar = String(identity.picture);
    await db.saveCollectionAndWait('users', users);
    if (user.role === 'Provider') await createProviderProfile(user, user.joinDate || dateLabel());
  } else {
    const role = String(req.body?.role || '').trim().toLowerCase() === 'provider' ? 'Provider' : 'Customer';
    const dateStr = dateLabel();
    user = {
      id: nextUserId(users), googleSub: String(identity.sub), name: String(identity.name || cleanEmail.split('@')[0]).trim(),
      email: cleanEmail, phone: '', role, authProvider: 'google', joinDate: dateStr,
      spentOrEarned: '0đ', balance: 0, status: 'active', avatar: String(identity.picture || ''), bio: ''
    };
    users.push(user);
    await db.saveCollectionAndWait('users', users);
    if (role === 'Provider') await createProviderProfile(user, dateStr);
  }

  return res.json({ success: true, message: 'Đăng nhập Google thành công.', user: publicUser(user), accessToken: signToken(user.id) });
});

router.post('/login', async (req,res) => {
  const email=String(req.body?.email||'').trim().toLowerCase();const password=String(req.body?.password||'');
  const user=(db.getCollection('users')||[]).find(item=>String(item.email||'').trim().toLowerCase()===email);
  let valid=user && await verifyPassword(password,user.passwordHash);
  // Hỗ trợ mật khẩu mẫu cũ được lưu trực tiếp để đăng nhập lần đầu, sau đó chuyển sang hash.
  if(user&&!valid&&typeof user.password==='string'&&user.password===password){user.passwordHash=await hashPassword(password);delete user.password;await db.saveCollectionAndWait('users',(db.getCollection('users')||[]).map(item=>item.id===user.id?user:item));valid=true;}
  if(!valid)return res.status(401).json({success:false,message:'Email hoặc mật khẩu không chính xác.'});
  if(user.status==='pending_verification'||user.emailVerified===false)return res.status(403).json({success:false,code:'EMAIL_NOT_VERIFIED',email:user.email,message:'Tài khoản chưa được xác nhận. Hãy mở email xác nhận hoặc yêu cầu gửi lại.'});
  if(user.status==='locked')return res.status(403).json({success:false,code:'ACCOUNT_LOCKED',message:'Tài khoản đã bị tạm khóa: '+(user.lockReason||'Liên hệ Admin')});
  return res.json({success:true,message:'Đăng nhập thành công!',user:publicUser(user),accessToken:signToken(user.id)});
});

// Hồ sơ hiện tại
router.get('/me', requireSignedIn, (req, res) => {
  res.json({ success: true, user: publicUser(req.authUser) });
});

// Danh sách user (chỉ Admin)
router.get('/users', requireAdmin, (req, res) => {
  const users = db.getCollection('users');
  res.json({
    success: true,
    users: users.map(u => ({
      id: u.id, name: u.name, email: u.email, role: u.role,
      balance: u.balance, avatar: u.avatar, status: u.status
    }))
  });
});

// Upload file avatar lên backend; MySQL chỉ lưu URL, không lưu nội dung ảnh.
router.put('/profile/avatar', requireSignedIn, express.raw({ type: ['image/*', 'application/octet-stream'], limit: '10mb' }), async (req, res) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) {
    return res.status(400).json({ success: false, message: 'Vui lòng chọn ảnh JPG, PNG hoặc WebP.' });
  }

  const extension = detectImageType(req.body);
  if (!extension) {
    return res.status(415).json({ success: false, message: 'File không phải ảnh JPG, PNG hoặc WebP hợp lệ.' });
  }

  const users = db.getCollection('users');
  const index = users.findIndex(u => u.id === req.authUser.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng!' });
  }

  const uid = String(req.authUser?.id || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!uid) return res.status(400).json({ success: false, message: 'Không xác định được tài khoản.' });

  const fileName = `${randomUUID()}.${extension}`;
  const relativePath = path.posix.join('avatars', uid, fileName);
  const uploadRoot = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads'));
  const absolutePath = path.resolve(uploadRoot, ...relativePath.split('/'));
  if (!absolutePath.startsWith(uploadRoot + path.sep)) {
    return res.status(400).json({ success: false, message: 'Đường dẫn lưu ảnh không hợp lệ.' });
  }

  try {
    await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.promises.writeFile(absolutePath, req.body, { flag: 'wx', mode: 0o640 });
    const avatar = `${req.protocol}://${req.get('host')}/uploads/${relativePath.split('/').map(encodeURIComponent).join('/')}`;
    const previousAvatar = users[index].avatar;
    users[index].avatar = avatar;
    db.saveCollection('users', users);

    // Đồng bộ sang collection 'providers' nếu người dùng là Provider
    const providers = db.getCollection('providers') || [];
    const pIndex = providers.findIndex(p => p.userId === req.authUser.id || p.id === req.authUser.id || (p.email && p.email.toLowerCase() === (req.authUser.email || '').toLowerCase()));
    if (pIndex !== -1) {
      providers[pIndex].avatar = avatar;
      db.saveCollection('providers', providers);
    }

    // Xóa file cũ chỉ khi nó nằm trong thư mục upload do ứng dụng quản lý.
    if (previousAvatar) {
      try {
        const previousUrl = new URL(previousAvatar, avatar);
        const previousPath = decodeURIComponent(previousUrl.pathname);
        if (previousUrl.origin === new URL(avatar).origin && previousPath.startsWith('/uploads/avatars/')) {
          const oldFile = path.resolve(uploadRoot, ...previousPath.slice('/uploads/'.length).split('/'));
          if (oldFile.startsWith(uploadRoot + path.sep) && oldFile !== absolutePath) await fs.promises.unlink(oldFile).catch(() => {});
        }
      } catch (_) { /* URL cũ có thể thuộc dịch vụ lưu trữ khác */ }
    }

    return res.json({ success: true, message: 'Đã cập nhật ảnh đại diện.', user: publicUser(users[index]) });
  } catch (err) {
    console.error('[auth] Upload avatar:', err.message);
    return res.status(500).json({ success: false, message: 'Không thể lưu ảnh đại diện lúc này.' });
  }
});

// Upload file ảnh bìa (cover) lên backend
router.put('/profile/cover', requireSignedIn, express.raw({ type: ['image/*', 'application/octet-stream'], limit: '15mb' }), async (req, res) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) {
    return res.status(400).json({ success: false, message: 'Vui lòng chọn ảnh JPG, PNG hoặc WebP.' });
  }

  const extension = detectImageType(req.body);
  if (!extension) {
    return res.status(415).json({ success: false, message: 'File không phải ảnh JPG, PNG hoặc WebP hợp lệ.' });
  }

  const users = db.getCollection('users');
  const index = users.findIndex(u => u.id === req.authUser.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng!' });
  }

  const uid = String(req.authUser?.id || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!uid) return res.status(400).json({ success: false, message: 'Không xác định được tài khoản.' });

  const fileName = `${randomUUID()}.${extension}`;
  const relativePath = path.posix.join('covers', uid, fileName);
  const uploadRoot = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads'));
  const absolutePath = path.resolve(uploadRoot, ...relativePath.split('/'));
  if (!absolutePath.startsWith(uploadRoot + path.sep)) {
    return res.status(400).json({ success: false, message: 'Đường dẫn lưu ảnh không hợp lệ.' });
  }

  try {
    await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.promises.writeFile(absolutePath, req.body, { flag: 'wx', mode: 0o640 });
    const cover = `${req.protocol}://${req.get('host')}/uploads/${relativePath.split('/').map(encodeURIComponent).join('/')}`;
    const previousCover = users[index].cover;
    users[index].cover = cover;
    db.saveCollection('users', users);

    // Đồng bộ sang collection 'providers' nếu người dùng là Provider
    const providers = db.getCollection('providers') || [];
    const pIndex = providers.findIndex(p => p.userId === req.authUser.id || p.id === req.authUser.id || (p.email && p.email.toLowerCase() === (req.authUser.email || '').toLowerCase()));
    if (pIndex !== -1) {
      providers[pIndex].cover = cover;
      db.saveCollection('providers', providers);
    }

    // Xóa file cũ nếu có
    if (previousCover) {
      try {
        const previousUrl = new URL(previousCover, cover);
        const previousPath = decodeURIComponent(previousUrl.pathname);
        if (previousUrl.origin === new URL(cover).origin && previousPath.startsWith('/uploads/covers/')) {
          const oldFile = path.resolve(uploadRoot, ...previousPath.slice('/uploads/'.length).split('/'));
          if (oldFile.startsWith(uploadRoot + path.sep) && oldFile !== absolutePath) await fs.promises.unlink(oldFile).catch(() => {});
        }
      } catch (_) {}
    }

    return res.json({ success: true, message: 'Đã cập nhật ảnh bìa thành công!', cover, user: publicUser(users[index]) });
  } catch (err) {
    console.error('[auth] Upload cover:', err.message);
    return res.status(500).json({ success: false, message: 'Không thể lưu ảnh bìa lúc này.' });
  }
});

// Cập nhật hồ sơ
router.put('/profile', requireSignedIn, async (req, res) => {
  const { name, phone, address, avatar, cover, bio } = req.body || {};

  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: 'Họ tên không được để trống!' });
  }

  const users = db.getCollection('users');
  const index = users.findIndex(u => u.id === req.authUser.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng!' });
  }

  users[index].name = name.trim();
  users[index].phone = phone ? phone.trim() : '';
  users[index].address = address ? address.trim() : '';
  if (avatar) users[index].avatar = avatar;
  if (cover !== undefined) users[index].cover = cover;
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'bio')) {
    const trimmedBio = String(bio || '').trim();
    if (trimmedBio.length > 1000) {
      return res.status(400).json({ success: false, message: 'Giới thiệu bản thân không được vượt quá 1000 ký tự.' });
    }
    users[index].bio = trimmedBio;
  }
  db.saveCollection('users', users);

  // Đồng bộ sang collection 'providers' nếu là provider
  const providers = db.getCollection('providers') || [];
  const pIndex = providers.findIndex(p => p.userId === req.authUser.id || p.id === req.authUser.id || (p.email && p.email.toLowerCase() === (req.authUser.email || '').toLowerCase()));
  if (pIndex !== -1) {
    if (name) providers[pIndex].name = name.trim();
    if (phone !== undefined) providers[pIndex].phone = phone.trim();
    if (avatar) providers[pIndex].avatar = avatar;
    if (cover !== undefined) providers[pIndex].cover = cover;
    if (address !== undefined) providers[pIndex].location = address.trim();
    if (bio !== undefined) providers[pIndex].bio = bio.trim();
    db.saveCollection('providers', providers);
  }
  res.json({ success: true, message: 'Cập nhật thông tin thành công!', user: publicUser(users[index]) });
});

// Đổi mật khẩu trong MySQL.
router.put('/change-password', requireSignedIn, async (req,res) => {
 const {currentPassword,newPassword}=req.body||{};if(!currentPassword||!newPassword||String(newPassword).length<8)return res.status(400).json({success:false,message:'Nhập mật khẩu hiện tại và mật khẩu mới (ít nhất 8 ký tự).'});
 const users=db.getCollection('users')||[];const index=users.findIndex(user=>user.id===req.authUser.id);if(index<0||!await verifyPassword(currentPassword,users[index].passwordHash))return res.status(401).json({success:false,message:'Mật khẩu hiện tại không chính xác.'});
 users[index].passwordHash=await hashPassword(newPassword);delete users[index].password;await db.saveCollectionAndWait('users',users);res.json({success:true,message:'Đổi mật khẩu thành công.'});
});
router.post('/forgot-password', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ success: false, message: 'Địa chỉ email không hợp lệ.' });
  const smtpUser = String(process.env.SMTP_USER || '').trim();
  const smtpPassword = String(process.env.SMTP_APP_PASSWORD || '').replace(/\s/g, '');
  if (!smtpUser || !smtpPassword) return res.status(503).json({ success: false, message: 'Chưa cấu hình Gmail SMTP. Hãy điền SMTP_USER và SMTP_APP_PASSWORD trong .env.' });

  const user = (db.getCollection('users') || []).find(item => String(item.email || '').trim().toLowerCase() === email);
  // Always return the same result for known and unknown addresses.
  const accepted = { success: true, message: 'Nếu email này có tài khoản, liên kết đặt lại mật khẩu sẽ được gửi trong ít phút.' };
  if (!user) return res.json(accepted);

  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const ttlMinutes = Math.min(Math.max(Number(process.env.PASSWORD_RESET_TTL_MINUTES) || 30, 5), 120);
  const existingResets = db.getCollection('passwordResets') || [];
  if (existingResets.some(item => item.userId === user.id && Date.now() - Date.parse(item.createdAt) < 60000)) return res.json(accepted);
  const resets = existingResets.filter(item => item.userId !== user.id && Date.parse(item.expiresAt) > Date.now());
  resets.push({ id: tokenHash, userId: user.id, tokenHash, expiresAt: new Date(Date.now() + ttlMinutes * 60000).toISOString(), createdAt: new Date().toISOString() });
  await db.saveCollectionAndWait('passwordResets', resets);

  const port = Number(process.env.SMTP_PORT || 465);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com', port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
    auth: { user: smtpUser, pass: smtpPassword }
  });
  const baseUrl = String(process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
  const resetLink = `${baseUrl}/index.html?mode=resetPassword&oobCode=${encodeURIComponent(token)}`;
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || `SkillRental <${smtpUser}>`, to: user.email,
      subject: 'Đặt lại mật khẩu SkillRental',
      text: `Xin chào ${user.name || ''},\n\nMở liên kết sau để đặt mật khẩu mới (hiệu lực ${ttlMinutes} phút):\n${resetLink}\n\nNếu bạn không yêu cầu, hãy bỏ qua email này.`,
      html: `<p>Xin chào ${String(user.name || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))},</p><p>Liên kết đặt lại mật khẩu có hiệu lực ${ttlMinutes} phút:</p><p><a href="${resetLink}">Đặt lại mật khẩu</a></p><p>Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>`
    });
    return res.json(accepted);
  } catch (error) {
    await db.saveCollectionAndWait('passwordResets', resets.filter(item => item.tokenHash !== tokenHash)).catch(() => {});
    console.error('[auth] Không gửi được email khôi phục:', error.message);
    return res.status(502).json({ success: false, message: 'Gửi email thất bại. Kiểm tra cấu hình Gmail SMTP trong .env.' });
  }
});

router.post('/reset-password', async (req, res) => {
  const token = String(req.body?.token || '');
  const newPassword = String(req.body?.newPassword || '');
  if (newPassword.length < 6) return res.status(400).json({ success: false, message: 'Mật khẩu mới phải có ít nhất 6 ký tự.' });
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const resets = db.getCollection('passwordResets') || [];
  const reset = resets.find(item => item.tokenHash === tokenHash && Date.parse(item.expiresAt) > Date.now());
  if (!reset) return res.status(400).json({ success: false, message: 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.' });
  const users = db.getCollection('users') || [];
  const index = users.findIndex(item => item.id === reset.userId);
  if (index < 0) return res.status(400).json({ success: false, message: 'Không tìm thấy tài khoản cần đặt lại mật khẩu.' });
  users[index].passwordHash = await hashPassword(newPassword);
  delete users[index].password;
  await db.saveCollectionAndWait('users', users);
  await db.saveCollectionAndWait('passwordResets', resets.filter(item => item.tokenHash !== tokenHash));
  return res.json({ success: true, message: 'Đổi mật khẩu thành công. Bạn có thể đăng nhập bằng mật khẩu mới.' });
});
router.post('/resend-verification',(_req,res)=>res.status(410).json({success:false,message:'Tài khoản MySQL không yêu cầu xác nhận email.'}));

module.exports = router;
