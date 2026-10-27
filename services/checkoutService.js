// Thanh toán & tạo đơn hàng. Dùng chung cho:
//  - Giỏ hàng (POST /api/booking-list/checkout)
//  - Đặt trực tiếp một dịch vụ (POST /api/orders)
//  - Thanh toán lại đơn đang chờ (POST /api/payments/vnpay/orders/:id)
//  - Callback của VNPay (Return URL / IPN)
//
// Hai cách trả tiền:
//  * "wallet"  : trừ số dư ví -> đơn vào ký quỹ ngay (paymentStatus = 'paid').
//  * "gateway" : tạo đơn ở trạng thái CHỜ THANH TOÁN (paymentStatus = 'pending', giữ khung giờ),
//                khách sang cổng VNPay; khi VNPay báo thành công đơn mới vào ký quỹ và Provider mới thấy.
//                Quá hạn không trả -> tự hủy (không có khoản tiền nào bị trừ).
const db = require('../data/db');
const { formatDateTime } = require('../utils/dates');
const { generateId } = require('../utils/id');
const { slotsForDate } = require('../routes/providerAvailability');
const { createNotification, notifyProvider } = require('./notificationService');
const { httpError } = require('./orderService');
const vnpay = require('./vnpayService');

const PLATFORM_FEE_RATE = 0.05;
const MIN_PAYMENT = 10000;       // VNPay: tối thiểu 10.000đ
const MAX_PAYMENT = 50000000;    // Giới hạn mỗi giao dịch (có thể chỉnh)

function paymentWindowMs() {
  return (Number(process.env.ORDER_PAYMENT_WINDOW_MINUTES) || 1440) * 60 * 1000;
}

function money(n) { return `${Number(n || 0).toLocaleString('vi-VN')}đ`; }

function nextOrderId(orders, createdSoFar = []) {
  let id;
  do {
    id = `DH00${Math.floor(1000 + Math.random() * 9000)}`;
  } while (orders.some((o) => o.id === id) || createdSoFar.some((o) => o.id === id));
  return id;
}

// Provider chỉ thấy đơn đã thanh toán (không thấy đơn đang chờ thanh toán / đã hủy do chưa trả tiền).
function isVisibleToProvider(order) {
  return order.paymentStatus !== 'pending' && order.paymentStatus !== 'cancelled';
}

function assertOrderPaid(order) {
  if (order.paymentStatus === 'pending') {
    throw httpError(409, 'Đơn hàng chưa được khách thanh toán.');
  }
}

