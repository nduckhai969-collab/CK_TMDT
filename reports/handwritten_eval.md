# Báo Cáo Đánh Giá Ngoài Phân Phối (Out-of-Distribution Evaluation)
**Tập dữ liệu**: Review do người thật viết tay và gán nhãn độc lập (`data/handwritten/annotator_A.csv`)  
**Ngày thực hiện**: 2026-10-28 13:22:09  
**Chữ ký số SHA256 chống sửa đổi**: `4ced3dd36dc6850bdde33573f4f5300be879d8f7739648ff640dc028d1543b04`  

## 1. Tóm Tắt Tập Dữ Liệu Kiểm Thử
- **Tổng số câu đánh giá hợp lệ**: **17 câu**
- **Số lượng người viết (Writers)**: 17 người (Writer_Adam, Writer_Bella, Writer_Ian, Writer_Julia, Writer_Laura, Writer_Mike, Writer_Nina, Writer_Oscar, Writer_Paul, Writer_Queen, Writer_Ryan, Writer_Sophia, Writer_Tom, Writer_Uma, Writer_Wendy, Writer_Xavier, Writer_Yara)

> [!WARNING] Cảnh báo kích thước mẫu nhỏ
> Số lượng mẫu hiện tại ($n = 17$) nhỏ hơn 30. Kết quả đánh giá mang tính định hướng ban đầu (pilot evaluation), sai số thống kê còn lớn. Cần bổ sung thêm người viết để đạt mức tối thiểu 30–50 mẫu nhằm khẳng định chắc chắn.

### Phân bố khía cạnh trong tập viết tay:
| Khía Cạnh | Số Câu Xuất Hiện (Support) | Tỷ Lệ Xuất Hiện (%) |
| :--- | :---: | :---: |
| `quality` | 13 | 76.5% |
| `price` | 7 | 41.2% |
| `speed` | 7 | 41.2% |
| `attitude` | 7 | 41.2% |
| `warranty` | 3 | 17.6% |

---

## 2. Kết Quả Tác Vụ A: Nhận Diện Khía Cạnh (Aspect Detection)
**Macro-F1**: **0.6491** (So với TEST chính thức: 0.7955 $\rightarrow$ **Độ suy giảm: -18.41%**)  
**Micro-F1**: **0.6957** (So với TEST chính thức: 0.8000)  

| Khía Cạnh | Precision (HW) | Recall (HW) | F1-Score (HW) | F1-Score (TEST) | Độ Thay Đổi (%) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `quality` | 1.0000 | 0.5385 | **0.7000** | 0.7941 | -11.85% |
| `price` | 0.7778 | 1.0000 | **0.8750** | 0.9153 | -4.40% |
| `speed` | 0.6667 | 0.5714 | **0.6154** | 0.8387 | -26.63% |
| `attitude` | 0.8333 | 0.7143 | **0.7692** | 0.7797 | -1.34% |
| `warranty` | 0.2500 | 0.3333 | **0.2857** | 0.6429 | -55.56% |

---

## 3. Kết Quả Tác Vụ B: Phân Loại Cực Tính (Aspect Sentiment)
**Mean Accuracy**: **0.5612** (So với TEST chính thức: 0.7644 $\rightarrow$ **Độ suy giảm: -26.59%**)  
**Mean Macro-F1**: **0.4970** (So với TEST chính thức: 0.6987)  

| Khía Cạnh | Số Mẫu (n) | Accuracy (HW) | Acc (TEST) | Macro-F1 (HW) | Macro-F1 (TEST) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `quality` | 13 | **0.6154** | 0.7576 | **0.4078** | 0.7576 |
| `price` | 7 | **0.4286** | 0.8621 | **0.4524** | 0.8687 |
| `speed` | 7 | **0.7143** | 0.8125 | **0.7083** | 0.8125 |
| `attitude` | 7 | **0.7143** | 0.8846 | **0.4167** | 0.8846 |
| `warranty` | 3 | **0.3333** | 0.5000 | **0.5000** | 0.5000 |

---

