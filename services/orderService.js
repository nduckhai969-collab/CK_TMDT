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
  return (db.getCollection('providers') || []).find(p => p.userId === userId || p.id === userId) || null;
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
  if (order.cancellationRequest?.status === 'pending') throw httpError(409, 'Đơn đang chờ duyệt yêu cầu hủy; chưa thể tiếp nhận.');
  if (order.orderStatus !== 'pending') throw httpError(409, 'Đơn hàng không ở trạng thái chờ tiếp nhận');

  order.orderStatus = 'processing';
  updateOrderMilestone(order, 'Provider tiếp nhận yêu cầu & triển khai công việc');
  db.saveCollection('orders', orders);

  createNotification(order.customerId, 'Đơn hàng được tiếp nhận',
    `Chuyên gia đã tiếp nhận đơn hàng ${order.id} và bắt đầu thực hiện.`, 'info', `/customer_orders.html?orderId=${encodeURIComponent(order.id)}`);
  return order;
}

function processDeliverOrder(orderId, userId, handoverData = {}) {
  const orders = db.getCollection('orders');
  const order = loadOrder(orders, orderId);
  assertProviderOwnsOrder(order, userId);
  assertOrderPaid(order);
  if (order.cancellationRequest?.status === 'pending') throw httpError(409, 'Đơn đang chờ duyệt yêu cầu hủy; chưa thể bàn giao.');
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
    `Chuyên gia đã bàn giao đơn hàng ${order.id}. Vui lòng kiểm tra và nghiệm thu (Hệ thống sẽ tự động giải ngân sau 48h nếu không có khiếu nại).`, 'success', `/customer_orders.html?orderId=${encodeURIComponent(order.id)}`);
  return order;
}

