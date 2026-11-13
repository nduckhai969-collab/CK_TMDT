# Báo Cáo Đánh Giá Mô Hình Học Máy Phân Tích Đánh Giá Theo Khía Cạnh (Aspect-Based Sentiment Analysis)

**Dự án**: Sàn TMĐT Dịch Vụ Kỹ Năng SkillRental / CK_TMDT  
**Phần thực hiện**: Phần 3 - Huấn luyện, Thử nghiệm, So sánh Baseline, Đánh giá Rà soát Kỹ thuật và Tích hợp Gợi ý  
**Tập dữ liệu cố định**: `data/export/reviews_labeled.json` (400 đánh giá tiếng Việt; phân chia cố định theo Provider: Train 258 / Val 61 / Test 81)  
**Tác vụ mục tiêu**:
1. **Tác vụ A (Aspect Detection)**: Phân loại đa nhãn (Multi-label) cho 5 khía cạnh: `quality`, `price`, `speed`, `attitude`, `warranty`.
2. **Tác vụ B (Aspect Sentiment)**: Phân loại cực tính 3 lớp (`pos`, `neg`, `neu`) cho từng khía cạnh khi khía cạnh đó xuất hiện.

---

## 1. Tóm Tắt Kết Quả Chính Thức (Tập TEST - 81 Mẫu Độc Lập)

> [!IMPORTANT]
> **Quy chuẩn kiểm thử và số lần chạm tập Test**:
> - Mô hình chính thức được chốt hoàn toàn **TRƯỚC KHI** xem kết quả tập TEST (dựa trên tập VAL và tiêu chí triển khai hệ thống).
> - **Số lần chạm tập TEST chính thức**:
>   1. **Lần 1 (Chính thức)**: Đánh giá duy nhất 1 lần ở cuối pipeline cho mô hình Logistic Regression đã chốt (`ml/train.py`). Tuyệt đối không quay lại chỉnh sửa siêu tham số hay ngưỡng.
>   2. **Lần 2 (Đối sánh phụ)**: Chạy kiểm thử bổ sung cho các baseline (Linear SVM, Rule-based độc lập và Rule-based rò rỉ) trong đợt rà soát kỹ thuật (`ml/run_re_audit.py`) nhằm đảm bảo tính minh bạch đối chứng, không can thiệp vào mô hình chính.
>
> **Chỉ số kiểm thử chính thức của Logistic Regression trên tập TEST (81 mẫu)**:
> - **Tác vụ A (Nhận diện khía cạnh)**:
>   - **Macro-F1**: **0.7955** (Review Bootstrap 95% CI: `[0.7352, 0.8477]`; Cluster Bootstrap theo Provider 95% CI: `[0.7309, 0.8518]`)
>   - **Micro-F1**: **0.8000**
> - **Tác vụ B (Phân loại cực tính cảm xúc)**:
>   - **Độ chính xác trung bình (Mean Accuracy)**: **0.7644** (Review Bootstrap 95% CI: `[0.6726, 0.8622]`; Cluster Bootstrap theo Provider 95% CI: `[0.6787, 0.9096]`)
>   - **Mean Macro-F1 (tính trên các lớp có $support > 0$)**: **0.6987**
>   - **Mean Macro-F1 (tính cố định cả 3 lớp)**: **0.5107**

---

## 2. Phân Bố Tập Dữ Liệu & Cảnh Báo Mất Cân Bằng Nhãn

Bộ dữ liệu gồm 400 đánh giá được chia theo cụm `providerId` (Group-Split) nhằm triệt tiêu hoàn toàn rò rỉ dữ liệu (Data Leakage) giữa các tập.

### Bảng Thống kê Số lượng Mẫu (Khía cạnh x Cực tính) theo Split

| Tập dữ liệu | Khía cạnh (`aspect`) | Tích cực (`pos`) | Tiêu cực (`neg`) | Trung lập (`neu`) | Vắng mặt (`absent`) | Tổng xuất hiện | Cảnh báo ô < 10 mẫu |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **TRAIN** (258 mẫu) | `quality` | 44 | 16 | 25 | 173 | 85 | Đủ mẫu (>= 10) |
| | `price` | 53 | 24 | **6** | 175 | 83 | ⚠️ `neu` (6 mẫu < 10) |
| | `speed` | 44 | 35 | **4** | 175 | 83 | ⚠️ `neu` (4 mẫu < 10) |
| | `attitude` | 58 | **4** | 16 | 180 | 78 | ⚠️ `neg` (4 mẫu < 10) |
| | `warranty` | 18 | 28 | 10 | 202 | 56 | Đủ mẫu (>= 10) |
| **VAL** (61 mẫu) | `quality` | 19 | **1** | **0** | 41 | 20 | ⚠️ `neg` (1), `neu` (0) |
| *(Tham khảo)* | `price` | **1** | 28 | **0** | 32 | 29 | ⚠️ `pos` (1), `neu` (0) |
| | `speed` | 15 | **3** | **0** | 43 | 18 | ⚠️ `neg` (3), `neu` (0) |
| | `attitude` | 11 | **0** | **0** | 50 | 11 | ⚠️ `neg` (0), `neu` (0) |
| | `warranty` | **8** | **1** | **4** | 48 | 13 | ⚠️ `pos` (8), `neg` (1), `neu` (4) |
| **TEST** (81 mẫu) | `quality` | 30 | **1** | **0** | 50 | 31 | ⚠️ `neg` (1), `neu` (0) |
| *(Chính thức)* | `price` | 17 | 16 | **0** | 48 | 33 | ⚠️ `neu` (0) |
| | `speed` | 17 | **3** | **0** | 61 | 20 | ⚠️ `neg` (3), `neu` (0) |
| | `attitude` | **9** | 10 | **6** | 56 | 25 | ⚠️ `pos` (9), `neu` (6) |
| | `warranty` | 16 | **0** | **0** | 65 | 16 | ⚠️ `neg` (0), `neu` (0) |

