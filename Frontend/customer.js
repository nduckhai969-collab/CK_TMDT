/**
 * SkillRental Platform - Customer Client Library
 * customer.js: API Helpers, LocalStorage State, Toast Notifications, Session Sync
 */

const API_BASE = ''; // Same origin

// Current session key
const SESSION_KEY = 'SKILLRENTAL_CURRENT_USER';

// Get current active user (default to USR003: Lê Hoàng Long - Customer)
function getCurrentCustomer() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('Cannot read session:', e);
  }
  return {
    id: 'USR003',
    name: 'Lê Hoàng Long',
    email: 'long.le@example.com',
    phone: '0988 776 655',
    role: 'Customer',
    balance: 15000000,
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150'
  };
}

function setCurrentCustomer(user) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

// API Request Wrapper with fallback
async function apiRequest(endpoint, options = {}) {
  try {
    const user = getCurrentCustomer();
    const headers = {
      'Content-Type': 'application/json',
      'x-user-id': user.id,
      ...(options.headers || {})
    };

    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers
    });
    return await res.json();
  } catch (err) {
    console.error(`API Error on ${endpoint}:`, err);
    return { success: false, message: 'Không thể kết nối đến máy chủ. Đang dùng dữ liệu cục bộ.' };
  }
}

// Toast notification helper
function showToast(title, message, type = 'success') {
  let toastContainer = document.getElementById('toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.style.cssText = `
      position: fixed;
      top: 24px;
      right: 24px;
      z-index: 99999;
      display: flex;
      flex-direction: column;
      gap: 12px;
      pointer-events: none;
    `;
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  const icon = type === 'success' ? 'fa-circle-check' : (type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-info');
  const color = type === 'success' ? '#16A34A' : (type === 'error' ? '#EF4444' : '#3B82F6');
  const bg = type === 'success' ? '#DCFCE7' : (type === 'error' ? '#FEE2E2' : '#DBEAFE');

  toast.style.cssText = `
    min-width: 320px;
    max-width: 420px;
    background: #FFFFFF;
    border: 1px solid #E2E8F0;
    border-left: 5px solid ${color};
    box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.15);
    border-radius: 10px;
    padding: 14px 16px;
    display: flex;
    align-items: flex-start;
    gap: 12px;
    pointer-events: auto;
    animation: toastIn 0.25s ease-out;
    font-family: 'Inter', sans-serif;
  `;

  toast.innerHTML = `
    <div style="width:28px; height:28px; border-radius:50%; background:${bg}; color:${color}; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
      <i class="fa-solid ${icon}"></i>
    </div>
    <div style="flex:1;">
      <div style="font-weight:700; font-size:14px; color:#0F172A; margin-bottom:2px;">${title}</div>
      <div style="font-size:13px; color:#475569; line-height:1.4;">${message}</div>
    </div>
    <button style="border:none; background:transparent; color:#94A3B8; cursor:pointer; font-size:14px; padding:2px;" onclick="this.parentElement.remove()">
      <i class="fa-solid fa-xmark"></i>
    </button>
  `;

  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Format currency
function formatVND(amount) {
  if (typeof amount === 'string' && amount.includes('đ')) return amount;
  const num = Number(amount) || 0;
  return num.toLocaleString('vi-VN') + 'đ';
}

// Category Badge Helper
function getCategoryBadge(cat) {
  const map = {
    'IT': { label: 'Lập trình & IT', bg: '#EFF6FF', color: '#1D4ED8', icon: 'fa-code' },
    'Design': { label: 'Thiết kế Đồ họa', bg: '#FDF2F8', color: '#BE185D', icon: 'fa-palette' },
    'Tutor': { label: 'Gia sư & Đào tạo', bg: '#FEF3C7', color: '#B45309', icon: 'fa-graduation-cap' },
    'Repair': { label: 'Sửa chữa điện tử', bg: '#FEF2F2', color: '#B91C1C', icon: 'fa-screwdriver-wrench' },
    'Home': { label: 'Dọn dẹp nhà cửa', bg: '#ECFDF5', color: '#047857', icon: 'fa-broom' }
  };
  const item = map[cat] || { label: cat || 'Kỹ năng', bg: '#F1F5F9', color: '#475569', icon: 'fa-bolt' };
  return `<span style="background:${item.bg}; color:${item.color}; font-size:12px; font-weight:600; padding:4px 10px; border-radius:9999px; display:inline-flex; align-items:center; gap:5px;">
    <i class="fa-solid ${item.icon}"></i> ${item.label}
  </span>`;
}

// Top Navbar Component Generator for Customer Pages
function renderCustomerNavbar(activePage = 'home') {
  const user = getCurrentCustomer();
  return `
    <header class="customer-navbar" style="background:#FFFFFF; border-bottom:1px solid #E2E8F0; position:sticky; top:0; z-index:1000; box-shadow:0 1px 3px rgba(0,0,0,0.03);">
      <div style="max-width:1280px; margin:0 auto; padding:12px 24px; display:flex; align-items:center; justify-content:space-between; gap:20px;">
        
        <!-- Brand Logo -->
        <a href="customer.html" style="display:flex; align-items:center; gap:10px; text-decoration:none;">
          <div style="width:38px; height:38px; border-radius:10px; background:linear-gradient(135deg, #16A34A 0%, #15803D 100%); color:#FFF; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:18px; box-shadow:0 2px 8px rgba(22,163,74,0.3);">
            SR
          </div>
          <div>
            <div style="font-weight:800; font-size:17px; color:#0F172A; letter-spacing:-0.5px;">SkillRental</div>
            <div style="font-size:11px; color:#16A34A; font-weight:600; text-transform:uppercase; letter-spacing:0.5px;">Khách Hàng (Customer)</div>
          </div>
        </a>

        <!-- Main Navigation Links -->
        <nav style="display:flex; align-items:center; gap:8px;">
          <a href="customer.html" class="nav-tab ${activePage === 'home' ? 'active' : ''}" style="padding:8px 14px; border-radius:8px; font-weight:600; font-size:13.5px; text-decoration:none; color:${activePage === 'home' ? '#16A34A' : '#475569'}; background:${activePage === 'home' ? '#DCFCE7' : 'transparent'}; display:flex; align-items:center; gap:6px;">
            <i class="fa-solid fa-compass"></i> Khám Phá
          </a>
          <a href="customer_requests.html" class="nav-tab ${activePage === 'requests' ? 'active' : ''}" style="padding:8px 14px; border-radius:8px; font-weight:600; font-size:13.5px; text-decoration:none; color:${activePage === 'requests' ? '#16A34A' : '#475569'}; background:${activePage === 'requests' ? '#DCFCE7' : 'transparent'}; display:flex; align-items:center; gap:6px;">
            <i class="fa-solid fa-bullhorn"></i> Đăng Tìm Chuyên Gia
          </a>
          <a href="customer_orders.html" class="nav-tab ${activePage === 'orders' ? 'active' : ''}" style="padding:8px 14px; border-radius:8px; font-weight:600; font-size:13.5px; text-decoration:none; color:${activePage === 'orders' ? '#16A34A' : '#475569'}; background:${activePage === 'orders' ? '#DCFCE7' : 'transparent'}; display:flex; align-items:center; gap:6px; position:relative;">
            <i class="fa-solid fa-shield-halved"></i> Đơn Hàng & Ký Quỹ Escrow
            <span class="escrow-badge" style="background:#16A34A; color:#FFF; font-size:10px; font-weight:700; padding:1px 6px; border-radius:9999px;">100%</span>
          </a>
          <a href="customer_chat.html" class="nav-tab ${activePage === 'chat' ? 'active' : ''}" style="padding:8px 14px; border-radius:8px; font-weight:600; font-size:13.5px; text-decoration:none; color:${activePage === 'chat' ? '#16A34A' : '#475569'}; background:${activePage === 'chat' ? '#DCFCE7' : 'transparent'}; display:flex; align-items:center; gap:6px;">
            <i class="fa-solid fa-comments"></i> Tin Nhắn
          </a>
        </nav>

        <!-- Right User Actions & Switchers -->
        <div style="display:flex; align-items:center; gap:12px;">
          <!-- Switcher to Provider & Admin -->
          <div style="display:flex; gap:6px;">
            <a href="dashboard.html" title="Chuyển sang Kênh Provider" style="padding:6px 10px; border:1px solid #E2E8F0; border-radius:6px; background:#F8FAFC; color:#0F172A; font-size:12px; font-weight:600; text-decoration:none; display:flex; align-items:center; gap:5px;">
              <i class="fa-solid fa-briefcase" style="color:#16A34A;"></i> Provider
            </a>
            <a href="admin.html" title="Chuyển sang Cổng Admin B4" style="padding:6px 10px; border:1px solid #E2E8F0; border-radius:6px; background:#F8FAFC; color:#0F172A; font-size:12px; font-weight:600; text-decoration:none; display:flex; align-items:center; gap:5px;">
              <i class="fa-solid fa-shield-halved" style="color:#3B82F6;"></i> Admin
            </a>
          </div>

          <!-- User Profile & Balance -->
          <div style="display:flex; align-items:center; gap:10px; padding:4px 10px; border:1px solid #E2E8F0; border-radius:10px; background:#FFFFFF;">
            <img src="${user.avatar || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100'}" alt="Avatar" style="width:34px; height:34px; border-radius:50%; object-fit:cover; border:2px solid #DCFCE7;">
            <div style="text-align:left;">
              <div style="font-weight:700; font-size:13px; color:#0F172A; line-height:1.2;">${user.name}</div>
              <div style="font-size:11px; color:#16A34A; font-weight:600;"><i class="fa-solid fa-wallet"></i> ${formatVND(user.balance || 0)}</div>
            </div>
            <button type="button" onclick="openCustomerAuthModal('login')" title="Đổi tài khoản / Đăng nhập" style="background:none; border:none; color:#94A3B8; margin-left:4px; font-size:13px; cursor:pointer;"><i class="fa-solid fa-arrow-right-from-bracket"></i></button>
          </div>
        </div>

      </div>
    </header>
  `;
}

// Footer Component Generator
function renderCustomerFooter() {
  return `
    <footer style="background:#FFFFFF; border-top:1px solid #E2E8F0; margin-top:60px; padding:40px 24px 24px; color:#64748B; font-size:13px;">
      <div style="max-width:1280px; margin:0 auto; display:grid; grid-template-columns:2fr 1fr 1fr 1fr; gap:32px; margin-bottom:32px;">
        <div>
          <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
            <div style="width:32px; height:32px; border-radius:8px; background:#16A34A; color:#FFF; display:flex; align-items:center; justify-content:center; font-weight:800;">SR</div>
            <span style="font-weight:800; font-size:16px; color:#0F172A;">SkillRental Platform</span>
          </div>
          <p style="line-height:1.6; margin-bottom:14px;">Nền tảng thương mại điện tử dịch vụ và kỹ năng hàng đầu. Áp dụng cơ chế ký quỹ Escrow bảo vệ an toàn 100% dòng tiền cho Khách Hàng và Chuyên Gia.</p>
          <div style="display:flex; gap:8px;">
            <span style="display:inline-flex; align-items:center; gap:4px; background:#DCFCE7; color:#15803D; font-size:11px; font-weight:600; padding:4px 8px; border-radius:4px;"><i class="fa-solid fa-shield-halved"></i> 100% Escrow Protected</span>
            <span style="display:inline-flex; align-items:center; gap:4px; background:#EFF6FF; color:#1D4ED8; font-size:11px; font-weight:600; padding:4px 8px; border-radius:4px;"><i class="fa-solid fa-id-card"></i> Xác minh CCCD</span>
          </div>
        </div>
        <div>
          <div style="font-weight:700; color:#0F172A; margin-bottom:12px;">Khám Phá Dịch Vụ</div>
          <ul style="list-style:none; padding:0; line-height:2;">
            <li><a href="customer.html?cat=IT" style="color:#64748B; text-decoration:none;">Lập Trình & CNTT</a></li>
            <li><a href="customer.html?cat=Design" style="color:#64748B; text-decoration:none;">Thiết Kế Đồ Họa & UI/UX</a></li>
            <li><a href="customer.html?cat=Tutor" style="color:#64748B; text-decoration:none;">Gia Sư & Luyện Thi IELTS</a></li>
            <li><a href="customer.html?cat=Repair" style="color:#64748B; text-decoration:none;">Sửa Chữa Điện Nước Gia Dụng</a></li>
            <li><a href="customer.html?cat=Home" style="color:#64748B; text-decoration:none;">Dọn Dẹp & Vệ Sinh Căn Hộ</a></li>
          </ul>
        </div>
        <div>
          <div style="font-weight:700; color:#0F172A; margin-bottom:12px;">Dành Cho Khách Hàng</div>
          <ul style="list-style:none; padding:0; line-height:2;">
            <li><a href="customer_requests.html" style="color:#64748B; text-decoration:none;">Đăng Tin Tuyển Thợ</a></li>
            <li><a href="customer_orders.html" style="color:#64748B; text-decoration:none;">Quản Lý Đơn Đặt Lịch</a></li>
            <li><a href="customer_complaint.html" style="color:#64748B; text-decoration:none;">Khiếu Nại & Tranh Chấp</a></li>
            <li><a href="customer_chat.html" style="color:#64748B; text-decoration:none;">Trao Đổi Trực Tiếp</a></li>
          </ul>
        </div>
        <div>
          <div style="font-weight:700; color:#0F172A; margin-bottom:12px;">Không Gian Khác</div>
          <ul style="list-style:none; padding:0; line-height:2;">
            <li><a href="index.html" style="color:#16A34A; font-weight:600; text-decoration:none;">Hub Điều Phối Trung Tâm</a></li>
            <li><a href="dashboard.html" style="color:#64748B; text-decoration:none;">Kênh Provider (Nhận Việc)</a></li>
            <li><a href="admin.html" style="color:#64748B; text-decoration:none;">Cổng Quản Trị Hệ Thống B4</a></li>
          </ul>
        </div>
      </div>
      <div style="border-top:1px solid #E2E8F0; padding-top:20px; text-align:center; font-size:12px; color:#94A3B8;">
        © 2025 SkillRental Platform. Thiết kế theo tiêu chuẩn Design System đa trang & Bản vẽ Figma SkillShare.
      </div>
    </footer>
  `;
}

// =========================================================================
// GLOBAL AUTH MODAL OVERLAY (ĐÈ LÊN TRANG HIỆN TẠI, KHÔNG CHUYỂN TAB)
// =========================================================================
function injectGlobalAuthModal() {
  if (document.getElementById('globalAuthModalOverlay')) return;

  const modalHtml = `
  <div id="globalAuthModalOverlay" style="position:fixed; inset:0; background:rgba(15,23,42,0.7); backdrop-filter:blur(5px); z-index:99999; display:none; align-items:center; justify-content:center; padding:20px;">
    <div style="background:#FFF; border-radius:16px; width:100%; max-width:480px; box-shadow:0 20px 40px -10px rgba(15,23,42,0.35); border:1px solid #E2E8F0; overflow:hidden; position:relative;">
      <!-- Close Button -->
      <button type="button" onclick="closeGlobalAuthModal()" style="position:absolute; top:16px; right:16px; width:32px; height:32px; border-radius:50%; background:#F1F5F9; border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; color:#64748B; z-index:10;">
        <i class="fa-solid fa-xmark"></i>
      </button>

      <!-- Header Banner -->
      <div style="background:linear-gradient(135deg, #0F172A 0%, #15803D 100%); color:#FFF; padding:24px 28px;">
        <h4 id="gamTitle" style="font-size:20px; font-weight:800; margin:0 0 4px;">Chào Mừng Đến Với SkillRental</h4>
        <p id="gamSubtitle" style="font-size:13px; color:#DCFCE7; margin:0;">Đăng nhập để thuê kỹ năng hoặc quản lý dịch vụ</p>
      </div>

      <!-- Tabs -->
      <div style="display:flex; border-bottom:1px solid #E2E8F0; background:#F8FAFC;">
        <button type="button" id="gamTabLogin" onclick="switchGlobalAuthTab('login')" style="flex:1; padding:14px; text-align:center; font-size:14px; font-weight:700; color:#16A34A; border:none; background:#FFF; border-bottom:2px solid #16A34A; cursor:pointer;">
          <i class="fa-solid fa-arrow-right-to-bracket"></i> Đăng Nhập
        </button>
        <button type="button" id="gamTabRegister" onclick="switchGlobalAuthTab('register')" style="flex:1; padding:14px; text-align:center; font-size:14px; font-weight:700; color:#64748B; border:none; background:transparent; border-bottom:2px solid transparent; cursor:pointer;">
          <i class="fa-solid fa-user-plus"></i> Đăng Ký
        </button>
      </div>

      <!-- Body -->
      <div style="padding:24px 28px;">
        <!-- Login Form -->
        <form id="gamLoginForm" onsubmit="handleGlobalLogin(event)">
          <div style="margin-bottom:16px;">
            <label style="display:block; font-size:13px; font-weight:600; color:#0F172A; margin-bottom:6px;">Email / Tài khoản</label>
            <input type="email" id="gamLoginEmail" required placeholder="long.le@example.com" style="width:100%; height:42px; padding:0 14px; border:1px solid #E2E8F0; border-radius:8px; font-size:14px; font-family:inherit; box-sizing:border-box;">
          </div>
          <div style="margin-bottom:16px;">
            <label style="display:block; font-size:13px; font-weight:600; color:#0F172A; margin-bottom:6px;">Mật khẩu</label>
            <input type="password" id="gamLoginPassword" required placeholder="••••••••" style="width:100%; height:42px; padding:0 14px; border:1px solid #E2E8F0; border-radius:8px; font-size:14px; font-family:inherit; box-sizing:border-box;">
          </div>
          <button type="submit" id="gamLoginSubmit" style="width:100%; height:44px; background:#16A34A; color:#FFF; border:none; border-radius:8px; font-weight:700; font-size:15px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;">
            <i class="fa-solid fa-arrow-right-to-bracket"></i> Đăng Nhập Ngay
          </button>

          <!-- 1-Click Quick Demo -->
          <div style="margin-top:18px; padding-top:16px; border-top:1px dashed #E2E8F0;">
            <div style="font-size:12px; font-weight:700; color:#64748B; margin-bottom:10px; text-transform:uppercase;">⚡ Đăng nhập nhanh mẫu (1-Click Demo)</div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
              <button type="button" onclick="gamQuickLogin('long.le@example.com', '123')" style="padding:8px 10px; border:1px solid #E2E8F0; border-radius:6px; background:#F8FAFC; font-size:12px; font-weight:600; color:#0F172A; cursor:pointer; display:flex; align-items:center; gap:6px;">
                <i class="fa-solid fa-user" style="color:#16A34A;"></i> Khách: Lê Hoàng Long
              </button>
              <button type="button" onclick="gamQuickLogin('an.nguyen@example.com', '123')" style="padding:8px 10px; border:1px solid #E2E8F0; border-radius:6px; background:#F8FAFC; font-size:12px; font-weight:600; color:#0F172A; cursor:pointer; display:flex; align-items:center; gap:6px;">
                <i class="fa-solid fa-briefcase" style="color:#0F172A;"></i> Provider: Nguyễn Văn An
              </button>
            </div>
          </div>
        </form>

        <!-- Register Form -->
        <form id="gamRegisterForm" onsubmit="handleGlobalRegister(event)" style="display:none;">
          <div style="margin-bottom:14px;">
            <label style="display:block; font-size:13px; font-weight:600; color:#0F172A; margin-bottom:4px;">Họ và tên</label>
            <input type="text" id="gamRegName" required placeholder="Nguyễn Văn A" style="width:100%; height:40px; padding:0 12px; border:1px solid #E2E8F0; border-radius:8px; font-size:14px; box-sizing:border-box;">
          </div>
          <div style="margin-bottom:14px;">
            <label style="display:block; font-size:13px; font-weight:600; color:#0F172A; margin-bottom:4px;">Email</label>
            <input type="email" id="gamRegEmail" required placeholder="name@example.com" style="width:100%; height:40px; padding:0 12px; border:1px solid #E2E8F0; border-radius:8px; font-size:14px; box-sizing:border-box;">
          </div>
          <div style="margin-bottom:14px;">
            <label style="display:block; font-size:13px; font-weight:600; color:#0F172A; margin-bottom:4px;">Số điện thoại</label>
            <input type="tel" id="gamRegPhone" required placeholder="0912 345 678" style="width:100%; height:40px; padding:0 12px; border:1px solid #E2E8F0; border-radius:8px; font-size:14px; box-sizing:border-box;">
          </div>
          <div style="margin-bottom:14px;">
            <label style="display:block; font-size:13px; font-weight:600; color:#0F172A; margin-bottom:4px;">Mật khẩu</label>
            <input type="password" id="gamRegPassword" required placeholder="Ít nhất 6 ký tự" style="width:100%; height:40px; padding:0 12px; border:1px solid #E2E8F0; border-radius:8px; font-size:14px; box-sizing:border-box;">
          </div>
          <div style="margin-bottom:16px;">
            <label style="display:block; font-size:13px; font-weight:600; color:#0F172A; margin-bottom:4px;">Vai trò tham gia</label>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
              <label style="border:1px solid #E2E8F0; border-radius:8px; padding:8px 10px; display:flex; align-items:center; gap:6px; cursor:pointer; font-size:13px; font-weight:600;">
                <input type="radio" name="gamRegRole" value="Customer" checked> <span>Khách hàng</span>
              </label>
              <label style="border:1px solid #E2E8F0; border-radius:8px; padding:8px 10px; display:flex; align-items:center; gap:6px; cursor:pointer; font-size:13px; font-weight:600;">
                <input type="radio" name="gamRegRole" value="Provider"> <span>Provider</span>
              </label>
            </div>
          </div>
          <button type="submit" id="gamRegSubmit" style="width:100%; height:44px; background:#16A34A; color:#FFF; border:none; border-radius:8px; font-weight:700; font-size:15px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;">
            <i class="fa-solid fa-user-plus"></i> Hoàn Tất Đăng Ký
          </button>
        </form>
      </div>
    </div>
  </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHtml);

  document.getElementById('globalAuthModalOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'globalAuthModalOverlay') closeGlobalAuthModal();
  });
}

