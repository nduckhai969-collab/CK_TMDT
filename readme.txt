# Ghi chú dự án

Ứng dụng dùng Express, MySQL và các trang HTML/JavaScript trong thư mục Frontend.

- Cài MySQL schema: mysql -u root -p < data/skillrental.sql
- Sao chép .env.example thành .env và cấu hình MySQL, AUTH_SECRET.
- Chạy: npm install && npm start
- Dữ liệu nghiệp vụ được lưu trong bảng app_records.
- Các trang frontend dùng js/auth-client.js cho đăng nhập email/mật khẩu qua API MySQL.
