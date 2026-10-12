/**
 * Skill Rental - B4 Admin Portal (Multi-Page Architecture)
 * common.js: Shared State, LocalStorage Sync, UI Utilities, Navigation Active State & Toasts
 */

const STORAGE_KEY = 'SKILL_RENTAL_ADMIN_STATE_V1';

// Default Seed State covering UC-52 -> UC-70
const DEFAULT_STATE = {
  // UC-52, UC-53: Users
  users: [
    { id: 'USR001', name: 'Nguyễn Văn An', email: 'an.nguyen@example.com', phone: '0901 234 567', role: 'Provider', joinDate: '12/01/2024', spentOrEarned: '112.500.000đ', status: 'active', lockReason: '' },
    { id: 'USR002', name: 'Trần Thị Lan', email: 'lan.tran@example.com', phone: '0912 345 678', role: 'Provider', joinDate: '03/02/2024', spentOrEarned: '89.200.000đ', status: 'active', lockReason: '' },
    { id: 'USR003', name: 'Lê Hoàng Long', email: 'long.le@example.com', phone: '0988 776 655', role: 'Customer', joinDate: '15/03/2024', spentOrEarned: '24.600.000đ', status: 'active', lockReason: '' },
    { id: 'USR004', name: 'Hoàng Văn Nam', email: 'nam.hoang@example.com', phone: '0933 221 100', role: 'Customer', joinDate: '20/05/2024', spentOrEarned: '5.200.000đ', status: 'locked', lockReason: 'Hủy đơn hàng liên tục 5 lần không lý do', lockDuration: '7 ngày' },
    { id: 'USR005', name: 'Phạm Hữu Cường', email: 'cuong.pham@example.com', phone: '0977 445 566', role: 'Provider', joinDate: '18/06/2024', spentOrEarned: '74.000.000đ', status: 'active', lockReason: '' },
    { id: 'USR006', name: 'Vũ Thị Minh', email: 'minh.vu@example.com', phone: '0944 889 900', role: 'Customer', joinDate: '02/08/2024', spentOrEarned: '18.400.000đ', status: 'active', lockReason: '' },
    { id: 'USR007', name: 'Đặng Quốc Huy', email: 'huy.dang@example.com', phone: '0911 334 455', role: 'Provider', joinDate: '11/09/2024', spentOrEarned: '12.000.000đ', status: 'locked', lockReason: 'Gian lận đánh giá và sử dụng tài khoản ảo', lockDuration: 'Vĩnh viễn' }
  ],

  // UC-54, UC-55: Provider Approvals
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

  // UC-56: Skill & Certificate Approvals
  skillApprovals: [
    { id: 'SKL001', providerName: 'Nguyễn Văn An', skillName: 'Kubernetes & DevOps CI/CD', certTitle: 'CKA (Certified Kubernetes Administrator)', issuer: 'Cloud Native Computing Foundation (CNCF)', date: '27/04/2025', status: 'pending' },
    { id: 'SKL002', providerName: 'Trần Thị Lan', skillName: '3D Blender Product Rendering', certTitle: 'Blender Certified Professional', issuer: 'Blender Foundation', date: '26/04/2025', status: 'pending' },
    { id: 'SKL003', providerName: 'Phạm Hữu Cường', skillName: 'Tiếng Nhật N1 Business', certTitle: 'JLPT N1 Certificate', issuer: 'Japan Foundation & JEES', date: '25/04/2025', status: 'pending' }
  ],

  // UC-57, UC-58, UC-59: Services
  services: [
    { id: 'SVC001', title: 'Thiết kế website chuẩn SEO & Tối ưu tốc độ', category: 'IT', providerName: 'Nguyễn Văn An', price: 4500000, rating: '4.9 ★', status: 'active', lockReason: '' },
    { id: 'SVC002', title: 'Thiết kế Logo & Bộ nhận diện thương hiệu trọn gói', category: 'Design', providerName: 'Trần Thị Lan', price: 2800000, rating: '4.9 ★', status: 'active', lockReason: '' },
    { id: 'SVC003', title: 'Luyện thi IELTS 1 kèm 1 cấp tốc', category: 'Tutor', providerName: 'Phạm Hữu Cường', price: 350000, rating: '4.8 ★', status: 'active', lockReason: '' },
    { id: 'SVC004', title: 'Dọn dẹp căn hộ và văn phòng theo giờ', category: 'Home', providerName: 'Lê Thị Duyên', price: 90000, rating: '4.7 ★', status: 'active', lockReason: '' },
    { id: 'SVC005', title: 'Sửa chữa điện nước tại nhà 24/7', category: 'Repair', providerName: 'Trần Đình Trọng', price: 200000, rating: '4.6 ★', status: 'active', lockReason: '' },
    { id: 'SVC006', title: 'Xây dựng ứng dụng di động Flutter đa nền tảng', category: 'IT', providerName: 'Võ Minh Trí', price: 8000000, rating: 'Chưa có', status: 'pending', dateSubmitted: '28/04/2025' },
    { id: 'SVC007', title: 'Dạy Piano và đệm hát cơ bản tại nhà', category: 'Tutor', providerName: 'Hoàng Ánh Tuyết', price: 250000, rating: 'Chưa có', status: 'pending', dateSubmitted: '27/04/2025' },
    { id: 'SVC008', title: 'Chụp ảnh Profile doanh nhân và Lookbook thời trang', category: 'Design', providerName: 'Đỗ Hùng Dũng', price: 1500000, rating: 'Chưa có', status: 'pending', dateSubmitted: '26/04/2025' },
    { id: 'SVC009', title: 'Bảo trì máy lạnh treo tường Inverter', category: 'Repair', providerName: 'Trần Đình Trọng', price: 150000, newPrice: 220000, rating: '4.8 ★', status: 'price_pending', reason: 'Tăng giá do bổ sung nạp gas R32 và vệ sinh dàn nóng nano' },
    { id: 'SVC010', title: 'Thiết kế giao diện App Mobile (UI/UX)', category: 'Design', providerName: 'Trần Thị Lan', price: 3000000, newPrice: 4000000, rating: '4.9 ★', status: 'price_pending', reason: 'Nâng cấp quy trình bàn giao source Figma đầy đủ Design System' },
    { id: 'SVC011', title: 'Dịch vụ cài đặt phần mềm hack & can thiệp game', category: 'IT', providerName: 'Đặng Quốc Huy', price: 500000, rating: '1.2 ★', status: 'locked', lockReason: 'Vi phạm nghiêm trọng chính sách bảo mật và pháp luật an ninh mạng' }
  ],

  // UC-60, UC-61: Orders & Escrow
  orders: [
    { id: 'DH001234', customer: 'Trần Thị Mai', provider: 'Nguyễn Văn An', service: 'Thiết kế website công ty', price: '4.500.000đ', escrowStatus: 'Đã giữ ký quỹ', orderStatus: 'processing', date: '28/04/2025 10:30', deadline: '05/05/2025' },
    { id: 'DH001233', customer: 'Lê Minh Hoàng', provider: 'Trần Thị Lan', service: 'Thiết kế bộ nhận diện logo', price: '2.800.000đ', escrowStatus: 'Đã giữ ký quỹ', orderStatus: 'confirmed', date: '27/04/2025 16:20', deadline: '02/05/2025' },
    { id: 'DH001232', customer: 'Hoàng Văn Nam', provider: 'Trần Đình Trọng', service: 'Sửa chữa chập điện gia đình', price: '450.000đ', escrowStatus: 'Chờ thanh toán', orderStatus: 'pending', date: '27/04/2025 14:15', deadline: '28/04/2025' },
    { id: 'DH001231', customer: 'Phạm Thị Lan', provider: 'Phạm Hữu Cường', service: 'Khóa học IELTS Speaking 10 buổi', price: '3.500.000đ', escrowStatus: 'Đã giải ngân', orderStatus: 'completed', date: '26/04/2025 11:40', deadline: '26/04/2025' },
    { id: 'DH001230', customer: 'Vũ Quang Huy', provider: 'Đặng Quốc Huy', service: 'Tối ưu máy tính từ xa', price: '600.000đ', escrowStatus: 'Đã hoàn tiền', orderStatus: 'cancelled', date: '25/04/2025 09:10', deadline: '25/04/2025' },
    { id: 'DH001229', customer: 'Đỗ Thúy Hà', provider: 'Lê Thị Duyên', service: 'Tổng vệ sinh nhà 3 tầng', price: '850.000đ', escrowStatus: 'Tạm giữ tranh chấp', orderStatus: 'disputed', date: '24/04/2025 13:00', deadline: '24/04/2025' }
  ],

  // UC-62, UC-63: Reviews
  reviews: [
    { id: 'REV001', customer: 'Trần Thị Mai', provider: 'Nguyễn Văn An', service: 'Thiết kế website', rating: 5, content: 'Anh An làm việc rất chuyên nghiệp, code chuẩn tối ưu, website chạy rất nhanh!', date: '28/04/2025', status: 'published' },
    { id: 'REV002', customer: 'Lê Minh Hoàng', provider: 'Trần Thị Lan', service: 'Thiết kế logo', rating: 5, content: 'Bản thiết kế rất sáng tạo, đúng gu thẩm mỹ hiện đại, phản hồi chỉnh sửa siêu nhanh.', date: '27/04/2025', status: 'published' },
    { id: 'REV003', customer: 'Đặng Hữu Tài', provider: 'Phạm Hữu Cường', service: 'Gia sư IELTS', rating: 4, content: 'Thầy dạy nhiệt tình, tài liệu phong phú, Speaking của mình cải thiện rõ rệt.', date: '26/04/2025', status: 'published' },
    { id: 'REV004', customer: 'Vũ Quang Huy', provider: 'Đặng Quốc Huy', service: 'Cài đặt phần mềm', rating: 1, content: 'Thằng lừa đảo, nhận tiền xong cài lung tung làm hỏng cả máy tính của tao! Đừng ai thuê nó!', date: '25/04/2025', status: 'hidden', note: 'Chứa từ ngữ thô tục, đã được ẩn bởi Admin' },
    { id: 'REV005', customer: 'Hoàng Văn Nam', provider: 'Trần Đình Trọng', service: 'Sửa chữa điện', rating: 2, content: 'Đến muộn 1 tiếng so với hẹn, giá báo ban đầu khác lúc thanh toán.', date: '24/04/2025', status: 'published' }
  ],

  // UC-64, UC-65: Complaints & Disputes
  complaints: [
    {
      id: 'KN-2025-01',
      orderId: 'DH001229',
      complainant: 'Đỗ Thúy Hà (Khách)',
      defendant: 'Lê Thị Duyên (Provider)',
      reason: 'Dọn dẹp sơ sài, làm vỡ bình hoa trang trí phòng khách và bỏ về trước giờ hẹn',
      priority: 'high',
      status: 'pending',
      amount: '850.000đ',
      userClaim: 'Tôi thuê gói tổng vệ sinh 4 tiếng giá 850k. Cô Duyên chỉ lau qua loa trong 2 tiếng rồi làm rơi vỡ bình gốm sứ trị giá 1 triệu, sau đó tự ý bỏ về. Tôi yêu cầu hoàn tiền 100% đơn hàng và bồi thường.',
      providerClaim: 'Tôi đã lau dọn sạch sẽ tầng 1 và tầng 2. Bình hoa để sát mép bàn tự ngã khi tôi quét nhà, tôi đã xin lỗi và sẵn sàng trừ 200k tiền công. Khách hàng đã mắng chửi xúc phạm tôi.'
    },
    {
      id: 'KN-2025-02',
      orderId: 'DH001230',
      complainant: 'Vũ Quang Huy (Khách)',
      defendant: 'Đặng Quốc Huy (Provider)',
      reason: 'Cài đặt phần mềm độc hại làm treo hệ điều hành và không hoàn thành cam kết',
      priority: 'urgent',
      status: 'pending',
      amount: '600.000đ',
      userClaim: 'Provider cài tool crack làm máy bị nhiễm mã độc tống tiền ransomware. Đơn hàng hoàn toàn không đạt yêu cầu.',
      providerClaim: 'Khách hàng yêu cầu bẻ khóa game lậu, tôi đã cảnh báo trước nhưng khách vẫn đồng ý tiến hành.'
    }
  ],

  // UC-66, UC-67: Violations & Reports
  reports: [
    { id: 'RP001', target: 'Tài khoản: Đặng Quốc Huy', violationType: 'Lừa đảo & phát tán virus', details: 'Provider nhận cọc ngoài sàn và gửi link có chứa mã độc', reporter: 'Lê Hoàng Long', date: '28/04/2025', status: 'resolved' },
    { id: 'RP002', target: 'Dịch vụ: Cài đặt tool hack game', violationType: 'Nội dung vi phạm pháp luật', details: 'Bài đăng quảng cáo phần mềm can thiệp trái phép', reporter: 'Nguyễn Văn An', date: '27/04/2025', status: 'resolved' },
    { id: 'RP003', target: 'Tài khoản: Hoàng Văn Nam', violationType: 'Spam & Boom đơn hàng', details: 'Tạo đơn ảo sau đó hủy nhiều lần gây thiệt hại cho Provider', reporter: 'Trần Đình Trọng', date: '26/04/2025', status: 'resolved' },
    { id: 'RP004', target: 'Đánh giá REV004', violationType: 'Ngôn từ kích động thù địch', details: 'Bình luận chứa từ ngữ xúc phạm danh dự nhân phẩm', reporter: 'Đặng Quốc Huy', date: '25/04/2025', status: 'resolved' }
  ],

  // UC-69: Cash Flow Payout Requests
  payouts: [
    { id: 'WD-0912', provider: 'Nguyễn Văn An', bank: 'Vietcombank', account: '0071001234567', amount: '25.000.000đ', date: '28/04/2025 09:15', status: 'pending' },
    { id: 'WD-0911', provider: 'Trần Thị Lan', bank: 'Techcombank', account: '19034567890123', amount: '18.500.000đ', date: '27/04/2025 15:30', status: 'pending' },
    { id: 'WD-0910', provider: 'Phạm Hữu Cường', bank: 'MB Bank', account: '08889999222', amount: '12.000.000đ', date: '26/04/2025 11:20', status: 'paid' },
    { id: 'WD-0909', provider: 'Lê Thị Duyên', bank: 'BIDV', account: '3141000123888', amount: '4.200.000đ', date: '25/04/2025 14:00', status: 'paid' }
  ],

  // UC-70: Packages
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
    { id: 'PKG-ORD-01', provider: 'Nguyễn Văn An', packageName: 'Gói Chuyên Nghiệp (Pro Provider)', amount: '199.000đ', activeDate: '01/04/2025', expireDate: '01/05/2025', status: 'Đang hoạt động' },
    { id: 'PKG-ORD-02', provider: 'Trần Thị Lan', packageName: 'Gói Doanh Nghiệp (VIP Elite)', amount: '499.000đ', activeDate: '15/04/2025', expireDate: '15/05/2025', status: 'Đang hoạt động' },
    { id: 'PKG-ORD-03', provider: 'Phạm Hữu Cường', packageName: 'Gói Chuyên Nghiệp (Pro Provider)', amount: '199.000đ', activeDate: '10/04/2025', expireDate: '10/05/2025', status: 'Đang hoạt động' }
  ]
};