function openCustomerAuthModal(tab = 'login') {
  injectGlobalAuthModal();
  const overlay = document.getElementById('globalAuthModalOverlay');
  overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  switchGlobalAuthTab(tab);
}

function closeGlobalAuthModal() {
  const overlay = document.getElementById('globalAuthModalOverlay');
  if (overlay) {
    overlay.style.display = 'none';
    document.body.style.overflow = '';
  }
}

function switchGlobalAuthTab(tab) {
  const loginForm = document.getElementById('gamLoginForm');
  const registerForm = document.getElementById('gamRegisterForm');
  const tabLogin = document.getElementById('gamTabLogin');
  const tabRegister = document.getElementById('gamTabRegister');
  const title = document.getElementById('gamTitle');
  const subtitle = document.getElementById('gamSubtitle');

  if (tab === 'login') {
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
    tabLogin.style.color = '#16A34A';
    tabLogin.style.background = '#FFF';
    tabLogin.style.borderBottomColor = '#16A34A';
    tabRegister.style.color = '#64748B';
    tabRegister.style.background = 'transparent';
    tabRegister.style.borderBottomColor = 'transparent';
    title.innerText = 'Chào Mừng Đến Với SkillRental';
    subtitle.innerText = 'Đăng nhập để thuê kỹ năng hoặc quản lý dịch vụ';
  } else {
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';
    tabLogin.style.color = '#64748B';
    tabLogin.style.background = 'transparent';
    tabLogin.style.borderBottomColor = 'transparent';
    tabRegister.style.color = '#16A34A';
    tabRegister.style.background = '#FFF';
    tabRegister.style.borderBottomColor = '#16A34A';
    title.innerText = 'Tạo Tài Khoản Mới';
    subtitle.innerText = 'Bắt đầu kết nối với hàng ngàn cơ hội kỹ năng và thu nhập';
  }
}

