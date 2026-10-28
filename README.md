# CK_TMDT

## Chạy backend với MySQL

1. Cài Node.js 18 trở lên và MySQL 8 trở lên.
2. Tạo schema bằng mysql client: `mysql -u root -p < data/skillrental.sql`.
3. Sao chép `.env.example` thành `.env`, rồi điền thông tin MySQL, một `AUTH_SECRET` riêng, Google OAuth `GOOGLE_CLIENT_ID` (Web application; thêm origin đang chạy vào Authorized JavaScript origins) và Gmail SMTP App Password để gửi email khôi phục.
4. Cài dependencies bằng `npm install`, sau đó chạy `npm start`.

Ứng dụng lưu dữ liệu ứng dụng trong MySQL, bảng `app_records`, đồng bộ tài khoản vào bảng `users`. Đăng ký email tạo tài khoản ở trạng thái chờ và chỉ kích hoạt sau khi nhấn liên kết xác nhận gửi qua Gmail SMTP. Đăng nhập Google được xác minh ở backend rồi lưu/liên kết hồ sơ vào MySQL. Quên mật khẩu gửi liên kết một lần qua Gmail SMTP; Google chỉ quản lý mật khẩu Google của chính người dùng. Lệnh `npm run seed` khởi tạo dữ liệu mẫu; thêm `-- --force` để nạp lại toàn bộ bộ mẫu.
