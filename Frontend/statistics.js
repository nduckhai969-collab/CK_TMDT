/**
 * statistics.js - Thống kê dành cho Admin (dữ liệu thật từ GET /api/admin/statistics)
 *  - Biểu đồ CỘT: giá trị giao dịch & doanh thu sàn theo ngày (hoặc theo tháng nếu khoảng ngày dài),
 *    lọc theo "Từ ngày - Đến ngày".
 *  - Biểu đồ TRÒN: phân bổ trạng thái đơn hàng trong cùng khoảng ngày.
 */

let revenueChart = null;
let orderStatusChart = null;

const STATUS_META = [
  { key: 'pending',    label: 'PENDING',    vi: 'Chờ tiếp nhận',   color: '#F59E0B' },
  { key: 'processing', label: 'PROCESSING', vi: 'Đang thực hiện',  color: '#3B82F6' },
  { key: 'delivered',  label: 'DELIVERED',  vi: 'Đã bàn giao',     color: '#6366F1' },
  { key: 'completed',  label: 'COMPLETED',  vi: 'Đã hoàn thành',   color: '#22C55E' },
  { key: 'cancelled',  label: 'CANCELLED',  vi: 'Đã hủy',          color: '#EF4444' },
  { key: 'disputed',   label: 'DISPUTED',   vi: 'Khiếu nại / Tranh chấp', color: '#EC4899' }
];

const DAILY_LIMIT_DAYS = 62; // vượt quá thì gom theo tháng để biểu đồ không bị chi chít

function pad2(n) { return String(n).padStart(2, '0'); }
function toISO(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function parseISO(s) { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); }
function fmtDDMM(d) { return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`; }
function fmtDDMMYYYY(d) { return `${fmtDDMM(d)}/${d.getFullYear()}`; }
function fmtMoney(n) { return Number(n || 0).toLocaleString('vi-VN') + 'đ'; }

function showFeedback(message, type) {
  const el = document.getElementById('revenue-chart-feedback');
  if (!el) return;
  if (!message) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.className = 'chart-feedback ' + (type || 'warning');
  el.textContent = message;
}

async function fetchStatistics(from, to) {
  if (!window.adminApi || typeof window.adminApi.getStatistics !== 'function') {
    throw new Error('adminApi.getStatistics chưa được định nghĩa (kiểm tra common.js).');
  }
  const res = await window.adminApi.getStatistics(from, to);
  if (!res || !res.success) throw new Error((res && res.message) || 'Không lấy được dữ liệu thống kê.');
  return res.data;
}

// Gom doanh thu theo ngày (khoảng ngắn) hoặc theo tháng (khoảng dài)
function buildBuckets(revenueByDay, start, end) {
  const spanDays = Math.round((end - start) / 86400000) + 1;
  const buckets = [];

  if (spanDays <= DAILY_LIMIT_DAYS) {
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const row = revenueByDay[toISO(d)] || { volume: 0, revenue: 0, count: 0 };
      buckets.push({ label: fmtDDMM(d), volume: row.volume, revenue: row.revenue, count: row.count });
    }
    return { buckets, unit: 'ngày' };
  }

  const byMonth = new Map();
  for (let d = new Date(start.getFullYear(), start.getMonth(), 1); d <= end; d.setMonth(d.getMonth() + 1)) {
    byMonth.set(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`, { label: `${pad2(d.getMonth() + 1)}/${d.getFullYear()}`, volume: 0, revenue: 0, count: 0 });
  }
  Object.entries(revenueByDay).forEach(([iso, row]) => {
    const day = parseISO(iso);
    if (day < start || day > end) return;
    const bucket = byMonth.get(iso.slice(0, 7));
    if (!bucket) return;
    bucket.volume += row.volume; bucket.revenue += row.revenue; bucket.count += row.count;
  });
  return { buckets: [...byMonth.values()], unit: 'tháng' };
}

