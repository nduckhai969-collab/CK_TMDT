const db = require('../data/db');
const { createNotification, notifyProvider } = require('./notificationService');
const { formatDateTime } = require('../utils/dates');
const { slotsForDate } = require('../routes/providerAvailability');

const CANCELLATION_UNDO_WINDOW_MS = 5 * 60 * 1000;

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

// Đơn hàng lưu providerId (PRVxxx) còn người đăng nhập có id tài khoản (USRxxx):
// phải đổi qua providers.userId rồi mới so sánh quyền sở hữu.
function findProviderByUserId(userId) {
  return (db.getCollection('providers') || []).find(p => p.userId === userId) || null;
}

function loadOrder(orders, orderId) {
  const order = orders.find(o => o.id === orderId);
  if (!order) throw httpError(404, 'Không tìm thấy đơn hàng');
  return order;
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
    `Chuyên gia đã tiếp nhận đơn hàng ${order.id} và bắt đầu thực hiện.`, 'info');
  return order;
}

function processDeliverOrder(orderId, userId) {
  const orders = db.getCollection('orders');
  const order = loadOrder(orders, orderId);
  assertProviderOwnsOrder(order, userId);
  assertOrderPaid(order);
  if (order.orderStatus !== 'processing') throw httpError(409, 'Đơn hàng chưa được xử lý hoặc đã giao');

  order.orderStatus = 'delivered';
  updateOrderMilestone(order, 'Bàn giao sản phẩm / hoàn thành dịch vụ');
  db.saveCollection('orders', orders);

  createNotification(order.customerId, 'Đơn hàng đã bàn giao',
    `Chuyên gia đã bàn giao đơn hàng ${order.id}. Vui lòng nghiệm thu.`, 'success');
  return order;
}

function processProgressOrder(orderId, userId, note) {
  const orders = db.getCollection('orders');
  const order = loadOrder(orders, orderId);
  assertProviderOwnsOrder(order, userId);
  assertOrderPaid(order);
  if (order.orderStatus !== 'processing') throw httpError(409, 'Chỉ có thể cập nhật tiến độ khi đơn đang xử lý');

  updateOrderMilestone(order, `Cập nhật tiến độ: ${note}`);
  db.saveCollection('orders', orders);

  createNotification(order.customerId, 'Tiến độ đơn hàng',
    `Đơn hàng ${order.id} được cập nhật tiến độ: ${note}`, 'info');
  return order;
}

function refundCustomer(order) {
  const users = db.getCollection('users');
  const customer = users.find(u => u.id === order.customerId);
  const amount = Number(order.escrowDeposit) || Number(order.price) || 0;
  if (customer && Number.isFinite(amount) && amount > 0) {
    customer.balance = (Number(customer.balance) || 0) + amount;
    db.saveCollection('users', users);

    const transactions = db.getCollection('walletTransactions') || [];
    transactions.unshift({
      id: `TXN_${Date.now()}_${Math.floor(Math.random()*1000)}`,
      userId: customer.id,
      type: 'refund',
      amount: amount,
      status: 'completed',
      createdAt: formatDateTime(new Date()),
      description: `Hoàn tiền ký quỹ từ đơn hàng ${order.id}`
    });
    db.saveCollection('walletTransactions', transactions);
    return amount;
  }
  return 0;
}