// ---------------------------------------------------------------------------
// 1) Dựng "đơn dự kiến" (spec) từ giỏ hàng, kiểm tra dịch vụ / lịch / giá phía server
// ---------------------------------------------------------------------------
function buildCartSpecs(bookingList, schedulesByProvider) {
  const services = db.getCollection('services') || [];
  const orders = db.getCollection('orders') || [];
  const providers = db.getCollection('providers') || [];
  const groups = {};

  for (const item of bookingList.items) {
    const srv = services.find((s) => s.id === item.serviceId);
    if (!srv || (srv.status && srv.status !== 'active')) {
      throw httpError(400, `Dịch vụ ${item.serviceId} không còn khả dụng. Hãy cập nhật giỏ rồi thử lại.`);
    }
    const qty = Number(item.hours);
    if (!Number.isInteger(qty) || qty < 1 || qty > 99 || !Number.isFinite(Number(srv.price)) || Number(srv.price) < 0) {
      throw httpError(400, `Thông tin dịch vụ ${item.serviceId} trong giỏ không hợp lệ.`);
    }
    if (!srv.providerId) {
      throw httpError(400, `Dịch vụ ${item.serviceId} chưa được gán Provider.`);
    }
    if (!groups[srv.providerId]) {
      groups[srv.providerId] = { providerId: srv.providerId, providerName: srv.providerName, items: [], price: 0 };
    }
    const itemPrice = Number(srv.price) * qty;
    groups[srv.providerId].items.push({ serviceId: srv.id, serviceTitle: srv.title, quantity: qty, itemPrice });
    groups[srv.providerId].price += itemPrice;
  }

  const specs = [];
  for (const pid of Object.keys(groups)) {
    const group = groups[pid];
    const schedule = schedulesByProvider && schedulesByProvider[pid];
    if (!schedule || !/^\d{4}-\d{2}-\d{2}$/.test(schedule.scheduledDate || '') || !schedule.scheduledTime) {
      throw httpError(400, `Chọn ngày và giờ hẹn cho Provider ${group.providerName || pid}.`);
    }
    const [year, month, day] = schedule.scheduledDate.split('-').map(Number);
    const appointmentDate = new Date(year, month - 1, day, 12);
    const provider = providers.find((p) => p.id === pid);
    if (!provider || appointmentDate.getFullYear() !== year || appointmentDate.getMonth() !== month - 1 || appointmentDate.getDate() !== day) {
      throw httpError(400, `Ngày hẹn của Provider ${group.providerName || pid} không hợp lệ.`);
    }
    if (!slotsForDate(provider, appointmentDate, orders).includes(schedule.scheduledTime)) {
      throw httpError(409, `Khung giờ của Provider ${group.providerName || pid} không còn trống. Hãy chọn lịch khác.`);
    }
    const platformFee = Math.round(group.price * PLATFORM_FEE_RATE);
    specs.push({
      providerId: group.providerId,
      providerName: group.providerName,
      serviceId: group.items[0].serviceId,
      serviceTitle: group.items.map((i) => `${i.serviceTitle} (×${i.quantity})`).join(', '),
      items: group.items,
      price: group.price,
      platformFee,
      escrowDeposit: group.price + platformFee,
      scheduledDate: schedule.scheduledDate,
      scheduledTime: schedule.scheduledTime
    });
  }
  const total = specs.reduce((sum, s) => sum + s.escrowDeposit, 0);
  return { specs, total };
}

// ---------------------------------------------------------------------------
// 2) Tạo đơn từ spec
// ---------------------------------------------------------------------------
function buildOrderDocument(spec, ctx) {
  const dateStr = formatDateTime(ctx.now);
  const gateway = ctx.mode === 'gateway';
  const order = {
    id: ctx.id,
    customerId: ctx.customer.id,
    customerName: ctx.customer.name,
    customerPhone: ctx.customerPhone || ctx.customer.phone || '',
    customerAddress: ctx.customerAddress || ctx.customer.address || '',
    providerId: spec.providerId,
    providerName: spec.providerName,
    ...(spec.providerPhone ? { providerPhone: spec.providerPhone } : {}),
    serviceId: spec.serviceId || null,
    serviceTitle: spec.serviceTitle,
    ...(spec.jobId ? { jobId: spec.jobId } : {}),
    ...(spec.items && spec.items.length ? { items: spec.items } : {}),
    price: spec.price,
    priceFormatted: money(spec.price),
    platformFee: spec.platformFee,
    escrowDeposit: spec.escrowDeposit,
    escrowStatus: gateway ? 'payment_pending' : 'escrow_held',
    paymentStatus: gateway ? 'pending' : 'paid',
    orderStatus: spec.jobId ? (gateway ? 'pending' : 'processing') : 'pending',
    paymentMethod: ctx.paymentMethod,
    date: dateStr,
    deadline: spec.deadline || '7 ngày sau đặt cọc',
    scheduledDate: spec.scheduledDate || '',
    scheduledTime: spec.scheduledTime || '',
    notes: ctx.notes || '',
    milestones: [
      gateway
        ? { title: 'Chờ khách thanh toán qua VNPay', done: false, time: 'Chờ thanh toán' }
        : { title: 'Ký quỹ Escrow bảo vệ 100% thành công', done: true, time: dateStr },
      { title: 'Provider tiếp nhận yêu cầu & triển khai công việc', done: Boolean(spec.jobId && !gateway), time: spec.jobId && !gateway ? dateStr : 'Chờ tiếp nhận' },
      { title: 'Bàn giao sản phẩm / hoàn thành dịch vụ', done: false, time: 'Chờ bàn giao' },
      { title: 'Khách hàng nghiệm thu & Giải ngân Escrow', done: false, time: 'Chờ nghiệm thu' }
    ]
  };
  if (gateway) {
    order.paymentRef = ctx.paymentRef;
    order.paymentExpiresAt = new Date(ctx.now.getTime() + paymentWindowMs()).toISOString();
  } else {
    order.paidAt = ctx.now.toISOString();
  }
  return order;
}

