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

// ============================================================
// 1. SESSION & AUTH
// ============================================================
function getCurrentProvider() {
  const raw = localStorage.getItem(SESSION_KEY);
  if (raw) {
    try {
      const user = JSON.parse(raw);
      if (user && user.role === 'Provider') {
        return user;
      }
    } catch (e) {
      console.error('Error parsing session:', e);
    }
  }

  // Fallback default demo provider (Nguyễn Văn An - PRV001)
  return {
    id: 'USR001',
    providerId: 'PRV001',
    name: 'Nguyễn Văn An',
    email: 'an.nguyen@example.com',
    role: 'Provider',
    balance: 25000000,
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'
  };
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

  updateProfile: async (profileData) => {
    const res = await fetch(`${API_BASE}/api/providers/profile`, {
      method: 'PUT',
      headers: getAuthHeader(),
      body: JSON.stringify(profileData)
    });
    return res.json();
  },

  updateAvailability: async (mode, schedule) => {
    const res = await fetch(`${API_BASE}/api/providers/availability`, {
      method: 'PUT',
      headers: getAuthHeader(),
      body: JSON.stringify({ mode, schedule })
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
});
