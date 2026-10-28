================================================================
README - NHẬT KÝ DỌN DẸP & BÀN GIAO DỰ ÁN
Dự án: SkillRental / CK_TMDT
Cập nhật: 2026-10-27
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

2.7. Phần 1 - Rà soát và thiết kế dữ liệu cho Gợi ý theo khía cạnh
     - Tạo docs/reco-rules.md: tài liệu quy tắc phát triển tính năng Recommender.
     - Tạo docs/data-audit.md: rà soát schema hiện có (users, providers, services,
       orders, reviews), cách lưu lịch rảnh, trạng thái đơn/ký quỹ và cách tính sao.
       Ghi nhận các lỗi dữ liệu mẫu sẵn có (PRV004, PRV005, PRV006, USR007, SVC_CUSTOM).
     - Thiết kế trường mới: aspectScores (thang 1-5, 5 khía cạnh) cho Provider/Service;
       cancelRate cho Provider; aspectWeights cho User; groundTruth cho Review.
       Tái sử dụng các trường đã có: verified, completedOrders, reviewCount.
     - Cập nhật data/db.js: thêm hàm applyDefaults tự động bổ sung giá trị mặc định
       khi đọc/ghi mà không làm phá vỡ logic cũ.
     - Tạo firestore.rules và firestore.indexes.json: bảo vệ các trường aspectScores,
       verified, completedOrders, cancelRate, groundTruth khỏi việc bị client tự sửa.
       Cập nhật firebase.json.
     - Tạo bản sao lưu dự phòng data/database.backup.json trước khi thay đổi dữ liệu.

2.8. Phần 2 - Dữ liệu mẫu theo Persona & Ngữ liệu đánh giá (seedTag: "reco-eval")
     - Tạo data/personas.js: 24 Provider Personas (đa dạng 7 ngành, mức giá, khu vực,
       4 cold-start <5 review, phân bổ điểm mạnh/yếu 5 khía cạnh) và 8 Customer Test Personas.
     - Tạo data/reviewCorpus.js: kho từ vựng 15 ô (5 khía cạnh x 3 cực tính) với 16-22 cụm từ
       mỗi ô (đạt >=15), bao quát các văn phong (trang trọng, đời thường, Bắc/Nam, teencode,
       không dấu, ngắn/dài, ca khó, phủ định kép, mỉa mai, review chung chung).
     - Viết scripts/generateRecoDataset.js & scripts/seedRecommendationData.js (npm run seed:reco):
       sinh 400 review kèm groundTruth (tỉ lệ trùng 0.00% < 2%), 450 đơn hàng có khóa ngoại
       hợp lệ 100%. Đảm bảo tính lũy đẳng (chạy lại không nhân đôi).
     - Hỗ trợ đầy đủ cờ: --dry-run (chỉ in thống kê), --force (ghi đè), --clean (xóa sạch
       932 bản ghi reco-eval, đưa hệ thống về trạng thái ban đầu).
     - Tự động cập nhật reviewCount, rating, completedOrders, cancelRate theo công thức db.js.
     - Xuất báo cáo reports/diversity.md và xuất tập dữ liệu gán nhãn phân chia nhóm theo Provider
       data/export/reviews_labeled.json (train 64.5%, val 15.2%, test 20.3%) cho Phần 3.


