# HƯỚNG DẪN THAM GIA VIẾT & GÁN NHÃN ĐÁNH GIÁ (REVIEW)

Chào bạn, đây là tài liệu hướng dẫn nhanh để giúp đội ngũ xây dựng tập dữ liệu kiểm thử thực tế (Out-of-Distribution Test) cho hệ thống AI phân tích đánh giá dịch vụ. Mọi câu bạn viết sẽ đại diện cho người dùng thật và phản ánh sự đa dạng ngôn ngữ tự nhiên.

---

## 1. Bối Cảnh Viết Đánh Giá
Bạn hãy đóng vai một khách hàng đã thuê các dịch vụ tự do (freelance / dịch vụ địa phương) trên nền tảng thương mại điện tử, ví dụ:
- **Thiết kế đồ họa**: Thiết kế logo, banner, bộ nhận diện thương hiệu, vẽ minh họa.
- **Dạy học / Gia sư**: Gia sư tiếng Anh, luyện thi IELTS, dạy kèm Toán/Lý, kèm lập trình.
- **Sửa chữa thiết bị**: Sửa điện thoại thay màn hình, ép kính, bảo dưỡng laptop, sửa máy giặt.
- **Nhiếp ảnh & Quay phim**: Chụp ảnh kỷ yếu, chụp phóng sự cưới, chụp sản phẩm, quay video TikTok.
- **Nội dung / Dịch thuật**: Viết bài chuẩn SEO, dịch tài liệu, viết content Facebook.

---

## 2. Yêu Cầu Về Đa Dạng Văn Phong (Rất Quan Trọng)
Để kiểm tra độ nhạy bén của AI, chúng tôi cần các câu review phản ánh đủ các phong cách đời sống thật:
1. **Khen ngợi toàn diện**: Hài lòng về mọi mặt.
2. **Chê bai / Phàn nàn**: Bất mãn, thất vọng về dịch vụ.
3. **Khen chê đan xen (Câu ghép tương phản)**: Khen điểm này nhưng chê điểm khác (dùng từ nối *nhưng*, *tuy nhiên*, *mỗi tội*, *bù lại*...).
4. **Văn phong đời thường / Teencode**: Thoải mái dùng từ lóng, viết tắt quen thuộc (`ko`, `k`, `dc`, `đc`, `mk`, `lun`, `mn`, `oke`, `shop`, `quá đã`, `chán chả buồn nói`...).
5. **Tiếng Việt không dấu**: Gõ tự nhiên không dấu như trên điện thoại (`shop lam viec nhanh gia ca ok`).
6. **Câu rất ngắn / Cộc lốc**: `Tốt.`, `Quá tệ.`, `Hài lòng.`, `Làm ăn như hạch.`
7. **Câu chung chung (Không nhắc khía cạnh cụ thể)**: `Tuyệt vời 5 sao!`, `Ủng hộ shop nhiều nha.`, `Cảm ơn bạn nhiều.`

> [!WARNING] Cảnh báo quan trọng
> **KHÔNG** bắt chước các mẫu câu khuôn mẫu của AI hay các câu sinh tự động trong code. Hãy viết bằng giọng văn tự nhiên của chính bạn như khi bạn vừa trải nghiệm xong một dịch vụ ngoài đời!

---

## 3. Bảng Định Nghĩa 5 Khía Cạnh Cần Phân Tích
Hệ thống AI theo dõi chính xác **5 khía cạnh** sau:

| Khía Cạnh | Mã Cột | Định Nghĩa Cụ Thể | Ví Dụ Điển Hình |
| :--- | :--- | :--- | :--- |
| **Chất lượng** | `quality` | Năng lực chuyên môn, kết quả sản phẩm hoàn thiện, kỹ năng nghiệp vụ | *Logo rất đẹp, giảng bài dễ hiểu, làm ẩu tả, sửa xong vẫn bị lỗi* |
| **Giá cả** | `price` | Mức giá, chi phí, tính hợp lý của số tiền bỏ ra, phụ phí | *Giá sinh viên, chi phí hợp lý, giá hơi chát, báo giá ảo, đắt quá* |
| **Tốc độ** | `speed` | Tiến độ hoàn thành, thời gian bàn giao, mức độ đúng hẹn | *Giao bài thần tốc, đúng deadline, làm rề rà, trễ hẹn 3 ngày* |
| **Thái độ** | `attitude` | Phong cách phục vụ, sự lễ phép, nhiệt tình tư vấn, tôn trọng khách | *Chủ quán dễ thương, tư vấn tận tâm, cộc cằn, trả lời hời hợt* |
| **Bảo hành** | `warranty` | Chính sách sửa đổi, khắc phục lỗi sau bàn giao, hỗ trợ hậu mãi | *Sửa file free đến khi ưng, bảo hành 6 tháng, đem con bỏ chợ* |