// mode = 'wallet'  -> trừ ví + ký quỹ ngay
// mode = 'gateway' -> đơn chờ thanh toán (chưa trừ ví, chưa báo cho Provider)
function createOrders(customer, specs, { mode, paymentMethod, customerPhone, customerAddress, notes, paymentRef }) {
  const users = db.getCollection('users');
  const orders = db.getCollection('orders');
  const customerRecord = users.find((u) => u.id === customer.id);
  if (!customerRecord) throw httpError(401, 'Không tìm thấy thông tin khách hàng.');

  const now = new Date();
  const created = [];
  const transactions = db.getCollection('walletTransactions') || [];

  for (const spec of specs) {
    const id = nextOrderId(orders, created);
    const order = buildOrderDocument(spec, { id, mode, now, customer: customerRecord, customerPhone, customerAddress, notes, paymentMethod, paymentRef });
    created.push(order);

    if (mode === 'wallet') {
      const newBal = (Number(customerRecord.balance) || 0) - spec.escrowDeposit;
      customerRecord.balance = newBal;
      const txnId = `TXN_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
      order.paymentRef = txnId;
      transactions.unshift({
        id: txnId,
        userId: customerRecord.id,
        type: 'escrow',
        amount: -spec.escrowDeposit,
        status: 'completed',
        createdAt: formatDateTime(now),
        description: `Ký quỹ Escrow cho đơn hàng ${id} (Trừ từ số dư ví)`,
        orderIds: [id],
        balanceAfter: newBal
      });
    }
  }

  orders.unshift(...created.slice().reverse());
  db.saveCollection('orders', orders);
  if (mode === 'wallet') {
    db.saveCollection('users', users);
    db.saveCollection('walletTransactions', transactions);
    created.forEach((order) => notifyProvider(order.providerId, 'Đơn đặt lịch mới',
      `Bạn có lịch đặt mới từ ${customerRecord.name}. Tổng giá trị: ${money(order.price)}.`, 'info',
      `/bookings.html?orderId=${encodeURIComponent(order.id)}`));
  }
  return created;
}

// ---------------------------------------------------------------------------
// 3) Thanh toán qua cổng VNPay
// ---------------------------------------------------------------------------
function createGatewayTransaction({ userId, type, amount, description, orderIds, bankCode, ipAddr, orderInfo, orderType, returnOrigin }) {
  const now = new Date();
  const txnRef = generateId('VNP');
  const txn = {
    id: txnRef,
    userId,
    type,                       // 'deposit' (nạp ví) | 'order_payment' (thanh toán đơn)
    amount: Number(amount),
    status: 'pending',
    method: 'VNPAY',
    bankCode: vnpay.sanitizeBankCode(bankCode),
    ...(returnOrigin ? { returnOrigin } : {}),
    description,
    ...(orderIds ? { orderIds } : {}),
    createdAt: formatDateTime(now),
    createdAtISO: now.toISOString(),
    expiresAt: new Date(now.getTime() + vnpay.getConfig().expireMinutes * 60 * 1000).toISOString()
  };
  const transactions = db.getCollection('walletTransactions') || [];
  transactions.unshift(txn);
  db.saveCollection('walletTransactions', transactions);

  const paymentUrl = vnpay.createPaymentUrl({ txnRef, amount: txn.amount, orderInfo, ipAddr, bankCode: txn.bankCode, orderType, now });
  return { txn, paymentUrl };
}

function assertPayableAmount(amount) {
  if (!Number.isFinite(amount) || amount < MIN_PAYMENT) {
    throw httpError(400, `Số tiền thanh toán qua VNPay tối thiểu ${money(MIN_PAYMENT)}.`);
  }
  if (amount > MAX_PAYMENT) {
    throw httpError(400, `Số tiền mỗi giao dịch VNPay tối đa ${money(MAX_PAYMENT)}.`);
  }
}

// Tạo đơn "chờ thanh toán" + giao dịch VNPay + URL thanh toán.
function startGatewayCheckout({ customer, specs, paymentMethod, customerPhone, customerAddress, notes, ipAddr, bankCode, returnOrigin }) {
  const total = specs.reduce((sum, s) => sum + s.escrowDeposit, 0);
  assertPayableAmount(total);

  const channel = bankCode !== undefined && bankCode !== null && bankCode !== ''
    ? vnpay.sanitizeBankCode(bankCode)
    : vnpay.bankCodeForMethod(paymentMethod);

  const paymentRef = generateId('PAY');
  const orders = createOrders(customer, specs, { mode: 'gateway', paymentMethod, customerPhone, customerAddress, notes, paymentRef });
  const orderIds = orders.map((o) => o.id);

  const { txn, paymentUrl } = createGatewayTransaction({
    userId: customer.id,
    type: 'order_payment',
    amount: total,
    description: `Thanh toán đơn ${orderIds.join(', ')} qua VNPay`,
    orderIds,
    bankCode: channel,
    returnOrigin,
    ipAddr,
    orderInfo: `Thanh toan don hang ${orderIds.join(' ')}`,
    orderType: 'billpayment'
  });

  // Gắn mã giao dịch để đối soát
  const all = db.getCollection('orders');
  orders.forEach((created) => {
    const stored = all.find((o) => o.id === created.id);
    if (stored) stored.paymentRef = txn.id;
  });
  db.saveCollection('orders', all);
  const storedOrders = orderIds.map((id) => all.find((o) => o.id === id)).filter(Boolean);

  createNotification(customer.id, 'Đơn đang chờ thanh toán',
    `Đơn ${orderIds.join(', ')} đang chờ thanh toán ${money(total)} qua VNPay. Đơn sẽ tự hủy nếu không thanh toán trong ${Math.round(paymentWindowMs() / 60000)} phút.`,
    'info', '/customer_orders.html');
  return { orders: storedOrders, txn, paymentUrl };
}

// Thanh toán lại cho một đơn đang chờ thanh toán.
function startGatewayRetry({ orderId, customerId, ipAddr, bankCode, returnOrigin }) {
  expireUnpaidOrders();
  const orders = db.getCollection('orders');
  const order = orders.find((o) => o.id === orderId);
  if (!order) throw httpError(404, 'Không tìm thấy đơn hàng.');
  const users = db.getCollection('users') || [];
  const customer = users.find((u) => u.id === customerId || (u.uid && u.uid === customerId));
  const isOwner = order.customerId === customerId || (customer && (order.customerId === customer.id || order.customerId === customer.uid));
  if (!isOwner) throw httpError(403, 'Bạn không có quyền thanh toán đơn hàng này.');

  const isPendingStatus = ['pending', 'pending_payment', 'awaiting_payment'].includes(order.orderStatus);
  if (order.paymentStatus !== 'pending' || !isPendingStatus) {
    throw httpError(409, 'Đơn hàng này không ở trạng thái chờ thanh toán.');
  }
  const amount = Number(order.escrowDeposit);
  assertPayableAmount(amount);

  // Các giao dịch cũ của đơn này không còn dùng nữa
  const transactions = db.getCollection('walletTransactions') || [];
  transactions.forEach((t) => {
    if (t.type === 'order_payment' && t.status === 'pending' && (t.orderIds || []).includes(orderId)) t.status = 'expired';
  });
  db.saveCollection('walletTransactions', transactions);

  const channel = bankCode !== undefined && bankCode !== null && bankCode !== ''
    ? vnpay.sanitizeBankCode(bankCode)
    : vnpay.bankCodeForMethod(order.paymentMethod);

  const { txn, paymentUrl } = createGatewayTransaction({
    userId: customerId,
    type: 'order_payment',
    amount,
    description: `Thanh toán đơn ${orderId} qua VNPay`,
    orderIds: [orderId],
    bankCode: channel,
    returnOrigin,
    ipAddr,
    orderInfo: `Thanh toan don hang ${orderId}`,
    orderType: 'billpayment'
  });

  order.paymentRef = txn.id;
  order.paymentExpiresAt = new Date(Date.now() + paymentWindowMs()).toISOString();
  db.saveCollection('orders', orders);
  return { order, txn, paymentUrl };
}

// VNPay báo thanh toán thành công -> đơn vào ký quỹ, báo cho Provider.
// Nếu đơn đã bị hủy / đã trả rồi (ví dụ quá hạn rồi mới trả) thì cộng số tiền đó vào ví khách để không mất tiền.
function markOrdersPaid(txn) {
  const orders = db.getCollection('orders');
  const users = db.getCollection('users');
  const transactions = db.getCollection('walletTransactions') || [];
  const now = new Date();
  let credited = 0;
  const paidOrders = [];

  for (const orderId of txn.orderIds || []) {
    const order = orders.find((o) => o.id === orderId);
    if (order && order.paymentStatus === 'pending' && order.orderStatus === 'pending') {
      order.paymentStatus = 'paid';
      order.escrowStatus = 'escrow_held';
      if (order.jobId) {
        order.orderStatus = 'processing';
        if (order.milestones && order.milestones[1]) {
          order.milestones[1] = { title: 'Provider tiếp nhận yêu cầu & triển khai công việc', done: true, time: formatDateTime(now) };
        }
      }
      order.paidAt = now.toISOString();
      order.paymentRef = txn.id;
      delete order.paymentExpiresAt;
      if (order.milestones && order.milestones[0]) {
        order.milestones[0] = { title: 'Ký quỹ Escrow bảo vệ 100% thành công', done: true, time: formatDateTime(now) };
      }
      paidOrders.push(order);
    } else {
      const amount = order ? Number(order.escrowDeposit) : 0;
      const customer = users.find((u) => u.id === txn.userId);
      if (customer && amount > 0) {
        customer.balance = (Number(customer.balance) || 0) + amount;
        credited += amount;
        transactions.unshift({
          id: `TXN_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
          userId: customer.id,
          type: 'refund',
          amount,
          status: 'completed',
          createdAt: formatDateTime(now),
          description: `Hoàn tiền vào ví: đơn ${orderId} không còn chờ thanh toán khi VNPay xác nhận (${txn.id})`
        });
      }
    }
  }

  db.saveCollection('orders', orders);
  if (credited > 0) {
    db.saveCollection('users', users);
    db.saveCollection('walletTransactions', transactions);
    txn.creditedToWallet = credited;
  }

  paidOrders.forEach((order) => {
    if (order.jobId) {
      const jobs = db.getCollection('jobRequests') || [];
      const job = jobs.find((item) => item.id === order.jobId);
      if (job) {
        job.selectedProviderId = order.providerId;
        (job.applicants || []).forEach((applicant) => {
          if (applicant.providerId !== order.providerId) {
            if (applicant.status === 'pending' || applicant.status === 'selected') {
              applicant.status = 'rejected';
              notifyProvider(applicant.providerId, 'Yêu cầu tuyển dụng đã có chuyên gia', `Yêu cầu “${job.title}” đã được khách hàng giao cho một chuyên gia khác. Cảm ơn bạn đã quan tâm và gửi báo giá.`, 'info', '/jobs.html?tab=tab-uc36');
            }
          } else {
            applicant.status = 'accepted';
          }
        });
        job.status = 'closed';
        job.closeReason = 'provider_selected';
        job.paymentOrderId = order.id;
        job.statusUpdatedAt = now.toISOString();
        db.saveCollection('jobRequests', jobs);
      }
    }
    notifyProvider(order.providerId, order.jobId ? 'Ký quỹ hoàn tất - bắt đầu công việc' : 'Đơn đặt lịch mới',
      order.jobId
        ? `Khách hàng đã ký quỹ ${money(order.price)} cho yêu cầu “${order.serviceTitle}”. Bạn có thể bắt đầu thực hiện.`
        : `Bạn có lịch đặt mới từ ${order.customerName}. Tổng giá trị: ${money(order.price)}.`, 'info',
      order.jobId ? `/bookings.html?tab=tab-uc39&orderId=${encodeURIComponent(order.id)}` : `/bookings.html?orderId=${encodeURIComponent(order.id)}`);
    if (order.jobId) {
      createNotification(order.customerId, 'Đã ký quỹ, công việc bắt đầu',
        `Đơn ${order.id} cho yêu cầu “${order.serviceTitle}” đã được ký quỹ an toàn. Provider có thể bắt đầu thực hiện.`,
        'success', `/customer_orders.html?orderId=${encodeURIComponent(order.id)}`);
    }
  });
  if (paidOrders.length) {
    createNotification(txn.userId, 'Thanh toán thành công',
      `Đã nhận ${money(txn.amount)} qua VNPay. Đơn ${paidOrders.map((o) => o.id).join(', ')} đã được ký quỹ an toàn.`,
      'success', `/customer_orders.html?orderId=${encodeURIComponent(paidOrders[0]?.id || '')}`);
  }
  if (credited > 0) {
    createNotification(txn.userId, 'Đã hoàn tiền vào ví',
      `Có ${money(credited)} từ giao dịch ${txn.id} được cộng vào ví vì đơn hàng không còn chờ thanh toán.`, 'warning', '/customer_wallet.html');
  }
  return { paidOrders, credited };
}

