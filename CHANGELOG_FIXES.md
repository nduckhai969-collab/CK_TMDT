# Các lỗi đã sửa (đợt 1)

## 1. Lỗi gốc làm hỏng nhiều chức năng
- `utils/id.js` xuất `generateId` nhưng 3 file import `{ id: generateId }` -> `generateId is not a function`
  làm đặt hàng, hủy đơn, thông báo, nạp VNPay, checkout giỏ hàng đều trả 500.
  Đã xuất cả hai tên, sửa import, id sinh theo thời gian nên khó trùng.
- `data/db.js`: thêm `comments`, `notifications`, `walletTransactions`, `bookingLists` vào danh sách collection.
  Trước đây dữ liệu vẫn ghi lên MySQL nhưng server không nạp lại sau khi khởi động.

## 2. Đơn hàng, hủy đơn, thông báo
- `services/orderService.js` viết lại: người bán được xác định qua `providers.userId`
  (trước đây so `PRV001` với `USR001` nên Provider không bao giờ nhận/giao/hủy được đơn).
- Thông báo cho người bán gửi theo userId (`notifyProvider`), trước đây gửi tới `PRVxxx` nên không ai nhận.
- Hủy đơn: pending/processing -> hoàn đủ (giá + phí) cho khách; đã bàn giao -> tranh chấp; không hủy/hoàn 2 lần.
- Mã lỗi đúng (403/404/409) thay vì 400 chung chung.
- Đánh giá: sửa `order.status` thành `order.orderStatus` (trước đây mọi đánh giá đều bị từ chối);
  providerId lấy từ đơn hàng, giới hạn 1-5 sao.

## 3. Giải ngân, người bán, sắp xếp
- `release-escrow` (khách) và `force-release` / `force-refund` (admin) có kiểm tra trạng thái:
  không giải ngân đơn đã hủy/hoàn tiền, không trả tiền hai lần.
- Khi đơn hoàn tất: `providers.completedOrders` +1 và `services.sold` +1
  (để sắp xếp theo "đã bán" và "provider được thuê nhiều nhất" có số liệu thật).
- `GET /api/providers/me` trước đây bị route `/:id` chặn (404): đã đưa các route cố định lên trước.
- Thêm các đường dẫn mà `provider.js` đang gọi: `POST /api/providers/orders/:id/{accept,progress,deliver}`,
  `POST /api/providers/reviews/:id/reply`, `GET /api/providers/me/reviews`.
- `/api/providers/stats` đọc đúng collection `jobRequests`.

## 4. Thống kê
- `Frontend/statistics.js` viết lại: sửa lỗi cú pháp, dùng `GET /api/admin/statistics` (dữ liệu MySQL),
  khoảng ngày tùy chọn, tự gom theo tháng khi khoảng dài, biểu đồ tròn theo cùng khoảng ngày.
- `common.js`: thêm `adminApi.getStatistics` (trước đây chưa định nghĩa).
- `adminRoutes.js`: đọc ngày `YYYY-MM-DD` theo giờ địa phương (trước đây ở múi giờ +7 đơn của ngày đầu bị loại).

## 5. Thanh toán VNPay (phát hiện khi kiểm thử)
- `querystring.stringify(obj, { encode: false })` coi `{encode:false}` là dấu phân tách nên URL và chữ ký chứa
  `[object Object]`: đã thay bằng hàm ghép chuỗi đúng.
- Express 5: `req.query` không có prototype nên `obj.hasOwnProperty` làm return/ipn trả 500: đã sửa.
- TMN code, secret, return URL đọc từ `.env` (`VNPAY_*`, xem `.env.example`); mặc định chỉ để demo.

## Chưa làm trong đợt này
- Giao diện: chuông thông báo, bình luận, nút hủy đơn cho khách, giỏ hàng (booking list), nút nạp VNPay.
- Các endpoint người bán còn thiếu mà `provider.js` gọi (skills, hourly-rate, certifications, services POST/PUT,
  complaints, packages, posts, bank-account...).
- Ghi sổ `walletTransactions` cho escrow / hoàn tiền / giải ngân.
- File thừa: `routes/cartRoutes.js`, `rename.js`.
- Dữ liệu mẫu: PRV004/PRV005 có userId không tồn tại, PRV006 gắn với tài khoản Customer, USR007 (Provider) chưa có hồ sơ.
