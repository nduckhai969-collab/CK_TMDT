const db = require('../data/db');
const { generateId } = require('../utils/id');
const { formatDateTime } = require('../utils/dates');

// Quỹ nền tảng: nơi giữ toàn bộ khoản lợi nhuận của sàn (Admin sở hữu).
// Sổ cái collection `platformFundTransactions`; số dư = tổng các bút toán thu.
const COLLECTION = 'platformFundTransactions';

const FUND_SOURCES = {
  package_purchase: 'Phí mua gói dịch vụ',
  platform_maintenance: 'Phí duy trì sàn',
  order_commission: 'Hoa hồng sàn (đơn hoàn tất)',
  cancellation_penalty: 'Tiền phạt hủy đơn'
};

function formatVND(value) {
  return `${Math.round(Number(value) || 0).toLocaleString('vi-VN')}đ`;
}

function loadLedger() {
  return db.getCollection(COLLECTION) || [];
}

// Ghi một khoản thu vào quỹ nền tảng.
// Bỏ qua khi số tiền <= 0 hoặc đã có bút toán cùng nguồn cho cùng đơn hàng (chống ghi trùng).
function credit({ source, amount, description = '', orderId = null, providerId = null, providerName = '', userId = null, packageId = null, method = '' }) {
  const value = Math.round(Number(amount) || 0);
  if (value <= 0) return null;

  const ledger = loadLedger();
  if (orderId && ledger.some(item => item.orderId === orderId && item.source === source)) return null;

  const entry = {
    id: generateId('FUND'),
    source,
    sourceLabel: FUND_SOURCES[source] || source,
    amount: value,
    description,
    orderId,
    providerId,
    providerName,
    userId,
    packageId,
    method,
    createdAt: formatDateTime(new Date())
  };
  ledger.unshift(entry);
  db.saveCollection(COLLECTION, ledger);
  return entry;
}

function getFund() {
  const ledger = loadLedger();
  const balance = ledger.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  const totalsBySource = [];
  const seen = new Set();
  for (const item of ledger) {
    const source = item.source || 'other';
    if (seen.has(source)) continue;
    seen.add(source);
    const amount = ledger
      .filter(row => (row.source || 'other') === source)
      .reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
    totalsBySource.push({
      source,
      label: FUND_SOURCES[source] || item.sourceLabel || source,
      amount,
      amountFormatted: formatVND(amount)
    });
  }
  totalsBySource.sort((a, b) => b.amount - a.amount);

  return {
    balance,
    balanceFormatted: formatVND(balance),
    transactionCount: ledger.length,
    transactions: ledger,
    totalsBySource
  };
}

module.exports = { FUND_SOURCES, COLLECTION, formatVND, credit, getFund };
