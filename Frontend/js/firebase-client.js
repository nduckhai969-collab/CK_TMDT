// Firebase Auth phía trình duyệt: đăng ký (email xác nhận), đăng nhập, đăng xuất,
// quên mật khẩu, và tự động gắn "Authorization: Bearer <ID token>" vào mọi request /api/.
(function () {
  const SESSION_KEY = 'SKILLRENTAL_CURRENT_USER';

  if (!window.firebase || !window.FIREBASE_CONFIG) {
    console.error('[SkillAuth] Thiếu Firebase SDK hoặc firebase-config.js');
    return;
  }
  if (String(window.FIREBASE_CONFIG.apiKey).startsWith('YOUR_')) {
    console.warn('[SkillAuth] Chưa điền cấu hình trong js/firebase-config.js');
  }

  firebase.initializeApp(window.FIREBASE_CONFIG);
  const fbAuth = firebase.auth();
  fbAuth.languageCode = 'vi'; // email xác nhận / đặt lại mật khẩu bằng tiếng Việt

  // Chờ Firebase khôi phục phiên đăng nhập trước khi gửi request đầu tiên
  const authReady = new Promise((resolve) => {
    const off = fbAuth.onAuthStateChanged((user) => {
      off();
      // Đã xóa phiên ở trang khác (hoặc đăng xuất cũ) thì đăng xuất luôn Firebase
      if (user && !localStorage.getItem(SESSION_KEY)) fbAuth.signOut().finally(resolve);
      else resolve();
    });
  });

  // ---- Tự gắn Bearer token cho request tới /api/ ----
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : '';
    if (!url.includes('/api/')) return nativeFetch(input, init);

    await authReady;
    const options = { ...(init || {}) };
    const headers = new Headers(options.headers || {});
    const user = fbAuth.currentUser;
    if (user && !headers.has('Authorization') && localStorage.getItem(SESSION_KEY)) {
      headers.set('Authorization', 'Bearer ' + (await user.getIdToken()));
    }
    options.headers = headers;
    return nativeFetch(input, options);
  };

  const MESSAGES = {
    'auth/email-already-in-use': 'Email này đã được sử dụng trên hệ thống!',
    'auth/invalid-email': 'Email không hợp lệ.',
    'auth/weak-password': 'Mật khẩu quá yếu (tối thiểu 6 ký tự).',
    'auth/invalid-credential': 'Email hoặc mật khẩu không chính xác!',
    'auth/user-not-found': 'Email hoặc mật khẩu không chính xác!',
    'auth/wrong-password': 'Email hoặc mật khẩu không chính xác!',
    'auth/user-disabled': 'Tài khoản đã bị vô hiệu hóa.',
    'auth/too-many-requests': 'Thao tác quá nhiều lần. Vui lòng thử lại sau ít phút.',
    'auth/network-request-failed': 'Lỗi mạng. Vui lòng kiểm tra kết nối.'
  };
  const fail = (err, fallback) => ({
    success: false,
    code: err && err.code,
    message: MESSAGES[err && err.code] || (err && err.message) || fallback
  });

  async function callApi(path, method, token, body) {
    const res = await nativeFetch(path, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: body ? JSON.stringify(body) : undefined
    });
    return res.json().catch(() => ({ success: false, message: 'Phản hồi không hợp lệ từ máy chủ.' }));
  }

  window.SkillAuth = {
    // Đăng ký: tạo tài khoản Firebase -> gửi email xác nhận -> tạo hồ sơ trên server
    async register({ name, email, phone, password, role }) {
      let cred;
      try {
        cred = await fbAuth.createUserWithEmailAndPassword(email, password);
      } catch (err) {
        return fail(err, 'Không thể tạo tài khoản!');
      }
      try {
        await cred.user.updateProfile({ displayName: name });
        const token = await cred.user.getIdToken();
        const data = await callApi('/api/auth/register', 'POST', token, { name, phone, role });
        if (!data.success) {
          await cred.user.delete(); // tránh tài khoản "mồ côi" không có hồ sơ
          return data;
        }
        await cred.user.sendEmailVerification();
        await fbAuth.signOut();
        return { success: true, verifyEmail: true, email, message: 'Đã gửi email xác nhận tới ' + email + '. Vui lòng xác nhận rồi đăng nhập.' };
      } catch (err) {
        try { await cred.user.delete(); } catch (_) { /* bỏ qua */ }
        return fail(err, 'Không thể hoàn tất đăng ký!');
      }
    },

    // Đăng nhập: chặn khi chưa xác nhận email, rồi lấy hồ sơ từ server
    async login(email, password) {
      let cred;
      try {
        cred = await fbAuth.signInWithEmailAndPassword(email, password);
        await cred.user.reload();
      } catch (err) {
        return fail(err, 'Đăng nhập thất bại!');
      }
      if (!cred.user.emailVerified) {
        await fbAuth.signOut();
        return {
          success: false,
          code: 'EMAIL_NOT_VERIFIED',
          message: 'Email chưa được xác nhận. Hãy bấm vào liên kết trong email chúng tôi đã gửi.'
        };
      }
      const token = await cred.user.getIdToken(true);
      const data = await callApi('/api/auth/login', 'POST', token);
      if (!data.success) {
        await fbAuth.signOut();
        return data;
      }
      localStorage.setItem(SESSION_KEY, JSON.stringify(data.user));
      return data;
    },

    // Gửi lại email xác nhận (cần email + mật khẩu để đăng nhập tạm)
    async resendVerification(email, password) {
      try {
        const cred = await fbAuth.signInWithEmailAndPassword(email, password);
        if (cred.user.emailVerified) {
          await fbAuth.signOut();
          return { success: true, message: 'Email đã được xác nhận, bạn có thể đăng nhập.' };
        }
        await cred.user.sendEmailVerification();
        await fbAuth.signOut();
        return { success: true, message: 'Đã gửi lại email xác nhận tới ' + email + '.' };
      } catch (err) {
        return fail(err, 'Không thể gửi lại email xác nhận.');
      }
    },

    // Đăng nhập bằng Google
    async loginWithGoogle() {
      try {
        const provider = new firebase.auth.GoogleAuthProvider();
        const cred = await fbAuth.signInWithPopup(provider);
        const token = await cred.user.getIdToken(true);
        const data = await callApi('/api/auth/login', 'POST', token);

        if (!data.success) {
          if (data.code === 'NO_PROFILE') {
            return {
              success: false,
              code: 'NO_PROFILE',
              googleUser: {
                name: cred.user.displayName,
                email: cred.user.email,
                phone: cred.user.phoneNumber || '',
                token: token
              },
              message: 'Vui lòng chọn loại tài khoản để hoàn tất đăng nhập.'
            };
          }
          await fbAuth.signOut();
          return data;
        }

        localStorage.setItem(SESSION_KEY, JSON.stringify(data.user));
        return data;
      } catch (err) {
        return fail(err, 'Đăng nhập bằng Google thất bại!');
      }
    },

    // Hoàn tất đăng ký bằng Google (chọn role)
    async registerGoogleProfile(role, googleUser) {
      try {
        const data = await callApi('/api/auth/register', 'POST', googleUser.token, { 
          name: googleUser.name, 
          phone: googleUser.phone, 
          role 
        });
        if (!data.success) {
           await fbAuth.signOut();
           return data;
        }
        localStorage.setItem(SESSION_KEY, JSON.stringify(data.user));
        return data;
      } catch (err) {
        return fail(err, 'Không thể tạo hồ sơ Google!');
      }
    },

    // Quên mật khẩu: luôn báo thành công để không lộ email nào đã đăng nhập
    async forgotPassword(email) {
      try {
        await fbAuth.sendPasswordResetEmail(email);
      } catch (err) {
        if (err.code === 'auth/invalid-email' || err.code === 'auth/too-many-requests' || err.code === 'auth/network-request-failed') {
          return fail(err, 'Không thể gửi email đặt lại mật khẩu.');
        }
      }
      return { success: true, message: 'Nếu email tồn tại, liên kết đặt lại mật khẩu đã được gửi tới ' + email + '.' };
    },

    async logout() {
      localStorage.removeItem(SESSION_KEY);
      try { await fbAuth.signOut(); } catch (_) { /* bỏ qua */ }
    }
  };
})();
