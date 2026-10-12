/**
 * statistics.js - Thống kê doanh thu theo ngày & Trạng thái đơn hàng (Demo LocalStorage)
 * Chart.js Integration
 */

let revenueChart = null;
let orderStatusChart = null;

// Parse giá tiền sang dạng number (ví dụ: "4.500.000đ" -> 4500000, 4500000 -> 4500000)
function parsePriceToNumber(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const numStr = String(val).replace(/[^0-9]/g, '');
  return parseInt(numStr, 10) || 0;
}

// Parse chuỗi ngày thành Date object ("28/04/2025 10:30", "28/04/2025", "2025-04-28", etc.)
function parseOrderDate(dateStr) {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return dateStr;

  // DD/MM/YYYY format
  if (typeof dateStr === 'string' && dateStr.includes('/')) {
    const parts = dateStr.split(' ')[0].split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      return new Date(year, month, day);
    }
  }

  // ISO / YYYY-MM-DD
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }
  return null;
}

// Format Date sang YYYY-MM-DD (dùng so sánh date key)
function formatDateToISO(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Format Date sang DD/MM (dùng hiển thị nhãn trục hoành biểu đồ)
function formatDateToDDMM(d) {
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}

// Đọc danh sách orders từ localStorage (sử dụng getAppState của common.js hoặc fallback key)
function getOrdersFromStorage() {
  try {
    if (typeof getAppState === 'function') {
      const state = getAppState();
      if (state && Array.isArray(state.orders)) {
        return state.orders;
      }
    }
    const rawState = localStorage.getItem('SKILL_RENTAL_ADMIN_STATE_V1');
    if (rawState) {
      const parsed = JSON.parse(rawState);
      if (parsed && Array.isArray(parsed.orders)) {
        return parsed.orders;
      }
    }
    const rawOrders = localStorage.getItem('orders');
    if (rawOrders) {
      const parsed = JSON.parse(rawOrders);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.error('Lỗi khi đọc orders từ localStorage:', err);
  }
  return [];
}

// ============================================================================
// TASK 1: BIỂU ĐỒ DOANH THU THEO KHOẢNG NGÀY (BAR CHART)
// ============================================================================
function renderRevenueChart() {
  const fromInput = document.getElementById('stats-date-from');
  const toInput = document.getElementById('stats-date-to');
  const feedbackEl = document.getElementById('revenue-chart-feedback');
  const summaryEl = document.getElementById('revenue-summary-text');

  if (!fromInput || !toInput) return;

  const fromVal = fromInput.value;
  const toVal = toInput.value;

  // Kiểm tra nếu chưa chọn ngày
  if (!fromVal || !toVal) {
    if (feedbackEl) {
      feedbackEl.style.display = 'block';
      feedbackEl.className = 'chart-feedback warning';
      feedbackEl.textContent = 'Vui lòng chọn đầy đủ ngày bắt đầu và ngày kết thúc để xem biểu đồ.';
    }
    return;
  }

  const startDate = new Date(fromVal);
  const endDate = new Date(toVal);

  if (startDate > endDate) {
    if (feedbackEl) {
      feedbackEl.style.display = 'block';
      feedbackEl.className = 'chart-feedback error';
      feedbackEl.textContent = 'Ngày bắt đầu không được lớn hơn ngày kết thúc.';
    }
    return;
  }

  if (feedbackEl) {
    feedbackEl.style.display = 'none';
  }

  const orders = getOrdersFromStorage();

  // Tạo map chứa tất cả các ngày trong khoảng [startDate, endDate] với giá trị khởi tạo = 0
  const dateMap = new Map();
  const currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    const isoKey = formatDateToISO(currentDate);
    const labelKey = formatDateToDDMM(currentDate);
    dateMap.set(isoKey, {
      label: labelKey,
      revenue: 0,
      orderCount: 0
    });
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Trạng thái đơn hàng hợp lệ tính doanh thu (thực tế hoặc đang giao dịch đã nạp tiền)
  const validStatuses = ['completed', 'processing', 'confirmed'];

  let totalFilteredRevenue = 0;
  let totalFilteredOrders = 0;

  orders.forEach(order => {
    const status = (order.orderStatus || '').toLowerCase();
    // Bỏ qua đơn bị hủy hoặc tranh chấp
    if (!validStatuses.includes(status) && status !== '') return;

    const orderDate = parseOrderDate(order.date || order.createdAt);
    if (!orderDate) return;

    const isoKey = formatDateToISO(orderDate);
    if (dateMap.has(isoKey)) {
      const price = parsePriceToNumber(order.price || order.total || order.amount || 0);
      const dayData = dateMap.get(isoKey);
      dayData.revenue += price;
      dayData.orderCount += 1;
      totalFilteredRevenue += price;
      totalFilteredOrders += 1;
    }
  });

  const labels = [];
  const data = [];

  dateMap.forEach((val) => {
    labels.push(val.label);
    data.push(val.revenue);
  });

  if (summaryEl) {
    summaryEl.innerHTML = `Khoảng thời gian: <strong>${formatDateToDDMM(startDate)} - ${formatDateToDDMM(endDate)}</strong> | Tổng doanh thu: <strong style="color:var(--primary); font-size:15px;">${totalFilteredRevenue.toLocaleString('vi-VN')}đ</strong> (${totalFilteredOrders} đơn hàng)`;
  }

  // Render Chart.js Bar Chart
  const ctx = document.getElementById('revenueBarChart');
  if (!ctx) return;

  if (revenueChart) {
    revenueChart.destroy();
  }

  revenueChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Doanh thu (VNĐ)',
        data: data,
        backgroundColor: 'rgba(22, 163, 74, 0.8)',
        hoverBackgroundColor: 'rgba(21, 128, 61, 0.95)',
        borderColor: '#16A34A',
        borderWidth: 1.5,
        borderRadius: 6,
        maxBarThickness: 45
      }]
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
            color: '#1E293B'
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const val = context.raw || 0;
              return ` Doanh thu: ${val.toLocaleString('vi-VN')} VNĐ`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            font: { family: 'Inter', size: 11 },
            color: '#64748B',
            callback: function(value) {
              if (value >= 1000000) return (value / 1000000) + 'M';
              if (value >= 1000) return (value / 1000) + 'k';
              return value;
            }
          },
          grid: {
            color: '#F1F5F9'
          }
        },
        x: {
          ticks: {
            font: { family: 'Inter', size: 11 },
            color: '#64748B'
          },
          grid: {
            display: false
          }
        }
      }
    }
  });
}

