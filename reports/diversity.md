# Báo Cáo Đo Lường Đa Dạng Ngữ Liệu Đánh Giá (Diversity Report)
**Thời điểm thực hiện**: 2026-10-27  
**Nguồn sinh**: Kho ngữ liệu `data/reviewCorpus.js` ghép câu với seed ngẫu nhiên cố định (Mulberry32).  
**Số lượng mẫu**: 400 đánh giá gắn với 450 đơn hàng thực tế.

---

## 1. Tổng quan Bộ Dữ Liệu
| Thực thể | Số lượng | Quy ước định danh | Ghi chú |
| :--- | :---: | :--- | :--- |
| **Providers** | **24** | `PRV_RECO_001` – `PRV_RECO_024` | 24 personas đại diện đủ 7 ngành, có 4 cold-start (<5 review). |
| **Services** | **26** | `SVC_RECO_xxx_x` | Giá niêm yết phản ánh chính xác phân khúc persona. |
| **Users (Provider Owners)** | **24** | `USR_RECO_P01` – `USR_RECO_P24` | Tài khoản đối tác sở hữu hồ sơ Provider tương ứng. |
| **Users (Customer Personas)** | **8** | `USR_RECO_C01` – `USR_RECO_C08` | 8 chân dung khách hàng có `aspectWeights` (tổng = 1.0). |
| **Orders** | **450** | `DH_RECO_0001` – `DH_RECO_0450` | 400 đơn hoàn thành (completed) + 50 đơn hủy/đang làm. |
| **Reviews** | **400** | `REV_RECO_0001` – `REV_RECO_0400` | Gắn 1-1 với 400 đơn hoàn tất, kèm `groundTruth`. |

---

## 2. Kiểm Soát Trùng Lặp & Tính Đa Dạng (N-gram Uniqueness)
- **Tỉ lệ trùng lặp hoàn toàn (Duplicate Rate)**: **0.00%** *(Tiêu chí bắt buộc: < 2%)* -> **ĐẠT XUẤT SẮC**.
- **Số câu hoàn toàn duy nhất (Unique Sentences)**: **400 / 400**.
- **Chỉ số Distinct-N (Độ phong phú từ vựng & cụm từ)**:
  - **Distinct-1 (Từ đơn duy nhất)**: `0.1022`
  - **Distinct-2 (Bigram duy nhất)**: `0.3224`
  - **Distinct-3 (Trigram duy nhất)**: `0.4673`

---

## 3. Phân Bố Văn Phong (Linguistic Styles)
Bộ dữ liệu mô phỏng chân thực các sắc thái ngôn ngữ của người dùng Việt Nam:

| Phong cách văn phong | Số lượng mẫu | Tỷ lệ | Đặc điểm ngữ liệu |
| :--- | :---: | :---: | :--- |
| **Đời thường (Casual)** | 120 | 30.0% | Tự nhiên, đệm từ thông dụng, chuẩn tiếng Việt giao tiếp. |
| **Trang trọng (Formal)** | 70 | 17.5% | Kính ngữ, từ ngữ lịch sự, trân trọng đối tác. |
| **Bắc Bộ (Northern)** | 31 | 7.8% | "chuẩn đét", "xịn sò", "quá đã", "ối dồi ôi". |
| **Nam Bộ (Southern)** | 26 | 6.5% | "ưng cái bụng", "thiệt tình", "dễ thương dữ thần", "ngon lành". |
| **Teencode / Viết tắt** | 30 | 7.5% | mk, đc, ko, quớ, nhéee, chuẩnnn, tốt lắm lun. |
| **Không dấu (No-accent)** | 34 | 8.5% | Mô phỏng người dùng gõ nhanh trên điện thoại không dấu. |
| **Ngắn gọn (Short & Punchy)**| 18 | 4.5% | Cụt lủn: "Rất tốt. 5 sao.", "Quá tệ." |
| **Chung chung (Generic)** | 52 | 13.0% | ~15% đánh giá tổng quan không nhắc khía cạnh cụ thể. |
| **Ca khó (Tricky / Sarcasm)** | 19 | 4.8% | Phủ định kép ("không thể không khen"), mỉa mai nhẹ ("nhanh như rùa bò"). |

---

## 4. Phân Bố Độ Dài Đánh Giá
- **Số ký tự (Character count)**:
  - Thấp nhất (Min): **15 ký tự**
  - Cao nhất (Max): **220 ký tự**
  - Trung bình (Mean): **90 ký tự**
  - Trung vị (Median): **86 ký tự**
- **Số từ (Word count)**:
  - Thấp nhất (Min): **4 từ**
  - Cao nhất (Max): **48 từ**
  - Trung bình (Mean): **20 từ**
  - Trung vị (Median): **19 từ**

