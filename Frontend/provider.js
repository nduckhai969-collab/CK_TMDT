/**
 * ============================================================
 * SkillRental Platform - Provider Client Library
 * provider.js
 *
 * Tích hợp toàn diện Backend cho Kênh Chuyên Gia (Provider Portal)
 * Tự động đồng bộ Session, Hồ sơ, Đơn hàng, Lịch hẹn, Ví thu nhập,
 * Đánh giá, Khiếu nại, Gói dịch vụ và Ứng tuyển dự án.
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
const PROVIDER_SESSION_KEY = 'SKILLRENTAL_PROVIDER_USER';

// ============================================================
// 1. SESSION & AUTH
// ============================================================
function getCurrentProvider() {
  const savedAvatar = localStorage.getItem('SKILLRENTAL_PROVIDER_AVATAR');
  const savedCover = localStorage.getItem('SKILLRENTAL_PROVIDER_COVER');
  let provider = null;

  const pRaw = localStorage.getItem(PROVIDER_SESSION_KEY);
  if (pRaw) {
    try {
      const pUser = JSON.parse(pRaw);
      if (pUser && typeof pUser === 'object') {
        provider = { ...pUser, role: 'Provider' };
      }
    } catch (e) {}
  }
  if (!provider) {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
      try {
        const user = JSON.parse(raw);
        if (user && typeof user === 'object') {
          provider = { ...user, role: 'Provider' };
        }
      } catch (e) {
        console.error('Error parsing session:', e);
      }
    }
  }

  // Fallback default demo provider (Nguyễn Văn An - PRV001)
  if (!provider) {
    provider = {
      id: 'USR001',
      providerId: 'PRV001',
      name: 'Nguyễn Văn An',
      email: 'an.nguyen@example.com',
      role: 'Provider',
      balance: 25000000,
      avatar: savedAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'
    };
  }

  if (savedAvatar) {
    provider.avatar = savedAvatar;
  }
  if (savedCover) {
    provider.cover = savedCover;
  }
  if (!provider.providerId) {
    provider.providerId = provider.id || 'PRV001';
  }
  return provider;
}

function getAuthHeader() {
  const provider = getCurrentProvider();
  return {
    'Content-Type': 'application/json',
    'x-user-id': provider ? (provider.providerId || provider.id) : 'USR001'
  };
}

// ============================================================
// 2. PROVIDER API CLIENT
// ============================================================
window.providerApi = {
  // Stats & Overview
  getDashboardStats: async () => {
    const res = await fetch(`${API_BASE}/api/providers/dashboard/stats`, { headers: getAuthHeader() });
    return res.json();
  },

  // Profile Management (UC-30, UC-31, UC-32)
  getProfile: async () => {
    const res = await fetch(`${API_BASE}/api/providers/me`, { headers: getAuthHeader() });
    return res.json();
  },

  uploadAvatar: async (file) => {
    const provider = getCurrentProvider();
    const providerId = provider ? (provider.providerId || provider.id) : 'PRV001';
    let base64Data = null;

    try {
      base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const headers = {
        'Content-Type': 'application/json',
        'x-user-id': providerId
      };
      try {
        if (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) {
          const token = await firebase.auth().currentUser.getIdToken();
          if (token) headers['Authorization'] = 'Bearer ' + token;
        }
      } catch (_) {}

      let data = null;
      try {
        const res = await fetch(`${API_BASE}/api/providers/profile/avatar`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ avatar: base64Data })
        });

        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          data = await res.json();
        } else {
          const text = await res.text();
          console.warn('[provider] Backend non-JSON response (' + res.status + '):', text.slice(0, 100));
        }
      } catch (networkErr) {
        console.warn('[provider] Network error uploading avatar to server:', networkErr.message);
      }

      // Nếu backend thành công: dùng URL trả về từ server
      // Nếu backend lỗi/404/offline: Tự động dùng Base64 DataURL làm avatar siêu bền vững!
      const newAvatar = (data && (data.avatar || (data.provider && data.provider.avatar))) || base64Data;
      if (newAvatar) {
        // Lưu avatar độc lập để không bao giờ bị mất khi F5
        try {
          localStorage.setItem('SKILLRENTAL_PROVIDER_AVATAR', newAvatar);
        } catch (_) {}

        ['SKILLRENTAL_CURRENT_USER', 'SKILLRENTAL_PROVIDER_USER'].forEach(key => {
          try {
            const uRaw = localStorage.getItem(key);
            const uObj = uRaw ? JSON.parse(uRaw) : {};
            uObj.avatar = newAvatar;
            if (!uObj.role) uObj.role = 'Provider';
            if (!uObj.id) uObj.id = providerId;
            if (!uObj.providerId) uObj.providerId = providerId;
            localStorage.setItem(key, JSON.stringify(uObj));
          } catch (_) {}
        });

        // Cập nhật DOM ngay lập tức
        const sideAvatar = document.querySelector('.sidebar-profile .avatar');
        if (sideAvatar) sideAvatar.innerHTML = `<img src="${newAvatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
        const mainAvatar = document.querySelector('.profile-avatar-lg');
        if (mainAvatar) mainAvatar.innerHTML = `<img src="${newAvatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
        const inputAvt = document.getElementById('inputAvatarUrl');
        if (inputAvt) inputAvt.value = newAvatar;

        return {
          success: true,
          avatar: newAvatar,
          message: data?.message || 'Đã cập nhật ảnh đại diện thành công!'
        };
      }

      return { success: false, message: 'Không thể đọc file ảnh đã chọn.' };
    } catch (err) {
      console.error('Upload avatar process error:', err);
      // Fallback cuối cùng nếu base64Data đã đọc được
      if (base64Data) {
        try {
          localStorage.setItem('SKILLRENTAL_PROVIDER_AVATAR', base64Data);
          const sideAvatar = document.querySelector('.sidebar-profile .avatar');
          if (sideAvatar) sideAvatar.innerHTML = `<img src="${base64Data}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
          const mainAvatar = document.querySelector('.profile-avatar-lg');
          if (mainAvatar) mainAvatar.innerHTML = `<img src="${base64Data}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
        } catch (_) {}
        return { success: true, avatar: base64Data, message: 'Đã lưu ảnh đại diện (cục bộ).' };
      }
      return { success: false, message: 'Lỗi tải ảnh: ' + (err.message || 'Không thể đọc file ảnh') };
    }
  },

  uploadCover: async (file) => {
    const provider = getCurrentProvider();
    const providerId = provider ? (provider.providerId || provider.id) : 'PRV001';
    let base64Data = null;

    try {
      base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const headers = {
        'Content-Type': 'application/json',
        'x-user-id': providerId
      };
      try {
        if (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) {
          const token = await firebase.auth().currentUser.getIdToken();
          if (token) headers['Authorization'] = 'Bearer ' + token;
        }
      } catch (_) {}

      let data = null;
      try {
        const res = await fetch(`${API_BASE}/api/providers/profile/cover`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ cover: base64Data })
        });

        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          data = await res.json();
        } else {
          const text = await res.text();
          console.warn('[provider] Backend non-JSON response for cover (' + res.status + '):', text.slice(0, 100));
        }
      } catch (networkErr) {
        console.warn('[provider] Network error uploading cover to server:', networkErr.message);
      }

      // Nếu backend thành công: dùng URL trả về từ server
      // Nếu backend lỗi/404/offline: Tự động dùng Base64 DataURL làm cover siêu bền vững!
      const newCover = (data && (data.cover || (data.provider && data.provider.cover))) || base64Data;
      if (newCover) {
        // Lưu cover độc lập
        try {
          localStorage.setItem('SKILLRENTAL_PROVIDER_COVER', newCover);
        } catch (_) {}

        ['SKILLRENTAL_CURRENT_USER', 'SKILLRENTAL_PROVIDER_USER'].forEach(key => {
          try {
            const uRaw = localStorage.getItem(key);
            const uObj = uRaw ? JSON.parse(uRaw) : {};
            uObj.cover = newCover;
            if (!uObj.role) uObj.role = 'Provider';
            if (!uObj.id) uObj.id = providerId;
            if (!uObj.providerId) uObj.providerId = providerId;
            localStorage.setItem(key, JSON.stringify(uObj));
          } catch (_) {}
        });

        // Cập nhật DOM ngay lập tức
        const coverEl = document.querySelector('.profile-cover');
        if (coverEl) {
          coverEl.style.backgroundImage = `url("${newCover}")`;
          coverEl.style.backgroundSize = 'cover';
          coverEl.style.backgroundPosition = 'center';
        }
        const iCover = document.getElementById('inputCoverUrl');
        if (iCover) iCover.value = newCover;

        return {
          success: true,
          cover: newCover,
          message: data?.message || 'Đã cập nhật ảnh bìa thành công!'
        };
      }

      return { success: false, message: 'Không thể đọc file ảnh bìa đã chọn.' };
    } catch (err) {
      console.error('Upload cover process error:', err);
      if (base64Data) {
        try {
          localStorage.setItem('SKILLRENTAL_PROVIDER_COVER', base64Data);
          const coverEl = document.querySelector('.profile-cover');
          if (coverEl) {
            coverEl.style.backgroundImage = `url("${base64Data}")`;
            coverEl.style.backgroundSize = 'cover';
            coverEl.style.backgroundPosition = 'center';
          }
        } catch (_) {}
        return { success: true, cover: base64Data, message: 'Đã lưu ảnh bìa (cục bộ).' };
      }
      return { success: false, message: 'Lỗi tải ảnh bìa: ' + (err.message || 'Không thể đọc file ảnh') };
    }
  },

  updateProfile: async (profileData) => {
    const res = await fetch(`${API_BASE}/api/providers/profile`, {
      method: 'PUT',
      headers: getAuthHeader(),
      body: JSON.stringify(profileData)
    });
    return res.json();
  },

  updateAvailability: async (payloadOrMode, schedule, vacation) => {
    const res = await fetch(`${API_BASE}/api/providers/availability`, {
      method: 'PUT',
      headers: getAuthHeader(),
      body: JSON.stringify(typeof payloadOrMode === 'object' && payloadOrMode !== null ? payloadOrMode : { mode: payloadOrMode, schedule, vacation })
    });
    return res.json();
  },

  updateHourlyRate: async (hourlyRate) => {
    const res = await fetch(`${API_BASE}/api/providers/hourly-rate`, {
      method: 'PUT',
      headers: getAuthHeader(),
      body: JSON.stringify({ hourlyRate })
    });
    return res.json();
  },

  addSkill: async (name, level, group) => {
    const res = await fetch(`${API_BASE}/api/providers/skills`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify({ name, level, group })
    });
    return res.json();
  },

  deleteSkill: async (skillName) => {
    const res = await fetch(`${API_BASE}/api/providers/skills/${encodeURIComponent(skillName)}`, {
      method: 'DELETE',
      headers: getAuthHeader()
    });
    return res.json();
  },

  submitCertification: async (skillName, certTitle, issuer) => {
    const res = await fetch(`${API_BASE}/api/providers/certifications/submit`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify({ skillName, certTitle, issuer })
    });
    return res.json();
  },

  // Services Management (UC-33)
  getMyServices: async () => {
    const res = await fetch(`${API_BASE}/api/providers/me/services`, { headers: getAuthHeader() });
    return res.json();
  },

  createService: async (serviceData) => {
    const res = await fetch(`${API_BASE}/api/providers/services`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify(serviceData)
    });
    return res.json();
  },

  updateService: async (id, serviceData) => {
    const res = await fetch(`${API_BASE}/api/providers/services/${id}`, {
      method: 'PUT',
      headers: getAuthHeader(),
      body: JSON.stringify(serviceData)
    });
    return res.json();
  },

  deleteService: async (id) => {
    const res = await fetch(`${API_BASE}/api/providers/services/${id}`, {
      method: 'DELETE',
      headers: getAuthHeader()
    });
    return res.json();
  },

  requestServicePrice: async (id, newPrice, reason) => {
    const res = await fetch(`${API_BASE}/api/providers/services/${id}/request-price`, {
      method: 'PUT',
      headers: getAuthHeader(),
      body: JSON.stringify({ newPrice, reason })
    });
    return res.json();
  },

  // Jobs Market & Proposals (UC-34, UC-35, UC-36)
  getMarketJobs: async (category) => {
    const url = category && category !== 'all' ? `${API_BASE}/api/jobs?category=${category}` : `${API_BASE}/api/jobs`;
    const res = await fetch(url);
    return res.json();
  },

  getMyJobApplications: async () => {
    const res = await fetch(`${API_BASE}/api/jobs/provider/applications`, { headers: getAuthHeader() });
    return res.json();
  },

  applyToJob: async (jobId, proposalData) => {
    const provider = getCurrentProvider();
    const res = await fetch(`${API_BASE}/api/jobs/${jobId}/apply`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify({
        providerId: provider.providerId || 'PRV001',
        providerName: provider.name,
        avatar: provider.avatar,
        ...proposalData
      })
    });
    return res.json();
  },

  getSelectedJobInvitations: async () => {
    const res = await fetch(`${API_BASE}/api/jobs/provider/selected`, { headers: getAuthHeader() });
    return res.json();
  },

  respondToJobSelection: async (jobId, action) => {
    const res = await fetch(`${API_BASE}/api/jobs/${encodeURIComponent(jobId)}/provider-response`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify({ action })
    });
    return res.json();
  },

  // Bookings & Execution (UC-37, UC-38, UC-39, UC-40)
  getMyOrders: async (status) => {
    const url = status ? `${API_BASE}/api/providers/me/orders?status=${status}` : `${API_BASE}/api/providers/me/orders`;
    const res = await fetch(url, { headers: getAuthHeader() });
    return res.json();
  },

  acceptOrder: async (id) => {
    const res = await fetch(`${API_BASE}/api/providers/orders/${id}/accept`, {
      method: 'POST',
      headers: getAuthHeader()
    });
    return res.json();
  },

  rejectOrder: async (id, reason) => {
    const res = await fetch(`${API_BASE}/api/providers/orders/${id}/reject`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify({ reason })
    });
    return res.json();
  },

  updateOrderProgress: async (id, progressPercent, completedTasks, notes) => {
    const res = await fetch(`${API_BASE}/api/providers/orders/${id}/progress`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify({ progressPercent, completedTasks, notes })
    });
    return res.json();
  },

  deliverOrder: async (id, handoverNotes, attachments) => {
    const res = await fetch(`${API_BASE}/api/providers/orders/${id}/deliver`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify({ handoverNotes, attachments })
    });
    return res.json();
  },

  // Wallet & Income (UC-42, UC-43)
  getWallet: async () => {
    const res = await fetch(`${API_BASE}/api/providers/me/wallet`, { headers: getAuthHeader() });
    return res.json();
  },

  updateBankAccount: async (bank, account, holder) => {
    const res = await fetch(`${API_BASE}/api/providers/me/bank-account`, {
      method: 'PUT',
      headers: getAuthHeader(),
      body: JSON.stringify({ bank, account, holder })
    });
    return res.json();
  },

  withdraw: async (amount, password) => {
    const res = await fetch(`${API_BASE}/api/providers/wallet/withdraw`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify({ amount, password })
    });
    return res.json();
  },

  // Reviews (UC-44)
  getMyReviews: async () => {
    const res = await fetch(`${API_BASE}/api/providers/me/reviews`, { headers: getAuthHeader() });
    return res.json();
  },

  replyReview: async (reviewId, reply) => {
    const res = await fetch(`${API_BASE}/api/providers/reviews/${reviewId}/reply`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify({ reply })
    });
    return res.json();
  },

  // Complaints & Disputes (UC-45)
  getMyComplaints: async () => {
    const res = await fetch(`${API_BASE}/api/providers/me/complaints`, { headers: getAuthHeader() });
    return res.json();
  },

  submitDefense: async (complaintId, providerClaim) => {
    const res = await fetch(`${API_BASE}/api/providers/complaints/${complaintId}/defense`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify({ providerClaim })
    });
    return res.json();
  },

  // Packages (UC-46)
  getPackages: async () => {
    const res = await fetch(`${API_BASE}/api/providers/packages`);
    return res.json();
  },

  purchasePackage: async (packageId) => {
    const res = await fetch(`${API_BASE}/api/providers/packages/purchase`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify({ packageId })
    });
    return res.json();
  },

  // Posts & Portfolio (UC-47)
  getMyPosts: async () => {
    const res = await fetch(`${API_BASE}/api/providers/me/posts`, { headers: getAuthHeader() });
    return res.json();
  },

  getNotifications: async () => {
    const res = await fetch(`${API_BASE}/api/notifications`, { headers: getAuthHeader() });
    return res.json();
  },

  markNotificationAsRead: async (id) => {
    const res = await fetch(`${API_BASE}/api/notifications/${encodeURIComponent(id)}/read`, {
      method: 'PUT',
      headers: getAuthHeader()
    });
    return res.json();
  },

  markAllNotificationsAsRead: async () => {
    const res = await fetch(`${API_BASE}/api/notifications/read-all`, {
      method: 'PUT',
      headers: getAuthHeader()
    });
    return res.json();
  },

  createPost: async (postData) => {
    const res = await fetch(`${API_BASE}/api/providers/posts`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify(postData)
    });
    return res.json();
  }
};

// ============================================================
// 3. COMMON UI HELPERS & INITIALIZATION
// ============================================================
function formatVND(amount) {
  return Number(amount || 0).toLocaleString('vi-VN') + 'đ';
}
window.formatVND = formatVND;

function showProviderToast(msg, type = 'success') {
  let toast = document.getElementById('toastBox');
  let msgEl = document.getElementById('toastMessage') || document.getElementById('toastMsg');

  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toastBox';
    toast.className = 'toast-box';
    toast.innerHTML = `<i class="fa-solid fa-circle-check" style="color:var(--primary); font-size:18px;"></i> <span id="toastMessage">${msg}</span>`;
    document.body.appendChild(toast);
    msgEl = document.getElementById('toastMessage');
  }

  if (msgEl) msgEl.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}

// Window showToast alias
if (typeof window.showToast !== 'function') {
  window.showToast = showProviderToast;
}

// Update Topbar Profile & Badges
async function updateProviderHeader() {
  const provider = getCurrentProvider();

  // Update profile in sidebar
  const sidebarName = document.querySelector('.sidebar-profile .profile-name');
  const sidebarRole = document.querySelector('.sidebar-profile .profile-role');
  const sidebarAvatar = document.querySelector('.sidebar-profile .avatar');

  if (sidebarName && provider.name) sidebarName.textContent = provider.name;
  if (sidebarAvatar && provider.avatar) {
    sidebarAvatar.innerHTML = `<img src="${provider.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
  }

  // Tức thời gán avatar lớn & cover trên trang profile nếu có
  const mainAvatar = document.querySelector('.profile-avatar-lg');
  if (mainAvatar && provider.avatar) {
    mainAvatar.innerHTML = `<img src="${provider.avatar}" alt="${provider.name || ''}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
  }
  const mainCover = document.querySelector('.profile-cover');
  if (mainCover && provider.cover) {
    mainCover.style.backgroundImage = `url("${provider.cover}")`;
    mainCover.style.backgroundSize = 'cover';
    mainCover.style.backgroundPosition = 'center';
  }
  const iAvt = document.getElementById('inputAvatarUrl');
  if (iAvt && provider.avatar && !iAvt.value) iAvt.value = provider.avatar;
  const iCover = document.getElementById('inputCoverUrl');
  if (iCover && provider.cover && !iCover.value) iCover.value = provider.cover;

  // Fetch real-time dashboard stats for badges
  try {
    const res = await window.providerApi.getDashboardStats();
    if (res && res.success && res.stats) {
      const stats = res.stats;
      // Update badge counts in sidebar
      const badges = document.querySelectorAll('.sidebar-nav .badge-count');
      if (badges.length >= 3) {
        // jobs badge
        if (stats.submittedProposalsCount !== undefined) {
          badges[0].textContent = stats.submittedProposalsCount || 6;
        }
        // bookings badge
        if (stats.activeProjectsCount !== undefined) {
          badges[1].textContent = stats.activeProjectsCount || 2;
        }
      }
    }
  } catch (e) {
    console.log('Provider stats: Offline mode');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  updateProviderHeader();
  initProviderNotificationBell();
  loadProviderNotifications();
  setInterval(loadProviderNotifications, 25000);
});

// ============================================================
// 4. PROVIDER NOTIFICATIONS
// ============================================================
let providerNotifs = [];

async function loadProviderNotifications() {
  try {
    if (!window.providerApi) return;
    const res = await window.providerApi.getNotifications();
    if (!res || !res.success) return;
    providerNotifs = res.notifications || [];
    renderProviderNotifBadge();
    renderProviderNotifList();
  } catch (err) {
    console.log('Provider notifications: offline or idle');
  }
}

function renderProviderNotifBadge() {
  const badge = document.getElementById('providerNotifBadge');
  if (!badge) return;
  const unread = providerNotifs.filter(n => !n.isRead).length;
  if (unread > 0) {
    badge.textContent = unread > 9 ? '9+' : unread;
    badge.style.display = 'inline-flex';
  } else {
    badge.style.display = 'none';
  }
}

function renderProviderNotifList() {
  const list = document.getElementById('providerNotifList');
  if (!list) return;
  if (!providerNotifs.length) {
    list.innerHTML = '<div style="padding:18px;text-align:center;color:#64748B;font-size:12px;">Bạn không có thông báo mới nào.</div>';
    return;
  }
  list.innerHTML = providerNotifs.slice(0, 15).map(n => {
    const unreadBg = n.isRead ? '#FFFFFF' : '#F0FDF4';
    const icon = n.type === 'warning' ? 'fa-triangle-exclamation' : (n.type === 'error' ? 'fa-circle-xmark' : 'fa-bell');
    const iconColor = n.type === 'warning' ? '#D97706' : (n.type === 'error' ? '#DC2626' : '#16A34A');
    return `
      <div onclick="handleProviderNotifClick('${n.id}', '${n.detailsUrl || ''}')" style="background:${unreadBg};padding:12px 14px;border-bottom:1px solid #F1F5F9;cursor:pointer;transition:background .15s;display:flex;gap:10px;align-items:flex-start;">
        <i class="fa-solid ${icon}" style="color:${iconColor};font-size:14px;margin-top:3px;flex-shrink:0;"></i>
        <div style="flex:1;min-width:0;">
          <div style="font-size:12.5px;font-weight:${n.isRead ? '600' : '700'};color:#0F172A;line-height:1.4;">${escapeNotifValue(n.title)}</div>
          <div style="font-size:11.5px;color:#475569;margin-top:2px;line-height:1.45;">${escapeNotifValue(n.message)}</div>
          <div style="font-size:10px;color:#94A3B8;margin-top:4px;">${escapeNotifValue(n.createdAt || '')}</div>
        </div>
        ${!n.isRead ? '<span style="width:7px;height:7px;border-radius:50%;background:#16A34A;flex-shrink:0;margin-top:6px;"></span>' : ''}
      </div>
    `;
  }).join('');
}

function escapeNotifValue(val) {
  return String(val ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

async function handleProviderNotifClick(notifId, detailsUrl) {
  try {
    await window.providerApi.markNotificationAsRead(notifId);
    const item = providerNotifs.find(n => n.id === notifId);
    if (item) item.isRead = true;
    renderProviderNotifBadge();
    renderProviderNotifList();
  } catch (e) {}

  if (detailsUrl === 'profile.html' || (detailsUrl && detailsUrl.includes('profile'))) {
    if (window.location.pathname.includes('profile.html')) {
      const tabEl = document.querySelector('[onclick*="uc31-services"]');
      if (typeof switchSection === 'function' && tabEl) {
        switchSection('uc31-services', tabEl);
        tabEl.scrollIntoView({ behavior: 'smooth' });
      }
    } else {
      window.location.href = 'profile.html#services';
    }
  }
}

async function markAllProviderNotifsRead() {
  try {
    await window.providerApi.markAllNotificationsAsRead();
    providerNotifs.forEach(n => { n.isRead = true; });
    renderProviderNotifBadge();
    renderProviderNotifList();
    showProviderToast('Đã đánh dấu tất cả thông báo là đã đọc!');
  } catch (e) {}
}

function toggleProviderNotifDropdown(e) {
  if (e) e.stopPropagation();
  const dropdown = document.getElementById('providerNotifDropdown');
  if (!dropdown) return;
  const isShow = dropdown.style.display === 'block';
  dropdown.style.display = isShow ? 'none' : 'block';
  if (!isShow) loadProviderNotifications();
}

document.addEventListener('click', (e) => {
  const container = document.getElementById('providerNotifContainer');
  const dropdown = document.getElementById('providerNotifDropdown');
  if (dropdown && container && !container.contains(e.target)) {
    dropdown.style.display = 'none';
  }
});

function initProviderNotificationBell() {
  const headerActions = document.querySelector('.top-header .header-actions');
  if (!headerActions || document.getElementById('providerNotifContainer')) return;

  const container = document.createElement('div');
  container.id = 'providerNotifContainer';
  container.style.cssText = 'position:relative;display:inline-block;';

  container.innerHTML = `
    <button type="button" class="btn btn-outline btn-sm" onclick="toggleProviderNotifDropdown(event)" title="Thông báo" style="position:relative;padding:0 12px;height:38px;min-height:38px;display:inline-flex;align-items:center;gap:6px;border-radius:8px;white-space:nowrap;font-size:12.5px;font-weight:600;">
      <i class="fa-regular fa-bell" style="font-size:14px;"></i>
      <span style="font-size:12px;font-weight:600;">Thông báo</span>
      <span id="providerNotifBadge" style="display:none;position:absolute;top:-4px;right:-4px;min-width:16px;height:16px;padding:0 3px;box-sizing:border-box;background:#EF4444;color:#fff;border-radius:999px;font-size:10px;line-height:16px;text-align:center;font-weight:700;box-shadow:0 1px 3px rgba(0,0,0,0.2);justify-content:center;align-items:center;"></span>
    </button>
    <div id="providerNotifDropdown" style="display:none;position:absolute;top:calc(100% + 8px);right:0;width:340px;max-width:calc(100vw - 24px);background:#FFFFFF;border:1px solid #E2E8F0;border-radius:12px;box-shadow:0 10px 25px rgba(15,23,42,.12);z-index:2000;overflow:hidden;">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid #F1F5F9;background:#F8FAFC;">
        <strong style="font-size:13px;color:#0F172A;"><i class="fa-solid fa-bell" style="color:#16A34A;margin-right:4px;"></i> Thông Báo Của Bạn</strong>
        <button type="button" onclick="markAllProviderNotifsRead()" style="border:0;background:none;color:#16A34A;font-size:11.5px;font-weight:600;cursor:pointer;">Đã đọc hết</button>
      </div>
      <div id="providerNotifList" style="max-height:360px;overflow-y:auto;">
        <div style="padding:18px;text-align:center;color:#64748B;font-size:12px;">Đang tải thông báo...</div>
      </div>
    </div>
  `;

  headerActions.insertBefore(container, headerActions.firstChild);
}
