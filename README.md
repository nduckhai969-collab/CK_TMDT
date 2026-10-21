# CK_TMDT

## Dùng ứng dụng trên nhiều máy trong cùng mạng

Chỉ cần chạy backend trên một máy làm máy chủ. Tại thư mục dự án trên máy đó, chạy `npm start` và giữ cửa sổ server hoạt động. Máy chủ cần có cấu hình Firebase Admin trong `.env` hoặc biến môi trường.

Trên máy chủ, dùng `ipconfig` để xem địa chỉ IPv4 của card mạng đang kết nối. Các máy khác cùng mạng mở `http://<IPv4-máy-chủ>:3000` trên trình duyệt; không mở `localhost` và không chạy server riêng trên từng máy. Ví dụ: `http://192.168.1.20:3000`.

Nếu không kết nối được, cần cho phép Node.js/cổng TCP `3000` qua Windows Firewall trên máy chủ. Muốn truy cập từ ngoài mạng LAN, cần triển khai backend lên một máy chủ có domain/HTTPS; Firebase chỉ lưu dữ liệu, không tự chạy Express backend.