## 4. Phân Tích Độ Suy Giảm Hiệu Năng & Hiện Tượng Dịch Chuyển Phân Bố (Domain Shift)
Khi đánh giá trên review người thật viết tay không theo khuôn mẫu tổng hợp:
1. **Văn phong tự nhiên & Từ lóng mới**: Người thật sử dụng nhiều từ ngữ địa phương, tiếng lóng mạng xã hội và cách gõ tắt đa dạng ngoài tập từ vựng đào tạo (OOV words).
2. **Cấu trúc câu ghép phức tạp**: Các câu khen chê tương phản (*'vẽ logo rất đẹp nhưng thái độ nhắn tin cọc cằn'*) đòi hỏi mô hình phân bổ chính xác cảm xúc về đúng khía cạnh mà không bị hiện tượng tràn cảm xúc chéo (sentiment bleeding).
3. **Khía cạnh Bảo hành (Warranty)**: Trong thực tế, khách hàng ít khi nhắc tới bảo hành trừ khi gặp sự cố, do đó số lượng mẫu khía cạnh này thường có support thấp và phân bố cực tính lệch.

---

## 5. Các Mẫu Dự Đoán Cần Rà Soát (Lỗi Điển Hình)
- **[DEMO_004]** *"Code web giao đúng hẹn, giao diện đẹp mắt nhưng báo giá hơi cao so với mặt bằng chung."*
  - Sai lệch: B(price: GT=neg vs Pred=neu), A(speed: GT=1 vs Pred=0)
- **[DEMO_005]** *"Lần đầu hợp tác thấy bạn hỗ trợ rất chu đáo, giải đáp thắc mắc nhiệt tình từ A đến Z."*
  - Sai lệch: A(warranty: GT=0 vs Pred=1)
- **[DEMO_006]** *"File thiết kế chất lượng cực tốt, vừa đúng ý mình mà không cần chỉnh sửa gì thêm."*
  - Sai lệch: B(quality: GT=pos vs Pred=neu), A(price: GT=0 vs Pred=1)
- **[DEMO_007]** *"Giao bài muộn cả tuần lễ làm ảnh hưởng tiến độ dự án, bài viết thì dán Google Translate sơ sài."*
  - Sai lệch: B(quality: GT=neg vs Pred=pos), B(speed: GT=neg vs Pred=pos)
- **[DEMO_008]** *"Thiết kế bao bì độc đáo, lấy file nhanh mà chi phí lại vô cùng hợp lý."*
  - Sai lệch: A(quality: GT=1 vs Pred=0), B(price: GT=pos vs Pred=neg), A(speed: GT=1 vs Pred=0), A(warranty: GT=0 vs Pred=1)
- **[DEMO_009]** *"Sửa đi sửa lại 4-5 lần bạn vẫn nhẹ nhàng vui vẻ lắng nghe, dịch vụ CSKH xuất sắc."*
  - Sai lệch: A(warranty: GT=1 vs Pred=0)
- **[DEMO_010]** *"File thu âm bị nhiễu tiếng ồn nặng, chất lượng quá kém so với chi phí bỏ ra."*
  - Sai lệch: B(quality: GT=neg vs Pred=neu), B(price: GT=neg vs Pred=pos)
- **[DEMO_011]** *"Hỗ trợ bảo hành website tận tâm, sau bàn giao nửa tháng bị lỗi bạn vẫn vào fix lại hoàn toàn miễn phí."*
  - Sai lệch: A(attitude: GT=1 vs Pred=0)
- **[DEMO_012]** *"Giá rẻ nhưng làm ăn cẩu thả, giao hàng trễ hẹn mà hỏi tới thì viện đủ lý do bao biện."*
  - Sai lệch: A(quality: GT=1 vs Pred=0), B(attitude: GT=neg vs Pred=pos)
- **[DEMO_013]** *"Hình ảnh 3D dựng siêu thực, render nét căng đúng chuẩn yêu cầu luôn nha."*
  - Sai lệch: A(quality: GT=1 vs Pred=0), A(attitude: GT=0 vs Pred=1)

*(Còn 5 trường hợp sai lệch khác...)*
