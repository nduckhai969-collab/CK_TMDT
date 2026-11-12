const db = require('../data/db');
const { createNotification, notifyProvider } = require('./notificationService');
const { formatDateTime, parseDateTime } = require('../utils/dates');

const CANCELLATION_WINDOW_MS = 24 * 60 * 60 * 1000;

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function updateOrderMilestone(order, title, timeStr = null) {
  if (!order.milestones) order.milestones = [];
  order.milestones.push({
    title,
    done: true,
    time: timeStr || formatDateTime(new Date())
  });
}

function findProviderByUserId(userId) {
  return (db.getCollection('providers') || []).find(p => p.userId === userId || p.id === userId) || null;
}

function loadOrder(orders, orderId) {
  const order = orders.find(o => o.id === orderId);
  if (!order) throw httpError(404, 'Không tìm thấy đơn hàng');
  return order;
}

function getCancellationDeadlineAt(order) {
  const createdAt = parseDateTime(order.createdAtISO || order.createdAt || order.created_at || order.date);
  return createdAt ? new Date(createdAt.getTime() + CANCELLATION_WINDOW_MS).toISOString() : null;
}

function assertCancellationWindowOpen(order, now = Date.now()) {
  const deadlineAt = getCancellationDeadlineAt(order);
  if (!deadlineAt) {
    throw httpError(409, 'Không xác định được thời điểm tạo đơn nên hệ thống không thể xác nhận hạn hủy. Vui lòng liên hệ hỗ trợ.');
  }
  if (now > Date.parse(deadlineAt)) {
    throw httpError(409, `Đã quá 24 giờ kể từ lúc tạo đơn. Hạn hủy là ${new Date(deadlineAt).toLocaleString('vi-VN')}; đơn không thể hủy và Admin không thể can thiệp.`);
  }
  return deadlineAt;
}

function assertProviderOwnsOrder(order, userId) {
  const provider = findProviderByUserId(userId);
  if (!provider || provider.id !== order.providerId) {
    throw httpError(403, 'Không có quyền thao tác đơn hàng này');
  }
}

function assertOrderPaid(order) {
  if (order.paymentStatus === 'pending') throw httpError(409, 'Đơn hàng chưa được khách thanh toán.');
}

// ─── ACCEPT / DELIVER / PROGRESS ─────────────────────────────────────────────

function processAcceptOrder(orderId, userId) {
  const orders = db.getCollection('orders');
  const order = loadOrder(orders, orderId);
  assertProviderOwnsOrder(order, userId);
  assertOrderPaid(order);
  if (order.orderStatus !== 'pending') throw httpError(409, 'Đơn hàng không ở trạng thái chờ tiếp nhận');

  order.orderStatus = 'processing';
  updateOrderMilestone(order, 'Provider tiếp nhận yêu cầu & triển khai công việc');
  db.saveCollection('orders', orders);

  createNotification(order.customerId, 'Đơn hàng được tiếp nhận',
    `Chuyên gia đã tiếp nhận đơn hàng ${order.id} và bắt đầu thực hiện.`, 'info',
    `/customer_orders.html?orderId=${encodeURIComponent(order.id)}`);
  return order;
}

function processDeliverOrder(orderId, userId, handoverData = {}) {
  const orders = db.getCollection('orders');
  const order = loadOrder(orders, orderId);
  assertProviderOwnsOrder(order, userId);
  assertOrderPaid(order);
  if (order.orderStatus !== 'processing') throw httpError(409, 'Đơn hàng chưa được xử lý hoặc đã giao');

  order.orderStatus = 'delivered';
  order.deliveredAt = new Date().toISOString();
  order.autoReleaseAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  if (typeof handoverData === 'string') {
    order.handoverNotes = handoverData;
  } else if (typeof handoverData === 'object' && handoverData !== null) {
    if (handoverData.handoverNotes || handoverData.note) order.handoverNotes = handoverData.handoverNotes || handoverData.note;
    if (handoverData.deliveryLink) order.deliveryLink = handoverData.deliveryLink;
    if (handoverData.attachments) order.attachments = handoverData.attachments;
  }
  updateOrderMilestone(order, 'Bàn giao sản phẩm / hoàn thành dịch vụ');
  db.saveCollection('orders', orders);

  createNotification(order.customerId, 'Đơn hàng đã bàn giao',
    `Chuyên gia đã bàn giao đơn hàng ${order.id}. Vui lòng kiểm tra và nghiệm thu (Hệ thống sẽ tự động giải ngân sau 48h nếu không có khiếu nại).`,
    'success', `/customer_orders.html?orderId=${encodeURIComponent(order.id)}`);
  return order;
}

