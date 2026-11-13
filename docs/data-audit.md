# Báo Cáo Rà Soát & Kiểm Toán Dữ Liệu (Data Audit)
**Dự án**: SkillRental / CK_TMDT  
**Tính năng**: Gợi ý thông minh theo khía cạnh (Aspect-based Recommendation)  
**Thời điểm thực hiện**: 2026-10-27  
**Phạm vi**: Schema Firestore & In-memory cache (`data/db.js`, `data/database.json`), các routes và services liên quan.

---

## 1. Bảng trường dữ liệu hiện hữu (Current Schema)

### 1.1. Collection `users`
Lưu thông tin người dùng trên hệ thống (đồng bộ với Firebase Auth qua `uid`).

| Tên trường | Kiểu dữ liệu | Bắt buộc | Mô tả & Giá trị mẫu |
| :--- | :--- | :---: | :--- |
| `id` | `string` | Có | Mã người dùng định dạng `USRxxx` (ví dụ `USR001`) hoặc `ADMxxx` cho Admin. |
| `uid` | `string` | Không | Firebase Auth UID (ví dụ `ZUGPGZNGOtfQTJsqIHlfEHrtSeH3`). |
| `name` | `string` | Có | Họ và tên hiển thị (ví dụ `"Nguyễn Văn An"`). |
| `email` | `string` | Có | Địa chỉ email dùng để đăng nhập. |
| `phone` | `string` | Có | Số điện thoại liên hệ (ví dụ `"0901 234 567"`). |
| `role` | `string` | Có | Vai trò: `'Customer'`, `'Provider'`, hoặc `'Admin'`. |
| `password` | `string` | Không | Mật khẩu mẫu cục bộ (hệ thống production dùng Firebase Auth). |
| `joinDate` | `string` | Có | Ngày tham gia sàn (`"DD/MM/YYYY"`). |
| `spentOrEarned`| `string` | Không | Chuỗi tổng tiền chi/thu formatted (ví dụ `"112.500.000đ"`). |
| `balance` | `number` | Có | Số dư ví tài khoản (VND), mặc định `0`. |
| `status` | `string` | Có | Trạng thái tài khoản: `'active'` hoặc `'locked'`. |
| `avatar` | `string` | Không | URL ảnh đại diện. |
| `address` | `string` | Không | Địa chỉ người dùng. |
| `lockReason` | `string` | Không | Lý do khóa tài khoản nếu `status == 'locked'`. |
| `lockDuration` | `string` | Không | Thời hạn khóa tài khoản. |
| `bio` | `string` | Không | Giới thiệu ngắn cá nhân. |

---

### 1.2. Collection `providers`
Hồ sơ chuyên gia / người cung cấp dịch vụ trên sàn.

| Tên trường | Kiểu dữ liệu | Bắt buộc | Mô tả & Giá trị mẫu |
| :--- | :--- | :---: | :--- |
| `id` | `string` | Có | Mã provider định dạng `PRVxxx` (ví dụ `PRV001`). |
| `userId` | `string` | Có | Khóa ngoại trỏ sang `users.id` (ví dụ `USR001`). |
| `name` | `string` | Có | Tên hiển thị của Provider. |
| `specialty` | `string` | Có | Chuyên môn chính (ví dụ `"Senior Fullstack Web Developer"`). |
| `category` | `string` | Có | Danh mục nghề nghiệp: `'IT'`, `'Design'`, `'Tutor'`, `'Repair'`, `'Home'`, `'Writing'`, `'Marketing'`. |
| `rating` | `number` | Có | Điểm đánh giá trung bình (1.0 - 5.0, làm tròn 1 chữ số thập phân). |
| `reviewCount` | `number` | Có | Tổng số lượt đánh giá đã nhận từ khách hàng. |
| `hourlyRate` | `number` | Có | Mức giá tham khảo theo giờ (VND). |
| `completedOrders` | `number` | Có | Số đơn hàng đã hoàn tất (tự tăng khi hoàn thành đơn). |
| `location` | `string` | Có | Khu vực làm việc (ví dụ `"Quận 1, TP. Hồ Chí Minh"`). |
| `verified` | `boolean` | Có | Trạng thái xác thực hồ sơ/CCCD (`true` / `false`). |
| `badge` | `string` | Không | Huy hiệu sàn cấp (`'PRO PROVIDER'`, `'TOP RATED'`, v.v.). |
| `bio` | `string` | Không | Đoạn văn giới thiệu kinh nghiệm và năng lực. |
| `avatar` | `string` | Có | URL ảnh đại diện. |
| `cover` | `string` | Không | URL ảnh bìa hồ sơ. |
| `skills` | `array[string]`| Có | Danh sách kỹ năng (ví dụ `["React.js", "Node.js"]`). |
| `certifications` | `array[string]`| Không | Bằng cấp, chứng chỉ đã đạt. |
| `packages` | `array[object]`| Không | Danh sách các gói dịch vụ định sẵn (`name`, `price`, `deliveryDays`, `desc`). |
| `availabilityStatus` | `string` | Có | Trạng thái làm việc: `'ready'`, `'busy'`, `'unavailable'`, `'offline'`, `'paused'`. |
| `schedule` | `object` | Không | Cấu trúc lịch làm việc định kỳ (xem chi tiết mục 1.6). |
| `workingHours` | `string` | Không | Chuỗi cấu hình giờ làm việc (ví dụ `"T2-T6, 08:00 - 17:00"`). |
| `bankAccount` | `object` | Không | Thông tin ngân hàng nhận tiền (`bank`, `account`, `holder`). |
| `monthlyEarnings` | `number` | Không | Thu nhập ước tính trong tháng. |
| `activeProjectsCount`| `number` | Không | Số lượng dự án đang thực hiện đồng thời. |

