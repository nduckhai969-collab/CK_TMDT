# CK_TMDT — Skill Rental

Ứng dụng Node.js/Express, giao diện tĩnh trong `Frontend/` và MySQL làm cơ sở dữ liệu.

## Yêu cầu

- Node.js 18 trở lên và npm.
- MySQL 8 trở lên đang chạy.
- Git để tải mã nguồn và cập nhật phiên bản.

## Chạy lần đầu trên Windows

Mở PowerShell tại thư mục dự án (thư mục có `package.json`), rồi làm theo các bước sau.

### 1. Tải thư viện

```powershell
npm install
```

### 2. Tạo database MySQL

Tạo một database mới dành riêng cho dự án:

```sql
CREATE DATABASE skillrental CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Nếu database này hoàn toàn mới, nạp schema và dữ liệu khởi tạo:

```powershell
cmd /c "mysql -u root -p skillrental < data\skillrental.sql"
```

`data/skillrental.sql` chứa lệnh xóa và tạo lại các bảng. Chỉ chạy lệnh nạp trên một database mới, trống. Nếu đã có dữ liệu cần giữ, **không nạp lại file SQL này**; cấu hình `.env` trỏ vào database hiện có.

### 3. Cấu hình môi trường

Tạo file `.env` từ mẫu:

```powershell
Copy-Item .env.example .env
notepad .env
```

Điền thông tin MySQL cho máy của bạn:

```dotenv
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=mật_khẩu_mysql_của_bạn
MYSQL_DATABASE=skillrental
```

Đổi `AUTH_SECRET` thành một chuỗi bí mật riêng, dài và khó đoán. Không gửi file `.env` cho người khác và không commit file này lên Git.

Để đăng ký/xác nhận email và quên mật khẩu gửi thư được, điền `SMTP_USER`, `SMTP_APP_PASSWORD` và `SMTP_FROM`. Đăng nhập Google cần `GOOGLE_CLIENT_ID`. Thanh toán VNPay cần các cấu hình `VNPAY_*`. Các cấu hình tích hợp này chỉ cần điền khi muốn sử dụng tính năng tương ứng.

### 4. Khởi tạo dữ liệu (nếu cần)

```powershell
npm run seed
```

Lệnh này không nạp lại dữ liệu mẫu nếu database đã có dữ liệu. Không chạy `npm run seed -- --force` trên database cần giữ dữ liệu: tùy chọn `--force` thay toàn bộ dữ liệu ứng dụng bằng dữ liệu mẫu.

### 5. Khởi động ứng dụng

```powershell
npm start
```

Mở [http://localhost:3000](http://localhost:3000). Dừng server bằng `Ctrl+C` trong cửa sổ PowerShell đang chạy server.

## Cập nhật sau khi tải code mới từ Git

Trong thư mục dự án:

```powershell
git pull
npm install
npm start
```

Nếu server đang chạy, dừng bằng `Ctrl+C` trước khi chạy lại. Có thể bỏ qua `npm install` nếu `package.json` và `package-lock.json` không thay đổi. File `.env` và database MySQL là dữ liệu riêng trên máy, Git pull không tự cập nhật hoặc ghi đè chúng.

## Ghi chú dữ liệu

- Ứng dụng lưu các collection trong bảng MySQL `app_records` và đồng bộ tài khoản với bảng quan hệ `users`.
- `npm start` kết nối database theo cấu hình trong `.env`; nếu kết nối thất bại, kiểm tra MySQL đang chạy, tên database, tài khoản và mật khẩu.
- Không dùng `data/skillrental.sql` để cập nhật database đang có dữ liệu vì file này chứa lệnh `DROP TABLE`.
- `npm run check` chạy kiểm tra frontend; lệnh này không khởi động server.