// ============================================================================
// TASK 2: BIỂU ĐỒ TRÒN PHÂN BỔ TRẠNG THÁI ĐƠN HÀNG (PIE CHART)
// ============================================================================
function renderOrderStatusChart() {
  const orders = getOrdersFromStorage();

  const statusCounts = {
    'PENDING': 0,
    'CONFIRMED': 0,
    'PROCESSING': 0,
    'COMPLETED': 0,
    'CANCELLED': 0,
    'DISPUTED': 0
  };

  orders.forEach(o => {
    const rawSt = (o.orderStatus || '').toUpperCase();
    if (rawSt.includes('PENDING') || rawSt.includes('CHỜ')) {
      statusCounts['PENDING']++;
    } else if (rawSt.includes('CONFIRM') || rawSt.includes('XÁC NHẬN')) {
      statusCounts['CONFIRMED']++;
    } else if (rawSt.includes('PROCESS') || rawSt.includes('THỰC HIỆN')) {
      statusCounts['PROCESSING']++;
    } else if (rawSt.includes('COMPLET') || rawSt.includes('HOÀN THÀNH')) {
      statusCounts['COMPLETED']++;
    } else if (rawSt.includes('CANCEL') || rawSt.includes('HỦY')) {
      statusCounts['CANCELLED']++;
    } else if (rawSt.includes('DISPUT') || rawSt.includes('TRANH CHẤP') || rawSt.includes('KHIẾU NẠI')) {
      statusCounts['DISPUTED']++;
    } else {
      statusCounts['PENDING']++;
    }
  });

  const labels = ['PENDING', 'CONFIRMED', 'PROCESSING', 'COMPLETED', 'CANCELLED', 'DISPUTED'];
  const data = [
    statusCounts['PENDING'],
    statusCounts['CONFIRMED'],
    statusCounts['PROCESSING'],
    statusCounts['COMPLETED'],
    statusCounts['CANCELLED'],
    statusCounts['DISPUTED']
  ];

  // Màu sắc theo đúng semantic Design System
  const backgroundColors = [
    '#F59E0B', // PENDING - Vàng cam
    '#6366F1', // CONFIRMED - Indigo
    '#3B82F6', // PROCESSING - Xanh dương
    '#22C55E', // COMPLETED - Xanh lá
    '#EF4444', // CANCELLED - Đỏ
    '#EC4899'  // DISPUTED - Hồng tím
  ];

  // Render thống kê thẻ nhỏ bên cạnh
  const listEl = document.getElementById('order-status-stats-list');
  if (listEl) {
    const statusLabelsVi = {
      'PENDING': 'Chờ xử lý / thanh toán',
      'CONFIRMED': 'Đã xác nhận',
      'PROCESSING': 'Đang thực hiện',
      'COMPLETED': 'Đã hoàn thành',
      'CANCELLED': 'Đã hủy',
      'DISPUTED': 'Khiếu nại / Tranh chấp'
    };

    listEl.innerHTML = labels.map((st, idx) => `
      <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 12px; background:#F8FAFC; border-radius:8px; border:1px solid #E2E8F0; font-size:12px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="width:10px; height:10px; border-radius:50%; background:${backgroundColors[idx]}; display:inline-block;"></span>
          <strong>${st}</strong>
          <span style="color:var(--text-secondary); font-size:11px;">(${statusLabelsVi[st]})</span>
        </div>
        <span style="font-weight:700; color:var(--secondary);">${data[idx]} đơn</span>
      </div>
    `).join('');
  }

  const ctx = document.getElementById('orderStatusPieChart');
  if (!ctx) return;

  if (orderStatusChart) {
    orderStatusChart.destroy();
  }

  orderStatusChart = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: backgroundColors,
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
            padding: 12
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const label = context.label || '';
              const value = context.raw || 0;
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
              return ` ${label}: ${value} đơn (${percentage}%)`;
            }
          }
        }
      }
    }
  });
}

// Khởi tạo các giá trị ban đầu cho trang thống kê
document.addEventListener('DOMContentLoaded', () => {
  // Gán giá trị mặc định cho Date Picker (từ ngày 20/04/2025 đến ngày 30/04/2025 để khớp với mock orders)
  const fromInput = document.getElementById('stats-date-from');
  const toInput = document.getElementById('stats-date-to');
  const btnFilter = document.getElementById('btn-filter-revenue');

  if (fromInput && toInput) {
    // Mặc định khoảng ngày phù hợp với dữ liệu seed 2025
    fromInput.value = '2025-04-20';
    toInput.value = '2025-04-30';
  }

  if (btnFilter) {
    btnFilter.addEventListener('click', () => {
      renderRevenueChart();
    });
  }

  // Khởi tạo cả 2 biểu đồ
  renderRevenueChart();
  renderOrderStatusChart();
});
