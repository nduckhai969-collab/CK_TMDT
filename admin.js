/**
 * Skill Rental - B4 Admin Portal
 * Handles View Routing, Subtabs, Interactive Modals, Filtering & Real-time State
 */

document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

// ============================================================================
// GLOBAL STATE & MOCK DATA
// ============================================================================
const STATE = {
  activeView: 'view-dashboard',

  // Users
  users: [
    { id: 'USR001', name: 'Nguyễn Văn An', email: 'an.nguyen@example.com', phone: '0901 234 567', role: 'Provider', joinDate: '12/01/2024', spentOrEarned: '112.500.000đ', status: 'active', lockReason: '' },
    { id: 'USR002', name: 'Trần Thị Lan', email: 'lan.tran@example.com', phone: '0912 345 678', role: 'Provider', joinDate: '03/02/2024', spentOrEarned: '89.200.000đ', status: 'active', lockReason: '' },
    { id: 'USR003', name: 'Lê Hoàng Long', email: 'long.le@example.com', phone: '0988 776 655', role: 'Customer', joinDate: '15/03/2024', spentOrEarned: '24.600.000đ', status: 'active', lockReason: '' },
    { id: 'USR004', name: 'Hoàng Văn Nam', email: 'nam.hoang@example.com', phone: '0933 221 100', role: 'Customer', joinDate: '20/05/2024', spentOrEarned: '5.200.000đ', status: 'locked', lockReason: 'Hủy đơn hàng liên tục 5 lần không lý do', lockDuration: '7 ngày' },
    { id: 'USR005', name: 'Phạm Hữu Cường', email: 'cuong.pham@example.com', phone: '0977 445 566', role: 'Provider', joinDate: '18/06/2024', spentOrEarned: '74.000.000đ', status: 'active', lockReason: '' },
    { id: 'USR006', name: 'Vũ Thị Minh', email: 'minh.vu@example.com', phone: '0944 889 900', role: 'Customer', joinDate: '02/08/2024', spentOrEarned: '18.400.000đ', status: 'active', lockReason: '' },
    { id: 'USR007', name: 'Đặng Quốc Huy', email: 'huy.dang@example.com', phone: '0911 334 455', role: 'Provider', joinDate: '11/09/2024', spentOrEarned: '12.000.000đ', status: 'locked', lockReason: 'Gian lận đánh giá và sử dụng tài khoản ảo', lockDuration: 'Vĩnh viễn' }
  ],

  // Provider Approval Registrations
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

  // Skill & Certificate Approvals
  skillApprovals: [
    { id: 'SKL001', providerName: 'Nguyễn Văn An', skillName: 'Kubernetes & DevOps CI/CD', certTitle: 'CKA (Certified Kubernetes Administrator)', issuer: 'Cloud Native Computing Foundation (CNCF)', date: '27/04/2025', status: 'pending' },
    { id: 'SKL002', providerName: 'Trần Thị Lan', skillName: '3D Blender Product Rendering', certTitle: 'Blender Certified Professional', issuer: 'Blender Foundation', date: '26/04/2025', status: 'pending' },
    { id: 'SKL003', providerName: 'Phạm Hữu Cường', skillName: 'Tiếng Nhật N1 Business', certTitle: 'JLPT N1 Certificate', issuer: 'Japan Foundation & JEES', date: '25/04/2025', status: 'pending' }
  ],

  // Services
  services: [
    { id: 'SVC001', title: 'Thiết kế website chuẩn SEO & Tối ưu tốc độ', category: 'IT', providerName: 'Nguyễn Văn An', price: 4500000, rating: '4.9 ★', status: 'active', lockReason: '' },
    { id: 'SVC002', title: 'Thiết kế Logo & Bộ nhận diện thương hiệu trọn gói', category: 'Design', providerName: 'Trần Thị Lan', price: 2800000, rating: '4.9 ★', status: 'active', lockReason: '' },
    { id: 'SVC003', title: 'Luyện thi IELTS 1 kèm 1 cấp tốc', category: 'Tutor', providerName: 'Phạm Hữu Cường', price: 350000, rating: '4.8 ★', status: 'active', lockReason: '' },
    { id: 'SVC004', title: 'Dọn dẹp căn hộ và văn phòng theo giờ', category: 'Home', providerName: 'Lê Thị Duyên', price: 90000, rating: '4.7 ★', status: 'active', lockReason: '' },
    { id: 'SVC005', title: 'Sửa chữa điện nước tại nhà 24/7', category: 'Repair', providerName: 'Trần Đình Trọng', price: 200000, rating: '4.6 ★', status: 'active', lockReason: '' },
    // Pending new services
    { id: 'SVC006', title: 'Xây dựng ứng dụng di động Flutter đa nền tảng', category: 'IT', providerName: 'Võ Minh Trí', price: 8000000, rating: 'Chưa có', status: 'pending', dateSubmitted: '28/04/2025' },
    { id: 'SVC007', title: 'Dạy Piano và đệm hát cơ bản tại nhà', category: 'Tutor', providerName: 'Hoàng Ánh Tuyết', price: 250000, rating: 'Chưa có', status: 'pending', dateSubmitted: '27/04/2025' },
    { id: 'SVC008', title: 'Chụp ảnh Profile doanh nhân và Lookbook thời trang', category: 'Design', providerName: 'Đỗ Hùng Dũng', price: 1500000, rating: 'Chưa có', status: 'pending', dateSubmitted: '26/04/2025' },
    // Price update pending
    { id: 'SVC009', title: 'Bảo trì máy lạnh treo tường Inverter', category: 'Repair', providerName: 'Trần Đình Trọng', price: 150000, newPrice: 220000, rating: '4.8 ★', status: 'price_pending', reason: 'Tăng giá do bổ sung nạp gas R32 và vệ sinh dàn nóng nano' },
    { id: 'SVC010', title: 'Thiết kế giao diện App Mobile (UI/UX)', category: 'Design', providerName: 'Trần Thị Lan', price: 3000000, newPrice: 4000000, rating: '4.9 ★', status: 'price_pending', reason: 'Nâng cấp quy trình bàn giao source Figma đầy đủ Design System' },
    // Locked services
    { id: 'SVC011', title: 'Dịch vụ cài đặt phần mềm hack & can thiệp game', category: 'IT', providerName: 'Đặng Quốc Huy', price: 500000, rating: '1.2 ★', status: 'locked', lockReason: 'Vi phạm nghiêm trọng chính sách bảo mật và pháp luật an ninh mạng' }
  ],

  // Orders & Escrow
  orders: [
    { id: 'DH001234', customer: 'Trần Thị Mai', provider: 'Nguyễn Văn An', service: 'Thiết kế website công ty', price: '4.500.000đ', escrowStatus: 'Đã giữ ký quỹ', orderStatus: 'processing', date: '28/04/2025 10:30', deadline: '05/05/2025' },
    { id: 'DH001233', customer: 'Lê Minh Hoàng', provider: 'Trần Thị Lan', service: 'Thiết kế bộ nhận diện logo', price: '2.800.000đ', escrowStatus: 'Đã giữ ký quỹ', orderStatus: 'confirmed', date: '27/04/2025 16:20', deadline: '02/05/2025' },
    { id: 'DH001232', customer: 'Hoàng Văn Nam', provider: 'Trần Đình Trọng', service: 'Sửa chữa chập điện gia đình', price: '450.000đ', escrowStatus: 'Chờ thanh toán', orderStatus: 'pending', date: '27/04/2025 14:15', deadline: '28/04/2025' },
    { id: 'DH001231', customer: 'Phạm Thị Lan', provider: 'Phạm Hữu Cường', service: 'Khóa học IELTS Speaking 10 buổi', price: '3.500.000đ', escrowStatus: 'Đã giải ngân', orderStatus: 'completed', date: '26/04/2025 11:40', deadline: '26/04/2025' },
    { id: 'DH001230', customer: 'Vũ Quang Huy', provider: 'Đặng Quốc Huy', service: 'Tối ưu máy tính từ xa', price: '600.000đ', escrowStatus: 'Đã hoàn tiền', orderStatus: 'cancelled', date: '25/04/2025 09:10', deadline: '25/04/2025' },
    { id: 'DH001229', customer: 'Đỗ Thúy Hà', provider: 'Lê Thị Duyên', service: 'Tổng vệ sinh nhà 3 tầng', price: '850.000đ', escrowStatus: 'Tạm giữ tranh chấp', orderStatus: 'disputed', date: '24/04/2025 13:00', deadline: '24/04/2025' }
  ],

  // Reviews
  reviews: [
    { id: 'REV001', customer: 'Trần Thị Mai', provider: 'Nguyễn Văn An', service: 'Thiết kế website', rating: 5, content: 'Anh An làm việc rất chuyên nghiệp, code chuẩn tối ưu, website chạy rất nhanh!', date: '28/04/2025', status: 'published' },
    { id: 'REV002', customer: 'Lê Minh Hoàng', provider: 'Trần Thị Lan', service: 'Thiết kế logo', rating: 5, content: 'Bản thiết kế rất sáng tạo, đúng gu thẩm mỹ hiện đại, phản hồi chỉnh sửa siêu nhanh.', date: '27/04/2025', status: 'published' },
    { id: 'REV003', customer: 'Đặng Hữu Tài', provider: 'Phạm Hữu Cường', service: 'Gia sư IELTS', rating: 4, content: 'Thầy dạy nhiệt tình, tài liệu phong phú, Speaking của mình cải thiện rõ rệt.', date: '26/04/2025', status: 'published' },
    { id: 'REV004', customer: 'Vũ Quang Huy', provider: 'Đặng Quốc Huy', service: 'Cài đặt phần mềm', rating: 1, content: 'Thằng lừa đảo, nhận tiền xong cài lung tung làm hỏng cả máy tính của tao! Đừng ai thuê nó!', date: '25/04/2025', status: 'hidden', note: 'Chứa từ ngữ thô tục, đã được ẩn bởi Admin' },
    { id: 'REV005', customer: 'Hoàng Văn Nam', provider: 'Trần Đình Trọng', service: 'Sửa chữa điện', rating: 2, content: 'Đến muộn 1 tiếng so với hẹn, giá báo ban đầu khác lúc thanh toán.', date: '24/04/2025', status: 'published' }
  ],

  // Complaints & Disputes
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

  // Community Violations Reports
  reports: [
    { id: 'RP001', target: 'Tài khoản: Đặng Quốc Huy', violationType: 'Lừa đảo & phát tán virus', details: 'Provider nhận cọc ngoài sàn và gửi link có chứa mã độc', reporter: 'Lê Hoàng Long', date: '28/04/2025', status: 'resolved' },
    { id: 'RP002', target: 'Dịch vụ: Cài đặt tool hack game', violationType: 'Nội dung vi phạm pháp luật', details: 'Bài đăng quảng cáo phần mềm can thiệp trái phép', reporter: 'Nguyễn Văn An', date: '27/04/2025', status: 'resolved' },
    { id: 'RP003', target: 'Tài khoản: Hoàng Văn Nam', violationType: 'Spam & Boom đơn hàng', details: 'Tạo đơn ảo sau đó hủy nhiều lần gây thiệt hại cho Provider', reporter: 'Trần Đình Trọng', date: '26/04/2025', status: 'resolved' },
    { id: 'RP004', target: 'Đánh giá REV004', violationType: 'Ngôn từ kích động thù địch', details: 'Bình luận chứa từ ngữ xúc phạm danh dự nhân phẩm', reporter: 'Đặng Quốc Huy', date: '25/04/2025', status: 'resolved' }
  ],

  // Cash Flow Payout Requests
  payouts: [
    { id: 'WD-0912', provider: 'Nguyễn Văn An', bank: 'Vietcombank', account: '0071001234567', amount: '25.000.000đ', date: '28/04/2025 09:15', status: 'pending' },
    { id: 'WD-0911', provider: 'Trần Thị Lan', bank: 'Techcombank', account: '19034567890123', amount: '18.500.000đ', date: '27/04/2025 15:30', status: 'pending' },
    { id: 'WD-0910', provider: 'Phạm Hữu Cường', bank: 'MB Bank', account: '08889999222', amount: '12.000.000đ', date: '26/04/2025 11:20', status: 'paid' },
    { id: 'WD-0909', provider: 'Lê Thị Duyên', bank: 'BIDV', account: '3141000123888', amount: '4.200.000đ', date: '25/04/2025 14:00', status: 'paid' }
  ],

  // Listing Packages
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

  // Package Purchases History
  packagePurchases: [
    { id: 'PKG-ORD-01', provider: 'Nguyễn Văn An', packageName: 'Gói Chuyên Nghiệp (Pro Provider)', amount: '199.000đ', activeDate: '01/04/2025', expireDate: '01/05/2025', status: 'Đang hoạt động' },
    { id: 'PKG-ORD-02', provider: 'Trần Thị Lan', packageName: 'Gói Doanh Nghiệp (VIP Elite)', amount: '499.000đ', activeDate: '15/04/2025', expireDate: '15/05/2025', status: 'Đang hoạt động' },
    { id: 'PKG-ORD-03', provider: 'Phạm Hữu Cường', packageName: 'Gói Chuyên Nghiệp (Pro Provider)', amount: '199.000đ', activeDate: '10/04/2025', expireDate: '10/05/2025', status: 'Đang hoạt động' }
  ]
};