function gamQuickLogin(email, password) {
  document.getElementById('gamLoginEmail').value = email;
  document.getElementById('gamLoginPassword').value = password;
  document.getElementById('gamLoginForm').dispatchEvent(new Event('submit'));
}

async function handleGlobalLogin(e) {
  e.preventDefault();
  const email = document.getElementById('gamLoginEmail').value.trim();
  const password = document.getElementById('gamLoginPassword').value;
  const btn = document.getElementById('gamLoginSubmit');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xác thực...';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (data.success && data.user) {
      setCurrentCustomer(data.user);
      showToast('Đăng Nhập Thành Công', `Chào mừng ${data.user.name} đã quay trở lại.`, 'success');
      closeGlobalAuthModal();
      setTimeout(() => window.location.reload(), 500);
    } else {
      showToast('Đăng Nhập Thất Bại', data.message || 'Sai thông tin tài khoản!', 'error');
    }
  } catch (err) {
    console.error(err);
    const demoUser = { id: 'USR_LOCAL', name: email.split('@')[0], email, role: 'Customer' };
    setCurrentCustomer(demoUser);
    showToast('Đăng Nhập Thành Công', `Đã lưu phiên làm việc của ${demoUser.name}.`, 'success');
    closeGlobalAuthModal();
    setTimeout(() => window.location.reload(), 500);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i> Đăng Nhập Ngay';
  }
}