> [!WARNING]
> **Nhận định về hiện tượng mất cân bằng nhãn**:
> Do việc phân chia dữ liệu dựa theo cụm Provider (mỗi Provider đại diện cho một Persona chuyên gia có hồ sơ điểm mạnh/yếu cố định), tập VAL và TEST có nhiều ô khía cạnh x cực tính chỉ có 0-1 mẫu hỗ trợ (support). Điều này dẫn tới hai hệ quả kỹ thuật:
> 1. Nếu tính Macro-F1 Tác vụ B trên cố định cả 3 lớp (`pos`, `neg`, `neu`), lớp có 0 mẫu trong ground-truth sẽ nhận điểm F1 = 0.0, kéo tụt điểm trung bình số học xuống **0.5107**.
> 2. Nếu tính Macro-F1 chỉ trên các lớp thực tế có xuất hiện trong ground-truth ($support > 0$), điểm Macro-F1 thực tế của mô hình đạt **0.6987**, phản ánh chính xác hơn năng lực phân loại của mô hình trên dữ liệu kiểm thử.

---

## 3. Tiền Xử Lý & Trích Xuất Đặc Trưng

### 3.1. Quy trình Tiền xử lý Chuẩn hóa (Đồng bộ Python & Node.js)
Quy trình tiền xử lý được đóng gói trong hàm `preprocess_text()` duy nhất tại `ml/preprocess.py` và `services/aspectPreprocess.js`:
1. **Unicode NFC**: Chuẩn hóa mã dựng sẵn, khử lỗi phân tách dấu tổ hợp.
2. **Chuyển chữ thường (Lowercase)**: Đưa chuỗi về chữ thường.
3. **Rút gọn ký tự lặp**: Nhận diện chuỗi lặp $\ge 3$ ký tự liên tiếp để đưa về 1 ký tự (`chuẩnnn` $\to$ `chuẩn`, `quáaa` $\to$ `quá`, `tốttt` $\to$ `tốt`).
4. **Ánh xạ từ viết tắt / Teencode**: Ánh xạ từ điển teencode thông dụng: `ko`, `k`, `khg` $\to$ `không`; `đc`, `dc` $\to$ `được`; `mk` $\to$ `mình`; `lun` $\to$ `luôn`; `vs` $\to$ `với`; `ng` $\to$ `người`; `cx` $\to$ `cũng`; `mn` $\to$ `mọi người`; `kp` $\to$ `không phải`; `r`, `rùi` $\to$ `rồi`; `quớ` $\to$ `quá`; `oke`, `oki` $\to$ `tốt`.
5. **Bảo tồn từ phủ định**: Giữ nguyên tuyệt đối các từ phủ định tiếng Việt (`không`, `chẳng`, `chưa`, `hơi`, `chả`, `đâu`, `kém`...), không loại bỏ như stopword.
6. **Ghép chuỗi không dấu (Unaccented Mirror)**: Loại bỏ dấu thanh qua NFD và ghép bản không dấu vào cuối: `f"{clean_text} {unaccented_text}"`.

*Kết quả đối soát*: 400 / 400 mẫu kiểm tra cho kết quả tiền xử lý giữa Python và Node.js trùng khớp **100% từng byte**.

### 3.2. Không gian Đặc trưng TF-IDF
- **Word N-grams**: N-gram từ 1-3 từ (`ngram_range=(1, 3)`, `sublinear_tf=True`, `token_pattern=r'(?u)\b\w+\b'`).
- **Character N-grams**: N-gram ký tự trong biên từ (`analyzer='char_wb'`, `ngram_range=(2, 5)`, `sublinear_tf=True`).
- **Kích thước vector đặc trưng**: **15.966 chiều** (Word: 8.954; Char_wb: 7.012), fit CHỈ trên 258 mẫu Train.

---

## 4. Tối Ưu Siêu Tham Số $C$ & Chốt Ngưỡng Quyết Định Trên VAL

- **Tìm $C$ tối ưu trên tập Train** qua `GroupKFold(5, groups=providerId)`:
  - Tác vụ A: $C = 10.0$ cho cả 5 khía cạnh (CV F1 đạt từ 0.7144 đến 0.7751).
  - Tác vụ B: `quality`: $C = 0.1$; `price`: $C = 0.1$; `speed`: $C = 10.0$; `attitude`: $C = 3.0$; `warranty`: $C = 3.0$.