// ============================================================================
// INITIALIZATION
// ============================================================================
function initApp() {
  bindNavigation();
  bindSubtabs();
  renderAllTables();
  setupEventListeners();
  console.log('Skill Rental B4 Admin Portal Initialized.');
}

// ============================================================================
// NAVIGATION & VIEW SWITCHING
// ============================================================================
function bindNavigation() {
  const menuItems = document.querySelectorAll('.sidebar .menu-item');
  menuItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const targetView = item.getAttribute('data-view');
      const tabParam = item.getAttribute('data-tab');
      const filterParam = item.getAttribute('data-filter');

      switchView(targetView, { tab: tabParam, filter: filterParam });

      menuItems.forEach(mi => mi.classList.remove('active'));
      item.classList.add('active');
    });
  });
}

function switchView(viewId, params = {}) {
  const views = document.querySelectorAll('.view-section');
  const targetEl = document.getElementById(viewId);

  if (!targetEl) return;

  views.forEach(v => v.classList.remove('active-view'));
  targetEl.classList.add('active-view');
  STATE.activeView = viewId;

  // Update topbar breadcrumb tag
  const badge = document.getElementById('current-view-badge');
  if (badge) {
    const titleMap = {
      'view-dashboard': 'B4 ADMIN / DASHBOARD',
      'view-users': 'QUẢN LÝ / NGƯỜI DÙNG',
      'view-providers': 'QUẢN LÝ / PROVIDER & HỒ SƠ',
      'view-services': 'QUẢN LÝ / DỊCH VỤ & GIÁ',
      'view-orders': 'GIAO DỊCH / ĐƠN HÀNG',
      'view-reviews': 'ĐÁNH GIÁ / KIỂM DUYỆT',
      'view-complaints': 'TRANH CHẤP / KHIẾU NẠI',
      'view-reports': 'BÁO CÁO / XUẤT DỮ LIỆU',
      'view-statistics': 'THỐNG KÊ / CHUYÊN SÂU',
      'view-cashflow': 'TÀI CHÍNH / DÒNG TIỀN ESCROW',
      'view-packages': 'CẤU HÌNH / GÓI ĐĂNG TIN'
    };
    badge.textContent = titleMap[viewId] || 'SKILL RENTAL ADMIN';
  }

  // Update sidebar active indicator
  const currentMenu = document.querySelector(`.sidebar .menu-item[data-view="${viewId}"]`);
  if (currentMenu) {
    document.querySelectorAll('.sidebar .menu-item').forEach(m => m.classList.remove('active'));
    currentMenu.classList.add('active');
  }

  // Handle params (subtabs or filters)
  if (params.tab) {
    activateSubtab(viewId, params.tab);
  }

  if (params.filter && viewId === 'view-users') {
    applyUserQuickFilter(params.filter);
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function bindSubtabs() {
  document.querySelectorAll('.subtabs').forEach(tabGroup => {
    const buttons = tabGroup.querySelectorAll('.subtab-btn');
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTabId = btn.getAttribute('data-subtab');
        const parentView = btn.closest('.view-section');

        buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        if (parentView) {
          parentView.querySelectorAll('.subtab-content').forEach(content => {
            content.classList.remove('active');
          });
          const targetContent = document.getElementById(targetTabId);
          if (targetContent) targetContent.classList.add('active');
        }
      });
    });
  });
}