function renderBarChart(data, start, end) {
  const { buckets, unit } = buildBuckets(data.revenueByDay || {}, start, end);
  const totalVolume = buckets.reduce((s, b) => s + b.volume, 0);
  const totalRevenue = buckets.reduce((s, b) => s + b.revenue, 0);
  const totalOrders = buckets.reduce((s, b) => s + b.count, 0);

  const summaryEl = document.getElementById('revenue-summary-text');
  if (summaryEl) {
    summaryEl.innerHTML = `Từ <strong>${fmtDDMMYYYY(start)}</strong> đến <strong>${fmtDDMMYYYY(end)}</strong> (theo ${unit}) | ` +
      `Giá trị giao dịch: <strong>${fmtMoney(totalVolume)}</strong> | ` +
      `Doanh thu sàn: <strong style="color:var(--primary); font-size:15px;">${fmtMoney(totalRevenue)}</strong> (${totalOrders} đơn)`;
  }

  const canvas = document.getElementById('revenueBarChart');
  if (!canvas || typeof Chart === 'undefined') return;
  if (revenueChart) revenueChart.destroy();

  revenueChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: buckets.map(b => b.label),
      datasets: [
        { label: 'Giá trị giao dịch (VNĐ)', data: buckets.map(b => b.volume), backgroundColor: 'rgba(59, 130, 246, 0.75)', borderRadius: 6, maxBarThickness: 40 },
        { label: 'Doanh thu sàn 5% (VNĐ)', data: buckets.map(b => b.revenue), backgroundColor: 'rgba(22, 163, 74, 0.85)', borderRadius: 6, maxBarThickness: 40 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'top', labels: { font: { family: 'Inter', size: 12, weight: '600' }, color: '#1E293B' } },
        tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${Number(ctx.raw || 0).toLocaleString('vi-VN')} VNĐ` } }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            font: { family: 'Inter', size: 11 }, color: '#64748B',
            callback: (v) => (v >= 1000000 ? (v / 1000000) + 'M' : (v >= 1000 ? (v / 1000) + 'k' : v))
          },
          grid: { color: '#F1F5F9' }
        },
        x: { ticks: { font: { family: 'Inter', size: 11 }, color: '#64748B' }, grid: { display: false } }
      }
    }
  });
}

function renderPieChart(data) {
  const counts = data.orderStatuses || {};
  const values = STATUS_META.map(s => Number(counts[s.key] || 0));
  const total = values.reduce((a, b) => a + b, 0);

  const listEl = document.getElementById('order-status-stats-list');
  if (listEl) {
    listEl.innerHTML = STATUS_META.map((s, i) => `
      <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 12px; background:#F8FAFC; border-radius:8px; border:1px solid #E2E8F0; font-size:12px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="width:10px; height:10px; border-radius:50%; background:${s.color}; display:inline-block;"></span>
          <strong>${s.label}</strong>
          <span style="color:var(--text-secondary); font-size:11px;">(${s.vi})</span>
        </div>
        <span style="font-weight:700; color:var(--secondary);">${values[i]} đơn</span>
      </div>`).join('') +
      `<div style="text-align:right; font-size:12px; color:var(--text-secondary); padding-top:4px;">Tổng: <strong>${total}</strong> đơn</div>`;
  }

  const canvas = document.getElementById('orderStatusPieChart');
  if (!canvas || typeof Chart === 'undefined') return;
  if (orderStatusChart) orderStatusChart.destroy();

  orderStatusChart = new Chart(canvas, {
    type: 'pie',
    data: {
      labels: STATUS_META.map(s => s.label),
      datasets: [{ data: values, backgroundColor: STATUS_META.map(s => s.color), borderWidth: 2, borderColor: '#FFFFFF' }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { font: { family: 'Inter', size: 12, weight: '500' }, color: '#1E293B', boxWidth: 14, padding: 12 } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const value = ctx.raw || 0;
              const sum = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = sum > 0 ? ((value / sum) * 100).toFixed(1) : 0;
              return ` ${ctx.label}: ${value} đơn (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

// Đọc khoảng ngày trong 2 ô input, kiểm tra hợp lệ, gọi API rồi vẽ lại cả 2 biểu đồ
async function loadStatistics() {
  const fromVal = document.getElementById('stats-date-from').value;
  const toVal = document.getElementById('stats-date-to').value;

  if (!fromVal || !toVal) {
    showFeedback('Vui lòng chọn đầy đủ ngày bắt đầu và ngày kết thúc để xem biểu đồ.', 'warning');
    return;
  }
  const start = parseISO(fromVal);
  const end = parseISO(toVal);
  if (start > end) {
    showFeedback('Ngày bắt đầu không được lớn hơn ngày kết thúc.', 'error');
    return;
  }

  showFeedback('');
  try {
    const data = await fetchStatistics(fromVal, toVal);
    renderBarChart(data, start, end);
    renderPieChart(data);
    if (!data.totalOrders) showFeedback('Không có đơn hàng nào trong khoảng thời gian đã chọn.', 'warning');
  } catch (err) {
    console.error('Lỗi tải thống kê:', err);
    showFeedback('Không tải được thống kê: ' + err.message, 'error');
  }
}

// Lần đầu: lấy toàn bộ dữ liệu để chọn sẵn khoảng ngày có đơn hàng (không gán cứng ngày nào)
async function initStatistics() {
  const fromInput = document.getElementById('stats-date-from');
  const toInput = document.getElementById('stats-date-to');
  if (!fromInput || !toInput) return;

  try {
    const all = await fetchStatistics('', '');
    const days = Object.keys(all.revenueByDay || {}).sort();
    if (days.length) {
      fromInput.value = days[0];
      toInput.value = days[days.length - 1];
    } else {
      const today = new Date();
      const monthAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30);
      fromInput.value = toISO(monthAgo);
      toInput.value = toISO(today);
    }
  } catch (err) {
    console.error('Lỗi khởi tạo thống kê:', err);
    showFeedback('Không tải được thống kê: ' + err.message, 'error');
    return;
  }
  loadStatistics();
}

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btn-filter-revenue');
  if (btn) btn.addEventListener('click', loadStatistics);
  initStatistics();
});