---

## 4. Quy Tắc Gán Nhãn Cho Từng Khía Cạnh
Với mỗi câu review, bạn sẽ điền vào 5 cột tương ứng 5 khía cạnh (`quality`, `price`, `speed`, `attitude`, `warranty`).

Mỗi cột chỉ nhận **1 trong 4 giá trị**:
- `pos` *(Positive)*: Khách hàng khen hoặc thể hiện sự hài lòng về khía cạnh này.
- `neg` *(Negative)*: Khách hàng chê, phàn nàn, bất mãn về khía cạnh này.
- `neu` *(Neutral)*: Khách hàng nhắc tới khía cạnh nhưng ở mức độ khách quan, trung lập, không rõ khen hay chê (*"giá tầm trung bình", "tốc độ như bình thường", "làm theo đúng hợp đồng"*).
- `-` *(Dấu gạch ngang)*: Câu đánh giá **HOÀN TOÀN KHÔNG NHẮC TỚI** khía cạnh này.

> [!IMPORTANT] Quy tắc bất di bất dịch: KHÔNG SUY DIỄN
> - Chỉ gán nhãn khi câu nói **trực tiếp đề cập** đến khía cạnh đó.
> - **Tuyệt đối không suy diễn**: Ví dụ khách viết *"Dịch vụ tuyệt vời 5 sao, ủng hộ shop"* $\rightarrow$ Câu này không nhắc riêng tới chất lượng sản phẩm, giá cả, thời gian, thái độ hay bảo hành $\rightarrow$ **Cả 5 cột đều điền dấu `-`**.
> - Khách viết *"Bạn này vẽ logo đẹp xỉu"* $\rightarrow$ `quality=pos`, 4 cột còn lại điền `-`.
> - Khách viết *"Làm nhanh nhưng tính tiền đắt lòi"* $\rightarrow$ `speed=pos`, `price=neg`, 3 cột còn lại điền `-`.

---

## 5. Quy Trình Điền File
1. Mở file [`annotator_A.csv`](file:///C:/Users/ADMIN/Downloads/CK_TMDT-main/data/handwritten/annotator_A.csv) bằng Excel hoặc trình soạn thảo văn bản (lưu ý encoding UTF-8).
2. Điền thông tin:
   - `id`: Mã định danh (ví dụ: `HW_001`, `HW_002`, `HW_003`...).
   - `writer`: Tên hoặc biệt danh của bạn (để phân biệt người viết).
   - `text`: Nội dung câu review do bạn tự viết.
   - 5 cột nhãn: Điền `pos`, `neg`, `neu` hoặc `-`.
3. Lưu file dưới định dạng CSV UTF-8.
*(Lưu ý: 3 dòng ví dụ bắt đầu bằng `EXAMPLE_` chỉ để tham khảo, hệ thống sẽ tự động bỏ qua khi tính toán).*

## 6. Dữ liệu huấn luyện bổ sung

Sau khi gán nhãn, các dòng thật trong `annotator_A.csv` sẽ được thêm **chỉ vào tập train**. Dòng `EXAMPLE_` và `DEMO_` bị loại tự động. Không chép đánh giá tổng quát vào tập test; test hiện tại được giữ cố định để so sánh các phiên bản model.

`review_seed.csv` là bộ câu seed được biên soạn để tăng độ đa dạng miền dịch vụ và ca khen/chê đan xen. Đây là dữ liệu bổ trợ, không đại diện cho review khách hàng thật. Khi có thêm dữ liệu thật đã được gán nhãn, ưu tiên bổ sung vào `annotator_A.csv`.

`data/export/binh_luan_dich_vu_600_aspect.csv` là corpus 600 bình luận có nhãn sentiment tổng thể và đủ 5 khía cạnh (`chat_luong`, `gia`, `toc_do`, `thai_do`, `bao_hanh`; nhãn `positive`, `negative`, `neutral`, `none`). Nó được dùng cho cả model sentiment tổng thể và aspect. Trainer giữ các category cùng nhau và dành category riêng cho validation/test để đo khả năng tổng quát hóa sang loại dịch vụ chưa thấy.

Sau khi thêm dữ liệu, chạy `npm run ml:train` để huấn luyện và đánh giá cả model cảm xúc tổng thể lẫn 5 model khía cạnh. Kết quả được ghi tại `reports/overall_sentiment_metrics.json` và `reports/review_aspects_metrics.json`.