function activateSubtab(viewId, tabId) {
  const view = document.getElementById(viewId);
  if (!view) return;

  const btn = view.querySelector(`.subtab-btn[data-subtab="${tabId}"]`);
  if (btn) btn.click();
}

// ============================================================================
// DATA RENDERING LOGIC
// ============================================================================
function renderAllTables() {
  renderDashboard();
  renderUsers();
  renderProviderApprovals();
  renderSkillApprovals();
  renderAllProviders();
  renderServices();
  renderOrders();
  renderReviews();
  renderComplaints();
  renderReports();
  renderCashFlow();
  renderPackages();
}

/* 1. Dashboard View */
function renderDashboard() {
  // Recent orders
  const tbody = document.getElementById('dashboard-recent-orders-tbody');
  if (tbody) {
    const recent = STATE.orders.slice(0, 5);
    tbody.innerHTML = recent.map(o => `
      <tr>
        <td><strong>${o.id}</strong></td>
        <td>${o.customer}</td>
        <td>${o.provider}</td>
        <td>${o.service}</td>
        <td>${getStatusBadge(o.orderStatus)}</td>
        <td><span class="badge ${o.escrowStatus === 'Đã giữ ký quỹ' ? 'badge-info' : o.escrowStatus === 'Đã giải ngân' ? 'badge-success' : 'badge-warning'}">${o.escrowStatus}</span></td>
        <td>
          <button class="btn btn-secondary btn-xs" onclick="openOrderDetail('${o.id}')">Chi tiết</button>
        </td>
      </tr>
    `).join('');
  }

  // Pending Providers quick list
  const provList = document.getElementById('dashboard-pending-providers-list');
  if (provList) {
    const pending = STATE.pendingProviders.filter(p => p.status === 'pending').slice(0, 4);
    if (pending.length === 0) {
      provList.innerHTML = '<p style="color:var(--text-secondary); padding:10px 0;">Không có hồ sơ nào chờ duyệt.</p>';
    } else {
      provList.innerHTML = pending.map(p => `
        <div class="side-notice-item">
          <div class="notice-icon-box" style="background:var(--primary-light); color:var(--primary-dark);">
            ${p.name.split(' ').map(n=>n[0]).slice(-2).join('')}
          </div>
          <div class="notice-content" style="flex:1;">
            <strong>${p.name}</strong>
            <p>${p.specialty}</p>
            <small>CCCD: ${p.cccd} • ${p.date}</small>
          </div>
          <button class="btn btn-primary btn-xs" onclick="openProviderDetailModal('${p.id}')">Xét duyệt</button>
        </div>
      `).join('');
    }
  }
}

/* 2. User Management (UC-52, UC-53) */
function renderUsers(filteredList = null) {
  const tbody = document.getElementById('users-table-tbody');
  if (!tbody) return;

  const list = filteredList || STATE.users;
  const countEl = document.getElementById('users-count-info');
  if (countEl) countEl.textContent = `Hiển thị ${list.length} / ${STATE.users.length} người dùng`;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--text-secondary);">Không tìm thấy người dùng phù hợp.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(u => `
    <tr>
      <td>
        <div class="user-cell">
          <div class="avatar-sm ${u.role === 'Provider' ? 'green' : 'blue'}">
            ${u.name.split(' ').map(n=>n[0]).slice(-2).join('')}
          </div>
          <div class="user-cell-meta">
            <strong>${u.name}</strong>
            <span>${u.email}</span>
          </div>
        </div>
      </td>
      <td>
        <span class="badge ${u.role === 'Provider' ? 'badge-success' : 'badge-info'}">${u.role}</span>
      </td>
      <td>${u.phone}</td>
      <td>${u.joinDate}</td>
      <td><strong>${u.spentOrEarned}</strong></td>
      <td>
        ${u.status === 'active' 
          ? '<span class="badge badge-success"><span class="badge-dot-indicator"></span> Hoạt động</span>' 
          : `<span class="badge badge-danger"><span class="badge-dot-indicator"></span> Đã khóa (${u.lockDuration || 'Cảnh cáo'})</span>`}
      </td>
      <td style="text-align:right">
        <div class="table-actions" style="justify-content:flex-end">
          ${u.status === 'active'
            ? `<button class="btn btn-danger-outline btn-xs" onclick="openLockUserModal('${u.id}')">Khóa tài khoản</button>`
            : `<button class="btn btn-primary btn-xs" onclick="openUnlockUserModal('${u.id}')">Mở khóa</button>`}
        </div>
      </td>
    </tr>
  `).join('');
}

/* 3. Provider Approval (UC-54, UC-55, UC-56) */
function renderProviderApprovals() {
  const tbody = document.getElementById('provider-approvals-tbody');
  if (!tbody) return;

  const pending = STATE.pendingProviders.filter(p => p.status === 'pending');
  const countBadge = document.getElementById('badge-provider-pending');
  const tabBadge = document.getElementById('tab-badge-pending-providers');
  if (countBadge) countBadge.textContent = pending.length;
  if (tabBadge) tabBadge.textContent = pending.length;

  if (pending.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--text-secondary);">Tất cả hồ sơ đã được xử lý xong!</td></tr>`;
    return;
  }

  tbody.innerHTML = pending.map(p => `
    <tr>
      <td>
        <div class="user-cell">
          <div class="avatar-sm green">${p.name.split(' ').map(n=>n[0]).slice(-2).join('')}</div>
          <div class="user-cell-meta">
            <strong>${p.name}</strong>
            <span>${p.email} • ${p.phone}</span>
          </div>
        </div>
      </td>
      <td>${p.specialty}</td>
      <td><strong>${p.cccd}</strong></td>
      <td>${p.experience}</td>
      <td>${p.date}</td>
      <td><span class="badge badge-warning">Chờ thẩm định (UC-54)</span></td>
      <td style="text-align:right">
        <button class="btn btn-primary btn-sm" onclick="openProviderDetailModal('${p.id}')">
          <span>✓</span> Thẩm định hồ sơ
        </button>
      </td>
    </tr>
  `).join('');
}

function renderSkillApprovals() {
  const tbody = document.getElementById('skill-approvals-tbody');
  if (!tbody) return;

  const pending = STATE.skillApprovals.filter(s => s.status === 'pending');
  const countBadge = document.getElementById('badge-skill-pending');
  const tabBadge = document.getElementById('tab-badge-pending-skills');
  if (countBadge) countBadge.textContent = pending.length;
  if (tabBadge) tabBadge.textContent = pending.length;

  if (pending.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--text-secondary);">Không có kỹ năng nào đang chờ duyệt.</td></tr>`;
    return;
  }

  tbody.innerHTML = pending.map(s => `
    <tr>
      <td><strong>${s.providerName}</strong></td>
      <td><span class="badge badge-purple">${s.skillName}</span></td>
      <td>${s.certTitle}</td>
      <td>${s.issuer}</td>
      <td>${s.date}</td>
      <td><span class="badge badge-warning">Chờ kiểm duyệt</span></td>
      <td style="text-align:right">
        <button class="btn btn-primary btn-xs" onclick="approveSkill('${s.id}')">Duyệt & Cấp huy hiệu</button>
        <button class="btn btn-danger-outline btn-xs" onclick="rejectSkill('${s.id}')">Từ chối</button>
      </td>
    </tr>
  `).join('');
}

function renderAllProviders() {
  const tbody = document.getElementById('all-providers-tbody');
  if (!tbody) return;

  const providers = STATE.users.filter(u => u.role === 'Provider');
  tbody.innerHTML = providers.map(p => `
    <tr>
      <td>
        <div class="user-cell">
          <div class="avatar-sm green">${p.name.split(' ').map(n=>n[0]).slice(-2).join('')}</div>
          <div class="user-cell-meta">
            <strong>${p.name}</strong>
            <span>${p.email}</span>
          </div>
        </div>
      </td>
      <td>Lập trình / Thiết kế / Kỹ năng số</td>
      <td>★ 4.88 (98 đánh giá)</td>
      <td><strong>86 đơn hoàn tất</strong></td>
      <td>${p.spentOrEarned}</td>
      <td>
        ${p.status === 'active' 
          ? '<span class="badge badge-success">Đang hoạt động</span>' 
          : '<span class="badge badge-danger">Đã tạm khóa</span>'}
      </td>
      <td style="text-align:right">
        <button class="btn btn-secondary btn-xs" onclick="openLockUserModal('${p.id}')">Quản lý quyền</button>
      </td>
    </tr>
  `).join('');
}

