const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'database.json');

// Default initial state sync with common.js and extended for Customer portal
const INITIAL_DATABASE = {
  users: [
    { id: 'USR001', name: 'Nguyễn Văn An', email: 'an.nguyen@example.com', phone: '0901 234 567', role: 'Provider', password: '123', joinDate: '12/01/2024', spentOrEarned: '112.500.000đ', balance: 25000000, status: 'active', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150' },
    { id: 'USR002', name: 'Trần Thị Lan', email: 'lan.tran@example.com', phone: '0912 345 678', role: 'Provider', password: '123', joinDate: '03/02/2024', spentOrEarned: '89.200.000đ', balance: 18500000, status: 'active', avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150' },
    { id: 'USR003', name: 'Lê Hoàng Long', email: 'long.le@example.com', phone: '0988 776 655', role: 'Customer', password: '123', joinDate: '15/03/2024', spentOrEarned: '24.600.000đ', balance: 0, status: 'active', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150' },
    { id: 'USR004', name: 'Hoàng Văn Nam', email: 'nam.hoang@example.com', phone: '0933 221 100', role: 'Customer', password: '123', joinDate: '20/05/2024', spentOrEarned: '5.200.000đ', balance: 0, status: 'locked', lockReason: 'Hủy đơn hàng liên tục 5 lần', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150' },
    { id: 'USR005', name: 'Phạm Hữu Cường', email: 'cuong.pham@example.com', phone: '0977 445 566', role: 'Provider', password: '123', joinDate: '18/06/2024', spentOrEarned: '74.000.000đ', balance: 12000000, status: 'active', avatar: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=150' },
    { id: 'USR006', name: 'Vũ Thị Minh', email: 'minh.vu@example.com', phone: '0944 889 900', role: 'Customer', password: '123', joinDate: '02/08/2024', spentOrEarned: '18.400.000đ', balance: 0, status: 'active', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150' },
    { id: 'USR007', name: 'Đặng Quốc Huy', email: 'huy.dang@example.com', phone: '0911 334 455', role: 'Provider', password: '123', joinDate: '11/09/2024', spentOrEarned: '12.000.000đ', balance: 2000000, status: 'locked', lockReason: 'Gian lận đánh giá', avatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150' },

    { id: 'USR008', name: 'Trần Đình Trọng', email: 'trong.tran@example.com', phone: '0937 889 911', role: 'Provider', password: '123', joinDate: '10/01/2025', spentOrEarned: '0đ', balance: 500000, status: 'active', avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150' },
    { id: 'USR009', name: 'Lê Thị Duyên', email: 'duyen.le@example.com', phone: '0981 223 344', role: 'Provider', password: '123', joinDate: '15/01/2025', spentOrEarned: '0đ', balance: 1000000, status: 'active', avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150' },
    { id: 'ADM001', name: 'Quản Trị Viên Sàn', email: 'skillrentaladmin@gmail.com', phone: '0999 888 777', role: 'Admin', password: 'admin123@', joinDate: '01/01/2024', spentOrEarned: '0đ', balance: 0, status: 'active', avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150' },
    { id: 'ADM002', name: 'Admin Dự Phòng', email: 'admin@skillrental.com', phone: '0999 888 666', role: 'Admin', password: 'admin', joinDate: '01/01/2024', spentOrEarned: '0đ', balance: 0, status: 'active', avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150' }
  ],

  providers: [
    {
      id: 'PRV001',
      userId: 'USR001',
      name: 'Nguyễn Văn An',
      specialty: 'Senior Fullstack Web Developer & Cloud Architecture',
      category: 'IT',
      rating: 4.9,
      reviewCount: 38,
      hourlyRate: 500000,
      completedOrders: 42,
      location: 'Quận 1, TP. Hồ Chí Minh',
      verified: true,
      badge: 'PRO PROVIDER',
      bio: 'Hơn 6 năm kinh nghiệm lập trình thực chiến React, Node.js, Next.js và thiết kế kiến trúc hệ thống chuẩn Microservices, Docker, AWS.',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200',
      cover: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=800',
      skills: ['React.js', 'Node.js', 'PostgreSQL', 'Docker', 'AWS Solutions', 'REST API', 'Figma to Code'],
      certifications: ['AWS Certified Solutions Architect', 'Meta Front-End Professional Certificate'],
      packages: [
        { name: 'Cơ bản - Fix bug & Tối ưu', price: 800000, deliveryDays: 1, desc: 'Sửa lỗi giao diện CSS/JS, tối ưu tốc độ tải trang Core Web Vitals.' },
        { name: 'Tiêu chuẩn - Thiết kế Web Landing Page', price: 4500000, deliveryDays: 4, desc: 'Website chuẩn SEO, responsive 100% mobile/desktop kèm CMS quản trị.' },
        { name: 'Nâng cao - Web App & Tích hợp Ký quỹ', price: 12000000, deliveryDays: 10, desc: 'Xây dựng toàn diện Web App, cổng thanh toán VNPay/MoMo, cơ chế Escrow.' }
      ],
      availabilityStatus: 'ready',
      bankAccount: { bank: 'MB Bank', account: '0987.654.321', holder: 'NGUYEN VAN PRO' },
      monthlyEarnings: 35500000,
      activeProjectsCount: 12,
      schedule: {
        mode: 'ready',
        slots: [
          { day: 'T2', morning: true, afternoon: true, evening: false },
          { day: 'T3', morning: true, afternoon: true, evening: false },
          { day: 'T4', morning: true, afternoon: true, evening: true },
          { day: 'T5', morning: true, afternoon: true, evening: false },
          { day: 'T6', morning: true, afternoon: true, evening: false },
          { day: 'T7', morning: true, afternoon: false, evening: false },
          { day: 'CN', morning: false, afternoon: false, evening: false }
        ]
      }
    },
    {
      id: 'PRV002',
      userId: 'USR002',
      name: 'Trần Thị Lan',
      specialty: 'Senior UI/UX Designer & Brand Identity',
      category: 'Design',
      rating: 4.9,
      reviewCount: 52,
      hourlyRate: 400000,
      completedOrders: 64,
      location: 'Cầu Giấy, Hà Nội',
      verified: true,
      badge: 'TOP RATED',
      bio: 'Thiết kế trải nghiệm người dùng cao cấp, hệ thống Design System hoàn chỉnh trên Figma, phong cách hiện đại chuẩn Silicon Valley.',
      avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200',
      cover: 'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=800',
      skills: ['Figma Master', 'UI/UX Mobile App', 'Design System', 'Logo & Branding', 'Wireframing', 'Prototyping'],
      certifications: ['Google UX Design Professional', 'Interaction Design Foundation (IxDF)'],
      packages: [
        { name: 'Gói Logo & Brand Guideline', price: 2800000, deliveryDays: 3, desc: 'Bộ nhận diện thương hiệu hoàn chỉnh gồm logo vector, màu sắc, font chữ.' },
        { name: 'Gói UI/UX App Mobile (5-10 màn)', price: 6500000, deliveryDays: 7, desc: 'Bàn giao file Figma prototype trực quan, components chuẩn Auto-layout.' }
      ]
    },
    {
      id: 'PRV003',
      userId: 'USR005',
      name: 'Phạm Hữu Cường',
      specialty: 'Thạc Sĩ Ngôn Ngữ & Chuyên Gia Luyện Thi IELTS 8.0+',
      category: 'Tutor',
      rating: 4.8,
      reviewCount: 29,
      hourlyRate: 350000,
      completedOrders: 35,
      location: 'Hải Châu, Đà Nẵng (Hỗ trợ Online)',
      verified: true,
      badge: 'VERIFIED EXPERT',
      bio: 'Tốt nghiệp Thạc sĩ TESOL tại ĐH Monash (Úc). Kinh nghiệm 5 năm luyện thi cấp tốc IELTS Speaking & Writing từ mất gốc lên 7.0+.',
      avatar: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=200',
      cover: 'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?w=800',
      skills: ['IELTS 8.5', 'Speaking 8.5', 'Writing 8.0', 'Tiếng Anh Giao Tiếp', 'Phát Âm Chuẩn IPA', 'Sửa Bài Chi Tiết'],
      certifications: ['IELTS Overall 8.5 (IDP)', 'TESOL International 150h Certificate'],
      packages: [
        { name: 'Kèm 1-1 Sửa bài Writing & Mock Speaking', price: 350000, deliveryDays: 1, desc: '1 buổi trực tiếp 90 phút qua Zoom kèm file nhận xét và audio feedback.' },
        { name: 'Combo 10 buổi Luyện Thi Cấp Tốc', price: 3200000, deliveryDays: 30, desc: 'Giáo trình cá nhân hóa, cam kết tăng tối thiểu 0.5 - 1.0 band sau khóa.' }
      ]
    },
    {
      id: 'PRV004',

      userId: 'USR008',
      userId: 'USR003b',

      name: 'Trần Đình Trọng',
      specialty: 'Kỹ Sư Điện Lạnh & Bảo Trì Thiết Bị Gia Dụng Thông Minh',
      category: 'Repair',
      rating: 4.7,
      reviewCount: 45,
      hourlyRate: 200000,
      completedOrders: 58,
      location: 'Bình Thạnh, TP. Hồ Chí Minh',
      verified: true,
      badge: 'THỢ LÀNH NGHỀ',
      bio: 'Chuyên khắc phục sự cố điện nước, sửa chữa máy giặt, máy lạnh Inverter, camera an ninh và điện thông minh tận nơi trong 30 phút.',
      avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200',
      cover: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=800',
      skills: ['Sửa Điện Nước', 'Bảo Trì Máy Lạnh', 'Điện Tử Gia Dụng', 'Thi Công Camera', 'Tận Tâm - Chu Đáo'],
      certifications: ['Chứng chỉ Thợ Điện Dân Dụng Bậc 4', 'Đào Tạo Đại Lý Daikin & Panasonic'],
      packages: [
        { name: 'Vệ sinh & Nạp gas máy lạnh 1HP - 2HP', price: 250000, deliveryDays: 1, desc: 'Vệ sinh lưới lọc, xịt rửa dàn lạnh/nóng bằng nano bạc, kiểm tra gas.' },
        { name: 'Xử lý chập điện & Rò rỉ nước khẩn cấp', price: 350000, deliveryDays: 1, desc: 'Có mặt sau 30 phút tại TP.HCM, trang thiết bị dò tìm chuyên dụng.' }
      ]
    },
    {
      id: 'PRV005',
      userId: 'USR009',
      userId: 'USR003c',
      name: 'Lê Thị Duyên',
      specialty: 'Chuyên Gia Dọn Dẹp, Quản Gia & Chăm Sóc Không Gian Sống',
      category: 'Home',
      rating: 4.8,
      reviewCount: 31,
      hourlyRate: 90000,
      completedOrders: 40,
      location: 'Đống Đa, Hà Nội',
      verified: true,
      badge: 'TOP ĐÁNH GIÁ',
      bio: '5 năm làm dịch vụ dọn dẹp căn hộ chung cư cao cấp, văn phòng. Lý lịch rõ ràng, cẩn thận, trung thực, sử dụng hóa chất sinh học organic an toàn.',
      avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=200',
      cover: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=800',
      skills: ['Tổng Vệ Sinh Căn Hộ', 'Dọn Dẹp Theo Giờ', 'Giặt Ủi Hấp Quần Áo', 'Sắp Xếp Nhà Cửa Chuẩn Marie Kondo'],
      certifications: ['Chứng nhận Sức khỏe Định kỳ', 'Chứng chỉ Nghiệp vụ Khách sạn 4 sao'],
      packages: [
        { name: 'Gói dọn dẹp tiêu chuẩn 3 giờ', price: 270000, deliveryDays: 1, desc: 'Lau dọn phòng khách, bếp, toilet, hút bụi thảm sàn và đổ rác sạch sẽ.' },
        { name: 'Tổng vệ sinh chuyên sâu sau sửa chữa', price: 850000, deliveryDays: 1, desc: 'Dọn dẹp công nghiệp toàn bộ căn hộ 2-3 phòng ngủ kèm dung dịch diệt khuẩn.' }
      ]
    },
    {
      id: 'PRV006',
      userId: 'USR006',
      name: 'Vũ Thị Minh',
      specialty: 'Content Creator & Copywriter',
      category: 'Writing',
      rating: 4.5,
      reviewCount: 15,
      hourlyRate: 150000,
      completedOrders: 20,
      location: 'Hà Nội',
      verified: true,
      badge: 'NEW SELLER',
      bio: 'Viết lách sáng tạo, chuẩn SEO.',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200',
      cover: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=800',
      skills: ['Copywriting', 'SEO Content', 'Creative Writing'],
      certifications: [],
      packages: []
    },
    {
      id: 'PRV007',
      userId: 'USR007',
      name: 'Đặng Quốc Huy',
      specialty: 'Digital Marketer',
      category: 'Marketing',
      rating: 3.5,
      reviewCount: 5,
      hourlyRate: 200000,
      completedOrders: 10,
      location: 'Đà Nẵng',
      verified: false,
      badge: '',
      bio: 'Chạy ads FB/Google',
      avatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=200',
      cover: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=800',
      skills: ['Facebook Ads', 'Google Ads'],
      certifications: [],
      packages: []

    }
  ],

  services: [
    {
      id: 'SVC001',
      title: 'Thiết kế website chuẩn SEO & Tối ưu tốc độ tải trang',
      category: 'IT',
      providerId: 'PRV001',
      providerName: 'Nguyễn Văn An',
      providerAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100',
      price: 4500000,
      priceUnit: 'Dự án',
      duration: '4-7 ngày',
      rating: 4.9,
      reviewCount: 38,
      status: 'active',
      desc: 'Thiết kế giao diện website hiện đại bằng React / Next.js chuẩn SEO Google, tối ưu điểm PageSpeed 95+, hỗ trợ thanh toán trực tuyến.',
      thumbnail: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600'
    },
    {
      id: 'SVC002',
      title: 'Thiết kế Logo & Bộ nhận diện thương hiệu chuẩn Agency',
      category: 'Design',
      providerId: 'PRV002',
      providerName: 'Trần Thị Lan',
      providerAvatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100',
      price: 2800000,
      priceUnit: 'Gói',
      duration: '3 ngày',
      rating: 4.9,
      reviewCount: 52,
      status: 'active',
      desc: 'Sáng tạo logo độc quyền kèm cẩm nang sử dụng thương hiệu (Brand Guidelines), bàn giao toàn bộ file vector gốc AI, Figma, SVG.',
      thumbnail: 'https://images.unsplash.com/photo-1572044162444-ad60f128bdea?w=600'
    },
    {
      id: 'SVC003',
      title: 'Luyện thi IELTS 1 kèm 1 cấp tốc Speaking & Writing',
      category: 'Tutor',
      providerId: 'PRV003',
      providerName: 'Phạm Hữu Cường',
      providerAvatar: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=100',
      price: 350000,
      priceUnit: 'Buổi 90 phút',
      duration: 'Theo lịch hẹn',
      rating: 4.8,
      reviewCount: 29,
      status: 'active',
      desc: 'Phương pháp phản xạ thực chiến với cựu giám khảo chấm thi, lộ trình bám sát đề thi thật, sửa chi tiết từng câu từ và ngữ pháp.',
      thumbnail: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=600'
    },
    {
      id: 'SVC004',
      title: 'Dọn dẹp căn hộ và văn phòng chuyên nghiệp theo giờ',
      category: 'Home',
      providerId: 'PRV005',
      providerName: 'Lê Thị Duyên',
      providerAvatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=100',
      price: 90000,
      priceUnit: 'Giờ',
      duration: '2 - 4 giờ',
      rating: 4.8,
      reviewCount: 31,
      status: 'active',
      desc: 'Dịch vụ dọn dẹp sạch sẽ, ngăn nắp từng góc nhỏ. Nhân viên trung thực, có lý lịch xác minh rõ ràng bởi ban quản trị sàn.',
      thumbnail: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=600'
    },
    {
      id: 'SVC005',
      title: 'Sửa chữa điện nước, thông tắc & bảo trì thiết bị 24/7',
      category: 'Repair',
      providerId: 'PRV004',
      providerName: 'Trần Đình Trọng',
      providerAvatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=100',
      price: 200000,
      priceUnit: 'Lần đến',
      duration: '30-60 phút',
      rating: 4.7,
      reviewCount: 45,
      status: 'active',
      desc: 'Xử lý triệt để rò rỉ nước ngầm, chập cháy cầu dao aptomat, thay mới ổ cắm an toàn. Báo giá minh bạch trước khi làm việc.',
      thumbnail: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=600'
    }
  ],

  jobRequests: [
    {
      id: 'JOB-2025-01',
      customerId: 'USR003',
      customerName: 'Lê Hoàng Long',
      title: 'Cần lập trình viên xây dựng Website Bán Hàng thời trang đa kênh',
      category: 'IT',
      budget: '8.000.000đ',
      budgetNum: 8000000,
      deadline: '15/05/2025',
      location: 'Online / TP.HCM',
      status: 'open',
      createdAt: '25/04/2025 09:30',
      desc: 'Công ty mình cần 1 bạn dev có kinh nghiệm thiết kế website bán hàng bằng Node.js / React, tích hợp cổng thanh toán trực tuyến, quản lý tồn kho và đồng bộ đơn hàng.',
      applicants: [
        {
          providerId: 'PRV001',
          providerName: 'Nguyễn Văn An',
          specialty: 'Senior Fullstack Web Dev',
          avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100',
          proposedPrice: '7.500.000đ',
          appliedAt: '25/04/2025 11:20',
          proposalText: 'Chào bạn Long! Mình đã từng xây dựng 3 hệ thống e-commerce tương tự với thời gian tải trang dưới 1.2s. Mình có thể hoàn thành trong 8 ngày với chế độ bảo hành 6 tháng.',
          status: 'pending'
        }
      ]
    },
    {
      id: 'JOB-2025-02',
      customerId: 'USR006',
      customerName: 'Vũ Thị Minh',
      title: 'Thiết kế bộ ấn phẩm Profile doanh nghiệp & Brochure quảng cáo 12 trang',
      category: 'Design',
      budget: '3.500.000đ',
      budgetNum: 3500000,
      deadline: '10/05/2025',
      location: 'Hà Nội / Online',
      status: 'open',
      createdAt: '26/04/2025 14:15',
      desc: 'Cần một Designer giàu kinh nghiệm trình bày báo cáo thường niên và Brochure giới thiệu sản phẩm năng lượng mặt trời. Phong cách thanh lịch, hiện đại, tone màu xanh dương - trắng.',
      applicants: [
        {
          providerId: 'PRV002',
          providerName: 'Trần Thị Lan',
          specialty: 'Senior UI/UX & Brand Designer',
          avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100',
          proposedPrice: '3.200.000đ',
          appliedAt: '26/04/2025 15:40',
          proposalText: 'Chào chị Minh, em chuyên thiết kế ấn phẩm B2B cho các tập đoàn công nghệ. Em gửi kèm Portfolio 10 dự án tương tự để chị tham khảo.',
          status: 'pending'
        }
      ]
    }
  ],

  orders: [
    {
      id: 'DH008841',
      customerId: 'USR003',
      customerName: 'Lê Hoàng Long',
      customerPhone: '0988 776 655',
      customerAddress: 'Quận 1, TP. Hồ Chí Minh',
      providerId: 'PRV001',
      providerName: 'Nguyễn Văn An',
      providerPhone: '0901 234 567',
      serviceId: 'SVC001',
      serviceTitle: 'Thiết kế lại toàn bộ UI/UX cho App giao hàng nội thành',
      price: 6500000,
      priceFormatted: '6.500.000đ',
      platformFee: 325000,
      escrowDeposit: 6825000,
      escrowStatus: 'escrow_held',
      orderStatus: 'pending',
      paymentMethod: 'Ví điện tử VNPay (Escrow 100%)',
      date: '18/10/2026 09:15',
      deadline: '10 ngày làm việc',
      scheduledDate: '2026-10-20',
      scheduledTime: '08:00 - 10:00',
      notes: 'Chào bạn An, bên mình cần ưu tiên hoàn thành trước 3 luồng chính: Đặt đơn, Xem bản đồ tài xế và Trang ví để kịp thuyết trình với cổ đông.',
      milestones: [
        { title: 'Ký quỹ Escrow bảo vệ 100% thành công', done: true, time: '18/10/2026 09:15' },
        { title: 'Provider tiếp nhận yêu cầu & triển khai công việc', done: false, time: 'Chờ tiếp nhận' },
        { title: 'Bàn giao sản phẩm / hoàn thành dịch vụ', done: false, time: 'Chờ bàn giao' },
        { title: 'Khách hàng nghiệm thu & Giải ngân Escrow', done: false, time: 'Chờ nghiệm thu' }
      ]
    },
    {
      id: 'DH001234',
      customerId: 'USR003',
      customerName: 'Lê Hoàng Long',
      customerPhone: '0988 776 655',
      providerId: 'PRV001',
      providerName: 'Nguyễn Văn An',
      providerPhone: '0901 234 567',
      serviceId: 'SVC001',
      serviceTitle: 'Thiết kế website chuẩn SEO & Tối ưu tốc độ tải trang',
      price: 4500000,
      priceFormatted: '4.500.000đ',
      platformFee: 225000,
      escrowDeposit: 4725000,
      escrowStatus: 'escrow_held', // escrow_held, completed, disputed, refunded
      orderStatus: 'processing',   // pending, confirmed, processing, delivered, completed, disputed, cancelled
      paymentMethod: 'Ví VNPay (Ký quỹ Escrow)',
      date: '28/04/2025 10:30',
      deadline: '05/05/2025',
      notes: 'Website bán hàng thời trang, yêu cầu giao diện mobile mượt mà và bàn giao source code trên GitHub.',
      milestones: [
        { title: 'Đặt cọc ký quỹ Escrow bảo vệ 100%', done: true, time: '28/04/2025 10:30' },
        { title: 'Provider bắt đầu triển khai kiến trúc & UI', done: true, time: '28/04/2025 14:00' },
        { title: 'Bàn giao bản demo chạy thử (Alpha Release)', done: false, time: 'Dự kiến 02/05/2025' },
        { title: 'Khách hàng nghiệm thu & Giải ngân Escrow', done: false, time: 'Dự kiến 05/05/2025' }
      ]
    },
    {
      id: 'DH001233',
      customerId: 'USR006',
      customerName: 'Vũ Thị Minh',
      customerPhone: '0944 889 900',
      providerId: 'PRV002',
      providerName: 'Trần Thị Lan',
      providerPhone: '0912 345 678',
      serviceId: 'SVC002',
      serviceTitle: 'Thiết kế Logo & Bộ nhận diện thương hiệu chuẩn Agency',
      price: 2800000,
      priceFormatted: '2.800.000đ',
      platformFee: 140000,
      escrowDeposit: 2940000,
      escrowStatus: 'escrow_held',
      orderStatus: 'delivered', // Đã bàn giao chờ khách bấm nghiệm thu
      paymentMethod: 'Chuyển khoản VietQR',
      date: '27/04/2025 16:20',
      deadline: '02/05/2025',
      notes: 'Thiết kế logo thương hiệu thời trang trẻ EcoStyle.',
      milestones: [
        { title: 'Đặt cọc ký quỹ Escrow bảo vệ 100%', done: true, time: '27/04/2025 16:20' },
        { title: 'Gửi 3 phương án phác thảo ý tưởng', done: true, time: '28/04/2025 10:00' },
        { title: 'Provider đã bàn giao toàn bộ file vector hoàn thiện', done: true, time: '29/04/2025 15:30' },
        { title: 'Khách hàng nghiệm thu & Giải ngân Escrow', done: false, time: 'Chờ khách xác nhận' }
      ]
    },
    {
      id: 'DH001231',
      customerId: 'USR003',
      customerName: 'Lê Hoàng Long',
      customerPhone: '0988 776 655',
      providerId: 'PRV003',
      providerName: 'Phạm Hữu Cường',
      providerPhone: '0977 445 566',
      serviceId: 'SVC003',
      serviceTitle: 'Khóa học IELTS Speaking 1 kèm 1 cấp tốc',
      price: 3500000,
      priceFormatted: '3.500.000đ',
      platformFee: 175000,
      escrowDeposit: 3675000,
      escrowStatus: 'completed',
      orderStatus: 'completed',
      paymentMethod: 'Thẻ tín dụng Quốc tế',
      date: '20/04/2025 11:40',
      deadline: '26/04/2025',
      notes: 'Luyện đề Speaking quý 2.',
      milestones: [
        { title: 'Đặt cọc ký quỹ Escrow', done: true, time: '20/04/2025' },
        { title: 'Hoàn thành 10 buổi học 1 kèm 1', done: true, time: '25/04/2025' },
        { title: 'Khách hàng đã nghiệm thu & Sàn đã giải ngân 3.500.000đ cho Provider', done: true, time: '26/04/2025' }
      ]
    }
  ],

  reviews: [
    { id: 'REV001', orderId: 'DH001231', customerId: 'USR003', customerName: 'Lê Hoàng Long', providerId: 'PRV003', providerName: 'Phạm Hữu Cường', serviceTitle: 'Khóa học IELTS Speaking', rating: 5, content: 'Thầy Cường dạy cực kỳ tận tâm, phương pháp phản xạ tự nhiên giúp mình tự tin nói lưu loát hơn rất nhiều!', date: '26/04/2025', criteria: ['Đúng giờ', 'Nhiệt tình', 'Chuyên môn xuất sắc'] },
    { id: 'REV002', orderId: 'DH001190', customerId: 'USR006', customerName: 'Vũ Thị Minh', providerId: 'PRV001', providerName: 'Nguyễn Văn An', serviceTitle: 'Thiết kế website', rating: 5, content: 'Anh An xử lý công việc rất nhanh và uy tín, giao diện website rất mượt mà trên cả điện thoại.', date: '22/04/2025', criteria: ['Bàn giao đúng hạn', 'Code chuẩn tối ưu'] }
  ],

  complaints: [
    {
      id: 'KN-2025-01',
      orderId: 'DH001229',
      complainantId: 'USR006',
      complainant: 'Vũ Thị Minh (Khách hàng)',
      defendantId: 'PRV005',
      defendant: 'Lê Thị Duyên (Provider)',
      reason: 'Dọn dẹp sơ sài, làm vỡ đồ trang trí và tự ý bỏ về trước giờ hẹn',
      amount: '850.000đ',
      priority: 'high',
      status: 'pending',
      createdAt: '24/04/2025 15:00',
      userClaim: 'Tôi thuê dịch vụ tổng vệ sinh 4 tiếng giá 850k. Nhân viên chỉ lau qua loa 2 tiếng rồi làm vỡ bình hoa trị giá 1 triệu, sau đó bỏ về. Tôi yêu cầu hoàn tiền 100% từ tiền ký quỹ Escrow.',
      providerClaim: 'Tôi đã dọn dẹp sạch sẽ. Bình hoa để chông chênh tự rơi, tôi đã nhận lỗi và đề nghị giảm 200k tiền công nhưng khách không đồng ý.'
    }
  ],

  messages: [
    {
      id: 'MSG001',
      fromUserId: 'USR003',
      toUserId: 'USR001',
      text: 'Chào anh An! Em muốn đặt làm website theo mẫu thiết kế Figma này, anh xem qua giúp em nhé.',
      time: '28/04/2025 09:10'
    },
    {
      id: 'MSG002',
      fromUserId: 'USR001',
      toUserId: 'USR003',
      text: 'Chào bạn Long! Mình đã xem qua, giao diện rất đẹp và rõ ràng. Mình có thể hoàn thành trong 5 ngày với chất lượng tối ưu nhất.',
      time: '28/04/2025 09:15'
    },
    {
      id: 'MSG003',
      fromUserId: 'USR003',
      toUserId: 'USR001',
      text: 'Vâng, em đã tạo đơn và thanh toán ký quỹ Escrow bảo vệ sàn rồi ạ. Anh triển khai giúp em nhé!',
      time: '28/04/2025 10:32'
    }
  ],

  pendingProviders: [
    {
      id: 'APP001',
      name: 'Võ Minh Trí',
      email: 'tri.vo@example.com',
      phone: '0908 112 233',
      specialty: 'Lập trình viên Fullstack React / Node.js',
      cccd: '079095012345',
      experience: '5 năm kinh nghiệm tại TechCorp',
      date: '28/04/2025',
      status: 'pending',
      bio: 'Chuyên xây dựng hệ thống thương mại điện tử, API tối ưu cao và tích hợp thanh toán.',
      cert: 'AWS Certified Solutions Architect, Meta Front-End Specialization'
    },
    {
      id: 'APP002',
      name: 'Nguyễn Thị Bích',
      email: 'bich.nguyen@example.com',
      phone: '0919 445 566',
      specialty: 'Thiết kế Đồ họa & UI/UX Figma',
      cccd: '080198004567',
      experience: '3 năm Freelance',
      date: '27/04/2025',
      status: 'pending',
      bio: 'Thiết kế giao diện mobile app, bộ nhận diện thương hiệu công ty và ấn phẩm quảng cáo.',
      cert: 'Google UX Design Professional Certificate'
    },
    {
      id: 'APP003',
      name: 'Trần Đình Trọng',
      email: 'trong.tran@example.com',
      phone: '0937 889 911',
      specialty: 'Sửa chữa điện lạnh & điện gia dụng',
      cccd: '001092003322',
      experience: '7 năm kỹ thuật viên',
      date: '27/04/2025',
      status: 'pending',
      bio: 'Bảo trì điều hòa inverter, máy giặt công nghiệp, tủ lạnh các hãng Daikin, Panasonic.',
      cert: 'Chứng chỉ nghề Kỹ thuật Điện lạnh Bậc 3/7'
    },
    {
      id: 'APP004',
      name: 'Lê Thùy Dung',
      email: 'dung.le@example.com',
      phone: '0981 223 344',
      specialty: 'Gia sư Tiếng Anh & Luyện thi IELTS',
      cccd: '038197009876',
      experience: '4 năm giảng dạy',
      date: '26/04/2025',
      status: 'pending',
      bio: 'Chuyên luyện thi cấp tốc IELTS 6.5 - 7.5, kèm phát âm chuẩn Anh - Mỹ cho người đi làm.',
      cert: 'IELTS Overall 8.0, TESOL 120h'
    }
  ],

  skillApprovals: [
    { id: 'SKL001', providerId: 'PRV001', providerName: 'Nguyễn Văn An', skillName: 'Kubernetes & DevOps CI/CD', certTitle: 'CKA (Certified Kubernetes Administrator)', issuer: 'Cloud Native Computing Foundation (CNCF)', date: '27/04/2025', status: 'pending' },
    { id: 'SKL002', providerId: 'PRV002', providerName: 'Trần Thị Lan', skillName: '3D Blender Product Rendering', certTitle: 'Blender Certified Professional', issuer: 'Blender Foundation', date: '26/04/2025', status: 'pending' },
    { id: 'SKL003', providerId: 'PRV003', providerName: 'Phạm Hữu Cường', skillName: 'Tiếng Nhật N1 Business', certTitle: 'JLPT N1 Certificate', issuer: 'Japan Foundation & JEES', date: '25/04/2025', status: 'pending' }
  ],

  reports: [
    { id: 'RP001', target: 'Tài khoản: Đặng Quốc Huy', violationType: 'Lừa đảo & phát tán virus', details: 'Provider nhận cọc ngoài sàn và gửi link có chứa mã độc', reporter: 'Lê Hoàng Long', date: '28/04/2025', status: 'resolved' },
    { id: 'RP002', target: 'Dịch vụ: Cài đặt tool hack game', violationType: 'Nội dung vi phạm pháp luật', details: 'Bài đăng quảng cáo phần mềm can thiệp trái phép', reporter: 'Nguyễn Văn An', date: '27/04/2025', status: 'resolved' },
    { id: 'RP003', target: 'Tài khoản: Hoàng Văn Nam', violationType: 'Spam & Boom đơn hàng', details: 'Tạo đơn ảo sau đó hủy nhiều lần gây thiệt hại cho Provider', reporter: 'Trần Đình Trọng', date: '26/04/2025', status: 'resolved' },
    { id: 'RP004', target: 'Đánh giá REV004', violationType: 'Ngôn từ kích động thù địch', details: 'Bình luận chứa từ ngữ xúc phạm danh dự nhân phẩm', reporter: 'Đặng Quốc Huy', date: '25/04/2025', status: 'resolved' }
  ],

  payouts: [
    { id: 'WD-0912', providerId: 'PRV001', provider: 'Nguyễn Văn An', bank: 'Vietcombank', account: '0071001234567', amount: '25.000.000đ', amountNum: 25000000, date: '28/04/2025 09:15', status: 'pending' },
    { id: 'WD-0911', providerId: 'PRV002', provider: 'Trần Thị Lan', bank: 'Techcombank', account: '19034567890123', amount: '18.500.000đ', amountNum: 18500000, date: '27/04/2025 15:30', status: 'pending' },
    { id: 'WD-0910', providerId: 'PRV003', provider: 'Phạm Hữu Cường', bank: 'MB Bank', account: '08889999222', amount: '12.000.000đ', amountNum: 12000000, date: '26/04/2025 11:20', status: 'paid' },
    { id: 'WD-0909', providerId: 'PRV005', provider: 'Lê Thị Duyên', bank: 'BIDV', account: '3141000123888', amount: '4.200.000đ', amountNum: 4200000, date: '25/04/2025 14:00', status: 'paid' }
  ],

  packages: [
    {
      id: 'PKG_BASIC',
      name: 'Gói Cơ Bản (Mặc định)',
      price: 0,
      duration: 30,
      postsCount: 3,
      features: ['Đăng tối đa 3 dịch vụ kỹ năng', 'Thời hạn hiển thị 30 ngày', 'Nhận đơn hàng & thanh toán Escrow', 'Hỗ trợ khách hàng tiêu chuẩn'],
      highlight: false
    },
    {
      id: 'PKG_PRO',
      name: 'Gói Chuyên Nghiệp (Pro Provider)',
      price: 199000,
      duration: 30,
      postsCount: 15,
      features: ['Đăng tối đa 15 dịch vụ kỹ năng', '3 lượt đẩy tin lên Top tìm kiếm mỗi tháng', 'Gắn huy hiệu uy tín "PRO PROVIDER"', 'Giảm 2% phí hoa hồng nền tảng', 'Ưu tiên hiển thị kết quả tìm kiếm'],
      highlight: true,
      badgeText: 'PHỔ BIẾN NHẤT'
    },
    {
      id: 'PKG_VIP',
      name: 'Gói Doanh Nghiệp (VIP Elite)',
      price: 499000,
      duration: 30,
      postsCount: 50,
      features: ['Không giới hạn bài đăng dịch vụ', '10 lượt đẩy tin Hot mỗi tháng', 'Huy hiệu vàng "VIP ELITE"', 'Giảm 4% phí hoa hồng nền tảng', 'Quản lý tài khoản riêng biệt 24/7', 'Báo cáo số liệu chuyên sâu hàng tuần'],
      highlight: false
    }
  ],

  packagePurchases: [
    { id: 'PKG-ORD-01', providerId: 'PRV001', provider: 'Nguyễn Văn An', packageName: 'Gói Chuyên Nghiệp (Pro Provider)', amount: '199.000đ', activeDate: '01/04/2025', expireDate: '01/05/2025', status: 'Đang hoạt động' },
    { id: 'PKG-ORD-02', providerId: 'PRV002', provider: 'Trần Thị Lan', packageName: 'Gói Doanh Nghiệp (VIP Elite)', amount: '499.000đ', activeDate: '15/04/2025', expireDate: '15/05/2025', status: 'Đang hoạt động' },
    { id: 'PKG-ORD-03', providerId: 'PRV003', provider: 'Phạm Hữu Cường', packageName: 'Gói Chuyên Nghiệp (Pro Provider)', amount: '199.000đ', activeDate: '10/04/2025', expireDate: '10/05/2025', status: 'Đang hoạt động' }
  ],

  unlockRequests: [
    {
      id: 'USR004',
      name: 'Hoàng Văn Nam',
      email: 'nam.hoang@example.com',
      phone: '0933 221 100',
      role: 'Customer',
      badgeTag: 'Chờ Admin xem xét',
      badgeClass: 'badge-warning',
      originalReason: 'Hủy đơn hàng liên tục 5 lần không lý do (Thời hạn khóa: 7 ngày).',
      appealText: 'Tôi xin thành thật nhận lỗi vì thời gian qua gia đình có việc khẩn cấp nên không kịp trao đổi với thợ. Tôi cam kết tuân thủ 100% quy chế giao dịch và thanh toán cọc đầy đủ qua sàn.',
      appealMeta: 'Thời gian gửi yêu cầu: 28/04/2025 08:30 (Lần khiếu nại thứ 1)',
      status: 'pending',
      type: 'standard'
    },
    {
      id: 'USR007',
      name: 'Đặng Quốc Huy',
      email: 'huy.dang@example.com',
      phone: '0911 334 455',
      role: 'Provider',
      badgeTag: 'Vi phạm nghiêm trọng',
      badgeClass: 'badge-danger',
      originalReason: 'Gian lận đánh giá và sử dụng tài khoản ảo để trục lợi sàn (Khóa Vĩnh viễn).',
      appealText: 'Tôi xin cam đoan không tái phạm hành vi cài link phần mềm hay tạo nick ảo. Đề nghị ban quản trị cho tôi cơ hội tiếp tục làm việc.',
      appealMeta: 'Thời gian gửi yêu cầu: 27/04/2025 15:45 • Báo cáo An ninh mạng liên quan',
      status: 'pending',
      type: 'severe'
    }
  ],

  posts: [
    {
      id: 'POST001',
      providerId: 'PRV001',
      providerName: 'Nguyễn Văn An',
      title: 'Tối ưu hóa kiến trúc Microservices và giảm 70% chi phí AWS Cloud',
      category: 'IT',
      date: '20/04/2025',
      readTime: '5 phút đọc',
      likes: 42,
      summary: 'Chia sẻ kinh nghiệm thực tế triển khai Docker container và autoscaling group giúp hệ thống chịu tải 100k requests/s mượt mà.',
      image: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600'
    },
    {
      id: 'POST002',
      providerId: 'PRV001',
      providerName: 'Nguyễn Văn An',
      title: 'Dự án Showcase: Hệ thống thương mại điện tử đa kênh hoàn thành trong 14 ngày',
      category: 'IT',
      date: '15/04/2025',
      readTime: '7 phút đọc',
      likes: 68,
      summary: 'Chi tiết quá trình thiết kế UX/UI trên Figma, code Next.js frontend và Node.js microservices tích hợp Escrow payment.',
      image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600'
    }
  ]
};

// ============================================================
// FIRESTORE-BACKED DATABASE (cache trong RAM + ghi xuống Firestore)
// ------------------------------------------------------------
// - Giữ nguyên API đồng bộ db.getCollection / db.saveCollection nên
//   toàn bộ routes hiện có KHÔNG phải sửa.
// - Khi server khởi động: await db.init() nạp toàn bộ collection từ Firestore.
// - saveCollection(): cập nhật cache ngay, chỉ ghi các document thay đổi
//   (và xóa document bị loại) xuống Firestore theo hàng đợi.
// - Mỗi document dùng field `id` của item làm document ID.
// - Thứ tự mảng được lưu bằng field `_idx` (được lọc bỏ khi trả về route).
// Giới hạn: chạy 1 instance server (cache nằm trong RAM).
// ============================================================
const { firestore } = require('../firebase');

// Collection ngoài INITIAL_DATABASE (tạo trong lúc chạy) cũng phải khai báo ở đây,
// nếu không server sẽ không nạp lại chúng từ Firestore sau khi khởi động.
const EXTRA_COLLECTIONS = ['favoriteProviders', 'comments', 'notifications', 'walletTransactions', 'bookingLists'];
const COLLECTIONS = Array.from(new Set([...Object.keys(INITIAL_DATABASE), ...EXTRA_COLLECTIONS]));

function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort()
      .filter(k => value[k] !== undefined)
      .map(k => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}

const docKey = id => String(id).replace(/\//g, '_');
const clone = x => JSON.parse(JSON.stringify(x));

class Database {
  constructor() {
    this.cache = {};
    this.snapshot = {};
    this.queue = Promise.resolve();
    this.writeErrors = 0;
    this.ready = false;
  }

  async init() {
    await Promise.all(COLLECTIONS.map(async (name) => {
      const snap = await firestore.collection(name).get();
      const rows = snap.docs.map(d => d.data());
      rows.sort((a, b) => (a._idx ?? 0) - (b._idx ?? 0));
      this.cache[name] = rows.map(({ _idx, ...rest }) => rest);
      const sigs = new Map();
      rows.forEach(r => sigs.set(docKey(r.id), stable(r)));
      this.snapshot[name] = sigs;
    }));
    this.ready = true;
    const users = (this.cache.users || []).length;
    console.log(`[db] Đã nạp Firestore: ${COLLECTIONS.length} collection, ${users} user.`);
    if (users === 0) {
      console.warn('[db] Firestore đang trống. Chạy "npm run seed" để nhập dữ liệu mẫu và tạo tài khoản.');
    }
  }

  getCollection(name) {
    if (!this.ready) console.warn(`[db] getCollection("${name}") được gọi trước db.init()`);
    return clone(this.cache[name] || []);
  }

  saveCollection(name, items) {
    if (!Array.isArray(items)) return false;
    const next = clone(items);
    next.forEach((item) => {
      if (item.id === undefined || item.id === null || item.id === '') {
        item.id = firestore.collection(name).doc().id;
      }
    });
    this.cache[name] = next;

    const old = this.snapshot[name] || new Map();
    const fresh = new Map();
    const upserts = [];
    next.forEach((item, idx) => {
      const key = docKey(item.id);
      const doc = { ...item, _idx: idx };
      const sig = stable(doc);
      fresh.set(key, sig);
      if (old.get(key) !== sig) upserts.push({ key, doc });
    });
    const deletes = [...old.keys()].filter(key => !fresh.has(key));
    this.snapshot[name] = fresh;

    if (upserts.length || deletes.length) this._enqueue(name, upserts, deletes);
    return true;
  }

  async saveCollectionAndWait(name, items) {
    const errorsBefore = this.writeErrors;
    if (!this.saveCollection(name, items)) return false;
    await this.flush();
    if (this.writeErrors > errorsBefore) {
      // Allow a later save to retry all documents after a failed batch.
      this.snapshot[name] = new Map();
      throw new Error(`Firestore write failed for collection "${name}".`);
    }
    return true;
  }

  _enqueue(name, upserts, deletes) {
    const ops = [
      ...upserts.map(u => ({ type: 'set', key: u.key, doc: u.doc })),
      ...deletes.map(key => ({ type: 'delete', key }))
    ];
    this.queue = this.queue.then(async () => {
      for (let i = 0; i < ops.length; i += 400) {
        const batch = firestore.batch();
        ops.slice(i, i + 400).forEach((op) => {
          const ref = firestore.collection(name).doc(op.key);
          if (op.type === 'set') batch.set(ref, op.doc);
          else batch.delete(ref);
        });
        await batch.commit();
      }
    }).catch(err => {
      this.writeErrors++;
      console.error(`[db] Lỗi ghi Firestore (${name}):`, err.message);
    });
  }

  // Chờ ghi xong (dùng khi tắt server hoặc trong script seed)
  flush() {
    return this.queue;
  }

  // Tương thích code cũ: trả toàn bộ dữ liệu
  read() {
    const out = {};
    COLLECTIONS.forEach((name) => { out[name] = this.getCollection(name); });
    return out;
  }
}

const db = new Database();
module.exports = db;
module.exports.INITIAL_DATABASE = INITIAL_DATABASE;
module.exports.COLLECTIONS = COLLECTIONS;