async function handleGlobalRegister(e) {
  e.preventDefault();
  const name = document.getElementById('gamRegName').value.trim();
  const email = document.getElementById('gamRegEmail').value.trim();
  const phone = document.getElementById('gamRegPhone').value.trim();
  const password = document.getElementById('gamRegPassword').value;
  const role = document.querySelector('input[name="gamRegRole"]:checked').value;
  const btn = document.getElementById('gamRegSubmit');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang tạo...';

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, phone, password, role })
    });
    const data = await res.json();
    if (data.success && data.user) {
      setCurrentCustomer(data.user);
      showToast('Đăng Ký Thành Công', `Chào mừng bạn đến với SkillRental (${role}).`, 'success');
      closeGlobalAuthModal();
      setTimeout(() => window.location.reload(), 500);
    } else {
      showToast('Đăng Ký Thất Bại', data.message || 'Không thể tạo tài khoản!', 'error');
    }
  } catch (err) {
    console.error(err);
    const newUser = { id: 'USR_' + Date.now(), name, email, phone, role };
    setCurrentCustomer(newUser);
    showToast('Đăng Ký Thành Công', `Tài khoản ${name} đã được tạo.`, 'success');
    closeGlobalAuthModal();
    setTimeout(() => window.location.reload(), 500);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Hoàn Tất Đăng Ký';
  }
}

window.openCustomerAuthModal = openCustomerAuthModal;
window.openAuthModal = openCustomerAuthModal;