/* 4. Services (UC-57, UC-58, UC-59) */
function renderServices() {
  // All active services
  const tbodyAll = document.getElementById('services-table-tbody');
  if (tbodyAll) {
    const activeSvcs = STATE.services.filter(s => s.status === 'active');
    tbodyAll.innerHTML = activeSvcs.map(s => `
      <tr>
        <td><strong>${s.title}</strong></td>
        <td><span class="badge badge-neutral">${s.category}</span></td>
        <td>${s.providerName}</td>
        <td><strong style="color:var(--secondary)">${s.price.toLocaleString('vi-VN')}đ</strong></td>
        <td>${s.rating}</td>
        <td><span class="badge badge-success">Đang hiển thị</span></td>
        <td style="text-align:right">
          <button class="btn btn-danger-outline btn-xs" onclick="lockService('${s.id}')">Khóa vi phạm</button>
        </td>
      </tr>
    `).join('');
  }

  // Pending new services (UC-58)
  const tbodyPending = document.getElementById('services-pending-tbody');
  const pending = STATE.services.filter(s => s.status === 'pending');
  const badgeSvc = document.getElementById('badge-service-pending');
  const tabBadgeSvc = document.getElementById('tab-badge-pending-services');
  if (badgeSvc) badgeSvc.textContent = pending.length;
  if (tabBadgeSvc) tabBadgeSvc.textContent = pending.length;

  if (tbodyPending) {
    if (pending.length === 0) {
      tbodyPending.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--text-secondary);">Không có bài đăng mới chờ duyệt.</td></tr>`;
    } else {
      tbodyPending.innerHTML = pending.map(s => `
        <tr>
          <td><strong>${s.title}</strong></td>
          <td><span class="badge badge-neutral">${s.category}</span></td>
          <td>${s.providerName}</td>
          <td><strong style="color:var(--primary)">${s.price.toLocaleString('vi-VN')}đ</strong></td>
          <td>${s.dateSubmitted || 'Hôm nay'}</td>
          <td style="text-align:right">
            <button class="btn btn-primary btn-xs" onclick="approveNewService('${s.id}')">Duyệt bài đăng</button>
            <button class="btn btn-danger-outline btn-xs" onclick="rejectNewService('${s.id}')">Từ chối</button>
          </td>
        </tr>
      `).join('');
    }
  }

  // Price change pending (UC-58)
  const tbodyPrice = document.getElementById('services-price-update-tbody');
  if (tbodyPrice) {
    const pricePending = STATE.services.filter(s => s.status === 'price_pending');
    const tabBadgePrices = document.getElementById('tab-badge-pending-prices');
    if (tabBadgePrices) tabBadgePrices.textContent = pricePending.length;

    if (pricePending.length === 0) {
      tbodyPrice.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--text-secondary);">Không có yêu cầu điều chỉnh giá nào.</td></tr>`;
    } else {
      tbodyPrice.innerHTML = pricePending.map(s => `
        <tr>
          <td><strong>${s.title}</strong></td>
          <td>${s.providerName}</td>
          <td><span style="text-decoration:line-through; color:var(--text-secondary);">${s.price.toLocaleString('vi-VN')}đ</span></td>
          <td><strong style="color:var(--primary); font-size:14px;">${s.newPrice.toLocaleString('vi-VN')}đ</strong></td>
          <td>${s.reason}</td>
          <td style="text-align:right">
            <button class="btn btn-primary btn-xs" onclick="approvePriceUpdate('${s.id}')">Duyệt giá mới</button>
            <button class="btn btn-danger-outline btn-xs" onclick="rejectPriceUpdate('${s.id}')">Từ chối</button>
          </td>
        </tr>
      `).join('');
    }
  }

  // Locked services (UC-59)
  const tbodyLocked = document.getElementById('services-locked-tbody');
  if (tbodyLocked) {
    const locked = STATE.services.filter(s => s.status === 'locked');
    tbodyLocked.innerHTML = locked.map(s => `
      <tr>
        <td><strong>${s.title}</strong></td>
        <td>${s.providerName}</td>
        <td><span style="color:var(--error); font-weight:500;">${s.lockReason}</span></td>
        <td>Admin Hệ Thống</td>
        <td>25/04/2025</td>
        <td style="text-align:right">
          <button class="btn btn-secondary btn-xs" onclick="unlockService('${s.id}')">Mở khóa lại</button>
        </td>
      </tr>
    `).join('');
  }
}

/* 5. Orders (UC-60, UC-61) */
function renderOrders(filtered = null) {
  const tbody = document.getElementById('orders-table-tbody');
  if (!tbody) return;

  const list = filtered || STATE.orders;
  tbody.innerHTML = list.map(o => `
    <tr>
      <td><strong>${o.id}</strong></td>
      <td>${o.customer}</td>
      <td>${o.provider}</td>
      <td>${o.service}</td>
      <td><strong style="color:var(--secondary)">${o.price}</strong></td>
      <td>
        <span class="badge ${o.escrowStatus === 'Đã giữ ký quỹ' ? 'badge-info' : o.escrowStatus === 'Đã giải ngân' ? 'badge-success' : o.escrowStatus === 'Tạm giữ tranh chấp' ? 'badge-danger' : 'badge-warning'}">
          ${o.escrowStatus}
        </span>
      </td>
      <td>${getStatusBadge(o.orderStatus)}</td>
      <td>${o.date}</td>
      <td style="text-align:right">
        <button class="btn btn-primary btn-xs" onclick="openOrderDetail('${o.id}')">
          <span>▤</span> Xem & Can thiệp
        </button>
      </td>
    </tr>
  `).join('');
}

/* 6. Reviews (UC-62, UC-63) */
function renderReviews(filtered = null) {
  const tbody = document.getElementById('reviews-table-tbody');
  if (!tbody) return;

  const list = filtered || STATE.reviews;
  tbody.innerHTML = list.map(r => `
    <tr>
      <td><strong>${r.customer}</strong></td>
      <td>${r.service} <br><small style="color:var(--text-secondary)">Provider: ${r.provider}</small></td>
      <td><span style="color:#F59E0B; font-weight:700;">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span></td>
      <td style="max-width:320px;">
        <p style="font-size:12.5px;">${r.content}</p>
        ${r.note ? `<small style="color:var(--error);">${r.note}</small>` : ''}
      </td>
      <td>${r.date}</td>
      <td>
        ${r.status === 'published' 
          ? '<span class="badge badge-success">Đang hiển thị</span>' 
          : '<span class="badge badge-danger">Đã ẩn vi phạm (UC-63)</span>'}
      </td>
      <td style="text-align:right">
        ${r.status === 'published'
          ? `<button class="btn btn-danger-outline btn-xs" onclick="toggleHideReview('${r.id}', true)">Ẩn đánh giá</button>`
          : `<button class="btn btn-secondary btn-xs" onclick="toggleHideReview('${r.id}', false)">Khôi phục hiển thị</button>`}
      </td>
    </tr>
  `).join('');
}

/* 7. Complaints (UC-64, UC-65) */
function renderComplaints() {
  const tbody = document.getElementById('complaints-table-tbody');
  if (!tbody) return;

  const badgeComp = document.getElementById('badge-complaint-count');
  const pendingComp = STATE.complaints.filter(c => c.status === 'pending');
  if (badgeComp) badgeComp.textContent = pendingComp.length;

  tbody.innerHTML = STATE.complaints.map(c => `
    <tr>
      <td><strong>${c.id}</strong></td>
      <td><a href="javascript:void(0)" onclick="openOrderDetail('${c.orderId}')">${c.orderId}</a></td>
      <td>${c.complainant}</td>
      <td>${c.defendant}</td>
      <td style="max-width:260px;">${c.reason}</td>
      <td>
        <span class="badge ${c.priority === 'urgent' ? 'badge-danger' : c.priority === 'high' ? 'badge-warning' : 'badge-neutral'}">
          ${c.priority.toUpperCase()}
        </span>
      </td>
      <td>
        ${c.status === 'pending'
          ? '<span class="badge badge-warning">Đang chờ phân xử</span>'
          : '<span class="badge badge-success">Đã giải quyết</span>'}
      </td>
      <td style="text-align:right">
        <button class="btn btn-primary btn-xs" onclick="openComplaintModal('${c.id}')">
          Phán quyết (UC-65)
        </button>
      </td>
    </tr>
  `).join('');
}

