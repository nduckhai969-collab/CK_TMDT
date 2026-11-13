const crypto = require('crypto');

const secret = String(process.env.AUTH_SECRET || '').trim();
if (secret.length < 32 || /^(replace-with|your-)/i.test(secret)) {
  throw new Error('AUTH_SECRET must be configured in .env with a stable value of at least 32 characters.');
}
const ttlSeconds = 30 * 24 * 60 * 60; // 30 ngày

function signToken(userId, tokenVersion = 0) {
  const payload = Buffer.from(JSON.stringify({ sub: String(userId), ver: Number(tokenVersion) || 0, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifyToken(token) {
  const [payload, signature, extra] = String(token || '').split('.');
  if (!payload || !signature || extra) return null;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return decoded && decoded.sub ? decoded : null;
  } catch (_) { return null; }
}

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16);
    crypto.scrypt(String(password), salt, 64, (error, key) => error ? reject(error) : resolve(`scrypt:${salt.toString('hex')}:${key.toString('hex')}`));
  });
}

function verifyPassword(password, encoded) {
  if (typeof encoded !== 'string' || !encoded.startsWith('scrypt:')) return Promise.resolve(false);
  const [, saltHex, keyHex] = encoded.split(':');
  const salt = Buffer.from(saltHex || '', 'hex');
  const expected = Buffer.from(keyHex || '', 'hex');
  if (salt.length !== 16 || expected.length !== 64) return Promise.resolve(false);
  return new Promise((resolve, reject) => crypto.scrypt(String(password), salt, expected.length, (error, actual) => error ? reject(error) : resolve(crypto.timingSafeEqual(actual, expected))));
}

module.exports = { signToken, verifyToken, hashPassword, verifyPassword };