- **Chốt ngưỡng quyết định tối ưu trên VAL** (quét ngưỡng từ 0.10 đến 0.90 bước 0.05):
  - `quality`: $t^* = 0.45$ (Val F1 = **0.8718**)
  - `price`: $t^* = 0.45$ (Val F1 = **1.0000**)  
    *(Lưu ý kỹ thuật: Điểm F1 = 1.0000 của khía cạnh price trên VAL có thể bị overfit vào tập VAL do tập này chỉ có 29 mẫu price, trong đó 28 mẫu là tiêu cực).*
  - `speed`: $t^* = 0.45$ (Val F1 = **0.8333**)
  - `attitude`: $t^* = 0.40$ (Val F1 = **0.8571**)
  - `warranty`: $t^* = 0.45$ (Val F1 = **0.9231**)

---

## 5. Bảng So Sánh Các Mô Hình Trên Tập Validation (VAL)

> [!NOTE]
> **Minh bạch về bộ từ khóa Rule-based**:
> - **Rule-based (Rò rỉ kho ngữ liệu)**: Bộ từ khóa được trích xuất trực tiếp từ `data/reviewCorpus.js` (kho từ vựng sinh dữ liệu mẫu). Đây là baseline **không công bằng (có rò rỉ tri thức tập sinh)**, dẫn tới điểm số đạt mức tuyệt đối giả tạo $1.0000$.
> - **Rule-based (Độc lập chuẩn)**: Được bổ sung trong đợt rà soát, sử dụng bộ từ khóa phổ quát độc lập của tiếng Việt (không tham chiếu `data/reviewCorpus.js`).

| Mô hình thử nghiệm | Tác vụ A: Macro-F1 | Tác vụ A: Micro-F1 | Tác vụ B: Accuracy | Tác vụ B: Macro-F1 | Bản chất & Đánh giá kỹ thuật |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **(1) Majority Class** | 0.0000 | 0.0000 | 0.5789 | 0.4045 | Luôn dự đoán nhãn đa số; mốc sàn tối thiểu. |
| **(2a) Rule-based (Rò rỉ cụm từ)** | 1.0000* | 1.0000* | 1.0000* | 1.0000* | *Không công bằng*: Từ điển trùng khớp kho ngữ liệu sinh mẫu. |
| **(2b) Rule-based (Độc lập chuẩn)**| 0.7271 | 0.6844 | 0.5425 | 0.3939 | *Công bằng*: Dùng từ điển tiếng Việt phổ quát. |
| **(3) Multinomial Naive Bayes** | 0.2605 | 0.2963 | 0.6135 | 0.4837 | Giả định độc lập bị vi phạm nặng; xác suất lệch mạnh về lớp đa số. |
| **(4) Linear SVM** | **0.9043** | **0.9195** | 0.8129 | 0.4704 | Đạt Macro-F1 Tác vụ A cao hơn LR trên Val (+0.72%), nhưng Tác vụ B thấp hơn. |
| **(5) Logistic Regression (Được chọn)**| **0.8971** | **0.9111** | **0.8193** | **0.5213** | **Mô hình được chọn trước khi test**: Cân bằng F1, xuất xác suất chuẩn, dễ tích hợp JSON. |

### Giải thích chênh lệch Macro-F1 A: 0.8971 (Bảng so sánh) vs 0.8788 (Ablation)
- Trong bảng so sánh các mô hình trên VAL, Logistic Regression sử dụng **ngưỡng quyết định đã tinh chỉnh** ($t^* \in [0.40, 0.45]$), đạt Macro-F1 = **0.8971**.
- Trong bảng Ablation Study, hàm thử nghiệm sử dụng phương thức phân loại mặc định `clf.predict()`, tương đương với việc cố định **ngưỡng mặc định 0.50** cho tất cả các khía cạnh, đạt Macro-F1 = **0.8788**.
- Chênh lệch $+1.83\%$ này minh chứng rõ ràng cho hiệu quả của kỹ thuật tinh chỉnh ngưỡng quyết định riêng (`threshold tuning`).

### Giải trình khách quan về việc lựa chọn Logistic Regression
1. **Quyết định chọn mô hình được chốt TRƯỚC KHI xem tập TEST**: Quyết định chọn Logistic Regression được đưa ra dựa trên kết quả tập VAL và yêu cầu tích hợp hệ thống.
2. **Khác biệt trên VAL là rất nhỏ**: Trên tập VAL, Linear SVM đạt Macro-F1 A là $0.9043$, nhỉnh hơn Logistic Regression ($0.8971$) một biên độ hẹp $+0.72\%$; trong khi ở Tác vụ B, LR nhỉnh hơn SVM về Macro-F1 ($0.5213$ vs $0.4704$, biên độ $+5.09\%$) và Accuracy ($0.8193$ vs $0.8129$).
3. **Ưu thế về phân phối xác suất và triển khai**:
   - Logistic Regression cung cấp phân phối xác suất liên tục tự nhiên qua hàm Sigmoid và Softmax, cho phép tinh chỉnh ngưỡng quyết định riêng cho từng khía cạnh và cung cấp độ tin cậy (`confidence score`) phục vụ thuật toán xếp hạng gợi ý. Linear SVM chỉ đo khoảng cách đại số tới siêu phẳng (`decision_function`), việc áp dụng Platt scaling sẽ làm phức tạp pipeline.
   - Trọng số $W$ và bias $b$ của LR dễ dàng tuần tự hóa ra JSON để chạy suy luận thuần trong Node.js (`services/aspectInference.js`) với độ trễ thấp và sai lệch xác suất $< 10^{-6}$.
