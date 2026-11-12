const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const db = require('../data/db');
const { sendWalletUpdate } = require('../utils/socketService');

/**
 * Kiểm tra xem ngày hiện tại có phải là ngày cuối cùng của tháng không
 */
function isLastDayOfMonth(date = new Date()) {
  const tomorrow = new Date(date);
  tomorrow.setDate(date.getDate() + 1);
  return tomorrow.getDate() === 1;
}

/**
 * Lấy chu kỳ tháng/năm hiện tại (Ví dụ: 11/2026)
 */
function getCurrentPeriod(date = new Date()) {
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

/**
 * Thực hiện quét và đối soát doanh thu cuối tháng cho toàn bộ Provider
 * - Quét các provider có balance >= 50.000đ
 * - Loại trừ đơn có tranh chấp (DISPUTED) hoặc đang trong 5 phút chờ hủy (CANCELLATION_PENDING)
 * - Khấu trừ số dư ví khả dụng về 0 (đóng băng để chuyển khoản)
 * - Tạo bản ghi vào bảng payout_statements với trạng thái PENDING
 */
async function executeMonthlySettlement(options = {}) {
  const now = options.date ? new Date(options.date) : new Date();
  const period = getCurrentPeriod(now);
  console.log(`[Settlement] 🏁 Bắt đầu tiến trình đối soát doanh thu cuối tháng cho chu kỳ: ${period}`);

  const providers = db.getCollection('providers') || [];
  const users = db.getCollection('users') || [];
  const orders = db.getCollection('orders') || [];
  const payoutStatements = db.getCollection('payout_statements') || [];
  const walletTransactions = db.getCollection('walletTransactions') || [];

  const createdStatements = [];
  let totalSettledAmount = 0;

  for (const provider of providers) {
    const providerUserIndex = users.findIndex(u => u.id === provider.userId || u.id === provider.id);
    let currentBalance = providerUserIndex >= 0
      ? (Number(users[providerUserIndex].balance) || 0)
      : (Number(provider.balance) || 0);
    provider.balance = currentBalance;

    // Kiểm tra số dư ví phải >= 50,000 VND mới đủ điều kiện rút tự động
    if (currentBalance < 50000) {
      continue;
    }

    // Kiểm tra các đơn hàng của provider này
    const providerOrders = orders.filter(o => 
      o.providerId === provider.id || 
      (provider.userId && o.providerId === provider.userId)
    );

    // Tính tổng số tiền đang bị kẹt trong trạng thái tranh chấp (DISPUTED) hoặc chờ hủy (CANCELLATION_PENDING)
    const lockedAmount = providerOrders
      .filter(o => {
        const s = String(o.orderStatus || o.status || '').toLowerCase();
        return s === 'disputed' || s === 'cancellation_pending';
      })
      .reduce((sum, o) => sum + (Number(o.price) || Number(o.total_price) || 0), 0);

    // Số tiền thực tế khả dụng để đối soát (sau khi đã trừ đơn tranh chấp/chờ hủy)
    const settleableAmount = Math.max(0, currentBalance - lockedAmount);

    if (settleableAmount < 50000) {
      console.log(`[Settlement] ⚠️ Provider ${provider.name} (${provider.id}) số dư khả dụng sau khi trừ đơn kẹt là ${settleableAmount}đ (< 50,000đ), bỏ qua chu kỳ này.`);
      continue;
    }

    // Sinh mã đối soát duy nhất
    const statementId = `STMT-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${String(provider.id).replace(/[^a-zA-Z0-9]/g, '')}`;

    // Kiểm tra xem lệnh đối soát chu kỳ này đã tạo chưa
    const existingStmt = payoutStatements.find(s => s.id === statementId || (s.providerId === provider.id && s.period === period && s.status !== 'FAILED'));
    if (existingStmt) {
      console.log(`[Settlement] ℹ️ Provider ${provider.id} đã có lệnh đối soát ${existingStmt.id} trong chu kỳ ${period}.`);
      continue;
    }

    // 1. Trừ tiền ví Provider (chuyển sang trạng thái chờ đối soát ngân hàng)
    const previousBalance = currentBalance;
    const newBalance = currentBalance - settleableAmount;
    provider.balance = newBalance;

    // Đồng bộ sang bảng users
    const userIndex = users.findIndex(u => u.id === provider.userId || u.id === provider.id);
    if (userIndex !== -1) {
      users[userIndex].balance = newBalance;
    }

    // 2. Ghi nhận giao dịch ví
    const txn = {
      id: `TXN-STMT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      userId: provider.userId || provider.id,
      providerId: provider.id,
      payoutId: statementId,
      type: 'payout_settlement',
      amount: -settleableAmount,
      balanceAfter: newBalance,
      status: 'pending',
      description: `Khấu trừ đối soát chi trả doanh thu cuối tháng (${period}) - Mã lệnh: ${statementId}`,
      createdAt: now.toISOString()
    };
    walletTransactions.unshift(txn);

    // 3. Tạo bảng kê thanh toán (payout_statements)
    const statement = {
      id: statementId,
      providerId: provider.id,
      providerName: provider.name || 'Đối tác SkillRental',
      providerEmail: provider.email || '',
      providerPhone: provider.phone || '',
      bankAccount: provider.bankAccount || provider.bankAccountNumber || provider.accountNumber || 'Chưa cung cấp',
      accountHolder: provider.accountHolder || provider.bankAccountName || provider.name || 'Đối tác',
      bankName: provider.bankName || 'Ngân Hàng Nội Địa',
      amount: settleableAmount,
      currency: 'VND',
      period: period,
      status: 'PENDING', // PENDING -> COMPLETED hoặc FAILED
      note: `Đối soát doanh thu chu kỳ ${period}`,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };

    payoutStatements.unshift(statement);
    createdStatements.push(statement);
    totalSettledAmount += settleableAmount;

    // Phát thông báo thời gian thực tới Provider
    sendWalletUpdate(provider.userId || provider.id, newBalance, {
      change: -settleableAmount,
      type: 'payout_settlement',
      message: `Hệ thống đã kết chuyển ${settleableAmount.toLocaleString('vi-VN')}đ doanh thu chu kỳ ${period} vào danh sách chi trả ngân hàng.`
    });
  }

  if (createdStatements.length > 0) {
    db.saveCollection('providers', providers);
    db.saveCollection('users', users);
    db.saveCollection('payout_statements', payoutStatements);
    db.saveCollection('walletTransactions', walletTransactions);
    console.log(`[Settlement] ✅ Đã hoàn tất đối soát chu kỳ ${period}: Tạo thành công ${createdStatements.length} lệnh, tổng tiền: ${totalSettledAmount.toLocaleString('vi-VN')}đ`);
  } else {
    console.log(`[Settlement] ℹ️ Không có Provider nào đủ điều kiện đối soát trong chu kỳ ${period}.`);
  }

  return {
    success: true,
    period,
    count: createdStatements.length,
    totalAmount: totalSettledAmount,
    statements: createdStatements
  };
}

/**
 * Xuất danh sách bảng kê chi trả đối soát ra file Excel theo chuẩn ngân hàng
 * Cột dữ liệu: STT, Mã Lệnh, Tên Tài Khoản Nhận, Số Tài Khoản (STK), Ngân Hàng Nhận, Số Tiền Thực Nhận (VND), Nội Dung Chuyển Khoản
 */
async function generateSettlementExcel(statements, period = '') {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SkillRental Platform';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Danh Sách Đối Soát');

  // Định nghĩa các cột
  worksheet.columns = [
    { header: 'STT', key: 'stt', width: 8 },
    { header: 'Mã Lệnh', key: 'id', width: 22 },
    { header: 'Tên Tài Khoản Nhận', key: 'accountHolder', width: 28 },
    { header: 'Số Tài Khoản (STK)', key: 'bankAccount', width: 22 },
    { header: 'Ngân Hàng Nhận', key: 'bankName', width: 25 },
    { header: 'Số Tiền Thực Nhận (VND)', key: 'amount', width: 25 },
    { header: 'Nội Dung Chuyển Khoản', key: 'transferContent', width: 35 }
  ];

  // Style cho Header (Dòng 1)
  const headerRow = worksheet.getRow(1);
  headerRow.height = 30;
  headerRow.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E3A8A' } // Xanh Navy chuyên nghiệp
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'medium' },
      right: { style: 'thin' }
    };
  });

  // Đổ dữ liệu vào từng dòng
  statements.forEach((item, index) => {
    const row = worksheet.addRow({
      stt: index + 1,
      id: item.id || `STMT-${index + 1}`,
      accountHolder: String(item.accountHolder || '').toUpperCase(),
      bankAccount: String(item.bankAccount || '').replace(/[^0-9A-Za-z]/g, ''),
      bankName: item.bankName || 'Ngân hàng',
      amount: Number(item.amount) || 0,
      transferContent: `THANH TOAN DOI SOAT ${item.id || ''} SKILLRENTAL`
    });

    row.height = 24;
    row.eachCell((cell, colNumber) => {
      cell.font = { name: 'Arial', size: 10 };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
      };

      if (colNumber === 1 || colNumber === 2 || colNumber === 4) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else if (colNumber === 6) {
        // Cột tiền
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        cell.numFmt = '#,##0';
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      }
    });
  });

  return workbook;
}

/**
 * Cập nhật trạng thái chi trả hàng loạt (Bulk Status Update)
 * - Nếu chuyển sang COMPLETED: Xác nhận tiền đã về tay Provider thành công
 * - Nếu chuyển sang FAILED: Tự động hoàn trả số tiền đối soát lại vào số dư ví của Provider!
 */
async function updatePayoutBulkStatus(statementIds, newStatus, reason = '') {
  if (!Array.isArray(statementIds) || statementIds.length === 0) {
    throw new Error('Danh sách mã đối soát không hợp lệ.');
  }

  const validStatuses = ['PENDING', 'COMPLETED', 'SUCCESS', 'FAILED'];
  const targetStatus = String(newStatus).toUpperCase();
  if (!validStatuses.includes(targetStatus)) {
    throw new Error('Trạng thái không hợp lệ. Hỗ trợ: COMPLETED, FAILED, PENDING.');
  }

  const payoutStatements = db.getCollection('payout_statements') || [];
  const providers = db.getCollection('providers') || [];
  const users = db.getCollection('users') || [];
  const walletTransactions = db.getCollection('walletTransactions') || [];

  const updatedList = [];
  const now = new Date().toISOString();

  for (const sid of statementIds) {
    const stmt = payoutStatements.find(s => s.id === sid);
    if (!stmt) continue;

    const oldStatus = stmt.status;
    stmt.status = targetStatus === 'SUCCESS' ? 'COMPLETED' : targetStatus;
    stmt.updatedAt = now;
    if (reason) stmt.failureReason = reason;
    const settlementTxn = walletTransactions.find(t => t.type === 'payout_settlement' && (t.payoutId === stmt.id || String(t.description || '').includes(stmt.id)));
    if (settlementTxn) {
      settlementTxn.status = stmt.status === 'COMPLETED' ? 'completed' : stmt.status === 'FAILED' ? 'failed' : 'pending';
      settlementTxn.updatedAt = now;
    }

    // NẾU CHUYỂN KHOẢN THẤT BẠI (FAILED) -> HOÀN TIỀN LẠI VÀO VÍ CỦA PROVIDER
    if (stmt.status === 'FAILED' && oldStatus !== 'FAILED') {
      const provider = providers.find(p => p.id === stmt.providerId || p.userId === stmt.providerId);
      if (provider) {
        const refundAmount = Number(stmt.amount) || 0;
        provider.balance = (Number(provider.balance) || 0) + refundAmount;

        const userIndex = users.findIndex(u => u.id === provider.userId || u.id === provider.id);
        if (userIndex !== -1) {
          users[userIndex].balance = provider.balance;
        }

        // Ghi transaction hoàn trả
        walletTransactions.unshift({
          id: `TXN-REFUND-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          userId: provider.userId || provider.id,
          providerId: provider.id,
          type: 'payout_refund',
          amount: refundAmount,
          balanceAfter: provider.balance,
          status: 'completed',
          description: `Hoàn tiền đối soát thất bại (Mã lệnh: ${stmt.id}) vào ví. Lý do: ${reason || 'Lỗi giao dịch ngân hàng'}`,
          createdAt: now
        });

        // Bắn socket cập nhật số dư cho Provider
        sendWalletUpdate(provider.userId || provider.id, provider.balance, {
          change: refundAmount,
          type: 'payout_refund',
          message: `Lệnh đối soát ${stmt.id} thất bại. Toàn bộ ${refundAmount.toLocaleString('vi-VN')}đ đã được hoàn lại vào ví của bạn.`
        });
      }
    }

    updatedList.push(stmt);
  }

  db.saveCollection('payout_statements', payoutStatements);
  db.saveCollection('providers', providers);
  db.saveCollection('users', users);
  db.saveCollection('walletTransactions', walletTransactions);

  return {
    success: true,
    updatedCount: updatedList.length,
    updatedList
  };
}

module.exports = {
  isLastDayOfMonth,
  getCurrentPeriod,
  executeMonthlySettlement,
  generateSettlementExcel,
  updatePayoutBulkStatus
};
