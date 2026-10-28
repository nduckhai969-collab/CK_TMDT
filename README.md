# CK_TMDT - Sàn Thương Mại Điện Tử Dịch Vụ Kỹ Năng (SkillRental)

Dự án sàn thương mại điện tử kết nối khách hàng và chuyên gia cung cấp dịch vụ kỹ năng (IT, Thiết kế, Gia sư, Sửa chữa, Nhà cửa, Viết lách, Marketing).

---

## 1. Cấu Trúc Dự Án
- `server.js`: Khởi tạo ứng dụng Express 5, mount các route API và phục vụ tài nguyên tĩnh.
- `firebase.js`: Cấu hình Firebase Admin SDK kết nối Firestore và Authentication.
- `data/`: Quản lý dữ liệu mẫu (`database.json`), lớp truy xuất dữ liệu (`db.js`), định nghĩa Persona (`personas.js`), kho ngữ liệu (`reviewCorpus.js`), dữ liệu nhãn ML (`data/export/reviews_labeled.json`) và bộ công cụ kiểm thử viết tay (`data/handwritten/`).
- `Frontend/`: Toàn bộ mã nguồn giao diện (HTML, CSS, JS, hình ảnh).
- `ml/`: Mã nguồn học máy Python:
  - `ml/preprocess.py`: Tiền xử lý văn bản tiếng Việt (Unicode NFC, lowercase, ký tự lặp, teencode, giữ phủ định, ghép không dấu).
  - `ml/train.py`: Huấn luyện Logistic Regression trên TF-IDF, tối ưu GroupKFold, chốt ngưỡng Val, so sánh 5 mô hình, kiểm thử 1 lần trên Test.
  - `ml/annotation_agreement.py`: Đo lường độ nhất quán liên gán nhãn Cohen's Kappa và xuất bất đồng nhãn.
  - `ml/eval_handwritten.py`: Đánh giá suy luận ngoài phân phối và kiểm tra chữ ký SHA256 chống sửa đổi.
  - `ml/requirements.txt`: Các thư viện phụ thuộc Python.
- `models/`: Trọng số và cấu trúc mô hình xuất ra dạng JSON:
  - `models/aspect_detection.json`: Mô hình nhận diện 5 khía cạnh đa nhãn (Tác vụ A).
  - `models/aspect_sentiment.json`: Mô hình phân loại cực tính 3 lớp cho từng khía cạnh (Tác vụ B).
- `services/`: Nghiệp vụ hệ thống và dịch vụ suy luận:
  - `services/aspectPreprocess.js`: Tiền xử lý văn bản chuẩn hóa trên Node.js (khớp 100% Python).
  - `services/aspectInference.js`: Bộ suy luận học máy Node.js thuần không cần Python runtime.
- `scripts/`: Bộ công cụ quản lý và kiểm thử:
  - `scripts/checkFrontend.js` (`npm run check`): Kiểm tra tĩnh tính toàn vẹn giao diện.
  - `scripts/seedFirebase.js` (`npm run seed`): Seed dữ liệu sàn ban đầu.
  - `scripts/seedRecommendationData.js` (`npm run seed:reco`): Quản lý 932 bản ghi thử nghiệm `reco-eval`.
  - `scripts/testAspectInference.js`: Kiểm thử đối chuẩn xác suất suy luận giữa Node.js và Python (< 1e-6).
  - `scripts/evaluateRecommender.js`: Tổng hợp `aspectScores`, làm mượt Bayesian cho cold-start, đánh giá Top-K theo 8 Persona khách hàng.
  - `scripts/prepareAnnotatorB.py`: Trích xuất mẫu mù ngẫu nhiên (>= 30%, seed 42) cho người kiểm thử độc lập thứ hai.
- `reports/`: Báo cáo đo lường thực nghiệm:
  - `reports/diversity.md`: Báo cáo đa dạng ngữ liệu 400 review mẫu.
  - `reports/aspect_model_eval.md`: Báo cáo toàn diện kết quả học máy, so sánh mô hình, ablation, bootstrap CIs, LOPO, recommender eval và khung kiểm tra ngoài phân phối.

---

## 2. Hướng Dẫn Cài Đặt & Chạy Hệ Thống

### 2.1. Cài đặt môi trường
```bash
# 1. Cài đặt thư viện Node.js
npm install

# 2. Cài đặt môi trường Python (yêu cầu Python 3.11)
python -m venv ml/.venv
ml\.venv\Scripts\python.exe -m pip install -r ml/requirements.txt

# 3. Tạo cấu hình môi trường
copy .env.example .env
```

### 2.2. Huấn luyện và Kiểm thử Mô hình Học máy
```bash
# Huấn luyện mô hình Logistic Regression và đánh giá (Phần 3)
ml\.venv\Scripts\python.exe ml/train.py

# Kiểm thử đối chuẩn sai lệch suy luận Node.js vs Python (< 1e-6)
node scripts/testAspectInference.js

# Chạy đánh giá hệ thống gợi ý Top-K Persona (Dry-run mặc định)
node scripts/evaluateRecommender.js

# Quy trình kiểm thử ngoài phân phối với review viết tay:
# 1. Trích xuất mẫu mù cho Annotator B (khi đã có dữ liệu thật trong annotator_A.csv):
python scripts/prepareAnnotatorB.py
# 2. Đo lường độ nhất quán liên gán nhãn Cohen's Kappa giữa A và B:
ml\.venv\Scripts\python.exe ml/annotation_agreement.py
# 3. Đánh giá suy luận ngoài phân phối và xuất báo cáo markdown:
ml\.venv\Scripts\python.exe ml/eval_handwritten.py
```