/* 8. Reports & Violations (UC-66, UC-67) */
function renderReports() {
  const tbody = document.getElementById('reports-violations-tbody');
  if (!tbody) return;

  tbody.innerHTML = STATE.reports.map(r => `
    <tr>
      <td><strong>${r.target}</strong></td>
      <td><span class="badge badge-danger">${r.violationType}</span></td>
      <td>${r.details}</td>
      <td>${r.reporter}</td>
      <td>${r.date}</td>
      <td><span class="badge badge-success">Đã kiểm tra</span></td>
      <td style="text-align:right">
        <button class="btn btn-secondary btn-xs" onclick="showToast('Xử lý vi phạm', 'Đã ghi nhận báo cáo và cập nhật hồ sơ cảnh cáo đối tượng', 'info')">Xem xét</button>
      </td>
    </tr>
  `).join('');
}

/* 9. Cash Flow (UC-69) */
function renderCashFlow() {
  const tbody = document.getElementById('payout-requests-tbody');
  if (!tbody) return;

  tbody.innerHTML = STATE.payouts.map(p => `
    <tr>
      <td><strong>${p.id}</strong></td>
      <td>${p.provider}</td>
      <td>${p.bank}</td>
      <td><strong>${p.account}</strong></td>
      <td><strong style="color:var(--primary); font-size:14px;">${p.amount}</strong></td>
      <td>${p.date}</td>
      <td>
        ${p.status === 'pending' 
          ? '<span class="badge badge-warning">Chờ lệnh chuyển</span>' 
          : p.status === 'paid' 
          ? '<span class="badge badge-success">Đã thanh toán</span>' 
          : '<span class="badge badge-danger">Đã từ chối</span>'}
      </td>
      <td style="text-align:right">
        ${p.status === 'pending' ? `
          <button class="btn btn-primary btn-xs" onclick="approvePayout('${p.id}')">Duyệt chuyển</button>
          <button class="btn btn-danger-outline btn-xs" onclick="rejectPayout('${p.id}')">Từ chối</button>
        ` : `<span style="color:var(--text-secondary); font-size:12px;">Đã hoàn tất</span>`}
      </td>
    </tr>
  `).join('');
}

/* 10. Packages (UC-70) */
function renderPackages() {
  const container = document.getElementById('packages-cards-container');
  if (container) {
    container.innerHTML = STATE.packages.map(pkg => `
      <div class="package-card ${pkg.highlight ? 'highlight' : ''}">
        ${pkg.badgeText ? `<span class="package-tag">${pkg.badgeText}</span>` : ''}
        <div class="package-header">
          <h3>${pkg.name}</h3>
          <p>Thời hạn: ${pkg.duration} ngày • Tối đa ${pkg.postsCount} bài đăng</p>
        </div>
        <div class="package-price">
          <strong>${pkg.price === 0 ? 'Miễn phí' : pkg.price.toLocaleString('vi-VN') + 'đ'}</strong>
          ${pkg.price > 0 ? '<span>/ tháng</span>' : ''}
        </div>
        <ul class="package-features">
          ${pkg.features.map(f => `<li><span class="check-icon">✓</span> ${f}</li>`).join('')}
        </ul>
        <button class="btn ${pkg.highlight ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="editPackage('${pkg.id}')">
          Cấu hình quyền lợi
        </button>
      </div>
    `).join('');
  }

  // Purchases history
  const tbodyPurchases = document.getElementById('package-purchases-tbody');
  if (tbodyPurchases) {
    tbodyPurchases.innerHTML = STATE.packagePurchases.map(p => `
      <tr>
        <td><strong>${p.id}</strong></td>
        <td>${p.provider}</td>
        <td><span class="badge badge-purple">${p.packageName}</span></td>
        <td><strong style="color:var(--secondary)">${p.amount}</strong></td>
        <td>${p.activeDate}</td>
        <td>${p.expireDate}</td>
        <td><span class="badge badge-success">${p.status}</span></td>
      </tr>
    `).join('');
  }
}

// ============================================================================
// HELPER FUNCTIONS & ACTIONS
// ============================================================================
function getStatusBadge(status) {
  switch (status) {
    case 'processing': return '<span class="badge badge-info">Đang thực hiện</span>';
    case 'confirmed': return '<span class="badge badge-success">Đã xác nhận</span>';
    case 'pending': return '<span class="badge badge-warning">Chờ xử lý</span>';
    case 'completed': return '<span class="badge badge-success">Hoàn thành</span>';
    case 'disputed': return '<span class="badge badge-danger">Khiếu nại / Tranh chấp</span>';
    case 'cancelled': return '<span class="badge badge-danger">Đã hủy</span>';
    default: return `<span class="badge badge-neutral">${status}</span>`;
  }
}

// ============================================================================
// MODAL ACTIONS (UC-52 -> UC-70)
// ============================================================================

/* Modal Control */
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('active');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('active');
}

/* UC-53: Lock User */
let targetLockUserId = null;
function openLockUserModal(userId) {
  const user = STATE.users.find(u => u.id === userId);
  if (!user) return;

  targetLockUserId = userId;
  document.getElementById('lock-target-name').textContent = `${user.name} (${user.role})`;
  document.getElementById('lock-reason-input').value = '';
  openModal('modal-lock-user');
}

/* UC-53: Unlock User */
let targetUnlockUserId = null;
function openUnlockUserModal(userId) {
  const user = STATE.users.find(u => u.id === userId);
  if (!user) return;

  targetUnlockUserId = userId;
  document.getElementById('unlock-target-name').textContent = `${user.name} (${user.role})`;
  openModal('modal-unlock-user');
}

/* UC-55: Provider Approval Modal */
let activeApprovalId = null;
function openProviderDetailModal(appId) {
  const prov = STATE.pendingProviders.find(p => p.id === appId);
  if (!prov) return;

  activeApprovalId = appId;
  const body = document.getElementById('modal-provider-detail-body');
  body.innerHTML = `
    <div style="margin-bottom:16px;">
      <h4 style="font-size:15px; color:var(--secondary);">${prov.name}</h4>
      <p style="color:var(--text-secondary);">${prov.specialty} • ${prov.email} • ${prov.phone}</p>
    </div>

    <div class="dispute-box" style="margin-bottom:16px;">
      <div>
        <span class="form-label">Kinh nghiệm thực tế</span>
        <p>${prov.experience}</p>
      </div>
      <div>
        <span class="form-label">Chứng chỉ chuyên môn</span>
        <p>${prov.cert}</p>
      </div>
    </div>

    <div class="form-group">
      <span class="form-label">Giấy tờ tùy thân CCCD / Hộ chiếu (Thẩm định pháp lý)</span>
      <div class="id-card-preview">
        <div class="id-card-side">
          <strong>[MẶT TRƯỚC CCCD]</strong>
          <span>Số: ${prov.cccd}</span>
          <p style="color:var(--primary); margin-top:6px;">✓ Đã xác thực OCR hợp lệ</p>
        </div>
        <div class="id-card-side">
          <strong>[MẶT SAU CCCD]</strong>
          <span>Đặc điểm nhận dạng</span>
          <p style="color:var(--primary); margin-top:6px;">✓ Dấu vân tay & chip bảo mật</p>
        </div>
      </div>
    </div>

    <div class="form-group">
      <label class="form-label">Ghi chú thẩm định của Quản trị viên</label>
      <input type="text" class="form-control" id="provider-review-note" value="Hồ sơ nhân thân và bằng cấp đầy đủ, đạt tiêu chuẩn gia nhập sàn.">
    </div>
  `;
  openModal('modal-provider-detail');
}