### Biểu đồ phân bổ khoảng độ dài
| Khoảng độ dài ký tự | Số lượng review | Tỷ lệ |
| :--- | :---: | :---: |
| < 50 ký tự (ngắn/cụt) | 43 | 10.8% |
| 50 - 150 ký tự (vừa vặn) | 326 | 81.5% |
| 150 - 300 ký tự (chi tiết) | 31 | 7.8% |
| > 300 ký tự (dài dòng/kèm bối cảnh) | 0 | 0.0% |

---

## 5. Phân Bố Số Lượng Khía Cạnh Trong Mỗi Đánh Giá
| Số khía cạnh được nhắc tới | Số lượng review | Tỷ lệ | Ý nghĩa đối với bài toán ML |
| :---: | :---: | :---: | :--- |
| **0 khía cạnh** *(Generic)* | **52** | 13.0% | Kiểm thử khả năng nhận diện review không chứa khía cạnh nào. |
| **1 khía cạnh** | **134** | 33.5% | Đánh giá tập trung vào 1 yếu tố duy nhất. |
| **2 khía cạnh** | **175** | 43.8% | Phổ biến nhất (chứa cả câu khen-khen hoặc câu trái chiều khen-chê). |
| **3 khía cạnh** | **39** | 9.8% | Đánh giá nhiều tầng nghĩa, câu ghép phức hợp. |

---

## 6. Kiểm Định Số Cụm Diễn Đạt Từng Ô (Khía Cạnh x Cực Tính)
Yêu cầu tối thiểu: **>= 15 cụm từ độc lập cho mỗi ô**.  
Kết quả kiểm toán thực tế trong `data/reviewCorpus.js`:

| Khía cạnh (Aspect) | Cực tính (Sentiment) | Số cụm từ khác nhau | Trạng thái |
| :--- | :--- | :---: | :---: |
| `quality` | `pos` | **22** | Đạt (>= 15) |
| `quality` | `neg` | **21** | Đạt (>= 15) |
| `quality` | `neu` | **16** | Đạt (>= 15) |
| `price` | `pos` | **20** | Đạt (>= 15) |
| `price` | `neg` | **20** | Đạt (>= 15) |
| `price` | `neu` | **16** | Đạt (>= 15) |
| `speed` | `pos` | **20** | Đạt (>= 15) |
| `speed` | `neg` | **20** | Đạt (>= 15) |
| `speed` | `neu` | **16** | Đạt (>= 15) |
| `attitude` | `pos` | **20** | Đạt (>= 15) |
| `attitude` | `neg` | **20** | Đạt (>= 15) |
| `attitude` | `neu` | **16** | Đạt (>= 15) |
| `warranty` | `pos` | **20** | Đạt (>= 15) |
| `warranty` | `neg` | **20** | Đạt (>= 15) |
| `warranty` | `neu` | **16** | Đạt (>= 15) |

*Tất cả 15 ô đều vượt xa yêu cầu (thấp nhất là 16 cụm, cao nhất 22 cụm).*

---

## 7. Phân Chia Tập Dữ Liệu Huấn Luyện (Group-Split By Provider)
Chia theo cụm Provider để chống rò rỉ thông tin (Data Leakage) giữa tập train và test:

| Tập dữ liệu (Split) | Số lượng review | Tỷ lệ review | Số lượng Provider | Danh sách Provider ID |
| :--- | :---: | :---: | :---: | :--- |
| **Train** | **258** | **64.5%** | 15 | PRV_RECO_002, 004, 006, 007, 009, 010, 012, 014, 015, 017, 018, 019, 020, 023, 024 |
| **Validation (Val)** | **61** | **15.3%** | 4 | PRV_RECO_003, 008, 013, 022 |
| **Test** | **81** | **20.3%** | 5 | PRV_RECO_001, 005, 011, 016, 021 |
| **Tổng cộng** | **400** | **100%** | **24** | *Hoàn hảo theo chuẩn ML benchmark.* |

---

## 8. Kết Luận Kiểm Toán Dữ Liệu
- Toàn bộ **450 đơn hàng** và **400 đánh giá** đều sở hữu khóa ngoại hợp lệ 100%, không trỏ tới các bản ghi lỗi sẵn (`PRV004`, `PRV005`, `PRV006`, `USR007`, `SVC_CUSTOM`, `REV002`).
- Điểm đánh giá (`rating`), tổng số đánh giá (`reviewCount`), số đơn hoàn thành (`completedOrders`) và tỷ lệ hủy (`cancelRate`) của các Provider và Service đều tính toán tự động khớp với công thức của `data/db.js`.
- Đã xuất sẵn tệp `data/export/reviews_labeled.json` sẵn sàng cho giai đoạn huấn luyện mô hình học máy ở Phần 3.
