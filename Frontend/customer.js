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

    if (!user || !user.id) {

      localStorage.removeItem(SESSION_KEY);

      return null;
    }

    return user;

  } catch (error) {

    console.error(
        'Session data không hợp lệ:',
        error
    );

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

  return getCurrentCustomer() !== null;
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

function renderCustomerNavbar(
    activePage = 'home'
) {

  const user =
      getCurrentCustomer();


  return `

<header
    class="customer-navbar"
    style="
        background:#FFFFFF;
        border-bottom:1px solid #E2E8F0;
        position:sticky;
        top:0;
        z-index:1000;
        box-shadow:0 1px 3px rgba(0,0,0,.03);
    "
>

    <div style="
        max-width:1280px;
        margin:0 auto;
        padding:12px 24px;
        display:flex;
        align-items:center;
        gap:24px;
    ">


        <!-- LOGO -->

        <a
            href="customer.html"
            style="
                display:flex;
                align-items:center;
                gap:10px;
                text-decoration:none;
                flex-shrink:0;
            "
        >

            <div style="
                width:38px;
                height:38px;
                border-radius:10px;
                background:linear-gradient(
                    135deg,
                    #16A34A 0%,
                    #15803D 100%
                );
                color:#FFF;
                display:flex;
                align-items:center;
                justify-content:center;
                font-weight:800;
                font-size:18px;
                box-shadow:
                    0 2px 8px rgba(22,163,74,.3);
            ">
                SR
            </div>


            <div>

                <div style="
                    font-weight:800;
                    font-size:17px;
                    color:#0F172A;
                    letter-spacing:-.5px;
                ">
                    SkillRental
                </div>

                <div style="
                    font-size:10px;
                    color:#16A34A;
                    font-weight:600;
                    text-transform:uppercase;
                    letter-spacing:.4px;
                ">
                    Dịch vụ & Kỹ năng
                </div>

            </div>

        </a>


        <!-- MAIN MENU -->

        <nav style="
            flex:1;
            display:flex;
            align-items:center;
            justify-content:center;
            gap:4px;
        ">


            <!-- KHÁM PHÁ -->

            <a
                href="customer.html"
                style="
                    padding:9px 14px;
                    border-radius:8px;
                    font-weight:600;
                    font-size:13.5px;
                    text-decoration:none;
                    color:${
      activePage === 'home'
          ? '#16A34A'
          : '#475569'
  };
                    background:${
      activePage === 'home'
          ? '#DCFCE7'
          : 'transparent'
  };
                    display:flex;
                    align-items:center;
                    gap:6px;
                    white-space:nowrap;
                "
            >
                <i class="fa-solid fa-compass"></i>
                Khám Phá
            </a>


            <!-- ĐĂNG YÊU CẦU -->

            <a
                href="customer_requests.html"
                onclick="
                    if (!requireCustomerLogin()) {
                        event.preventDefault();
                    }
                "
                style="
                    padding:9px 14px;
                    border-radius:8px;
                    font-weight:600;
                    font-size:13.5px;
                    text-decoration:none;
                    color:${
      activePage === 'requests'
          ? '#16A34A'
          : '#475569'
  };
                    background:${
      activePage === 'requests'
          ? '#DCFCE7'
          : 'transparent'
  };
                    display:flex;
                    align-items:center;
                    gap:6px;
                    white-space:nowrap;
                "
            >
                <i class="fa-solid fa-bullhorn"></i>
                Đăng Yêu Cầu
            </a>


            <!-- ĐƠN HÀNG -->

            <a
                href="customer_orders.html"
                onclick="
                    if (!requireCustomerLogin()) {
                        event.preventDefault();
                    }
                "
                style="
                    padding:9px 14px;
                    border-radius:8px;
                    font-weight:600;
                    font-size:13.5px;
                    text-decoration:none;
                    color:${
      activePage === 'orders'
          ? '#16A34A'
          : '#475569'
  };
                    background:${
      activePage === 'orders'
          ? '#DCFCE7'
          : 'transparent'
  };
                    display:flex;
                    align-items:center;
                    gap:6px;
                    white-space:nowrap;
                "
            >
                <i class="fa-solid fa-receipt"></i>
                Đơn Hàng
            </a>


            <!-- TIN NHẮN -->

            <a
                href="customer_chat.html"
                onclick="
                    if (!requireCustomerLogin()) {
                        event.preventDefault();
                    }
                "
                style="
                    padding:9px 14px;
                    border-radius:8px;
                    font-weight:600;
                    font-size:13.5px;
                    text-decoration:none;
                    color:${
      activePage === 'chat'
          ? '#16A34A'
          : '#475569'
  };
                    background:${
      activePage === 'chat'
          ? '#DCFCE7'
          : 'transparent'
  };
                    display:flex;
                    align-items:center;
                    gap:6px;
                    white-space:nowrap;
                "
            >
                <i class="fa-solid fa-comments"></i>
                Tin Nhắn
            </a>

        </nav>


        <!-- ACCOUNT -->

        ${
      user

          ? `

        <!-- ĐÃ ĐĂNG NHẬP -->

        <div style="
            position:relative;
            flex-shrink:0;
        ">

            <button
                type="button"
                id="customerAccountButton"
                onclick="toggleCustomerAccountMenu()"
                style="
                    display:flex;
                    align-items:center;
                    gap:9px;
                    padding:5px 10px 5px 5px;
                    border:1px solid #E2E8F0;
                    border-radius:10px;
                    background:#FFFFFF;
                    cursor:pointer;
                "
            >

                <img
                    src="${
              user.avatar ||
              'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100'
          }"
                    alt="Avatar"
                    style="
                        width:34px;
                        height:34px;
                        border-radius:50%;
                        object-fit:cover;
                        border:2px solid #DCFCE7;
                    "
                >


                <div style="
                    text-align:left;
                    min-width:80px;
                    max-width:130px;
                ">

                    <div style="
                        font-weight:700;
                        font-size:13px;
                        color:#0F172A;
                        line-height:1.2;
                        overflow:hidden;
                        text-overflow:ellipsis;
                        white-space:nowrap;
                    ">
                        ${user.name || 'Tài khoản'}
                    </div>

                    <div style="
                        font-size:10.5px;
                        color:#16A34A;
                        font-weight:600;
                        margin-top:2px;
                    ">
                        ${user.role || 'Tài khoản'}
                    </div>

                </div>


                <i
                    class="fa-solid fa-chevron-down"
                    style="
                        font-size:10px;
                        color:#64748B;
                    "
                ></i>

            </button>


            <!-- DROPDOWN -->

            <div
                id="customerAccountMenu"
                style="
                    display:none;
                    position:absolute;
                    top:calc(100% + 10px);
                    right:0;
                    width:230px;
                    background:#FFFFFF;
                    border:1px solid #E2E8F0;
                    border-radius:12px;
                    box-shadow:
                        0 12px 30px rgba(15,23,42,.12);
                    padding:8px;
                    z-index:2000;
                "
            >

                <div style="
                    padding:10px 10px 12px;
                    border-bottom:1px solid #F1F5F9;
                    margin-bottom:6px;
                ">

                    <div style="
                        font-size:11px;
                        color:#64748B;
                        margin-bottom:3px;
                    ">
                        Tài khoản
                    </div>

                    <div style="
                        font-size:13px;
                        font-weight:700;
                        color:#0F172A;
                    ">
                        ${user.name || 'Tài khoản'}
                    </div>

                    <div style="
                        font-size:11px;
                        color:#64748B;
                        margin-top:3px;
                        overflow:hidden;
                        text-overflow:ellipsis;
                        white-space:nowrap;
                    ">
                        ${user.email || ''}
                    </div>

                    ${
              user.balance !== undefined
                  ? `
                    <div style="
                        display:flex;
                        align-items:center;
                        gap:5px;
                        margin-top:8px;
                        font-size:11px;
                        color:#16A34A;
                        font-weight:600;
                    ">
                        <i class="fa-solid fa-wallet"></i>
                        Số dư:
                        ${formatVND(user.balance)}
                    </div>
                    `
                  : ''
          }

                </div>


                <a
                    href="profile.html"
                    style="
                        display:flex;
                        align-items:center;
                        gap:10px;
                        padding:10px;
                        border-radius:8px;
                        text-decoration:none;
                        color:#334155;
                        font-size:13px;
                        font-weight:600;
                    "
                >
                    <i
                        class="fa-solid fa-user"
                        style="
                            width:18px;
                            color:#16A34A;
                            text-align:center;
                        "
                    ></i>

                    Hồ Sơ
                </a>


                <a
                    href="customer_orders.html"
                    onclick="
                        if (!requireCustomerLogin()) {
                            event.preventDefault();
                        }
                    "
                    style="
                        display:flex;
                        align-items:center;
                        gap:10px;
                        padding:10px;
                        border-radius:8px;
                        text-decoration:none;
                        color:#334155;
                        font-size:13px;
                        font-weight:600;
                    "
                >
                    <i
                        class="fa-solid fa-receipt"
                        style="
                            width:18px;
                            color:#16A34A;
                            text-align:center;
                        "
                    ></i>

                    Đơn Hàng Của Tôi
                </a>


                <a
                    href="customer_complaint.html"
                    onclick="
                        if (!requireCustomerLogin()) {
                            event.preventDefault();
                        }
                    "
                    style="
                        display:flex;
                        align-items:center;
                        gap:10px;
                        padding:10px;
                        border-radius:8px;
                        text-decoration:none;
                        color:#334155;
                        font-size:13px;
                        font-weight:600;
                    "
                >
                    <i
                        class="fa-solid fa-circle-exclamation"
                        style="
                            width:18px;
                            color:#F59E0B;
                            text-align:center;
                        "
                    ></i>

                    Khiếu Nại & Hỗ Trợ
                </a>


                <div style="
                    height:1px;
                    background:#E2E8F0;
                    margin:6px 4px;
                "></div>


                <button
                    type="button"
                    onclick="customerLogout()"
                    style="
                        width:100%;
                        display:flex;
                        align-items:center;
                        gap:10px;
                        padding:10px;
                        border:none;
                        border-radius:8px;
                        background:transparent;
                        color:#DC2626;
                        font-size:13px;
                        font-weight:600;
                        cursor:pointer;
                        text-align:left;
                    "
                >

                    <i
                        class="fa-solid fa-right-from-bracket"
                        style="width:18px;"
                    ></i>

                    Đăng Xuất

                </button>

            </div>

        </div>

        `

          : `

        <!-- CHƯA ĐĂNG NHẬP -->

        <div style="
            display:flex;
            align-items:center;
            gap:8px;
            flex-shrink:0;
        ">

            <button
                type="button"
                onclick="openAuthModal('login')"
                style="
                    display:flex;
                    align-items:center;
                    gap:8px;
                    padding:9px 14px;
                    border:1px solid #E2E8F0;
                    border-radius:8px;
                    background:#FFFFFF;
                    color:#0F172A;
                    font-size:13px;
                    font-weight:700;
                    cursor:pointer;
                    white-space:nowrap;
                "
            >
                <i class="fa-solid fa-arrow-right-to-bracket"></i>
                Đăng Nhập
            </button>


            <button
                type="button"
                onclick="openAuthModal('register')"
                style="
                    display:flex;
                    align-items:center;
                    gap:8px;
                    padding:9px 14px;
                    border:1px solid #16A34A;
                    border-radius:8px;
                    background:#16A34A;
                    color:#FFFFFF;
                    font-size:13px;
                    font-weight:700;
                    cursor:pointer;
                    white-space:nowrap;
                    box-shadow:0 2px 8px rgba(22,163,74,.2);
                "
            >
                <i class="fa-solid fa-user-plus"></i>
                Đăng Ký
            </button>

        </div>
        `
  }

    </div>

</header>

    `;
}


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

    /*
     * Không chuyển sang login.html.
     * Vẫn ở customer.html.
     */

    const navbar =
        document.getElementById(
            'navbar-placeholder'
        );

    if (navbar) {

      navbar.innerHTML =
          renderCustomerNavbar(
              'home'
          );
    }

  }, 300);
}


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

                <!-- 1-Click Quick Demo Login -->
                <div style="margin-top:18px; padding-top:16px; border-top:1px dashed #E2E8F0;">
                    <div style="font-size:12px; font-weight:700; color:#64748B; margin-bottom:10px; text-transform:uppercase; letter-spacing:0.5px;">⚡ Đăng Nhập Nhanh Mẫu (1-Click Demo)</div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                        <button type="button" onclick="quickFillAndLogin('long.le@example.com', '123')" style="padding:8px 10px; border:1px solid #E2E8F0; border-radius:6px; background:#F8FAFC; font-size:12px; font-weight:600; color:#0F172A; cursor:pointer; display:flex; align-items:center; gap:6px;">
                            <i class="fa-solid fa-user" style="color:#16A34A;"></i> Khách: Lê Hoàng Long
                        </button>
                        <button type="button" onclick="quickFillAndLogin('an.nguyen@example.com', '123')" style="padding:8px 10px; border:1px solid #E2E8F0; border-radius:6px; background:#F8FAFC; font-size:12px; font-weight:600; color:#0F172A; cursor:pointer; display:flex; align-items:center; gap:6px;">
                            <i class="fa-solid fa-briefcase" style="color:#0F172A;"></i> Provider: Nguyễn Văn An
                        </button>
                    </div>
                </div>

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
    console.warn('Lỗi kết nối máy chủ, kích hoạt đăng nhập demo:', error);

    /* FALLBACK DEMO CỤC BỘ ĐỒNG BỘ 100% VỚI INDEX.HTML */
    let demoUser;
    if (email.toLowerCase() === 'an.nguyen@example.com') {
      demoUser = {
        id: 'USR001',
        name: 'Nguyễn Văn An',
        email: email,
        phone: '0912 345 678',
        role: 'Provider',
        balance: 24500000,
        avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100'
      };
    } else {
      demoUser = {
        id: 'USR003',
        name: 'Lê Hoàng Long',
        email: email,
        phone: '0988 776 655',
        role: 'Customer',
        balance: 10275000,
        avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150'
      };
    }

    setCurrentCustomer(demoUser);
    showToast('Đăng Nhập Thành Công!', `Đã đăng nhập với tài khoản ${demoUser.name}.`, 'success');
    closeAuthModal();

    setTimeout(() => {
      redirectAfterLogin(demoUser);
    }, 300);
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