2.9. Phần 3 - Học máy: Mô hình Aspect-Based Sentiment Analysis & Gợi ý Top-K Persona
     - Cài đặt môi trường Python 3.11 độc lập trong ml/.venv và ml/requirements.txt
       (scikit-learn, numpy, pandas, scipy, joblib, matplotlib).
     - Xây dựng module tiền xử lý văn bản tiếng Việt đồng bộ 100% giữa Python và Node.js:
       ml/preprocess.py và services/aspectPreprocess.js (Unicode NFC, lowercase, rút gọn
       ký tự lặp, ánh xạ teencode, bảo tồn từ phủ định, ghép chuỗi không dấu).
     - Huấn luyện mô hình Logistic Regression trên TF-IDF (word 1-3 gram + char_wb 2-5 gram,
       sublinear_tf=True, 15.966 đặc trưng, fit CHỈ trên train 258 mẫu).
     - Tối ưu siêu tham số C bằng GroupKFold(providerId, n_splits=5) trên tập train và quét
       ngưỡng F1 tối ưu riêng cho từng khía cạnh trên tập val.
     - So sánh 5 mô hình trên VAL: Majority Class, Rule-based từ khóa, MultinomialNB,
       LinearSVC, và Logistic Regression (được chọn vì cân bằng cao nhất giữa F1 khía cạnh,
       Macro-F1 cực tính và khả năng xuất xác suất chuẩn xác).
     - Chạy kiểm thử duy nhất 1 lần trên tập TEST (81 mẫu độc lập): Tác vụ A Macro-F1 = 79.55%,
       Micro-F1 = 80.00%; Tác vụ B Mean Accuracy = 76.44%, Mean Macro-F1 = 51.07%.
     - Phân tích F1 theo 9 nhóm văn phong: trang trọng, giọng Bắc, đời thường, không dấu,
       teencode, ca khó (phủ định kép, mỉa mai), ngắn gọn, chung chung (generic).
     - Nghiên cứu thành phần (Ablation Study) và đường cong học tập (Learning Curve).
     - Xuất toàn bộ trọng số, vocab, idf, intercept và ngưỡng ra models/aspect_detection.json
       và models/aspect_sentiment.json.
     - Viết dịch vụ suy luận Node.js thuần services/aspectInference.js và script kiểm thử
       scripts/testAspectInference.js: sai lệch xác suất < 1e-6 (đạt 6.69e-7), nhãn khớp 100%.
     - Triển khai ứng dụng gợi ý scripts/evaluateRecommender.js: tổng hợp aspectScores (1-5),
       làm mượt Bayesian cho Provider cold-start (<5 review), tính điểm price cho Service,
       xếp hạng Top-K cho 8 Customer Personas; NDCG@3 tăng +15.73%, Precision@3 tăng +20.83%
       so với baseline rating trung bình. Hỗ trợ đầy đủ cờ --dry-run (mặc định) và --clean.
     - Xuất báo cáo chi tiết reports/aspect_model_eval.md.
     - Bổ sung kiểm định thống kê & khung kiểm tra ngoài phân phối:
       + Rà soát baseline Rule-based công bằng (Lexicon độc lập, không rò rỉ corpus).
       + Kiểm thử Leave-One-Provider-Out (LOPO) trên 400 mẫu và Bootstrap 95% CI (1.000 lượt).
       + Đánh giá hệ thống gợi ý Out-of-Sample trên 9 Provider Val+Test.
       + Xây dựng quy trình kiểm tra ngoài phân phối (Out-of-Distribution Framework):
         * data/handwritten/HUONG_DAN.md & annotator_A.csv (tiếp nhận review viết tay).
         * scripts/prepareAnnotatorB.py (trích mẫu mù ngẫu nhiên >=30% cho Annotator B).
         * ml/annotation_agreement.py (đo lường Cohen's Kappa nhị phân, cực tính, 4 lớp).
         * ml/eval_handwritten.py (đánh giá suy luận ngoài phân phối và chữ ký SHA256).


----------------------------------------------------------------
3. CÁCH CHẠY
----------------------------------------------------------------
Cài đặt Node:    npm install
Cài đặt Python:  winget install Python.Python.3.11 (nếu chưa có)
                 python -m venv ml/.venv
                 ml\.venv\Scripts\python.exe -m pip install -r ml/requirements.txt
Huấn luyện ML:   ml\.venv\Scripts\python.exe ml/train.py
Kiểm thử Node:   node scripts/testAspectInference.js
Đánh giá Reco:   node scripts/evaluateRecommender.js   (hỗ trợ --dry-run, --apply, --clean)
Trích mẫu mù B:  python scripts/prepareAnnotatorB.py
Độ nhất quán:    ml\.venv\Scripts\python.exe ml/annotation_agreement.py
Đánh giá OOD:    ml\.venv\Scripts\python.exe ml/eval_handwritten.py
Tạo .env:        copy .env.example .env  (rồi điền thông tin Firebase/VNPay)
Seed dữ liệu:    npm run seed            (thêm --force nếu muốn ghi đè)
Seed Reco:       npm run seed:reco       (hỗ trợ -- --dry-run, -- --force, -- --clean)
Chạy Web:        npm start               -> http://localhost:3000
Kiểm tra:        npm run check           (chạy TRƯỚC KHI commit)

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
- Tính năng Gợi ý theo khía cạnh: chưa huấn luyện mô hình ML (TF-IDF + Linear/Logistic,
  PhoBERT) trích xuất khía cạnh từ review đã gán nhãn, chưa tính điểm price từ
  services.price, chưa xây dựng API và giao diện hiển thị Top-K gợi ý (sẽ làm ở Phần 3 trở đi).
- Lịch sử git: file giao diện gốc và các file đã xóa vẫn còn trong commit
  cũ (nhánh main), có thể khôi phục bằng git nếu cần.