4. **Nhìn lại kết quả trên TEST (Đối sánh phụ)**:
   - Trên tập TEST, **Linear SVM đạt hiệu năng cao hơn Logistic Regression ở cả hai tác vụ**: Macro-F1 A là **0.8506** (so với LR 0.7955); Accuracy B là **0.7757** (so với LR 0.7644).
   - Đây là bài học thực nghiệm quý giá: Linear SVM phân tách biên dữ liệu văn bản chiều cao rất mạnh mẽ. Việc cải tiến chuyển đổi Linear SVM sang xác suất (hoặc xuất trọng số SVM cho Node.js) được đưa vào **mục hướng cải thiện tương lai**.

---

## 6. Đánh Giá Thành Phần (Ablation Study Trên VAL)

| Cấu hình mô hình | Tác vụ A: Macro-F1 | Suy giảm Macro-F1 A | Tác vụ B: Macro-F1 | Suy giảm Macro-F1 B | Ý nghĩa thực tiễn |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Full Model (Chuẩn)** | **0.8788** | *Gốc* | **0.5213** | *Gốc* | Kết hợp đầy đủ Word + Char_wb + Unaccent + Teencode + Negations. |
| **(1) Bỏ Char N-gram** (Word TF-IDF only) | 0.7872 | **-9.16%** | 0.5233 | +0.20% | Char n-gram là cốt lõi để bắt từ ghép, lỗi chính tả và biến thể từ; bỏ char làm giảm mạnh F1 khía cạnh. |
| **(2) Bỏ bản không dấu** | 0.8063 | **-7.25%** | 0.4461 | **-7.52%** | Giảm mạnh cả 2 tác vụ! Ghép chuỗi không dấu là chìa khóa để nhận diện review không dấu. |
| **(3) Bỏ Map Teencode** | 0.8694 | **-0.94%** | 0.5167 | -0.46% | Giảm nhẹ khả năng nhận diện các câu chứa từ viết tắt (`ko`, `mk`, `vs`...). |
| **(4) Bỏ Giữ Từ Phủ Định** (Loại như Stopword)| 0.8670 | **-1.18%** | 0.5115 | -0.98% | Gây nhầm lẫn giữa câu khen và câu chê (ví dụ: "không đắt" bị biến thành "đắt"). |

---

## 7. Kết Quả Kiểm Thử Toàn Diện Trên Tập TEST (81 Mẫu)

### 7.1. Bảng So Sánh Các Mô Hình Trên Tập TEST
*(Bao gồm mô hình chính thức và các lượt chạy bổ sung đối sánh)*:

| Mô hình đánh giá trên TEST | Tác vụ A: Macro-F1 | Tác vụ A: Micro-F1 | Tác vụ B: Accuracy | Tác vụ B: Macro-F1 (support > 0) | Tác vụ B: Macro-F1 (3 classes) | Ghi chú quy trình |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **Rule-based (Rò rỉ kho cụm từ)** | 0.9828* | 0.9837* | 0.9666* | 0.8188* | 0.8188* | *Không công bằng*: Từ điển trùng kho mẫu. |
| **Rule-based (Độc lập chuẩn)** | 0.6986 | 0.6522 | 0.6344 | 0.5741 | 0.4428 | Baseline độc lập chuẩn mực. |
| **Linear SVM** *(Chạy bổ sung đối sánh)* | **0.8506** | **0.8534** | **0.7757** | **0.7180** | **0.5630** | Cao hơn LR ở cả 2 tác vụ trên Test. |
| **Logistic Regression (Chính thức)** | **0.7955** | **0.8000** | **0.7644** | **0.6987** | **0.5107** | **Mô hình triển khai chính thức**. |

### 7.2. Chi Tiết Tác Vụ A Theo Từng Khía Cạnh Trên TEST
- **Macro-F1**: **0.7955** | **Micro-F1**: **0.8000**

| Khía cạnh (`aspect`) | Precision | Recall | F1-Score | Số mẫu thực tế có mặt (`support`) |
| :--- | :---: | :---: | :---: | :---: |
| `quality` | 0.8519 | 0.7419 | **0.7931** | $n = 31$ |
| `price` | 0.9062 | 0.8788 | **0.8923** | $n = 33$ |
| `speed` | 0.6207 | 0.9000 | **0.7347** | $n = 20$ |
| `attitude` | 0.7308 | 0.7600 | **0.7451** | $n = 25$ |
| `warranty` | 0.8125 | 0.8125 | **0.8125** | $n = 16$ |

