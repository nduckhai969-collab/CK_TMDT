// Thanh điều hướng trên cùng dùng chung cho mọi trang admin (giống admin.html).
// Tự dựng khối bên phải: chuông thông báo, hồ sơ admin, nút đăng xuất.
// Trang nào cần thêm nút riêng thì đặt phần tử id="topbar-extra" trong .topbar-right.
(function () {
  // Chặn truy cập: chỉ tài khoản Admin mới được vào các trang quản trị.
  const signedIn = (window.SkillAuth && window.SkillAuth.getCurrentUser()) || null;
  if (!signedIn) {
    window.location.replace('index.html?auth=login');
    return;
  }
  if (signedIn.role !== 'Admin') {
    window.location.replace(signedIn.role === 'Provider' ? 'dashboard.html' : 'customer.html');
    return;
  }

  const RIGHT = `
          <div class="notification-dropdown-wrapper">
            <button class="icon-badge-btn" id="notif-bell-btn" type="button" onclick="toggleNotificationDropdown(event)" title="Xem thông báo tóm tắt" aria-label="Thông báo hệ thống">
              <span style="font-size: 16px;">🔔</span>
              <span class="badge-dot" id="notif-badge-count">6</span>
            </button>

            <div class="notification-dropdown-menu" id="notif-dropdown-menu" style="display: none;">
              <div class="notif-dropdown-header">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="font-weight: 700; font-size: 13px; color: #0F172A;">🔔 Thông Báo Hệ Thống</span>
                  <span class="notif-pill-badge" id="notif-unread-pill">6 việc cần xử lý</span>
                </div>
                <button type="button" class="notif-clear-btn" onclick="markAllNotificationsAsRead(event)">Đã đọc</button>
              </div>

              <div class="notif-dropdown-body">
                <table class="notif-summary-table">
                  <thead>
                    <tr>
                      <th>Hạng mục</th>
                      <th style="text-align: center;">Số lượng</th>
                      <th style="text-align: right;">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>📋 Hồ sơ Provider chờ duyệt</td>
                      <td style="text-align: center;"><span class="badge badge-warning" style="padding: 2px 6px; font-size: 10px;">4 mới</span></td>
                      <td style="text-align: right;"><a href="providers.html" style="color: #16A34A; text-decoration: none; font-weight: 600;">Xem duyệt</a></td>
                    </tr>
                    <tr>
                      <td>⚠️ Khiếu nại tranh chấp</td>
                      <td style="text-align: center;"><span class="badge badge-error" style="padding: 2px 6px; font-size: 10px;">2 đơn</span></td>
                      <td style="text-align: right;"><a href="complaints.html" style="color: #DC2626; text-decoration: none; font-weight: 600;">Hòa giải</a></td>
                    </tr>
                    <tr>
                      <td>🎓 Chứng chỉ kỹ năng mới</td>
                      <td style="text-align: center;"><span class="badge badge-purple" style="padding: 2px 6px; font-size: 10px;">3 hồ sơ</span></td>
                      <td style="text-align: right;"><a href="providers.html" style="color: #16A34A; text-decoration: none; font-weight: 600;">Kiểm tra</a></td>
                    </tr>
                    <tr>
                      <td>💰 Giao dịch Escrow ký quỹ</td>
                      <td style="text-align: center;"><span class="badge badge-success" style="padding: 2px 6px; font-size: 10px;">1 đơn</span></td>
                      <td style="text-align: right;"><a href="orders.html" style="color: #16A34A; text-decoration: none; font-weight: 600;">Chi tiết</a></td>
                    </tr>
                  </tbody>
                </table>

                <a href="providers.html" class="notif-item unread">
                  <div class="notif-item-icon bg-warning-light">📋</div>
                  <div class="notif-item-content">
                    <div class="notif-item-title">Hồ sơ Provider mới chờ duyệt</div>
                    <div class="notif-item-desc">Nguyễn Thị Bích &amp; Trần Đình Trọng vừa nộp chứng thực CCCD &amp; kinh nghiệm.</div>
                    <div class="notif-item-time">10 phút trước</div>
                  </div>
                </a>

                <a href="complaints.html" class="notif-item unread">
                  <div class="notif-item-icon bg-danger-light">⚠️</div>
                  <div class="notif-item-content">
                    <div class="notif-item-title">Khiếu nại đơn hàng cần hòa giải</div>
                    <div class="notif-item-desc">Đơn #ORD-0899 có yêu cầu can thiệp tranh chấp chất lượng dịch vụ.</div>
                    <div class="notif-item-time">35 phút trước</div>
                  </div>
                </a>

                <a href="orders.html" class="notif-item">
                  <div class="notif-item-icon bg-success-light">💰</div>
                  <div class="notif-item-content">
                    <div class="notif-item-title">Ký quỹ Escrow hoàn tất</div>
                    <div class="notif-item-desc">Đơn #ORD-0891 đã chuyển tiền ký quỹ 2.500.000đ vào hệ thống an toàn.</div>
                    <div class="notif-item-time">1 giờ trước</div>
                  </div>
                </a>
              </div>

              <div class="notif-dropdown-footer">
                <a href="complaints.html" style="font-size: 12px; color: #16A34A; text-decoration: none; font-weight: 600;">Xem tất cả khiếu nại &amp; kiểm duyệt →</a>
              </div>
            </div>
          </div>

          <div class="admin-profile">
            <div class="admin-avatar">A</div>
            <div class="admin-info">
              <strong>Nguyễn Văn Admin</strong>
              <span>Quản trị viên hệ thống</span>
            </div>
          </div>
          <button type="button" onclick="handleLogout()" class="btn btn-sm" style="display:inline-flex; align-items:center; gap:6px; font-weight:600; border:1px solid #FCA5A5; color:#DC2626; background:#FEE2E2; cursor:pointer;" title="Đăng xuất khỏi tài khoản Quản trị">
            <span>🚪</span>
            <span>Đăng Xuất</span>
          </button>
`;

  window.toggleNotificationDropdown = function (event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const menu = document.getElementById('notif-dropdown-menu');
    if (!menu) return;
    menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
  };

  window.markAllNotificationsAsRead = function (event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const badge = document.getElementById('notif-badge-count');
    const pill = document.getElementById('notif-unread-pill');
    if (badge) badge.style.display = 'none';
    if (pill) {
      pill.textContent = '0 việc cần xử lý';
      pill.style.background = '#E2E8F0';
      pill.style.color = '#64748B';
    }
    document.querySelectorAll('.notif-item.unread').forEach(item => item.classList.remove('unread'));
    if (typeof showToast === 'function') {
      showToast('Thông báo', 'Đã đánh dấu tất cả thông báo là đã đọc', 'success');
    }
  };

  window.handleQuickSearch = function (event) {
    if (event.key !== 'Enter') return;
    const val = (event.target.value || '').trim().toLowerCase();
    if (!val) return;
    if (val.includes('đơn') || val.includes('order') || val.includes('ord')) {
      window.location.href = 'orders.html';
    } else if (val.includes('provider') || val.includes('thợ') || val.includes('kỹ năng') || val.includes('hồ sơ')) {
      window.location.href = 'providers.html';
    } else if (val.includes('user') || val.includes('người dùng') || val.includes('khách')) {
      window.location.href = 'users.html';
    } else if (val.includes('khiếu nại') || val.includes('tranh chấp')) {
      window.location.href = 'complaints.html';
    } else if (val.includes('thống kê') || val.includes('doanh thu') || val.includes('báo cáo')) {
      window.location.href = 'statistics.html';
    } else if (val.includes('gói') || val.includes('dịch vụ') || val.includes('package')) {
      window.location.href = 'packages.html';
    } else if (typeof showToast === 'function') {
      showToast('Tìm kiếm', `Đang tìm kiếm từ khóa "${val}" trên hệ thống...`, 'info');
    }
  };

  document.addEventListener('click', (e) => {
    const menu = document.getElementById('notif-dropdown-menu');
    if (!menu || menu.style.display !== 'block') return;
    const wrapper = document.querySelector('.notification-dropdown-wrapper');
    if (!wrapper || !wrapper.contains(e.target)) menu.style.display = 'none';
  });

  document.addEventListener('DOMContentLoaded', () => {
    const right = document.querySelector('.topbar-right');
    if (!right || document.getElementById('notif-dropdown-menu')) return;
    const extra = document.getElementById('topbar-extra');
    right.innerHTML = (extra ? extra.outerHTML : '') + RIGHT;
  });

  // Giữ nguyên vị trí cuộn của sidebar khi chuyển trang: menu có thể dài hơn màn hình,
  // nếu không lưu lại thì sau khi reload menu nhảy về đầu và mục vừa bấm bị khuất.
  const MENU_SCROLL_KEY = 'adminSidebarMenuScrollTop';

  document.addEventListener('DOMContentLoaded', () => {
    const menu = document.querySelector('.sidebar .menu');
    if (!menu) return;
    const saved = parseInt(sessionStorage.getItem(MENU_SCROLL_KEY), 10);
    if (!isNaN(saved) && saved > 0) {
      requestAnimationFrame(() => { menu.scrollTop = saved; });
    }
  });

  document.addEventListener('click', (e) => {
    const link = e.target.closest ? e.target.closest('.sidebar .menu a.menu-item') : null;
    if (!link) return;
    const menu = link.closest('.menu');
    if (menu) sessionStorage.setItem(MENU_SCROLL_KEY, String(menu.scrollTop));
  });
})();
