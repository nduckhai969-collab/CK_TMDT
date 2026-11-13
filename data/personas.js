/**
 * data/personas.js
 * Định nghĩa 24 Provider Personas và 8 Customer Test Personas.
 * Mỗi persona có hồ sơ điểm mạnh/yếu cố định cho 5 khía cạnh:
 *   - quality (tay nghề, chuyên môn)
 *   - price (giá cả: cao điểm = rẻ/hợp lý, thấp điểm = đắt đỏ)
 *   - speed (tốc độ: cao điểm = nhanh/đúng giờ, thấp điểm = chậm trễ)
 *   - attitude (thái độ: cao điểm = nhiệt tình/chu đáo, thấp điểm = khó tính/cộc cằn)
 *   - warranty (bảo hành: cao điểm = hậu mãi uy tín/dài hạn, thấp điểm = phủi trách nhiệm)
 *
 * Gắn nhãn seedTag: "reco-eval" trên mọi bản ghi.
 */

const PROVIDER_PERSONAS = [
  {
    code: 'P01',
    archetype: 'Chuyên gia IT Senior: Đắt xắt ra miếng, bảo hành trọn đời, kỹ tính',
    name: 'Vũ Quốc Thái',
    category: 'IT',
    specialty: 'Kiến Trúc Sư Hệ Thống Cloud & Microservices',
    location: 'Quận 1, TP. Hồ Chí Minh',
    hourlyRate: 700000,
    availabilityStatus: 'ready',
    verified: true,
    badge: 'PRO PROVIDER',
    bio: '10 năm thiết kế hệ thống chịu tải lớn, tối ưu AWS, Docker, Kubernetes cho các tập đoàn Fintech.',
    skills: ['AWS Solutions', 'Kubernetes', 'Node.js', 'Go', 'Microservices', 'PostgreSQL'],
    certifications: ['AWS Certified Solutions Architect Professional', 'CKA Kubernetes'],
    aspectProfile: { quality: 4.9, price: 2.1, speed: 4.7, attitude: 3.6, warranty: 4.9 },
    cancelProbability: 0.02,
    targetReviews: 26,
    services: [
      {
        title: 'Tư vấn kiến trúc Cloud & Tối ưu chịu tải Microservices',
        price: 8500000,
        priceUnit: 'Dự án',
        duration: '5-7 ngày',
        desc: 'Thiết kế hệ thống chịu tải 100k CCU, chuẩn CI/CD Kubernetes, cam kết bảo hành hiệu năng 6 tháng.'
      },
      {
        title: 'Kiểm toán an ninh mạng & Pentest ứng dụng web',
        price: 6000000,
        priceUnit: 'Dự án',
        duration: '3-5 ngày',
        desc: 'Rà soát lỗ hổng bảo mật chuẩn OWASP Top 10, cấp báo cáo và hướng dẫn vá lỗi chi tiết.'
      }
    ]
  },
  {
    code: 'P02',
    archetype: 'Sinh viên IT làm thêm: Siêu rẻ, nhiệt tình, nhưng tay nghề trung bình & chậm trễ',
    name: 'Đoàn Thế Anh',
    category: 'IT',
    specialty: 'Lập Trình Web Frontend React & Fix Bug Cơ Bản',
    location: 'Cầu Giấy, Hà Nội',
    hourlyRate: 120000,
    availabilityStatus: 'ready',
    verified: false,
    badge: 'NEW SELLER',
    bio: 'Sinh viên năm 4 CNTT nhận code đồ án, cắt HTML/CSS từ Figma, sửa lỗi giao diện giá sinh viên.',
    skills: ['React.js', 'HTML/CSS', 'JavaScript', 'Bootstrap', 'Git'],
    certifications: [],
    aspectProfile: { quality: 3.2, price: 4.9, speed: 2.4, attitude: 4.8, warranty: 2.8 },
    cancelProbability: 0.12,
    targetReviews: 22,
    services: [
      {
        title: 'Cắt giao diện HTML/CSS/React từ file Figma chuẩn responsive',
        price: 450000,
        priceUnit: 'Gói',
        duration: '3-5 ngày',
        desc: 'Chuyển đổi thiết kế sang mã nguồn sạch, chạy tốt trên mobile và desktop, hỗ trợ chỉnh sửa nhiệt tình.'
      }
    ]
  },
  {
    code: 'P03',
    archetype: 'Agency Design tốc độ cao: Nhanh như chớp, chất lượng đỉnh, giá cao, ít bảo hành',
    name: 'Lâm Hoàng Bách',
    category: 'Design',
    specialty: 'Giám Đốc Nghệ Thuật & Thiết Kế UI/UX Cấp Tốc',
    location: 'Bình Thạnh, TP. Hồ Chí Minh',
    hourlyRate: 600000,
    availabilityStatus: 'ready',
    verified: true,
    badge: 'TOP RATED',
    bio: 'Cựu Art Director tại Dentsu. Chuyên nhận dự án gấp trong 24-48h với tiêu chuẩn thẩm mỹ quốc tế.',
    skills: ['Figma Master', 'UI/UX Mobile', 'Branding', 'Design System', 'Design Sprint'],
    certifications: ['Google UX Design Professional', 'Interaction Design Foundation'],
    aspectProfile: { quality: 4.8, price: 2.3, speed: 4.9, attitude: 4.1, warranty: 2.9 },
    cancelProbability: 0.04,
    targetReviews: 25,
    services: [
      {
        title: 'Thiết kế giao diện Mobile App cao cấp trong 48 giờ',
        price: 7500000,
        priceUnit: 'Dự án',
        duration: '2 ngày',
        desc: 'Bàn giao trọn bộ UI Kit Figma, Prototype tương tác mượt mà, sẵn sàng chuyển cho dev.'
      },
      {
        title: 'Thiết kế Key Visual & Bộ nhận diện sự kiện ra mắt',
        price: 5000000,
        priceUnit: 'Gói',
        duration: '2 ngày',
        desc: 'Sáng tạo KV độc quyền, adapt kích thước cho tất cả kênh truyền thông online & offline.'
      }
    ]
  },
  {
    code: 'P04',
    archetype: 'Freelancer Design tận tâm: Giá hạt dẻ, thái độ 10/10, bảo hành nhiệt tình, hơi chậm deadline',
    name: 'Ngô Mỹ Linh',
    category: 'Design',
    specialty: 'Thiết Kế Banner, Poster & Ấn Phẩm Truyền Thông',
    location: 'Đống Đa, Hà Nội',
    hourlyRate: 180000,
    availabilityStatus: 'ready',
    verified: true,
    badge: 'THÂN THIỆN',
    bio: 'Freelancer 4 năm yêu nghề. Luôn lắng nghe, chỉnh sửa không giới hạn đến khi khách thật sự hài lòng.',
    skills: ['Photoshop', 'Illustrator', 'Canva Pro', 'Typography', 'Social Post Design'],
    certifications: ['Arena Multimedia Certificate'],
    aspectProfile: { quality: 4.2, price: 4.7, speed: 2.6, attitude: 4.9, warranty: 4.8 },
    cancelProbability: 0.06,
    targetReviews: 24,
    services: [
      {
        title: 'Gói thiết kế 10 Banner mạng xã hội & Quảng cáo chuyển đổi',
        price: 900000,
        priceUnit: 'Gói',
        duration: '4-6 ngày',
        desc: 'Thiết kế tone sur tone nhận diện thương hiệu, sửa đổi thoải mái không phụ thu.'
      }
    ]
  },
  {
    code: 'P05',
    archetype: 'Thợ điện lạnh lão làng: Tay nghề số 1, đúng giờ, giá hợp lý, khó tính cộc cằn',
    name: 'Bùi Văn Hùng',
    category: 'Repair',
    specialty: 'Kỹ Sư Điện Lạnh & Bảo Trì Hệ Thống Lạnh Trung Tâm',
    location: 'Quận 7, TP. Hồ Chí Minh',
    hourlyRate: 250000,
    availabilityStatus: 'ready',
    verified: true,
    badge: 'THỢ LÀNH NGHỀ',
    bio: '20 năm nghề sửa máy lạnh, tủ đông công nghiệp. Trị triệt để mọi ca rò rỉ gas, hỏng bo mạch inverter.',
    skills: ['Sửa Bo Mạch Inverter', 'Nạp Gas R32/R410A', 'Bảo Trì VRV Daikin', 'Xử Lý Rò Nước'],
    certifications: ['Chứng chỉ Thợ Điện Lạnh Bậc 5/7', 'Đào Tạo Kỹ Thuật Viên Daikin Pro'],
    aspectProfile: { quality: 4.9, price: 4.0, speed: 4.6, attitude: 2.1, warranty: 4.2 },
    cancelProbability: 0.05,
    targetReviews: 25,
    services: [
      {
        title: 'Khắc phục triệt để lỗi chảy nước, không lạnh máy điều hòa Inverter',
        price: 350000,
        priceUnit: 'Lần đến',
        duration: '1-2 giờ',
        desc: 'Kiểm tra đo đạc bằng đồng hồ chuyên dụng, thay thế linh kiện chính hãng kèm bảo hành 6 tháng.'
      }
    ]
  },
  {
    code: 'P06',
    archetype: 'Thợ sửa chữa khẩn cấp: Đến ngay sau 15p, giá chát, bảo hành ngắn',
    name: 'Trịnh Quốc Bảo',
    category: 'Repair',
    specialty: 'Sửa Chữa Khẩn Cấp Điện Nước & Khóa Cửa 24/7',
    location: 'Ba Đình, Hà Nội',
    hourlyRate: 400000,
    availabilityStatus: 'ready',
    verified: true,
    badge: 'CỨU HỘ 24/7',
    bio: 'Đội thợ cơ động tại các quận nội thành Hà Nội, có mặt ngay lập tức bất kể ngày đêm khi có sự cố chập điện.',
    skills: ['Dò Tìm Rò Điện', 'Thông Tắc Khẩn Cấp', 'Mở Khóa Cửa', 'Hàn Ống Nhiệt PPR'],
    certifications: ['Chứng chỉ An toàn Điện Cao thế & Hạ thế'],
    aspectProfile: { quality: 4.1, price: 1.9, speed: 4.9, attitude: 3.7, warranty: 2.4 },
    cancelProbability: 0.08,
    targetReviews: 23,
    services: [
      {
        title: 'Cứu hộ chập cháy điện, vỡ ống nước khẩn cấp tận nhà trong 20 phút',
        price: 550000,
        priceUnit: 'Lần đến',
        duration: '30-45 phút',
        desc: 'Xử lý ngay các điểm nóng chập cháy nổ cầu dao, ngắt nước rò rỉ bảo vệ tài sản gia đình.'
      }
    ]
  },
  {
    code: 'P07',
    archetype: 'Dọn dẹp công nghiệp giá rẻ: Giá hạt dẻ, làm siêu nhanh, nhưng lau sơ sài',
    name: 'Lý Thị Nụ',
    category: 'Home',
    specialty: 'Dọn Dẹp Nhanh Căn Hộ Chung Cư & Phòng Trọ',
    location: 'Gò Vấp, TP. Hồ Chí Minh',
    hourlyRate: 80000,
    availabilityStatus: 'ready',
    verified: false,
    badge: '',
    bio: 'Nhận dọn dẹp theo giờ, lau chùi nhanh gọn, đổ rác, quét dọn giá bình dân cho sinh viên, công nhân.',
    skills: ['Quét Lau Nhà', 'Rửa Bát Đĩa', 'Phơi Gấp Quần Áo', 'Dọn Phòng Trọ'],
    certifications: [],
    aspectProfile: { quality: 2.5, price: 4.9, speed: 4.7, attitude: 3.8, warranty: 1.9 },
    cancelProbability: 0.15,
    targetReviews: 21,
    services: [
      {
        title: 'Dọn dẹp nhanh căn hộ chung cư 2 phòng ngủ gói tiết kiệm 2 giờ',
        price: 160000,
        priceUnit: 'Giờ',
        duration: '2 giờ',
        desc: 'Hút bụi sàn nhà, lau dọn bàn ghế cơ bản, đổ rác sạch sẽ với chi phí tối ưu nhất.'
      }
    ]
  },
  {
    code: 'P08',
    archetype: 'Quản gia cao cấp chuẩn Nhật: Tỉ mỉ sạch bóng, bảo hành dọn lại nếu chưa ưng, giá rất đắt',
    name: 'Đặng Mai Phương',
    category: 'Home',
    specialty: 'Tổng Vệ Sinh Cao Cấp & Tổ Chức Không Gian Chuẩn Marie Kondo',
    location: 'Tây Hồ, Hà Nội',
    hourlyRate: 350000,
    availabilityStatus: 'ready',
    verified: true,
    badge: 'VIP PROVIDER',
    bio: 'Tốt nghiệp khóa đào tạo Quản gia Khách sạn 5 sao. Sử dụng 100% hóa chất sinh học nhập khẩu Đức và máy hơi nước Karcher.',
    skills: ['Khử Khuẩn Nano Bạc', 'Sắp Xếp Nhà Cửa', 'Giặt Hấp Đồ Hiệu', 'Chăm Sóc Nội Thất Da/Gỗ'],
    certifications: ['Chứng chỉ Tiêu Chuẩn Vệ Sinh Khách Sạn 5 Sao', 'Chứng nhận Marie Kondo Consultant'],
    aspectProfile: { quality: 4.9, price: 1.8, speed: 4.4, attitude: 4.9, warranty: 4.9 },
    cancelProbability: 0.02,
    targetReviews: 24,
    services: [
      {
        title: 'Tổng vệ sinh khử khuẩn chuyên sâu căn hộ Penthouse / Biệt thự',
        price: 2800000,
        priceUnit: 'Dự án',
        duration: '5-6 giờ',
        desc: 'Làm sạch toàn diện bằng máy hơi nước nóng 150 độ C, cam kết dọn lại miễn phí nếu phát hiện hạt bụi.'
      }
    ]
  },
  {
    code: 'P09',
    archetype: 'Gia sư IELTS 8.5: Chuyên môn cực đỉnh, nhiệt tình, học phí đắt đỏ, lịch bận rộn',
    name: 'Hoàng Minh Quân',
    category: 'Tutor',
    specialty: 'Luyện Thi IELTS Speaking & Writing Chuyên Sâu 7.5 - 8.5',
    location: 'Hải Châu, Đà Nẵng',
    hourlyRate: 500000,
    availabilityStatus: 'busy',
    verified: true,
    badge: 'VERIFIED EXPERT',
    bio: 'IELTS Overall 8.5 (Speaking 9.0). 6 năm kinh nghiệm cày đề chuyên sâu, chấm bài sửa từng từ vựng collocation học thuật.',
    skills: ['IELTS 8.5', 'Speaking 9.0', 'Writing 8.5', 'Phản Xạ Tự Nhiên', 'Collocations Học Thuật'],
    certifications: ['IELTS 8.5 IDP', 'CELTA Cambridge'],
    aspectProfile: { quality: 4.9, price: 2.1, speed: 3.3, attitude: 4.8, warranty: 4.6 },
    cancelProbability: 0.05,
    targetReviews: 22,
    services: [
      {
        title: 'Kèm 1-1 Luyện đề Mock Test Speaking & Chữa chi tiết 5 bài Writing Task 2',
        price: 750000,
        priceUnit: 'Buổi 90 phút',
        duration: 'Theo lịch hẹn',
        desc: 'Sửa lỗi phát âm ngữ điệu trực tiếp qua Google Meet, cung cấp bản chữa Writing chi tiết với band descriptors.'
      }
    ]
  },
  {
    code: 'P10',
    archetype: 'Sinh viên sư phạm dạy kèm: Giá rẻ, rất kiên nhẫn, kèm tận tình, kinh nghiệm non',
    name: 'Nguyễn Thảo Vy',
    category: 'Tutor',
    specialty: 'Gia Sư Tiếng Anh Cơ Bản Cho Người Mất Gốc & Học Sinh Cấp 2',
    location: 'Thủ Đức, TP. Hồ Chí Minh',
    hourlyRate: 150000,
    availabilityStatus: 'ready',
    verified: true,
    badge: 'THÂN THIỆN',
    bio: 'Sinh viên năm 3 ĐH Sư Phạm TP.HCM, hiền lành, yêu trẻ, kiên nhẫn dạy từng phát âm IPA và ngữ pháp nền tảng.',
    skills: ['Tiếng Anh Cơ Bản', 'Ngữ Pháp Nền Tảng', 'Luyện Thi Vào 10', 'Kiên Nhẫn'],
    certifications: ['Bằng B2 VSTEP'],
    aspectProfile: { quality: 3.6, price: 4.9, speed: 4.1, attitude: 4.9, warranty: 3.7 },
    cancelProbability: 0.04,
    targetReviews: 23,
    services: [
      {
        title: 'Khóa học kèm Tiếng Anh lấy lại gốc ngữ pháp & phát âm chuẩn IPA',
        price: 220000,
        priceUnit: 'Buổi 90 phút',
        duration: '10 buổi',
        desc: 'Giáo trình gần gũi, không áp lực, hỗ trợ giải đáp bài tập trên lớp 24/7 qua Zalo.'
      }
    ]
  },
  {
    code: 'P11',
    archetype: 'Copywriter SEO cựu trào: Văn phong xuất sắc, cam kết KPI, giá cao, khó chịu khi sửa đổi',
    name: 'Phan Anh Dũng',
    category: 'Writing',
    specialty: 'Viết Bài Chuẩn SEO & Content Bán Hàng Storytelling',
    location: 'Hoàn Kiếm, Hà Nội',
    hourlyRate: 350000,
    availabilityStatus: 'ready',
    verified: true,
    badge: 'CHUYÊN GIA',
    bio: '8 năm làm Content Lead cho các sàn TMDT. Bài viết chuẩn SEO lên Top 1 Google tự nhiên, giữ chân độc giả bằng câu chữ đắt giá.',
    skills: ['SEO Content', 'Storytelling', 'Copywriting Chuyển Đổi', 'Nghiên Cứu Từ Khóa'],
    certifications: ['HubSpot Inbound Marketing Certificate'],
    aspectProfile: { quality: 4.8, price: 2.2, speed: 4.5, attitude: 2.3, warranty: 4.2 },
    cancelProbability: 0.06,
    targetReviews: 24,
    services: [
      {
        title: 'Bộ 5 bài viết chuẩn SEO chuyên sâu 2.000 từ cam kết lên Top Google',
        price: 2500000,
        priceUnit: 'Gói',
        duration: '4-5 ngày',
        desc: 'Tối ưu mật độ từ khóa, hình ảnh chuẩn SEO, văn phong cuốn hút, tặng kèm dàn ý Content Pillar.'
      }
    ]
  },
  {
    code: 'P12',
    archetype: 'Writer sinh viên cày cuốc: Giá siêu rẻ, nộp bài thần tốc, bài viết sơ sài',
    name: 'Trần Gia Hân',
    category: 'Writing',
    specialty: 'Viết Bài Blog, Review Sản Phẩm & Tin Tức Hàng Ngày',
    location: 'Thanh Khê, Đà Nẵng',
    hourlyRate: 80000,
    availabilityStatus: 'ready',
    verified: false,
    badge: '',
    bio: 'Nhận viết bài số lượng lớn cho website vệ tinh, blog giải trí, fanpage với chi phí hạt dẻ nhất.',
    skills: ['Viết Bài Nhanh', 'Spin Content', 'Tin Tức Tổng Hợp', 'Đăng Bài WordPress'],
    certifications: [],
    aspectProfile: { quality: 2.6, price: 4.9, speed: 4.8, attitude: 4.4, warranty: 2.2 },
    cancelProbability: 0.14,
    targetReviews: 20,
    services: [
      {
        title: 'Combo 10 bài viết blog vệ tinh 800 từ nộp bài trong 24 giờ',
        price: 400000,
        priceUnit: 'Gói',
        duration: '1 ngày',
        desc: 'Cung cấp bài viết nhanh cho hệ thống PBN hoặc fanpage cần giữ nhịp tương tác hàng ngày.'
      }
    ]
  },
  {
    code: 'P13',
    archetype: 'Chuyên gia Performance Marketing: Chạy ads ra đơn ngay, giá dịch vụ cao, hỗ trợ 24/7',
    name: 'Tạ Minh Tuấn',
    category: 'Marketing',
    specialty: 'Tối Ưu Quảng Cáo Facebook, TikTok & Google Performance Max',
    location: 'Quận 3, TP. Hồ Chí Minh',
    hourlyRate: 550000,
    availabilityStatus: 'ready',
    verified: true,
    badge: 'PRO PROVIDER',
    bio: 'Từng quản lý ngân sách ads 5 tỷ/tháng ngành thời trang, mỹ phẩm. Tối ưu ROAS từ 3.5x trở lên, tracking chuẩn pixel.',
    skills: ['Facebook Ads', 'TikTok Ads', 'Google PMax', 'Tracking CAPI', 'Tối Ưu Funnel'],
    certifications: ['Meta Certified Media Buying Professional', 'Google Ads Search & Display'],
    aspectProfile: { quality: 4.8, price: 2.2, speed: 4.7, attitude: 4.6, warranty: 4.8 },
    cancelProbability: 0.03,
    targetReviews: 25,
    services: [
      {
        title: 'Setup & Tối ưu chiến dịch quảng cáo TikTok / Facebook Ads ra đơn ngay',
        price: 4500000,
        priceUnit: 'Dự án',
        duration: '7 ngày',
        desc: 'Nghiên cứu tệp khách hàng, sản xuất kịch bản video viral, tối ưu chi phí CPA và cam kết hoàn tiền nếu không đạt KPI.'
      }
    ]
  },
  {
    code: 'P14',
    archetype: 'Seeding & Social giá rẻ: Giá bèo bọt, nhiệt tình, nhưng hay bị trễ deadline và rớt số',
    name: 'Lê Văn Khang',
    category: 'Marketing',
    specialty: 'Seeding Diễn Đàn, Đẩy Tương Tác & Tăng Follow Mạng Xã Hội',
    location: 'Hà Đông, Hà Nội',
    hourlyRate: 100000,
    availabilityStatus: 'ready',
    verified: false,
    badge: '',
    bio: 'Cung cấp dịch vụ đi link, comment mồi trên các group Facebook, TikTok, seeding đánh giá tạo uy tín ban đầu.',
    skills: ['Seeding Group', 'Quản Lý Nick Phụ', 'Comment Mồi', 'Chia Sẻ Livestream'],
    certifications: [],
    aspectProfile: { quality: 3.1, price: 4.8, speed: 2.3, attitude: 4.7, warranty: 2.4 },
    cancelProbability: 0.16,
    targetReviews: 21,
    services: [
      {
        title: 'Gói seeding 200 bình luận mồi thảo luận tự nhiên trong 15 hội nhóm',
        price: 350000,
        priceUnit: 'Gói',
        duration: '3-4 ngày',
        desc: 'Bình luận bằng nick người dùng thật, văn phong tự nhiên không lộ liễu, hỗ trợ chụp ảnh báo cáo.'
      }
    ]
  },
  {
    code: 'P15',
    archetype: 'Developer cấp tốc: Sửa lỗi web trong 1 giờ, bảo hành 6 tháng, chi phí đắt',
    name: 'Bạch Đình Trọng',
    category: 'IT',
    specialty: 'Cấp Cứu Sự Cố Web, Fix Lỗi Bảo Mật & Sửa Bug Node.js / PHP',
    location: 'Cẩm Lệ, Đà Nẵng',
    hourlyRate: 650000,
    availabilityStatus: 'ready',
    verified: true,
    badge: 'CỨU HỘ SOURCE CODE',
    bio: 'Chuyên khắc phục web bị hack, dính mã độc redirect, lỗi thanh toán VNPay/Momo, sập database MySQL khẩn cấp.',
    skills: ['Gỡ Mã Độc', 'Fix Bug Express/Node.js', 'Phục Hồi Database', 'Nginx Config', 'SSL/Cloudflare'],
    certifications: ['Certified Ethical Hacker (CEH)'],
    aspectProfile: { quality: 4.9, price: 2.4, speed: 4.9, attitude: 4.0, warranty: 4.9 },
    cancelProbability: 0.02,
    targetReviews: 25,
    services: [
      {
        title: 'Cứu hộ khẩn cấp website bị sập, gỡ mã độc và vá lỗ hổng trong 2 giờ',
        price: 2500000,
        priceUnit: 'Lần đến',
        duration: '2 giờ',
        desc: 'Khôi phục dữ liệu nguyên vẹn, dọn dẹp sạch mã độc, cài đặt tường lửa Cloudflare và bảo hành 6 tháng không bị lại.'
      }
    ]
  },
  {
    code: 'P16',
    archetype: 'Thợ sửa ống nước uy tín: Giá bình dân, thái độ niềm nở, bảo hành rò rỉ 1 năm',
    name: 'Đỗ Hữu Thắng',
    category: 'Repair',
    specialty: 'Thi Công & Sửa Chữa Đường Ống Nước Dân Dụng',
    location: 'Thanh Xuân, Hà Nội',
    hourlyRate: 180000,
    availabilityStatus: 'ready',
    verified: true,
    badge: 'THỢ LÀNH NGHỀ',
    bio: '12 năm làm nghề nước tại Hà Nội. Báo đúng bệnh, lấy đúng giá, bảo hành cam kết giấy tờ rõ ràng.',
    skills: ['Dò Tìm Rò Rỉ Nước Ngầm', 'Lắp Bơm Tăng Áp', 'Thay Vòi Nước Cao Cấp', 'Thông Tắc Lavabo'],
    certifications: ['Chứng chỉ Thợ Nước Bậc 4'],
    aspectProfile: { quality: 4.6, price: 4.6, speed: 4.3, attitude: 4.8, warranty: 4.9 },
    cancelProbability: 0.03,
    targetReviews: 25,
    services: [
      {
        title: 'Sửa đường ống nước bục vỡ ngầm & Lắp đặt máy bơm nước tăng áp',
        price: 280000,
        priceUnit: 'Lần đến',
        duration: '1-2 giờ',
        desc: 'Dò sóng âm không đục phá tường bừa bãi, bảo hành mối hàn nhiệt 12 tháng tại nhà.'
      }
    ]
  },
  {
    code: 'P17',
    archetype: 'Dịch vụ giặt ủi sofa: Rất sạch sẽ thơm tho, giá phải chăng, hay giao trễ nửa ngày',
    name: 'Võ Thị Bích',
    category: 'Home',
    specialty: 'Giặt Sấy Rèm Cửa, Đệm Kymdan & Giặt Hấp Sofa Da / Nỉ',
    location: 'Quận 2, TP. Hồ Chí Minh',
    hourlyRate: 150000,
    availabilityStatus: 'ready',
    verified: true,
    badge: 'ĐƯỢC YÊU THÍCH',
    bio: 'Sử dụng dung dịch giặt sinh học organic diệt 99% ve rận nấm mốc trên đệm và sofa, lưu hương tinh dầu tự nhiên.',
    skills: ['Giặt Đệm Kymdan', 'Vệ Sinh Sofa Nỉ', 'Giặt Hấp Rèm Cửa', 'Khử Mùi Thú Cưng'],
    certifications: ['Chứng chỉ Vệ sinh Công nghiệp'],
    aspectProfile: { quality: 4.7, price: 4.3, speed: 2.5, attitude: 4.5, warranty: 4.1 },
    cancelProbability: 0.07,
    targetReviews: 23,
    services: [
      {
        title: 'Dịch vụ giặt sấy khử khuẩn Sofa nỉ chữ L & Đệm lò xo tại nhà',
        price: 450000,
        priceUnit: 'Gói',
        duration: '2-3 giờ',
        desc: 'Phun hút sâu công nghệ Italy, thổi khô tại chỗ trong 60 phút, khử sạch mùi ẩm mốc.'
      }
    ]
  },
  {
    code: 'P18',
    archetype: 'Thiết kế Banner / Thumbnail: Rẻ và nhanh, chỉnh sửa thoải mái, chất lượng bình dân',
    name: 'Dương Văn Long',
    category: 'Design',
    specialty: 'Thiết Kế Thumbnail Youtube, Ảnh Bìa Shopee & Banner Lazada',
    location: 'Liên Chiểu, Đà Nẵng',
    hourlyRate: 120000,
    availabilityStatus: 'ready',
    verified: true,
    badge: 'GIÁ RẺ NHẤT',
    bio: 'Chuyên làm ảnh sản phẩm chuẩn kích thước sàn TMDT, thiết kế Thumbnail Youtube giật gân kích thích tỷ lệ click.',
    skills: ['Thumbnail Youtube', 'Ảnh Bìa Shopee', 'Khung Sản Phẩm', 'Photoshop'],
    certifications: [],
    aspectProfile: { quality: 3.5, price: 4.9, speed: 4.7, attitude: 4.8, warranty: 3.9 },
    cancelProbability: 0.05,
    targetReviews: 22,
    services: [
      {
        title: 'Bộ 5 Thumbnail Youtube chuẩn Click-Through-Rate cao ngất ngưởng',
        price: 250000,
        priceUnit: 'Gói',
        duration: '1 ngày',
        desc: 'Hình ảnh sắc nét, chữ to nổi bật, nghiên cứu phong cách theo từng chủ đề kênh.'
      }
    ]
  },
  {
    code: 'P19',
    archetype: 'Gia sư lập trình 1 kèm 1: Rất giỏi code, nhưng dạy hơi khó hiểu và hay đổi lịch',
    name: 'Cao Hoàng Nam',
    category: 'Tutor',
    specialty: 'Dạy Kèm Cấu Trúc Dữ Liệu, Giải Thuật & Luyện Phỏng Vấn LeetCode',
    location: 'Hoàng Mai, Hà Nội',
    hourlyRate: 400000,
    availabilityStatus: 'busy',
    verified: true,
    badge: 'LEETCODE PRO',
    bio: 'Software Engineer tại Tech Unicorn. Đã giải 1.500 bài LeetCode, dạy kèm trực tiếp cho ứng viên thi Big Tech.',
    skills: ['Cấu Trúc Dữ Liệu', 'Giải Thuật', 'C++', 'Java', 'Hệ Thống Phân Tán'],
    certifications: ['Top 500 LeetCode Contest Global'],
    aspectProfile: { quality: 4.7, price: 3.4, speed: 2.7, attitude: 3.2, warranty: 3.6 },
    cancelProbability: 0.10,
    targetReviews: 21,
    services: [
      {
        title: 'Khóa 5 buổi luyện phỏng vấn thuật toán LeetCode Medium/Hard',
        price: 2000000,
        priceUnit: 'Gói',
        duration: '5 buổi',
        desc: 'Phương pháp nhận diện dạng bài toán quy hoạch động, đồ thị, cây nhị phân chuẩn phong cách Google/Amazon.'
      }
    ]
  },
  {
    code: 'P20',
    archetype: 'Dịch thuật & Biên tập tiếng Anh: Dịch cực chuẩn, giá cao, đúng hẹn từng phút',
    name: 'Phạm Thu Trang',
    category: 'Writing',
    specialty: 'Biên Dịch Hợp Đồng Thương Mại & Tài Liệu Y Dược Chuyên Sâu',
    location: 'Quận 1, TP. Hồ Chí Minh',
    hourlyRate: 450000,
    availabilityStatus: 'ready',
    verified: true,
    badge: 'TOP TRANSLATOR',
    bio: 'Thạc sĩ Ngôn ngữ ứng dụng ĐH Queensland. 10 năm kinh nghiệm dịch thuật hồ sơ thầu B2B và văn bản pháp lý quốc tế.',
    skills: ['Dịch Thuật Pháp Lý', 'Tiếng Anh Y Khoa', 'Bản Địa Hóa Phần Mềm', 'Biên Tập Sách'],
    certifications: ['Chứng chỉ Biên Dịch Viên Quốc Gia NAATI Úc'],
    aspectProfile: { quality: 4.9, price: 2.2, speed: 4.8, attitude: 4.2, warranty: 4.5 },
    cancelProbability: 0.02,
    targetReviews: 24,
    services: [
      {
        title: 'Dịch thuật chuẩn xác Hợp đồng kinh tế & Hồ sơ thầu quốc tế Anh - Việt',
        price: 3200000,
        priceUnit: 'Dự án',
        duration: '2-3 ngày',
        desc: 'Đảm bảo chuẩn xác từng thuật ngữ luật kinh tế, cam kết bảo mật tuyệt đối NDA thông tin khách hàng.'
      }
    ]
  },
  // 4 Provider thử thách Cold-Start (< 5 review)
  {
    code: 'P21',
    archetype: 'Thợ điện trẻ mới lên sàn (Cold-Start: 2 reviews)',
    name: 'Nguyễn Văn Tiến',
    category: 'Repair',
    specialty: 'Lắp Đặt Quạt Trần, Đèn Trang Trí & Thiết Bị Điện Gia Đình',
    location: 'Tân Bình, TP. Hồ Chí Minh',
    hourlyRate: 150000,
    availabilityStatus: 'ready',
    verified: false,
    badge: 'MỚI THAM GIA',
    bio: 'Thợ điện trẻ mới lập nghiệp tại TP.HCM. Tận tâm, cẩn thận, nhận lắp quạt trần, đèn chùm giá tốt.',
    skills: ['Lắp Quạt Trần', 'Bắt Đèn LED', 'Đi Dây Nổi Đẹp'],
    certifications: [],
    aspectProfile: { quality: 4.1, price: 4.6, speed: 4.0, attitude: 4.7, warranty: 4.0 },
    cancelProbability: 0.05,
    targetReviews: 2,
    services: [
      {
        title: 'Lắp đặt quạt trần Panasonic, đèn chùm trang trí phòng khách',
        price: 200000,
        priceUnit: 'Lần đến',
        duration: '1 giờ',
        desc: 'Khoan bắt nở đạn chịu lực an toàn tuyệt đối, cân cánh quạt không rung lắc.'
      }
    ]
  },
  {
    code: 'P22',
    archetype: 'UI Designer mới tốt nghiệp (Cold-Start: 1 review)',
    name: 'Lê Thùy Chi',
    category: 'Design',
    specialty: 'Thiết Kế Landing Page Mỹ Phẩm & Thời Trang Bắt Mắt',
    location: 'Hà Đông, Hà Nội',
    hourlyRate: 200000,
    availabilityStatus: 'ready',
    verified: false,
    badge: 'MỚI THAM GIA',
    bio: 'Tốt nghiệp thủ khoa Thiết kế Đồ họa ĐH Mỹ Thuật Công Nghiệp. Gu thẩm mỹ trẻ trung, bắt trend Gen Z.',
    skills: ['Landing Page', 'Figma', 'Màu Sắc Trend', 'Typography'],
    certifications: [],
    aspectProfile: { quality: 4.3, price: 4.6, speed: 3.9, attitude: 4.8, warranty: 4.3 },
    cancelProbability: 0.05,
    targetReviews: 1,
    services: [
      {
        title: 'Thiết kế Landing Page thời trang phong cách tối giản thanh lịch',
        price: 1200000,
        priceUnit: 'Dự án',
        duration: '3 ngày',
        desc: 'Bản thiết kế chuẩn UX tăng tỷ lệ chốt đơn, tương thích 100% màn hình di động.'
      }
    ]
  },
  {
    code: 'P23',
    archetype: 'Sinh viên gia sư toán cấp 3 (Cold-Start: 0 review)',
    name: 'Trần Đình Trí',
    category: 'Tutor',
    specialty: 'Gia Sư Toán Luyện Thi Đại Học Điểm 8+',
    location: 'Cầu Giấy, Hà Nội',
    hourlyRate: 180000,
    availabilityStatus: 'ready',
    verified: true,
    badge: 'MỚI THAM GIA',
    bio: 'Cựu học sinh chuyên Toán Sư Phạm, đạt 9.6 điểm Toán kỳ thi THPT Quốc Gia. Kèm phương pháp giải nhanh trắc nghiệm.',
    skills: ['Toán 12', 'Hình Học Không Gian', 'Giải Nhanh Casio', 'Hàm Số'],
    certifications: ['Giải Nhì HSG Toán Tỉnh'],
    aspectProfile: { quality: 4.5, price: 4.8, speed: 4.2, attitude: 4.9, warranty: 4.0 },
    cancelProbability: 0.04,
    targetReviews: 0,
    services: [
      {
        title: 'Kèm 1-1 Chuyên đề Hình học không gian & Tích phân điểm 8+',
        price: 250000,
        priceUnit: 'Buổi 90 phút',
        duration: '90 phút',
        desc: 'Dạy bản chất định lý, mẹo bấm máy tính Casio loại trừ đáp án nhanh chóng.'
      }
    ]
  },
  {
    code: 'P24',
    archetype: 'Dịch vụ dọn dẹp nhà mới nhận (Cold-Start: 2 reviews)',
    name: 'Nguyễn Thị Hoa',
    category: 'Home',
    specialty: 'Dọn Dẹp Nhà Trống Trước Khi Chuyển Đến Ở',
    location: 'Quận 9, TP. Hồ Chí Minh',
    hourlyRate: 90000,
    availabilityStatus: 'unavailable',
    verified: false,
    badge: 'MỚI THAM GIA',
    bio: 'Chuyên dọn dẹp nhà trống, cạo sơn rơi vãi sàn nhà, lau kính cửa sổ sạch sẽ thơm tho.',
    skills: ['Cạo Vết Sơn', 'Lau Kính Cao Ốc', 'Dọn Nhà Trống'],
    certifications: [],
    aspectProfile: { quality: 3.8, price: 4.8, speed: 4.0, attitude: 4.6, warranty: 3.5 },
    cancelProbability: 0.08,
    targetReviews: 2,
    services: [
      {
        title: 'Tổng vệ sinh nhà mới nhận bàn giao trước khi chuyển đồ vào ở',
        price: 500000,
        priceUnit: 'Gói',
        duration: '3-4 giờ',
        desc: 'Hút sạch bụi mịn công trình, cạo sạch keo và sơn bám sàn gạch men.'
      }
    ]
  }
];