### 7.3. Chi Tiết Tác Vụ B Theo Từng Khía Cạnh Trên TEST
- **Độ chính xác trung bình (Mean Accuracy)**: **0.7644** (76.44%)
- **Mean Macro-F1 (tính trên các lớp có support > 0)**: **0.6987** (69.87%)
- **Mean Macro-F1 (tính cố định 3 lớp)**: **0.5107**

| Khía cạnh (`aspect`) | Số mẫu ($n$) | Phân bổ nhãn TEST (`pos` / `neg` / `neu`) | Accuracy | Macro-F1 (support > 0) | Macro-F1 (3 classes) | Ghi chú đánh giá |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| `quality` | $n = 31$ | 30 pos / 1 neg / 0 neu | **0.8387** | **0.4561** | 0.3041 | Mất cân bằng nặng (chỉ 1 neg). F1 3 lớp bị chia 3 do neu có support = 0. |
| `price` | $n = 33$ | 17 pos / 16 neg / 0 neu | **0.8182** | **0.8253** | 0.5502 | Cân bằng khen/chê; nhận diện đúng 16/17 pos và 11/16 neg. |
| `speed` | $n = 20$ | 17 pos / 3 neg / 0 neu | **0.9000** | **0.8438** | 0.5625 | Xuất sắc: Nhận diện đúng 100% mẫu neg (3/3) và 88.2% mẫu pos (15/17). |
| `attitude` | $n = 25$ | 9 pos / 10 neg / 6 neu | **0.6400** | **0.5992** | 0.5992 | Đủ cả 3 lớp cảm xúc; phân loại tốt các ca trung lập văn phòng. |
| `warranty` | $n = 16$ | 16 pos / 0 neg / 0 neu | **0.6250** | **0.7692** | 0.2564 | 100% mẫu test là pos; F1 cố định 3 lớp bị chia 3 do 2 lớp còn lại có support = 0. |

---

## 8. Phân Tích Chuyên Sâu Lỗi Khía Cạnh `warranty` Trên TEST

Trên tập TEST, khía cạnh `warranty` có 16 mẫu xuất hiện và **100% đều mang nhãn thật là tích cực (`pos`)**. Tuy nhiên, mô hình đoán đúng 10/16 mẫu, đoán nhầm sang tiêu cực (`neg`) 4 mẫu và trung lập (`neu`) 2 mẫu (tỷ lệ lỗi 6/16 mẫu = 37.5%).

### 8.1. Danh Sách Các Trường Hợp Dự Đoán Sai Khía Cạnh Warranty
1. **`REV_RECO_0083`**: `"tay nghề đỉnh chóp, thêm nữa báo giá rất minh bạch và rẻ, nhưng chế độ bảo hành cực kỳ uy tín."`  
   - *Nhãn thật*: `pos` | *Dự đoán*: `neg` (Xác suất: `neg` = 0.439, `pos` = 0.430, chênh nhau chỉ 0.009).  
   - *Nguyên nhân*: Từ nối tương phản "nhưng" trong câu ghép khiến mô hình thiên về cực tính tiêu cực.
2. **`REV_RECO_0086`**: `"Kính gửi sàn SkillRental, nói chuyện nhát gừng khó chịu, thêm nữa chăm sóc sau dịch vụ cực kỳ tận tâm, nhưng sản phẩm bàn giao rất ưng ý."`  
   - *Nhãn thật*: `pos` | *Dự đoán*: `neg` (`neg` = 0.493, `pos` = 0.314).  
   - *Nguyên nhân*: Vế đầu "nói chuyện nhát gừng khó chịu" mang cảm xúc tiêu cực quá mạnh, làm tràn cảm xúc tiêu cực sang khía cạnh bảo hành.
3. **`REV_RECO_0100`**: `"Thiệt tình là ưng cái bụng ghê luôn á... kèm theo đó là hậu mãi chu đáo dài lâu."`  
   - *Nhãn thật*: `pos` | *Dự đoán*: `neu` (`neu` = 0.489, `pos` = 0.318).  
   - *Nguyên nhân*: Khẩu ngữ Nam Bộ dài làm giảm biên độ kích hoạt của lớp `pos`.
4. **`REV_RECO_0209`**: `"Kính gửi sàn SkillRental... chất lượng không như quảng cáo, thêm nữa cực kỳ khó tính và gắt gỏng, nhưng cam kết bảo hành dài hạn."`  
   - *Nhãn thật*: `pos` | *Dự đoán*: `neg` (`neg` = 0.557, `pos` = 0.338).  
   - *Nguyên nhân*: Câu chứa 2 vế chê gay gắt ("chất lượng không như quảng cáo", "khó tính và gắt gỏng"), mô hình n-gram túi từ không bóc tách được vế khen bảo hành độc lập ở cuối.
5. **`REV_RECO_0213`**: `"Đánh giá thật lòng... hỗ trợ chỉnh sửa phát sinh tận tình, mặc dù vậy ăn nói xấc xược coi thường khách."`  
   - *Nhãn thật*: `pos` | *Dự đoán*: `neu` (`neu` = 0.513, `pos` = 0.265).