function processProgressOrder(orderId, userId, payload) {
  const orders = db.getCollection('orders');
  const order = loadOrder(orders, orderId);
  assertProviderOwnsOrder(order, userId);
  assertOrderPaid(order);
  if (order.orderStatus !== 'processing') throw httpError(409, 'Chỉ có thể cập nhật tiến độ khi đơn đang xử lý');

  let note = '';
  if (typeof payload === 'string') {
    note = payload;
  } else if (typeof payload === 'object' && payload !== null) {
    note = payload.notes || payload.note || '';
    if (payload.progressPercent !== undefined) order.progressPercent = Number(payload.progressPercent);
    if (Array.isArray(payload.completedTasks)) order.completedTasks = payload.completedTasks;
  }

  if (note) updateOrderMilestone(order, `Cập nhật tiến độ: ${note}`);
  db.saveCollection('orders', orders);

  createNotification(order.customerId, 'Tiến độ đơn hàng',
    `Đơn hàng ${order.id} được cập nhật tiến độ${note ? `: ${note}` : ''}.`, 'info',
    `/customer_orders.html?orderId=${encodeURIComponent(order.id)}`);
  return order;
}

// ─── REFUND HELPER ────────────────────────────────────────────────────────────

function refundCustomer(order, amountOverride = null) {
  const users = db.getCollection('users') || [];
  const customer = users.find(u => u.id === order.customerId || u.uid === order.customerId);
  const amount = amountOverride !== null
    ? Number(amountOverride)
    : (Number(order.escrowDeposit) || Number(order.price) || 0);

  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (!customer) {
    throw httpError(404, `Không tìm thấy tài khoản khách hàng của đơn ${order.id}; chưa thể hoàn tiền.`);
  }

  customer.balance = (Number(customer.balance) || 0) + amount;
  db.saveCollection('users', users);

  const transactions = db.getCollection('walletTransactions') || [];
  transactions.unshift({
    id: `TXN_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    userId: customer.id,
    type: 'refund',
    amount,
    status: 'completed',
    createdAt: formatDateTime(new Date()),
    description: `Hoàn tiền ký quỹ từ đơn hàng ${order.id}`
  });
  db.saveCollection('walletTransactions', transactions);
  return amount;
}

function payProvider(order, amount) {
  if (!amount || amount <= 0) return 0;
  const providers = db.getCollection('providers');
  const provider = providers.find(p => p.id === order.providerId || p.userId === order.providerId);
  const users = db.getCollection('users');
  const providerUser = provider ? users.find(u => u.id === provider.userId) : users.find(u => u.id === order.providerId);
  if (!providerUser) throw httpError(409, 'Không tìm thấy tài khoản nhận tiền của Provider; chưa thể giải ngân đơn hàng.');

  providerUser.balance = (Number(providerUser.balance) || 0) + amount;
  db.saveCollection('users', users);

  const transactions = db.getCollection('walletTransactions') || [];
  transactions.unshift({
    id: `TXN_${Date.now() + 1}_${Math.floor(Math.random() * 1000)}`,
    userId: providerUser.id,
    providerId: provider?.id || order.providerId,
    orderId: order.id,
    type: 'disbursement',
    amount,
    balanceAfter: providerUser.balance,
    status: 'completed',
    createdAt: formatDateTime(new Date()),
    description: `Thanh toán theo phán quyết phân xử đơn ${order.id}`
  });
  db.saveCollection('walletTransactions', transactions);
  return amount;
}

function getAppointmentTime(order) {
  if (!order.scheduledDate || !order.scheduledTime) return null;
  const [year, month, day] = String(order.scheduledDate).split('-').map(Number);
  const match = String(order.scheduledTime).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const date = new Date(year, month - 1, day, Number(match[1]), Number(match[2]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function settleCancellation(order, cancelledBy) {
  const price = Math.max(0, Number(order.price) || 0);
  const fee = Math.max(0, Number(order.platformFee) || 0);
  const escrow = Math.max(0, Number(order.escrowDeposit) || (price + fee));
  let refundAmount = 0;
  let providerAmount = 0;
  let penalty = 0;
  const now = Date.now();
  const appointment = getAppointmentTime(order);
  const hoursUntil = appointment ? (appointment.getTime() - now) / 3600000 : null;

  if (cancelledBy === 'Customer') {
    // If a legacy order has no appointment time, retain the existing full-refund behavior.
    const refundPercent = hoursUntil === null || hoursUntil > 24 ? 100 : hoursUntil >= 4 ? 50 : 0;
    refundAmount = Math.min(escrow, Math.round(price * refundPercent / 100) + (refundPercent === 100 ? Math.max(0, escrow - price) : 0));
    if (refundPercent < 100) providerAmount = Math.max(0, Math.round((price - fee) * (100 - refundPercent) / 100));
  } else if (cancelledBy === 'Provider') {
    refundAmount = escrow;
    const providers = db.getCollection('providers') || [];
    const provider = providers.find(p => p.id === order.providerId);
    if (provider) {
      provider.cancellationCount = (Number(provider.cancellationCount) || 0) + 1;
      provider.rating = Math.max(0, (Number(provider.rating) || 0) - 0.1);
      provider.lastCancellationAt = new Date().toISOString();
      db.saveCollection('providers', providers);
    }
    if (hoursUntil !== null && hoursUntil <= 12) penalty = Math.round(price * 0.2);
  }

  if (refundAmount > 0) refundCustomer(order, refundAmount);
  if (providerAmount > 0) payProvider(order, providerAmount);
  if (penalty > 0) {
    const provider = (db.getCollection('providers') || []).find(p => p.id === order.providerId);
    const users = db.getCollection('users') || [];
    const providerUser = provider && users.find(u => u.id === provider.userId);
    if (providerUser) {
      const balance = Number(providerUser.balance) || 0;
      const deducted = Math.min(Math.max(0, balance), penalty);
      providerUser.balance = balance - deducted;
      providerUser.pendingPenalty = (Number(providerUser.pendingPenalty) || 0) + penalty - deducted;
      db.saveCollection('users', users);
      const transactions = db.getCollection('walletTransactions') || [];
      transactions.unshift({
        id: `TXN_${Date.now()}_F${Math.floor(Math.random() * 1000)}`,
        userId: providerUser.id, type: 'penalty', amount: -deducted,
        status: 'completed', createdAt: formatDateTime(new Date()), orderIds: [order.id],
        description: `Phạt hủy đơn trong vòng 12 giờ: ${order.id}${penalty > deducted ? `; còn phải thu ${penalty - deducted}đ` : ''}`
      });
      db.saveCollection('walletTransactions', transactions);
      order.providerPenalty = { amount: penalty, deducted, outstanding: penalty - deducted, appliedAt: new Date().toISOString() };
      providerUser.warningCount = (Number(providerUser.warningCount) || 0) + 1;
      providerUser.lastWarningAt = new Date().toISOString();
      db.saveCollection('users', users);
    } else {
      order.providerPenalty = { amount: penalty, deducted: 0, outstanding: penalty, appliedAt: new Date().toISOString() };
    }
  }
  order.refundAmount = refundAmount;
  order.providerAmount = providerAmount;
  order.cancellationPolicy = {
    cancelledBy,
    hoursUntilAppointment: hoursUntil,
    refundAmount,
    providerAmount,
    providerPenalty: penalty,
    appliedAt: new Date().toISOString()
  };
  return { refundAmount, providerAmount, penalty, hoursUntil };
}

// ─── HỦY ĐƠN TRỰC TIẾP (internal) ───────────────────────────────────────────
// Dùng cho: đơn chưa thanh toán, Provider từ chối đơn mới, Provider chấp thuận yêu cầu hủy

function _cancelOrderDirect(orders, order, cancelledBy, reason, doRefund) {
  const previousOrderStatus = order.orderStatus;
  const previousPaymentStatus = order.paymentStatus || 'paid';
  const previousEscrowStatus = order.escrowStatus;
  const paymentWasPending = order.paymentStatus === 'pending';

  order.orderStatus = 'cancelled';
  if (paymentWasPending) order.paymentStatus = 'cancelled';
  order.escrowStatus = doRefund ? 'refunded' : 'payment_cancelled';
  order.cancelReason = reason;
  order.cancelledBy = cancelledBy;
  order.cancelledAt = new Date().toISOString();
  delete order.cancellationUndoUntil;
  delete order.previousOrderStatus;
  delete order.previousPaymentStatus;
  delete order.previousEscrowStatus;
  updateOrderMilestone(order, `Đơn hàng bị hủy: ${reason}`);

  const settlement = doRefund ? settleCancellation(order, cancelledBy) : { refundAmount: 0, providerAmount: 0, penalty: 0 };
  const refundedAmount = settlement.refundAmount;
  if (doRefund) {
    const escrowAmount = Math.max(0, Number(order.escrowDeposit) || Number(order.price) || 0);
    order.escrowStatus = refundedAmount >= escrowAmount
      ? 'refunded'
      : refundedAmount > 0 ? 'partial_refunded' : 'completed';
  }
  order.refundAmount = refundedAmount;
  order.refundedAt = refundedAmount > 0 ? formatDateTime(new Date()) : null;

  // Mở lại Job Request nếu là đơn chưa thanh toán
  if (paymentWasPending && order.jobId) {
    const jobs = db.getCollection('jobRequests') || [];
    const job = jobs.find(j => j.id === order.jobId);
    if (job && job.status === 'awaiting_payment') {
      job.status = 'open';
      job.selectedProviderId = null;
      (job.applicants || []).forEach(a => {
        if (a.providerId === order.providerId && a.status === 'accepted') a.status = 'pending';
      });
      db.saveCollection('jobRequests', jobs);
    }
  }

  db.saveCollection('orders', orders);

  // Thông báo theo từng trường hợp
  if (!doRefund) {
    // Hủy đơn chưa thanh toán
    createNotification(order.customerId, 'Đơn chờ thanh toán đã hủy',
      `Đơn hàng ${order.id} đã được hủy. Không có khoản tiền nào bị trừ.`,
      'info', `/customer_orders.html?orderId=${encodeURIComponent(order.id)}`);
  } else if (cancelledBy === 'Provider') {
    // Provider từ chối / đồng ý hủy
    createNotification(order.customerId, 'Đơn hàng đã hủy — Tiền đã hoàn',
      `Provider đã hủy đơn ${order.id}. Toàn bộ tiền ký quỹ ${refundedAmount.toLocaleString('vi-VN')}đ đã được hoàn vào ví của bạn.`,
      'warning', `/customer_orders.html?orderId=${encodeURIComponent(order.id)}`);
    notifyProvider(order.providerId, 'Đã xử lý đơn hàng',
      `Đơn ${order.id} đã kết thúc. Đã hoàn tiền cho khách; mức uy tín giảm 0,1${order.providerPenalty?.amount ? ` và ghi nhận khoản phạt ${Number(order.providerPenalty.amount).toLocaleString('vi-VN')}đ` : ''}.`,
      'info', `/bookings.html?orderId=${encodeURIComponent(order.id)}`);
  } else {
    // Cancellation initiated by customer or approved by provider.
    notifyProvider(order.providerId, 'Khách hàng hủy đơn',
      `Đơn ${order.id} đã hủy theo chính sách. Khoản chi trả cho bạn: ${Number(order.providerAmount || 0).toLocaleString('vi-VN')}đ. Lý do: "${order.cancelReason || 'Không có lý do'}".`,
      'info', `/bookings.html?orderId=${encodeURIComponent(order.id)}`);
    createNotification(order.customerId, 'Đơn hàng đã hủy',
      `Đơn ${order.id} đã hủy. Đã hoàn ${refundedAmount.toLocaleString('vi-VN')}đ vào ví của bạn.`,
      'success', `/customer_orders.html?orderId=${encodeURIComponent(order.id)}`);
  }

  return order;
}

// ─── CHÍNH SÁCH HỦY ĐƠN ─────────────────────────────────────────────────────
//
// Tình huống 1 – Đơn chưa thanh toán (paymentStatus === 'pending'):
//   Khách hủy ngay, không mất tiền. Hệ thống tự hủy sau 24h.
//
// Tình huống 2 – Provider từ chối đơn mới (orderStatus === 'pending', Provider gọi):
//   Hủy + hoàn 100% cho khách.
//
// Tình huống 3 – Đơn đang thực hiện (orderStatus === 'processing'), Khách gửi yêu cầu hủy:
//   Đơn → cancel_requested, Provider xem xét; tiền vẫn giữ trong Escrow.
//   Provider chấp thuận → hủy + hoàn 100% cho khách.
//   Provider từ chối    → đơn → cancel_rejected, chờ Admin phân xử.
//
// Tình huống 4 – Đơn đã bàn giao (orderStatus === 'delivered'):
//   Khách phải gửi khiếu nại (complaint), không dùng endpoint hủy thông thường.
//
// Tình huống 5 – Admin phân xử (cancel_rejected / cancel_requested / disputed):
//   Cho đơn tiếp tục (khôi phục trạng thái cũ) hoặc hủy với tỷ lệ hoàn 0-100%.
//   Phần còn lại trả Provider. Phải ghi căn cứ.

function processCancelOrder(orderId, userId, userRole, reason) {
  const orders = db.getCollection('orders') || [];
  const order = loadOrder(orders, orderId);

  if (userRole === 'Customer' && order.customerId !== userId) {
    throw httpError(403, 'Bạn không có quyền hủy đơn hàng này.');
  }
  if (userRole === 'Provider') assertProviderOwnsOrder(order, userId);
  if (!['Customer', 'Provider'].includes(userRole)) {
    throw httpError(403, 'Chỉ Khách hàng hoặc Provider liên quan mới có thể hủy đơn.');
  }

  if (userRole === 'Customer') {
    reason = typeof reason === 'string' ? reason.trim() : '';
    if (reason.length < 20) throw httpError(400, 'Vui lòng nêu rõ lý do hủy đơn (ít nhất 20 ký tự).');
    if (reason.length > 1000) throw httpError(400, 'Lý do hủy đơn không được vượt quá 1.000 ký tự.');
  }

  if (['completed', 'cancelled'].includes(order.orderStatus)) {
    throw httpError(409, 'Đơn đã hoàn tất hoặc đã hủy nên không thể hủy thêm.');
  }
  assertCancellationWindowOpen(order);

  if (order.paymentStatus === 'pending') {
    if (userRole !== 'Customer') throw httpError(403, 'Đơn chưa thanh toán chỉ do Khách hàng tạo đơn được hủy.');
    return _cancelOrderDirect(orders, order, 'Customer', reason, false);
  }

  // Trong 24 giờ đầu, hủy trực tiếp theo chính sách hoàn tiền hiện hành; không chờ Provider/Admin duyệt.
  return _cancelOrderDirect(orders, order, userRole, reason || 'Hủy đơn trong thời hạn 24 giờ', true);
}

// ─── PROVIDER PHẢN HỒI YÊU CẦU HỦY ─────────────────────────────────────────
// decision: 'approve' | 'reject'
// - approve: hủy đơn + hoàn 100% cho khách (Provider đồng ý)
// - reject : đơn → cancel_rejected, chuyển Admin phân xử

function processRespondCancelRequest(orderId, userId, decision, note) {
  const orders = db.getCollection('orders');
  const order = loadOrder(orders, orderId);
  assertProviderOwnsOrder(order, userId);

  if (order.orderStatus !== 'cancel_requested') {
    throw httpError(409, 'Đơn hàng không có yêu cầu hủy đang chờ phản hồi');
  }

  const now = new Date().toISOString();
  if (!order.cancelRequest) order.cancelRequest = {};

  if (decision === 'approve') {
    // Provider đồng ý → hủy đơn + hoàn 100%
    order.cancelRequest.status = 'approved';
    order.cancelRequest.respondedAt = now;
    order.cancelRequest.providerNote = note || '';
    return _cancelOrderDirect(orders, order, 'Customer', `Provider chấp thuận yêu cầu hủy. ${note || ''}`.trim(), true);
  }

  if (decision === 'reject') {
    // Provider từ chối → chuyển Admin phân xử, tiền vẫn giữ
    order.cancelRequest.status = 'rejected';
    order.cancelRequest.respondedAt = now;
    order.cancelRequest.providerNote = note || '';
    order.orderStatus = 'cancel_rejected';
    order.escrowStatus = 'escrow_held'; // tiền vẫn giữ

    updateOrderMilestone(order,
      `Provider từ chối yêu cầu hủy. Lý do: "${note || 'Không có lý do'}". Đơn chuyển Admin phân xử.`);
    db.saveCollection('orders', orders);

    createNotification(order.customerId, 'Provider từ chối yêu cầu hủy',
      `Provider đã từ chối yêu cầu hủy đơn ${order.id}. Đơn hàng chuyển Admin phân xử. Bạn có thể gửi khiếu nại để cung cấp thêm bằng chứng.`,
      'warning', `/customer_orders.html?orderId=${encodeURIComponent(order.id)}`);
    notifyProvider(order.providerId, 'Đã từ chối yêu cầu hủy',
      `Bạn đã từ chối yêu cầu hủy đơn ${order.id}. Đơn chờ Admin phân xử — tiền vẫn được giữ trong Escrow.`,
      'info', `/bookings.html?orderId=${encodeURIComponent(order.id)}`);
    return order;
  }

  throw httpError(400, 'Quyết định không hợp lệ. Chỉ chấp nhận "approve" hoặc "reject".');
}

// ─── ADMIN PHÂN XỬ ───────────────────────────────────────────────────────────
// action: 'continue' | 'cancel'
// - continue      : khôi phục đơn theo trạng thái trước yêu cầu hủy
// - cancel        : hủy đơn, hoàn refundPercentage% cho khách, phần còn lại trả Provider
// adminNote bắt buộc phải có (căn cứ phán quyết)

function processArbitrateCancel(orderId, action, adminNote, refundPercentage = 100) {
  const orders = db.getCollection('orders');
  const order = loadOrder(orders, orderId);

  const arbitrableStatuses = ['cancel_requested', 'cancel_rejected', 'disputed'];
  if (!arbitrableStatuses.includes(order.orderStatus)) {
    throw httpError(409, `Đơn hàng không ở trạng thái cần phân xử (hiện tại: ${order.orderStatus})`);
  }
  if (!adminNote || !adminNote.trim()) {
    throw httpError(400, 'Phải ghi căn cứ phán quyết (adminNote)');
  }

  const now = formatDateTime(new Date());

  // ── Cho đơn tiếp tục ────────────────────────────────────────────────────────
  if (action === 'continue') {
    const prevStatus = order.cancelRequest?.previousOrderStatus || 'processing';
    order.orderStatus = prevStatus;
    order.escrowStatus = 'escrow_held';
    if (order.cancelRequest) order.cancelRequest.adminDecision = 'continue';
    order.adminArbitration = { action: 'continue', note: adminNote, decidedAt: new Date().toISOString() };

    updateOrderMilestone(order, `Admin phán quyết: Đơn tiếp tục thực hiện. Căn cứ: ${adminNote}`);
    db.saveCollection('orders', orders);

    createNotification(order.customerId, 'Admin phán quyết: Đơn tiếp tục',
      `Admin đã phân xử đơn ${order.id}: Đơn hàng tiếp tục thực hiện theo trạng thái trước. Căn cứ: "${adminNote}"`,
      'info', `/customer_orders.html?orderId=${encodeURIComponent(order.id)}`);
    notifyProvider(order.providerId, 'Admin phán quyết: Đơn tiếp tục',
      `Admin đã phân xử đơn ${order.id}: Đơn hàng tiếp tục thực hiện. Căn cứ: "${adminNote}"`,
      'info', `/bookings.html?orderId=${encodeURIComponent(order.id)}`);
    return order;
  }

  // ── Hủy đơn với tỷ lệ hoàn tiền 0–100% ────────────────────────────────────
  if (action === 'cancel') {
    const pct = Math.max(0, Math.min(100, Number(refundPercentage)));
    const totalDeposit = Number(order.escrowDeposit) || Number(order.price) || 0;
    const priceNum = Number(order.price) || 0;

    // Tính hoàn khách: pct% trên tổng tiền ký quỹ (bao gồm phí sàn đã thu)
    const refundAmt = Math.round(totalDeposit * (pct / 100));
    // Trả Provider: (100-pct)% trên giá gốc (sàn giữ phí)
    const providerAmt = Math.round(priceNum * ((100 - pct) / 100));

    order.orderStatus = 'cancelled';
    order.escrowStatus = pct === 100 ? 'refunded' : (pct === 0 ? 'completed' : 'partial_refunded');
    order.cancelledBy = 'Admin';
    order.cancelledAt = new Date().toISOString();
    if (order.cancelRequest) order.cancelRequest.adminDecision = 'cancel';
    order.adminArbitration = {
      action: 'cancel',
      note: adminNote,
      refundPercentage: pct,
      refundAmount: refundAmt,
      providerAmount: providerAmt,
      decidedAt: new Date().toISOString()
    };

    updateOrderMilestone(order,
      `Admin phán quyết: Hủy đơn. Hoàn ${pct}% (${refundAmt.toLocaleString('vi-VN')}đ) cho khách, trả ${100-pct}% (${providerAmt.toLocaleString('vi-VN')}đ) cho Provider. Căn cứ: ${adminNote}`);

    if (refundAmt > 0) refundCustomer(order, refundAmt);
    if (providerAmt > 0) payProvider(order, providerAmt);

    db.saveCollection('orders', orders);

    createNotification(order.customerId, 'Admin phán quyết: Đơn đã hủy',
      `Admin đã phân xử đơn ${order.id}: Hủy đơn, hoàn ${pct}% — ${refundAmt.toLocaleString('vi-VN')}đ đã vào ví bạn. Căn cứ: "${adminNote}"`,
      pct > 0 ? 'warning' : 'error',
      `/customer_orders.html?orderId=${encodeURIComponent(order.id)}`);
    notifyProvider(order.providerId, 'Admin phán quyết: Đơn đã hủy',
      `Admin đã phân xử đơn ${order.id}: Hủy đơn, bạn nhận ${100-pct}% — ${providerAmt.toLocaleString('vi-VN')}đ đã vào ví. Căn cứ: "${adminNote}"`,
      providerAmt > 0 ? 'warning' : 'error',
      `/bookings.html?orderId=${encodeURIComponent(order.id)}`);
    return order;
  }

  throw httpError(400, 'Hành động không hợp lệ. Chỉ chấp nhận "continue" hoặc "cancel".');
}

// ─── UNDO CANCEL ─────────────────────────────────────────────────────────────

function processUndoCancelOrder(orderId, customerId) {
  const orders = db.getCollection('orders') || [];
  const order = loadOrder(orders, orderId);
  if (order.customerId !== customerId) throw httpError(403, 'Bạn không có quyền hoàn tác đơn hàng này.');
  if (order.orderStatus !== 'cancelled' || order.cancelledBy !== 'Customer') {
    throw httpError(409, 'Chỉ có thể hoàn tác đơn do chính bạn hủy trực tiếp (không áp dụng cho đơn qua Admin phán quyết).');
  }
  if ((Number(order.providerAmount) || 0) > 0 || (Number(order.providerPenalty?.amount) || 0) > 0) {
    throw httpError(409, 'Đơn đã được quyết toán theo chính sách hủy nên không thể hoàn tác tự động. Vui lòng liên hệ Admin để đối soát.');
  }
  const undoUntil = Date.parse(order.cancellationUndoUntil || '');
  if (!Number.isFinite(undoUntil) || Date.now() > undoUntil) {
    throw httpError(409, 'Đã hết thời gian 5 phút để hoàn tác hủy đơn.');
  }

  if (order.scheduledDate && order.scheduledTime) {
    const [year, month, day] = String(order.scheduledDate).split('-').map(Number);
    const appointmentDate = new Date(year, month - 1, day, 12);
    const provider = (db.getCollection('providers') || []).find(item => item.id === order.providerId);
    if (!provider || !slotsForDate(provider, appointmentDate, orders).includes(order.scheduledTime)) {
      throw httpError(409, 'Khung giờ đã được người khác đặt; không thể khôi phục đơn.');
    }
  }

  const users = db.getCollection('users') || [];
  const customer = users.find(user => user.id === customerId || user.uid === customerId);
  if (!customer) throw httpError(404, 'Không tìm thấy tài khoản khách hàng.');
  const refundAmount = Number(order.refundAmount) || 0;
  if (refundAmount > 0) {
    const balance = Number(customer.balance) || 0;
    if (balance < refundAmount) throw httpError(400, 'Số dư ví không đủ để hoàn tác khoản tiền đã được hoàn trước đó.');
    customer.balance = balance - refundAmount;
    const transactions = db.getCollection('walletTransactions') || [];
    transactions.unshift({
      id: `TXN_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      userId: customer.id, type: 'refund_reversal', amount: -refundAmount,
      status: 'completed', createdAt: formatDateTime(new Date()),
      description: `Thu hồi khoản hoàn tiền khi khôi phục đơn ${order.id}`
    });
    db.saveCollection('walletTransactions', transactions);
    db.saveCollection('users', users);
  }

  order.orderStatus = order.previousOrderStatus || 'pending';
  order.paymentStatus = order.previousPaymentStatus || 'paid';
  order.escrowStatus = order.previousEscrowStatus || 'escrow_held';
  if (order.paymentStatus === 'pending') {
    order.paymentExpiresAt = new Date(Date.now() + (Number(process.env.ORDER_PAYMENT_WINDOW_MINUTES) || 30) * 60 * 1000).toISOString();
  }
  order.lastCancellationUndoneAt = new Date().toISOString();
  order.refundAmount = 0;
  order.refundedAt = null;
  delete order.cancelReason;
  delete order.cancelledBy;
  delete order.cancelledAt;
  delete order.cancellationUndoUntil;
  delete order.previousOrderStatus;
  delete order.previousPaymentStatus;
  delete order.previousEscrowStatus;
  updateOrderMilestone(order, 'Khách hàng đã hoàn tác việc hủy đơn.');
  db.saveCollection('orders', orders);

  createNotification(customerId, 'Đã khôi phục đơn hàng',
    `Đơn ${order.id} đã được khôi phục${refundAmount ? ` và ${refundAmount.toLocaleString('vi-VN')}đ được thu lại từ ví` : ''}.`,
    'success', `/customer_orders.html?orderId=${encodeURIComponent(order.id)}`);
  notifyProvider(order.providerId, 'Đơn hàng được khôi phục',
    `Khách hàng đã hoàn tác việc hủy đơn ${order.id}.`, 'info',
    `/bookings.html?orderId=${encodeURIComponent(order.id)}`);
  return order;
}

