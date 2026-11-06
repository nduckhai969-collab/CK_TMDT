/**
 * ============================================================================
 * SkillRental Platform - In-Memory Session Store (Mô hình Session truyền thống)
 * File: data/sessionStore.js
 * ============================================================================
 * Quản lý phiên làm việc bằng Session ID (Key-Value trong RAM / Memory Store).
 * Session ID ngẫu nhiên, duy nhất, không thể đoán trước.
 * Hỗ trợ thời gian hết hạn (TTL) và tự động dọn dẹp các session đã hết hạn.
 */

const crypto = require('crypto');

class SessionStore {
  constructor() {
    // Lưu trữ dạng Key-Value: sessionId -> { userId, email, role, name, createdAt, expiresAt }
    this.sessions = new Map();

    // Dọn dẹp session hết hạn định kỳ mỗi 15 phút
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpired();
    }, 15 * 60 * 1000);
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Tạo session mới cho user
   * @param {Object} user - Thông tin người dùng
   * @param {number} ttlMs - Thời gian sống của session (mặc định 24h)
   * @returns {string} sessionId
   */
  createSession(user, ttlMs = 24 * 60 * 60 * 1000) {
    if (!user || !user.id) return null;

    // Sinh Session ID ngẫu nhiên, an toàn cao: sess_<random_hex>
    const randomHex = crypto.randomBytes(24).toString('hex');
    const sessionId = `sess_${randomHex}`;
    const now = Date.now();

    const sessionData = {
      sessionId,
      userId: user.id,
      email: (user.email || '').toLowerCase(),
      role: user.role || 'Customer',
      name: user.name || '',
      createdAt: new Date(now).toISOString(),
      expiresAt: now + ttlMs
    };

    this.sessions.set(sessionId, sessionData);
    console.log(`[SessionStore] ✅ Đã tạo session: ${sessionId} cho user: ${user.email} (${user.role})`);
    return sessionId;
  }

  /**
   * Lấy thông tin session từ sessionId
   * @param {string} sessionId
   * @returns {Object|null}
   */
  getSession(sessionId) {
    if (!sessionId || typeof sessionId !== 'string') return null;

    const session = this.sessions.get(sessionId);
    if (!session) return null;

    // Kiểm tra hết hạn
    if (Date.now() > session.expiresAt) {
      this.destroySession(sessionId);
      return null;
    }

    return session;
  }

  /**
   * Hủy bỏ session (Đăng xuất)
   * @param {string} sessionId
   * @returns {boolean}
   */
  destroySession(sessionId) {
    if (!sessionId) return false;
    const existed = this.sessions.has(sessionId);
    if (existed) {
      this.sessions.delete(sessionId);
      console.log(`[SessionStore] 🗑️ Đã xóa session: ${sessionId}`);
    }
    return existed;
  }

  /**
   * Hủy bỏ toàn bộ session của một user (Dùng sau khi đổi/reset mật khẩu để ép mọi thiết bị đăng nhập lại)
   * @param {string} userId
   * @returns {number} Số lượng session đã xóa
   */
  destroyAllUserSessions(userId) {
    if (!userId) return 0;
    let count = 0;
    for (const [sid, session] of this.sessions.entries()) {
      if (session.userId === userId) {
        this.sessions.delete(sid);
        count++;
      }
    }
    if (count > 0) {
      console.log(`[SessionStore] 🔒 Đã xóa toàn bộ ${count} session của user: ${userId}`);
    }
    return count;
  }

  /**
   * Dọn dẹp các session đã hết hạn
   */
  cleanupExpired() {
    const now = Date.now();
    let count = 0;
    for (const [sid, session] of this.sessions.entries()) {
      if (now > session.expiresAt) {
        this.sessions.delete(sid);
        count++;
      }
    }
    if (count > 0) {
      console.log(`[SessionStore] 🧹 Đã dọn dẹp ${count} session hết hạn.`);
    }
  }

  /**
   * Lấy tổng số session đang hoạt động
   */
  count() {
    return this.sessions.size;
  }
}

// Export một instance duy nhất (Singleton) trong toàn bộ ứng dụng
module.exports = new SessionStore();