// Tự hủy các đơn chờ thanh toán đã quá hạn 24 giờ (giải phóng khung giờ của Provider và mở lại yêu cầu).
function expireUnpaidOrders(nowMs = Date.now()) {
  const orders = db.getCollection('orders') || [];
  const expired = orders.filter((o) => o.paymentStatus === 'pending' && o.orderStatus === 'pending'
    && Number.isFinite(Date.parse(o.paymentExpiresAt || '')) && Date.parse(o.paymentExpiresAt) <= nowMs);
  if (!expired.length) return 0;

  const expiredIds = new Set(expired.map((o) => o.id));
  const jobs = db.getCollection('jobRequests') || [];
  let jobsModified = false;

  expired.forEach((order) => {
    order.orderStatus = 'cancelled';
    order.paymentStatus = 'cancelled';
    order.escrowStatus = 'payment_cancelled';
    order.cancelReason = 'Quá hạn thanh toán ký quỹ 24h';
    order.cancelledBy = 'System';
    order.cancelledAt = new Date(nowMs).toISOString();
    order.refundAmount = 0;
    if (order.milestones) order.milestones.push({ title: 'Đơn tự hủy do quá hạn thanh toán ký quỹ 24h', done: true, time: formatDateTime(new Date(nowMs)) });
    createNotification(order.customerId, 'Đơn hàng đã hết hạn thanh toán (24h)',
      `Đơn ${order.id} đã tự hủy vì chưa hoàn tất ký quỹ đúng hạn trong 24 giờ. Không có khoản tiền nào bị trừ.`, 'warning', '/customer_orders.html');

    if (order.jobId) {
      const job = jobs.find((j) => j.id === order.jobId);
      if (job && (job.status === 'awaiting_payment' || job.status === 'open')) {
        job.status = 'open';
        job.selectedProviderId = null;
        job.paymentOrderId = null;
        job.statusUpdatedAt = new Date(nowMs).toISOString();
        if (Array.isArray(job.applicants)) {
          job.applicants.forEach((applicant) => {
            if (applicant.providerId === order.providerId && (applicant.status === 'accepted' || applicant.status === 'selected')) {
              applicant.status = 'pending';
            }
          });
        }
        jobsModified = true;
        createNotification(order.customerId, 'Yêu cầu tuyển dụng được mở lại',
          `Yêu cầu “${job.title}” đã tự động mở lại do đơn ký quỹ hết hạn 24 giờ. Bạn có thể chọn ứng viên khác hoặc tiếp tục nhận báo giá.`,
          'info', `/customer_requests.html?jobId=${encodeURIComponent(job.id)}`);
        notifyProvider(order.providerId, 'Hết hạn thanh toán ký quỹ yêu cầu',
          `Khách hàng chưa thanh toán ký quỹ trong 24h cho yêu cầu “${job.title}”. Yêu cầu đã được hệ thống mở lại cho các ứng viên.`,
          'info', `/jobs.html?tab=tab-uc36`);
      }
    }
  });
  db.saveCollection('orders', orders);
  if (jobsModified) {
    db.saveCollection('jobRequests', jobs);
  }

  const transactions = db.getCollection('walletTransactions') || [];
  let touched = false;
  transactions.forEach((t) => {
    if (t.type === 'order_payment' && t.status === 'pending' && (t.orderIds || []).every((id) => expiredIds.has(id))) {
      t.status = 'expired';
      touched = true;
    }
  });
  if (touched) db.saveCollection('walletTransactions', transactions);
  return expired.length;
}

