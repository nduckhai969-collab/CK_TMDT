/**
 * SkillRental - Statistics Module (UC-68)
 * Quản lý thống kê dữ liệu trực tiếp từ localStorage:
 * - Chức năng 1: Biểu đồ CỘT theo khoảng ngày (Doanh thu & Giá trị giao dịch, loại trừ đơn đã hủy)
 * - Chức năng 2: Biểu đồ TRÒN phân bổ trạng thái đơn hàng (Số lượng & Tỷ lệ %)
 * - Tự động đồng bộ thời gian thực khi localStorage thay đổi
 */

let revenueChart = null;
let orderStatusChart = null;

// Định nghĩa trạng thái đơn hàng chuẩn của hệ thống SkillRental
const STATUS_CONFIG = [
  { key: 'pending',    label: 'Chờ xử lý',       vi: 'Chờ tiếp nhận',          color: '#F59E0B' },
  { key: 'confirmed',  label: 'Đã xác nhận',     vi: 'Chờ bàn giao',           color: '#0EA5E9' },
  { key: 'processing', label: 'Đang thực hiện',  vi: 'Đang triển khai',        color: '#3B82F6' },
  { key: 'delivered',  label: 'Đã bàn giao',     vi: 'Chờ nghiệm thu',         color: '#6366F1' },
  { key: 'completed',  label: 'Hoàn thành',      vi: 'Đã giải ngân',           color: '#22C55E' },
  { key: 'disputed',   label: 'Khiếu nại',       vi: 'Tạm giữ tranh chấp',     color: '#EC4899' },
  { key: 'cancelled',  label: 'Đã hủy',          vi: 'Đã hoàn tiền',           color: '#EF4444' }
];

const DAILY_LIMIT_DAYS = 62; // Vượt quá 62 ngày thì tự động gom nhóm theo tháng

// ============================================================================
// HÀM TIỆN ÍCH NGÀY THÁNG & TIỀN TỆ
// ============================================================================
function pad2(n) { return String(n).padStart(2, '0'); }

