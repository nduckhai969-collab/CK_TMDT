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

const API_BASE = (() => {
  if (typeof window === 'undefined') return '';
  if (window.SKILLRENTAL_API_BASE !== undefined) return String(window.SKILLRENTAL_API_BASE).replace(/\/$/, '');
  const { protocol, hostname, port } = window.location;
  if (!/^https?:$/.test(protocol)) return 'http://localhost:3000';
  if (!port || port === '3000' || (protocol === 'https:' && port === '443')) return '';
  return `${protocol}//${hostname}:3000`;
})();

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
      (window.SkillAuth ? SkillAuth.logout() : localStorage.removeItem(SESSION_KEY));
      return null;
    }
    return user;
  } catch (error) {
    console.error('Session data không hợp lệ:', error);
    (window.SkillAuth ? SkillAuth.logout() : localStorage.removeItem(SESSION_KEY));
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

  (window.SkillAuth ? SkillAuth.logout() : localStorage.removeItem(SESSION_KEY));
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


    const requestOptions = { ...options, headers };
    const body = requestOptions.body;
    if (body && typeof body === 'object') {
      const prototype = Object.getPrototypeOf(body);
      if (prototype === Object.prototype || prototype === null) {
        requestOptions.body = JSON.stringify(body);
      }
    }

    const response =
        await fetch(
            `${API_BASE}${endpoint}`,
            requestOptions
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

  const markup = `
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

    <!-- RIGHT BAR: SEARCH + NOTIFICATION + CART + VNPay + USER -->
    <div style="display:flex; align-items:center; gap:16px;">
      <!-- Header search -->
      <div style="position:relative; width:180px;">
        <input type="text" id="navSearchInput" placeholder="Tìm chuyên gia..." onkeyup="if(event.key==='Enter') handleNavSearch()" style="width:100%; padding:6px 30px 6px 12px; font-size:12.5px; border:1px solid #E2E8F0; border-radius:9999px; outline:none; background:#F8FAFC; color:#0F172A; transition:all .2s;" onfocus="this.style.borderColor='#16A34A'; this.style.background='#FFF'" onblur="this.style.borderColor='#E2E8F0'; this.style.background='#F8FAFC'">
        <i class="fa-solid fa-magnifying-glass" onclick="handleNavSearch()" style="position:absolute; right:10px; top:50%; transform:translateY(-50%); color:#16A34A; font-size:12px; cursor:pointer;"></i>
      </div>

      <!-- Nạp VNPay -->
      <a href="customer_wallet.html?vnpay=1" style="display:inline-flex; align-items:center; gap:6px; background:#16A34A; color:#FFF; font-size:12.5px; font-weight:600; padding:6px 12px; border-radius:8px; text-decoration:none;">
        <i class="fa-solid fa-wallet"></i> Nạp VNPay
      </a>

      <!-- Giỏ hàng (Cart) -->
      <a href="customer_cart.html" style="background:none; border:none; color:#64748B; font-size:15px; cursor:pointer; padding:6px; position:relative; text-decoration:none;" title="Giỏ hàng">
        <i class="fa-solid fa-cart-shopping"></i>
        <span id="customerCartCount" aria-label="Số dịch vụ trong giỏ" style="display:none; position:absolute; top:2px; right:0px; min-width:14px; height:14px; padding:0 2px; box-sizing:border-box; background:#F59E0B; color:#fff; border-radius:999px; font-size:9px; line-height:14px; text-align:center; font-weight:700;"></span>
      </a>

      <!-- Notification Bell -->
      <div style="position:relative;">
        <button type="button" aria-label="Thông báo" aria-expanded="false" onclick="toggleCustomerNotifications()" style="background:none; border:none; color:#64748B; font-size:15px; cursor:pointer; padding:6px; position:relative;" title="Thông báo">
          <i class="fa-regular fa-bell"></i>
          <span id="customerNotificationBadge" style="display:none;position:absolute;top:1px;right:0;min-width:15px;height:15px;padding:0 3px;box-sizing:border-box;background:#EF4444;color:#fff;border-radius:999px;font-size:9px;line-height:15px;text-align:center;font-weight:700;"></span>
        </button>
        <!-- Dropdown Thông báo -->
        <div id="notifDropdown" style="display:none; position:absolute; top:calc(100% + 8px); right:-50px; width:min(340px, calc(100vw - 24px)); background:#FFFFFF; border:1px solid #E2E8F0; border-radius:12px; box-shadow:0 10px 25px rgba(15,23,42,.1); z-index:2000;">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:12px;border-bottom:1px solid #F1F5F9;"><strong style="font-size:13px;">Thông báo</strong><button type="button" onclick="markAllCustomerNotificationsRead()" style="border:0;background:none;color:#16A34A;font-size:11px;font-weight:600;cursor:pointer;">Đánh dấu đã đọc</button></div>
          <div id="customerNotificationList" style="max-height:330px;overflow-y:auto;"><div style="padding:18px;text-align:center;color:#64748B;font-size:12px;">Đang tải thông báo...</div></div>
        </div>
      </div>

      ${user ? `<!-- User Profile -->
      <div style="position:relative;">
        <button type="button" id="customerAccountButton" onclick="toggleCustomerAccountMenu()" style="display:flex; align-items:center; gap:8px; padding:3px 8px 3px 3px; border:1px solid transparent; border-radius:9999px; background:transparent; cursor:pointer;" onmouseover="this.style.background='#F1F5F9'" onmouseout="this.style.background='transparent'">
          ${renderCustomerNavbarAvatar(user, 28)}
          <span style="font-weight:700; font-size:13px; color:#0F172A;">${escapeCustomerNavbarValue(user.name || 'Tài khoản')}</span>
          <i class="fa-solid fa-chevron-down" style="font-size:10px; color:#94A3B8;"></i>
        </button>

        <!-- Dropdown Menu -->
        <div id="customerAccountMenu" style="display:none; position:absolute; top:calc(100% + 8px); right:0; width:210px; background:#FFFFFF; border:1px solid #E2E8F0; border-radius:12px; box-shadow:0 10px 25px rgba(15,23,42,.1); padding:8px; z-index:2000;">
          <div style="padding:8px 10px; border-bottom:1px solid #F1F5F9; margin-bottom:6px;">
            <div style="font-weight:700; font-size:13px; color:#0F172A;">${escapeCustomerNavbarValue(user.name || 'Tài khoản')}</div>
            <div id="customerAccountBalance" style="font-size:11px; color:#64748B;">Số dư: Đang tải...</div>
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
  setTimeout(refreshCustomerCartBadge, 0);
  setTimeout(refreshCustomerNotificationBadge, 0);
  setTimeout(refreshCustomerAccountSummary, 0);
  return markup;
}

function escapeCustomerNavbarValue(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
}

function renderCustomerNavbarAvatar(user, size = 28) {
  const name = String(user?.name || '').trim();
  const initials = name ? name.split(/\s+/).slice(-2).map(part => Array.from(part)[0]).join('').toUpperCase() : '•';
  const common = `width:${size}px;height:${size}px;flex:0 0 ${size}px;border-radius:50%;border:1.5px solid #E2E8F0;`;
  if (user?.avatar) {
    const avatarUrl = escapeCustomerNavbarValue(user.avatar);
    return `<span style="position:relative;display:inline-block;${common}"><img src="${avatarUrl}" alt="Ảnh đại diện của ${escapeCustomerNavbarValue(name || 'tài khoản')}" onerror="this.style.display='none';this.nextElementSibling.style.display='inline-flex'" style="position:absolute;inset:0;${common}object-fit:cover;"><span aria-hidden="true" style="${common}display:none;align-items:center;justify-content:center;background:#DCFCE7;color:#15803D;font-size:11px;font-weight:800;">${escapeCustomerNavbarValue(initials)}</span></span>`;
  }
  return `<span aria-label="Ảnh đại diện ${escapeCustomerNavbarValue(name || 'tài khoản')}" style="${common}display:inline-flex;align-items:center;justify-content:center;background:#DCFCE7;color:#15803D;font-size:11px;font-weight:800;">${escapeCustomerNavbarValue(initials)}</span>`;
}

async function refreshCustomerCartBadge() {
  const badge = document.getElementById('customerCartCount');
  if (!badge) return;
  const customer = getCurrentCustomer();
  if (!customer || customer.role !== 'Customer') {
    badge.style.display = 'none';
    return;
  }
  const result = await apiRequest('/api/booking-list');
  if (!badge.isConnected) return;
  const count = result.success && result.bookingList
    ? (result.bookingList.items || []).reduce((sum, item) => sum + (Number(item.hours) || 1), 0)
    : 0;
  badge.textContent = count > 99 ? '99+' : String(count);
  badge.style.display = count ? 'flex' : 'none';
  badge.setAttribute('aria-label', `${count} dịch vụ trong giỏ`);
}

async function refreshCustomerNotificationBadge() {
  const badge = document.getElementById('customerNotificationBadge');
  if (!badge) return;
  const user = getCurrentCustomer();
  if (!user) {
    badge.style.display = 'none';
    return;
  }
  const result = await apiRequest('/api/notifications');
  if (!badge.isConnected) return;
  const unread = result.success ? (result.notifications || []).filter(item => !item.isRead).length : 0;
  badge.textContent = unread > 99 ? '99+' : String(unread);
  badge.style.display = unread ? 'block' : 'none';
}

async function refreshCustomerAccountSummary() {
  const balanceLabel = document.getElementById('customerAccountBalance');
  if (!balanceLabel) return;
  const cachedUser = getCurrentCustomer();
  if (!cachedUser) return;
  const result = await apiRequest('/api/auth/me');
  if (!result.success || !result.user || !balanceLabel.isConnected) {
    balanceLabel.textContent = 'Số dư: Chưa tải được';
    return;
  }
  const freshUser = { ...cachedUser, ...result.user };
  setCurrentCustomer(freshUser);
  balanceLabel.textContent = `Số dư: ${formatVND(Number(freshUser.balance) || 0)}`;
}

async function toggleCustomerNotifications() {
  const dropdown = document.getElementById('notifDropdown');
  const button = document.querySelector('[aria-label="Thông báo"]');
  if (!dropdown) return;
  const opening = dropdown.style.display !== 'block';
  dropdown.style.display = opening ? 'block' : 'none';
  if (button) button.setAttribute('aria-expanded', String(opening));
  if (opening) await loadCustomerNotifications();
}

async function loadCustomerNotifications() {
  const list = document.getElementById('customerNotificationList');
  if (!list) return;
  const user = getCurrentCustomer();
  if (!user) {
    list.innerHTML = '<div style="padding:18px;text-align:center;color:#64748B;font-size:12px;">Đăng nhập để xem thông báo.</div>';
    return;
  }
  list.innerHTML = '<div style="padding:18px;text-align:center;color:#64748B;font-size:12px;">Đang tải thông báo...</div>';
  const result = await apiRequest('/api/notifications');
  if (!result.success) {
    list.innerHTML = `<div style="padding:18px;text-align:center;color:#64748B;font-size:12px;">${escapeCustomerNavbarValue(result.message || 'Không thể tải thông báo.')}</div>`;
    return;
  }
  const notifications = result.notifications || [];
  window.customerNotificationsCache = notifications;
  if (!notifications.length) {
    list.innerHTML = '<div style="padding:22px 14px;text-align:center;color:#64748B;font-size:12px;"><i class="fa-regular fa-bell-slash" style="display:block;font-size:20px;margin-bottom:8px;color:#CBD5E1"></i>Chưa có thông báo.</div>';
    await refreshCustomerNotificationBadge();
    return;
  }
  const iconByType = { success:'fa-circle-check', warning:'fa-triangle-exclamation', error:'fa-circle-exclamation', info:'fa-circle-info' };
  const colorByType = { success:'#16A34A', warning:'#D97706', error:'#DC2626', info:'#3B82F6' };
  list.innerHTML = notifications.slice(0, 20).map(item => {
    const icon = iconByType[item.type] || iconByType.info;
    const color = colorByType[item.type] || colorByType.info;
    const detailAction = `<button type="button" onclick="openCustomerNotification('${escapeCustomerNavbarValue(item.id)}')" style="margin-top:7px;padding:0;border:0;background:none;color:#15803D;font-size:11px;font-weight:700;cursor:pointer;">Xem chi tiết</button>`;
    return `<article style="display:flex;gap:10px;padding:12px;border-bottom:1px solid #F1F5F9;background:${item.isRead ? '#fff' : '#F0FDF4'};font-size:12px;"><i class="fa-solid ${icon}" style="color:${color};margin-top:2px;"></i><div style="min-width:0;flex:1;"><strong style="color:#0F172A;">${escapeCustomerNavbarValue(item.title || 'Thông báo')}</strong><div style="color:#475569;margin-top:3px;line-height:1.45;">${escapeCustomerNavbarValue(item.message || '')}</div><div style="color:#94A3B8;font-size:10px;margin-top:5px;">${escapeCustomerNavbarValue(item.createdAt || '')}</div>${detailAction}</div>${item.isRead ? '' : `<button type="button" aria-label="Đánh dấu đã đọc" title="Đánh dấu đã đọc" onclick="markCustomerNotificationRead('${escapeCustomerNavbarValue(item.id)}')" style="align-self:flex-start;border:0;background:none;color:#16A34A;cursor:pointer;padding:2px;"><i class="fa-solid fa-check"></i></button>`}</article>`;
  }).join('');
  await refreshCustomerNotificationBadge();
}

async function markCustomerNotificationRead(notificationId) {
  const result = await apiRequest(`/api/notifications/${encodeURIComponent(notificationId)}/read`, { method: 'PUT' });
  if (result.success) await loadCustomerNotifications();
}

function ensureCustomerNotificationDetailModal() {
  let modal = document.getElementById('customerNotificationDetailModal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'customerNotificationDetailModal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'customerNotificationDetailTitle');
  modal.style.cssText = 'display:none;position:fixed;inset:0;z-index:5000;background:rgba(15,23,42,.48);align-items:center;justify-content:center;padding:16px;';
  modal.innerHTML = '<section style="width:min(480px,100%);max-height:80vh;overflow:auto;background:#fff;border:1px solid #E2E8F0;border-radius:16px;box-shadow:0 24px 60px rgba(15,23,42,.22);padding:20px;"><div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;"><h2 id="customerNotificationDetailTitle" style="margin:0;color:#0F172A;font-size:18px;line-height:1.4;"></h2><button type="button" onclick="closeCustomerNotificationDetail()" aria-label="Đóng" style="border:0;background:#F1F5F9;color:#475569;border-radius:8px;width:32px;height:32px;cursor:pointer;flex:0 0 auto;"><i class="fa-solid fa-xmark"></i></button></div><div id="customerNotificationDetailDate" style="margin-top:8px;color:#94A3B8;font-size:12px;"></div><p id="customerNotificationDetailMessage" style="margin:16px 0 0;color:#334155;font-size:14px;line-height:1.65;white-space:pre-wrap;overflow-wrap:anywhere;"></p><div style="display:flex;justify-content:flex-end;gap:8px;margin-top:22px;"><a id="customerNotificationRelatedLink" href="#" style="display:none;align-items:center;gap:7px;padding:9px 13px;border-radius:8px;background:#16A34A;color:#fff;text-decoration:none;font-size:13px;font-weight:700;">Đi tới trang liên quan <i class="fa-solid fa-arrow-up-right-from-square"></i></a><button type="button" onclick="closeCustomerNotificationDetail()" style="padding:9px 13px;border:1px solid #E2E8F0;border-radius:8px;background:#fff;color:#475569;font-size:13px;font-weight:600;cursor:pointer;">Đóng</button></div></section>';
  modal.addEventListener('click', event => { if (event.target === modal) closeCustomerNotificationDetail(); });
  document.body.appendChild(modal);
  return modal;
}

function closeCustomerNotificationDetail() {
  const modal = document.getElementById('customerNotificationDetailModal');
  if (modal) modal.style.display = 'none';
}

async function openCustomerNotification(notificationId) {
  const notification = (window.customerNotificationsCache || []).find(item => String(item.id) === String(notificationId));
  if (!notification) return;
  const modal = ensureCustomerNotificationDetailModal();
  document.getElementById('customerNotificationDetailTitle').textContent = notification.title || 'Thông báo';
  document.getElementById('customerNotificationDetailMessage').textContent = notification.message || 'Không có nội dung chi tiết.';
  document.getElementById('customerNotificationDetailDate').textContent = notification.createdAt || '';
  const relatedLink = document.getElementById('customerNotificationRelatedLink');
  relatedLink.style.display = 'none';
  relatedLink.removeAttribute('href');
  relatedLink.innerHTML = 'Đi tới trang liên quan <i class="fa-solid fa-arrow-up-right-from-square"></i>';
  if (notification.detailsUrl) {
    try {
      const target = new URL(notification.detailsUrl, window.location.origin);
      if (target.origin === window.location.origin) {
        relatedLink.href = target.href;
        if (target.searchParams.get('action') === 'pay') {
          relatedLink.innerHTML = '<i class="fa-solid fa-shield-halved"></i> Thanh toán ký quỹ ngay';
        }
        relatedLink.style.display = 'inline-flex';
      }
    } catch (_) {}
  }
  modal.style.display = 'flex';
  const result = await apiRequest(`/api/notifications/${encodeURIComponent(notificationId)}/read`, { method: 'PUT' });
  if (result.success) {
    notification.isRead = true;
    await loadCustomerNotifications();
  }
}

async function markAllCustomerNotificationsRead() {
  const result = await apiRequest('/api/notifications/read-all', { method: 'PUT' });
  if (result.success) await loadCustomerNotifications();
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

                <div style="text-align:center; margin:16px 0; font-size:12px; color:#94A3B8; position:relative;">
                    <hr style="border:none; border-top:1px solid #E2E8F0; position:absolute; top:50%; width:100%; margin:0; z-index:1;">
                    <span style="background:#FFF; padding:0 12px; position:relative; z-index:2;">HOẶC TIẾP TỤC VỚI</span>
                </div>

                <button
                    type="button"
                    id="loginGoogleBtn"
                    onclick="handleGoogleLogin(event)"
                    style="
                        width:100%;
                        height:44px;
                        background:#FFFFFF;
                        color:#334155;
                        border:1px solid #CBD5E1;
                        border-radius:8px;
                        font-weight:600;
                        font-size:14px;
                        cursor:pointer;
                        display:flex;
                        align-items:center;
                        justify-content:center;
                        gap:10px;
                        transition:all .2s ease;
                        box-sizing:border-box;
                    "
                    onmouseover="this.style.background='#F8FAFC';this.style.borderColor='#94A3B8';"
                    onmouseout="this.style.background='#FFFFFF';this.style.borderColor='#CBD5E1';"
                >
                    <i class="fa-brands fa-google" style="color:#DB4437; font-size:16px;"></i>
                    Đăng Nhập Bằng Google
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

                <div style="text-align:center; margin:16px 0; font-size:12px; color:#94A3B8; position:relative;">
                    <hr style="border:none; border-top:1px solid #E2E8F0; position:absolute; top:50%; width:100%; margin:0; z-index:1;">
                    <span style="background:#FFF; padding:0 12px; position:relative; z-index:2;">HOẶC ĐĂNG KÝ NHANH</span>
                </div>

                <button
                    type="button"
                    id="registerGoogleBtn"
                    onclick="handleGoogleLogin(event, true)"
                    style="
                        width:100%;
                        height:44px;
                        background:#FFFFFF;
                        color:#334155;
                        border:1px solid #CBD5E1;
                        border-radius:8px;
                        font-weight:600;
                        font-size:14px;
                        cursor:pointer;
                        display:flex;
                        align-items:center;
                        justify-content:center;
                        gap:10px;
                        transition:all .2s ease;
                        box-sizing:border-box;
                    "
                    onmouseover="this.style.background='#F8FAFC';this.style.borderColor='#94A3B8';"
                    onmouseout="this.style.background='#FFFFFF';this.style.borderColor='#CBD5E1';"
                >
                    <i class="fa-brands fa-google" style="color:#DB4437; font-size:16px;"></i>
                    Đăng Ký Nhanh Bằng Google
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
  }

  const fbModal = document.getElementById('authModal');
  if (fbModal) {
    fbModal.classList.remove('active');
  }

  document.body.style.overflow =
      '';
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
    if (!window.SkillAuth) throw new Error('Firebase Authentication chưa sẵn sàng.');
    const result = await SkillAuth.register({ name, email, phone, password, role });
    if (!result.success) {
      showToast('Đăng Ký Thất Bại', result.message || 'Không thể tạo tài khoản!', 'error');
      return;
    }
    if (result.verifyEmail) {
      const emailLabel = document.getElementById('verifyNoticeEmail');
      const loginEmail = document.getElementById('loginEmail');
      const verifyMessage = document.getElementById('verifyNoticeMessage');
      if (emailLabel) emailLabel.textContent = result.email || email;
      if (loginEmail) loginEmail.value = result.email || email;
      if (verifyMessage && !result.verificationSent) {
        verifyMessage.textContent = 'Firebase chưa gửi được email kích hoạt. Bấm “Gửi Lại Email Xác Nhận” bên dưới; sau khi nhận thư, nhấn liên kết xác minh rồi quay lại đăng nhập.';
      }
      showToast(result.verificationSent ? 'Đã gửi email kích hoạt' : 'Chưa gửi được email kích hoạt', result.message || 'Hãy mở email, nhấn liên kết xác minh rồi quay lại đăng nhập.', result.verificationSent ? 'success' : 'warning');
      switchAuthTab('verify');
      return;
    }
    showToast('Tạo tài khoản thành công', result.message || 'Đăng ký thành công.', 'success');
    closeAuthModal();
  } catch (error) {
    console.error('Không thể đăng ký tài khoản:', error);
    showToast('Không thể đăng ký', error.message || 'Vui lòng thử lại khi có kết nối.', 'error');
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
// GOOGLE SIGN-IN CHO CUSTOMER MODAL
// ============================================================

async function handleGoogleLogin(e, isRegister = false) {
  if (e) e.preventDefault();

  const googleBtn = isRegister
      ? document.getElementById('registerGoogleBtn')
      : document.getElementById('loginGoogleBtn');

  const origContent = googleBtn ? googleBtn.innerHTML : '';
  if (googleBtn) {
    googleBtn.disabled = true;
    googleBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang kết nối Google...';
  }

  try {
    if (!window.SkillAuth || typeof window.SkillAuth.loginWithGoogle !== 'function') {
      throw new Error('Tính năng đăng nhập Google chưa được kích hoạt hoặc chưa tải xong. Vui lòng tải lại trang.');
    }

    const selectedRole = isRegister
      ? (document.querySelector('input[name="regRole"]:checked')?.value || 'Customer')
      : undefined;

    const data = await window.SkillAuth.loginWithGoogle(selectedRole);

    if (data.success && data.user) {
      setCurrentCustomer(data.user);
      showToast('Đăng Nhập Thành Công!', `Chào mừng ${data.user.name || 'bạn'}.`, 'success');
      closeAuthModal();
      setTimeout(() => {
        redirectAfterLogin(data.user);
      }, 300);
      return;
    }

    if (data.code === 'NO_PROFILE' && data.googleUser) {
      switchAuthTab('register');
      const regName = document.getElementById('regName');
      const regEmail = document.getElementById('regEmail');
      const regPhone = document.getElementById('regPhone');
      if (regName) regName.value = data.googleUser.name || '';
      if (regEmail) { regEmail.value = data.googleUser.email || ''; regEmail.readOnly = true; }
      if (regPhone) regPhone.value = data.googleUser.phone || '';

      const pwdField = document.getElementById('regPassword');
      if (pwdField) {
        const pwdGroup = pwdField.closest('div');
        if (pwdGroup) pwdGroup.style.display = 'none';
        pwdField.removeAttribute('required');
      }

      const form = document.getElementById('registerForm');
      if (form) {
        form.onsubmit = async (evt) => {
          evt.preventDefault();
          const role = document.querySelector('input[name="regRole"]:checked')?.value || 'Customer';
          data.googleUser.phone = document.getElementById('regPhone')?.value?.trim();
          data.googleUser.name = document.getElementById('regName')?.value?.trim();
          const res = await window.SkillAuth.registerGoogleProfile(role, data.googleUser);
          if (res.success && res.user) {
            setCurrentCustomer(res.user);
            showToast('Tạo Tài Khoản Thành Công!', `Chào mừng bạn với vai trò ${role}.`, 'success');
            closeAuthModal();
            setTimeout(() => redirectAfterLogin(res.user), 300);
          } else {
            showToast('Đăng Ký Thất Bại', res.message || 'Không thể tạo tài khoản!', 'error');
          }
        };
      }
      showToast('Chọn vai trò', 'Vui lòng chọn vai trò để hoàn tất tài khoản Google.', 'info');
      return;
    }

    showToast('Đăng Nhập Thất Bại', data.message || 'Lỗi xác thực Google.', 'error');
  } catch (err) {
    console.error('Google Sign-In Error:', err);
    if (err.code === 'auth/popup-closed-by-user' || (err.message && err.message.includes('popup-closed'))) {
      showToast('Đã hủy', 'Bạn đã đóng cửa sổ đăng nhập Google.', 'info');
    } else {
      showToast('Lỗi Đăng Nhập', err.message || 'Không thể đăng nhập bằng Google. Vui lòng thử lại.', 'error');
    }
  } finally {
    if (googleBtn) {
      googleBtn.disabled = false;
      googleBtn.innerHTML = origContent;
    }
  }
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

window.handleGoogleLogin =
    handleGoogleLogin;

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
let activeFloatingChat = { providerId: '', userId: '', name: '', specialty: '', avatar: '' };

function initFloatingChat(targetProviderId = '', targetProviderName = '', specialty = '', avatar = '') {
  if (!targetProviderId) return;
  activeFloatingChat = { providerId: targetProviderId, userId: '', name: targetProviderName || 'Provider', specialty: specialty || '', avatar: avatar || '' };
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
          <img id="srChatPartnerAvatar" src="" alt="" style="display:none;width:32px;height:32px;border-radius:50%;object-fit:cover;">
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
  if (!target.providerId) return;
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
  if (avatarImage) {
    avatarImage.src = target.avatar || '';
    avatarImage.style.display = target.avatar ? 'block' : 'none';
  }
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
    if (!activeFloatingChat.providerId) return;
    initFloatingChat(activeFloatingChat.providerId, activeFloatingChat.name, activeFloatingChat.specialty, activeFloatingChat.avatar);
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
  if (!providerId) {
    showToast('Chưa chọn Provider', 'Mở hồ sơ Provider trước khi bắt đầu chat.', 'error');
    return;
  }
  initFloatingChat(providerId, providerName, specialty, avatar);
  toggleFloatingChat(true);
}

window.initFloatingChat = initFloatingChat;
window.toggleFloatingChat = toggleFloatingChat;
window.handleSendFloatingMessage = handleSendFloatingMessage;
window.openChatWithProvider = openChatWithProvider;