// ---------------------------------------------------------------------------
// 4) Lịch sử giao dịch của người dùng
// ---------------------------------------------------------------------------
const PUBLIC_TXN_FIELDS = ['id', 'type', 'amount', 'status', 'method', 'description', 'orderIds', 'createdAt', 'createdAtISO', 'expiresAt', 'paidAt', 'responseCode', 'bankCode', 'creditedToWallet'];

function sanitizeTransaction(txn) {
  const out = {};
  PUBLIC_TXN_FIELDS.forEach((key) => { if (txn[key] !== undefined) out[key] = txn[key]; });
  return out;
}

// Số dư ví chỉ thay đổi bởi các giao dịch đã hoàn tất; 'order_payment' qua VNPay không đổi số dư.
function listTransactions(userId, { type, status, limit = 50, offset = 0 } = {}) {
  let list = (db.getCollection('walletTransactions') || []).filter((t) => t.userId === userId);
  if (type) list = list.filter((t) => t.type === type);
  if (status) list = list.filter((t) => t.status === status);
  const total = list.length;
  const page = list.slice(offset, offset + limit).map(sanitizeTransaction);
  return { total, transactions: page };
}

// Thanh toán ký quỹ đơn hàng chờ bằng số dư ví SkillRental
function payOrderWithBalance({ orderId, customerId }) {
  expireUnpaidOrders();
  const orders = db.getCollection('orders') || [];
  const order = orders.find((o) => o.id === orderId);
  if (!order) throw httpError(404, 'Không tìm thấy đơn hàng.');
  const users = db.getCollection('users') || [];
  const customer = users.find((u) => u.id === customerId || (u.uid && u.uid === customerId));
  const isOwner = order.customerId === customerId || (customer && (order.customerId === customer.id || order.customerId === customer.uid));
  if (!isOwner) throw httpError(403, 'Bạn không có quyền thanh toán đơn hàng này.');

  const isPendingPayment = order.paymentStatus === 'pending' || order.paymentStatus === 'unpaid' || order.escrowStatus === 'payment_pending';
  const isPendingStatus = ['pending', 'pending_payment', 'awaiting_payment'].includes(order.orderStatus);
  if (!isPendingPayment || !isPendingStatus) {
    throw httpError(409, 'Đơn hàng này không ở trạng thái chờ thanh toán.');
  }

  const depositAmt = Number(order.escrowDeposit || order.price || 0);
  if (depositAmt <= 0) throw httpError(400, 'Số tiền ký quỹ không hợp lệ.');

  // Tính số dư khả dụng thực tế của khách hàng
  const txns = db.getCollection('walletTransactions') || [];
  const userTxns = txns.filter(t => 
    (t.userId === customer.id || (customer.uid && t.userId === customer.uid)) &&
    (t.status === 'success' || t.status === 'completed')
  );
  const hasDeposit = userTxns.some(t => t.type === 'deposit');
  let realBalance = 0;
  if (hasDeposit) {
    const totalDeposits = userTxns
      .filter(t => t.type === 'deposit' || t.type === 'refund')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const totalDeductions = userTxns
      .filter(t => t.type === 'escrow' || t.type === 'order_payment' || t.type === 'withdraw')
      .reduce((sum, t) => sum + Math.abs(Number(t.amount) || 0), 0);
    realBalance = Math.max(Number(customer.balance) || 0, totalDeposits - totalDeductions);
  } else {
    realBalance = Math.max(0, Number(customer.balance) || 0);
  }

  if (realBalance < depositAmt) {
    throw httpError(400, `Số dư ví không đủ để ký quỹ (Cần ${money(depositAmt)}, số dư khả dụng hiện có ${money(realBalance)}). Vui lòng nạp thêm tiền hoặc chọn thanh toán qua VietQR.`);
  }

  const now = new Date();
  const newBalance = realBalance - depositAmt;
  customer.balance = newBalance;
  db.saveCollection('users', users);

  // Huỷ các giao dịch gateway đang chờ của đơn này
  txns.forEach((t) => {
    if (t.type === 'order_payment' && t.status === 'pending' && (t.orderIds || []).includes(orderId)) {
      t.status = 'cancelled';
    }
  });

  // Ghi log giao dịch ký quỹ từ ví
  const txnId = `TXN_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  txns.unshift({
    id: txnId,
    userId: customer.id,
    userName: customer.name || 'Khách hàng',
    type: 'escrow',
    amount: -depositAmt,
    status: 'completed',
    createdAt: formatDateTime(now),
    createdAtISO: now.toISOString(),
    description: `Ký quỹ Escrow cho đơn hàng ${order.id} (Trừ từ số dư ví)`,
    orderIds: [order.id],
    balanceAfter: newBalance
  });
  db.saveCollection('walletTransactions', txns);

  // Cập nhật trạng thái đơn hàng sang paid & escrow_held
  order.paymentStatus = 'paid';
  order.escrowStatus = 'escrow_held';
  order.paymentMethod = 'Số dư ví SkillRental (Escrow)';
  order.paidAt = now.toISOString();
  order.paymentRef = txnId;
  delete order.paymentExpiresAt;

  if (order.milestones && order.milestones[0]) {
    order.milestones[0] = { title: 'Ký quỹ Escrow bảo vệ 100% thành công', done: true, time: formatDateTime(now) };
  }

  if (order.jobId) {
    order.orderStatus = 'processing';
    if (order.milestones && order.milestones[1]) {
      order.milestones[1] = { title: 'Provider tiếp nhận yêu cầu & triển khai công việc', done: true, time: formatDateTime(now) };
    }
    const jobs = db.getCollection('jobRequests') || [];
    const job = jobs.find((item) => item.id === order.jobId);
    if (job) {
      job.selectedProviderId = order.providerId;
      (job.applicants || []).forEach((applicant) => {
        if (applicant.providerId !== order.providerId) {
          if (applicant.status === 'pending' || applicant.status === 'selected') {
            applicant.status = 'rejected';
            notifyProvider(applicant.providerId, 'Yêu cầu tuyển dụng đã có chuyên gia', `Yêu cầu “${job.title}” đã được khách hàng giao cho một chuyên gia khác. Cảm ơn bạn đã quan tâm và gửi báo giá.`, 'info', '/jobs.html?tab=tab-uc36');
          }
        } else {
          applicant.status = 'accepted';
        }
      });
      job.status = 'closed';
      job.closeReason = 'provider_selected';
      job.paymentOrderId = order.id;
      job.statusUpdatedAt = now.toISOString();
      db.saveCollection('jobRequests', jobs);
    }
  }

  db.saveCollection('orders', orders);

  // Thông báo tới Provider và Khách hàng
  notifyProvider(order.providerId, order.jobId ? 'Ký quỹ hoàn tất - bắt đầu công việc' : 'Đơn đặt lịch mới',
    order.jobId
      ? `Khách hàng đã ký quỹ ${money(order.price)} từ ví cho yêu cầu “${order.serviceTitle}”. Bạn có thể bắt đầu thực hiện.`
      : `Bạn có lịch đặt mới từ ${customer.name}. Đã ký quỹ: ${money(order.price)}.`, 'info',
    order.jobId ? `/bookings.html?tab=tab-uc39&orderId=${encodeURIComponent(order.id)}` : `/bookings.html?orderId=${encodeURIComponent(order.id)}`);

  createNotification(customer.id, 'Ký quỹ thành công từ số dư ví',
    `Đơn hàng ${order.id} đã được ký quỹ an toàn ${money(order.escrowDeposit)} từ số dư ví SkillRental.`,
    'success', `/customer_orders.html?orderId=${encodeURIComponent(order.id)}`);

  return { order, newBalance };
}

module.exports = {
  PLATFORM_FEE_RATE,
  MIN_PAYMENT,
  MAX_PAYMENT,
  isVisibleToProvider,
  assertOrderPaid,
  buildCartSpecs,
  createOrders,
  startGatewayCheckout,
  startGatewayRetry,
  createGatewayTransaction,
  assertPayableAmount,
  markOrdersPaid,
  expireUnpaidOrders,
  listTransactions,
  sanitizeTransaction,
  payOrderWithBalance
};