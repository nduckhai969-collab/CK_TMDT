const db = require('../data/db');
const { createNotification, notifyProvider } = require('./notificationService');
const { formatDateTime } = require('../utils/dates');

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

function processAcceptOrder(orderId, userId) {
  const orders = db.getCollection('orders');
  const order = loadOrder(orders, orderId);
  assertProviderOwnsOrder(order, userId);
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
  if (customer && amount > 0) {
    customer.balance = (customer.balance || 0) + amount;
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
  }
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
      `Đơn hàng ${order.id} bị khiếu nại bởi khách hàng.`, 'warning');
    return order;
  }

  // Hủy bình thường (pending/processing) -> hoàn toàn bộ tiền ký quỹ cho khách
  order.orderStatus = 'cancelled';
  order.escrowStatus = 'refunded';
  order.cancelReason = reason || 'Hủy đơn hàng';
  order.cancelledBy = userRole;
  updateOrderMilestone(order, `Đơn hàng bị hủy: ${order.cancelReason}`);

  refundCustomer(order);
  db.saveCollection('orders', orders);

  const cancellerName = userRole === 'Customer' ? 'Khách hàng' : (userRole === 'Admin' ? 'Quản trị viên' : 'Chuyên gia');
  if (userRole !== 'Customer') {
    createNotification(order.customerId, 'Đơn hàng bị hủy',
      `${cancellerName} đã hủy đơn hàng ${order.id}. Số tiền đã được hoàn vào ví của bạn.`, 'error');
  } else {
    notifyProvider(order.providerId, 'Đơn hàng bị hủy', `${cancellerName} đã hủy đơn hàng ${order.id}.`, 'error');
    createNotification(order.customerId, 'Đã hoàn tiền',
      `Đơn hàng ${order.id} đã hủy, tiền ký quỹ đã được hoàn vào ví của bạn.`, 'success');
  }
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
  processReleaseEscrow,
  processForceRefund
};
