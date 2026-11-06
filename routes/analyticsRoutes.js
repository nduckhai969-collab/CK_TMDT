/**
 * ============================================================================
 * SkillRental Platform - Analytics & Statistics Router
 * File: routes/analyticsRoutes.js
 * ============================================================================
 * Chức năng 10: Thống kê biểu đồ cột doanh thu theo tùy chọn thời gian (từ ngày đến ngày)
 * Chức năng 11: Thống kê biểu đồ tròn danh mục sản phẩm bán chạy nhất
 */

const express = require('express');
const router = express.Router();
const db = require('../data/db');

// Danh mục chuẩn hệ thống
const CATEGORIES = [
  { id: 'IT', name: 'Lập trình & CNTT' },
  { id: 'Design', name: 'Thiết kế Đồ họa & UI/UX' },
  { id: 'Tutor', name: 'Gia sư & Đào tạo' },
  { id: 'Home', name: 'Dịch vụ Gia đình & Đời sống' },
  { id: 'Repair', name: 'Sửa chữa & Kỹ thuật' }
];

// Helper chuẩn hóa ngày YYYY-MM-DD
function toDateLabel(dateInput) {
  if (!dateInput) return '';
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
    return dateInput.trim();
  }
  const s = String(dateInput).trim();
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  const d = new Date(s);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ============================================================================
// 10. THỐNG KÊ BIỂU ĐỒ CỘT DOANH THU THEO KHOẢNG THỜI GIAN (FROMDATE - TODATE)
// ============================================================================
// API: GET /api/analytics/revenue?fromDate=2026-10-01&toDate=2026-10-25
router.get('/revenue', (req, res) => {
  try {
    const { fromDate, toDate } = req.query;
    const orders = db.getCollection('orders') || [];

    // Chỉ lấy các đơn đã thanh toán hoặc đã giao hàng thành công: status IN ('PAID', 'DELIVERED', ...)
    const paidOrders = orders.filter(o => {
      const st = String(o.status || o.orderStatus || o.paymentStatus || '').toUpperCase();
      return ['PAID', 'DELIVERED', 'COMPLETED', 'PROCESSING', 'ESCROW_HELD'].includes(st) && st !== 'CANCELLED' && st !== 'PENDING_PAYMENT';
    });

    // Lọc theo khoảng ngày (fromDate -> toDate)
    const startDateStr = fromDate ? toDateLabel(fromDate) : '2020-01-01';
    const endDateStr = toDate ? toDateLabel(toDate) : '2099-12-31';

    const filtered = paidOrders.filter(o => {
      const dLabel = toDateLabel(o.created_at || o.date || o.createdAt);
      if (!dLabel) return true;
      return dLabel >= startDateStr && dLabel <= endDateStr;
    });

    // SQL GROUP BY DATE(created_at)
    // Tính tổng doanh thu: SUM(total_price)
    const revenueMap = {};
    filtered.forEach(o => {
      const dateLabel = toDateLabel(o.created_at || o.date || o.createdAt) || toDateLabel(new Date());
      const amount = Number(o.total_price || o.price || o.escrowDeposit || 0);
      if (!revenueMap[dateLabel]) {
        revenueMap[dateLabel] = 0;
      }
      revenueMap[dateLabel] += amount;
    });

    // Format kết quả theo chuẩn yêu cầu:
    // [{ date_label: "2026-10-01", total_revenue: 5000000 }, ...]
    const dateKeys = Object.keys(revenueMap).sort();
    const result = dateKeys.map(date_label => ({
      date_label,
      total_revenue: revenueMap[date_label]
    }));

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================================
// 11. THỐNG KÊ BIỂU ĐỒ TRÒN - TOP DANH MỤC BÁN CHẠY NHẤT
// ============================================================================
// API: GET /api/analytics/top-categories
router.get('/top-categories', (req, res) => {
  try {
    const { fromDate, toDate } = req.query;
    const orders = db.getCollection('orders') || [];
    const orderItems = db.getCollection('order_items') || [];
    const services = db.getCollection('services') || [];

    // Chuẩn hóa mốc thời gian lọc (WHERE o.created_at BETWEEN fromDate AND toDate)
    const startDateStr = fromDate ? toDateLabel(fromDate) : '2020-01-01';
    const endDateStr = toDate ? toDateLabel(toDate) : '2099-12-31';

    // Chỉ tính các đơn đã thanh toán / thành công và nằm trong khoảng thời gian
    const validOrders = orders.filter(o => {
      const st = String(o.status || o.orderStatus || o.paymentStatus || '').toUpperCase();
      const isValidStatus = ['PAID', 'DELIVERED', 'COMPLETED', 'PROCESSING', 'ESCROW_HELD'].includes(st) && st !== 'CANCELLED' && st !== 'PENDING_PAYMENT';
      if (!isValidStatus) return false;

      const dLabel = toDateLabel(o.created_at || o.date || o.createdAt);
      if (!dLabel) return true;
      return dLabel >= startDateStr && dLabel <= endDateStr;
    });
    const validOrderIds = new Set(validOrders.map(o => o.id));

    // Gom nhóm số lượng bán ra theo danh mục (c.name as category_name, SUM(oi.quantity) as total_sold)
    const categoryStats = {};
    CATEGORIES.forEach(c => {
      categoryStats[c.id] = {
        category_id: c.id,
        category_name: c.name,
        total_sold: 0,
        total_revenue: 0
      };
    });

    // 1. Duyệt qua order_items của các đơn hợp lệ
    const validItems = orderItems.filter(oi => validOrderIds.has(oi.order_id || oi.orderId));
    validItems.forEach(oi => {
      const prodId = oi.product_id || oi.productId || oi.serviceId;
      const srv = services.find(s => s.id === prodId) || {};
      const catKey = srv.category || 'IT';
      const qty = Number(oi.quantity || oi.hours) || 1;
      const price = Number(oi.price_at_purchase || oi.priceAtPurchase || srv.price) || 0;

      if (!categoryStats[catKey]) {
        categoryStats[catKey] = {
          category_id: catKey,
          category_name: catKey,
          total_sold: 0,
          total_revenue: 0
        };
      }
      categoryStats[catKey].total_sold += qty;
      categoryStats[catKey].total_revenue += qty * price;
    });

    // 2. Nếu order_items chưa có (cho các đơn cũ), tính bổ sung từ order.serviceId / serviceTitle
    validOrders.forEach(o => {
      const hasInItems = validItems.some(oi => (oi.order_id === o.id || oi.orderId === o.id));
      if (!hasInItems) {
        const srv = services.find(s => s.id === o.serviceId) || {};
        const catKey = srv.category || 'IT';
        if (!categoryStats[catKey]) {
          categoryStats[catKey] = {
            category_id: catKey,
            category_name: catKey,
            total_sold: 0,
            total_revenue: 0
          };
        }
        categoryStats[catKey].total_sold += 1;
        categoryStats[catKey].total_revenue += Number(o.total_price || o.price || 0);
      }
    });

    // Định dạng mảng kết quả: [{ category_name: "Lập trình & CNTT", total_sold: 25 }, ...]
    // Sắp xếp giảm dần theo số lượng bán chạy nhất
    const result = Object.values(categoryStats)
      .map(item => ({
        category_id: item.category_id,
        category_name: item.category_name,
        total_sold: item.total_sold,
        total_revenue: item.total_revenue
      }))
      .sort((a, b) => b.total_sold - a.total_sold);

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
