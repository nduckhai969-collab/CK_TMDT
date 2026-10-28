// ============================================================================
// SKILLRENTAL PLATFORM - FIREBASE AUTH CLIENT & UNIFIED AUTH MODAL
// ============================================================================
// Hỗ trợ đầy đủ 4 tính năng cốt lõi:
// 1. Đăng ký (gửi email xác nhận qua Firebase)
// 2. Đăng nhập (kiểm tra emailVerified, Google Auth, 1-Click Demo Login, phân quyền Role)
// 3. Đăng xuất (xóa session, signOut Firebase, đồng bộ toàn bộ Customer / Provider / Admin)
// 4. Lấy lại mật khẩu (gửi email đặt lại mật khẩu an toàn, form trực quan, hỗ trợ action code)
// ============================================================================

(function () {
  const SESSION_KEY = 'SKILLRENTAL_CURRENT_USER';

  if (!window.firebase || !window.FIREBASE_CONFIG) {
    console.error('[SkillAuth] Thiếu Firebase SDK hoặc firebase-config.js');
    return;
  }

  // 1. Khởi tạo Firebase App nếu chưa có
  let fbApp;
  try {
    fbApp = firebase.apps.length ? firebase.app() : firebase.initializeApp(window.FIREBASE_CONFIG);
  } catch (err) {
    console.error('[SkillAuth] Lỗi khởi tạo Firebase:', err);
  }

  const fbAuth = firebase.auth();
  fbAuth.languageCode = 'vi'; // Email xác nhận và đặt lại mật khẩu hiển thị tiếng Việt

  // 2. Chờ Firebase phục hồi phiên đăng nhập trước khi fetch API
  const authReady = new Promise((resolve) => {
    const off = fbAuth.onAuthStateChanged((user) => {
      off();
      // Nếu ở frontend đã xóa session (hoặc đăng xuất) thì đăng xuất luôn trên Firebase Auth
      if (user && !localStorage.getItem(SESSION_KEY)) {
        fbAuth.signOut().finally(resolve);
      } else {
        resolve();
      }
    });
  });

  // 3. Tự động gắn Bearer Token vào mọi request /api/
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
    if (!url.includes('/api/')) return nativeFetch(input, init);

    await authReady;
    const options = { ...(init || {}) };
    const headers = new Headers(options.headers || {});
    const user = fbAuth.currentUser;
    if (user && !headers.has('Authorization') && localStorage.getItem(SESSION_KEY)) {
      try {
        const token = await user.getIdToken();
        headers.set('Authorization', 'Bearer ' + token);
      } catch (err) {
        console.warn('[SkillAuth] Không lấy được ID token:', err);
      }
    }
    options.headers = headers;
    return nativeFetch(input, options);
  };

  // 4. Bảng thông báo lỗi tiếng Việt thân thiện
  const MESSAGES = {
    'auth/email-already-in-use': 'Email này đã được sử dụng trên hệ thống! Vui lòng chọn Đăng Nhập hoặc Lấy Lại Mật Khẩu.',
    'auth/invalid-email': 'Định dạng email không hợp lệ.',
    'auth/weak-password': 'Mật khẩu quá yếu (yêu cầu tối thiểu 6 ký tự).',
    'auth/invalid-credential': 'Email hoặc mật khẩu không chính xác!',
    'auth/user-not-found': 'Tài khoản không tồn tại trên hệ thống.',
    'auth/wrong-password': 'Mật khẩu không chính xác!',
    'auth/user-disabled': 'Tài khoản này đã bị khóa hoặc vô hiệu hóa.',
    'auth/too-many-requests': 'Bạn đã thao tác quá nhiều lần. Vui lòng thử lại sau ít phút.',
    'auth/network-request-failed': 'Lỗi kết nối mạng. Vui lòng kiểm tra lại đường truyền internet.',
    'auth/popup-closed-by-user': 'Cửa sổ đăng nhập đã bị đóng trước khi hoàn tất.',
    'auth/expired-action-code': 'Liên kết đã hết hạn. Vui lòng yêu cầu gửi lại email mới.',
    'auth/invalid-action-code': 'Liên kết xác thực không hợp lệ hoặc đã được sử dụng.'
  };

  const fail = (err, fallback) => ({
    success: false,
    code: err && err.code,
    message: MESSAGES[err && err.code] || (err && err.message) || fallback
  });

  async function callApi(path, method, token, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;

    try {
      const res = await nativeFetch(path, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: 'Không thể kết nối tới máy chủ. Vui lòng kiểm tra backend.' };
    }
  }

  // Helper helper: Lấy và đồng bộ State Admin an toàn
  const ADMIN_STORAGE_KEY = 'SKILL_RENTAL_ADMIN_STATE_V1';

  function getAdminStateSafe() {
    try {
      const raw = localStorage.getItem(ADMIN_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.users)) {
          return parsed;
        }
      }
    } catch (_) {}
    if (typeof window.getAppState === 'function') {
      return window.getAppState();
    }
    const defaultUsers = (window.DEFAULT_STATE && Array.isArray(window.DEFAULT_STATE.users))
      ? JSON.parse(JSON.stringify(window.DEFAULT_STATE.users))
      : [
          { id: 'USR001', name: 'Nguyễn Văn An', email: 'an.nguyen@example.com', phone: '0901 234 567', role: 'Provider', joinDate: '12/01/2024', spentOrEarned: '112.500.000đ', status: 'active', lockReason: '' },
          { id: 'USR002', name: 'Trần Thị Lan', email: 'lan.tran@example.com', phone: '0912 345 678', role: 'Provider', joinDate: '03/02/2024', spentOrEarned: '89.200.000đ', status: 'active', lockReason: '' },
          { id: 'USR003', name: 'Lê Hoàng Long', email: 'long.le@example.com', phone: '0988 776 655', role: 'Customer', joinDate: '15/03/2024', spentOrEarned: '24.600.000đ', status: 'active', lockReason: '' },
          { id: 'USR004', name: 'Hoàng Văn Nam', email: 'nam.hoang@example.com', phone: '0933 221 100', role: 'Customer', joinDate: '20/05/2024', spentOrEarned: '5.200.000đ', status: 'locked', lockReason: 'Hủy đơn hàng liên tục 5 lần không lý do', lockDuration: '7 ngày' },
          { id: 'USR005', name: 'Phạm Hữu Cường', email: 'cuong.pham@example.com', phone: '0977 445 566', role: 'Provider', joinDate: '18/06/2024', spentOrEarned: '74.000.000đ', status: 'active', lockReason: '' },
          { id: 'USR006', name: 'Vũ Thị Minh', email: 'minh.vu@example.com', phone: '0944 889 900', role: 'Customer', joinDate: '02/08/2024', spentOrEarned: '18.400.000đ', status: 'active', lockReason: '' },
          { id: 'USR007', name: 'Đặng Quốc Huy', email: 'huy.dang@example.com', phone: '0911 334 455', role: 'Provider', joinDate: '11/09/2024', spentOrEarned: '12.000.000đ', status: 'locked', lockReason: 'Gian lận đánh giá và sử dụng tài khoản ảo', lockDuration: 'Vĩnh viễn' },
          { id: 'USR008', name: 'Trần Đình Trọng', email: 'trong.tran@example.com', phone: '0937 889 911', role: 'Provider', joinDate: '10/01/2025', spentOrEarned: '0đ', status: 'active', lockReason: '' },
          { id: 'USR009', name: 'Lê Thị Duyên', email: 'duyen.le@example.com', phone: '0981 223 344', role: 'Provider', joinDate: '15/01/2025', spentOrEarned: '0đ', status: 'active', lockReason: '' },
          { id: 'ADM001', name: 'Quản Trị Viên Sàn', email: 'skillrentaladmin@gmail.com', phone: '0999 888 777', role: 'Admin', joinDate: '01/01/2024', spentOrEarned: '0đ', status: 'active', lockReason: '' },
          { id: 'ADM002', name: 'Admin Dự Phòng', email: 'admin@skillrental.com', phone: '0999 888 666', role: 'Admin', joinDate: '01/01/2024', spentOrEarned: '0đ', status: 'active', lockReason: '' }
        ];
    const initial = {
      users: defaultUsers,
      pendingProviders: [], skillApprovals: [], services: [], orders: [],
      reviews: [], complaints: [], reports: [], payouts: [],
      packages: [], packagePurchases: [], unlockRequests: []
    };
    try { localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(initial)); } catch (_) {}
    return initial;
  }

  function syncUserToAdminState(userData) {
    if (!userData || !userData.email) return null;

    if (typeof window.syncUserToAdminState === 'function' && window.syncUserToAdminState !== syncUserToAdminState) {
      try {
        return window.syncUserToAdminState(userData);
      } catch (_) {}
    }

    const state = getAdminStateSafe();
    const cleanEmail = String(userData.email || '').trim().toLowerCase();
    const uid = userData.uid ? String(userData.uid) : null;

    // Tìm xem tài khoản đã tồn tại chưa
    const existingIndex = state.users.findIndex(u => {
      const uEmail = String(u.email || '').trim().toLowerCase();
      const uUid = u.uid ? String(u.uid) : null;
      return (cleanEmail && uEmail === cleanEmail) || (uid && uUid === uid);
    });

    let targetUser;

    if (existingIndex !== -1) {
      // ĐÃ TỒN TẠI: Không tạo mới, không sinh ID mới, giữ nguyên role & status & balance
      const existing = state.users[existingIndex];
      if (typeof userData.balance === 'number') existing.balance = userData.balance;
      // The server profile is authoritative after sign-in. Keep the local Admin
      // mirror aligned so a stale cached role cannot make the UI send requests
      // under a different role than the API recognizes.
      if (['Admin', 'Customer', 'Provider'].includes(userData.role)) {
        existing.role = userData.role;
      }
      if (userData.id) existing.id = userData.id;
      if (uid && (!existing.uid || existing.uid !== uid)) {
        existing.uid = uid;
      }
      if (userData.authProvider && !existing.authProvider) {
        existing.authProvider = userData.authProvider;
      }
      if (userData.avatar && (!existing.avatar || existing.avatar.includes('unsplash'))) {
        existing.avatar = userData.avatar;
      }
      if (userData.name && (!existing.name || existing.name.includes('@'))) {
        existing.name = String(userData.name).trim();
      }
      if (userData.phone && !existing.phone) {
        existing.phone = String(userData.phone).trim();
      }
      targetUser = existing;
    } else {
      // TÀI KHOẢN MỚI: Sinh ID USRxxx tiếp theo ổn định
      const maxNum = state.users.reduce((m, u) => {
        const match = /^USR(\d+)$/.exec(u.id || '');
        return match ? Math.max(m, parseInt(match[1], 10)) : m;
      }, 0);
      const assignedId = userData.id || `USR${String(maxNum + 1).padStart(3, '0')}`;

      const now = new Date();
      const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

      // Bảo mật: Người dùng mới chỉ được chọn Provider hoặc Customer, không được tự nâng Admin
      const requestedRole = userData.role || 'Customer';
      const safeRole = requestedRole === 'Provider' ? 'Provider' : 'Customer';

      targetUser = {
        id: assignedId,
        uid: uid || '',
        name: String(userData.name || '').trim() || cleanEmail.split('@')[0],
        email: userData.email.trim(),
        phone: userData.phone ? String(userData.phone).trim() : '',
        role: safeRole,
        joinDate: userData.joinDate || dateStr,
        spentOrEarned: userData.spentOrEarned || '0đ',
        balance: typeof userData.balance === 'number' ? userData.balance : 0,
        status: userData.status || 'active',
        lockReason: userData.lockReason || '',
        lockDuration: userData.lockDuration || '',
        avatar: userData.avatar || '',
        authProvider: userData.authProvider || 'email'
      };

      state.users.push(targetUser);
    }

    try {
      localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(state));
      window.dispatchEvent(new CustomEvent('appStateUpdated', { detail: state }));
      window.dispatchEvent(new CustomEvent('skillrental:users-synced', { detail: { user: targetUser, state } }));
    } catch (err) {
      console.error('[SkillAuth] Lỗi lưu state:', err);
    }

    // Gửi thông báo ngầm sang backend nếu có
    try {
      const API_BASE = (typeof window !== 'undefined' && window.location.protocol.startsWith('http') && (window.location.port === '3000' || window.location.port === '')) ? '' : 'http://localhost:3000';
      if (typeof fetch !== 'undefined') {
        fetch(`${API_BASE}/api/admin/state`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(state)
        }).catch(() => {});
      }
    } catch (_) {}

    return targetUser;
  }

  window.syncUserToAdminState = syncUserToAdminState;

  function getEmailActionCodeSettings() {
    try {
      const origin = window.location.origin;
      const targetUrl = (origin && origin.startsWith('http'))
        ? `${origin}/verify.html`
        : 'https://skillrental-30a5e.firebaseapp.com/verify.html';
      return {
        url: targetUrl,
        handleCodeInApp: false
      };
    } catch (_) {
      return undefined;
    }
  }

  // ============================================================================
  // 5. SKILLAUTH CORE API
  // ============================================================================
  window.SkillAuth = {
    syncUserToAdminState,
    getEmailActionCodeSettings,

    // A. ĐĂNG KÝ (Tạo Firebase Auth -> Tạo Profile Firestore -> Gửi Email Xác Nhận -> Đồng bộ Admin)
    async register({ name, email, phone, password, role }) {
      if (!name || !email || !password) {
        return { success: false, message: 'Vui lòng điền đầy đủ họ tên, email và mật khẩu!' };
      }
      if (password.length < 6) {
        return { success: false, message: 'Mật khẩu phải có ít nhất 6 ký tự!' };
      }

      const cleanEmail = String(email).trim().toLowerCase();

      // Kiểm tra tài khoản đã tồn tại trong danh sách hệ thống chưa
      const state = getAdminStateSafe();
      const existing = (state.users || []).find(u => String(u.email || '').trim().toLowerCase() === cleanEmail);
      if (existing) {
        return { success: false, message: 'Email này đã được sử dụng trên hệ thống! Vui lòng chọn Đăng Nhập hoặc Lấy Lại Mật Khẩu.' };
      }

      let cred = null;
      let fbUser = null;
      try {
        cred = await fbAuth.createUserWithEmailAndPassword(email.trim(), password);
        fbUser = cred.user;
        await fbUser.updateProfile({ displayName: name.trim() });
      } catch (err) {
        if (err && err.code === 'auth/email-already-in-use') {
          return fail(err, 'Email này đã được sử dụng trên hệ thống!');
        }
        console.warn('[SkillAuth] Firebase Auth lỗi, tiếp tục chế độ demo:', err);
      }

      let data = null;
      if (fbUser) {
        try {
          const token = await fbUser.getIdToken();
          data = await callApi('/api/auth/register', 'POST', token, {
            name: name.trim(),
            phone: phone ? phone.trim() : '',
            role: role === 'Provider' ? 'Provider' : 'Customer'
          });
        } catch (_) {}
      }

      const userToSync = (data && data.success && data.user) ? data.user : {
        name: name.trim(),
        email: email.trim(),
        phone: phone ? phone.trim() : '',
        role: role === 'Provider' ? 'Provider' : 'Customer',
        uid: fbUser ? fbUser.uid : '',
        authProvider: 'email'
      };

      // ĐỒNG BỘ VÀO LOCALSTORAGE CHO TRANG ADMIN
      const syncedUser = syncUserToAdminState(userToSync);

      // Gửi email xác nhận nếu có tài khoản Firebase Auth
      let sentVerification = false;
      if (fbUser) {
        try {
          const actionSettings = getEmailActionCodeSettings();
          try {
            await fbUser.sendEmailVerification(actionSettings);
          } catch (_) {
            await fbUser.sendEmailVerification();
          }
          sentVerification = true;
        } catch (e) {
          console.warn('[SkillAuth] Lỗi gửi email xác nhận:', e);
        } finally {
          try { await fbAuth.signOut(); } catch (_) {}
        }
      }

      return {
        success: true,
        verifyEmail: Boolean(fbUser),
        verificationSent: sentVerification,
        email: email.trim(),
        user: syncedUser,
        message: sentVerification
          ? `Firebase đã gửi liên kết kích hoạt tới ${email.trim()}. Hãy mở email, nhấn liên kết xác minh rồi quay lại đăng nhập.`
          : fbUser
            ? `Tài khoản đã được tạo nhưng chưa gửi được email kích hoạt tới ${email.trim()}. Hãy dùng nút Gửi lại email xác nhận.`
            : `Tài khoản demo đã được tạo cho ${email.trim()}; Firebase không khả dụng nên không có email kích hoạt.`
      };
    },

    // B. ĐĂNG NHẬP (Kiểm tra emailVerified -> Lấy token -> Đồng bộ hồ sơ -> Cập nhật Admin)
    async login(email, password) {
      if (!email || !password) {
        return { success: false, message: 'Vui lòng nhập đầy đủ email và mật khẩu!' };
      }

      let cred;
      try {
        cred = await fbAuth.signInWithEmailAndPassword(email.trim(), password);
        await cred.user.reload();
      } catch (err) {
        return fail(err, 'Đăng nhập thất bại!');
      }

      // Kiểm tra trạng thái xác nhận email
      if (!cred.user.emailVerified) {
        await fbAuth.signOut();
        return {
          success: false,
          code: 'EMAIL_NOT_VERIFIED',
          email: email.trim(),
          message: 'Tài khoản chưa được kích hoạt! Hãy bấm vào liên kết trong email xác nhận chúng tôi đã gửi tới ' + email.trim() + '.'
        };
      }

      const token = await cred.user.getIdToken(true);
      let data = null;
      try {
        data = await callApi('/api/auth/login', 'POST', token);
      } catch (_) {}

      const userToSync = (data && data.success && data.user) ? data.user : {
        uid: cred.user.uid,
        name: cred.user.displayName || email.split('@')[0],
        email: cred.user.email,
        phone: cred.user.phoneNumber || '',
        avatar: cred.user.photoURL || '',
        authProvider: 'email'
      };

      const finalUser = syncUserToAdminState(userToSync);

      localStorage.setItem(SESSION_KEY, JSON.stringify(finalUser));
      if (finalUser.role === 'Provider') {
        localStorage.setItem('SKILLRENTAL_PROVIDER_USER', JSON.stringify(finalUser));
      } else if (finalUser.role === 'Customer') {
        localStorage.setItem('SKILLRENTAL_CUSTOMER_USER', JSON.stringify(finalUser));
      }
      window.dispatchEvent(new CustomEvent('skillrental:auth-changed', { detail: { user: finalUser } }));
      return { success: true, user: finalUser };
    },

    // C. GỬI LẠI EMAIL XÁC NHẬN (Hỗ trợ cả client credentials hoặc server link)
    async resendVerification(email, password) {
      const cleanEmail = String(email || '').trim();
      if (!cleanEmail) {
        return { success: false, message: 'Vui lòng nhập email cần gửi lại xác nhận!' };
      }

      // Cách 1: Nếu có mật khẩu -> đăng nhập tạm rồi gửi qua Client SDK
      if (password) {
        try {
          const cred = await fbAuth.signInWithEmailAndPassword(cleanEmail, password);
          if (cred.user.emailVerified) {
            await fbAuth.signOut();
            return { success: true, alreadyVerified: true, message: 'Email đã được xác nhận rồi! Bạn có thể đăng nhập ngay.' };
          }
          const actionSettings = getEmailActionCodeSettings();
          try {
            await cred.user.sendEmailVerification(actionSettings);
          } catch (_) {
            await cred.user.sendEmailVerification();
          }
          await fbAuth.signOut();
          return { success: true, message: `Đã gửi lại email xác nhận tới ${cleanEmail}. Vui lòng kiểm tra hộp thư!` };
        } catch (err) {
          // Fallback sang API server
        }
      }

      // Cách 2: Gọi endpoint server tạo verification link qua Admin SDK
      const res = await callApi('/api/auth/resend-verification', 'POST', null, { email: cleanEmail });
      return res;
    },

    // D. QUÊN MẬT KHẨU / LẤY LẠI MẬT KHẨU
    async forgotPassword(email) {
      const cleanEmail = String(email || '').trim();
      if (!cleanEmail) {
        return { success: false, message: 'Vui lòng nhập địa chỉ email của bạn!' };
      }

      let clientSuccess = false;
      let errorMsg = null;

      try {
        const actionSettings = getEmailActionCodeSettings();
        try {
          await fbAuth.sendPasswordResetEmail(cleanEmail, actionSettings);
        } catch (_) {
          await fbAuth.sendPasswordResetEmail(cleanEmail);
        }
        clientSuccess = true;
      } catch (err) {
        if (err.code === 'auth/invalid-email') {
          return { success: false, message: 'Email không đúng định dạng.' };
        }
        if (err.code === 'auth/too-many-requests') {
          return { success: false, message: 'Bạn đã yêu cầu quá nhiều lần. Vui lòng chờ 2 phút rồi thử lại.' };
        }
        errorMsg = err.message;
      }

      // Gọi thêm server endpoint để dự phòng / hỗ trợ môi trường dev
      const serverRes = await callApi('/api/auth/forgot-password', 'POST', null, { email: cleanEmail });

      if (clientSuccess || serverRes.success) {
        return {
          success: true,
          message: `Liên kết khôi phục mật khẩu đã được gửi tới ${cleanEmail}. Vui lòng kiểm tra hộp thư đến (hoặc thư mục Spam/Quảng cáo).`,
          resetLink: serverRes.resetLink
        };
      }

      return { success: false, message: errorMsg || 'Không thể gửi email khôi phục mật khẩu lúc này. Vui lòng thử lại sau.' };
    },

    // E. ĐẶT LẠI MẬT KHẨU MỚI (Khi mở link reset từ email)
    async confirmPasswordReset(oobCode, newPassword) {
      if (!oobCode || !newPassword) {
        return { success: false, message: 'Thiếu mã xác thực hoặc mật khẩu mới.' };
      }
      if (newPassword.length < 6) {
        return { success: false, message: 'Mật khẩu mới phải có ít nhất 6 ký tự.' };
      }
      try {
        await fbAuth.confirmPasswordReset(oobCode, newPassword);
        return { success: true, message: 'Đặt lại mật khẩu thành công! Bạn có thể đăng nhập bằng mật khẩu mới.' };
      } catch (err) {
        return fail(err, 'Không thể đặt lại mật khẩu.');
      }
    },

    // F. XÁC NHẬN EMAIL QUA MÃ (Khi mở link verify từ email)
    async applyActionCode(oobCode) {
      if (!oobCode) return { success: false, message: 'Mã xác thực không hợp lệ.' };
      try {
        await fbAuth.applyActionCode(oobCode);
        return { success: true, message: 'Email của bạn đã được xác nhận thành công! Bạn có thể đăng nhập ngay.' };
      } catch (err) {
        return fail(err, 'Không thể xác nhận email.');
      }
    },

    // G. ĐĂNG XUẤT TOÀN DIỆN
    async logout() {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem('SKILLRENTAL_CUSTOMER_USER');
      localStorage.removeItem('SKILLRENTAL_PROVIDER_USER');
      try { await fbAuth.signOut(); } catch (_) {}
      window.dispatchEvent(new CustomEvent('skillrental:auth-changed', { detail: { user: null } }));
      window.dispatchEvent(new CustomEvent('skillrental:logout'));
      return { success: true };
    },

    // H. ĐĂNG NHẬP BẰNG GOOGLE (Đồng bộ tài khoản mới / liên kết tài khoản cũ với Admin)
    async loginWithGoogle(preferredRole) {
      try {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        const cred = await fbAuth.signInWithPopup(provider);

        // Lấy thông tin xác thực thực tế từ Google Auth
        const gUser = cred.user;
        const token = await gUser.getIdToken(true);

        let data = null;
        try {
          data = await callApi('/api/auth/login', 'POST', token);
        } catch (_) {}

        let userToSync;
        if (data && data.success && data.user) {
          userToSync = data.user;
          if (gUser.photoURL && (!userToSync.avatar || userToSync.avatar.includes('unsplash'))) {
            userToSync.avatar = gUser.photoURL;
          }
          if (gUser.uid) userToSync.uid = gUser.uid;
        } else {
          userToSync = {
            uid: gUser.uid,
            name: gUser.displayName || (gUser.email ? gUser.email.split('@')[0] : 'Người dùng'),
            email: gUser.email,
            phone: gUser.phoneNumber || '',
            avatar: gUser.photoURL || '',
            role: (preferredRole === 'Provider' || preferredRole === 'Customer') ? preferredRole : 'Customer',
            authProvider: 'google'
          };
        }

        // ĐỒNG BỘ VÀO LOCALSTORAGE CHO TRANG ADMIN:
        // - Người dùng mới: Tạo hồ sơ USRxxx mới, xuất hiện ngay trong Admin
        // - Người dùng đã có (thông thường hoặc Google trước): Giữ nguyên ID, giữ nguyên Role, liên kết an toàn
        const finalUser = syncUserToAdminState(userToSync);

        localStorage.setItem(SESSION_KEY, JSON.stringify(finalUser));
      if (finalUser.role === 'Provider') {
        localStorage.setItem('SKILLRENTAL_PROVIDER_USER', JSON.stringify(finalUser));
      } else if (finalUser.role === 'Customer') {
        localStorage.setItem('SKILLRENTAL_CUSTOMER_USER', JSON.stringify(finalUser));
      }
        window.dispatchEvent(new CustomEvent('skillrental:auth-changed', { detail: { user: finalUser } }));
        return { success: true, user: finalUser };
      } catch (err) {
        return fail(err, 'Đăng nhập bằng Google thất bại!');
      }
    },

    // I. HOÀN TẤT ĐĂNG KÝ HỒ SƠ GOOGLE
    async registerGoogleProfile(role, googleUser) {
      try {
        let data = null;
        if (googleUser && googleUser.token) {
          try {
            data = await callApi('/api/auth/register', 'POST', googleUser.token, {
              name: googleUser.name,
              phone: googleUser.phone,
              role
            });
          } catch (_) {}
        }

        const safeRole = role === 'Provider' ? 'Provider' : 'Customer';
        const userToSync = (data && data.success && data.user) ? data.user : {
          uid: googleUser.uid || '',
          name: googleUser.name,
          email: googleUser.email,
          phone: googleUser.phone || '',
          role: safeRole,
          avatar: googleUser.avatar || '',
          authProvider: 'google'
        };

        const finalUser = syncUserToAdminState(userToSync);
        localStorage.setItem(SESSION_KEY, JSON.stringify(finalUser));
      if (finalUser.role === 'Provider') {
        localStorage.setItem('SKILLRENTAL_PROVIDER_USER', JSON.stringify(finalUser));
      } else if (finalUser.role === 'Customer') {
        localStorage.setItem('SKILLRENTAL_CUSTOMER_USER', JSON.stringify(finalUser));
      }
        window.dispatchEvent(new CustomEvent('skillrental:auth-changed', { detail: { user: finalUser } }));
        return { success: true, user: finalUser };
      } catch (err) {
        return fail(err, 'Không thể tạo hồ sơ Google!');
      }
    },

    // J. CẬP NHẬT THÔNG TIN CÁ NHÂN
    async updateProfile({ name, phone, address, avatar, role }) {
      if (!name || !String(name).trim()) {
        return { success: false, message: 'Vui lòng nhập họ và tên!' };
      }
      const user = fbAuth.currentUser;
      const token = user ? await user.getIdToken() : null;
      const res = await callApi('/api/auth/profile', 'PUT', token, { name, phone, address, avatar, role });
      if (res.success && res.user) {
        localStorage.setItem(SESSION_KEY, JSON.stringify(res.user));
        if (res.user.role === 'Customer') {
          localStorage.setItem('SKILLRENTAL_CUSTOMER_USER', JSON.stringify(res.user));
        } else if (res.user.role === 'Provider') {
          localStorage.setItem('SKILLRENTAL_PROVIDER_USER', JSON.stringify(res.user));
        }
        window.dispatchEvent(new CustomEvent('skillrental:auth-changed', { detail: { user: res.user } }));
      }
      return res;
    },

    // K. LẤY USER ĐANG ĐĂNG NHẬP
    getCurrentUser() {
      try {
        const raw = localStorage.getItem(SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (_) {
        return null;
      }
    }
  };

  // ============================================================================
  // 6. GIAO DIỆN AUTH MODAL ĐỒNG BỘ TOÀN SÀN (INJECT HTML & CSS)
  // ============================================================================

  const MODAL_CSS = `
  /* SKILLRENTAL AUTH MODAL STYLES */
  .sr-auth-overlay {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.72);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    z-index: 99999;
    display: none;
    align-items: center;
    justify-content: center;
    padding: 16px;
    opacity: 0;
    transition: opacity 0.25s ease;
    box-sizing: border-box;
  }
  .sr-auth-overlay.active {
    display: flex;
    opacity: 1;
  }
  .sr-auth-card {
    background: #FFFFFF;
    border-radius: 20px;
    width: 100%;
    max-width: 480px;
    max-height: 92vh;
    overflow-y: auto;
    box-shadow: 0 25px 50px -12px rgba(15, 23, 42, 0.45);
    border: 1px solid #E2E8F0;
    position: relative;
    transform: translateY(20px) scale(0.97);
    transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    box-sizing: border-box;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  }
  .sr-auth-overlay.active .sr-auth-card {
    transform: translateY(0) scale(1);
  }
  .sr-auth-close {
    position: absolute;
    top: 14px;
    right: 14px;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.2);
    color: #FFFFFF;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    transition: background 0.15s;
    z-index: 10;
  }
  .sr-auth-close:hover {
    background: rgba(255, 255, 255, 0.35);
  }
  .sr-auth-header {
    background: linear-gradient(135deg, #0F172A 0%, #15803D 100%);
    color: #FFFFFF;
    padding: 26px 28px;
    border-top-left-radius: 19px;
    border-top-right-radius: 19px;
  }
  .sr-auth-header h4 {
    font-size: 20px;
    font-weight: 800;
    margin: 0 0 6px;
    letter-spacing: -0.3px;
  }
  .sr-auth-header p {
    font-size: 13px;
    color: #DCFCE7;
    margin: 0;
    line-height: 1.45;
  }
  .sr-auth-tabs {
    display: flex;
    border-bottom: 1px solid #E2E8F0;
    background: #F8FAFC;
  }
  .sr-auth-tab-btn {
    flex: 1;
    padding: 13px;
    text-align: center;
    font-size: 14px;
    font-weight: 700;
    color: #64748B;
    border: none;
    background: transparent;
    cursor: pointer;
    border-bottom: 3px solid transparent;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }
  .sr-auth-tab-btn.active {
    color: #16A34A;
    background: #FFFFFF;
    border-bottom-color: #16A34A;
  }
  .sr-auth-body {
    padding: 24px 28px 28px;
  }
  .sr-form-group {
    margin-bottom: 16px;
    position: relative;
  }
  .sr-form-group label {
    display: block;
    font-size: 13px;
    font-weight: 600;
    color: #0F172A;
    margin-bottom: 6px;
  }
  .sr-input-wrap {
    position: relative;
    display: flex;
    align-items: center;
  }
  .sr-form-control {
    width: 100%;
    height: 42px;
    padding: 0 14px;
    border: 1px solid #E2E8F0;
    border-radius: 9px;
    font-size: 14px;
    font-family: inherit;
    color: #0F172A;
    background: #FFFFFF;
    transition: border-color 0.15s, box-shadow 0.15s;
    box-sizing: border-box;
    outline: none;
  }
  .sr-form-control:focus {
    border-color: #16A34A;
    box-shadow: 0 0 0 3px rgba(22, 163, 74, 0.15);
  }
  .sr-pwd-toggle {
    position: absolute;
    right: 10px;
    background: none;
    border: none;
    color: #94A3B8;
    cursor: pointer;
    font-size: 15px;
    padding: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.15s;
  }
  .sr-pwd-toggle:hover {
    color: #0F172A;
  }
  .sr-btn-primary {
    width: 100%;
    height: 44px;
    background: #16A34A;
    color: #FFFFFF;
    border: none;
    border-radius: 9px;
    font-weight: 700;
    font-size: 14px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: background 0.15s, transform 0.1s;
  }
  .sr-btn-primary:hover:not(:disabled) {
    background: #15803D;
  }
  .sr-btn-primary:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }
  .sr-btn-outline {
    width: 100%;
    height: 42px;
    background: #FFFFFF;
    color: #0F172A;
    border: 1px solid #E2E8F0;
    border-radius: 9px;
    font-weight: 600;
    font-size: 14px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: all 0.15s;
  }
  .sr-btn-outline:hover {
    background: #F8FAFC;
    border-color: #CBD5E1;
  }
  .sr-role-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-top: 6px;
  }
  .sr-role-card {
    border: 1.5px solid #E2E8F0;
    border-radius: 10px;
    padding: 10px 12px;
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    color: #334155;
    transition: all 0.15s;
    user-select: none;
  }
  .sr-role-card:has(input:checked) {
    border-color: #16A34A;
    background: #F0FDF4;
    color: #166534;
  }
  .sr-role-card input {
    accent-color: #16A34A;
  }
  .sr-alert-box {
    padding: 12px 14px;
    border-radius: 10px;
    font-size: 13px;
    line-height: 1.45;
    margin-bottom: 14px;
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }
  .sr-alert-warning {
    background: #FEF3C7;
    border: 1px solid #FCD34D;
    color: #92400E;
  }
  .sr-alert-success {
    background: #DCFCE7;
    border: 1px solid #86EFAC;
    color: #166534;
  }
  .sr-alert-info {
    background: #EFF6FF;
    border: 1px solid #BFDBFE;
    color: #1E40AF;
  }
  /* ============================================================
   * EMAIL VERIFICATION UI (PREMIUM REDESIGN)
   * ============================================================ */
  .verify-notice-container {
    padding: 6px 0 4px;
    text-align: center;
    animation: verifyFadeInUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
  @keyframes verifyFadeInUp {
    from { opacity: 0; transform: translateY(12px) scale(0.98); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  .verify-hero-wrapper {
    position: relative;
    width: 76px;
    height: 76px;
    margin: 0 auto 16px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .verify-pulse-ring {
    position: absolute;
    inset: -6px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(22, 163, 74, 0.3) 0%, rgba(22, 163, 74, 0) 70%);
    animation: verifyPulseRing 2.2s cubic-bezier(0.24, 0, 0.38, 1) infinite;
  }
  @keyframes verifyPulseRing {
    0% { transform: scale(0.85); opacity: 0.9; }
    50% { transform: scale(1.2); opacity: 0.25; }
    100% { transform: scale(0.85); opacity: 0.9; }
  }
  .verify-hero-icon {
    position: relative;
    width: 68px;
    height: 68px;
    border-radius: 20px;
    background: linear-gradient(135deg, #22C55E 0%, #16A34A 50%, #15803D 100%);
    color: #FFFFFF;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 28px;
    box-shadow: 0 10px 25px -4px rgba(22, 163, 74, 0.45), inset 0 1px 1px rgba(255, 255, 255, 0.35);
    animation: verifyFloat 3s ease-in-out infinite;
  }
  @keyframes verifyFloat {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-4px); }
  }
  .verify-badge-check {
    position: absolute;
    bottom: -2px;
    right: -2px;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: #FFFFFF;
    color: #16A34A;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 900;
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.15);
    border: 2px solid #FFFFFF;
  }
  .verify-heading {
    font-size: 20px;
    font-weight: 800;
    color: #0F172A;
    letter-spacing: -0.4px;
    margin: 0 0 6px;
  }
  .verify-lead {
    font-size: 13px;
    color: #64748B;
    line-height: 1.5;
    margin: 0 0 14px;
  }
  .verify-email-card {
    background: linear-gradient(180deg, #F0FDF4 0%, #DCFCE7 100%);
    border: 1.5px solid #86EFAC;
    border-radius: 12px;
    padding: 10px 14px;
    display: flex;
    align-items: center;
    gap: 12px;
    text-align: left;
    margin-bottom: 12px;
    box-shadow: 0 2px 6px rgba(22, 163, 74, 0.08);
  }
  .verify-email-avatar {
    width: 38px;
    height: 38px;
    border-radius: 10px;
    background: #FFFFFF;
    color: #16A34A;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    box-shadow: 0 2px 4px rgba(22, 163, 74, 0.12);
    flex-shrink: 0;
  }
  .verify-email-info {
    flex: 1;
    min-width: 0;
  }
  .verify-email-tag {
    display: block;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.6px;
    color: #15803D;
    text-transform: uppercase;
    margin-bottom: 2px;
  }
  .verify-email-text {
    display: block;
    font-size: 14px;
    font-weight: 700;
    color: #0F172A;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .verify-copy-btn {
    background: #FFFFFF;
    border: 1px solid #BBF7D0;
    color: #16A34A;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 13px;
    transition: all 0.15s ease;
    flex-shrink: 0;
  }
  .verify-copy-btn:hover {
    background: #16A34A;
    color: #FFFFFF;
    border-color: #16A34A;
  }
  .verify-mailbox-action {
    margin-bottom: 12px;
  }
  .btn-open-inbox {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    height: 40px;
    background: #FFFFFF;
    border: 1.5px solid #CBD5E1;
    border-radius: 10px;
    color: #0F172A;
    font-size: 13px;
    font-weight: 700;
    text-decoration: none;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  }
  .btn-open-inbox:hover {
    border-color: #16A34A;
    color: #16A34A;
    box-shadow: 0 4px 12px rgba(22, 163, 74, 0.15);
    transform: translateY(-1px);
  }
  .inbox-external-icon {
    font-size: 11px;
    opacity: 0.6;
  }
  .verify-guide-card {
    background: #F8FAFC;
    border: 1px solid #E2E8F0;
    border-radius: 12px;
    padding: 12px 14px;
    text-align: left;
    margin-bottom: 12px;
  }
  .verify-guide-header {
    font-size: 12px;
    font-weight: 700;
    color: #334155;
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  .verify-steps-list {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  .verify-step {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-size: 12.5px;
    color: #475569;
    line-height: 1.45;
  }
  .verify-step-number {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #DCFCE7;
    color: #16A34A;
    font-size: 11px;
    font-weight: 800;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-top: 1px;
  }
  .verify-tip-alert {
    background: #EFF6FF;
    border: 1px solid #BFDBFE;
    color: #1E40AF;
    border-radius: 10px;
    padding: 10px 12px;
    font-size: 12px;
    line-height: 1.45;
    text-align: left;
    display: flex;
    align-items: flex-start;
    gap: 9px;
    margin-bottom: 14px;
  }
  .verify-tip-alert .tip-icon {
    color: #3B82F6;
    font-size: 14px;
    margin-top: 2px;
    flex-shrink: 0;
  }
  .verify-action-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 12px;
  }
  .verify-login-btn {
    width: 100%;
    height: 44px;
    background: linear-gradient(135deg, #16A34A 0%, #15803D 100%) !important;
    color: #FFFFFF !important;
    border: none !important;
    border-radius: 10px !important;
    font-size: 14px !important;
    font-weight: 700 !important;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    cursor: pointer;
    box-shadow: 0 4px 14px rgba(22, 163, 74, 0.35);
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .verify-login-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 18px rgba(22, 163, 74, 0.45);
  }
  .verify-resend-btn {
    width: 100%;
    height: 40px;
    background: #FFFFFF !important;
    border: 1px solid #CBD5E1 !important;
    border-radius: 10px !important;
    color: #334155 !important;
    font-size: 13px !important;
    font-weight: 600 !important;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .verify-resend-btn:hover {
    border-color: #16A34A !important;
    color: #16A34A !important;
    background: #F0FDF4 !important;
  }
  .verify-alt-nav {
    font-size: 12.5px;
    color: #64748B;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    margin-top: 4px;
  }
  .verify-alt-link {
    color: #16A34A;
    font-weight: 700;
    text-decoration: none;
  }
  .verify-alt-link:hover {
    text-decoration: underline;
  }
  .sr-toast-container {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 100000;
    display: flex;
    flex-direction: column;
    gap: 10px;
    pointer-events: none;
  }
  .sr-toast {
    pointer-events: auto;
    background: #FFFFFF;
    border-radius: 10px;
    padding: 14px 18px;
    box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.2);
    border-left: 5px solid #16A34A;
    display: flex;
    align-items: flex-start;
    gap: 12px;
    max-width: 360px;
    animation: srSlideIn 0.25s ease forwards;
    font-family: inherit;
  }
  .sr-toast.error { border-left-color: #EF4444; }
  .sr-toast.warning { border-left-color: #F59E0B; }
  .sr-toast.info { border-left-color: #3B82F6; }
  @keyframes srSlideIn {
    from { opacity: 0; transform: translateX(30px); }
    to { opacity: 1; transform: translateX(0); }
  }
  `;

  // Inject CSS vào document
  function injectStyles() {
    if (document.getElementById('sr-auth-styles')) return;
    const style = document.createElement('style');
    style.id = 'sr-auth-styles';
    style.textContent = MODAL_CSS;
    document.head.appendChild(style);
  }

  // Toast thông báo thống nhất
  window.showToastMsg = function (title, message, type = 'info') {
    let container = document.getElementById('srToastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'srToastContainer';
      container.className = 'sr-toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `sr-toast ${type}`;

    let icon = '<i class="fa-solid fa-circle-check" style="color:#16A34A; font-size:18px;"></i>';
    if (type === 'error') icon = '<i class="fa-solid fa-circle-xmark" style="color:#EF4444; font-size:18px;"></i>';
    else if (type === 'warning') icon = '<i class="fa-solid fa-triangle-exclamation" style="color:#F59E0B; font-size:18px;"></i>';
    else if (type === 'info') icon = '<i class="fa-solid fa-circle-info" style="color:#3B82F6; font-size:18px;"></i>';

    toast.innerHTML = `
      ${icon}
      <div style="flex:1;">
        <div style="font-weight:700; font-size:14px; color:#0F172A; margin-bottom:2px;">${title}</div>
        <div style="font-size:13px; color:#475569; line-height:1.4;">${message || ''}</div>
      </div>
    `;

    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4500);
  };
  // Tương thích với các trang gọi showToast
  window.showToast = window.showToastMsg;

  // Toggle hiện/ẩn mật khẩu
  window.togglePasswordVisibility = function (inputId, btnEl) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const isPwd = input.type === 'password';
    input.type = isPwd ? 'text' : 'password';
    if (btnEl) {
      btnEl.innerHTML = isPwd ? '<i class="fa-solid fa-eye-slash"></i>' : '<i class="fa-solid fa-eye"></i>';
    }
  };

  // Điều hướng sau khi đăng nhập theo vai trò
  window.redirectAfterLogin = function (user) {
    if (!user) return;
    if (user.role === 'Admin') {
      window.location.href = 'admin.html';
    } else if (user.role === 'Provider') {
      window.location.href = 'dashboard.html';
    } else {
      // Khách hàng: nếu đang ở các trang con thì reload để cập nhật user, ngược lại về customer.html
      const path = window.location.pathname.toLowerCase();
      if (path.includes('customer_') || path.includes('find_provider')) {
        window.location.reload();
      } else {
        window.location.href = 'customer.html';
      }
    }
  };

  // Đăng xuất toàn cầu
  window.handleLogout = async function () {
    if (confirm('Bạn có chắc chắn muốn đăng xuất khỏi tài khoản?')) {
      await SkillAuth.logout();
      showToastMsg('Đã Đăng Xuất', 'Bạn đã đăng xuất thành công khỏi hệ thống.', 'success');
      setTimeout(() => {
        window.location.href = 'index.html?auth=login';
      }, 350);
    }
  };
  window.customerLogout = window.handleLogout;
  window.handleCustomerLogout = window.handleLogout;

  // Điền nhanh thông tin và đăng nhập mẫu
  window.quickFillAndLogin = function (email, password) {
    openAuthModal('login');
    setTimeout(() => {
      const emailInput = document.getElementById('loginEmail');
      const pwdInput = document.getElementById('loginPassword');
      if (emailInput) emailInput.value = email;
      if (pwdInput) pwdInput.value = password;
      const form = document.getElementById('loginForm');
      if (form) {
        if (typeof form.requestSubmit === 'function') form.requestSubmit();
        else handleModalLogin(new Event('submit'));
      }
    }, 150);
  };

  // Tạo và nhúng Modal HTML vào DOM nếu chưa có
  function injectModalHtml() {
    if (document.getElementById('authModal')) return;

    injectStyles();

    const modalDiv = document.createElement('div');
    modalDiv.id = 'authModal';
    modalDiv.className = 'sr-auth-overlay';
    modalDiv.onclick = function (e) {
      if (e.target.id === 'authModal') closeAuthModal();
    };

    modalDiv.innerHTML = `
    <div class="sr-auth-card" id="authModalCard">
      <button type="button" class="sr-auth-close" onclick="closeAuthModal()" title="Đóng">
        <i class="fa-solid fa-xmark"></i>
      </button>

      <div class="sr-auth-header">
        <h4 id="modalBannerTitle">Chào Mừng Đến Với SkillRental</h4>
        <p id="modalBannerSubtitle">Đăng nhập để thuê kỹ năng hoặc cung cấp dịch vụ chuyên gia</p>
      </div>

      <div class="sr-auth-tabs" id="authTabsContainer">
        <button type="button" class="sr-auth-tab-btn active" id="tabLoginBtn" onclick="switchAuthTab('login')">
          <i class="fa-solid fa-arrow-right-to-bracket"></i> Đăng Nhập
        </button>
        <button type="button" class="sr-auth-tab-btn" id="tabRegisterBtn" onclick="switchAuthTab('register')">
          <i class="fa-solid fa-user-plus"></i> Đăng Ký
        </button>
      </div>

      <div class="sr-auth-body">
        <!-- 1. FORM ĐĂNG NHẬP -->
        <form id="loginForm" onsubmit="handleModalLogin(event)">
          <div id="loginAlertBox" style="display:none;"></div>

          <div class="sr-form-group">
            <label for="loginEmail">Email / Tài khoản</label>
            <input type="email" id="loginEmail" class="sr-form-control" placeholder="name@example.com" required autocomplete="email">
          </div>

          <div class="sr-form-group">
            <label for="loginPassword">Mật khẩu</label>
            <div class="sr-input-wrap">
              <input type="password" id="loginPassword" class="sr-form-control" placeholder="••••••••" required autocomplete="current-password">
              <button type="button" class="sr-pwd-toggle" onclick="togglePasswordVisibility('loginPassword', this)">
                <i class="fa-solid fa-eye"></i>
              </button>
            </div>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; margin:-4px 0 14px;">
            <label style="font-size:13px; color:#64748B; display:flex; align-items:center; gap:6px; cursor:pointer;">
              <input type="checkbox" id="loginRememberMe" checked> Ghi nhớ
            </label>
            <a href="javascript:void(0)" onclick="switchAuthTab('forgot')" style="font-size:13px; font-weight:600; color:#16A34A; text-decoration:none;">Quên mật khẩu?</a>
          </div>

          <button type="submit" class="sr-btn-primary" id="loginSubmitBtn">
            <i class="fa-solid fa-arrow-right-to-bracket"></i> Đăng Nhập Ngay
          </button>

          <div style="text-align:center; margin:16px 0; font-size:12px; color:#94A3B8; position:relative;">
            <hr style="border:none; border-top:1px solid #E2E8F0; position:absolute; top:50%; width:100%; margin:0; z-index:1;">
            <span style="background:#FFF; padding:0 12px; position:relative; z-index:2;">HOẶC TIẾP TỤC VỚI</span>
          </div>

          <button type="button" class="sr-btn-outline" onclick="handleGoogleLogin(event)" style="margin-bottom:12px;">
            <i class="fa-brands fa-google" style="color:#DB4437; font-size:16px;"></i> Đăng Nhập Bằng Google
          </button>
        </form>

        <!-- 2. FORM ĐĂNG KÝ -->
        <form id="registerForm" onsubmit="handleModalRegister(event)" style="display:none;">
          <div class="sr-form-group">
            <label for="regName">Họ và tên của bạn</label>
            <input type="text" id="regName" class="sr-form-control" placeholder="Nguyễn Văn A" required autocomplete="name">
          </div>

          <div class="sr-form-group">
            <label for="regEmail">Địa chỉ Email</label>
            <input type="email" id="regEmail" class="sr-form-control" placeholder="name@example.com" required autocomplete="email">
          </div>

          <div class="sr-form-group">
            <label for="regPhone">Số điện thoại liên hệ</label>
            <input type="tel" id="regPhone" class="sr-form-control" placeholder="0912 345 678" required autocomplete="tel">
          </div>

          <div class="sr-form-group">
            <label for="regPassword">Mật khẩu khởi tạo</label>
            <div class="sr-input-wrap">
              <input type="password" id="regPassword" class="sr-form-control" placeholder="Tối thiểu 6 ký tự" minlength="6" required autocomplete="new-password">
              <button type="button" class="sr-pwd-toggle" onclick="togglePasswordVisibility('regPassword', this)">
                <i class="fa-solid fa-eye"></i>
              </button>
            </div>
          </div>

          <div class="sr-form-group">
            <label>Bạn tham gia sàn với vai trò gì?</label>
            <div class="sr-role-grid">
              <label class="sr-role-card">
                <input type="radio" name="regRole" value="Customer" checked>
                <span><i class="fa-solid fa-user" style="color:#16A34A;"></i> Khách hàng</span>
              </label>
              <label class="sr-role-card">
                <input type="radio" name="regRole" value="Provider">
                <span><i class="fa-solid fa-briefcase" style="color:#0F172A;"></i> Chuyên gia</span>
              </label>
            </div>
          </div>

          <button type="submit" class="sr-btn-primary" id="registerSubmitBtn" style="margin-top:10px;">
            <i class="fa-solid fa-user-plus"></i> Hoàn Tất Đăng Ký
          </button>

          <div style="text-align:center; margin:16px 0; font-size:12px; color:#94A3B8; position:relative;">
            <hr style="border:none; border-top:1px solid #E2E8F0; position:absolute; top:50%; width:100%; margin:0; z-index:1;">
            <span style="background:#FFF; padding:0 12px; position:relative; z-index:2;">HOẶC ĐĂNG KÝ NHANH</span>
          </div>

          <button type="button" class="sr-btn-outline" onclick="handleGoogleLogin(event, true)" style="margin-bottom:12px;">
            <i class="fa-brands fa-google" style="color:#DB4437; font-size:16px;"></i> Đăng Ký Nhanh Bằng Google
          </button>

          <div style="text-align:center; margin-top:14px; font-size:13px; color:#64748B;">
            Đã có tài khoản? <a href="javascript:void(0)" onclick="switchAuthTab('login')" style="color:#16A34A; font-weight:700; text-decoration:none;">Đăng nhập ngay</a>
          </div>
        </form>

        <!-- 3. FORM LẤY LẠI MẬT KHẨU -->
        <form id="forgotForm" onsubmit="handleModalForgotPassword(event)" style="display:none;">
          <div class="sr-alert-box sr-alert-info">
            <i class="fa-solid fa-shield-halved" style="font-size:18px; margin-top:2px;"></i>
            <div>Nhập địa chỉ email tài khoản của bạn. Hệ thống sẽ gửi email chứa liên kết an toàn để bạn tự tạo mật khẩu mới.</div>
          </div>

          <div id="forgotResultBox" style="display:none;"></div>

          <div class="sr-form-group">
            <label for="forgotEmail">Email đã đăng ký</label>
            <input type="email" id="forgotEmail" class="sr-form-control" placeholder="name@example.com" required autocomplete="email">
          </div>

          <button type="submit" class="sr-btn-primary" id="forgotSubmitBtn">
            <i class="fa-solid fa-paper-plane"></i> Gửi Liên Kết Khôi Phục
          </button>

          <div style="text-align:center; margin-top:16px;">
            <a href="javascript:void(0)" onclick="switchAuthTab('login')" style="font-size:13px; font-weight:700; color:#64748B; text-decoration:none; display:inline-flex; align-items:center; gap:6px;">
              <i class="fa-solid fa-arrow-left"></i> Quay lại Đăng Nhập
            </a>
          </div>
        </form>

        <!-- 4. THÔNG BÁO CHỜ XÁC NHẬN EMAIL (MODERN REDESIGN) -->
        <div id="verifyNoticeBox" class="verify-notice-container" style="display:none;">
          <!-- Animated Hero Icon -->
          <div class="verify-hero-wrapper">
            <div class="verify-pulse-ring"></div>
            <div class="verify-hero-icon">
              <i class="fa-solid fa-paper-plane"></i>
            </div>
            <div class="verify-badge-check">
              <i class="fa-solid fa-check"></i>
            </div>
          </div>

          <h4 class="verify-heading">Kiểm Tra Hộp Thư Của Bạn</h4>
          <p class="verify-lead">
            Hệ thống đã gửi liên kết kích hoạt an toàn đến:
          </p>

          <!-- Recipient Email Card with Copy Button -->
          <div class="verify-email-card">
            <div class="verify-email-avatar">
              <i class="fa-solid fa-envelope"></i>
            </div>
            <div class="verify-email-info">
              <span class="verify-email-tag">ĐỊA CHỈ NHẬN THƯ</span>
              <span class="verify-email-text" id="verifyNoticeEmail">email@example.com</span>
            </div>
            <button type="button" class="verify-copy-btn" id="btnCopyVerifyEmail" onclick="copyVerifyEmail()" title="Sao chép email">
              <i class="fa-regular fa-copy"></i>
            </button>
          </div>

          <!-- 1-Click Direct Webmail Shortcut -->
          <div class="verify-mailbox-action" id="verifyMailboxAction">
            <a href="https://mail.google.com" target="_blank" rel="noopener noreferrer" class="btn-open-inbox" id="btnOpenInbox">
              <i class="fa-brands fa-google" id="inboxProviderIcon" style="color:#EA4335;"></i>
              <span id="inboxProviderText">Mở Hộp Thư Gmail</span>
              <i class="fa-solid fa-arrow-up-right-from-square inbox-external-icon"></i>
            </a>
          </div>

          <!-- 3-Step Clear Action Guide -->
          <div class="verify-guide-card">
            <div class="verify-guide-header">
              <i class="fa-solid fa-list-check"></i>
              <span>3 bước kích hoạt tài khoản:</span>
            </div>
            <div class="verify-steps-list">
              <div class="verify-step">
                <div class="verify-step-number">1</div>
                <div class="verify-step-desc">Mở hộp thư đến (Inbox) từ hệ thống SkillRental.</div>
              </div>
              <div class="verify-step">
                <div class="verify-step-number">2</div>
                <div class="verify-step-desc">Bấm nút <strong>Verify your email</strong> (hoặc nhấn link xác minh).</div>
              </div>
              <div class="verify-step">
                <div class="verify-step-number">3</div>
                <div class="verify-step-desc">Quay lại đây và nhấn <strong>Đăng nhập ngay</strong>.</div>
              </div>
            </div>
          </div>

          <!-- Tip Alert Box -->
          <div class="verify-tip-alert" id="verifyNoticeMessage">
            <i class="fa-solid fa-lightbulb tip-icon"></i>
            <div>
              <strong>Chưa thấy thư?</strong> Vui lòng kiểm tra thêm mục <b>Spam (Thư rác)</b> hoặc <b>Quảng cáo</b>. Nếu vẫn chưa nhận được, hãy dùng nút gửi lại bên dưới.
            </div>
          </div>

          <!-- Primary & Secondary CTA Buttons -->
          <div class="verify-action-group">
            <button type="button" class="btn btn-primary btn-block verify-login-btn" onclick="switchAuthTab('login')">
              <i class="fa-solid fa-arrow-right-to-bracket"></i>
              <span>Tôi Đã Xác Nhận, Đăng Nhập Ngay</span>
            </button>

            <button type="button" class="btn btn-outline btn-block verify-resend-btn" id="btnResendVerification" onclick="triggerResendVerification()">
              <i class="fa-solid fa-rotate-right"></i>
              <span>Gửi Lại Email Xác Nhận</span>
            </button>
          </div>

          <div class="verify-alt-nav">
            <span>Nhập sai email?</span>
            <a href="javascript:void(0)" onclick="switchAuthTab('register')" class="verify-alt-link">
              Đăng ký lại
            </a>
          </div>
        </div>
      </div>
    </div>
    `;

    document.body.appendChild(modalDiv);
  }

  // ============================================================================
  // 7. CÁC HÀM XỬ LÝ SỰ KIỆN TRÊN MODAL
  // ============================================================================

  window.openAuthModal = function (tab = 'login', options = {}) {
    injectModalHtml();
    const modal = document.getElementById('authModal');
    if (!modal) return;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    switchAuthTab(tab);

    if (options.email) {
      const emailInput = document.getElementById(tab === 'forgot' ? 'forgotEmail' : 'loginEmail');
      if (emailInput) emailInput.value = options.email;
    }
  };

  window.closeAuthModal = function () {
    const modal = document.getElementById('authModal');
    if (modal) {
      modal.classList.remove('active');
      document.body.style.overflow = '';
    }
  };

  window.switchAuthTab = function (tab) {
    injectModalHtml();

    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const forgotForm = document.getElementById('forgotForm');
    const verifyNotice = document.getElementById('verifyNoticeBox');
    const tabLoginBtn = document.getElementById('tabLoginBtn');
    const tabRegisterBtn = document.getElementById('tabRegisterBtn');
    const tabsContainer = document.getElementById('authTabsContainer');
    const bannerTitle = document.getElementById('modalBannerTitle');
    const bannerSubtitle = document.getElementById('modalBannerSubtitle');

    if (!loginForm || !registerForm) return;

    // Reset hiển thị
    loginForm.style.display = 'none';
    registerForm.style.display = 'none';
    if (forgotForm) forgotForm.style.display = 'none';
    if (verifyNotice) verifyNotice.style.display = 'none';
    if (tabsContainer) tabsContainer.style.display = 'flex';

    if (tabLoginBtn) tabLoginBtn.classList.remove('active');
    if (tabRegisterBtn) tabRegisterBtn.classList.remove('active');

    if (tab === 'login') {
      loginForm.style.display = 'block';
      if (tabLoginBtn) tabLoginBtn.classList.add('active');
      if (bannerTitle) bannerTitle.innerText = 'Chào Mừng Đến Với SkillRental';
      if (bannerSubtitle) bannerSubtitle.innerText = 'Đăng nhập để thuê kỹ năng hoặc quản lý dịch vụ chuyên gia';
    } else if (tab === 'register') {
      registerForm.style.display = 'block';
      if (tabRegisterBtn) tabRegisterBtn.classList.add('active');
      if (bannerTitle) bannerTitle.innerText = 'Tạo Tài Khoản Mới';
      if (bannerSubtitle) bannerSubtitle.innerText = 'Tham gia nền tảng kết nối kỹ năng chuyên nghiệp hàng đầu';
    } else if (tab === 'forgot') {
      if (forgotForm) forgotForm.style.display = 'block';
      if (tabsContainer) tabsContainer.style.display = 'none';
      if (bannerTitle) bannerTitle.innerText = 'Khôi Phục Mật Khẩu';
      if (bannerSubtitle) bannerSubtitle.innerText = 'Nhận hướng dẫn đặt lại mật khẩu an toàn qua email';
      // Pre-fill email từ login nếu có
      const loginEmail = document.getElementById('loginEmail')?.value;
      const forgotEmail = document.getElementById('forgotEmail');
      if (loginEmail && forgotEmail && !forgotEmail.value) {
        forgotEmail.value = loginEmail;
      }
    } else if (tab === 'verify') {
      if (verifyNotice) verifyNotice.style.display = 'block';
      if (tabsContainer) tabsContainer.style.display = 'none';
      if (bannerTitle) bannerTitle.innerText = 'Kích Hoạt Tài Khoản';
      if (bannerSubtitle) bannerSubtitle.innerText = 'Xác thực email để bắt đầu sử dụng dịch vụ SkillRental';
      const curEmail = document.getElementById('verifyNoticeEmail')?.innerText?.trim() || document.getElementById('loginEmail')?.value?.trim();
      if (curEmail && curEmail !== 'email@example.com' && typeof window.updateVerifyEmailView === 'function') {
        window.updateVerifyEmailView(curEmail);
      }
    }
  };

  // Xử lý submit Đăng Nhập
  window.handleModalLogin = async function (e) {
    if (e) e.preventDefault();

    const email = document.getElementById('loginEmail')?.value?.trim();
    const password = document.getElementById('loginPassword')?.value;
    const submitBtn = document.getElementById('loginSubmitBtn');
    const alertBox = document.getElementById('loginAlertBox');

    if (!email || !password) {
      showToastMsg('Thiếu thông tin', 'Vui lòng nhập đầy đủ email và mật khẩu.', 'error');
      return;
    }

    if (alertBox) alertBox.style.display = 'none';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xác thực...';
    }

    try {
      const data = await SkillAuth.login(email, password);

      if (data.success && data.user) {
        showToastMsg('Đăng Nhập Thành Công!', `Chào mừng ${data.user.name || 'bạn'} đã quay trở lại.`, 'success');
        closeAuthModal();
        setTimeout(() => redirectAfterLogin(data.user), 300);
        return;
      }

      // Xử lý lỗi chưa xác nhận email
      if (data.code === 'EMAIL_NOT_VERIFIED') {
        if (alertBox) {
          alertBox.className = 'sr-alert-box sr-alert-warning';
          alertBox.style.display = 'flex';
          alertBox.innerHTML = `
            <i class="fa-solid fa-triangle-exclamation" style="font-size:18px;"></i>
            <div style="flex:1;">
              <strong>Tài khoản chưa được kích hoạt!</strong>
              <div style="margin:4px 0 8px; font-size:12px;">Vui lòng nhấn vào link trong email kích hoạt đã gửi tới <b>${email}</b>.</div>
              <button type="button" class="sr-btn-outline" style="height:32px; font-size:12px; background:#FFF;" onclick="triggerResendVerification('${email}', '${password}')">
                <i class="fa-solid fa-paper-plane"></i> Gửi lại email kích hoạt ngay
              </button>
            </div>
          `;
        }
        showToastMsg('Chưa xác nhận email', data.message, 'warning');
        return;
      }

      showToastMsg('Đăng Nhập Thất Bại', data.message || 'Sai thông tin tài khoản!', 'error');
    } catch (err) {
      showToastMsg('Lỗi đăng nhập', 'Không thể kết nối máy chủ xác thực.', 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i> Đăng Nhập Ngay';
      }
    }
  };

  // Xử lý submit Đăng Ký
  window.handleModalRegister = async function (e) {
    if (e) e.preventDefault();

    const name = document.getElementById('regName')?.value?.trim();
    const email = document.getElementById('regEmail')?.value?.trim();
    const phone = document.getElementById('regPhone')?.value?.trim();
    const password = document.getElementById('regPassword')?.value;
    const role = document.querySelector('input[name="regRole"]:checked')?.value || 'Customer';
    const submitBtn = document.getElementById('registerSubmitBtn');

    if (!name || !email || !password) {
      showToastMsg('Thiếu thông tin', 'Vui lòng điền đầy đủ họ tên, email và mật khẩu!', 'error');
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang tạo tài khoản...';
    }

    try {
      const data = await SkillAuth.register({ name, email, phone, password, role });

      if (data.success && data.verifyEmail) {
        const verifyMessage = document.getElementById('verifyNoticeMessage');
        if (verifyMessage && !data.verificationSent) {
          verifyMessage.innerHTML = '<i class="fa-solid fa-triangle-exclamation tip-icon" style="color:#F59E0B;"></i><div><strong>Chưa gửi được email tự động.</strong> Bấm “Gửi Lại Email Xác Nhận” bên dưới để nhận liên kết kích hoạt.</div>';
        }
        showToastMsg('🎉 Đăng Ký Thành Công!', 'Vui lòng kiểm tra hộp thư email để kích hoạt tài khoản của bạn.', 'success');
        const emailLabel = document.getElementById('verifyNoticeEmail');
        if (emailLabel) emailLabel.innerText = email;
        // Điền sẵn email vào form login
        const loginEmail = document.getElementById('loginEmail');
        if (loginEmail) loginEmail.value = email;
        if (typeof window.updateVerifyEmailView === 'function') {
          window.updateVerifyEmailView(email);
        }

        switchAuthTab('verify');
        return;
      }

      if (data.success && data.user) {
        showToastMsg('Tạo Tài Khoản Thành Công!', `Chào mừng bạn đến với SkillRental.`, 'success');
        closeAuthModal();
        setTimeout(() => redirectAfterLogin(data.user), 300);
        return;
      }

      showToastMsg('Đăng Ký Thất Bại', data.message || 'Không thể tạo tài khoản!', 'error');
    } catch (err) {
      showToastMsg('Lỗi đăng ký', 'Không thể hoàn tất đăng ký lúc này.', 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Hoàn Tất Đăng Ký';
      }
    }
  };

  // Xử lý submit Quên Mật Khẩu
  window.handleModalForgotPassword = async function (e) {
    if (e) e.preventDefault();

    const email = document.getElementById('forgotEmail')?.value?.trim();
    const submitBtn = document.getElementById('forgotSubmitBtn');
    const resultBox = document.getElementById('forgotResultBox');

    if (!email) {
      showToastMsg('Nhập email', 'Vui lòng nhập địa chỉ email của bạn.', 'error');
      return;
    }

    if (resultBox) resultBox.style.display = 'none';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang gửi yêu cầu...';
    }

    try {
      const res = await SkillAuth.forgotPassword(email);

      if (res.success) {
        if (resultBox) {
          resultBox.className = 'sr-alert-box sr-alert-success';
          resultBox.style.display = 'flex';
          let devExtra = '';
          if (res.resetLink) {
            devExtra = `<div style="margin-top:8px; padding-top:8px; border-top:1px dashed #86EFAC;"><small style="color:#15803D;">Link demo kiểm thử: <a href="${res.resetLink}" target="_blank" style="color:#15803D; font-weight:700;">Nhấp để đặt lại mật khẩu</a></small></div>`;
          }
          resultBox.innerHTML = `
            <i class="fa-solid fa-circle-check" style="font-size:18px;"></i>
            <div style="flex:1;">
              <strong>Đã gửi liên kết thành công!</strong>
              <div style="margin-top:2px;">${res.message}</div>
              ${devExtra}
            </div>
          `;
        }
        showToastMsg('Đã gửi email khôi phục', res.message, 'success');
      } else {
        showToastMsg('Không thể gửi', res.message, 'error');
      }
    } catch (err) {
      showToastMsg('Lỗi xử lý', 'Không thể gửi email lúc này. Vui lòng thử lại sau.', 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Gửi Liên Kết Khôi Phục';
      }
    }
  };
  // Tương thích hàm cũ
  window.handleForgotPassword = function (e) {
    if (e) e.preventDefault();
    switchAuthTab('forgot');
  };

  // Gửi lại email xác nhận kèm cooldown đếm ngược
  window.triggerResendVerification = async function (optionalEmail, optionalPassword) {
    const email = optionalEmail || document.getElementById('verifyNoticeEmail')?.innerText || document.getElementById('loginEmail')?.value?.trim();
    const btn = document.getElementById('btnResendVerification');

    if (!email) {
      showToastMsg('Thiếu email', 'Không tìm thấy địa chỉ email cần gửi lại.', 'error');
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang gửi...';
    }

    try {
      const res = await SkillAuth.resendVerification(email, optionalPassword);
      if (res.success) {
        showToastMsg('Đã gửi lại email', res.message, 'success');
        let countdown = 60;
        const timer = setInterval(() => {
          if (btn) btn.innerHTML = `<i class="fa-solid fa-clock"></i> Gửi lại sau (${countdown}s)`;
          countdown--;
          if (countdown < 0) {
            clearInterval(timer);
            if (btn) {
              btn.disabled = false;
              btn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Gửi Lại Email Xác Nhận';
            }
          }
        }, 1000);
      } else {
        showToastMsg('Thất bại', res.message, 'error');
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Gửi Lại Email Xác Nhận';
        }
      }
    } catch (err) {
      showToastMsg('Lỗi gửi email', 'Không thể gửi lại email xác nhận.', 'error');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Gửi Lại Email Xác Nhận';
      }
    }
  };

  // Cập nhật giao diện xác thực email (phát hiện hộp thư theo domain)
  window.updateVerifyEmailView = function (email) {
    if (!email) return;
    const cleanEmail = String(email).trim();
    const emailLabel = document.getElementById('verifyNoticeEmail');
    if (emailLabel) emailLabel.innerText = cleanEmail;

    const inboxBtn = document.getElementById('btnOpenInbox');
    const inboxIcon = document.getElementById('inboxProviderIcon');
    const inboxText = document.getElementById('inboxProviderText');

    if (!inboxBtn || !inboxText) return;

    const lower = cleanEmail.toLowerCase();
    if (lower.includes('@gmail.com') || lower.includes('@st.hcmuaf.edu.vn') || lower.endsWith('.edu.vn')) {
      inboxBtn.href = 'https://mail.google.com';
      if (inboxIcon) {
        inboxIcon.className = 'fa-brands fa-google';
        inboxIcon.style.color = '#EA4335';
      }
      inboxText.innerText = 'Mở Hộp Thư Gmail';
    } else if (lower.includes('@outlook.') || lower.includes('@hotmail.') || lower.includes('@live.') || lower.includes('@office365.')) {
      inboxBtn.href = 'https://outlook.live.com';
      if (inboxIcon) {
        inboxIcon.className = 'fa-brands fa-microsoft';
        inboxIcon.style.color = '#00A4EF';
      }
      inboxText.innerText = 'Mở Hộp Thư Outlook';
    } else if (lower.includes('@yahoo.')) {
      inboxBtn.href = 'https://mail.yahoo.com';
      if (inboxIcon) {
        inboxIcon.className = 'fa-brands fa-yahoo';
        inboxIcon.style.color = '#6001D2';
      }
      inboxText.innerText = 'Mở Hộp Thư Yahoo';
    } else {
      inboxBtn.href = `mailto:${cleanEmail}`;
      if (inboxIcon) {
        inboxIcon.className = 'fa-solid fa-envelope-open';
        inboxIcon.style.color = '#16A34A';
      }
      inboxText.innerText = 'Mở Ứng Dụng Hộp Thư';
    }
  };

  // Sao chép email xác nhận vào clipboard
  window.copyVerifyEmail = function () {
    const email = document.getElementById('verifyNoticeEmail')?.innerText?.trim();
    if (!email || email === 'email@example.com') return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(email).then(() => {
        const btn = document.getElementById('btnCopyVerifyEmail');
        if (btn) {
          btn.innerHTML = '<i class="fa-solid fa-check" style="color:#16A34A;"></i>';
          setTimeout(() => {
            btn.innerHTML = '<i class="fa-regular fa-copy"></i>';
          }, 2000);
        }
        showToastMsg('Đã Sao Chép', 'Đã sao chép địa chỉ email vào clipboard.', 'success');
      }).catch(() => {
        showToastMsg('Email Xác Nhận', email, 'info');
      });
    } else {
      showToastMsg('Email Xác Nhận', email, 'info');
    }
  };

  // Đăng nhập / Đăng ký bằng Google
  window.handleGoogleLogin = async function (e, isRegister = false) {
    if (e) e.preventDefault();
    try {
      const selectedRole = isRegister
        ? (document.querySelector('input[name="regRole"]:checked')?.value || 'Customer')
        : undefined;

      const data = await SkillAuth.loginWithGoogle(selectedRole);
      if (data.success && data.user) {
        showToastMsg('Đăng Nhập Thành Công!', `Chào mừng ${data.user.name}.`, 'success');
        closeAuthModal();
        setTimeout(() => redirectAfterLogin(data.user), 300);
        return;
      }
      if (data.code === 'NO_PROFILE' && data.googleUser) {
        switchAuthTab('register');
        const regName = document.getElementById('regName');
        const regEmail = document.getElementById('regEmail');
        const regPhone = document.getElementById('regPhone');
        if (regName) regName.value = data.googleUser.name || '';
        if (regEmail) { regEmail.value = data.googleUser.email || ''; regEmail.readOnly = true; }
        if (regPhone) regPhone.value = data.googleUser.phone || '';

        const pwdWrap = document.getElementById('regPassword')?.closest('.sr-form-group');
        if (pwdWrap) pwdWrap.style.display = 'none';

        const form = document.getElementById('registerForm');
        if (form) {
          form.onsubmit = async (evt) => {
            evt.preventDefault();
            const role = document.querySelector('input[name="regRole"]:checked')?.value || 'Customer';
            data.googleUser.phone = document.getElementById('regPhone')?.value?.trim();
            data.googleUser.name = document.getElementById('regName')?.value?.trim();
            const res = await SkillAuth.registerGoogleProfile(role, data.googleUser);
            if (res.success && res.user) {
              showToastMsg('Tạo Tài Khoản Thành Công!', `Chào mừng bạn với vai trò ${role}.`, 'success');
              closeAuthModal();
              setTimeout(() => redirectAfterLogin(res.user), 300);
            } else {
              showToastMsg('Đăng Ký Thất Bại', res.message || 'Không thể tạo tài khoản!', 'error');
            }
          };
        }
        showToastMsg('Chọn vai trò', 'Vui lòng chọn vai trò để hoàn tất tài khoản Google.', 'info');
        return;
      }
      showToastMsg('Đăng Nhập Thất Bại', data.message || 'Lỗi xác thực Google.', 'error');
    } catch (err) {
      showToastMsg('Lỗi', 'Không thể hoàn tất đăng nhập bằng Google.', 'error');
    }
  };

  // ============================================================================
  // 8. TỰ ĐỘNG BẮT THAM SỐ URL (AUTH ACTIONS & QUERY PARAMS)
  // ============================================================================
  document.addEventListener('DOMContentLoaded', async () => {
    injectModalHtml();

    const params = new URLSearchParams(window.location.search);
    const authAction = params.get('auth');
    const mode = params.get('mode');
    const verifiedParam = params.get('verified');
    if (verifiedParam === '1') {
      showToastMsg('Kích Hoạt Thành Công!', 'Tài khoản của bạn đã được xác nhận. Vui lòng đăng nhập.', 'success');
    }

    // Nếu nhận được link tác vụ từ email (verifyEmail, resetPassword, recoverEmail), tự động chuyển về trang verify.html chuyên biệt
    if ((mode === 'verifyEmail' || mode === 'resetPassword' || mode === 'recoverEmail') && oobCode) {
      if (!window.location.pathname.includes('verify.html')) {
        window.location.href = `verify.html?${params.toString()}`;
        return;
      }
    }

    // Trường hợp 2: Nhấp link đặt lại mật khẩu từ hộp thư
    if (mode === 'resetPassword' && oobCode) {
      openAuthModal('forgot');
      const resultBox = document.getElementById('forgotResultBox');
      const forgotForm = document.getElementById('forgotForm');
      if (forgotForm && resultBox) {
        forgotForm.innerHTML = `
          <div class="sr-alert-box sr-alert-info">
            <i class="fa-solid fa-key" style="font-size:18px;"></i>
            <div>Nhập mật khẩu mới cho tài khoản của bạn (tối thiểu 6 ký tự).</div>
          </div>
          <div class="sr-form-group">
            <label for="newResetPassword">Mật khẩu mới</label>
            <div class="sr-input-wrap">
              <input type="password" id="newResetPassword" class="sr-form-control" placeholder="Tối thiểu 6 ký tự" minlength="6" required>
              <button type="button" class="sr-pwd-toggle" onclick="togglePasswordVisibility('newResetPassword', this)">
                <i class="fa-solid fa-eye"></i>
              </button>
            </div>
          </div>
          <button type="button" class="sr-btn-primary" id="btnConfirmNewPwd">
            <i class="fa-solid fa-check"></i> Xác Nhận Đổi Mật Khẩu
          </button>
        `;
        document.getElementById('btnConfirmNewPwd').onclick = async () => {
          const newPwd = document.getElementById('newResetPassword')?.value;
          if (!newPwd || newPwd.length < 6) {
            showToastMsg('Mật khẩu yếu', 'Vui lòng nhập mật khẩu có ít nhất 6 ký tự.', 'error');
            return;
          }
          const resetRes = await SkillAuth.confirmPasswordReset(oobCode, newPwd);
          if (resetRes.success) {
            showToastMsg('Đổi Mật Khẩu Thành Công!', resetRes.message, 'success');
            setTimeout(() => switchAuthTab('login'), 1200);
          } else {
            showToastMsg('Thất bại', resetRes.message, 'error');
          }
        };
      }
      return;
    }

    // Trường hợp 3: Điều hướng với ?auth=login hoặc ?auth=register hoặc ?auth=forgot
    if (authAction === 'login') {
      openAuthModal('login');
    } else if (authAction === 'register') {
      openAuthModal('register');
    } else if (authAction === 'forgot') {
      openAuthModal('forgot');
    }
  });

})();