/* UC-61: Order Detail Modal */
function openOrderDetail(orderId) {
  const order = STATE.orders.find(o => o.id === orderId);
  if (!order) return;

  const body = document.getElementById('modal-order-detail-body');
  body.innerHTML = `
    <div style="display:flex; justify-content:space-between; margin-bottom:18px;">
      <div>
        <h4 style="font-size:16px; color:var(--secondary);">Đơn hàng: ${order.id}</h4>
        <p style="color:var(--text-secondary);">${order.service}</p>
      </div>
      <div>
        ${getStatusBadge(order.orderStatus)}
      </div>
    </div>

    <div class="dispute-box">
      <div>
        <span class="form-label">Khách hàng thuê dịch vụ</span>
        <strong style="color:var(--secondary)">${order.customer}</strong>
        <p style="color:var(--text-secondary); font-size:11px;">Đã thanh toán ký quỹ Escrow</p>
      </div>
      <div>
        <span class="form-label">Provider cung cấp kỹ năng</span>
        <strong style="color:var(--secondary)">${order.provider}</strong>
        <p style="color:var(--text-secondary); font-size:11px;">Hạn chót bàn giao: ${order.deadline}</p>
      </div>
    </div>

    <div style="background:#F8FAFC; border:1px solid var(--border); border-radius:8px; padding:14px; margin:16px 0;">
      <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
        <span>Tổng giá trị hợp đồng:</span>
        <strong style="font-size:15px; color:var(--secondary);">${order.price}</strong>
      </div>
      <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
        <span>Trạng thái tài khoản ký quỹ (Escrow):</span>
        <strong style="color:var(--primary);">${order.escrowStatus}</strong>
      </div>
      <div style="display:flex; justify-content:space-between;">
        <span>Phí nền tảng bảo đảm giao dịch (10%):</span>
        <span>10% (Sẽ khấu trừ khi hoàn tất)</span>
      </div>
    </div>

    <p style="color:var(--text-secondary); font-size:12px;">
      * Lưu ý: Quyền can thiệp chỉ dùng khi phát hiện vi phạm hợp đồng hoặc theo phán quyết giải quyết khiếu nại tranh chấp (UC-61).
    </p>
  `;

  document.getElementById('order-cancel-btn').onclick = () => {
    order.orderStatus = 'cancelled';
    order.escrowStatus = 'Đã hoàn tiền';
    closeModal('modal-order-detail');
    renderOrders();
    renderDashboard();
    showToast('Can thiệp đơn hàng thành công', `Đơn ${order.id} đã được hủy cưỡng chế và hoàn tiền Escrow cho khách.`, 'warning');
  };

  openModal('modal-order-detail');
}

/* UC-65: Complaint Dispute Resolution */
let activeComplaintId = null;
function openComplaintModal(complaintId) {
  const comp = STATE.complaints.find(c => c.id === complaintId);
  if (!comp) return;

  activeComplaintId = complaintId;
  const body = document.getElementById('modal-complaint-detail-body');
  body.innerHTML = `
    <div style="margin-bottom:14px;">
      <h4>Khiếu nại: ${comp.id} (Đơn hàng ${comp.orderId})</h4>
      <p style="color:var(--error); font-weight:600;">Lý do: ${comp.reason}</p>
      <p style="color:var(--text-secondary); margin-top:2px;">Số tiền tranh chấp: <strong>${comp.amount}</strong></p>
    </div>

    <div class="dispute-box">
      <div class="party-statement">
        <h4><span>👤</span> Lời khai Bên khiếu nại (${comp.complainant})</h4>
        <p>${comp.userClaim}</p>
        <div class="evidence-thumb-row">
          <div class="evidence-thumb" onclick="showToast('Xem chứng cứ', 'Mở ảnh hiện trường vỡ bình gốm sứ', 'info')">[Ảnh chụp 1]</div>
          <div class="evidence-thumb" onclick="showToast('Xem chứng cứ', 'Mở đoạn tin nhắn trao đổi', 'info')">[Tin nhắn]</div>
        </div>
      </div>

      <div class="party-statement">
        <h4><span>⚒</span> Lời khai Bên bị khiếu nại (${comp.defendant})</h4>
        <p>${comp.providerClaim}</p>
        <div class="evidence-thumb-row">
          <div class="evidence-thumb" onclick="showToast('Xem chứng cứ', 'Ảnh xác nhận hoàn thành tầng 1 & 2', 'info')">[Ảnh dọn dẹp]</div>
        </div>
      </div>
    </div>

    <div class="form-group">
      <label class="form-label">Biên bản phán quyết của Quản trị viên</label>
      <input type="text" class="form-control" id="complaint-decision-note" value="Dựa trên biên bản hiện trường và đối soát bằng chứng giữa hai bên">
    </div>
  `;

  openModal('modal-complaint-detail');
}

/* UC-70: Package Edit / Create */
function openPackageModal(pkgId = null) {
  document.getElementById('package-id-input').value = pkgId || '';
  if (pkgId) {
    const pkg = STATE.packages.find(p => p.id === pkgId);
    if (pkg) {
      document.getElementById('modal-package-title').textContent = 'Chỉnh sửa Gói Đăng Tin (UC-70)';
      document.getElementById('package-name-input').value = pkg.name;
      document.getElementById('package-price-input').value = pkg.price;
      document.getElementById('package-duration-input').value = pkg.duration;
      document.getElementById('package-posts-input').value = pkg.postsCount;
      document.getElementById('package-features-input').value = pkg.features.join(', ');
    }
  } else {
    document.getElementById('modal-package-title').textContent = 'Thêm Gói Đăng Tin Mới (UC-70)';
    document.getElementById('package-name-input').value = '';
    document.getElementById('package-price-input').value = '';
    document.getElementById('package-duration-input').value = 30;
    document.getElementById('package-posts-input').value = 10;
    document.getElementById('package-features-input').value = 'Huy hiệu chuyên nghiệp, Đẩy tin Top tuần';
  }
  openModal('modal-package-form');
}

function editPackage(pkgId) {
  openPackageModal(pkgId);
}

// ============================================================================
// EVENT LISTENERS & ACTION HANDLERS
// ============================================================================
function setupEventListeners() {
  // Confirm Lock User (UC-53)
  const confirmLockBtn = document.getElementById('confirm-lock-btn');
  if (confirmLockBtn) {
    confirmLockBtn.addEventListener('click', () => {
      if (!targetLockUserId) return;
      const user = STATE.users.find(u => u.id === targetLockUserId);
      const reason = document.getElementById('lock-reason-input').value.trim() || 'Vi phạm điều khoản hoạt động';
      const duration = document.getElementById('lock-duration-select').value;
      const durationText = duration === 'permanent' ? 'Vĩnh viễn' : `${duration} ngày`;

      if (user) {
        user.status = 'locked';
        user.lockReason = reason;
        user.lockDuration = durationText;
        renderUsers();
        closeModal('modal-lock-user');
        showToast('Khóa tài khoản thành công', `Tài khoản ${user.name} đã bị khóa (${durationText}). Lý do: ${reason}`, 'warning');
      }
    });
  }

  // Confirm Unlock User (UC-53)
  const confirmUnlockBtn = document.getElementById('confirm-unlock-btn');
  if (confirmUnlockBtn) {
    confirmUnlockBtn.addEventListener('click', () => {
      if (!targetUnlockUserId) return;
      const user = STATE.users.find(u => u.id === targetUnlockUserId);
      if (user) {
        user.status = 'active';
        user.lockReason = '';
        renderUsers();
        closeModal('modal-unlock-user');
        showToast('Mở khóa tài khoản thành công', `Tài khoản ${user.name} đã được khôi phục quyền truy cập đầy đủ.`, 'success');
      }
    });
  }

  // Provider Approval Actions (UC-55)
  const approveProvBtn = document.getElementById('provider-approve-btn');
  if (approveProvBtn) {
    approveProvBtn.addEventListener('click', () => {
      const prov = STATE.pendingProviders.find(p => p.id === activeApprovalId);
      if (prov) {
        prov.status = 'approved';
        // Add to users list if not exists
        STATE.users.unshift({
          id: 'USR' + Math.floor(100 + Math.random() * 900),
          name: prov.name,
          email: prov.email,
          phone: prov.phone,
          role: 'Provider',
          joinDate: 'Hôm nay',
          spentOrEarned: '0đ',
          status: 'active',
          lockReason: ''
        });
        renderProviderApprovals();
        renderAllProviders();
        renderUsers();
        renderDashboard();
        closeModal('modal-provider-detail');
        showToast('Phê duyệt Provider thành công', `Hồ sơ của ${prov.name} đã được duyệt và cấp quyền nhận việc!`, 'success');
      }
    });
  }

  const rejectProvBtn = document.getElementById('provider-reject-btn');
  if (rejectProvBtn) {
    rejectProvBtn.addEventListener('click', () => {
      const prov = STATE.pendingProviders.find(p => p.id === activeApprovalId);
      if (prov) {
        prov.status = 'rejected';
        renderProviderApprovals();
        renderDashboard();
        closeModal('modal-provider-detail');
        showToast('Từ chối hồ sơ Provider', `Đã gửi thông báo yêu cầu bổ sung hồ sơ tới ${prov.name}.`, 'warning');
      }
    });
  }

  // Complaint Decisions (UC-65)
  document.getElementById('complaint-refund-btn').addEventListener('click', () => {
    resolveComplaint('Hoàn tiền 100% cho Khách hàng', 'success');
  });
  document.getElementById('complaint-split-btn').addEventListener('click', () => {
    resolveComplaint('Bồi thường chia đôi 50 / 50', 'warning');
  });
  document.getElementById('complaint-provider-btn').addEventListener('click', () => {
    resolveComplaint('Bác bỏ khiếu nại & Giải ngân tiền cho Provider', 'info');
  });

  // Save Package (UC-70)
  const savePkgBtn = document.getElementById('save-package-btn');
  if (savePkgBtn) {
    savePkgBtn.addEventListener('click', () => {
      const pkgId = document.getElementById('package-id-input').value;
      const name = document.getElementById('package-name-input').value.trim();
      const price = parseInt(document.getElementById('package-price-input').value) || 0;
      const duration = parseInt(document.getElementById('package-duration-input').value) || 30;
      const postsCount = parseInt(document.getElementById('package-posts-input').value) || 10;
      const featuresStr = document.getElementById('package-features-input').value.trim();
      const features = featuresStr.split(',').map(f => f.trim()).filter(Boolean);

      if (!name) {
        alert('Vui lòng nhập tên gói đăng tin');
        return;
      }

      if (pkgId) {
        const pkg = STATE.packages.find(p => p.id === pkgId);
        if (pkg) {
          pkg.name = name;
          pkg.price = price;
          pkg.duration = duration;
          pkg.postsCount = postsCount;
          pkg.features = features;
        }
      } else {
        STATE.packages.push({
          id: 'PKG_' + Date.now(),
          name,
          price,
          duration,
          postsCount,
          features,
          highlight: false
        });
      }

      renderPackages();
      closeModal('modal-package-form');
      showToast('Lưu gói thành công', `Đã cập nhật cấu hình gói: ${name}`, 'success');
    });
  }

  // Search & Filter Events
  setupFilterEvents();
}

