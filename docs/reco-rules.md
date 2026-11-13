# Quy tắc phát triển tính năng: GỢI Ý THÔNG MINH THEO KHÍA CẠNH
Dự án: SkillRental / CK_TMDT
Tài liệu tham chiếu chuẩn cho tất cả các giai đoạn triển khai tính năng Recommender System.

---

## 1. Mục tiêu tính năng
- Cho phép người dùng lựa chọn mức độ quan tâm (trọng số) giữa 5 khía cạnh:
  1. `quality`: Tay nghề / chất lượng dịch vụ.
  2. `price`: Giá cả hợp lý / cạnh tranh.
  3. `speed`: Nhanh chóng / đúng tiến độ, đúng giờ.
  4. `attitude`: Thái độ phục vụ / giao tiếp / nhiệt tình.
  5. `warranty`: Chế độ bảo hành / hậu mãi / hỗ trợ sau bàn giao.
- Hệ thống xếp hạng Top-K provider/service phù hợp nhất kèm giải thích lý do gợi ý (explanation).
- Cơ chế tính điểm khía cạnh:
  - 4 khía cạnh (`quality`, `speed`, `attitude`, `warranty`): trích xuất từ văn bản đánh giá (reviews) bằng **MÔ HÌNH HỌC MÁY (ML/NLP)**.
  - Riêng khía cạnh `price`: tính toán định lượng dựa trên `services.price` so với mức giá trung bình của toàn danh mục tương ứng.

---

## 2. Quy tắc bắt buộc cho mọi giai đoạn

### 2.1. Cấu trúc thư mục & Quy ước giao diện (Frontend)
- Mọi file giao diện mới (HTML, CSS, assets) phải đặt trong thư mục `Frontend/` (chữ F hoa). Mã script client đặt trong `Frontend/js/`.
- Tuyệt đối không tạo file `.html` hoặc `.css` ở thư mục gốc của repository.
- Giữ nguyên chữ hoa/thường của `Frontend` trong `server.js` (dòng 54, 157) và `firebase.json` (dòng 3). Không chuyển thành `frontend` thường để tránh lỗi 404 khi deploy môi trường Linux/Firebase.
- Sau mỗi phần có can thiệp/sửa đổi thư mục `Frontend/`, bắt buộc chạy:
  ```bash
  npm run check
  # hoặc chạy trực tiếp nếu PowerShell chặn script:
  node scripts/checkFrontend.js
  ```
  Chỉ tiếp tục khi script kiểm tra trả về `OK` (0 lỗi, 0 file thừa ở gốc).

### 2.2. Kiến trúc Backend & Luồng thanh toán
- Tuyệt đối không đụng chạm đến luồng thanh toán: `paymentRoutes.js`, `vnpayService.js`, `checkoutService.js`, `routes/paymentRoutes.js`.
- Route API mới được khai báo trong `routes/`, bóc tách logic sang `services/`, và mount trong `server.js` đồng bộ với phong cách hiện tại.
- Tuân thủ cú pháp và hành vi của **Express 5** (chú ý `req.query`, không dùng `hasOwnProperty` trực tiếp, xử lý async middleware chuẩn).

### 2.3. Quản lý dữ liệu thử & Cơ chế Seed
- Dữ liệu thử nghiệm ML / Recommender phải đi qua script seed (`scripts/`), không thao tác tay trực tiếp trên Firestore thật.
- Quy chuẩn seed:
  - Định danh (`id`) cố định.
  - Đảm bảo tính lũy đẳng (idempotent): chạy lặp lại nhiều lần không sinh bản ghi nhân đôi.
  - Hỗ trợ cờ `--force` khi cần ghi đè/làm mới.
  - Luôn gắn nhãn `seedTag: "reco-eval"` để dễ phân loại, đánh giá và dọn dẹp.
  - Luôn sao lưu dữ liệu trước khi thực hiện biến đổi/sửa đổi.

### 2.4. Tính toàn vẹn dữ liệu mẫu (Data Integrity)
- Giữ nguyên các bản ghi mẫu có lỗi logic sẵn có trong repo:
  - `PRV004`, `PRV005`: có `userId` không tồn tại.
  - `PRV006`: bị liên kết nhầm với tài khoản Customer.
  - `USR007`: tài khoản Provider nhưng chưa có hồ sơ Provider tương ứng.
  - -> **KHÔNG** tự ý xóa các bản ghi này. Mọi phát hiện bất thường được ghi nhận tại `docs/data-audit.md`.
- Mọi dữ liệu mới được sinh ra phục vụ gợi ý/đánh giá bắt buộc phải có khóa ngoại (foreign key) hợp lệ (`userId`, `providerId`, `serviceId`, `orderId`).

### 2.5. Báo cáo & Tài liệu Thực nghiệm (ML/Evaluation)
- Mọi chỉ số thống kê trong thư mục `reports/` phải được trích xuất từ các lần chạy thực tế, nghiêm cấm ngụy tạo dữ liệu.
- Thiết lập seed ngẫu nhiên cố định (random seed) trong các script huấn luyện / đánh giá để đảm bảo tính tái lập (reproducibility).
- Ghi rõ phiên bản các thư viện phụ thuộc (Node, Python, packages,...).
- Không commit các file mô hình trọng số lớn (> 100MB) vào Git repository.

### 2.6. Quy trình bàn giao & Nhật ký công việc
- Cuối mỗi giai đoạn, cập nhật nhật ký bàn giao (tại `readme.txt` / `README.md`) ở mục "Các việc đã làm" và "Tồn đọng" đúng với văn phong và cấu trúc hiện hữu của dự án.
- Khi gặp tình huống chưa rõ ràng: chủ động đưa ra giả định hợp lý, ghi lại và triển khai tiếp; chỉ dừng lại để hỏi người dùng khi quyết định có tính chất then chốt và khó đảo ngược.