---

### 1.3. Collection `services`
Dịch vụ kỹ năng do Provider đăng bán trên sàn.

| Tên trường | Kiểu dữ liệu | Bắt buộc | Mô tả & Giá trị mẫu |
| :--- | :--- | :---: | :--- |
| `id` | `string` | Có | Mã dịch vụ định dạng `SVCxxx` (ví dụ `SVC001`). |
| `title` | `string` | Có | Tiêu đề gói dịch vụ. |
| `category` | `string` | Có | Danh mục dịch vụ (đồng bộ với `providers.category`). |
| `providerId` | `string` | Có | Khóa ngoại trỏ sang `providers.id` (ví dụ `PRV001`). |
| `providerName` | `string` | Có | Tên người bán tại thời điểm tạo dịch vụ. |
| `providerAvatar` | `string` | Không | URL ảnh đại diện người bán. |
| `price` | `number` | Có | Giá bán niêm yết (VND). |
| `priceUnit` | `string` | Có | Đơn vị tính (`'Dự án'`, `'Gói'`, `'Buổi 90 phút'`, `'Giờ'`, `'Lần đến'`). |
| `duration` | `string` | Có | Thời gian thực hiện dự kiến (ví dụ `"4-7 ngày"`). |
| `rating` | `number` | Có | Đánh giá sao trung bình của riêng dịch vụ này (1.0 - 5.0). |
| `reviewCount` | `number` | Có | Số lượng review cho riêng dịch vụ này. |
| `status` | `string` | Có | Trạng thái dịch vụ: `'active'` hoặc `'inactive'`. |
| `desc` | `string` | Có | Mô tả chi tiết nội dung công việc. |
| `thumbnail` | `string` | Có | URL ảnh minh họa dịch vụ. |
| `sold` | `number` | Không | Số lượt đã bán (tự tăng khi hoàn thành đơn). |

---

### 1.4. Collection `orders`
Quản lý đơn hàng dịch vụ và hợp đồng ký quỹ (Escrow).