function toISO(d) {
  if (!d || !(d instanceof Date)) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseISO(s) {
  if (!s) return null;
  const parts = String(s).split('-').map(Number);
  if (parts.length < 3 || isNaN(parts[0])) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function fmtDDMM(d) { return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`; }
function fmtDDMMYYYY(d) { return `${fmtDDMM(d)}/${d.getFullYear()}`; }
function fmtMoney(n) { return Number(n || 0).toLocaleString('vi-VN') + 'đ'; }

function parsePrice(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const num = String(val).replace(/[^\d]/g, '');
  return parseInt(num, 10) || 0;
}

function parseOrderDate(dateStr) {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return dateStr;
  const s = String(dateStr).trim();
  // Khớp định dạng DD/MM/YYYY
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmy) {
    return new Date(parseInt(dmy[3], 10), parseInt(dmy[2], 10) - 1, parseInt(dmy[1], 10));
  }
  // Khớp định dạng YYYY-MM-DD
  const ymd = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymd) {
    return new Date(parseInt(ymd[1], 10), parseInt(ymd[2], 10) - 1, parseInt(ymd[3], 10));
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function showFeedback(message, type = 'warning') {
  const el = document.getElementById('revenue-chart-feedback');
  if (!el) return;
  if (!message) {
    el.style.display = 'none';
    el.textContent = '';
    return;
  }
  el.style.display = 'block';
  if (type === 'error') {
    el.style.background = '#FEE2E2';
    el.style.color = '#B91C1C';
    el.style.borderColor = '#FCA5A5';
  } else {
    el.style.background = '#FEF3C7';
    el.style.color = '#B45309';
    el.style.borderColor = '#FDE68A';
  }
  el.textContent = message;
}

// ============================================================================
// ĐỌC VÀ TÍNH TOÁN DỮ LIỆU TỪ LOCALSTORAGE
// ============================================================================
function getStatisticsData(start, end) {
  const state = typeof getAppState === 'function' ? getAppState() : { orders: [] };
  const allOrders = Array.isArray(state.orders) ? state.orders : [];

  const startDay = new Date(start);
  startDay.setHours(0, 0, 0, 0);

  const endDay = new Date(end);
  endDay.setHours(23, 59, 59, 999);

  const revenueByDay = {};
  const statusCounts = {};
  STATUS_CONFIG.forEach(s => { statusCounts[s.key] = 0; });

  let totalOrders = 0;
  let totalValidOrders = 0;
  let totalVolume = 0;
  let totalRevenue = 0;

  allOrders.forEach(o => {
    const oDate = parseOrderDate(o.date);
    if (!oDate) return;

    // Lọc theo khoảng ngày (bao gồm cả ngày bắt đầu và kết thúc)
    if (oDate < startDay || oDate > endDay) return;

    totalOrders++;

    // Thống kê trạng thái
    const rawSt = String(o.orderStatus || 'pending').toLowerCase();
    if (statusCounts.hasOwnProperty(rawSt)) {
      statusCounts[rawSt]++;
    } else {
      statusCounts[rawSt] = 1;
    }

    // Tính doanh thu: Ưu tiên đơn hàng hợp lệ, KHÔNG TÍNH ĐƠN ĐÃ HỦY
    if (rawSt !== 'cancelled') {
      const price = parsePrice(o.price || o.priceFormatted || 0);
      const dayKey = toISO(oDate);

      if (!revenueByDay[dayKey]) {
        revenueByDay[dayKey] = { volume: 0, revenue: 0, count: 0 };
      }
      revenueByDay[dayKey].volume += price;
      // Phí hoa hồng sàn 10%
      const fee = o.platformFee || Math.round(price * 0.1);
      revenueByDay[dayKey].revenue += fee;
      revenueByDay[dayKey].count++;

      totalValidOrders++;
      totalVolume += price;
      totalRevenue += fee;
    }
  });

  return {
    revenueByDay,
    statusCounts,
    totalOrders,
    totalValidOrders,
    totalVolume,
    totalRevenue
  };
}

// Đếm trạng thái đơn toàn bộ hệ thống (KHÔNG lọc ngày) — dùng riêng cho biểu đồ tròn
function getAllOrderStatusCounts() {
  const state = typeof getAppState === 'function' ? getAppState() : { orders: [] };
  const allOrders = Array.isArray(state.orders) ? state.orders : [];

  const statusCounts = {};
  STATUS_CONFIG.forEach(s => { statusCounts[s.key] = 0; });

  allOrders.forEach(o => {
    const rawSt = String(o.orderStatus || 'pending').toLowerCase();
    if (statusCounts.hasOwnProperty(rawSt)) {
      statusCounts[rawSt]++;
    } else {
      statusCounts[rawSt] = (statusCounts[rawSt] || 0) + 1;
    }
  });

  return { statusCounts, totalOrders: allOrders.length };
}

// Gom các ngày trong khoảng vào buckets (ngày không có đơn vẫn hiển thị giá trị 0)
function buildBuckets(revenueByDay, start, end) {
  const spanDays = Math.round((end - start) / 86400000) + 1;
  const buckets = [];

  if (spanDays <= DAILY_LIMIT_DAYS) {
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = toISO(d);
      const row = revenueByDay[key] || { volume: 0, revenue: 0, count: 0 };
      buckets.push({
        label: fmtDDMM(d),
        dateKey: key,
        volume: row.volume,
        revenue: row.revenue,
        count: row.count
      });
    }
    return { buckets, unit: 'ngày' };
  }

  // Nếu khoảng dài hơn 62 ngày, tự động gom theo tháng
  const byMonth = new Map();
  for (let d = new Date(start.getFullYear(), start.getMonth(), 1); d <= end; d.setMonth(d.getMonth() + 1)) {
    const mKey = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
    byMonth.set(mKey, {
      label: `${pad2(d.getMonth() + 1)}/${d.getFullYear()}`,
      volume: 0,
      revenue: 0,
      count: 0
    });
  }

  Object.entries(revenueByDay).forEach(([iso, row]) => {
    const day = parseISO(iso);
    if (!day || day < start || day > end) return;
    const mKey = iso.slice(0, 7);
    const bucket = byMonth.get(mKey);
    if (bucket) {
      bucket.volume += row.volume;
      bucket.revenue += row.revenue;
      bucket.count += row.count;
    }
  });

  return { buckets: [...byMonth.values()], unit: 'tháng' };
}

// ============================================================================
// CHỨC NĂNG 1: VẼ BIỂU ĐỒ CỘT DOANH THU THEO KHOẢNG THỜI GIAN (CHART.JS)
// ============================================================================
function renderBarChart(data, start, end) {
  const { buckets, unit } = buildBuckets(data.revenueByDay, start, end);
  const totalVolume = data.totalVolume;
  const totalRevenue = data.totalRevenue;
  const totalValidOrders = data.totalValidOrders;

  // Cập nhật dòng tóm tắt thông số
  const summaryEl = document.getElementById('revenue-summary-text');
  if (summaryEl) {
    summaryEl.innerHTML = `Từ <strong>${fmtDDMMYYYY(start)}</strong> đến <strong>${fmtDDMMYYYY(end)}</strong> (theo ${unit}) | ` +
      `Tổng giao dịch hợp lệ: <strong>${fmtMoney(totalVolume)}</strong> | ` +
      `Doanh thu sàn (10%): <strong style="color:var(--primary); font-size:15px;">${fmtMoney(totalRevenue)}</strong> (${totalValidOrders} đơn)`;
  }

  const canvas = document.getElementById('revenueBarChart');
  if (!canvas || typeof Chart === 'undefined') return;

  if (revenueChart) {
    revenueChart.destroy();
    revenueChart = null;
  }

  revenueChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: buckets.map(b => b.label),
      datasets: [
        {
          label: 'Giá trị giao dịch (VNĐ)',
          data: buckets.map(b => b.volume),
          backgroundColor: 'rgba(59, 130, 246, 0.75)',
          borderColor: '#2563EB',
          borderWidth: 1,
          borderRadius: 6,
          maxBarThickness: 36
        },
        {
          label: 'Doanh thu sàn 10% (VNĐ)',
          data: buckets.map(b => b.revenue),
          backgroundColor: 'rgba(22, 163, 74, 0.85)',
          borderColor: '#15803D',
          borderWidth: 1,
          borderRadius: 6,
          maxBarThickness: 36
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            font: { family: 'Inter', size: 12, weight: '600' },
            color: '#1E293B',
            boxWidth: 14
          }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ${fmtMoney(ctx.raw || 0)}`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            font: { family: 'Inter', size: 11 },
            color: '#64748B',
            callback: (v) => (v >= 1000000 ? (v / 1000000) + 'M' : (v >= 1000 ? (v / 1000) + 'k' : v))
          },
          grid: { color: '#F1F5F9' }
        },
        x: {
          ticks: { font: { family: 'Inter', size: 11 }, color: '#64748B' },
          grid: { display: false }
        }
      }
    }
  });
}