6. *(Lưu ý đính chính: Mẫu `REV_RECO_0094` "Giá cả quá tốt! 4 sao" thực chất không có khía cạnh warranty trong ground-truth; đây là lỗi **Phát hiện khía cạnh sai (False Positive Tác vụ A)** do n-gram ký tự ngắn kích hoạt nhầm ngưỡng, đã được chuyển đúng sang mục 8.2).*

### 8.2. Các Lỗi Nhận Diện Sai Khía Cạnh (False Positive Tác Vụ A Điển Hình)
- **`REV_RECO_0094`**: `"Giá cả quá tốt! 4 sao."`  
  - *Nhãn thật*: Không nhắc warranty | *Dự đoán*: Nhận diện thừa có warranty ($p=0.46 > 0.45$). Do câu quá ngắn, n-gram ký tự ngắn bị trùng lặp nhẹ với đặc trưng của warranty.
- **`REV_RECO_0006`**: `"giá quá đắt đỏ. Khá là thất vọng vs cách làm việc này. 🙄"`  
  - *Nhãn thật*: Không nhắc speed | *Dự đoán*: Nhận diện thừa speed ($p=0.53 > 0.45$). Cụm "cách làm việc này" bị nhầm sang tiến độ.

### 8.3. Nguyên Nhân Gốc Rễ Từ Cơ Chế Chia Dữ Liệu Theo Provider
- **Lệch phân bố giữa Train và Test**: Do tập dữ liệu chia theo cụm Provider, các Provider rơi vào tập TEST (`PRV_RECO_001`, `005`, `011`, `016`, `021`) đều là các đối tác có hồ sơ bảo hành tốt nên khách hàng chỉ viết nhận xét tích cực (16 pos, 0 neg, 0 neu).
- Ngược lại, ở tập Train, phân bố bảo hành lại nghiêng hẳn về tiêu cực: **28 neg / 18 pos / 10 neu** (lớp neg chiếm 50% tập Train).
- Do đó, khi gặp các câu ghép có chứa yếu tố phàn nàn ở vế khác, mô hình bị thiên kiến tiên nghiệm (prior bias) kéo về lớp `neg`.

---

## 9. Hiệu Năng Phân Loại Theo Từng Nhóm Văn Phong Ngôn Ngữ Trên TEST

| Nhóm văn phong | Số mẫu Test ($n$) | Tác vụ A: Macro-F1 | Tác vụ B: Accuracy | Tác vụ B: Macro-F1 | Độ tin cậy thống kê |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Đời thường (casual)** | **24** | **0.7487** | 79.2% | 0.5569 | **Đủ mẫu kết luận** ($n \ge 10$) |
| **Trang trọng (formal)** | **17** | **0.8470** | 76.5% | 0.5537 | **Đủ mẫu kết luận** ($n \ge 10$) |
| **Chung chung (generic)** | **10** | *N/A (0 khía cạnh)*| *N/A* | *N/A* | **Đủ mẫu kết luận** ($n \ge 10$); đoán đúng 8/10 mẫu |
| **Giọng Bắc (northern)** | **7** | 0.8433 | 80.0% | 0.8000 | ⚠️ *Không đủ mẫu để kết luận* ($n < 10$) |
| **Giọng Nam (southern)** | **7** | 0.4825 | 71.4% | 0.3571 | ⚠️ *Không đủ mẫu để kết luận* ($n < 10$) |
| **Không dấu (no_accent)**| **5** | 0.7600 | 100.0% | 0.9333 | ⚠️ *Không đủ mẫu để kết luận* ($n < 10$) |
| **Teencode / Viết tắt** | **4** | 0.5600 | 100.0% | 1.0000 | ⚠️ *Không đủ mẫu để kết luận* ($n < 10$) |
| **Ngắn gọn (short)** | **4** | 0.5000 | 80.0% | 0.8000 | ⚠️ *Không đủ mẫu để kết luận* ($n < 10$) |
| **Ca khó (tricky / mỉa mai)**| **3** | 0.6000 | 100.0% | 1.0000 | ⚠️ *Không đủ mẫu để kết luận* ($n < 10$) |

---

## 10. Phân Tích Phụ Bổ Sung (Robustness & Statistical Significance)

> [!NOTE]
> Các phân tích dưới đây chỉ đóng vai trò phân tích phụ trợ nhằm đo lường độ ổn định thống kê, **hoàn toàn không thay thế kết quả kiểm thử chính thức trên tập TEST**.

### 10.1. Kiểm thử Rời một Provider (Leave-One-Provider-Out trên 400 Mẫu)
Thực hiện 24 lượt huấn luyện và kiểm thử (mỗi lượt giữ lại toàn bộ review của 1 Provider làm kiểm thử, huấn luyện trên 23 Provider còn lại):
- **Tác vụ A (Aspect Detection) Macro-F1**: **$0.8370 \pm 0.1388$** (Khoảng dao động: Min = 0.4000, Max = 1.0000)
- **Tác vụ B (Aspect Sentiment) Accuracy**: **$0.7942 \pm 0.1442$** (Khoảng dao động: Min = 0.4357, Max = 1.0000)
- **Kết luận đánh giá**: Kết quả **khá tốt nhưng dao động mạnh giữa các Provider (độ lệch chuẩn $\text{std} \approx 0.14$, giá trị thấp nhất rơi xuống $0.4000$)**. Điều này phản ánh rõ sự phụ thuộc của mô hình vào phong cách diễn đạt đặc thù của từng Persona chuyên gia.

