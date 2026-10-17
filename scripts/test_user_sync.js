/**
 * Test Suite: Đồng bộ người dùng với trang Admin trong SkillRental
 * Kiểm thử toàn diện 8 trường hợp A -> H theo đúng yêu cầu bài toán.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function createBrowserEnv() {
  const store = {};
  const eventListeners = {};

  const localStorage = {
    getItem(key) {
      return store[key] !== undefined ? store[key] : null;
    },
    setItem(key, value) {
      const oldValue = store[key] || null;
      store[key] = String(value);
      // Giả lập storage event tới các listener đã đăng ký
      if (window.dispatchEvent) {
        const storageEvent = { key, oldValue, newValue: store[key] };
        if (eventListeners['storage']) {
          eventListeners['storage'].forEach(cb => cb(storageEvent));
        }
      }
    },
    removeItem(key) {
      delete store[key];
      if (eventListeners['storage']) {
        eventListeners['storage'].forEach(cb => cb({ key, oldValue: null, newValue: null }));
      }
    },
    clear() {
      Object.keys(store).forEach(k => delete store[k]);
    },
    _getStore() {
      return store;
    }
  };

  class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  }

  const window = {
    location: {
      protocol: 'http:',
      port: '3000',
      search: '',
      pathname: '/index.html'
    },
    localStorage,
    CustomEvent,
    Headers: class Headers {
      constructor(init = {}) { this.headers = { ...init }; }
      has(k) { return !!this.headers[k]; }
      set(k, v) { this.headers[k] = v; }
    },
    document: {
      addEventListener(type, cb) {
        if (!eventListeners[type]) eventListeners[type] = [];
        eventListeners[type].push(cb);
      },
      querySelectorAll() { return []; },
      getElementById() { return null; },
      querySelector() { return null; }
    },
    addEventListener(type, cb) {
      if (!eventListeners[type]) eventListeners[type] = [];
      eventListeners[type].push(cb);
    },
    removeEventListener(type, cb) {
      if (eventListeners[type]) {
        eventListeners[type] = eventListeners[type].filter(fn => fn !== cb);
      }
    },
    dispatchEvent(event) {
      const cbs = eventListeners[event.type] || [];
      cbs.forEach(cb => cb(event));
      return true;
    },
    console: console,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id),
    fetch: async () => ({ ok: false, json: async () => ({ success: false }) })
  };

  window.window = window;
  window.self = window;

  return { window, localStorage, store, eventListeners };
}

function runScriptsInEnv(env) {
  const commonJsCode = fs.readFileSync(path.join(__dirname, '../frontend/common.js'), 'utf8');
  const firebaseClientCode = fs.readFileSync(path.join(__dirname, '../frontend/js/firebase-client.js'), 'utf8');

  // Firebase stub
  env.window.FIREBASE_CONFIG = { apiKey: 'dummy', projectId: 'skillrental-demo' };
  
  let authStateCallback = null;
  let mockUserToDelete = null;

  const mockFirebaseAuth = {
    languageCode: 'vi',
    currentUser: null,
    onAuthStateChanged(cb) {
      authStateCallback = cb;
      cb(null);
      return () => {};
    },
    async createUserWithEmailAndPassword(email, password) {
      if (email === 'fail-firebase@example.com') {
        const err = new Error('Firebase Auth simulated failure');
        err.code = 'auth/network-request-failed';
        throw err;
      }
      const user = {
        uid: 'fb_' + Math.random().toString(36).slice(2, 9),
        email,
        displayName: '',
        emailVerified: false,
        async updateProfile({ displayName }) { this.displayName = displayName; },
        async getIdToken() { return 'mock_token_' + this.uid; },
        async sendEmailVerification() { this.emailVerifiedSent = true; },
        async delete() { mockUserToDelete = this.uid; }
      };
      mockFirebaseAuth.currentUser = user;
      return { user };
    },
    async signInWithEmailAndPassword(email, password) {
      const user = {
        uid: 'fb_' + Math.random().toString(36).slice(2, 9),
        email,
        displayName: 'Test Login User',
        emailVerified: true,
        async reload() {},
        async getIdToken() { return 'mock_token_signed_in'; }
      };
      mockFirebaseAuth.currentUser = user;
      return { user };
    },
    async signInWithPopup(provider) {
      if (env.window._simulateGoogleCancel) {
        const err = new Error('Popup closed by user');
        err.code = 'auth/popup-closed-by-user';
        throw err;
      }
      const gUser = env.window._mockGoogleUser || {
        uid: 'google_uid_12345',
        displayName: 'Nguyễn Google Test',
        email: 'google.test@example.com',
        phoneNumber: '0988 123 456',
        photoURL: 'https://lh3.googleusercontent.com/a/test-avatar'
      };
      const user = {
        ...gUser,
        async getIdToken() { return 'mock_google_id_token'; }
      };
      mockFirebaseAuth.currentUser = user;
      return { user };
    },
    async signOut() {
      mockFirebaseAuth.currentUser = null;
    }
  };

  env.window.firebase = {
    apps: [],
    initializeApp() { return {}; },
    app() { return {}; },
    auth: Object.assign(() => mockFirebaseAuth, {
      GoogleAuthProvider: class {
        setCustomParameters() {}
      }
    })
  };

  const context = vm.createContext(env.window);
  vm.runInContext(commonJsCode, context);
  vm.runInContext(firebaseClientCode, context);

  return context;
}

async function runTests() {
  console.log('================================================================');
  console.log('   BẮT ĐẦU KIỂM THỬ: ĐỒNG BỘ NGƯỜI DÙNG VỚI TRANG ADMIN (A -> H)');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      passed++;
      console.log(`  [PASS] ${message}`);
    } else {
      console.error(`  [FAIL] ${message}`);
      throw new Error(`Kiểm thử thất bại: ${message}`);
    }
  }

  // Khởi tạo môi trường
  const env = createBrowserEnv();
  const ctx = runScriptsInEnv(env);

  const STORAGE_KEY = 'SKILL_RENTAL_ADMIN_STATE_V1';
  const SESSION_KEY = 'SKILLRENTAL_CURRENT_USER';

  // Kiểm tra trạng thái khởi đầu
  const initState = ctx.getAppState();
  assert(Array.isArray(initState.users), 'Trạng thái ban đầu có danh sách users');
  assert(initState.users.some(u => u.id === 'ADM001' && u.role === 'Admin'), 'Tài khoản Quản trị ADM001 tồn tại trong danh sách ban đầu');
  const initialUserCount = initState.users.length;
  console.log(`  (Số lượng người dùng mẫu ban đầu: ${initialUserCount})\n`);

  // --------------------------------------------------------------------------
  console.log('--- KIỂM THỬ TRƯỜNG HỢP A: Đăng ký email mới bằng form thông thường ---');
  // --------------------------------------------------------------------------
  const regResult = await ctx.SkillAuth.register({
    name: 'Phạm Minh Đức',
    email: 'duc.pham@example.com',
    phone: '0987 654 321',
    password: 'password123',
    role: 'Customer'
  });

  assert(regResult.success === true, 'Đăng ký tài khoản thành công');
  assert(regResult.user && regResult.user.email === 'duc.pham@example.com', 'Hồ sơ người dùng mới được tạo');
  assert(regResult.user.role === 'Customer', 'Vai trò tài khoản đăng ký là Customer');
  assert(regResult.user.id.startsWith('USR'), `ID người dùng hợp lệ: ${regResult.user.id}`);

  // Kiểm tra trong Admin state
  const stateAfterA = ctx.getAppState();
  const adminUserA = stateAfterA.users.find(u => u.email === 'duc.pham@example.com');
  assert(!!adminUserA, 'Tài khoản đăng ký mới xuất hiện trong Admin -> Quản lý người dùng');
  assert(adminUserA.name === 'Phạm Minh Đức', 'Họ tên hiển thị chính xác trong Admin');
  assert(adminUserA.phone === '0987 654 321', 'Số điện thoại hiển thị chính xác trong Admin');
  assert(adminUserA.status === 'active', 'Trạng thái người dùng mới là active');
  assert(stateAfterA.users.length === initialUserCount + 1, `Tổng số người dùng tăng từ ${initialUserCount} lên ${stateAfterA.users.length}`);

  // Thử đăng ký lại với cùng email -> Phải bị từ chối
  const duplicateReg = await ctx.SkillAuth.register({
    name: 'Phạm Minh Đức Trùng',
    email: 'duc.pham@example.com',
    phone: '0987 654 999',
    password: 'password123',
    role: 'Customer'
  });
  assert(duplicateReg.success === false, 'Đăng ký lại với cùng email bị từ chối chính xác');
  console.log('');

  // --------------------------------------------------------------------------
  console.log('--- KIỂM THỬ TRƯỜNG HỢP B: Người dùng mới đăng nhập Google lần đầu ---');
  // --------------------------------------------------------------------------
  ctx._simulateGoogleCancel = false;
  ctx._mockGoogleUser = {
    uid: 'google_uid_new_999',
    displayName: 'Hoàng Thị Thảo (Google)',
    email: 'thao.hoang.google@gmail.com',
    phoneNumber: '0918 888 777',
    photoURL: 'https://lh3.googleusercontent.com/avatar_thao.jpg'
  };

  const googleLoginB = await ctx.SkillAuth.loginWithGoogle('Provider');
  assert(googleLoginB.success === true, 'Đăng nhập Google lần đầu thành công');
  assert(googleLoginB.user && googleLoginB.user.email === 'thao.hoang.google@gmail.com', 'Người dùng Google có hồ sơ');
  assert(googleLoginB.user.role === 'Provider', 'Hồ sơ người dùng mới nhận đúng vai trò Provider khi đăng ký');
  assert(googleLoginB.user.avatar === 'https://lh3.googleusercontent.com/avatar_thao.jpg', 'Ảnh đại diện Google được lưu');
  assert(googleLoginB.user.uid === 'google_uid_new_999', 'UID Google được liên kết đúng');

  const stateAfterB = ctx.getAppState();
  const adminUserB = stateAfterB.users.find(u => u.email === 'thao.hoang.google@gmail.com');
  assert(!!adminUserB, 'Người dùng Google lần đầu xuất hiện trong Admin -> Quản lý người dùng');
  assert(adminUserB.id === googleLoginB.user.id, `ID ổn định được gán: ${adminUserB.id}`);

  // Kiểm tra session hiện tại
  const sessionUserB = JSON.parse(env.localStorage.getItem(SESSION_KEY));
  assert(sessionUserB && sessionUserB.id === adminUserB.id, 'Session đăng nhập được lưu chính xác trong SKILLRENTAL_CURRENT_USER');
  console.log('');

  // --------------------------------------------------------------------------
  console.log('--- KIỂM THỬ TRƯỜNG HỢP C: Người dùng Google đăng nhập lại ---');
  // --------------------------------------------------------------------------
  const countBeforeC = stateAfterB.users.length;
  const originalIdB = adminUserB.id;

  // Đăng nhập lại với cùng tài khoản Google
  const googleLoginC = await ctx.SkillAuth.loginWithGoogle();
  assert(googleLoginC.success === true, 'Đăng nhập lại bằng Google thành công');
  assert(googleLoginC.user.id === originalIdB, `ID người dùng không đổi: ${googleLoginC.user.id}`);

  const stateAfterC = ctx.getAppState();
  assert(stateAfterC.users.length === countBeforeC, 'Không tạo bản ghi trùng lặp khi đăng nhập lại');
  const duplicatesC = stateAfterC.users.filter(u => u.email === 'thao.hoang.google@gmail.com');
  assert(duplicatesC.length === 1, 'Chỉ duy nhất 1 bản ghi tồn tại cho tài khoản Google');
  console.log('');

  // --------------------------------------------------------------------------
  console.log('--- KIỂM THỬ TRƯỜNG HỢP D: Tài khoản email thông thường có sẵn đăng nhập Google cùng email ---');
  // --------------------------------------------------------------------------
  // Tài khoản đã có sẵn từ trước: Trần Thị Lan (USR002, Provider, balance: 18.500.000đ, status: active)
  const existingLan = stateAfterC.users.find(u => u.email === 'lan.tran@example.com');
  assert(!!existingLan, 'Tài khoản thông thường Trần Thị Lan (USR002) tồn tại trước');
  const lanOriginalRole = existingLan.role;
  const lanOriginalId = existingLan.id;
  const lanOriginalStatus = existingLan.status;

  // Giả lập Lan đăng nhập Google với email lan.tran@example.com
  ctx._mockGoogleUser = {
    uid: 'google_uid_lan_456',
    displayName: 'Trần Thị Lan (Google)',
    email: 'lan.tran@example.com',
    phoneNumber: '0912 345 678',
    photoURL: 'https://lh3.googleusercontent.com/avatar_lan.jpg'
  };

  const googleLoginD = await ctx.SkillAuth.loginWithGoogle('Customer'); // Thử truyền role Customer khi đăng nhập
  assert(googleLoginD.success === true, 'Đăng nhập Google với email đã tồn tại thành công');
  assert(googleLoginD.user.id === lanOriginalId, `Bảo toàn ID cũ USR002, không tạo ID mới: ${googleLoginD.user.id}`);
  assert(googleLoginD.user.role === lanOriginalRole, `Bảo toàn vai trò cũ (${lanOriginalRole}), không bị ghi đè thành Customer`);
  assert(googleLoginD.user.status === lanOriginalStatus, `Bảo toàn trạng thái hoạt động: ${googleLoginD.user.status}`);

  const stateAfterD = ctx.getAppState();
  const lanInAdmin = stateAfterD.users.find(u => u.email === 'lan.tran@example.com');
  assert(lanInAdmin.uid === 'google_uid_lan_456', 'Liên kết an toàn Google UID vào tài khoản hiện có');
  assert(stateAfterD.users.filter(u => u.email === 'lan.tran@example.com').length === 1, 'Không có bản ghi trùng lặp cho email đã liên kết');
  console.log('');

  // --------------------------------------------------------------------------
  console.log('--- KIỂM THỬ TRƯỜNG HỢP E: Tải lại trang Admin -> Dữ liệu vẫn tồn tại ---');
  // --------------------------------------------------------------------------
  // Giả lập reload trang bằng cách đọc trực tiếp từ localStorage như hàm getAppState() trên users.html khi tải lại
  const rawAdminState = env.localStorage.getItem(STORAGE_KEY);
  assert(!!rawAdminState, 'Key SKILL_RENTAL_ADMIN_STATE_V1 tồn tại bền vững trong localStorage');

  const reloadedState = JSON.parse(rawAdminState);
  assert(reloadedState.users.some(u => u.email === 'duc.pham@example.com'), 'Người dùng đăng ký thường (Trường hợp A) vẫn còn sau reload');
  assert(reloadedState.users.some(u => u.email === 'thao.hoang.google@gmail.com'), 'Người dùng Google (Trường hợp B) vẫn còn sau reload');
  assert(reloadedState.users.some(u => u.id === 'USR002' && u.uid === 'google_uid_lan_456'), 'Tài khoản đã liên kết (Trường hợp D) vẫn giữ nguyên sau reload');
  console.log('');

  // --------------------------------------------------------------------------
  console.log('--- KIỂM THỬ TRƯỜNG HỢP F: Đăng ký ở 1 tab -> Tab Admin khác nhận sự kiện storage ---');
  // --------------------------------------------------------------------------
  let storageEventFired = false;
  let eventKeyReceived = null;

  // Tab Admin đăng ký lắng nghe sự kiện storage
  env.eventListeners['storage'] = [
    (e) => {
      storageEventFired = true;
      eventKeyReceived = e.key;
    }
  ];

  // Tab người dùng thực hiện đăng ký tài khoản mới
  await ctx.SkillAuth.register({
    name: 'Vũ Quốc Bảo',
    email: 'bao.vu@example.com',
    phone: '0909 333 222',
    password: 'password123',
    role: 'Customer'
  });

  assert(storageEventFired === true, 'Sự kiện storage được kích hoạt liên tab');
  assert(eventKeyReceived === STORAGE_KEY, `Sự kiện phát sinh đúng key: ${STORAGE_KEY}`);

  const stateAfterF = ctx.getAppState();
  assert(stateAfterF.users.some(u => u.email === 'bao.vu@example.com'), 'Tài khoản mới đăng ký từ tab khác xuất hiện trong Admin');
  console.log('');

  // --------------------------------------------------------------------------
  console.log('--- KIỂM THỬ TRƯỜNG HỢP G: Tài khoản Admin và tài khoản mẫu không bị mất dữ liệu hay sai vai trò ---');
  // --------------------------------------------------------------------------
  const finalState = ctx.getAppState();
  const adminAccount = finalState.users.find(u => u.id === 'ADM001');
  assert(!!adminAccount, 'Tài khoản ADM001 vẫn tồn tại nguyên vẹn');
  assert(adminAccount.role === 'Admin', 'Tài khoản ADM001 giữ nguyên vai trò Admin');
  assert(adminAccount.email === 'admin@skillrental.com', 'Email quản trị viên không bị thay đổi');

  // Kiểm tra tài khoản bị khóa mẫu (USR004 - Hoàng Văn Nam)
  const lockedUser = finalState.users.find(u => u.id === 'USR004');
  assert(!!lockedUser, 'Tài khoản USR004 vẫn tồn tại');
  assert(lockedUser.status === 'locked', 'Trạng thái khóa của USR004 được bảo toàn');
  assert(lockedUser.role === 'Customer', 'Vai trò của USR004 được bảo toàn');

  // Kiểm tra tài khoản USR001 - Provider
  const usr001 = finalState.users.find(u => u.id === 'USR001');
  assert(!!usr001 && usr001.role === 'Provider', 'Tài khoản USR001 giữ nguyên vai trò Provider');

  // Kiểm tra tính bảo mật: Người dùng mới không thể tự phong Admin
  const hackedUser = ctx.syncUserToAdminState({
    name: 'Hacker Pretending Admin',
    email: 'hacker@example.com',
    role: 'Admin' // Cố ý gửi role Admin
  });
  assert(hackedUser.role === 'Customer', 'Hệ thống tự động hạ role xuống Customer an toàn, không để tự nâng quyền Admin');
  console.log('');

  // --------------------------------------------------------------------------
  console.log('--- KIỂM THỬ TRƯỜNG HỢP H: Đăng nhập Google thất bại hoặc người dùng hủy popup ---');
  // --------------------------------------------------------------------------
  const countBeforeH = ctx.getAppState().users.length;
  ctx._simulateGoogleCancel = true; // Bật cờ hủy popup

  const failedGoogleLogin = await ctx.SkillAuth.loginWithGoogle();
  assert(failedGoogleLogin.success === false, 'Hệ thống ghi nhận đăng nhập Google thất bại khi hủy popup');
  assert(failedGoogleLogin.code === 'auth/popup-closed-by-user', 'Mã lỗi đúng là auth/popup-closed-by-user');

  const stateAfterH = ctx.getAppState();
  assert(stateAfterH.users.length === countBeforeH, 'Không có tài khoản nào được tạo khi đăng nhập Google thất bại');
  console.log('');

  console.log('================================================================');
  console.log(`   KẾT QUẢ: TẤT CẢ ${passed}/${total} TIÊU CHÍ ĐỀU ĐẠT CHUẨN (100% PASS)`);
  console.log('================================================================');
}

runTests().catch(err => {
  console.error('LỖI KIỂM THỬ:', err);
  process.exit(1);
});