// ============================================================================
// CHỨC NĂNG 2: VẼ BIỂU ĐỒ TRÒN PHÂN BỔ TRẠNG THÁI ĐƠN HÀNG (CHART.JS)
// ============================================================================
function renderPieChart(data) {
  const counts = data.statusCounts || {};
  const total = data.totalOrders;

  // Lọc lấy danh sách các trạng thái có đơn hoặc cấu hình chuẩn
  const items = STATUS_CONFIG.map(s => {
    const count = counts[s.key] || 0;
    const pct = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
    return { ...s, count, pct };
  });

  // Hiển thị danh sách chi tiết các trạng thái kèm tỷ lệ %
  const listEl = document.getElementById('order-status-stats-list');
  if (listEl) {
    if (total === 0) {
      listEl.innerHTML = `
        <div style="text-align:center; padding:16px; background:#F8FAFC; border-radius:8px; border:1px solid #E2E8F0; color:var(--text-secondary); font-size:12.5px;">
          Hệ thống chưa có đơn hàng nào để thống kê trạng thái.
        </div>`;
    } else {
      listEl.innerHTML = items
        .filter(item => item.count > 0) // Chỉ hiển thị trạng thái có phát sinh đơn
        .map(item => `
          <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 12px; background:#F8FAFC; border-radius:8px; border:1px solid #E2E8F0; font-size:12px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="width:10px; height:10px; border-radius:50%; background:${item.color}; display:inline-block;"></span>
              <strong>${item.label}</strong>
              <span style="color:var(--text-secondary); font-size:11px;">(${item.vi})</span>
            </div>
            <div>
              <strong style="color:var(--secondary);">${item.count} đơn</strong>
              <span style="color:var(--text-secondary); margin-left:6px; font-size:11px;">(${item.pct}%)</span>
            </div>
          </div>
        `).join('') +
        `<div style="text-align:right; font-size:12px; color:var(--text-secondary); padding-top:4px;">
           Tổng cộng: <strong style="color:var(--secondary);">${total}</strong> đơn hàng
         </div>`;
    }
  }

  const canvas = document.getElementById('orderStatusPieChart');
  if (!canvas || typeof Chart === 'undefined') return;

  if (orderStatusChart) {
    orderStatusChart.destroy();
    orderStatusChart = null;
  }

  // Nếu không có đơn hàng nào, vẽ biểu đồ rỗng an toàn (không bị lỗi Chart.js)
  if (total === 0) {
    orderStatusChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['Không có dữ liệu'],
        datasets: [{
          data: [1],
          backgroundColor: ['#E2E8F0'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: () => ' Không có đơn hàng trong khoảng ngày đã chọn'
            }
          }
        }
      }
    });
    return;
  }

  // Chỉ đưa vào biểu đồ tròn các trạng thái có số lượng > 0
  const activeItems = items.filter(it => it.count > 0);

  orderStatusChart = new Chart(canvas, {
    type: 'pie',
    data: {
      labels: activeItems.map(s => s.label),
      datasets: [{
        data: activeItems.map(s => s.count),
        backgroundColor: activeItems.map(s => s.color),
        borderWidth: 2,
        borderColor: '#FFFFFF'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            font: { family: 'Inter', size: 12, weight: '500' },
            color: '#1E293B',
            boxWidth: 14,
            padding: 10
          }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const val = ctx.raw || 0;
              const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
              return ` ${ctx.label}: ${val} đơn (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

// ============================================================================
// ĐIỀU KHIỂN BỘ LỌC & TẢI THỐNG KÊ
// ============================================================================
function loadStatistics() {
  const fromInput = document.getElementById('stats-date-from');
  const toInput = document.getElementById('stats-date-to');
  if (!fromInput || !toInput) return;

  const fromVal = fromInput.value;
  const toVal = toInput.value;

  // Luôn cập nhật biểu đồ tròn từ toàn bộ dữ liệu (không phụ thuộc bộ lọc ngày)
  const allStatus = getAllOrderStatusCounts();
  renderPieChart(allStatus);

  if (!fromVal || !toVal) {
    showFeedback('Vui lòng chọn đầy đủ ngày bắt đầu và ngày kết thúc để xem thống kê.', 'warning');
    return;
  }

  const start = parseISO(fromVal);
  const end = parseISO(toVal);

  if (!start || !end) {
    showFeedback('Định dạng ngày không hợp lệ. Vui lòng chọn lại.', 'error');
    return;
  }

  if (start > end) {
    showFeedback('Ngày bắt đầu không được lớn hơn ngày kết thúc.', 'error');
    return;
  }

  showFeedback('');

  try {
    const data = getStatisticsData(start, end);
    renderBarChart(data, start, end);

    if (data.totalOrders === 0) {
      showFeedback('Không có đơn hàng nào trong khoảng thời gian đã chọn.', 'warning');
    }
  } catch (err) {
    console.error('Lỗi tính toán dữ liệu thống kê:', err);
    showFeedback('Đã xảy ra lỗi khi tạo biểu đồ: ' + err.message, 'error');
  }
}

// Tự động tìm khoảng ngày bao phủ các đơn hàng hiện có trong localStorage
function initStatistics() {
  const fromInput = document.getElementById('stats-date-from');
  const toInput = document.getElementById('stats-date-to');
  if (!fromInput || !toInput) return;

  const state = typeof getAppState === 'function' ? getAppState() : { orders: [] };
  const orders = Array.isArray(state.orders) ? state.orders : [];

  const timestamps = orders
    .map(o => parseOrderDate(o.date))
    .filter(Boolean)
    .map(d => d.getTime());

  if (timestamps.length > 0) {
    const minD = new Date(Math.min(...timestamps));
    const maxD = new Date(Math.max(...timestamps));
    fromInput.value = toISO(minD);
    toInput.value = toISO(maxD);
  } else {
    const today = new Date();
    const monthAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30);
    fromInput.value = toISO(monthAgo);
    toInput.value = toISO(today);
  }

  loadStatistics();
}

// Lắng nghe sự kiện để cập nhật thời gian thực khi localStorage hoặc tab khác thay đổi
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btn-filter-revenue');
  if (btn) btn.addEventListener('click', loadStatistics);

  const fromInput = document.getElementById('stats-date-from');
  const toInput = document.getElementById('stats-date-to');
  if (fromInput) fromInput.addEventListener('change', loadStatistics);
  if (toInput) toInput.addEventListener('change', loadStatistics);

  initStatistics();
});

// Lắng nghe thay đổi từ các trang khác (orders.html, users.html, v.v.)
window.addEventListener('storage', (e) => {
  if (!e.key || e.key === 'SKILL_RENTAL_ADMIN_STATE_V1') {
    loadStatistics();
  }
});

window.addEventListener('appStateUpdated', () => {
  loadStatistics();
});

window.addEventListener('focus', () => {
  loadStatistics();
});
