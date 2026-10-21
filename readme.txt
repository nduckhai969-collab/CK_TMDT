================================================================
README - NHẬT KÝ DỌN DẸP & BÀN GIAO DỰ ÁN
Dự án: SkillRental / CK_TMDT
Cập nhật: 2026-10-21
================================================================

File này ghi lại: đã làm gì, vì sao làm, và các quy ước cho task sau.
Hãy đọc file này TRƯỚC KHI sửa code.

----------------------------------------------------------------
1. CẤU TRÚC DỰ ÁN
----------------------------------------------------------------
server.js            Điểm khởi động (Express 5): mount API + phục vụ tĩnh.
firebase.js          Khởi tạo Firebase Admin (Firestore + Auth).
                     *** KHÔNG ĐƯỢC XÓA *** dù nằm ở thư mục gốc.
                     Được require bởi data/db.js, routes/*, scripts/*.
data/db.js           Lớp truy cập dữ liệu, nạp từ Firestore lúc khởi động.
data/database.json   Dữ liệu mẫu để seed.
routes/              15 file API (xem mục 4 để biết file nào đang dùng).
services/            Nghiệp vụ: order, checkout, vnpay, review, notification.
scripts/             Seed dữ liệu và script kiểm tra.
utils/               Hàm dùng chung (id, dates, webOrigin).
Frontend/            TOÀN BỘ giao diện (HTML/CSS/JS/ảnh).
uploads/             Ảnh upload lúc chạy, không commit (đã có trong .gitignore).

QUAN TRỌNG - Tên thư mục giao diện:
Git lưu thư mục là "Frontend" (chữ F hoa). Trên Windows, ổ đĩa có thể hiển
thị "frontend" vì hệ thống tệp không phân biệt hoa/thường. Đây KHÔNG phải lỗi.
  -> KHÔNG đổi chữ hoa/thường trong code. Giữ nguyên:
     - server.js dòng 54 và 157: path.join(__dirname, 'Frontend')
     - firebase.json dòng 3:     "public": "Frontend"
     Đổi sang chữ thường sẽ làm toàn bộ giao diện 404 khi deploy Linux/Firebase.

----------------------------------------------------------------
2. CÁC VIỆC ĐÃ LÀM
----------------------------------------------------------------

2.1. Sửa lỗi trang jobs.html (ảnh hưởng 6 trang)
     Triệu chứng: ô nhập số tiền không tự thêm dấu phân cách hàng nghìn;
     console báo 404 vì thiếu file js/number-format.js.
     Nguyên nhân: 6 trang HTML có <script src="js/number-format.js"> nhưng
     file này chưa từng tồn tại trong repo.
     Cách sửa: tạo mới Frontend/js/number-format.js.
     Các trang dùng file này: jobs.html, income.html, packages.html,
     profile.html, customer_requests.html, customer_complaint.html.
     File cung cấp: readFormattedNumber(), setFormattedNumber() và tự định
     dạng khi người dùng gõ vào input có thuộc tính data-thousands.

2.2. Xóa 32 file giao diện cũ ở thư mục gốc
     Thư mục gốc trước đây có 33 file .html/.css/.js là bản sao cũ của giao
     diện (tất cả được thêm ở commit đầu tiên "Add project source code" và
     chưa từng sửa lại). Bản trong Frontend/ mới hơn và mới là bản server
     thực sự phục vụ, nên các bản ở gốc là code chết.
     Đã xóa 32 file, gồm 28 bản trùng tên và 4 trang xác thực cũ đã bị thay
     bằng modal đăng nhập trong Frontend/index.html:
       admin.css, admin.html, admin.js, bookings.html, cashflow.html,
       chat.html, common.js, complaint.html, complaints.html, dashboard.html,
       income.html, index.html, jobs.html, orders.html, package.html,
       packages.html, payment.html, post.html, profile.html, providers.html,
       reports.html, review.html, reviews.html, services.html,
       statistics.html, style.css, users.html, verify.html,
       login.html, register.html, forgot-password.html, reset-password.html
     GIỮ LẠI: firebase.js (xem mục 1 - đây là code server, không phải giao diện).
     Lưu ý: route /login và /customer_login.html trong server.js vẫn được giữ
     vì nó redirect sang /index.html?auth=login.

2.3. Xóa file chết
     - data/db.file.backup.js : bản sao lưu cũ, không nơi nào require.
     - routes/cartRoutes.js   : không được mount trong server.js.
     - package.json           : xóa script "seed:cart-demo" vì trỏ tới
                                scripts/seedCartDemo.js không tồn tại.

2.4. Bỏ khỏi git các file đã nằm trong .gitignore
     Chúng bị commit từ trước khi .gitignore được thêm:
     - .idea/ (cấu hình IDE) -> git rm -r --cached .idea
     - uploads/avatars/.../*.png -> git rm --cached
     File vẫn còn trên máy, chỉ không còn bị git theo dõi.

2.5. Sửa 2 link chết ở footer Frontend/index.html
     - job_bidding.html  -> jobs.html     (Tìm việc & Báo giá dự án)
     - profile_setup.html -> profile.html (Xác minh CCCD & Chứng chỉ)

2.6. Thêm rào chắn chống lặp lại: npm run check
     scripts/checkFrontend.js kiểm tra tĩnh 3 loại lỗi đã từng xảy ra:
       (1) Trang HTML trỏ tới file js/css/ảnh/trang không tồn tại.
       (2) Trang dùng input data-thousands nhưng quên nạp number-format.js.
       (3) File .html/.css mọc lại ở thư mục gốc (nơi server không phục vụ).
     Trả về mã lỗi 1 khi có vấn đề, dùng được trong CI.

----------------------------------------------------------------
3. CÁCH CHẠY
----------------------------------------------------------------
Cài đặt:      npm install
Tạo .env:     copy .env.example .env  (rồi điền thông tin Firebase/VNPay)
Seed dữ liệu: npm run seed            (thêm --force nếu muốn ghi đè)
Chạy:         npm start               -> http://localhost:3000
Kiểm tra:     npm run check           (chạy TRƯỚC KHI commit)

Nếu PowerShell chặn npm (lỗi "npm.ps1 cannot be loaded because running
scripts is disabled"), hãy dùng npm.cmd hoặc gọi trực tiếp:
  node scripts/checkFrontend.js

----------------------------------------------------------------
4. QUY ƯỚC CHO TASK SAU
----------------------------------------------------------------
- Mọi file giao diện phải nằm trong Frontend/. Không tạo .html/.css ở gốc.
- Sửa giao diện thì sửa bản trong Frontend/, không sửa file ở gốc.
- Trước khi commit: chạy `npm run check` cho tới khi báo OK.
- Không đổi chữ hoa/thường của "Frontend" trong server.js và firebase.json.
- Không xóa firebase.js ở gốc.
- Các route đang được mount trong server.js (giữ lại):
    authRoutes, providerRoutes, chatRoutes, complaintRoutes, jobRoutes,
    orderRoutes, reviewRoutes, serviceRoutes, commentRoutes, adminRoutes,
    notificationRoutes, bookingListRoutes, paymentRoutes, customerAuth.
  providerAvailability.js không mount trực tiếp nhưng được 5 file require
  (hàm slotsForDate) nên vẫn phải giữ.
- File giao diện nạp theo thứ tự: style.css -> firebase-config.js ->
  firebase-client.js -> js/number-format.js (nếu có input tiền).

----------------------------------------------------------------
5. TỒN ĐỌNG / CHƯA LÀM
----------------------------------------------------------------
- Giao diện còn thiếu: chuông thông báo, bình luận, nút hủy đơn cho khách,
  giỏ hàng (booking list), nút nạp VNPay. Xem thêm CHANGELOG_FIXES.md.
- Một số endpoint người bán mà Frontend/provider.js đang gọi vẫn chưa có.
- Chưa ghi sổ walletTransactions cho escrow / hoàn tiền / giải ngân.
- Dữ liệu mẫu: PRV004/PRV005 có userId không tồn tại, PRV006 gắn với tài
  khoản Customer, USR007 (Provider) chưa có hồ sơ.
- Lịch sử git: file giao diện gốc và các file đã xóa vẫn còn trong commit
  cũ (nhánh main), có thể khôi phục bằng git nếu cần.