function resolveComplaint(decisionText, toastType) {
  const comp = STATE.complaints.find(c => c.id === activeComplaintId);
  if (comp) {
    comp.status = 'resolved';
    const order = STATE.orders.find(o => o.id === comp.orderId);
    if (order) {
      if (decisionText.includes('Hoàn tiền 100%')) {
        order.escrowStatus = 'Đã hoàn tiền';
        order.orderStatus = 'cancelled';
      } else if (decisionText.includes('Giải ngân')) {
        order.escrowStatus = 'Đã giải ngân';
        order.orderStatus = 'completed';
      } else {
        order.escrowStatus = 'Đã hoàn tất bồi thường';
      }
    }
    renderComplaints();
    renderOrders();
    closeModal('modal-complaint-detail');
    showToast('Phán quyết giải quyết tranh chấp (UC-65)', `Kết quả: ${decisionText}. Đã gửi biên bản cho cả 2 bên.`, toastType);
  }
}

/* User Filter Handlers */
function setupFilterEvents() {
  const userSearch = document.getElementById('user-search-input');
  const userRole = document.getElementById('user-role-filter');
  const userStatus = document.getElementById('user-status-filter');

  const filterUsers = () => {
    const q = (userSearch?.value || '').toLowerCase();
    const r = userRole?.value || 'all';
    const s = userStatus?.value || 'all';

    const filtered = STATE.users.filter(u => {
      const matchQ = u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.phone.includes(q) || u.id.toLowerCase().includes(q);
      const matchR = r === 'all' || u.role === r;
      const matchS = s === 'all' || u.status === s;
      return matchQ && matchR && matchS;
    });
    renderUsers(filtered);
  };

  if (userSearch) userSearch.addEventListener('input', filterUsers);
  if (userRole) userRole.addEventListener('change', filterUsers);
  if (userStatus) userStatus.addEventListener('change', filterUsers);

  // Global search input
  const globalSearch = document.getElementById('global-search-input');
  if (globalSearch) {
    globalSearch.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = globalSearch.value.trim().toLowerCase();
        if (val) {
          switchView('view-users');
          const input = document.getElementById('user-search-input');
          if (input) {
            input.value = val;
            input.dispatchEvent(new Event('input'));
          }
        }
      }
    });
  }

  // Order status filter
  const orderFilter = document.getElementById('order-status-filter');
  const orderSearch = document.getElementById('order-search-input');
  const filterOrders = () => {
    const q = (orderSearch?.value || '').toLowerCase();
    const st = orderFilter?.value || 'all';
    const filtered = STATE.orders.filter(o => {
      const matchQ = o.id.toLowerCase().includes(q) || o.customer.toLowerCase().includes(q) || o.provider.toLowerCase().includes(q) || o.service.toLowerCase().includes(q);
      const matchSt = st === 'all' || o.orderStatus === st;
      return matchQ && matchSt;
    });
    renderOrders(filtered);
  };
  if (orderFilter) orderFilter.addEventListener('change', filterOrders);
  if (orderSearch) orderSearch.addEventListener('input', filterOrders);

  // Review filters
  const reviewRating = document.getElementById('review-rating-filter');
  const reviewStatus = document.getElementById('review-status-filter');
  const reviewSearch = document.getElementById('review-search-input');
  const filterReviews = () => {
    const q = (reviewSearch?.value || '').toLowerCase();
    const ratingVal = reviewRating?.value || 'all';
    const st = reviewStatus?.value || 'all';

    const filtered = STATE.reviews.filter(r => {
      const matchQ = r.content.toLowerCase().includes(q) || r.customer.toLowerCase().includes(q) || r.provider.toLowerCase().includes(q);
      const matchRating = ratingVal === 'all' || r.rating === parseInt(ratingVal);
      const matchSt = st === 'all' || r.status === st;
      return matchQ && matchRating && matchSt;
    });
    renderReviews(filtered);
  };
  if (reviewRating) reviewRating.addEventListener('change', filterReviews);
  if (reviewStatus) reviewStatus.addEventListener('change', filterReviews);
  if (reviewSearch) reviewSearch.addEventListener('input', filterReviews);

  // Service filters (UC-57)
  const serviceSearch = document.getElementById('service-search-input');
  const serviceCat = document.getElementById('service-cat-filter');
  const filterServices = () => {
    const q = (serviceSearch?.value || '').toLowerCase();
    const cat = serviceCat?.value || 'all';
    const filtered = STATE.services.filter(s => s.status === 'active').filter(s => {
      const matchQ = s.title.toLowerCase().includes(q) || s.providerName.toLowerCase().includes(q);
      const matchCat = cat === 'all' || s.category === cat;
      return matchQ && matchCat;
    });
    const tbodyAll = document.getElementById('services-table-tbody');
    if (tbodyAll) {
      if (filtered.length === 0) {
        tbodyAll.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:var(--text-secondary);">Không tìm thấy dịch vụ phù hợp.</td></tr>`;
      } else {
        tbodyAll.innerHTML = filtered.map(s => `
          <tr>
            <td><strong>${s.title}</strong></td>
            <td><span class="badge badge-neutral">${s.category}</span></td>
            <td>${s.providerName}</td>
            <td><strong style="color:var(--secondary)">${s.price.toLocaleString('vi-VN')}đ</strong></td>
            <td>${s.rating}</td>
            <td><span class="badge badge-success">Đang hiển thị</span></td>
            <td style="text-align:right">
              <button class="btn btn-danger-outline btn-xs" onclick="lockService('${s.id}')">Khóa vi phạm</button>
            </td>
          </tr>
        `).join('');
      }
    }
  };
  if (serviceSearch) serviceSearch.addEventListener('input', filterServices);
  if (serviceCat) serviceCat.addEventListener('change', filterServices);

  // Complaint filters (UC-64)
  const complaintSearch = document.getElementById('complaint-search-input');
  const complaintPriority = document.getElementById('complaint-priority-filter');
  const complaintStatus = document.getElementById('complaint-status-filter');
  const filterComplaints = () => {
    const q = (complaintSearch?.value || '').toLowerCase();
    const prio = complaintPriority?.value || 'all';
    const st = complaintStatus?.value || 'all';
    const filtered = STATE.complaints.filter(c => {
      const matchQ = c.id.toLowerCase().includes(q) || c.orderId.toLowerCase().includes(q) || c.complainant.toLowerCase().includes(q) || c.defendant.toLowerCase().includes(q) || c.reason.toLowerCase().includes(q);
      const matchPrio = prio === 'all' || c.priority === prio;
      const matchSt = st === 'all' || c.status === st;
      return matchQ && matchPrio && matchSt;
    });
    const tbody = document.getElementById('complaints-table-tbody');
    if (tbody) {
      if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px; color:var(--text-secondary);">Không có khiếu nại phù hợp.</td></tr>`;
      } else {
        tbody.innerHTML = filtered.map(c => `
          <tr>
            <td><strong>${c.id}</strong></td>
            <td><a href="javascript:void(0)" onclick="openOrderDetail('${c.orderId}')">${c.orderId}</a></td>
            <td>${c.complainant}</td>
            <td>${c.defendant}</td>
            <td style="max-width:260px;">${c.reason}</td>
            <td>
              <span class="badge ${c.priority === 'urgent' ? 'badge-danger' : c.priority === 'high' ? 'badge-warning' : 'badge-neutral'}">
                ${c.priority.toUpperCase()}
              </span>
            </td>
            <td>
              ${c.status === 'pending'
                ? '<span class="badge badge-warning">Đang chờ phân xử</span>'
                : '<span class="badge badge-success">Đã giải quyết</span>'}
            </td>
            <td style="text-align:right">
              <button class="btn btn-primary btn-xs" onclick="openComplaintModal('${c.id}')">
                Phán quyết (UC-65)
              </button>
            </td>
          </tr>
        `).join('');
      }
    }
  };
  if (complaintSearch) complaintSearch.addEventListener('input', filterComplaints);
  if (complaintPriority) complaintPriority.addEventListener('change', filterComplaints);
  if (complaintStatus) complaintStatus.addEventListener('change', filterComplaints);
}

