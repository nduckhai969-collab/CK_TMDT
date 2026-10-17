# Cài đặt Firebase cho SkillRental

Kiến trúc: **Express giữ nguyên** + Firebase làm nền.
- Frontend đăng nhập bằng **Firebase Auth** (email xác nhận, quên mật khẩu do Firebase gửi).
- Mọi request tới `/api/...` tự động gắn `Authorization: Bearer <ID token>` (xem `Frontend/js/firebase-client.js`).
- Express xác thực token bằng **Firebase Admin SDK** (`routes/customerAuth.js`) rồi đọc/ghi **Firestore** (`data/db.js`).
- Phân quyền theo role (`Customer` / `Provider` / `Admin`) lưu trong collection `users`.

## 1. Tạo project Firebase
1. https://console.firebase.google.com → **Add project**.
2. **Build > Authentication > Get started > Sign-in method** → bật **Email/Password**.
3. **Build > Firestore Database > Create database** (chọn *production mode*, region gần Việt Nam, ví dụ `asia-southeast1`).
4. (Khuyên dùng) **Authentication > Templates**: đổi ngôn ngữ email sang Tiếng Việt, sửa tên người gửi/nội dung.

## 2. Lấy khóa
- **Web config** (công khai): Project settings > General > *Your apps* > Web app (`</>`) → copy `firebaseConfig` vào `Frontend/js/firebase-config.js`.
- **Service account** (BÍ MẬT): Project settings > Service accounts > *Generate new private key* → lưu thành `serviceAccountKey.json` ở thư mục gốc dự án (đã có trong `.gitignore`, **không commit**).
- **Web API Key**: Project settings > General > Web API Key → điền `FIREBASE_WEB_API_KEY` trong `.env` (dùng cho đổi mật khẩu).

## 3. Chạy
```bash
npm install
cp .env.example .env        # rồi chỉnh các giá trị
npm run seed                # nhập database.json lên Firestore + tạo tài khoản Auth mẫu
npm start
```
Tài khoản mẫu (mật khẩu tạm `SkillRental@123`, đổi trong `.env` bằng `SEED_DEFAULT_PASSWORD`):
`admin@skillrental.com` (Admin), `long.le@example.com` (Customer), `minh.nguyen@example.com` (Provider).

## 4. Security Rules (bắt buộc trước khi public)
Server dùng Admin SDK nên bỏ qua Rules; Rules chỉ để **chặn truy cập trực tiếp từ trình duyệt**:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} { allow read, write: if false; }
  }
}
```

## 5. Hoạt động thế nào
| Luồng | Cách làm |
|---|---|
| Đăng ký | `SkillAuth.register` → tạo user Firebase → `POST /api/auth/register` (tạo hồ sơ, role chỉ Customer/Provider) → gửi email xác nhận → đăng xuất, chờ xác nhận |
| Đăng nhập | `SkillAuth.login` → chặn nếu chưa xác nhận email → `POST /api/auth/login` lấy hồ sơ |
| Đăng xuất | `SkillAuth.logout` (xóa session + `signOut`) |
| Quên mật khẩu | link "Quên mật khẩu?" trong modal đăng nhập → `sendPasswordResetEmail` |
| Admin API | `app.use('/api/admin', requireAdmin, adminRoutes)` |

## 6. Giới hạn cần biết
- `data/db.js` nạp toàn bộ Firestore vào RAM khi khởi động và ghi ngược các document thay đổi: **chỉ chạy 1 instance server**, và chưa có transaction cho tiền (đủ cho đồ án, chưa đủ cho production).
- Gói Spark miễn phí giới hạn lượt đọc/ghi mỗi ngày; mỗi lần khởi động server đọc toàn bộ collection.
- `data/db.file.backup.js` là bản db.js cũ (file JSON) để quay lại nếu cần.
