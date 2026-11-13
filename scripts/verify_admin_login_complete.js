require('dotenv').config();
const https = require('https');
const http = require('http');

const FIREBASE_API_KEY = 'AIzaSyD66MsMsukF0xiYsUgxOX9-C_A-7f7Pn6c';

function signInWithFirebase(email, password) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      email,
      password,
      returnSecureToken: true
    });
    const req = https.request({
      hostname: 'identitytoolkit.googleapis.com',
      path: '/v1/accounts:signInWithPassword?key=' + FIREBASE_API_KEY,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            resolve({ success: false, error: parsed.error.message });
          } else {
            resolve({
              success: true,
              idToken: parsed.idToken,
              email: parsed.email,
              localId: parsed.localId
            });
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function callBackendApi(path, method = 'GET', token = null, body = null) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (token) headers['Authorization'] = 'Bearer ' + token;
    let postData = null;
    if (body) {
      headers['Content-Type'] = 'application/json';
      postData = JSON.stringify(body);
      headers['Content-Length'] = Buffer.byteLength(postData);
    }
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function runVerification() {
  console.log('================================================================');
  console.log('   KIỂM THỬ TOÀN DIỆN LUỒNG ĐĂNG NHẬP VÀ PHÂN QUYỀN ADMIN   ');
  console.log('================================================================\n');

  // Khởi động server test trên cổng 3001 với mã nguồn mới nhất
  const app = require('../server');
  const db = require('../data/db');
  await db.init();

  const testServer = http.createServer(app);
  await new Promise(r => testServer.listen(3005, r));
  console.log('Test Server đang chạy trên cổng 3005 với mã nguồn mới nhất.');

  function callTestApi(path, method = 'GET', token = null, body = null) {
    return new Promise((resolve, reject) => {
      const headers = {};
      if (token) headers['Authorization'] = 'Bearer ' + token;
      let postData = null;
      if (body) {
        headers['Content-Type'] = 'application/json';
        postData = JSON.stringify(body);
        headers['Content-Length'] = Buffer.byteLength(postData);
      }
      const req = http.request({
        hostname: 'localhost',
        port: 3005,
        path,
        method,
        headers
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch (e) {
            resolve({ status: res.statusCode, raw: data });
          }
        });
      });
      req.on('error', reject);
      if (postData) req.write(postData);
      req.end();
    });
  }

  const accounts = [
    {
      name: 'ADM001 (admin@skillrental.com)',
      email: 'admin@skillrental.com',
      password: 'SkillRental@123',
      expectedId: 'ADM001',
      expectedUid: 'ZUGPGZNGOtfQTJsqIHlfEHrtSeH3'
    },
    {
      name: 'ADM002 (skillrentaladmin@gmail.com)',
      email: 'skillrentaladmin@gmail.com',
      password: 'admin123@',
      expectedId: 'ADM002',
      expectedUid: 'xeANHaeYvocn4udmyaI8cMccCc22'
    }
  ];

  for (const acc of accounts) {
    console.log(`\n--- KIỂM TRA TÀI KHOẢN: ${acc.name} ---`);
    
    // Bước 1: Xác thực Firebase Authentication
    console.log(`1. Xác thực email & mật khẩu qua Firebase Authentication...`);
    const fbRes = await signInWithFirebase(acc.email, acc.password);
    if (!fbRes.success) {
      console.error(`  ❌ Thất bại: ${fbRes.error}`);
      continue;
    }
    console.log(`  ✅ Firebase Auth thành công!`);
    console.log(`     - UID: ${fbRes.localId}`);
    console.log(`     - Email: ${fbRes.email}`);
    if (fbRes.localId !== acc.expectedUid) {
      console.error(`  ❌ UID không khớp kỳ vọng (${acc.expectedUid})!`);
    } else {
      console.log(`  ✅ UID khớp 100% với kỳ vọng.`);
    }

    // Bước 2: Gửi Firebase ID Token lên Backend API /api/auth/login
    console.log(`2. Gửi Firebase ID Token lên Backend POST /api/auth/login...`);
    const srvRes = await callTestApi('/api/auth/login', 'POST', fbRes.idToken);
    console.log(`  Status Code: ${srvRes.status}`);
    console.log(`  Response:`, JSON.stringify(srvRes.data, null, 2));

    if (srvRes.status === 200 && srvRes.data && srvRes.data.success) {
      const user = srvRes.data.user;
      console.log(`  ✅ Backend xác thực hồ sơ thành công!`);
      console.log(`     - ID: ${user.id} (Kỳ vọng: ${acc.expectedId})`);
      console.log(`     - Role: ${user.role} (Kỳ vọng: Admin)`);
      console.log(`     - Status: ${user.status} (Kỳ vọng: active)`);
      console.log(`     - UID: ${user.uid} (Kỳ vọng: ${acc.expectedUid})`);

      if (user.role === 'Admin' && user.status === 'active') {
        console.log(`  ✅ ĐỦ ĐIỀU KIỆN CHUYỂN HƯỚNG VÀO CỔNG ADMIN (admin.html)!`);
      } else {
        console.error(`  ❌ Sai vai trò hoặc tài khoản không active!`);
      }
    } else {
      console.error(`  ❌ Backend từ chối đăng nhập!`, srvRes);
    }

    // Bước 3: Kiểm tra quyền truy cập API quản trị /api/admin/users
    console.log(`3. Kiểm tra truy cập API bảo vệ: GET /api/admin/users với Bearer Token...`);
    const adminRes = await callTestApi('/api/admin/users', 'GET', fbRes.idToken);
    console.log(`  Status Code: ${adminRes.status}`);
    if (adminRes.status === 200 && adminRes.data && adminRes.data.success) {
      console.log(`  ✅ Tải danh sách người dùng thành công: ${adminRes.data.total || (adminRes.data.users && adminRes.data.users.length)} người dùng.`);
    } else {
      console.error(`  ❌ Không thể tải danh sách người dùng!`, adminRes);
    }
  }

  // Bước 4: Thử đăng nhập với mật khẩu sai để đảm bảo bảo mật
  console.log('\n--- KIỂM TRA BẢO MẬT: Đăng nhập với mật khẩu sai ---');
  const wrongRes = await signInWithFirebase('skillrentaladmin@gmail.com', 'wrong_password_xyz');
  console.log(`  Kết quả đăng nhập mật khẩu sai:`, wrongRes.error);
  if (!wrongRes.success && wrongRes.error.includes('INVALID_LOGIN_CREDENTIALS')) {
    console.log(`  ✅ Bảo mật hoạt động chuẩn: Firebase Auth từ chối mật khẩu sai.`);
  }

  console.log('\n================================================================');
  console.log('                     HOÀN TẤT KIỂM THỬ                         ');
  console.log('================================================================');
}

runVerification()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Lỗi kiểm thử:', err);
    process.exit(1);
  });