function resetUserFilter() {
  const userSearch = document.getElementById('user-search-input');
  const userRole = document.getElementById('user-role-filter');
  const userStatus = document.getElementById('user-status-filter');
  if (userSearch) userSearch.value = '';
  if (userRole) userRole.value = 'all';
  if (userStatus) userStatus.value = 'all';
  renderUsers();
}

function applyUserQuickFilter(mode) {
  const userStatus = document.getElementById('user-status-filter');
  if (mode === 'locked' && userStatus) {
    userStatus.value = 'locked';
    userStatus.dispatchEvent(new Event('change'));
  } else if (mode === 'unlock-requests' && userStatus) {
    userStatus.value = 'locked';
    userStatus.dispatchEvent(new Event('change'));
    showToast('Yêu cầu mở khóa (UC-53)', 'Hiển thị danh sách các tài khoản đang bị khóa gửi yêu cầu khiếu nại', 'info');
  } else {
    resetUserFilter();
  }
}

/* Individual Quick Handlers */
function approveSkill(skillId) {
  const skill = STATE.skillApprovals.find(s => s.id === skillId);
  if (skill) {
    skill.status = 'approved';
    renderSkillApprovals();
    showToast('Duyệt kỹ năng thành công (UC-56)', `Đã cấp huy hiệu "Verified Skill" cho ${skill.providerName} (${skill.skillName})`, 'success');
  }
}

function rejectSkill(skillId) {
  const skill = STATE.skillApprovals.find(s => s.id === skillId);
  if (skill) {
    skill.status = 'rejected';
    renderSkillApprovals();
    showToast('Từ chối kỹ năng', `Đã từ chối cấp chứng nhận cho ${skill.skillName}`, 'warning');
  }
}

function approveNewService(svcId) {
  const svc = STATE.services.find(s => s.id === svcId);
  if (svc) {
    svc.status = 'active';
    renderServices();
    showToast('Duyệt bài đăng dịch vụ (UC-58)', `Dịch vụ "${svc.title}" đã được hiển thị trên sàn!`, 'success');
  }
}

function rejectNewService(svcId) {
  const svc = STATE.services.find(s => s.id === svcId);
  if (svc) {
    svc.status = 'rejected';
    renderServices();
    showToast('Từ chối dịch vụ', `Đã yêu cầu chỉnh sửa nội dung bài đăng "${svc.title}"`, 'warning');
  }
}

function approvePriceUpdate(svcId) {
  const svc = STATE.services.find(s => s.id === svcId);
  if (svc) {
    svc.price = svc.newPrice;
    svc.status = 'active';
    renderServices();
    showToast('Duyệt điều chỉnh giá (UC-58)', `Đã áp dụng mức giá mới ${svc.price.toLocaleString('vi-VN')}đ cho dịch vụ!`, 'success');
  }
}

function rejectPriceUpdate(svcId) {
  const svc = STATE.services.find(s => s.id === svcId);
  if (svc) {
    svc.status = 'active';
    renderServices();
    showToast('Từ chối điều chỉnh giá', `Đã giữ nguyên bảng giá hiện tại cho dịch vụ`, 'info');
  }
}

function lockService(svcId) {
  const svc = STATE.services.find(s => s.id === svcId);
  if (svc) {
    const reason = prompt('Nhập lý do khóa dịch vụ vi phạm:', 'Nội dung dịch vụ vi phạm chính sách cộng đồng');
    if (reason) {
      svc.status = 'locked';
      svc.lockReason = reason;
      renderServices();
      showToast('Khóa dịch vụ vi phạm (UC-59)', `Đã gỡ bỏ dịch vụ "${svc.title}" khỏi sàn.`, 'warning');
    }
  }
}

function unlockService(svcId) {
  const svc = STATE.services.find(s => s.id === svcId);
  if (svc) {
    svc.status = 'active';
    svc.lockReason = '';
    renderServices();
    showToast('Mở khóa dịch vụ', `Dịch vụ "${svc.title}" đã được kích hoạt hiển thị trở lại.`, 'success');
  }
}

function toggleHideReview(revId, hide) {
  const rev = STATE.reviews.find(r => r.id === revId);
  if (rev) {
    rev.status = hide ? 'hidden' : 'published';
    if (hide) rev.note = 'Đã bị ẩn do vi phạm tiêu chuẩn đánh giá';
    renderReviews();
    showToast(hide ? 'Đã ẩn đánh giá vi phạm (UC-63)' : 'Đã khôi phục đánh giá', hide ? 'Đánh giá đã được gỡ khỏi trang công khai.' : 'Đánh giá đã hiển thị trở lại bình thường.', hide ? 'warning' : 'success');
  }
}

function approvePayout(payoutId) {
  const p = STATE.payouts.find(x => x.id === payoutId);
  if (p) {
    p.status = 'paid';
    renderCashFlow();
    showToast('Duyệt lệnh rút tiền (UC-69)', `Đã duyệt giải ngân ${p.amount} tới STK ${p.account} (${p.bank}) của ${p.provider}!`, 'success');
  }
}

function rejectPayout(payoutId) {
  const p = STATE.payouts.find(x => x.id === payoutId);
  if (p) {
    p.status = 'rejected';
    renderCashFlow();
    showToast('Từ chối lệnh rút tiền', `Lệnh rút ${p.id} đã bị từ chối và hoàn tiền về ví Provider.`, 'error');
  }
}

/* UC-67: Export Data Simulation */
function exportDataSimulation(filename) {
  showToast('Xuất báo cáo (UC-67)', `Đang tạo và tải tệp [${filename}.xlsx]... Vui lòng đợi trong giây lát.`, 'info');
  setTimeout(() => {
    // Generate simulated CSV download
    const csvContent = "data:text/csv;charset=utf-8,ID,Tieu_De,Thoi_Gian,Trang_Thai\n1,Bao_Cao_He_Thong," + new Date().toLocaleDateString() + ",Thanh_Cong";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${filename}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Tải dữ liệu hoàn tất', `Tệp báo cáo ${filename}.csv đã được lưu thành công vào máy của bạn!`, 'success');
  }, 1000);
}

// ============================================================================
// TOAST NOTIFICATION COMPONENT
// ============================================================================
function showToast(title, message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

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