function processCancelOrder(orderId, userId, userRole, reason) {
  const orders = db.getCollection('orders');
  const order = loadOrder(orders, orderId);

  // Kiểm tra quyền
  if (userRole === 'Customer' && order.customerId !== userId) {
    throw httpError(403, 'Bạn không có quyền hủy đơn hàng này');
  }
  if (userRole === 'Provider') assertProviderOwnsOrder(order, userId);

  // Kiểm tra trạng thái
  if (['completed', 'cancelled', 'disputed'].includes(order.orderStatus)) {
    throw httpError(409, 'Không thể hủy đơn hàng ở trạng thái hiện tại');
  }

  // Đã bàn giao mà khách bấm hủy -> chuyển thành khiếu nại, Admin xử lý, tiền vẫn bị khóa
  if (order.orderStatus === 'delivered' && userRole === 'Customer') {
    order.orderStatus = 'disputed';
    order.escrowStatus = 'disputed';
    order.disputeReason = reason || 'Khách hàng khiếu nại chất lượng';
    updateOrderMilestone(order, 'Đơn hàng bị khiếu nại. Chờ Admin xử lý.');
    db.saveCollection('orders', orders);

    notifyProvider(order.providerId, 'Đơn hàng bị khiếu nại',
      `Đơn hàng ${order.id} bị khiếu nại bởi khách hàng.`, 'warning', `/bookings.html?orderId=${encodeURIComponent(order.id)}`);
    createNotification(order.customerId, 'Đang xử lý tranh chấp', `Đơn ${order.id} đã chuyển sang tranh chấp. Khoản ký quỹ được giữ nguyên trong khi Admin xem xét.`, 'warning', `/customer_orders.html?orderId=${encodeURIComponent(order.id)}`);
    return order;
  }

  // Đơn chưa được thanh toán không có tiền ký quỹ để hoàn lại.
  const previousOrderStatus = order.orderStatus;
  const previousPaymentStatus = order.paymentStatus || 'paid';
  const paymentPending = order.paymentStatus === 'pending';
  const previousEscrowStatus = order.escrowStatus || (paymentPending ? 'payment_pending' : 'escrow_held');
  order.orderStatus = 'cancelled';
  if (paymentPending) order.paymentStatus = 'cancelled';
  order.escrowStatus = paymentPending ? 'payment_cancelled' : 'refunded';
  order.cancelReason = reason || 'Hủy đơn hàng';
  order.cancelledBy = userRole;
  order.cancelledAt = new Date().toISOString();
  order.cancellationUndoUntil = new Date(Date.now() + CANCELLATION_UNDO_WINDOW_MS).toISOString();
  order.previousOrderStatus = previousOrderStatus;
  order.previousPaymentStatus = previousPaymentStatus;
  order.previousEscrowStatus = previousEscrowStatus;
  updateOrderMilestone(order, `Đơn hàng bị hủy: ${order.cancelReason}`);

  const refundedAmount = paymentPending ? 0 : refundCustomer(order);
  order.refundAmount = refundedAmount;
  order.refundedAt = refundedAmount > 0 ? formatDateTime(new Date()) : null;
  db.saveCollection('orders', orders);

  const cancellerName = userRole === 'Customer' ? 'Khách hàng' : (userRole === 'Admin' ? 'Quản trị viên' : 'Chuyên gia');
  if (paymentPending) {
    createNotification(order.customerId, 'Đơn chờ thanh toán đã hủy', `Đơn hàng ${order.id} đã được hủy. Không có khoản tiền nào bị trừ.`, 'info', `/customer_orders.html?orderId=${encodeURIComponent(order.id)}`);
  } else if (userRole !== 'Customer') {
    createNotification(order.customerId, 'Đơn hàng bị hủy',
      `${cancellerName} đã hủy đơn hàng ${order.id}. Số tiền đã được hoàn vào ví của bạn.`, 'error', `/customer_orders.html?orderId=${encodeURIComponent(order.id)}`);
  } else {
    notifyProvider(order.providerId, 'Đơn hàng bị hủy', `${cancellerName} đã hủy đơn hàng ${order.id}.`, 'error', `/bookings.html?orderId=${encodeURIComponent(order.id)}`);
    createNotification(order.customerId, 'Đã hoàn tiền',
      `Đơn hàng ${order.id} đã hủy, tiền ký quỹ đã được hoàn vào ví của bạn.`, 'success', `/customer_orders.html?orderId=${encodeURIComponent(order.id)}`);
  }
  return order;
}