| Tên trường | Kiểu dữ liệu | Bắt buộc | Mô tả & Giá trị mẫu |
| :--- | :--- | :---: | :--- |
| `id` | `string` | Có | Mã đơn hàng định dạng `DHxxxxxx` (ví dụ `DH008841`). |
| `customerId` | `string` | Có | Khóa ngoại trỏ sang `users.id` của khách hàng mua. |
| `customerName` | `string` | Có | Tên khách hàng. |
| `customerPhone` | `string` | Không | Số điện thoại khách hàng. |
| `customerAddress`| `string` | Không | Địa chỉ thực hiện nếu là dịch vụ tại chỗ. |
| `providerId` | `string` | Có | Khóa ngoại trỏ sang `providers.id`. |
| `providerName` | `string` | Có | Tên Provider nhận đơn. |
| `providerPhone` | `string` | Không | Số điện thoại Provider. |
| `serviceId` | `string` | Không | Khóa ngoại trỏ sang `services.id` (hoặc `"SVC_CUSTOM"`). |
| `serviceTitle` | `string` | Có | Tên dịch vụ đặt thuê. |
| `price` | `number` | Có | Giá trị dịch vụ thỏa thuận (VND). |
| `priceFormatted` | `string` | Không | Giá định dạng hiển thị (ví dụ `"4.500.000đ"`). |
| `platformFee` | `number` | Có | Phí sàn (5% giá trị đơn hàng). |
| `escrowDeposit` | `number` | Có | Tổng tiền khách ký quỹ (`price + platformFee`). |
| `escrowStatus` | `string` | Có | Trạng thái ký quỹ (xem mục 1.7). |
| `orderStatus` | `string` | Có | Trạng thái tiến độ thực hiện đơn hàng (xem mục 1.7). |
| `paymentMethod` | `string` | Có | Phương thức thanh toán (VNPay, VietQR, Ví điện tử). |
| `paymentStatus` | `string` | Không | Trạng thái thanh toán: `'paid'`, `'pending'`, `'cancelled'`. |
| `date` | `string` | Có | Thời điểm khởi tạo đơn hàng. |
| `deadline` | `string` | Có | Hạn chót hoàn thành. |
| `scheduledDate` | `string` | Không | Ngày hẹn làm việc (`YYYY-MM-DD`). |
| `scheduledTime` | `string` | Không | Khung giờ hẹn (`HH:MM - HH:MM`). |
| `notes` | `string` | Không | Ghi chú yêu cầu của khách hàng. |
| `milestones` | `array[object]`| Không | Tiến trình các cột mốc thực hiện (`title`, `done`, `time`). |
| `progressPercent`| `number` | Không | Phần trăm tiến độ (0 - 100). |
| `deliveredAt` | `string` | Không | Thời điểm bàn giao sản phẩm (ISO string). |
| `handoverNotes` | `string` | Không | Ghi chú bàn giao / link sản phẩm nghiệm thu. |
| `cancelledBy` | `string` | Không | Vai trò bên hủy đơn (`'Customer'` hoặc `'Provider'`). |
| `cancelReason` | `string` | Không | Lý do hủy đơn. |

---

### 1.5. Collection `reviews`
Đánh giá và phản hồi của khách hàng sau khi hoàn tất đơn hàng.

| Tên trường | Kiểu dữ liệu | Bắt buộc | Mô tả & Giá trị mẫu |
| :--- | :--- | :---: | :--- |
| `id` | `string` | Có | Mã đánh giá định dạng `REVxxx` (ví dụ `REV001`). |
| `orderId` | `string` | Có | Khóa ngoại trỏ sang `orders.id` (ví dụ `DH001231`). |
| `customerId` | `string` | Có | Khóa ngoại trỏ sang `users.id` của người gửi đánh giá. |
| `customerName` | `string` | Có | Tên khách hàng. |
| `serviceId` | `string` | Không | Khóa ngoại trỏ sang `services.id` (nếu có). |
| `providerId` | `string` | Có | Khóa ngoại trỏ sang `providers.id`. |
| `providerName` | `string` | Có | Tên Provider được đánh giá. |
| `serviceTitle` | `string` | Có | Tên dịch vụ được đánh giá. |
| `rating` | `number` | Có | Điểm đánh giá tổng quan (số nguyên từ 1 đến 5). |
| `content` | `string` | Có | Nội dung nhận xét (từ 3 đến 2000 ký tự). |
| `date` | `string` | Có | Ngày gửi nhận xét (`"DD/MM/YYYY"`). |
| `criteria` | `array[string]`| Không | Danh sách tiêu chí nhanh (ví dụ `["Đúng giờ", "Nhiệt tình"]`). |
| `reply` | `object` | Không | Phản hồi của Provider (`{ content, date }`). |

---

### 1.6. Quy ước Lịch rảnh & Sẵn sàng (Availability & Schedule)
Được định nghĩa tại `routes/providerAvailability.js` và hồ sơ `providers`:
1. **`availabilityStatus`**:
   - `'ready'`: Sẵn sàng nhận việc và lịch hẹn.
   - Trạng thái bận / không khả dụng: `['busy', 'unavailable', 'offline', 'inactive', 'paused']` -> Hàm `slotsForDate()` lập tức trả về `[]` (không có khung giờ trống).
2. **Cấu trúc lưu lịch rảnh (`schedule.slots`)**:
   - Là một mảng 7 phần tử ứng với các thứ: `['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']`.
   - Mỗi phần tử có dạng:
     ```json
     { "day": "T2", "morning": true, "afternoon": true, "evening": false }
     ```
   - Định nghĩa ca trong ngày qua `TIME_SLOTS`:
     - `morning`: 10:00 - 12:00
     - `afternoon`: 12:00 - 14:00
     - `evening`: 18:00 - 20:00 và 20:00 - 22:00