### 2.3. Khởi chạy Ứng dụng Web
```bash
# Kiểm tra tĩnh giao diện trước khi chạy
npm run check

# Khởi động máy chủ
npm start
# Mở trình duyệt tại: http://localhost:3000
```

---

## 3. Các Việc Đã Làm (Nhật Ký Phát Triển)

### Phần 1 - Rà Soát Schema & Thiết Kế Trường Dữ Liệu Gợi Ý
- Rà soát schema hiện có (`docs/data-audit.md`), phát hiện và bảo toàn các bản ghi mẫu có lỗi logic sẵn có (`PRV004`, `PRV005`, `PRV006`, `USR007`, `SVC_CUSTOM`).
- Thiết kế trường `aspectScores` (thang 1-5) cho Provider/Service; `cancelRate` cho Provider; `aspectWeights` cho User; `groundTruth` cho Review.
- Cập nhật `data/db.js` với cơ chế `applyDefaults`, thêm bảo vệ trong `firestore.rules`.

### Phần 2 - Ngữ Liệu Đánh Giá & Dữ Liệu Thử Nghiệm (`seedTag: "reco-eval"`)
- Định nghĩa 24 Provider Personas (7 ngành, 4 cold-start) và 8 Customer Test Personas (`data/personas.js`).
- Xây dựng kho ngữ liệu tiếng Việt 15 ô với >= 16 cụm từ độc lập mỗi ô (`data/reviewCorpus.js`), bao quát 9 phong cách ngôn ngữ (trang trọng, đời thường, Bắc, Nam, teencode, không dấu, ca khó, ngắn gọn, generic).
- Sinh 400 review gán nhãn groundTruth (tỷ lệ trùng 0.00%) và 450 đơn hàng với khóa ngoại hợp lệ 100% (`scripts/generateRecoDataset.js`, `scripts/seedRecommendationData.js`).
- Phân chia tập dữ liệu cố định theo cụm Provider: Train 258 / Val 61 / Test 81 (`data/export/reviews_labeled.json`).

### Phần 3 - Học Máy: Mô Hình Aspect-Based Sentiment Analysis & Gợi Ý Persona
- Thiết lập môi trường Python 3.11 độc lập trong `ml/.venv` với `scikit-learn`, `numpy`, `pandas`, `scipy`, `joblib`, `matplotlib`.
- Xây dựng quy trình tiền xử lý văn bản đồng bộ 100% giữa Python và Node.js (`ml/preprocess.py` & `services/aspectPreprocess.js`): Unicode NFC, lowercase, rút gọn lặp ký tự, ánh xạ teencode, bảo tồn từ phủ định, ghép bản không dấu.
- Huấn luyện mô hình Logistic Regression trên đặc trưng TF-IDF Word (1-3) + Char_wb (2-5) (15.966 chiều), tối ưu $C$ bằng GroupKFold(5) trên Train và quét ngưỡng tối ưu riêng từng khía cạnh trên Val.
- So sánh 5 mô hình trên VAL: Majority Class, Rule-based từ khóa, MultinomialNB, LinearSVC, Logistic Regression.
- Đánh giá độc lập 1 lần trên tập TEST (81 mẫu):
  - Tác vụ A (Aspect Detection): **Macro-F1 = 79.55%**, **Micro-F1 = 80.00%**.
  - Tác vụ B (Aspect Sentiment): **Mean Accuracy = 76.44%**, **Mean Macro-F1 = 51.07%**.
- Phân tích chi tiết hiệu năng theo 9 nhóm văn phong ngôn ngữ, nghiên cứu thành phần (Ablation Study), vẽ learning curve và phân tích 10 lỗi điển hình mỗi tác vụ (`reports/aspect_model_eval.md`).
- Bổ sung kiểm định thống kê chuyên sâu: Leave-One-Provider-Out trên toàn bộ 400 mẫu, Bootstrap 95% Confidence Intervals (1.000 lượt) cả theo Review và Cluster Bootstrap theo Provider trên Test.
- Xây dựng hạ tầng kiểm tra ngoài phân phối (Out-of-Distribution Framework) với review người thật viết tay và gán nhãn độc lập (`data/handwritten/`, `scripts/prepareAnnotatorB.py`, `ml/annotation_agreement.py`, `ml/eval_handwritten.py`).
- Xuất mô hình sang JSON (`models/aspect_detection.json` và `models/aspect_sentiment.json`).
- Triển khai dịch vụ suy luận Node.js thuần `services/aspectInference.js`, vượt qua kiểm thử đối chuẩn 20 câu mẫu với sai lệch xác suất $< 10^{-6}$ (`scripts/testAspectInference.js`).
- Xây dựng ứng dụng gợi ý `scripts/evaluateRecommender.js` với cơ chế làm mượt Bayesian cho Provider cold-start (< 5 review), tính điểm price định lượng cho Service và xếp hạng Top-K theo 8 Customer Personas (NDCG@3 tăng **+15.73%**, Precision@3 tăng **+20.83%** so với baseline rating sao trung bình). Hỗ trợ đầy đủ `--dry-run` và `--clean`.

---

## 4. Tồn Đọng / Kế Hoạch Tiếp Theo
- Xây dựng giao diện hiển thị gợi ý thông minh trên Frontend (thanh trượt 5 khía cạnh cho khách hàng tìm kiếm dịch vụ).
- Xây dựng API route trực tuyến `GET /api/recommender/top-providers` và `GET /api/recommender/top-services` trong thư mục `routes/`.
- Nghiên cứu nâng cấp mô hình Deep Learning dựa trên kiến trúc Transformer (PhoBERT) theo định dạng ONNX Runtime khi có thêm dữ liệu đánh giá thực tế.
- Các tính năng giao diện người dùng bổ sung: chuông thông báo, phản hồi bình luận, hủy đơn khách hàng, ghi sổ `walletTransactions` cho escrow.