function processUndoCancelOrder(orderId, customerId) {
  const orders = db.getCollection('orders') || [];
  const order = loadOrder(orders, orderId);
  if (order.customerId !== customerId) throw httpError(403, 'Bạn không có quyền hoàn tác đơn hàng này.');
  if (order.orderStatus !== 'cancelled' || order.cancelledBy !== 'Customer') {
    throw httpError(409, 'Chỉ có thể hoàn tác đơn do chính bạn hủy.');
  }
  const undoUntil = Date.parse(order.cancellationUndoUntil || '');
  if (!Number.isFinite(undoUntil) || Date.now() > undoUntil) {
    throw httpError(409, 'Đã hết thời gian 5 phút để hoàn tác hủy đơn.');
  }

  if (order.scheduledDate && order.scheduledTime) {
    const [year, month, day] = String(order.scheduledDate).split('-').map(Number);
    const appointmentDate = new Date(year, month - 1, day, 12);
    const provider = (db.getCollection('providers') || []).find(item => item.id === order.providerId);
    if (!provider || appointmentDate.getFullYear() !== year || appointmentDate.getMonth() !== month - 1 || appointmentDate.getDate() !== day ||
        !slotsForDate(provider, appointmentDate, orders).includes(order.scheduledTime)) {
      throw httpError(409, 'Khung giờ đã được người khác đặt hoặc không còn khả dụng; không thể khôi phục đơn.');
    }
  }

  const users = db.getCollection('users') || [];
  const customer = users.find(user => user.id === customerId);
  if (!customer) throw httpError(404, 'Không tìm thấy tài khoản khách hàng.');
  const refundAmount = Number(order.refundAmount) || 0;
  if (refundAmount > 0) {
    const balance = Number(customer.balance) || 0;
    if (balance < refundAmount) throw httpError(400, 'Số dư ví hiện không đủ để hoàn tác khoản tiền đã được hoàn trước đó.');
    customer.balance = balance - refundAmount;
    const transactions = db.getCollection('walletTransactions') || [];
    transactions.unshift({
      id: `TXN_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      userId: customerId,
      type: 'refund_reversal',
      amount: -refundAmount,
      status: 'completed',
      createdAt: formatDateTime(new Date()),
      description: `Thu hồi khoản hoàn tiền khi khôi phục đơn ${order.id}`
    });
    db.saveCollection('walletTransactions', transactions);
    db.saveCollection('users', users);
  }

  order.orderStatus = order.previousOrderStatus || 'pending';
  order.paymentStatus = order.previousPaymentStatus || 'paid';
  order.escrowStatus = order.previousEscrowStatus || 'escrow_held';
  if (order.paymentStatus === 'pending') {
    // Đơn chờ thanh toán được khôi phục: cho thêm thời gian để thanh toán (nếu không sẽ bị tự hủy lại ngay)
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

  createNotification(customerId, 'Đã khôi phục đơn hàng', `Đơn ${order.id} đã được khôi phục${refundAmount ? ` và ${refundAmount.toLocaleString('vi-VN')}đ được thu lại từ ví` : ''}.`, 'success', `/customer_orders.html?orderId=${encodeURIComponent(order.id)}`);
  notifyProvider(order.providerId, 'Đơn hàng được khôi phục', `Khách hàng đã hoàn tác việc hủy đơn ${order.id}.`, 'info', `/bookings.html?orderId=${encodeURIComponent(order.id)}`);
  return order;
}

// Giải ngân Escrow cho người bán.
//  - Khách nghiệm thu: chỉ khi tiền đang giữ (escrow_held) và đơn đang thực hiện/đã bàn giao.
//  - Admin (force): thêm cả đơn đang tranh chấp.
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
    throw httpError(409, 'Đơn hàng ở trạng thái hiện tại không thể giải ngân (đã hủy, hoàn tiền hoặc chưa được tiếp nhận).');
  }

  const providers = db.getCollection('providers');
  const provider = providers.find(p => p.id === order.providerId);
  const users = db.getCollection('users');
  const providerUser = provider ? users.find(u => u.id === provider.userId) : null;

  order.escrowStatus = 'completed';
  order.orderStatus = 'completed';
  const timeStr = formatDateTime(new Date());
  if (order.milestones) {
    order.milestones.forEach(m => { m.done = true; });
    if (order.milestones[3]) order.milestones[3].time = timeStr;
  }

  // Cộng tiền cho người bán (sàn giữ lại phí 5%)
  if (providerUser) {
    providerUser.balance = (providerUser.balance || 0) + Number(order.price || 0);
    db.saveCollection('users', users);

    const transactions = db.getCollection('walletTransactions') || [];
    transactions.unshift({
      id: `TXN_${Date.now()}_${Math.floor(Math.random()*1000)}`,
      userId: providerUser.id,
      type: 'disbursement',
      amount: Number(order.price || 0),
      status: 'completed',
      createdAt: timeStr,
      description: `Giải ngân từ đơn hàng ${order.id}`
    });
    db.saveCollection('walletTransactions', transactions);
  }

  // Số liệu "đã thuê / đã bán" dùng cho sắp xếp và top provider
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
  return order;
}

// Admin hoàn tiền cưỡng chế (tranh chấp) - cũng có kiểm tra để không hoàn tiền / trả tiền hai lần.
function processForceRefund(orderId) {
  const orders = db.getCollection('orders');
  const order = loadOrder(orders, orderId);

  if (order.paymentStatus === 'pending') {
    throw httpError(409, 'Đơn chưa được thanh toán nên không có tiền ký quỹ để hoàn lại.');
  }

  if (['completed', 'cancelled'].includes(order.orderStatus) || order.escrowStatus === 'refunded' || order.escrowStatus === 'completed') {
    throw httpError(409, 'Đơn hàng đã kết thúc hoặc đã hoàn tiền, không thể hoàn tiền thêm.');
  }

  order.escrowStatus = 'refunded';
  order.orderStatus = 'cancelled';
  order.cancelledBy = 'Admin';
  updateOrderMilestone(order, 'Admin hoàn tiền ký quỹ cho khách hàng');
  refundCustomer(order);
  db.saveCollection('orders', orders);

  createNotification(order.customerId, 'Đã hoàn tiền',
    `Admin đã hoàn 100% tiền ký quỹ của đơn hàng ${order.id} vào ví của bạn.`, 'success');
  notifyProvider(order.providerId, 'Đơn hàng bị hoàn tiền', `Đơn hàng ${order.id} đã được Admin hoàn tiền cho khách hàng.`, 'warning');
  return order;
}

module.exports = {
  httpError,
  findProviderByUserId,
  processAcceptOrder,
  processDeliverOrder,
  processProgressOrder,
  processCancelOrder,
  processUndoCancelOrder,
  processReleaseEscrow,
  processForceRefund
};
