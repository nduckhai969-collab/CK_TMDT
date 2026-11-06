/**
 * ============================================================================
 * SkillRental Platform - Password Hashing & Verification Utilities
 * File: utils/password.js
 * ============================================================================
 * Sử dụng chuẩn PBKDF2 (Password-Based Key Derivation Function 2) với SHA-512
 * và Salt ngẫu nhiên 16 byte. Tương thích chuẩn công nghiệp.
 * Đồng thời hỗ trợ so sánh an toàn timing-safe chống tấn công Timing Attack.
 */

const crypto = require('crypto');

/**
 * Băm mật khẩu kèm salt ngẫu nhiên
 * @param {string} password - Mật khẩu gốc dạng plain text
 * @returns {string} salt:hash
 */
function hashPassword(password) {
  if (!password || typeof password !== 'string') {
    throw new Error('Mật khẩu không hợp lệ.');
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

/**
 * So khớp mật khẩu người dùng nhập với mật khẩu lưu trong CSDL
 * @param {string} password - Mật khẩu người dùng nhập khi đăng nhập
 * @param {string} storedHash - Chuỗi lưu trong DB (dạng salt:hash hoặc mật khẩu cũ)
 * @returns {boolean} true nếu khớp, false nếu sai
 */
function comparePassword(password, storedHash) {
  if (!password || !storedHash || typeof password !== 'string') {
    return false;
  }

  // 1. Nếu storedHash chứa dấu ':' -> Chuẩn PBKDF2 salt:hash
  if (storedHash.includes(':')) {
    const parts = storedHash.split(':');
    if (parts.length !== 2) return false;

    const salt = parts[0];
    const originalHash = parts[1];

    try {
      const computedHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
      const bufA = Buffer.from(computedHash, 'hex');
      const bufB = Buffer.from(originalHash, 'hex');

      if (bufA.length !== bufB.length) return false;
      return crypto.timingSafeEqual(bufA, bufB);
    } catch (_) {
      return false;
    }
  }

  // 2. Tương thích dữ liệu seed/mock cũ (nếu mật khẩu lưu dạng chuỗi thẳng như "123", "123456")
  return password === storedHash;
}

module.exports = {
  hashPassword,
  comparePassword
};