// ─── GIẢI NGÂN ESCROW ────────────────────────────────────────────────────────

function processReleaseEscrow(orderId, { customerId = null, force = false } = {}) {
  const orders = db.getCollection('orders');
  const order = loadOrder(orders, orderId);

  if (!force && order.customerId !== customerId) {
    throw httpError(403, 'Bạn không có quyền thao tác đơn hàng này.');
  }
  if (order.escrowStatus === 'completed' || order.orderStatus === 'completed') {
    throw httpError(409, 'Đơn hàng này đã được giải ngân Escrow trước đó!');
  }
  const releasableEscrow = force ? ['escrow_held', 'disputed'] : ['escrow_held'];
  const releasableStatus = force ? ['processing', 'delivered', 'disputed'] : ['processing', 'delivered'];
  if (!releasableEscrow.includes(order.escrowStatus) || !releasableStatus.includes(order.orderStatus)) {
    throw httpError(409, 'Đơn hàng ở trạng thái hiện tại không thể giải ngân.');
  }

  const providers = db.getCollection('providers');
  const provider = providers.find(p => p.id === order.providerId || p.userId === order.providerId);
  const users = db.getCollection('users');
  const providerUser = provider ? users.find(u => u.id === provider.userId) : users.find(u => u.id === order.providerId);
  if (!providerUser) throw httpError(409, 'Không tìm thấy tài khoản nhận tiền của Provider; chưa thể giải ngân đơn hàng.');

  order.escrowStatus = 'completed';
  order.orderStatus = 'completed';
  const timeStr = formatDateTime(new Date());
  if (order.milestones) {
    order.milestones.forEach(m => { m.done = true; });
    if (order.milestones[3]) order.milestones[3].time = timeStr;
  }

  if (providerUser) {
    const earningAmount = Math.max(0, Math.round(Number(order.price) || 0));
    const transactions = db.getCollection('walletTransactions') || [];
    const existingEarning = transactions.find(t => t.userId === providerUser.id && t.type === 'disbursement' && t.orderId === order.id);
    if (!existingEarning && earningAmount > 0) {
      providerUser.balance = (Number(providerUser.balance) || 0) + earningAmount;
      order.providerCreditAmount = earningAmount;
      order.providerCreditedAt = timeStr;
      db.saveCollection('users', users);
      transactions.unshift({
        id: `TXN_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        userId: providerUser.id,
        providerId: provider?.id || order.providerId,
        orderId: order.id,
        type: 'disbursement',
        amount: earningAmount,
        balanceAfter: providerUser.balance,
        status: 'completed',
        createdAt: timeStr,
        description: `Thu nhập từ đơn hàng hoàn tất ${order.id}`
      });
      db.saveCollection('walletTransactions', transactions);
    }
  }

  if (provider) {
    provider.completedOrders = Number(provider.completedOrders || 0) + 1;
    db.saveCollection('providers', providers);
  }
  const services = db.getCollection('services');
  const service = services.find(s => s.id === order.serviceId);
  if (service) {
    service.sold = Number(service.sold || 0) + 1;
    db.saveCollection('services', services);
  }
  db.saveCollection('orders', orders);

  notifyProvider(order.providerId, 'Đơn hàng đã được nghiệm thu',
    `Đơn hàng ${order.id} đã hoàn tất. Số tiền ${order.priceFormatted || order.price} đã được cộng vào ví của bạn.`, 'success');
  createNotification(order.customerId, force ? 'Đã phân xử đơn hàng' : 'Đơn hàng đã hoàn tất',
    force
      ? `Admin đã phân xử đơn ${order.id} và giải ngân khoản ký quỹ cho Provider. Đơn hàng đã kết thúc.`
      : `Bạn đã nghiệm thu đơn ${order.id}. Ký quỹ đã được giải ngân cho Provider.`,
    'success', `/customer_orders.html?orderId=${encodeURIComponent(order.id)}`);
  return order;
}

// Admin hoàn tiền cưỡng chế (tranh chấp)
function processForceRefund(orderId) {
  const orders = db.getCollection('orders');
  const order = loadOrder(orders, orderId);

  if (order.paymentStatus === 'pending') {
    throw httpError(409, 'Đơn chưa được thanh toán nên không có tiền ký quỹ để hoàn lại.');
  }
  if (['completed', 'cancelled'].includes(order.orderStatus) || ['refunded', 'completed'].includes(order.escrowStatus)) {
    throw httpError(409, 'Đơn hàng đã kết thúc hoặc đã hoàn tiền, không thể hoàn tiền thêm.');
  }

  order.escrowStatus = 'refunded';
  order.orderStatus = 'cancelled';
  order.cancelledBy = 'Admin';
  updateOrderMilestone(order, 'Admin hoàn 100% tiền ký quỹ cho khách hàng');
  refundCustomer(order);
  db.saveCollection('orders', orders);

  createNotification(order.customerId, 'Đã hoàn tiền',
    `Admin đã hoàn 100% tiền ký quỹ của đơn hàng ${order.id} vào ví của bạn.`, 'success',
    `/customer_orders.html?orderId=${encodeURIComponent(order.id)}`);
  notifyProvider(order.providerId, 'Đơn hàng bị hoàn tiền',
    `Đơn hàng ${order.id} đã được Admin hoàn tiền cho khách hàng.`, 'warning');
  return order;
}

// ─── AUTO RELEASE ─────────────────────────────────────────────────────────────

function checkAutoReleaseOrders() {
  const orders = db.getCollection('orders') || [];
  const now = Date.now();
  for (const o of orders) {
    if (o.orderStatus === 'delivered' && o.escrowStatus === 'escrow_held' && o.autoReleaseAt) {
      if (now >= Date.parse(o.autoReleaseAt)) {
        try {
          processReleaseEscrow(o.id, { force: true });
        } catch (e) {
          console.warn('[Escrow] Auto release error for order', o.id, e.message);
        }
      }
    }
  }
}

module.exports = {
  httpError,
  findProviderByUserId,
  getCancellationDeadlineAt,
  processAcceptOrder,
  processDeliverOrder,
  processProgressOrder,
  processCancelOrder,
  processReleaseEscrow,
  checkAutoReleaseOrders
};