3. **Cơ chế ngoại lệ và nghỉ phép**:
   - `provider.vacation`: `{ active: boolean, from: "YYYY-MM-DD", to: "YYYY-MM-DD" }` (chặn toàn bộ lịch trong khoảng ngày).
   - `provider.dateExceptions`: `{ "YYYY-MM-DD": "off" | "available" }` (ghi đè lịch của từng ngày cụ thể).

---

### 1.7. Quy ước Trạng thái Đơn hàng & Ký quỹ (Order & Escrow Statuses)
Hệ thống quản lý 2 trạng thái song song trong `orders`:
1. **`orderStatus` (Tiến độ thực hiện)**:
   - `pending`: Chờ người bán tiếp nhận.
   - `processing`: Người bán đã nhận việc và đang triển khai.
   - `delivered`: Người bán đã bàn giao sản phẩm/dịch vụ, chờ khách nghiệm thu.
   - `completed`: Khách đã nghiệm thu hoặc hệ thống tự giải ngân sau 48h.
   - `cancelled`: Đơn hàng bị hủy trước khi bàn giao.
   - `disputed`: Đơn hàng phát sinh khiếu nại/tranh chấp.
2. **`escrowStatus` (Tiền ký quỹ sàn bảo vệ)**:
   - `pending` / `payment_pending`: Chờ thanh toán tiền ký quỹ.
   - `escrow_held`: Tiền ký quỹ đã được thanh toán và giữ an toàn tại sàn.
   - `completed`: Tiền đã giải ngân cho người bán (sau khi trừ phí sàn 5%).
   - `refunded`: Tiền đã hoàn lại vào ví khách hàng.
   - `disputed`: Tiền bị phong tỏa để Admin giải quyết khiếu nại.
   - `force_released`: Admin can thiệp giải ngân cưỡng chế cho người bán.
   - `payment_cancelled`: Hủy đơn khi chưa thanh toán tiền ký quỹ.

---

### 1.8. Cơ chế tính Sao & Đánh giá hiện tại
Quy tắc triển khai tại `routes/reviewRoutes.js` (dòng 87-106):
- Khi có review hợp lệ mới được gửi qua `POST /api/reviews`:
  1. Lấy toàn bộ đánh giá của Provider từ collection `reviews`:
     ```javascript
     const provReviews = reviews.filter(r => r.providerId === provider.id);
     const avg = provReviews.reduce((sum, r) => sum + r.rating, 0) / provReviews.length;
     provider.rating = Math.round(avg * 10) / 10;
     provider.reviewCount = provReviews.length;
     ```
  2. Nếu review có `serviceId`, cập nhật tương tự cho `services`:
     ```javascript
     const serviceReviews = reviews.filter(item => item.serviceId === service.id);
     service.rating = Math.round(serviceReviews.reduce((sum, item) => sum + item.rating, 0) / serviceReviews.length * 10) / 10;
     service.reviewCount = serviceReviews.length;
     ```
- **Nhận xét**: Điểm sao hiện tại là trung bình cộng số học đơn thuần trên thang 1-5, chưa phân rã theo khía cạnh chất lượng, tiến độ hay thái độ.

---

## 2. Bảng trường cần thêm cho Hệ thống Gợi ý (New Fields Design)

Đối chiếu schema thật, phân loại rõ các trường đã có sẵn và các trường cần bổ sung:

