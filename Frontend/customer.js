/**
 * ============================================================
 * SkillRental Platform - Customer Client Library
 * customer.js
 *
 * ĐỒNG BỘ AUTH VỚI index.html
 *
 * 1. customer.html KHÔNG bắt đăng nhập khi mở trang.
 * 2. Chưa đăng nhập -> hiện nút Đăng Nhập + Đăng Ký.
 * 3. Đăng Nhập / Đăng Ký -> mở chung Auth Modal.
 * 4. Dùng chung SESSION_KEY với index.html.
 * 5. Dùng chung API:
 *      POST /api/auth/login
 *      POST /api/auth/register
 * 6. Đăng nhập thành công -> lưu session + cập nhật navbar.
 * 7. Đăng xuất -> xóa session + cập nhật navbar.
 * 8. Chức năng cần tài khoản -> requireCustomerLogin().
 * ============================================================
 */

const API_BASE = (typeof window !== 'undefined' && window.location.protocol.startsWith('http') && (window.location.port === '3000' || window.location.port === '')) ? '' : 'http://localhost:3000';

const SESSION_KEY = 'SKILLRENTAL_CURRENT_USER';


// ============================================================
// SESSION
// ============================================================

function getCurrentCustomer() {
  const raw = localStorage.getItem(SESSION_KEY);

  if (!raw) {
    return null;
  }

  try {
    const user = JSON.parse(raw);
    if (!user || !user.id || ['USR100', 'USR_CUSTOMER_LOCAL', 'USR_PROVIDER_LOCAL'].includes(user.id)) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return user;
  } catch (error) {
    console.error('Session data không hợp lệ:', error);
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}


function setCurrentCustomer(user) {

  if (!user || !user.id) {

    console.error(
        'Không thể lưu session: user không hợp lệ.'
    );

    return false;
  }

  localStorage.setItem(
      SESSION_KEY,
      JSON.stringify(user)
  );

  return true;
}


function clearCurrentCustomer() {

  localStorage.removeItem(
      SESSION_KEY
  );
}


// ============================================================
// AUTH STATUS
// ============================================================

function isCustomerLoggedIn() {
  const user = getCurrentCustomer();
  return Boolean(user && user.role === 'Customer');
}


// ============================================================
// REQUIRE LOGIN
// ============================================================

function requireCustomerLogin(callback) {

  const user =
      getCurrentCustomer();

  if (!user) {

    openAuthModal('login');

    return false;
  }

  if (user.role !== 'Customer') {
    showToast('Không đủ quyền', 'Thao tác này chỉ dành cho tài khoản khách hàng.', 'error');
    return false;
  }

  if (typeof callback === 'function') {

    callback(user);
  }

  return true;
}


// ============================================================
// API REQUEST
// ============================================================

async function apiRequest(
    endpoint,
    options = {}
) {

  const method = String(options.method || 'GET').toUpperCase();
  const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(method);
  const isPrivateRead = method === 'GET' && (
    /^\/api\/(orders|chat|complaints|reviews)(\/|\?|$)/.test(endpoint) ||
    /^\/api\/auth\/me(\?|$)/.test(endpoint) ||
    (/^\/api\/jobs(\?|$)/.test(endpoint) && /[?&]customerId=/.test(endpoint))
  );
  if ((isMutation || isPrivateRead) && !requireCustomerLogin()) {
    return { success: false, loginRequired: true, message: 'Đăng nhập bằng tài khoản khách hàng để tiếp tục.' };
  }

  try {

    const user =
        getCurrentCustomer();

    const headers = {

      'Content-Type':
          'application/json',

      ...(options.headers || {})
    };


    /*
     * Chỉ gửi x-user-id khi đã đăng nhập.
     * Customer.html chưa login vẫn gọi được API public.
     */

    if (
        user &&
        user.id
    ) {

      headers['x-user-id'] =
          user.id;
    }


    const response =
        await fetch(
            `${API_BASE}${endpoint}`,
            {
              ...options,
              headers
            }
        );


    /*
     * Một số API có thể trả lỗi HTTP.
     */

    const text =
        await response.text();


    let data;

    try {

      data =
          text
              ? JSON.parse(text)
              : {};

    } catch (parseError) {

      console.error(
          'API trả về dữ liệu không phải JSON:',
          text
      );

      return {

        success: false,

        message:
            `Máy chủ trả về dữ liệu không hợp lệ (${response.status}).`
      };
    }


    if (!response.ok) {

      return {

        success: false,

        message:
            data.message ||
            `Yêu cầu thất bại (${response.status}).`
      };
    }


    return data;

  } catch (error) {

    console.error(
        `API Error on ${endpoint}:`,
        error
    );


    return {

      success: false,

      message:
          'Không thể kết nối đến máy chủ. Vui lòng kiểm tra Backend.'
    };
  }
}


// ============================================================
// TOAST
// ============================================================

function showToast(
    title,
    message,
    type = 'success'
) {

  let toastContainer =
      document.getElementById(
          'toast-container'
      );


  if (!toastContainer) {

    toastContainer =
        document.createElement(
            'div'
        );

    toastContainer.id =
        'toast-container';

    toastContainer.style.cssText = `
            position:fixed;
            top:24px;
            right:24px;
            z-index:999999;
            display:flex;
            flex-direction:column;
            gap:12px;
            pointer-events:none;
        `;

    document.body.appendChild(
        toastContainer
    );
  }


  const toast =
      document.createElement(
          'div'
      );


  let icon =
      'fa-circle-info';

  let color =
      '#3B82F6';

  let bg =
      '#DBEAFE';


  if (type === 'success') {

    icon =
        'fa-circle-check';

    color =
        '#16A34A';

    bg =
        '#DCFCE7';

  } else if (type === 'error') {

    icon =
        'fa-circle-exclamation';

    color =
        '#EF4444';

    bg =
        '#FEE2E2';
  }


  toast.style.cssText = `
        min-width:320px;
        max-width:420px;
        background:#FFFFFF;
        border:1px solid #E2E8F0;
        border-left:5px solid ${color};
        box-shadow:0 10px 25px -5px rgba(15,23,42,.15);
        border-radius:10px;
        padding:14px 16px;
        display:flex;
        align-items:flex-start;
        gap:12px;
        pointer-events:auto;
        animation:toastIn .25s ease-out;
        font-family:'Inter',sans-serif;
        transition:all .3s ease;
    `;


  toast.innerHTML = `

        <div style="
            width:28px;
            height:28px;
            border-radius:50%;
            background:${bg};
            color:${color};
            display:flex;
            align-items:center;
            justify-content:center;
            flex-shrink:0;
        ">
            <i class="fa-solid ${icon}"></i>
        </div>


        <div style="flex:1;">

            <div style="
                font-weight:700;
                font-size:14px;
                color:#0F172A;
                margin-bottom:2px;
            ">
                ${title}
            </div>

            <div style="
                font-size:13px;
                color:#475569;
                line-height:1.4;
            ">
                ${message}
            </div>

        </div>


        <button
            type="button"
            style="
                border:none;
                background:transparent;
                color:#94A3B8;
                cursor:pointer;
                font-size:14px;
                padding:2px;
            "
            onclick="this.parentElement.remove()"
        >
            <i class="fa-solid fa-xmark"></i>
        </button>

    `;


  toastContainer.appendChild(
      toast
  );


  setTimeout(() => {

    toast.style.opacity =
        '0';

    toast.style.transform =
        'translateY(-10px)';

    setTimeout(() => {

      toast.remove();

    }, 300);

  }, 4000);
}


// ============================================================
// FORMAT VND
// ============================================================

function formatVND(amount) {

  if (
      typeof amount === 'string' &&
      amount.includes('đ')
  ) {

    return amount;
  }


  const num =
      Number(amount) || 0;


  return (
      num.toLocaleString('vi-VN') +
      'đ'
  );
}


// ============================================================
// CATEGORY BADGE
// ============================================================

function getCategoryBadge(cat) {

  const map = {

    IT: {
      label: 'Lập trình & IT',
      bg: '#EFF6FF',
      color: '#1D4ED8',
      icon: 'fa-code'
    },

    Design: {
      label: 'Thiết kế Đồ họa',
      bg: '#FDF2F8',
      color: '#BE185D',
      icon: 'fa-palette'
    },

    Tutor: {
      label: 'Gia sư & Đào tạo',
      bg: '#FEF3C7',
      color: '#B45309',
      icon: 'fa-graduation-cap'
    },

    Repair: {
      label: 'Sửa chữa điện tử',
      bg: '#FEF2F2',
      color: '#B91C1C',
      icon: 'fa-screwdriver-wrench'
    },

    Home: {
      label: 'Dọn dẹp nhà cửa',
      bg: '#ECFDF5',
      color: '#047857',
      icon: 'fa-broom'
    }

  };


  const item =
      map[cat] || {

        label:
            cat ||
            'Kỹ năng',

        bg:
            '#F1F5F9',

        color:
            '#475569',

        icon:
            'fa-bolt'
      };


  return `
        <span style="
            background:${item.bg};
            color:${item.color};
            font-size:12px;
            font-weight:600;
            padding:4px 10px;
            border-radius:9999px;
            display:inline-flex;
            align-items:center;
            gap:5px;
        ">
            <i class="fa-solid ${item.icon}"></i>
            ${item.label}
        </span>
    `;
}


// ============================================================
// CUSTOMER NAVBAR
// ============================================================

function renderCustomerNavbar(activePage = 'home') {
  const user = getCurrentCustomer();

  return `
<div aria-hidden="true" style="height:64px;"></div>
<header class="customer-navbar landing-header" style="position:fixed !important; top:0; left:0; right:0; z-index:1000; width:100%; background:rgba(255,255,255,.98); backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); border-bottom:1px solid #E2E8F0; box-shadow:0 1px 3px rgba(15,23,42,.04);">
  <div style="max-width:1360px; margin:0 auto; padding:10px 24px; display:flex; align-items:center; justify-content:space-between; gap:14px; box-sizing:border-box;">

    <button type="button" onclick="goBackCustomer()" title="Quay lại trang trước" aria-label="Quay lại trang trước" style="display:inline-flex;align-items:center;gap:6px;flex-shrink:0;padding:8px 10px;border:1px solid #E2E8F0;border-radius:8px;background:#FFF;color:#475569;font:600 12px Inter,sans-serif;cursor:pointer;">
      <i class="fa-solid fa-arrow-left"></i><span>Quay lại</span>
    </button>
    
    <!-- BRAND LOGO -->
    <a href="customer.html" style="display:flex; align-items:center; gap:9px; text-decoration:none; flex-shrink:0;">
      <div style="width:34px; height:34px; border-radius:8px; background:#16A34A; color:#FFFFFF; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:18px; box-shadow:0 2px 6px rgba(22,163,74,.3);">
        S
      </div>
      <div style="font-weight:800; font-size:17px; color:#0F172A; letter-spacing:-0.3px; white-space:nowrap;">
        SKILL RENTAL
      </div>
    </a>

    <!-- NAV MENU -->
    <nav style="display:flex; align-items:center; gap:22px; flex-shrink:0;">
      <a href="customer.html" style="display:flex; align-items:center; gap:6px; font-size:13.5px; font-weight:600; text-decoration:none; color:${activePage === 'home' ? '#16A34A' : '#475569'}; transition:color .2s ease;" onmouseover="this.style.color='#16A34A'" onmouseout="this.style.color='${activePage === 'home' ? '#16A34A' : '#475569'}'">
        <i class="fa-solid fa-house" style="font-size:13px;"></i> Trang chủ
      </a>
      <a href="find_provider.html" style="display:flex; align-items:center; gap:6px; font-size:13.5px; font-weight:600; text-decoration:none; color:${activePage === 'providers' ? '#16A34A' : '#475569'}; transition:color .2s ease;" onmouseover="this.style.color='#16A34A'" onmouseout="this.style.color='${activePage === 'providers' ? '#16A34A' : '#475569'}'">
        <i class="fa-solid fa-magnifying-glass" style="font-size:13px;"></i> Tìm Provider
      </a>
      <a href="customer_requests.html" style="display:flex; align-items:center; gap:6px; font-size:13.5px; font-weight:600; text-decoration:none; color:${activePage === 'requests' ? '#16A34A' : '#475569'}; transition:color .2s ease;" onmouseover="this.style.color='#16A34A'" onmouseout="this.style.color='${activePage === 'requests' ? '#16A34A' : '#475569'}'">
        <i class="fa-solid fa-bars-progress" style="font-size:13px;"></i> Yêu cầu của tôi
      </a>
      <a href="customer_orders.html" style="display:flex; align-items:center; gap:6px; font-size:13.5px; font-weight:600; text-decoration:none; color:${activePage === 'orders' ? '#16A34A' : '#475569'}; transition:color .2s ease;" onmouseover="this.style.color='#16A34A'" onmouseout="this.style.color='${activePage === 'orders' ? '#16A34A' : '#475569'}'">
        <i class="fa-solid fa-bag-shopping" style="font-size:13px;"></i> Đơn hàng
      </a>
      <a href="customer_chat.html" style="display:flex; align-items:center; gap:6px; font-size:13.5px; font-weight:600; text-decoration:none; color:${activePage === 'chat' ? '#16A34A' : '#475569'}; transition:color .2s ease;" onmouseover="this.style.color='#16A34A'" onmouseout="this.style.color='${activePage === 'chat' ? '#16A34A' : '#475569'}'">
        <i class="fa-solid fa-comments" style="font-size:13px;"></i> Tin nhắn
      </a>
    </nav>

    <!-- RIGHT BAR: SEARCH + NOTIFICATION + USER -->
    <div style="display:flex; align-items:center; gap:16px;">
      <!-- Header search -->
      <div style="position:relative; width:180px;">
        <input type="text" id="navSearchInput" placeholder="Tìm chuyên gia..." onkeyup="if(event.key==='Enter') handleNavSearch()" style="width:100%; padding:6px 30px 6px 12px; font-size:12.5px; border:1px solid #E2E8F0; border-radius:9999px; outline:none; background:#F8FAFC; color:#0F172A; transition:all .2s;" onfocus="this.style.borderColor='#16A34A'; this.style.background='#FFF'" onblur="this.style.borderColor='#E2E8F0'; this.style.background='#F8FAFC'">
        <i class="fa-solid fa-magnifying-glass" onclick="handleNavSearch()" style="position:absolute; right:10px; top:50%; transform:translateY(-50%); color:#16A34A; font-size:12px; cursor:pointer;"></i>
      </div>

      <!-- Notification Bell -->
      <button type="button" onclick="showToast('Thông báo', 'Bạn không có thông báo mới nào.', 'info')" style="background:none; border:none; color:#64748B; font-size:15px; cursor:pointer; padding:6px; position:relative;" title="Thông báo">
        <i class="fa-regular fa-bell"></i>
        <span style="position:absolute; top:4px; right:4px; width:7px; height:7px; background:#EF4444; border-radius:50%;"></span>
      </button>

      ${user ? `<!-- User Profile -->
      <div style="position:relative;">
        <button type="button" id="customerAccountButton" onclick="toggleCustomerAccountMenu()" style="display:flex; align-items:center; gap:8px; padding:3px 8px 3px 3px; border:1px solid transparent; border-radius:9999px; background:transparent; cursor:pointer;" onmouseover="this.style.background='#F1F5F9'" onmouseout="this.style.background='transparent'">
          <img src="${user.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100'}" alt="Avatar" style="width:28px; height:28px; border-radius:50%; object-fit:cover; border:1.5px solid #E2E8F0;">
          <span style="font-weight:700; font-size:13px; color:#0F172A;">${user.name || 'Lê Tuấn Anh'}</span>
          <i class="fa-solid fa-chevron-down" style="font-size:10px; color:#94A3B8;"></i>
        </button>

        <!-- Dropdown Menu -->
        <div id="customerAccountMenu" style="display:none; position:absolute; top:calc(100% + 8px); right:0; width:210px; background:#FFFFFF; border:1px solid #E2E8F0; border-radius:12px; box-shadow:0 10px 25px rgba(15,23,42,.1); padding:8px; z-index:2000;">
          <div style="padding:8px 10px; border-bottom:1px solid #F1F5F9; margin-bottom:6px;">
            <div style="font-weight:700; font-size:13px; color:#0F172A;">${user.name || 'Lê Tuấn Anh'}</div>
            <div style="font-size:11px; color:#64748B;">${user.email || 'tuananh.le@example.com'}</div>
          </div>
          <a href="customer_profile.html" style="display:flex; align-items:center; gap:8px; padding:8px 10px; font-size:13px; color:#334155; text-decoration:none; border-radius:6px;" onmouseover="this.style.background='#F1F5F9'" onmouseout="this.style.background='transparent'">
            <i class="fa-regular fa-user" style="color:#64748B;"></i> Hồ Sơ Của Tôi
          </a>
          <a href="customer_orders.html" style="display:flex; align-items:center; gap:8px; padding:8px 10px; font-size:13px; color:#334155; text-decoration:none; border-radius:6px;" onmouseover="this.style.background='#F1F5F9'" onmouseout="this.style.background='transparent'">
            <i class="fa-solid fa-receipt" style="color:#64748B;"></i> Quản Lý Đơn Hàng
          </a>
          <a href="customer_complaints.html" style="display:flex; align-items:center; gap:8px; padding:8px 10px; font-size:13px; color:#334155; text-decoration:none; border-radius:6px;" onmouseover="this.style.background='#FEF2F2';this.style.color='#B91C1C'" onmouseout="this.style.background='transparent';this.style.color='#334155'">
            <i class="fa-solid fa-shield-halved" style="color:#DC2626;"></i> Quản Lý Khiếu Nại
          </a>
          <a href="customer_reviews.html" style="display:flex; align-items:center; gap:8px; padding:8px 10px; font-size:13px; color:#334155; text-decoration:none; border-radius:6px;" onmouseover="this.style.background='#FFFBEB';this.style.color='#A16207'" onmouseout="this.style.background='transparent';this.style.color='#334155'">
            <i class="fa-solid fa-star" style="color:#D97706;"></i> Quản Lý Đánh Giá
          </a>
          <a href="customer_favorites.html" style="display:flex; align-items:center; gap:8px; padding:8px 10px; font-size:13px; color:#334155; text-decoration:none; border-radius:6px;" onmouseover="this.style.background='#FFF1F2';this.style.color='#BE123C'" onmouseout="this.style.background='transparent';this.style.color='#334155'">
            <i class="fa-solid fa-heart" style="color:#E11D48;"></i> Provider yêu thích
          </a>
          <div style="border-top:1px solid #F1F5F9; margin-top:6px; padding-top:6px;">
            <a href="javascript:void(0)" onclick="handleCustomerLogout()" style="display:flex; align-items:center; gap:8px; padding:8px 10px; font-size:13px; color:#EF4444; text-decoration:none; border-radius:6px;" onmouseover="this.style.background='#FEF2F2'" onmouseout="this.style.background='transparent'">
              <i class="fa-solid fa-arrow-right-from-bracket"></i> Đăng Xuất
            </a>
          </div>
        </div>
      </div>
      ` : `<div style="display:flex;align-items:center;gap:8px;">
        <button type="button" onclick="openAuthModal('login')" class="btn btn-outline" style="padding:7px 12px;font-size:12px;">Đăng nhập</button>
        <button type="button" onclick="openAuthModal('register')" class="btn btn-primary" style="padding:7px 12px;font-size:12px;">Đăng ký</button>
      </div>`}
    </div>
  </div>
</header>
`;
}

let customerSearchProviders = null;
let customerSearchProvidersPromise = null;

function normalizeCustomerSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function escapeCustomerSearchHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

async function getCustomerSearchProviders() {
  if (customerSearchProviders) return customerSearchProviders;
  if (!customerSearchProvidersPromise) {
    customerSearchProvidersPromise = apiRequest('/api/providers?limit=100')
      .then(result => {
        customerSearchProviders = result.success && Array.isArray(result.providers) ? result.providers : [];
        return customerSearchProviders;
      })
      .catch(() => (customerSearchProviders = []));
  }
  return customerSearchProvidersPromise;
}

function ensureCustomerSearchSuggestions(input) {
  const fieldGroup = input.closest('.provider-search-box, .search-input-wrapper') || input.parentElement;
  if (!fieldGroup) return null;
  let suggestions = fieldGroup.querySelector('.customer-search-suggestions');
  if (suggestions) return suggestions;

  if (getComputedStyle(fieldGroup).position === 'static') fieldGroup.style.position = 'relative';
  if (!document.getElementById('customerSearchSuggestionStyles')) {
    const style = document.createElement('style');
    style.id = 'customerSearchSuggestionStyles';
    style.textContent = `.customer-search-suggestions{position:absolute;top:calc(100% + 8px);left:0;right:0;z-index:1200;background:#fff;border:1px solid #dfe7e2;border-radius:12px;box-shadow:0 14px 34px #0f172a1a;overflow:hidden;display:none;text-align:left}.customer-search-suggestions.is-open{display:block}.customer-search-suggestion{display:flex;align-items:center;gap:11px;padding:10px 12px;text-decoration:none;color:#172033;border-bottom:1px solid #f1f5f3}.customer-search-suggestion:hover,.customer-search-suggestion.is-active{background:#f0fdf4}.customer-search-suggestion img{width:38px;height:38px;flex:0 0 38px;border-radius:10px;object-fit:cover;background:#f1f5f9}.customer-search-suggestion-info{min-width:0;flex:1}.customer-search-suggestion-name{font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.customer-search-suggestion-meta{font-size:11px;color:#718096;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.customer-search-suggestion-footer{display:block;padding:10px 12px;background:#f8faf9;color:#168447;font-size:12px;font-weight:700;text-decoration:none}.customer-search-suggestion-footer:hover{background:#f0fdf4}.customer-search-suggestion-empty{padding:13px;color:#64748b;font-size:12px}`;
    document.head.appendChild(style);
  }
  suggestions = document.createElement('div');
  suggestions.className = 'customer-search-suggestions';
  suggestions.setAttribute('role', 'listbox');
  fieldGroup.appendChild(suggestions);
  return suggestions;
}

async function showCustomerSearchSuggestions(input) {
  const query = input.value.trim();
  const suggestions = ensureCustomerSearchSuggestions(input);
  if (!suggestions) return;
  if (!query) {
    suggestions.classList.remove('is-open');
    return;
  }
  suggestions.innerHTML = '<div class="customer-search-suggestion-empty">Đang tìm chuyên gia phù hợp...</div>';
  suggestions.classList.add('is-open');

  const providers = await getCustomerSearchProviders();
  if (!input.isConnected || input.value.trim() !== query) return;
  const terms = normalizeCustomerSearch(query).split(/\s+/).filter(Boolean);
  const matching = providers.map(provider => {
    const searchable = normalizeCustomerSearch([
      provider.name, provider.specialty, provider.bio, provider.location, provider.category,
      ...(Array.isArray(provider.skills) ? provider.skills : [])
    ].join(' '));
    const matched = terms.length > 0 && terms.every(term => searchable.includes(term));
    const name = normalizeCustomerSearch(provider.name);
    const specialty = normalizeCustomerSearch(provider.specialty);
    const score = name.startsWith(normalizeCustomerSearch(query)) ? 0 : specialty.startsWith(normalizeCustomerSearch(query)) ? 1 : 2;
    return { provider, matched, score };
  }).filter(item => item.matched)
    .sort((a, b) => a.score - b.score || Number(b.provider.rating || 0) - Number(a.provider.rating || 0))
    .slice(0, 5);

  const results = matching.length
    ? matching.map(({ provider }) => `<a class="customer-search-suggestion" role="option" href="customer_provider.html?id=${encodeURIComponent(provider.id)}"><img src="${escapeCustomerSearchHtml(provider.avatar || '')}" alt=""><span class="customer-search-suggestion-info"><span class="customer-search-suggestion-name">${escapeCustomerSearchHtml(provider.name || 'Provider')}</span><span class="customer-search-suggestion-meta">${escapeCustomerSearchHtml(provider.specialty || provider.category || 'Chuyên gia')} · ${escapeCustomerSearchHtml(provider.location || 'Chưa cập nhật')}</span></span><i class="fa-solid fa-arrow-up-right-from-square" style="color:#94a3b8;font-size:11px"></i></a>`).join('')
    : '<div class="customer-search-suggestion-empty">Không tìm thấy gợi ý phù hợp.</div>';
  suggestions.innerHTML = `${results}<a class="customer-search-suggestion-footer" href="find_provider.html?search=${encodeURIComponent(query)}">Xem tất cả kết quả cho “${escapeCustomerSearchHtml(query)}” <i class="fa-solid fa-arrow-right"></i></a>`;
}

document.addEventListener('input', event => {
  const input = event.target.closest('#navSearchInput, #searchInput, #findSearchInput');
  if (!input) return;
  clearTimeout(input._customerSearchTimer);
  input._customerSearchTimer = setTimeout(() => showCustomerSearchSuggestions(input), 160);
});

document.addEventListener('keydown', event => {
  const input = event.target.closest('#navSearchInput, #searchInput, #findSearchInput');
  if (!input) return;
  const suggestions = input.closest('.provider-search-box, .search-input-wrapper, div')?.querySelector('.customer-search-suggestions');
  if (event.key === 'Escape' && suggestions) suggestions.classList.remove('is-open');
  if (event.key === 'ArrowDown' && suggestions?.classList.contains('is-open')) {
    event.preventDefault();
    const links = [...suggestions.querySelectorAll('.customer-search-suggestion')];
    if (!links.length) return;
    const current = links.findIndex(link => link.classList.contains('is-active'));
    links.forEach(link => link.classList.remove('is-active'));
    links[(current + 1) % links.length].classList.add('is-active');
  }
  if (event.key === 'ArrowUp' && suggestions?.classList.contains('is-open')) {
    event.preventDefault();
    const links = [...suggestions.querySelectorAll('.customer-search-suggestion')];
    if (!links.length) return;
    const current = links.findIndex(link => link.classList.contains('is-active'));
    links.forEach(link => link.classList.remove('is-active'));
    links[(current <= 0 ? links.length : current) - 1].classList.add('is-active');
  }
  if (event.key === 'Enter' && suggestions?.classList.contains('is-open')) {
    const active = suggestions.querySelector('.customer-search-suggestion.is-active');
    if (active) {
      event.preventDefault();
      input._customerSearchHandledEnter = true;
      window.location.href = active.href;
    }
  }
});

window.addEventListener('keyup', event => {
  if (event.key !== 'Enter' || !event.target?._customerSearchHandledEnter) return;
  event.target._customerSearchHandledEnter = false;
  event.preventDefault();
  event.stopImmediatePropagation();
}, true);

document.addEventListener('click', event => {
  if (event.target.closest('.customer-search-suggestions, #navSearchInput, #searchInput, #findSearchInput')) return;
  document.querySelectorAll('.customer-search-suggestions.is-open').forEach(node => node.classList.remove('is-open'));
});

function handleNavSearch() {
  const input = document.getElementById('navSearchInput');
  const q = (input ? input.value : '').trim();
  if (q) {
    window.location.href = 'find_provider.html?search=' + encodeURIComponent(q);
  } else {
    window.location.href = 'find_provider.html';
  }
}
window.handleNavSearch = handleNavSearch;

function goBackCustomer() {
  const currentPage = location.pathname.split('/').pop().toLowerCase();
  if (currentPage === 'customer.html') {
    location.href = 'index.html';
    return;
  }

  const previous = document.referrer;
  if (previous) {
    try {
      const url = new URL(previous);
      const isCustomerPage = url.origin === location.origin && /\/(customer[^/]*\.html|find_provider\.html|find-provider|find_provider)$/.test(url.pathname);
      if (isCustomerPage) {
        history.back();
        return;
      }
    } catch (error) {
      // Use the customer home page when the previous URL cannot be checked.
    }
  }
  location.href = 'customer.html';
}
window.goBackCustomer = goBackCustomer;

function openProviderProfileCard(event, providerId) {
  if (event.target.closest('a, button, .provider-skill')) return;
  location.href = `customer_provider.html?id=${encodeURIComponent(providerId)}`;
}
window.openProviderProfileCard = openProviderProfileCard;

function handleProviderProfileCardKeydown(event, providerId) {
  if ((event.key === 'Enter' || event.key === ' ') && !event.target.closest('a, button, .provider-skill')) {
    event.preventDefault();
    openProviderProfileCard(event, providerId);
  }
}
window.handleProviderProfileCardKeydown = handleProviderProfileCardKeydown;


// ============================================================
// ACCOUNT DROPDOWN
// ============================================================

function toggleCustomerAccountMenu() {

  const menu =
      document.getElementById(
          'customerAccountMenu'
      );

  if (!menu) {
    return;
  }


  const isOpen =
      menu.style.display === 'block';


  menu.style.display =
      isOpen
          ? 'none'
          : 'block';
}


document.addEventListener(
    'click',
    function(event) {

      const button =
          document.getElementById(
              'customerAccountButton'
          );

      const menu =
          document.getElementById(
              'customerAccountMenu'
          );


      if (!button || !menu) {
        return;
      }


      if (
          !button.contains(event.target) &&
          !menu.contains(event.target)
      ) {

        menu.style.display =
            'none';
      }
    }
);


// ============================================================
// LOGOUT
// ============================================================

function customerLogout() {

  clearCurrentCustomer();

  showToast(
      'Đã Đăng Xuất',
      'Bạn đã đăng xuất khỏi phiên làm việc.',
      'success'
  );

  setTimeout(() => {

    window.location.href = 'index.html?auth=login';

  }, 300);
}

function handleCustomerLogout(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const menu = document.getElementById('customerAccountMenu');
  if (menu) menu.style.display = 'none';
  customerLogout();
}
window.handleCustomerLogout = handleCustomerLogout;


// ============================================================
// FOOTER
// ============================================================

function renderCustomerFooter() {

  return `

<footer style="
    background:#FFFFFF;
    border-top:1px solid #E2E8F0;
    margin-top:60px;
    padding:40px 24px 24px;
    color:#64748B;
    font-size:13px;
">

    <div style="
        max-width:1280px;
        margin:0 auto;
        display:grid;
        grid-template-columns:2fr 1fr 1fr;
        gap:32px;
        margin-bottom:32px;
    ">


        <div>

            <div style="
                display:flex;
                align-items:center;
                gap:10px;
                margin-bottom:12px;
            ">

                <div style="
                    width:32px;
                    height:32px;
                    border-radius:8px;
                    background:#16A34A;
                    color:#FFF;
                    display:flex;
                    align-items:center;
                    justify-content:center;
                    font-weight:800;
                ">
                    SR
                </div>

                <span style="
                    font-weight:800;
                    font-size:16px;
                    color:#0F172A;
                ">
                    SkillRental Platform
                </span>

            </div>


            <p style="
                line-height:1.6;
                margin-bottom:14px;
            ">
                Nền tảng kết nối khách hàng
                với các chuyên gia cung cấp dịch vụ
                và kỹ năng.
            </p>

        </div>


        <!-- KHÁM PHÁ -->

        <div>

            <div style="
                font-weight:700;
                color:#0F172A;
                margin-bottom:12px;
            ">
                Khám Phá Dịch Vụ
            </div>


            <ul style="
                list-style:none;
                padding:0;
                line-height:2;
            ">

                <li>
                    <a
                        href="customer.html?cat=IT"
                        style="color:#64748B;text-decoration:none;"
                    >
                        Lập Trình & CNTT
                    </a>
                </li>

                <li>
                    <a
                        href="customer.html?cat=Design"
                        style="color:#64748B;text-decoration:none;"
                    >
                        Thiết Kế
                    </a>
                </li>

                <li>
                    <a
                        href="customer.html?cat=Tutor"
                        style="color:#64748B;text-decoration:none;"
                    >
                        Gia Sư & Đào Tạo
                    </a>
                </li>

                <li>
                    <a
                        href="customer.html?cat=Repair"
                        style="color:#64748B;text-decoration:none;"
                    >
                        Sửa Chữa
                    </a>
                </li>

                <li>
                    <a
                        href="customer.html?cat=Home"
                        style="color:#64748B;text-decoration:none;"
                    >
                        Dịch Vụ Gia Đình
                    </a>
                </li>

            </ul>

        </div>


        <!-- KHÁCH HÀNG -->

        <div>

            <div style="
                font-weight:700;
                color:#0F172A;
                margin-bottom:12px;
            ">
                Dành Cho Khách Hàng
            </div>


            <ul style="
                list-style:none;
                padding:0;
                line-height:2;
            ">

                <li>
                    <a
                        href="customer_requests.html"
                        onclick="
                            if (!requireCustomerLogin()) {
                                event.preventDefault();
                            }
                        "
                        style="color:#64748B;text-decoration:none;"
                    >
                        Đăng Yêu Cầu
                    </a>
                </li>


                <li>
                    <a
                        href="customer_orders.html"
                        onclick="
                            if (!requireCustomerLogin()) {
                                event.preventDefault();
                            }
                        "
                        style="color:#64748B;text-decoration:none;"
                    >
                        Đơn Hàng
                    </a>
                </li>


                <li>
                    <a
                        href="customer_chat.html"
                        onclick="
                            if (!requireCustomerLogin()) {
                                event.preventDefault();
                            }
                        "
                        style="color:#64748B;text-decoration:none;"
                    >
                        Tin Nhắn
                    </a>
                </li>


                <li>
                    <a
                        href="customer_complaint.html"
                        onclick="
                            if (!requireCustomerLogin()) {
                                event.preventDefault();
                            }
                        "
                        style="color:#64748B;text-decoration:none;"
                    >
                        Khiếu Nại & Hỗ Trợ
                    </a>
                </li>

            </ul>

        </div>

    </div>


    <div style="
        border-top:1px solid #E2E8F0;
        padding-top:20px;
        text-align:center;
        font-size:12px;
        color:#94A3B8;
    ">

        © 2026 SkillRental Platform.

    </div>

</footer>

    `;
}


// ============================================================
// AUTH MODAL
// ============================================================

function injectGlobalAuthModal() {

  if (
      document.getElementById(
          'globalAuthModalOverlay'
      )
  ) {

    return;
  }


  const modalHtml = `

<div
    id="globalAuthModalOverlay"
    style="
        position:fixed;
        inset:0;
        background:rgba(15,23,42,.7);
        backdrop-filter:blur(5px);
        z-index:99999;
        display:none;
        align-items:center;
        justify-content:center;
        padding:20px;
    "
>

    <div style="
        background:#FFFFFF;
        border-radius:16px;
        width:100%;
        max-width:480px;
        max-height:90vh;
        overflow-y:auto;
        box-shadow:
            0 20px 40px -10px
            rgba(15,23,42,.35);
        border:1px solid #E2E8F0;
        position:relative;
    ">


        <!-- CLOSE -->

        <button
            type="button"
            onclick="closeAuthModal()"
            style="
                position:absolute;
                top:16px;
                right:16px;
                width:32px;
                height:32px;
                border-radius:50%;
                background:#F1F5F9;
                border:none;
                cursor:pointer;
                display:flex;
                align-items:center;
                justify-content:center;
                color:#64748B;
                z-index:10;
            "
        >
            <i class="fa-solid fa-xmark"></i>
        </button>


        <!-- HEADER -->

        <div style="
            background:
                linear-gradient(
                    135deg,
                    #0F172A 0%,
                    #15803D 100%
                );
            color:#FFF;
            padding:24px 28px;
        ">

            <h4
                id="gamTitle"
                style="
                    font-size:20px;
                    font-weight:800;
                    margin:0 0 4px;
                "
            >
                Chào Mừng Đến Với SkillRental
            </h4>

            <p
                id="gamSubtitle"
                style="
                    font-size:13px;
                    color:#DCFCE7;
                    margin:0;
                "
            >
                Đăng nhập để thuê kỹ năng
                hoặc quản lý dịch vụ
            </p>

        </div>


        <!-- TABS -->

        <div style="
            display:flex;
            border-bottom:1px solid #E2E8F0;
            background:#F8FAFC;
        ">

            <button
                type="button"
                id="gamTabLogin"
                onclick="switchAuthTab('login')"
                style="
                    flex:1;
                    padding:14px;
                    text-align:center;
                    font-size:14px;
                    font-weight:700;
                    color:#16A34A;
                    border:none;
                    background:#FFFFFF;
                    border-bottom:2px solid #16A34A;
                    cursor:pointer;
                "
            >
                <i class="fa-solid fa-arrow-right-to-bracket"></i>
                Đăng Nhập
            </button>


            <button
                type="button"
                id="gamTabRegister"
                onclick="switchAuthTab('register')"
                style="
                    flex:1;
                    padding:14px;
                    text-align:center;
                    font-size:14px;
                    font-weight:700;
                    color:#64748B;
                    border:none;
                    background:transparent;
                    border-bottom:2px solid transparent;
                    cursor:pointer;
                "
            >
                <i class="fa-solid fa-user-plus"></i>
                Đăng Ký
            </button>

        </div>


        <!-- BODY -->

        <div style="
            padding:24px 28px;
        ">


            <!-- LOGIN -->

            <form
                id="loginForm"
                onsubmit="handleModalLogin(event)"
            >

                <div style="
                    margin-bottom:16px;
                ">

                    <label style="
                        display:block;
                        font-size:13px;
                        font-weight:600;
                        color:#0F172A;
                        margin-bottom:6px;
                    ">
                        Email / Tài khoản
                    </label>

                    <input
                        type="email"
                        id="loginEmail"
                        required
                        autocomplete="email"
                        placeholder="long.le@example.com"
                        style="
                            width:100%;
                            height:42px;
                            padding:0 14px;
                            border:1px solid #E2E8F0;
                            border-radius:8px;
                            font-size:14px;
                            box-sizing:border-box;
                            outline:none;
                        "
                    >

                </div>


                <div style="
                    margin-bottom:16px;
                ">

                    <label style="
                        display:block;
                        font-size:13px;
                        font-weight:600;
                        color:#0F172A;
                        margin-bottom:6px;
                    ">
                        Mật khẩu
                    </label>

                    <input
                        type="password"
                        id="loginPassword"
                        required
                        autocomplete="current-password"
                        placeholder="••••••••"
                        style="
                            width:100%;
                            height:42px;
                            padding:0 14px;
                            border:1px solid #E2E8F0;
                            border-radius:8px;
                            font-size:14px;
                            box-sizing:border-box;
                            outline:none;
                        "
                    >

                </div>


                <button
                    type="submit"
                    id="loginSubmitBtn"
                    style="
                        width:100%;
                        height:44px;
                        background:#16A34A;
                        color:#FFFFFF;
                        border:none;
                        border-radius:8px;
                        font-weight:700;
                        font-size:15px;
                        cursor:pointer;
                    "
                >
                    <i class="fa-solid fa-arrow-right-to-bracket"></i>
                    Đăng Nhập Ngay
                </button>

            </form>


            <!-- REGISTER -->

            <form
                id="registerForm"
                onsubmit="handleModalRegister(event)"
                style="display:none;"
            >

                <div style="
                    margin-bottom:14px;
                ">

                    <label style="
                        display:block;
                        font-size:13px;
                        font-weight:600;
                        color:#0F172A;
                        margin-bottom:6px;
                    ">
                        Họ và tên
                    </label>

                    <input
                        type="text"
                        id="regName"
                        required
                        autocomplete="name"
                        placeholder="Nguyễn Văn A"
                        style="
                            width:100%;
                            height:40px;
                            padding:0 12px;
                            border:1px solid #E2E8F0;
                            border-radius:8px;
                            box-sizing:border-box;
                        "
                    >

                </div>


                <div style="
                    margin-bottom:14px;
                ">

                    <label style="
                        display:block;
                        font-size:13px;
                        font-weight:600;
                        color:#0F172A;
                        margin-bottom:6px;
                    ">
                        Email
                    </label>

                    <input
                        type="email"
                        id="regEmail"
                        required
                        autocomplete="email"
                        placeholder="name@example.com"
                        style="
                            width:100%;
                            height:40px;
                            padding:0 12px;
                            border:1px solid #E2E8F0;
                            border-radius:8px;
                            box-sizing:border-box;
                        "
                    >

                </div>


                <div style="
                    margin-bottom:14px;
                ">

                    <label style="
                        display:block;
                        font-size:13px;
                        font-weight:600;
                        color:#0F172A;
                        margin-bottom:6px;
                    ">
                        Số điện thoại
                    </label>

                    <input
                        type="tel"
                        id="regPhone"
                        required
                        autocomplete="tel"
                        placeholder="0912 345 678"
                        style="
                            width:100%;
                            height:40px;
                            padding:0 12px;
                            border:1px solid #E2E8F0;
                            border-radius:8px;
                            box-sizing:border-box;
                        "
                    >

                </div>


                <div style="
                    margin-bottom:14px;
                ">

                    <label style="
                        display:block;
                        font-size:13px;
                        font-weight:600;
                        color:#0F172A;
                        margin-bottom:6px;
                    ">
                        Mật khẩu
                    </label>

                    <input
                        type="password"
                        id="regPassword"
                        required
                        minlength="6"
                        autocomplete="new-password"
                        placeholder="Ít nhất 6 ký tự"
                        style="
                            width:100%;
                            height:40px;
                            padding:0 12px;
                            border:1px solid #E2E8F0;
                            border-radius:8px;
                            box-sizing:border-box;
                        "
                    >

                </div>


                <div style="
                    margin-bottom:16px;
                ">

                    <label style="
                        display:block;
                        font-size:13px;
                        font-weight:600;
                        color:#0F172A;
                        margin-bottom:8px;
                    ">
                        Vai trò tham gia
                    </label>


                    <div style="
                        display:grid;
                        grid-template-columns:1fr 1fr;
                        gap:10px;
                    ">

                        <label style="
                            display:flex;
                            align-items:center;
                            gap:6px;
                            font-size:13px;
                            color:#334155;
                        ">

                            <input
                                type="radio"
                                name="regRole"
                                value="Customer"
                                checked
                            >

                            Khách hàng

                        </label>


                        <label style="
                            display:flex;
                            align-items:center;
                            gap:6px;
                            font-size:13px;
                            color:#334155;
                        ">

                            <input
                                type="radio"
                                name="regRole"
                                value="Provider"
                            >

                            Provider

                        </label>

                    </div>

                </div>


                <button
                    type="submit"
                    id="registerSubmitBtn"
                    style="
                        width:100%;
                        height:44px;
                        background:#16A34A;
                        color:#FFFFFF;
                        border:none;
                        border-radius:8px;
                        font-weight:700;
                        font-size:15px;
                        cursor:pointer;
                    "
                >
                    <i class="fa-solid fa-user-plus"></i>
                    Hoàn Tất Đăng Ký
                </button>

            </form>

        </div>

    </div>

</div>

    `;


  document.body.insertAdjacentHTML(
      'beforeend',
      modalHtml
  );


  const overlay =
      document.getElementById(
          'globalAuthModalOverlay'
      );


  overlay.addEventListener(
      'click',
      function(event) {

        if (
            event.target ===
            overlay
        ) {

          closeAuthModal();
        }
      }
  );
}


// ============================================================
// OPEN AUTH MODAL
// ============================================================

function openAuthModal(
    tab = 'login'
) {

  injectGlobalAuthModal();


  const overlay =
      document.getElementById(
          'globalAuthModalOverlay'
      );


  if (!overlay) {
    return;
  }


  overlay.style.display =
      'flex';

  document.body.style.overflow =
      'hidden';


  switchAuthTab(tab);
}


// ============================================================
// ALIAS CHO CUSTOMER
// ============================================================

function openCustomerAuthModal(
    tab = 'login'
) {

  openAuthModal(tab);
}


// ============================================================
// CLOSE AUTH MODAL
// ============================================================

function closeAuthModal() {

  const overlay =
      document.getElementById(
          'globalAuthModalOverlay'
      );


  if (overlay) {

    overlay.style.display =
        'none';

    document.body.style.overflow =
        '';
  }
}


// Alias cũ
function closeGlobalAuthModal() {

  closeAuthModal();
}


// ============================================================
// SWITCH LOGIN / REGISTER
// ============================================================

function switchAuthTab(tab) {

  const loginForm =
      document.getElementById(
          'loginForm'
      );

  const registerForm =
      document.getElementById(
          'registerForm'
      );

  const tabLogin =
      document.getElementById(
          'gamTabLogin'
      );

  const tabRegister =
      document.getElementById(
          'gamTabRegister'
      );

  const title =
      document.getElementById(
          'gamTitle'
      );

  const subtitle =
      document.getElementById(
          'gamSubtitle'
      );


  if (
      !loginForm ||
      !registerForm ||
      !tabLogin ||
      !tabRegister
  ) {

    return;
  }


  if (tab === 'login') {

    loginForm.style.display =
        'block';

    registerForm.style.display =
        'none';


    tabLogin.style.color =
        '#16A34A';

    tabLogin.style.background =
        '#FFFFFF';

    tabLogin.style.borderBottomColor =
        '#16A34A';


    tabRegister.style.color =
        '#64748B';

    tabRegister.style.background =
        'transparent';

    tabRegister.style.borderBottomColor =
        'transparent';


    if (title) {

      title.innerText =
          'Chào Mừng Đến Với SkillRental';
    }


    if (subtitle) {

      subtitle.innerText =
          'Đăng nhập để thuê kỹ năng hoặc quản lý dịch vụ';
    }


  } else {

    loginForm.style.display =
        'none';

    registerForm.style.display =
        'block';


    tabLogin.style.color =
        '#64748B';

    tabLogin.style.background =
        'transparent';

    tabLogin.style.borderBottomColor =
        'transparent';


    tabRegister.style.color =
        '#16A34A';

    tabRegister.style.background =
        '#FFFFFF';

    tabRegister.style.borderBottomColor =
        '#16A34A';


    if (title) {

      title.innerText =
          'Tạo Tài Khoản Mới';
    }


    if (subtitle) {

      subtitle.innerText =
          'Bắt đầu sử dụng SkillRental';
    }
  }
}


// Alias cũ
function switchGlobalAuthTab(tab) {

  switchAuthTab(tab);
}


// ============================================================
// REDIRECT AFTER LOGIN
// ============================================================

function redirectAfterLogin(user) {
  if (!user) return;
  if (user.role === 'Provider') {
    window.location.href = 'dashboard.html';
  } else if (user.role === 'Admin') {
    window.location.href = 'admin.html';
  } else {
    // Customer
    const navbar = document.getElementById('navbar-placeholder');
    if (navbar) {
      navbar.innerHTML = renderCustomerNavbar('home');
    }
    if (typeof loadOrders === 'function') loadOrders();
    if (typeof loadRequests === 'function') loadRequests();
    if (typeof loadProviders === 'function') loadProviders();
    window.location.reload();
  }
}

// ============================================================
// LOGIN - ĐỒNG BỘ VỚI INDEX
// ============================================================

async function handleModalLogin(e) {
  e.preventDefault();

  const email =
      document
          .getElementById('loginEmail')
          .value
          .trim();

  const password =
      document
          .getElementById('loginPassword')
          .value;

  const submitBtn =
      document.getElementById('loginSubmitBtn');

  if (!email || !password) {
    showToast(
        'Đăng Nhập Thất Bại',
        'Vui lòng nhập đầy đủ email và mật khẩu.',
        'error'
    );
    return;
  }

  submitBtn.disabled = true;
  submitBtn.innerHTML = `
        <i class="fa-solid fa-spinner fa-spin"></i>
        Đang xác thực...
    `;

  try {
    const response =
        await fetch(
            `${API_BASE}/api/auth/login`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                email,
                password
              })
            }
        );

    const text = await response.text();
    let data = {};

    try {
      data = text ? JSON.parse(text) : {};
    } catch (parseError) {
      console.error('Login API trả về không phải JSON:', text);
      throw new Error(`Server trả về dữ liệu không hợp lệ (${response.status})`);
    }

    if (response.ok && data.success && data.user) {
      const saved = setCurrentCustomer(data.user);
      if (!saved) {
        throw new Error('Không thể lưu phiên đăng nhập.');
      }

      showToast(
          'Đăng Nhập Thành Công!',
          `Chào mừng ${data.user.name || 'bạn'} đã quay trở lại.`,
          'success'
      );

      closeAuthModal();

      setTimeout(() => {
        redirectAfterLogin(data.user);
      }, 300);
      return;
    } else {
      showToast(
          'Đăng Nhập Thất Bại',
          data.message || 'Sai email hoặc mật khẩu!',
          'error'
      );
    }
  } catch (error) {
    console.error('Không thể kết nối máy chủ đăng nhập:', error);
    showToast('Không thể đăng nhập', 'Không kết nối được máy chủ. Vui lòng thử lại khi server hoạt động.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `
            <i class="fa-solid fa-arrow-right-to-bracket"></i>
            Đăng Nhập Ngay
        `;
  }
}

// Alias để tương thích nếu chỗ khác đang gọi
function handleGlobalLogin(e) {
  return handleModalLogin(e);
}

// ============================================================
// REGISTER - ĐỒNG BỘ VỚI INDEX
// ============================================================

async function handleModalRegister(e) {
  e.preventDefault();

  const name =
      document
          .getElementById('regName')
          .value
          .trim();

  const email =
      document
          .getElementById('regEmail')
          .value
          .trim();

  const phone =
      document
          .getElementById('regPhone')
          .value
          .trim();

  const password =
      document
          .getElementById('regPassword')
          .value;

  const role =
      document.querySelector('input[name="regRole"]:checked')?.value || 'Customer';

  const submitBtn =
      document.getElementById('registerSubmitBtn');

  submitBtn.disabled = true;
  submitBtn.innerHTML = `
        <i class="fa-solid fa-spinner fa-spin"></i>
        Đang tạo tài khoản...
    `;

  try {
    const response =
        await fetch(
            `${API_BASE}/api/auth/register`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                name,
                email,
                phone,
                password,
                role
              })
            }
        );

    const text = await response.text();
    let data = {};

    try {
      data = text ? JSON.parse(text) : {};
    } catch (parseError) {
      console.error('Register API trả về không phải JSON:', text);
      throw new Error(`Server trả về dữ liệu không hợp lệ (${response.status})`);
    }

    if (response.ok && data.success && data.user) {
      const saved = setCurrentCustomer(data.user);
      if (!saved) {
        throw new Error('Không thể lưu phiên đăng ký.');
      }

      showToast(
          'Tạo Tài Khoản Thành Công!',
          `Chào mừng ${name} đến với SkillRental.`,
          'success'
      );

      closeAuthModal();

      setTimeout(() => {
        redirectAfterLogin(data.user);
      }, 300);
      return;
    } else {
      showToast(
          'Đăng Ký Thất Bại',
          data.message || 'Không thể tạo tài khoản!',
          'error'
      );
    }
  } catch (error) {
    console.warn('Lỗi kết nối máy chủ, kích hoạt tạo tài khoản demo:', error);

    const newUser = {
      id: 'USR_' + Date.now(),
      name,
      email,
      phone,
      role,
      balance: role === 'Customer' ? 5000000 : 0,
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'
    };

    setCurrentCustomer(newUser);
    showToast('Tạo Tài Khoản Thành Công!', `Chào mừng ${name} đến với SkillRental.`, 'success');
    closeAuthModal();

    setTimeout(() => {
      redirectAfterLogin(newUser);
    }, 300);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `
            <i class="fa-solid fa-user-plus"></i>
            Hoàn Tất Đăng Ký
        `;
  }
}


// Alias cũ
function handleGlobalRegister(e) {

  return handleModalRegister(e);
}


// ============================================================
// QUICK LOGIN - GIỐNG INDEX
// ============================================================

function quickFillAndLogin(
    email,
    password
) {

  openAuthModal('login');


  setTimeout(() => {

    const emailInput =
        document.getElementById(
            'loginEmail'
        );

    const passwordInput =
        document.getElementById(
            'loginPassword'
        );

    const form =
        document.getElementById(
            'loginForm'
        );


    if (!emailInput ||
        !passwordInput ||
        !form) {

      return;
    }


    emailInput.value =
        email;

    passwordInput.value =
        password;


    if (
        typeof form.requestSubmit ===
        'function'
    ) {

      form.requestSubmit();

    } else {

      form.dispatchEvent(
          new Event(
              'submit',
              {
                bubbles:true,
                cancelable:true
              }
          )
      );
    }

  }, 50);
}


// Tên cũ nếu code khác đang dùng
function gamQuickLogin(
    email,
    password
) {

  quickFillAndLogin(
      email,
      password
  );
}


// ============================================================
// ESC KEY ĐÓNG MODAL
// ============================================================

document.addEventListener(
    'keydown',
    function(event) {

      if (
          event.key === 'Escape'
      ) {

        const overlay =
            document.getElementById(
                'globalAuthModalOverlay'
            );


        if (
            overlay &&
            overlay.style.display === 'flex'
        ) {

          closeAuthModal();
        }
      }
    }
);


// ============================================================
// GLOBAL FUNCTIONS
// ============================================================

window.getCurrentCustomer =
    getCurrentCustomer;

window.setCurrentCustomer =
    setCurrentCustomer;

window.clearCurrentCustomer =
    clearCurrentCustomer;

window.isCustomerLoggedIn =
    isCustomerLoggedIn;

window.requireCustomerLogin =
    requireCustomerLogin;

window.openAuthModal =
    openAuthModal;

window.openCustomerAuthModal =
    openCustomerAuthModal;

window.closeAuthModal =
    closeAuthModal;

window.closeGlobalAuthModal =
    closeGlobalAuthModal;

window.switchAuthTab =
    switchAuthTab;

window.switchGlobalAuthTab =
    switchGlobalAuthTab;

window.handleModalLogin =
    handleModalLogin;

window.handleGlobalLogin =
    handleGlobalLogin;

window.handleModalRegister =
    handleModalRegister;

window.handleGlobalRegister =
    handleGlobalRegister;

window.quickFillAndLogin =
    quickFillAndLogin;

window.gamQuickLogin =
    gamQuickLogin;

window.redirectAfterLogin =
    redirectAfterLogin;

window.customerLogout =
    customerLogout;

window.renderCustomerNavbar =
    renderCustomerNavbar;

window.renderCustomerFooter =
    renderCustomerFooter;

window.showToast =
    showToast;

window.formatVND =
    formatVND;

window.getCategoryBadge =
    getCategoryBadge;

// ============================================================
// CUSTOMER FAVORITE PROVIDERS
// ============================================================
let favoriteProviderIds = new Set();
let favoriteProviderIdsLoaded = false;

async function loadFavoriteProviderIds() {
  const user = getCurrentCustomer();
  if (!user || user.role !== 'Customer') {
    favoriteProviderIds = new Set();
    favoriteProviderIdsLoaded = true;
    syncFavoriteButtons();
    return favoriteProviderIds;
  }
  const result = await apiRequest('/api/providers/favorites');
  if (result.success) {
    favoriteProviderIds = new Set(result.providerIds || []);
    favoriteProviderIdsLoaded = true;
    syncFavoriteButtons();
  }
  return favoriteProviderIds;
}

function syncFavoriteButtons() {
  document.querySelectorAll('[data-favorite-provider]').forEach(button => {
    const isFavorite = favoriteProviderIds.has(button.dataset.favoriteProvider);
    button.setAttribute('aria-pressed', String(isFavorite));
    button.title = isFavorite ? 'Bỏ khỏi yêu thích' : 'Thêm vào yêu thích';
    button.classList.toggle('is-favorite', isFavorite);
    const icon = button.querySelector('i');
    if (icon) icon.className = `${isFavorite ? 'fa-solid' : 'fa-regular'} fa-heart`;
    const label = button.querySelector('[data-favorite-label]');
    if (label) label.textContent = isFavorite ? 'Đã yêu thích' : 'Thêm vào yêu thích';
  });
}

async function toggleFavoriteProvider(providerId, button = null) {
  if (!requireCustomerLogin()) return;
  if (!favoriteProviderIdsLoaded) await loadFavoriteProviderIds();
  const isFavorite = favoriteProviderIds.has(providerId);
  if (button) button.disabled = true;
  try {
    const result = await apiRequest(`/api/providers/${encodeURIComponent(providerId)}/favorite`, {
      method: isFavorite ? 'DELETE' : 'PUT'
    });
    if (!result.success) throw new Error(result.message || 'Không thể cập nhật danh sách yêu thích.');
    if (isFavorite) favoriteProviderIds.delete(providerId);
    else favoriteProviderIds.add(providerId);
    syncFavoriteButtons();
    if (typeof renderFavoriteProviders === 'function') renderFavoriteProviders();
    showToast(isFavorite ? 'Đã cập nhật' : 'Đã lưu Provider', result.message, 'success');
  } catch (error) {
    showToast('Chưa cập nhật được', error.message || 'Vui lòng thử lại.', 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

window.loadFavoriteProviderIds = loadFavoriteProviderIds;
window.syncFavoriteButtons = syncFavoriteButtons;
window.toggleFavoriteProvider = toggleFavoriteProvider;

// ============================================================
// FLOATING CHAT WIDGET (Matching Design Screenshot)
// ============================================================
let activeFloatingChat = { providerId: 'PRV001', userId: 'USR001', name: 'Nguyễn Văn An', specialty: '', avatar: '' };

function initFloatingChat(targetProviderId = 'PRV001', targetProviderName = 'Nguyễn Văn An', specialty = '', avatar = '') {
  activeFloatingChat = { providerId: targetProviderId || 'PRV001', userId: '', name: targetProviderName || 'Chuyên gia', specialty: specialty || '', avatar: avatar || '' };
  let widget = document.getElementById('srFloatingChatContainer');
  if (!widget) {
    widget = document.createElement('div');
    widget.id = 'srFloatingChatContainer';
    document.body.appendChild(widget);
  }

  widget.innerHTML = `
    <!-- Floating Trigger Button (Pill at bottom right) -->
    <div id="srChatTriggerBtn" onclick="toggleFloatingChat()" style="position:fixed; bottom:24px; right:24px; z-index:9990; background:#16A34A; color:#FFFFFF; padding:11px 20px; border-radius:9999px; display:flex; align-items:center; gap:8px; font-weight:700; font-size:14px; cursor:pointer; box-shadow:0 4px 16px rgba(22,163,74,0.4); transition:all 0.2s ease;">
      <i class="fa-solid fa-comments"></i>
      <span>Tin nhắn</span>
      <span style="width:8px; height:8px; background:#4ADE80; border-radius:50%; display:inline-block;"></span>
    </div>

    <!-- Floating Chat Window (Popup matching screenshot) -->
    <div id="srChatWindow" style="display:none; position:fixed; bottom:80px; right:24px; width:360px; height:500px; max-width:calc(100vw - 32px); background:#FFFFFF; border:1px solid #E2E8F0; border-radius:16px; box-shadow:0 12px 36px rgba(15,23,42,0.18); z-index:9995; flex-direction:column; overflow:hidden; font-family:'Inter', sans-serif;">
      
      <!-- Chat Header -->
      <div style="background:#FFFFFF; border-bottom:1px solid #E2E8F0; padding:12px 16px; display:flex; align-items:center; justify-content:space-between;">
        <div style="font-weight:700; font-size:15px; color:#0F172A;">Tin nhắn</div>
        <button type="button" onclick="toggleFloatingChat(false)" style="background:none; border:none; color:#94A3B8; font-size:16px; cursor:pointer; padding:4px;" title="Đóng">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <!-- Active Contact Bar (matching screenshot) -->
      <div style="background:#F0FDF4; border-bottom:1px solid #DCFCE7; padding:8px 14px; display:flex; align-items:center; gap:10px;">
        <div style="position:relative;">
          <img id="srChatPartnerAvatar" src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100" style="width:32px; height:32px; border-radius:50%; object-fit:cover;">
          <span style="position:absolute; bottom:0; right:0; width:8px; height:8px; background:#16A34A; border-radius:50%; border:1.5px solid #FFF;"></span>
        </div>
        <div style="flex:1;">
          <div id="srChatPartnerName" style="font-weight:700; font-size:13px; color:#0F172A;">Đang tải chuyên gia...</div>
          <div id="srChatPartnerRole" style="font-size:11px; color:#16A34A; font-weight:500;">Tin nhắn được đồng bộ với hộp thư</div>
        </div>
        <a id="srChatFullPageLink" href="customer_chat.html" style="font-size:11px;color:#15803d;font-weight:700;text-decoration:none">Mở hộp thư <i class="fa-solid fa-arrow-up-right-from-square"></i></a>
      </div>

      <!-- Messages Body -->
      <div id="srChatMessagesList" style="flex:1; padding:16px; overflow-y:auto; display:flex; flex-direction:column; gap:12px; background:#FAFAFA;">
        <div style="margin:auto;text-align:center;color:#94A3B8;font-size:12px">Đang tải hội thoại…</div>
      </div>

      <!-- Chat Input Area -->
      <form id="srChatForm" onsubmit="handleSendFloatingMessage(event)" style="border-top:1px solid #E2E8F0; padding:10px 12px; display:flex; align-items:center; gap:8px; background:#FFFFFF;">
        <input type="text" id="srChatInput" placeholder="Nhập tin nhắn..." style="flex:1; border:1px solid #E2E8F0; border-radius:8px; padding:9px 12px; font-size:13px; outline:none; font-family:inherit; transition:border 0.2s;" onfocus="this.style.borderColor='#16A34A'" onblur="this.style.borderColor='#E2E8F0'">
        <button type="submit" style="background:#16A34A; color:#FFFFFF; border:none; border-radius:8px; padding:9px 16px; font-size:13px; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:6px;">
          Gửi
        </button>
      </form>
    </div>
  `;
  const partnerName = document.getElementById('srChatPartnerName');
  const partnerRole = document.getElementById('srChatPartnerRole');
  const partnerAvatar = document.getElementById('srChatPartnerAvatar');
  if (partnerName) partnerName.textContent = activeFloatingChat.name;
  if (partnerRole) partnerRole.textContent = activeFloatingChat.specialty || 'Tin nhắn được đồng bộ với hộp thư';
  if (partnerAvatar && activeFloatingChat.avatar) partnerAvatar.src = activeFloatingChat.avatar;
  const fullPageLink = document.getElementById('srChatFullPageLink');
  if (fullPageLink) fullPageLink.href = `customer_chat.html?with=${encodeURIComponent(activeFloatingChat.providerId)}`;
  resolveFloatingChatProvider();
}

async function resolveFloatingChatProvider() {
  const target = activeFloatingChat;
  const response = await apiRequest(`/api/providers/${encodeURIComponent(target.providerId)}`);
  if (target !== activeFloatingChat || !response.success || !response.provider) return;
  const provider = response.provider;
  target.userId = provider.userId || provider.id;
  target.name = provider.name || target.name;
  target.specialty = provider.specialty || target.specialty;
  target.avatar = provider.avatar || target.avatar;
  const name = document.getElementById('srChatPartnerName');
  const role = document.getElementById('srChatPartnerRole');
  const avatarImage = document.getElementById('srChatPartnerAvatar');
  if (name) name.textContent = target.name;
  if (role) role.textContent = target.specialty;
  if (avatarImage) avatarImage.src = target.avatar || avatarImage.src;
  await loadFloatingChatMessages();
}

async function loadFloatingChatMessages() {
  const target = activeFloatingChat;
  const list = document.getElementById('srChatMessagesList');
  if (!list) return;
  if (!target.userId) {
    list.innerHTML = '<div style="margin:auto;text-align:center;color:#64748B;font-size:12px">Không tải được thông tin chuyên gia.</div>';
    return;
  }
  const user = getCurrentCustomer();
  if (!user || user.role !== 'Customer') return;
  const result = await apiRequest(`/api/chat?user1=${encodeURIComponent(user.id)}&user2=${encodeURIComponent(target.userId)}`);
  if (target !== activeFloatingChat || !document.getElementById('srChatMessagesList')) return;
  const messages = result.success ? (result.messages || []) : [];
  list.replaceChildren();
  if (!messages.length) {
    list.innerHTML = '<div style="margin:auto;text-align:center;color:#94A3B8;font-size:12px">Chưa có tin nhắn. Hãy bắt đầu cuộc trò chuyện!</div>';
    return;
  }
  messages.forEach(message => {
    const bubble = document.createElement('div');
    bubble.style.cssText = `align-self:${message.fromUserId === user.id ? 'flex-end' : 'flex-start'};max-width:84%;`;
    const body = document.createElement('div');
    body.textContent = message.text || '';
    body.style.cssText = message.fromUserId === user.id
      ? 'background:#DCFCE7;color:#14532D;padding:10px 14px;border-radius:14px 14px 2px 14px;font-size:13px;line-height:1.4;white-space:pre-wrap;overflow-wrap:anywhere;'
      : 'background:#FFF;border:1px solid #E2E8F0;color:#1E293B;padding:10px 14px;border-radius:14px 14px 14px 2px;font-size:13px;line-height:1.4;white-space:pre-wrap;overflow-wrap:anywhere;';
    const time = document.createElement('div');
    time.textContent = message.time || '';
    time.style.cssText = 'font-size:10px;color:#94A3B8;margin-top:4px;';
    bubble.append(body, time);
    list.appendChild(bubble);
  });
  list.scrollTop = list.scrollHeight;
}

function toggleFloatingChat(show = null) {
  let win = document.getElementById('srChatWindow');
  const willOpen = show === true || (show === null && (!win || win.style.display === 'none' || !win.style.display));
  if (willOpen && !requireCustomerLogin()) return;
  if (!win) {
    initFloatingChat();
    win = document.getElementById('srChatWindow');
  }
  if (show === null) {
    const isHidden = win.style.display === 'none' || !win.style.display;
    win.style.display = isHidden ? 'flex' : 'none';
  } else {
    win.style.display = show ? 'flex' : 'none';
  }
  if (win.style.display === 'flex') {
    resolveFloatingChatProvider();
    const input = document.getElementById('srChatInput');
    if (input) input.focus();
    const list = document.getElementById('srChatMessagesList');
    if (list) list.scrollTop = list.scrollHeight;
  }
}

async function handleSendFloatingMessage(e) {
  if (e) e.preventDefault();
  if (!requireCustomerLogin()) return;
  const currentUser = getCurrentCustomer();
  const input = document.getElementById('srChatInput');
  const text = (input ? input.value : '').trim();
  if (!text || !activeFloatingChat.userId) return;
  const sendButton = document.querySelector('#srChatForm button[type="submit"]');
  if (sendButton) sendButton.disabled = true;
  try {
    const result = await apiRequest('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        fromUserId: currentUser.id,
        toUserId: activeFloatingChat.userId,
        text: text
      })
    });
    if (!result.success) throw new Error(result.message || 'Không thể gửi tin nhắn.');
    input.value = '';
    await loadFloatingChatMessages();
  } catch (err) {
    showToast('Chưa gửi được', err.message || 'Vui lòng thử lại.', 'error');
  } finally {
    if (sendButton) sendButton.disabled = false;
  }
}

function openChatWithProvider(providerId, providerName, specialty, avatar) {
  if (!requireCustomerLogin()) return;
  initFloatingChat(providerId, providerName, specialty, avatar);
  toggleFloatingChat(true);
}

window.initFloatingChat = initFloatingChat;
window.toggleFloatingChat = toggleFloatingChat;
window.handleSendFloatingMessage = handleSendFloatingMessage;
window.openChatWithProvider = openChatWithProvider;