### 10.2. So Sánh Hai Phương Pháp Bootstrap Trên Tập TEST (1.000 Lượt)
- **Review-level Bootstrap (i.i.d.)**:
  - Macro-F1 A: $0.7955$ $\to$ 95% CI: `[0.7352, 0.8477]`
  - Accuracy B: $0.7644$ $\to$ 95% CI: `[0.6726, 0.8622]`
  - *Ghi chú hạn chế*: Giả định các câu review độc lập (i.i.d.) đánh giá thấp mức độ bất định thực tế vì các review cùng một Provider có tính tương quan nội cụm (intra-cluster correlation).
- **Cluster Bootstrap theo Provider (Cụm 5 Provider trong TEST)**:
  - Macro-F1 A: $0.7955$ $\to$ **95% CI: `[0.7309, 0.8518]`**
  - Accuracy B: $0.7644$ $\to$ **95% CI: `[0.6787, 0.9096]`**
  - *Ý nghĩa*: Khoảng tin cậy của Cluster Bootstrap mở rộng hơn, phản ánh đúng hơn mức độ bất định khi khái quát hóa sang các Provider mới ngoài thực tế.

---

## 11. Đánh Giá Hệ Thống Gợi Ý (Recommender System Evaluation)

### 11.1. Giải Trình Về Nguồn Dữ Liệu & Hạn Chế Tính Tuần Hoàn
1. **Nguồn đánh giá `aspectScores`**:
   - **Bản chính thức (Out-of-Sample)**: Chỉ sử dụng dự đoán trên **142 review của 9 Provider thuộc tập Val và Test** (các Provider này hoàn toàn không nằm trong tập huấn luyện của mô hình ML).
   - **Bản tham khảo**: Đánh giá trên toàn bộ 400 review của 24 Provider (kết quả lạc quan hơn do có sự tham gia của các review thuộc tập Train).
2. **Nguồn Ground-Truth Relevance và Giới hạn tính tuần hoàn**:
   - Ground-truth relevance được tính từ `aspectProfile` trong `data/personas.js` (nhân vô hướng với `aspectWeights` của khách hàng).
   - *Cảnh báo giới hạn*: `aspectProfile` và kho cụm từ sinh review đều xuất phát từ cùng một thiết kế mô phỏng ban đầu trong Phần 2. Do đó, việc dùng `aspectProfile` để tính NDCG có **tính tuần hoàn nhất định (circularity)**.
   - Cỡ mẫu 9 Provider out-of-sample là tương đối nhỏ, kết quả **chưa đủ để đưa ra kết luận khái quát hóa tuyệt đối**, nhưng thể hiện rõ xu hướng cải thiện so với xếp hạng sao truyền thống.

### 11.2. Bảng Đối Soát Hiệu Năng Gợi Ý: Bản Out-of-Sample (Chính) vs Bản Toàn Bộ (Tham Khảo)

| Chỉ số đo lường hiệu năng | BẢN CHÍNH THỨC (9 Provider Val+Test - Out of Sample) | BẢN THAM KHẢO (Toàn bộ 24 Provider) | Ý nghĩa đánh giá |
| :--- | :---: | :---: | :--- |
| **NDCG@3 Recommender** | **0.9061** | **0.9383** | Gợi ý khía cạnh vượt trội so với Baseline rating |
| **NDCG@3 Baseline Rating** | 0.8565 | 0.7810 | Baseline rating xếp Provider cold-start 5 sao lên đầu |
| **Tăng trưởng NDCG@3** | **+4.96%** | **+15.73%** | Giữ vững ưu thế kể cả khi đánh giá out-of-sample |
| **NDCG@5 Recommender** | **0.9268** | **0.9289** | Danh sách gợi ý top 5 có chất lượng đồng đều |
| **NDCG@5 Baseline Rating** | 0.8979 | 0.8376 | Baseline rating bị suy giảm ở nhóm khách khó tính |
| **Tăng trưởng NDCG@5** | **+2.88%** | **+9.12%** | Gợi ý theo khía cạnh chuẩn xác hơn xếp hạng sao |
| **Precision@3 Recommender** | **0.5417** | **0.7500** | Tỷ lệ Provider thực sự phù hợp trong top 3 |
| **Precision@3 Baseline Rating** | 0.4583 | 0.5417 | Baseline chỉ đạt 45.8% - 54.2% |
| **Tăng trưởng Precision@3** | **+8.34%** | **+20.83%** | Tăng đáng kể khả năng tìm đúng chuyên gia |

---

## 12. Tổng Kết Những Gì Đã Sửa Đổi & Giới Hạn Còn Lại