function processProgressOrder(orderId, userId, payload) {
  const orders = db.getCollection('orders');
  const order = loadOrder(orders, orderId);
  assertProviderOwnsOrder(order, userId);
  assertOrderPaid(order);
  if (order.cancellationRequest?.status === 'pending') throw httpError(409, 'Đơn đang chờ duyệt yêu cầu hủy; chưa thể cập nhật tiến độ.');
  if (order.orderStatus !== 'processing') throw httpError(409, 'Chỉ có thể cập nhật tiến độ khi đơn đang xử lý');

  let note = '';
  if (typeof payload === 'string') {
    note = payload;
  } else if (typeof payload === 'object' && payload !== null) {
    note = payload.notes || payload.note || '';
    if (payload.progressPercent !== undefined) {
      order.progressPercent = Number(payload.progressPercent);
    }
    if (Array.isArray(payload.completedTasks)) {
      order.completedTasks = payload.completedTasks;
    }
  }

  if (note) {
    updateOrderMilestone(order, `Cập nhật tiến độ: ${note}`);
  }
  db.saveCollection('orders', orders);

  createNotification(order.customerId, 'Tiến độ đơn hàng',
    `Đơn hàng ${order.id} được cập nhật tiến độ${note ? `: ${note}` : ''}.`, 'info', `/customer_orders.html?orderId=${encodeURIComponent(order.id)}`);
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
  const cancellationReason = typeof reason === 'string' ? reason.trim() : '';

  // User-initiated cancellations and delivery disputes must include an auditable reason.
  if (['Customer', 'Provider'].includes(userRole) && !cancellationReason) {
    throw httpError(400, 'Vui lòng nhập lý do hủy đơn.');
  }
  if (cancellationReason.length > 500) {
    throw httpError(400, 'Lý do hủy đơn không được vượt quá 500 ký tự.');
  }

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
    order.disputeReason = cancellationReason;
    updateOrderMilestone(order, 'Đơn hàng bị khiếu nại. Chờ Admin xử lý.');
    db.saveCollection('orders', orders);

    notifyProvider(order.providerId, 'Đơn hàng bị khiếu nại',
      `Đơn hàng ${order.id} bị khiếu nại bởi khách hàng.`, 'warning', `/bookings.html?orderId=${encodeURIComponent(order.id)}`);
    createNotification(order.customerId, 'Đang xử lý tranh chấp', `Đơn ${order.id} đã chuyển sang tranh chấp. Khoản ký quỹ được giữ nguyên trong khi Admin xem xét.`, 'warning', `/customer_orders.html?orderId=${encodeURIComponent(order.id)}`);
    return order;
  }

  // Chưa thanh toán: hủy trực tiếp vì chưa có escrow và chưa thể bắt đầu công việc.
  if (order.paymentStatus === 'pending') {
    const previousOrderStatus = order.orderStatus;
    order.orderStatus = 'cancelled';
    order.paymentStatus = 'cancelled';
    order.escrowStatus = 'payment_cancelled';
    order.cancelReason = cancellationReason;
    order.cancelledBy = userRole;
    order.cancelledAt = new Date().toISOString();
    order.previousOrderStatus = previousOrderStatus;
    updateOrderMilestone(order, `Đơn chờ thanh toán bị hủy: ${cancellationReason}`);
    if (order.jobId) {
      const jobs = db.getCollection('jobRequests') || [];
      const job = jobs.find(j => j.id === order.jobId);
      if (job && job.status === 'awaiting_payment') {
        job.status = 'open';
        job.selectedProviderId = null;
        (job.applicants || []).forEach(a => { if (a.providerId === order.providerId && a.status === 'accepted') a.status = 'pending'; });
        db.saveCollection('jobRequests', jobs);
      }
    }
    db.saveCollection('orders', orders);
    createNotification(order.customerId, 'Đơn chờ thanh toán đã hủy', `Đơn hàng ${order.id} đã được hủy. Không có khoản tiền nào bị trừ.`, 'info', `/customer_orders.html?orderId=${encodeURIComponent(order.id)}`);
    return order;
  }

  // Với đơn đã ký quỹ, yêu cầu hủy phải được bên còn lại chấp thuận trước khi hoàn tiền.
  // Provider vẫn có thể từ chối đơn mới ở trạng thái pending trước khi bắt đầu công việc.
  if (['Customer', 'Provider'].includes(userRole) && !(userRole === 'Provider' && order.orderStatus === 'pending')) {
    if (order.cancellationRequest?.status === 'pending') throw httpError(409, 'Đơn hàng đã có yêu cầu hủy đang chờ phản hồi.');
    const requester = userRole === 'Customer' ? 'Customer' : 'Provider';
    order.cancellationRequest = {
      status: 'pending', requester, reason: cancellationReason,
      requestedAt: new Date().toISOString()
    };
    updateOrderMilestone(order, `${requester === 'Customer' ? 'Khách hàng' : 'Provider'} gửi yêu cầu hủy: ${cancellationReason}`);
    db.saveCollection('orders', orders);
    if (requester === 'Customer') {
      notifyProvider(order.providerId, 'Khách yêu cầu hủy đơn', `Khách hàng yêu cầu hủy đơn ${order.id}: ${cancellationReason}. Vui lòng chấp thuận hoặc từ chối.`, 'warning', `/bookings.html?orderId=${encodeURIComponent(order.id)}`);
    } else {
      createNotification(order.customerId, 'Provider yêu cầu hủy đơn', `Provider yêu cầu hủy đơn ${order.id}: ${cancellationReason}. Vui lòng chấp thuận hoặc từ chối.`, 'warning', `/customer_orders.html?orderId=${encodeURIComponent(order.id)}`);
    }
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
  order.cancelReason = cancellationReason || (userRole === 'Admin' ? 'Quản trị viên hủy đơn hàng' : 'Hủy đơn hàng');
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
  if (paymentPending && order.jobId) {
    const jobs = db.getCollection('jobRequests') || [];
    const job = jobs.find(j => j.id === order.jobId);
    if (job && job.status === 'awaiting_payment') {
      job.status = 'open';
      job.selectedProviderId = null;
      (job.applicants || []).forEach(a => {
        if (a.providerId === order.providerId && a.status === 'accepted') {
          a.status = 'pending';
        }
      });
      db.saveCollection('jobRequests', jobs);
    }
  }
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

function processRespondCancellation(orderId, userId, userRole, approve, responseReason = '') {
  const orders = db.getCollection('orders') || [];
  const order = loadOrder(orders, orderId);
  const request = order.cancellationRequest;
  if (!request || request.status !== 'pending') throw httpError(409, 'Không có yêu cầu hủy nào đang chờ xử lý.');
  if (['completed', 'cancelled', 'disputed'].includes(order.orderStatus)) throw httpError(409, 'Đơn đã kết thúc hoặc chuyển sang tranh chấp; không thể xử lý yêu cầu hủy này.');
  if (userRole === 'Customer' && order.customerId !== userId) throw httpError(403, 'Bạn không có quyền xử lý yêu cầu này.');
  if (userRole === 'Provider') assertProviderOwnsOrder(order, userId);
  const expectedReviewer = request.requester === 'Customer' ? 'Provider' : 'Customer';
  if (userRole !== expectedReviewer) throw httpError(403, 'Chỉ bên còn lại mới được phản hồi yêu cầu hủy.');

  const response = typeof responseReason === 'string' ? responseReason.trim() : '';
  if (response.length > 500) throw httpError(400, 'Nội dung phản hồi không được vượt quá 500 ký tự.');
  if (!approve) {
    request.status = 'rejected';
    request.respondedBy = userRole;
    request.respondedAt = new Date().toISOString();
    request.responseReason = response;
    updateOrderMilestone(order, `Yêu cầu hủy bị từ chối${response ? `: ${response}` : ''}`);
    db.saveCollection('orders', orders);
    if (userRole === 'Provider') createNotification(order.customerId, 'Yêu cầu hủy bị từ chối', `Provider từ chối yêu cầu hủy đơn ${order.id}${response ? `: ${response}` : ''}. Đơn tiếp tục thực hiện; nếu không thống nhất, hãy gửi khiếu nại để Admin xem xét.`, 'warning', `/customer_orders.html?orderId=${encodeURIComponent(order.id)}`);
    else notifyProvider(order.providerId, 'Khách không chấp thuận hủy đơn', `Khách hàng từ chối yêu cầu hủy đơn ${order.id}${response ? `: ${response}` : ''}.`, 'warning', `/bookings.html?orderId=${encodeURIComponent(order.id)}`);
    return order;
  }

  request.status = 'approved';
  request.respondedBy = userRole;
  request.respondedAt = new Date().toISOString();
  request.responseReason = response;
  order.cancelReason = request.reason;
  order.cancelledBy = request.requester;
  order.cancelledAt = new Date().toISOString();
  order.orderStatus = 'cancelled';
  order.escrowStatus = 'refunded';
  order.refundAmount = refundCustomer(order);
  order.refundedAt = order.refundAmount > 0 ? formatDateTime(new Date()) : null;
  updateOrderMilestone(order, 'Yêu cầu hủy được chấp thuận; tiền ký quỹ hoàn vào ví khách hàng.');
  db.saveCollection('orders', orders);
  createNotification(order.customerId, 'Yêu cầu hủy đã được chấp thuận', `Đơn ${order.id} đã hủy và tiền ký quỹ được hoàn vào ví.`, 'success', `/customer_orders.html?orderId=${encodeURIComponent(order.id)}`);
  notifyProvider(order.providerId, 'Đơn hàng đã hủy', `Yêu cầu hủy đơn ${order.id} đã được chấp thuận.`, 'info', `/bookings.html?orderId=${encodeURIComponent(order.id)}`);
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
    order.paymentExpiresAt = new Date(Date.now() + (Number(process.env.ORDER_PAYMENT_WINDOW_MINUTES) || 1440) * 60 * 1000).toISOString();
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
//  - Khách nghiệm thu: chỉ khi tiền đang giữ (escrow_held) và Provider đã bàn giao.
//  - Admin (force): thêm cả đơn đang tranh chấp.
function processReleaseEscrow(orderId, { customerId = null, force = false } = {}) {
  const orders = db.getCollection('orders');
  const order = loadOrder(orders, orderId);

  if (!force && order.customerId !== customerId) {
    throw httpError(403, 'Bạn không có quyền thao tác đơn hàng này.');
  }
  if (order.cancellationRequest?.status === 'pending') throw httpError(409, 'Đơn đang chờ duyệt yêu cầu hủy; chưa thể giải ngân Escrow.');
  if (order.escrowStatus === 'completed' || order.orderStatus === 'completed') {
    throw httpError(409, 'Đơn hàng này đã được giải ngân Escrow trước đó!');
  }
  const releasableEscrow = force ? ['escrow_held', 'disputed'] : ['escrow_held'];
  const releasableStatus = force ? ['processing', 'delivered', 'disputed'] : ['delivered'];
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
  createNotification(order.customerId, force ? 'Đã phân xử đơn hàng' : 'Đơn hàng đã hoàn tất',
    force
      ? `Admin đã phân xử đơn ${order.id} và giải ngân khoản ký quỹ cho Provider. Đơn hàng đã kết thúc.`
      : `Bạn đã nghiệm thu đơn ${order.id}. Ký quỹ đã được giải ngân cho Provider và đơn hàng đã hoàn tất.`,
    'success', `/customer_orders.html?orderId=${encodeURIComponent(order.id)}`);
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
  if (order.cancellationRequest?.status === 'pending') order.cancellationRequest.status = 'resolved_by_admin';
  order.cancelledBy = 'Admin';
  updateOrderMilestone(order, 'Admin hoàn tiền ký quỹ cho khách hàng');
  refundCustomer(order);
  db.saveCollection('orders', orders);

  createNotification(order.customerId, 'Đã hoàn tiền',
    `Admin đã hoàn 100% tiền ký quỹ của đơn hàng ${order.id} vào ví của bạn.`, 'success', `/customer_orders.html?orderId=${encodeURIComponent(order.id)}`);
  notifyProvider(order.providerId, 'Đơn hàng bị hoàn tiền', `Đơn hàng ${order.id} đã được Admin hoàn tiền cho khách hàng.`, 'warning');
  return order;
}

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
  processAcceptOrder,
  processDeliverOrder,
  processProgressOrder,
  processCancelOrder,
  processRespondCancellation,
  processUndoCancelOrder,
  processReleaseEscrow,
  processForceRefund,
  checkAutoReleaseOrders
};