const CUSTOMER_PERSONAS = [
  {
    code: 'C01',
    name: 'Trần Văn Tiết Kiệm',
    email: 'test.tietkiem.student@mock.skillrental.vn',
    phone: '0909 001 001',
    avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150',
    role: 'Customer',
    personaDesc: 'Sinh viên kinh phí eo hẹp, ưu tiên giá rẻ hàng đầu, chấp nhận chờ đợi hoặc chất lượng trung bình.',
    aspectWeights: { quality: 0.15, price: 0.50, speed: 0.10, attitude: 0.15, warranty: 0.10 }
  },
  {
    code: 'C02',
    name: 'Nguyễn Thị Hỏa Tốc',
    email: 'test.hoatoc.corp@mock.skillrental.vn',
    phone: '0909 002 002',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150',
    role: 'Customer',
    personaDesc: 'Quản lý dự án cần xử lý việc gấp trong ngày, ngân sách dồi dào, cần tốc độ cực nhanh và làm việc đúng hạn.',
    aspectWeights: { quality: 0.25, price: 0.05, speed: 0.50, attitude: 0.10, warranty: 0.10 }
  },
  {
    code: 'C03',
    name: 'Lê Hữu An Tâm',
    email: 'test.antam.warranty@mock.skillrental.vn',
    phone: '0909 003 003',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
    role: 'Customer',
    personaDesc: 'Chủ nhà sửa chữa thiết bị đắt tiền, cực kỳ chú trọng chế độ bảo hành dài hạn và hỗ trợ sau bàn giao.',
    aspectWeights: { quality: 0.25, price: 0.10, speed: 0.10, attitude: 0.15, warranty: 0.40 }
  },
  {
    code: 'C04',
    name: 'Phạm Thanh Thảo',
    email: 'test.thao.attitude@mock.skillrental.vn',
    phone: '0909 004 004',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
    role: 'Customer',
    personaDesc: 'Khách hàng chú trọng trải nghiệm dịch vụ, thích thợ lịch sự, nhẹ nhàng, nhiệt tình tư vấn có tâm.',
    aspectWeights: { quality: 0.20, price: 0.10, speed: 0.15, attitude: 0.45, warranty: 0.10 }
  },
  {
    code: 'C05',
    name: 'Đặng Quốc Hoàn Hảo',
    email: 'test.hoanhao.quality@mock.skillrental.vn',
    phone: '0909 005 005',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
    role: 'Customer',
    personaDesc: 'Khách hàng yêu cầu tay nghề đỉnh cao, không chấp nhận lỗi vặt, sẵn sàng chi trả mức giá cao nhất.',
    aspectWeights: { quality: 0.55, price: 0.05, speed: 0.15, attitude: 0.10, warranty: 0.15 }
  },
  {
    code: 'C06',
    name: 'Vũ Đức Cân Bằng',
    email: 'test.canbang.balanced@mock.skillrental.vn',
    phone: '0909 006 006',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150',
    role: 'Customer',
    personaDesc: 'Người tiêu dùng thông thái, muốn một dịch vụ đồng đều ở cả 5 mặt: tay nghề, giá cả, thời gian, thái độ, bảo hành.',
    aspectWeights: { quality: 0.20, price: 0.20, speed: 0.20, attitude: 0.20, warranty: 0.20 }
  },
  {
    code: 'C07',
    name: 'Bùi Thợ Săn Deal',
    email: 'test.sandeal.fastcheap@mock.skillrental.vn',
    phone: '0909 007 007',
    avatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150',
    role: 'Customer',
    personaDesc: 'Kinh doanh online cần nội dung nhanh và rẻ, không cần quá cầu kỳ, không cần bảo hành lâu.',
    aspectWeights: { quality: 0.10, price: 0.45, speed: 0.35, attitude: 0.05, warranty: 0.05 }
  },
  {
    code: 'C08',
    name: 'Ngô VIP Doanh Nghiệp',
    email: 'test.vip.enterprise@mock.skillrental.vn',
    phone: '0909 008 008',
    avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150',
    role: 'Customer',
    personaDesc: 'Đại diện công ty thuê outsource IT/Design, quan tâm đặc biệt tới chất lượng chuẩn Enterprise và cam kết bảo hành SLA.',
    aspectWeights: { quality: 0.35, price: 0.05, speed: 0.25, attitude: 0.10, warranty: 0.25 }
  }
];

module.exports = { PROVIDER_PERSONAS, CUSTOMER_PERSONAS };