### 12.1. Danh Mục Các Điểm Đã Sửa Đổi & Cập Nhật
1. **Minh bạch hóa Rule-based**: Ghi nhận Rule-based cũ trích từ `reviewCorpus.js` là baseline "không công bằng" (có rò rỉ); bổ sung đầy đủ baseline Rule-based độc lập chuẩn trên cả Val và Test.
2. **Chỉnh sửa nhận định chọn mô hình**: Xác nhận LR được chốt TRƯỚC KHI xem Test dựa trên Val và triển khai JSON; ghi nhận Linear SVM đạt kết quả cao hơn trên Test (Macro-F1 A 0.8506 vs 0.7955); đưa việc xuất trọng số Linear SVM sang hướng cải thiện tương lai.
3. **Giải thích chênh lệch Macro-F1 A (0.8971 vs 0.8788)**: Phân định rõ giữa mô hình dùng ngưỡng tinh chỉnh riêng ($t^* \in [0.40, 0.45]$) và mô hình dùng ngưỡng mặc định ($0.50$) trong Ablation.
4. **Chuẩn hóa số TEST làm trọng tâm**: Toàn bộ báo cáo lấy kết quả TEST (Macro-F1 A 0.7955, Accuracy B 0.7644) làm kết quả chính thức; đưa số Val về đúng vai trò tham khảo.
5. **Chuẩn hóa metric Tác vụ B & Phân tích lỗi Warranty**: Tính riêng Macro-F1 trên các lớp có support > 0 kèm số lượng $n$ mẫu; phân tích chi tiết từng trường hợp đoán sai của 16 mẫu warranty và chỉ ra nguyên nhân thiên lệch phân bố do chia theo cụm Provider; chuyển `REV_RECO_0094` sang nhóm False Positive Tác vụ A; gắn cảnh báo "không đủ mẫu kết luận" cho các nhóm văn phong có $n < 10$.
6. **Làm rõ nguồn dữ liệu gợi ý**: Lấy bản out-of-sample (9 Provider Val+Test) làm số liệu chính; chỉ rõ tính tuần hoàn của ground-truth relevance và hạn chế cỡ mẫu nhỏ.
7. **Bổ sung các phân tích phụ trợ**: Thực hiện Leave-One-Provider-Out (24 folds) trên 400 mẫu và đối chiếu hai phương pháp Bootstrap (review i.i.d. vs cluster Provider) trên tập Test.

### 12.2. Các Giới Hạn Kỹ Thuật Còn Tồn Tại
1. **Ngữ liệu tổng hợp (Synthetic Data)**: Toàn bộ 400 review xuất phát từ kho từ vựng 15 ô nên F1 trên tập kiểm thử ($0.7955$) có thể cao hơn so với review đời thực chứa nhiều biệt ngữ phức tạp.
2. **Cỡ mẫu Val/Test nhỏ**: Tập Test chỉ có 81 mẫu và Val chỉ có 61 mẫu, dẫn tới hiện tượng một số ô cực tính có $n < 10$ hoặc $n = 0$, làm tăng phương sai thống kê khi đánh giá các lớp thiểu số.
3. **Mô hình tuyến tính túi từ (N-gram TF-IDF)**: Chưa xử lý triệt để được các câu ghép đảo ngữ phức tạp chứa nhiều vế khen chê đan xen, dẫn đến hiện tượng tràn cảm xúc chéo (cross-aspect sentiment bleeding) như đã thấy ở khía cạnh warranty. Kiến trúc Transformer (PhoBERT) sẽ là hướng giải quyết triệt để ở giai đoạn tiếp theo.

---

## 13. Khung Kiểm Tra Ngoài Phân Phối Với Review Viết Tay (Out-of-Distribution Framework)
Đã dựng sẵn quy trình và bộ công cụ độc lập trong thư mục `data/handwritten/`, `scripts/` và `ml/`:
- Hướng dẫn viết review tự nhiên và quy tắc gán nhãn khắt khe: [`data/handwritten/HUONG_DAN.md`](file:///C:/Users/ADMIN/Downloads/CK_TMDT-main/data/handwritten/HUONG_DAN.md).
- File tiếp nhận dữ liệu từ người viết: [`data/handwritten/annotator_A.csv`](file:///C:/Users/ADMIN/Downloads/CK_TMDT-main/data/handwritten/annotator_A.csv).
- Script trích mẫu mù cho người kiểm thử thứ hai: [`scripts/prepareAnnotatorB.py`](file:///C:/Users/ADMIN/Downloads/CK_TMDT-main/scripts/prepareAnnotatorB.py).
- Bộ đo lường độ đồng thuận liên gán nhãn Cohen's Kappa: [`ml/annotation_agreement.py`](file:///C:/Users/ADMIN/Downloads/CK_TMDT-main/ml/annotation_agreement.py).
- Bộ đánh giá suy luận ngoài phân phối và kiểm tra tính toàn vẹn chữ ký số SHA256: [`ml/eval_handwritten.py`](file:///C:/Users/ADMIN/Downloads/CK_TMDT-main/ml/eval_handwritten.py).