// ============================================================================
// BACKEND API BASE & LOCALSTORAGE SYNC & RETRIEVAL
// ============================================================================
const API_BASE = (typeof window !== 'undefined' && window.location.protocol.startsWith('http') && (window.location.port === '3000' || window.location.port === '')) ? '' : 'http://localhost:3000';

function getAppState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      saveAppState(DEFAULT_STATE);
      return JSON.parse(JSON.stringify(DEFAULT_STATE));
    }
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading localStorage state:', err);
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }
}

function saveAppState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    // Asynchronously push changes to backend
    fetch(`${API_BASE}/api/admin/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state)
    }).catch(err => {
      console.warn('Backend state sync warning:', err);
    });
  } catch (err) {
    console.error('Error saving state to localStorage:', err);
  }
}

// Auto-sync state with backend server
async function syncStateWithServer() {
  try {
    const res = await fetch(`${API_BASE}/api/admin/state`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.success && data.state) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data.state));
        updateSidebarBadges();
        if (typeof window.onServerStateSynced === 'function') {
          window.onServerStateSynced(data.state);
        }
      }
    }
  } catch (err) {
    console.log('Server sync: Running offline or cached mode');
  }
}

// Admin API client methods
window.adminApi = {
  getDashboard: () => fetch(`${API_BASE}/api/admin/dashboard`).then(r => r.json()),
  lockUser: (id, reason, duration) => fetch(`${API_BASE}/api/admin/users/${id}/lock`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason, duration }) }).then(r => r.json()),
  unlockUser: (id) => fetch(`${API_BASE}/api/admin/users/${id}/unlock`, { method: 'POST' }).then(r => r.json()),
  decideUnlock: (id, decision) => fetch(`${API_BASE}/api/admin/unlock-requests/${id}/decide`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision }) }).then(r => r.json()),
  approveProvider: (id) => fetch(`${API_BASE}/api/admin/providers/${id}/approve`, { method: 'POST' }).then(r => r.json()),
  rejectProvider: (id, reason) => fetch(`${API_BASE}/api/admin/providers/${id}/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) }).then(r => r.json()),
  approveSkill: (id) => fetch(`${API_BASE}/api/admin/skills/${id}/approve`, { method: 'POST' }).then(r => r.json()),
  rejectSkill: (id, reason) => fetch(`${API_BASE}/api/admin/skills/${id}/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) }).then(r => r.json()),
  approveService: (id) => fetch(`${API_BASE}/api/admin/services/${id}/approve`, { method: 'POST' }).then(r => r.json()),
  approveServicePrice: (id) => fetch(`${API_BASE}/api/admin/services/${id}/approve-price`, { method: 'POST' }).then(r => r.json()),
  lockService: (id, reason) => fetch(`${API_BASE}/api/admin/services/${id}/lock`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) }).then(r => r.json()),
  unlockService: (id) => fetch(`${API_BASE}/api/admin/services/${id}/unlock`, { method: 'POST' }).then(r => r.json()),
  resolveComplaint: (id, resolution, refundPercentage, note) => fetch(`${API_BASE}/api/admin/complaints/${id}/resolve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resolution, refundPercentage, note }) }).then(r => r.json()),
  resolveReport: (id, action, note) => fetch(`${API_BASE}/api/admin/reports/${id}/resolve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, note }) }).then(r => r.json()),
  approvePayout: (id) => fetch(`${API_BASE}/api/admin/payouts/${id}/approve`, { method: 'POST' }).then(r => r.json()),
  rejectPayout: (id, reason) => fetch(`${API_BASE}/api/admin/payouts/${id}/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) }).then(r => r.json()),
  forceReleaseOrder: (id) => fetch(`${API_BASE}/api/admin/orders/${id}/force-release`, { method: 'POST' }).then(r => r.json()),
  forceRefundOrder: (id) => fetch(`${API_BASE}/api/admin/orders/${id}/force-refund`, { method: 'POST' }).then(r => r.json()),
  moderateReview: (id, status, note) => fetch(`${API_BASE}/api/admin/reviews/${id}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, note }) }).then(r => r.json())
};

// Reset state helper
function resetAppStateToDefault() {
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
}

// ============================================================================
// AUTOMATIC NAVIGATION ACTIVE STATE & BADGE COUNTS
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  highlightActiveMenu();
  updateSidebarBadges();
  bindSubtabEvents();
  syncStateWithServer();
});

function highlightActiveMenu() {
  const currentPath = window.location.pathname;
  const fileName = currentPath.substring(currentPath.lastIndexOf('/') + 1) || 'admin.html';
  const urlParams = new URLSearchParams(window.location.search);
  const filterParam = urlParams.get('filter');
  const tabParam = urlParams.get('tab');

  const menuItems = document.querySelectorAll('.sidebar .menu-item');
  menuItems.forEach(item => {
    item.classList.remove('active');
    const href = item.getAttribute('href');
    if (!href) return;

    const [itemFile, itemQuery] = href.split('?');
    const isFileMatch = (itemFile === fileName) || 
                        (fileName === '' && itemFile === 'admin.html') || 
                        (fileName === 'index.html' && itemFile === 'admin.html') || 
                        (fileName === 'admin.html' && itemFile === 'admin.html');

    if (isFileMatch) {
      if (itemQuery) {
        const itemParams = new URLSearchParams(itemQuery);
        if (filterParam && itemParams.get('filter') === filterParam) {
          item.classList.add('active');
        } else if (tabParam && itemParams.get('tab') === tabParam) {
          item.classList.add('active');
        }
      } else if (!filterParam && !tabParam) {
        item.classList.add('active');
      }
    }
  });
}

function updateSidebarBadges() {
  const state = getAppState();

  const pendingProvCount = state.pendingProviders.filter(p => p.status === 'pending').length;
  const pendingSkillCount = state.skillApprovals.filter(s => s.status === 'pending').length;
  const pendingSvcCount = state.services.filter(s => s.status === 'pending').length;
  const pendingCompCount = state.complaints.filter(c => c.status === 'pending').length;

  const elProv = document.getElementById('badge-provider-pending');
  const elSkill = document.getElementById('badge-skill-pending');
  const elSvc = document.getElementById('badge-service-pending');
  const elComp = document.getElementById('badge-complaint-count');

  if (elProv) elProv.textContent = pendingProvCount;
  if (elSkill) elSkill.textContent = pendingSkillCount;
  if (elSvc) elSvc.textContent = pendingSvcCount;
  if (elComp) elComp.textContent = pendingCompCount;
}

// Subtab switcher inside pages
function bindSubtabEvents() {
  document.querySelectorAll('.subtabs').forEach(tabGroup => {
    const buttons = tabGroup.querySelectorAll('.subtab-btn');
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTabId = btn.getAttribute('data-subtab');
        buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const parentContent = btn.closest('.content-area') || document;
        parentContent.querySelectorAll('.subtab-content').forEach(content => {
          content.classList.remove('active');
        });

        const targetEl = document.getElementById(targetTabId);
        if (targetEl) targetEl.classList.add('active');
      });
    });
  });

  // Activate tab based on URL param if present
  const urlParams = new URLSearchParams(window.location.search);
  const tabParam = urlParams.get('tab');
  if (tabParam) {
    const targetBtn = document.querySelector(`.subtab-btn[data-subtab="tab-${tabParam}"]`) ||
                      document.querySelector(`.subtab-btn[data-subtab="${tabParam}"]`);
    if (targetBtn) targetBtn.click();
  }
}

// ============================================================================
// MODAL CONTROLS & TOASTS
// ============================================================================
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('active');
}

function showToast(title, message, type = 'success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const iconMap = {
    success: '✓',
    warning: '!',
    error: '✕',
    info: 'ℹ'
  };

  toast.innerHTML = `
    <div class="toast-icon" style="color:var(--${type === 'success' ? 'primary' : type === 'warning' ? 'warning' : type === 'error' ? 'error' : 'info'});">
      ${iconMap[type] || '✓'}
    </div>
    <div class="toast-body">
      <strong>${title}</strong>
      <p>${message}</p>
    </div>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function exportDataSimulation(filename) {
  showToast('Xuất báo cáo (UC-67)', `Đang tạo và tải tệp [${filename}.xlsx]... Vui lòng đợi trong giây lát.`, 'info');
  setTimeout(() => {
    const csvContent = "data:text/csv;charset=utf-8,ID,Tieu_De,Thoi_Gian,Trang_Thai\n1,Bao_Cao_He_Thong," + new Date().toLocaleDateString() + ",Thanh_Cong";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${filename}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Tải dữ liệu hoàn tất', `Tệp báo cáo ${filename}.csv đã được lưu thành công!`, 'success');
  }, 1000);
}