| Collection | Tên trường | Trạng thái | Kiểu dữ liệu | Giá trị mặc định | Mô tả chi tiết |
| :--- | :--- | :---: | :--- | :--- | :--- |
| **`providers`** | `aspectScores` | **MỚI** | `object` / `null` | `null` | Điểm số tổng hợp 5 khía cạnh (thang 1-5): `{ quality, price, speed, attitude, warranty }`. Khi chưa đủ dữ liệu tính điểm thì giữ `null`. |
| **`providers`** | `cancelRate` | **MỚI** | `number` | `0` | Tỷ lệ hủy đơn hàng của Provider (khoảng giá trị: `0.0` đến `1.0` hoặc phần trăm `0 - 100%`). |
| **`providers`** | `verified` | *ĐÃ CÓ SẴN* | `boolean` | `false` | Đã có sẵn trong schema hiện tại (xác thực CCCD/hồ sơ). Kế thừa nguyên vẹn. |
| **`providers`** | `completedOrders` | *ĐÃ CÓ SẴN* | `number` | `0` | Đã có sẵn trong schema hiện tại (tự động cộng 1 khi giải ngân thành công). Kế thừa nguyên vẹn. |
| **`providers`** | `reviewCount` | *ĐÃ CÓ SẴN* | `number` | `0` | Đã có sẵn trong schema hiện tại (đếm tổng số review nhận được). Kế thừa nguyên vẹn. |
| **`services`** | `aspectScores` | **MỚI** | `object` / `null` | `null` | Điểm số 5 khía cạnh của dịch vụ: `{ quality, price, speed, attitude, warranty }` (thang 1-5). Trong đó `price` tính từ giá dịch vụ so với giá trung bình danh mục. |
| **`services`** | `reviewCount` | *ĐÃ CÓ SẴN* | `number` | `0` | Đã có sẵn trong schema hiện tại. |
| **`users`** | `aspectWeights` | **MỚI** | `object` | `{ quality: 0.2, price: 0.2, speed: 0.2, attitude: 0.2, warranty: 0.2 }` | Vector trọng số thể hiện mức độ quan tâm của người dùng với 5 khía cạnh. Tổng 5 trọng số bắt buộc bằng `1.0`. |
| **`reviews`** | `groundTruth` | **MỚI** | `object` / `null` | `null` | Nhãn kiểm thử dùng để huấn luyện và đánh giá mô hình ML: `{ aspects: { quality: -1\|0\|1, price: -1\|0\|1, speed: -1\|0\|1, attitude: -1\|0\|1, warranty: -1\|0\|1 }, sentiment: "positive"\|"negative"\|"neutral" }`. Mặc định `null` cho review thông thường. |

---

## 3. Danh sách dữ liệu mẫu bị lỗi / không nhất quán (Audit Findings)
*Lưu ý: Tuân thủ quy tắc bắt buộc: CHỈ GHI NHẬN KIỂM TOÁN, TUYỆT ĐỐI KHÔNG TỰ Ý XÓA HOẶC SỬA DỮ LIỆU CŨ.*

1. **`PRV004` (Trần Đình Trọng)**:
   - `userId` được gán giá trị `"USR003b"`.
   - Lỗi: Mã `"USR003b"` không tồn tại trong collection `users` (dẫn tới lỗi không tìm thấy tài khoản sở hữu khi thực hiện các nghiệp vụ liên quan tới provider).
2. **`PRV005` (Lê Thị Duyên)**:
   - `userId` được gán giá trị `"USR003c"`.
   - Lỗi: Mã `"USR003c"` không tồn tại trong collection `users`.
3. **`PRV006` (Vũ Thị Minh)**:
   - `userId` được gán giá trị `"USR006"`.
   - Lỗi: Bản ghi `users` ứng với `"USR006"` có `role: "Customer"` thay vì `"Provider"`. Người bán này không có quyền thao tác trên kênh đối tác nếu phân quyền kiểm tra strictly theo role.
4. **`USR007` (Đặng Quốc Huy)**:
   - Tài khoản có `role: "Provider"`.
   - Lỗi: Không có bản ghi nào trong `providers` trỏ tới `USR007` (trong `database.json`, `PRV007` đang liên kết với `USR126`). Tài khoản này là Provider nhưng chưa có hồ sơ hiển thị.
5. **Đơn hàng có `serviceId` bất thường (`"SVC_CUSTOM"`)**:
   - Các đơn hàng `DH004891`, `DH009727`, `DH009708`, `DH002964`, `DH006380` có trường `serviceId: "SVC_CUSTOM"`.
   - Ghi chú: Đây là các đơn hàng đặt theo thỏa thuận riêng/báo giá tùy chỉnh, mã này không có trong danh mục dịch vụ `services`.
6. **Đánh giá thiếu đơn hàng tham chiếu (`REV002`)**:
   - Bản ghi `REV002` có `orderId: "DH001190"`.
   - Lỗi: Mã `"DH001190"` không tồn tại trong collection `orders` (đơn hàng mẫu có thể đã bị dọn dẹp hoặc thiếu trong file seed cũ).

---

## 4. Nguyên tắc sinh dữ liệu thử nghiệm cho các phần tiếp theo
- Mọi dữ liệu mẫu mới sinh ra phục vụ tính năng Recommender System bắt buộc phải có khóa ngoại hợp lệ (`userId` tồn tại với đúng role, `providerId` và `serviceId` có thật).
- Toàn bộ dữ liệu seed thử nghiệm phải được gắn cờ `seedTag: "reco-eval"`.
- Dữ liệu thử nghiệm đi qua cơ chế script seed (`scripts/`), đảm bảo tính lũy đẳng (idempotent), không nhân đôi bản ghi và hỗ trợ `--force`.
