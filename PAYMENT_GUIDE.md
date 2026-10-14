# Thanh toán trực tuyến (VNPay) - hướng dẫn cho nhóm

## 1. Các cách thanh toán
| Phương thức trên giao diện | Cách xử lý |
|---|---|
| Số dư tài khoản (Escrow) | Trừ ví và ký quỹ ngay. |
| Ví VNPay / MoMo | Chuyển sang cổng VNPay, khách chọn ví / QR / ngân hàng ngay trên trang VNPay. |
| Chuyển khoản VietQR | Chuyển sang cổng VNPay với kênh `VNPAYQR` (quét mã QR bằng app ngân hàng). |
| Thẻ tín dụng quốc tế | Chuyển sang cổng VNPay với kênh `INTCARD` (Visa / Mastercard / JCB). |

> "MoMo" chỉ là nhãn cũ trên giao diện: cổng VNPay không đi qua ví MoMo. Muốn thanh toán MoMo thật phải tích hợp riêng cổng MoMo.

Nạp ví cũng qua VNPay (`/customer_wallet.html`): chọn kênh QR / ATM nội địa / thẻ quốc tế, từ 10.000đ đến 50.000.000đ.

## 2. Luồng thanh toán đơn hàng qua cổng
```
Khách bấm thanh toán  ->  server tạo đơn "CHỜ THANH TOÁN" (giữ khung giờ) + giao dịch pending
        |                      + trả về paymentUrl (đã ký HMAC-SHA512)
        v
   Cổng VNPay  --Return URL-->  GET /api/payments/vnpay/return  -> /customer_orders.html?payment=success|failed
        |
        +------IPN (server tới server)-->  GET /api/payments/vnpay/ipn
```
- Thành công: đơn chuyển `paid` + `escrow_held`, **lúc này Provider mới thấy đơn và được báo**.
- Thất bại / khách hủy trên cổng: đơn vẫn chờ thanh toán, khách bấm **"Thanh toán ngay"** ở trang đơn hàng để thử lại.
- Không thanh toán trong 30 phút (`ORDER_PAYMENT_WINDOW_MINUTES`): đơn tự hủy, khung giờ được nhả, không mất tiền.
- Nếu VNPay báo thành công **sau khi** đơn đã bị hủy / hết hạn: số tiền được cộng vào ví khách (có dòng "Hoàn tiền" trong lịch sử), đơn không sống lại.
- Return URL và IPN dùng chung một hàm xử lý, mỗi giao dịch chỉ xử lý 1 lần (gọi lặp không cộng tiền / tạo thông báo lần hai).
- Server kiểm tra: chữ ký, mã giao dịch, **số tiền khớp** `vnp_Amount = số tiền × 100`, mã phản hồi `00`.

## 3. API
| Phương thức | Đường dẫn | Ghi chú |
|---|---|---|
| POST | `/api/payments/vnpay/create` | Nạp ví. Body: `{ amount, bankCode? }` |
| POST | `/api/payments/vnpay/orders/:orderId` | Thanh toán lại đơn đang chờ. Body: `{ bankCode? }` |
| GET | `/api/payments/vnpay/return` | VNPay chuyển trình duyệt khách về đây |
| GET | `/api/payments/vnpay/ipn` | VNPay gọi ngầm. Trả `RspCode` 00 / 01 / 02 / 04 / 97 |
| GET | `/api/payments/status/:txnRef` | Trạng thái 1 giao dịch (chỉ chủ giao dịch) |
| GET | `/api/payments/transactions` | Lịch sử giao dịch của tôi. Query: `type`, `status`, `limit`, `offset` |
| POST | `/api/booking-list/checkout` | Giỏ hàng. Phương thức qua cổng trả thêm `paymentUrl` |
| POST | `/api/orders` | Đặt 1 dịch vụ. Phương thức qua cổng trả thêm `paymentUrl` |

## 4. Cấu hình `.env`
```
VNPAY_TMN_CODE=...        # Terminal ID do VNPay cấp (email đăng ký sandbox)
VNPAY_HASH_SECRET=...     # Secret Key
VNPAY_RETURN_URL=http://localhost:3000/api/payments/vnpay/return
# Tùy chọn
VNPAY_EXPIRE_MINUTES=15
ORDER_PAYMENT_WINDOW_MINUTES=30
```
Chưa điền hai khóa đầu thì server dùng khóa demo (có cảnh báo trong console): cổng VNPay sẽ từ chối giao dịch.

Cách lấy khóa: đăng ký merchant sandbox tại trang đăng ký của VNPay (`sandbox.vnpayment.vn/devreg`), VNPay gửi TMN Code + Secret Key qua email.

## 5. Chạy thử trên sandbox
1. `npm start`, đăng nhập tài khoản khách, thêm dịch vụ vào giỏ, chọn lịch, chọn "Ví VNPay / MoMo", bấm **Thanh Toán Qua VNPay**.
2. Trên trang VNPay sandbox chọn "Thẻ nội địa và tài khoản ngân hàng" -> ngân hàng **NCB** và dùng thẻ thử do VNPay công bố
   (theo tài liệu sandbox, thường là số thẻ `9704198526191432198`, tên `NGUYEN VAN A`, ngày phát hành `07/15`, OTP `123456`;
   hãy đối chiếu lại với tài liệu VNPay vì thông tin có thể thay đổi).
3. Sau khi thanh toán, trình duyệt quay về `/customer_orders.html?payment=success`.

**IPN khi chạy local:** VNPay không gọi được `localhost`. Trên local, kết quả vẫn được ghi nhận nhờ Return URL.
Muốn thử IPN: chạy `ngrok http 3000`, đặt IPN URL trong trang quản trị merchant của VNPay thành
`https://<tên-ngrok>/api/payments/vnpay/ipn` và `VNPAY_RETURN_URL` thành `https://<tên-ngrok>/api/payments/vnpay/return`.

## 6. Lưu ý
- Khóa `VNPAY_HASH_SECRET` là bí mật: chỉ để trong `.env`, không commit.
- Đặt một dịch vụ trực tiếp (`customer_booking.html` / chọn ứng viên ở `customer_requests.html`) hiện không gửi `serviceId`, nên giá lấy theo `price` do trình duyệt gửi.
  Với đơn từ giỏ hàng thì giá luôn lấy từ dịch vụ ở server.
- Hạn mức mỗi giao dịch (10.000đ - 50.000.000đ) đặt trong `services/checkoutService.js`.
