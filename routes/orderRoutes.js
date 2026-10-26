const express = require('express');
const router = express.Router();
const db = require('../data/db');
const { slotsForDate } = require('./providerAvailability');
const { requireCustomer, requireRole, requireSignedIn } = require('./customerAuth');
const { processAcceptOrder, processDeliverOrder, processProgressOrder, processCancelOrder, processRespondCancelRequest, processUndoCancelOrder, processReleaseEscrow, checkAutoReleaseOrders } = require('../services/orderService');
const { createNotification, notifyProvider } = require('../services/notificationService');
const vnpay = require('../services/vnpayService');
const { startGatewayCheckout, startGatewayRetry, expireUnpaidOrders, payOrderWithBalance } = require('../services/checkoutService');
const { allowedFrontendOrigin } = require('../utils/webOrigin');

// Tự động đồng bộ và sinh đơn chờ thanh toán cho các Yêu cầu (Job Request) đã chốt chuyên gia nhưng chưa có đơn hàng
function syncPendingJobOrders(customerId, customerUid = null) {
  if (!customerId) return;
  const jobs = db.getCollection('jobRequests') || [];
  const orders = db.getCollection('orders') || [];
  const providers = db.getCollection('providers') || [];
  const users = db.getCollection('users') || [];
  const customer = users.find(u => u.id === customerId || (u.uid && (u.uid === customerId || u.uid === customerUid)));
  const uid = customerUid || customer?.uid;
  let updatedOrders = false;
  let updatedJobs = false;

  const isCustomerMatch = (cid) => cid === customerId || (uid && cid === uid) || (customer && (cid === customer.id || cid === customer.uid));

  const awaitingJobs = jobs.filter(j => 
    isCustomerMatch(j.customerId) && 
    (j.status === 'awaiting_payment' || (j.status === 'open' && j.selectedProviderId))
  );

  for (const job of awaitingJobs) {
    const existingOrder = orders.find(o => o.jobId === job.id && o.orderStatus !== 'cancelled');
    if (existingOrder) {
      if (existingOrder.paymentStatus === 'pending' && (!existingOrder.paymentExpiresAt || !Number.isFinite(Date.parse(existingOrder.paymentExpiresAt)))) {
        existingOrder.paymentExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        updatedOrders = true;
      }
      continue;
    }

    const applicant = (job.applicants || []).find(a => 
      (job.selectedProviderId && (a.providerId === job.selectedProviderId || a.providerUserId === job.selectedProviderId)) || a.status === 'accepted'
    ) || job.applicants?.[0];

    if (!applicant) continue;

    const provider = providers.find(p => p.id === applicant.providerId || p.userId === applicant.providerId || p.id === applicant.providerUserId) || {};
    const priceNum = Number(String(applicant.proposedPriceNum || applicant.proposedPrice || '').replace(/[^0-9]/g, '')) || 0;
    if (priceNum <= 0) continue;

    const platformFee = Math.round(priceNum * 0.05);
    const escrowDeposit = priceNum + platformFee;
    const now = new Date();
    const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    let newId;
    do {
      newId = `DH00${Math.floor(1000 + Math.random() * 9000)}`;
    } while (orders.some(o => o.id === newId));

    const newOrder = {
      id: newId,
      customerId: (customer ? customer.id : (job.customerId || customerId)),
      customerName: job.customerName || customer?.name || 'Khách hàng',
      customerPhone: customer?.phone || '',
      customerAddress: job.location || customer?.address || '',
      providerId: applicant.providerId,
      providerName: applicant.providerName || provider.name || 'Provider',
      providerPhone: provider.phone || '',
      serviceId: null,
      serviceTitle: job.title || 'Hợp đồng dịch vụ theo yêu cầu',
      jobId: job.id,
      price: priceNum,
      priceFormatted: priceNum.toLocaleString('vi-VN') + 'đ',
      platformFee: platformFee,
      escrowDeposit: escrowDeposit,
      escrowStatus: 'payment_pending',
      paymentStatus: 'pending',
      orderStatus: 'pending',
      paymentMethod: 'Chưa thanh toán (Chờ ký quỹ)',
      paymentExpiresAt: new Date(now.getTime() + (24 * 60 * 60 * 1000)).toISOString(),
      date: dateStr,
      deadline: job.deadline || 'Thỏa thuận theo tiến độ',
      notes: `Tuyển từ yêu cầu: ${job.id}`,
      milestones: [
        { title: 'Chờ khách hàng ký quỹ Escrow (Thời hạn 24h)', done: false, time: 'Chờ thanh toán' },
        { title: 'Provider tiếp nhận yêu cầu & triển khai công việc', done: false, time: 'Chờ tiếp nhận' },
        { title: 'Bàn giao sản phẩm / hoàn thành dịch vụ', done: false, time: 'Chờ bàn giao' },
        { title: 'Khách hàng nghiệm thu & Giải ngân Escrow', done: false, time: 'Chờ nghiệm thu' }
      ]
    };

    orders.unshift(newOrder);
    job.paymentOrderId = newId;
    job.status = 'awaiting_payment';
    job.selectedProviderId = applicant.providerId;
    applicant.status = 'accepted';
    updatedOrders = true;
    updatedJobs = true;
  }

  if (updatedOrders) db.saveCollection('orders', orders);
  if (updatedJobs) db.saveCollection('jobRequests', jobs);
}

// List orders
router.get('/', requireCustomer, (req, res) => {
  expireUnpaidOrders();
  checkAutoReleaseOrders();
  syncPendingJobOrders(req.authUser.id, req.authUser.uid);
  const { customerId, providerId, status, escrowStatus } = req.query;
  let orders = db.getCollection('orders');

  const authId = req.authUser.id;
  const authUid = req.authUser.uid;
  const isOwner = (cid) => cid === authId || (authUid && cid === authUid);

  if (customerId && !isOwner(customerId)) {
    return res.status(403).json({ success: false, message: 'Bạn không có quyền xem đơn hàng của tài khoản khác.' });
  }
  orders = orders.filter(o => isOwner(o.customerId));

  if (customerId) {
    orders = orders.filter(o => isOwner(o.customerId));
  }
  if (providerId) {
    orders = orders.filter(o => o.providerId === providerId);
  }
  if (status) {
    orders = orders.filter(o => o.orderStatus === status);
  }
  if (escrowStatus) {
    orders = orders.filter(o => o.escrowStatus === escrowStatus);
  }

  res.json({
    success: true,
    total: orders.length,
    orders
  });
});

// Single order detail
router.get('/:id', requireCustomer, (req, res) => {
  const orders = db.getCollection('orders');
  const order = orders.find(o => o.id === req.params.id);

  if (!order) {
    return res.status(404).json({ success: false, message: 'Đơn hàng không tồn tại!' });
  }

  const isOwner = order.customerId === req.authUser.id || (req.authUser.uid && order.customerId === req.authUser.uid);
  if (!isOwner) {
    return res.status(403).json({ success: false, message: 'Bạn không có quyền xem đơn hàng này.' });
  }

  res.json({
    success: true,
    order
  });
});

// Create new booking / order with Escrow Deposit
router.post('/', requireCustomer, (req, res) => {
  const {
    customerPhone,
    customerAddress,
    providerId,
    providerName,
    serviceId,
    serviceTitle,
    price,
    deadline,
    scheduledDate,
    scheduledTime,
    notes,
    paymentMethod,
    jobId
  } = req.body;

  if (!providerId || !price) {
    return res.status(400).json({ success: false, message: 'Thông tin đặt dịch vụ không hợp lệ!' });
  }

  if (scheduledDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) {
      return res.status(400).json({ success: false, message: 'Ngày đặt lịch không hợp lệ.' });
    }
    const [year, month, day] = scheduledDate.split('-').map(Number);
    const appointmentDate = new Date(year, month - 1, day, 12);
    const provider = (db.getCollection('providers') || []).find(item => item.id === providerId);
    if (!provider || appointmentDate.getFullYear() !== year || appointmentDate.getMonth() !== month - 1 || appointmentDate.getDate() !== day) {
      return res.status(400).json({ success: false, message: 'Không tìm thấy Provider hoặc ngày đặt lịch không hợp lệ.' });
    }
    const availableSlots = slotsForDate(provider, appointmentDate, db.getCollection('orders') || []);
    if (!scheduledTime || !availableSlots.includes(scheduledTime)) {
      return res.status(409).json({ success: false, message: 'Khung giờ này đã qua hoặc Provider không còn rảnh. Vui lòng chọn ngày và giờ khác.' });
    }
  }

  const orders = db.getCollection('orders');
  
  // Calculate price securely from backend
  const services = db.getCollection('services') || [];
  const providers = db.getCollection('providers') || [];
  const provider = providers.find(item => item.id === providerId || item.userId === providerId);
  if (!provider) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy Provider của đơn hàng.' });
  }
  const service = services.find(s => s.id === serviceId);
  
  // Nạp 1 giá trị an toàn, mặc định dùng req.body.price nếu không tìm thấy nhưng cảnh báo
  let priceNum = Number(price);
  let jobRequest = null;
  if (jobId) {
    jobRequest = (db.getCollection('jobRequests') || []).find(j => j.id === jobId);
    const isJobOwner = jobRequest && (jobRequest.customerId === req.authUser.id || (req.authUser.uid && jobRequest.customerId === req.authUser.uid));
    if (!jobRequest || !isJobOwner) {
      return res.status(403).json({ success: false, message: 'Yêu cầu không tồn tại hoặc bạn không có quyền thao tác.' });
    }

    const existingJobOrder = orders.find(o => o.jobId === jobId && o.paymentStatus !== 'cancelled' && o.orderStatus !== 'cancelled');
    if (existingJobOrder) {
      if (existingJobOrder.paymentStatus === 'pending') {
        if (vnpay.isGatewayMethod(paymentMethod)) {
          const { txn, paymentUrl } = startGatewayRetry({
            orderId: existingJobOrder.id,
            customerId: req.authUser.id,
            ipAddr: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
            bankCode: vnpay.bankCodeForMethod(paymentMethod),
            returnOrigin: allowedFrontendOrigin(req.headers.origin)
          });
          return res.status(200).json({
            success: true,
            requiresPayment: true,
            isExistingOrder: true,
            message: 'Đang tiếp tục thanh toán đơn hàng chờ...',
            paymentUrl,
            txnRef: txn.id,
            order: existingJobOrder
          });
        }
        // Nếu là ví balance: thực hiện thanh toán ký quỹ trừ ví!
        try {
          const result = payOrderWithBalance({
            orderId: existingJobOrder.id,
            customerId: req.authUser.id
          });
          return res.status(200).json({
            success: true,
            message: 'Ký quỹ Escrow thành công! Tiền được bảo vệ an toàn 100% tại sàn.',
            order: result.order,
            newBalance: result.newBalance
          });
        } catch (err) {
          return res.status(err.status || 400).json({ success: false, message: err.message });
        }
      }
      if (existingJobOrder.paymentStatus === 'paid') {
        return res.status(200).json({
          success: true,
          message: 'Đơn hàng này đã được ký quỹ an toàn!',
          order: existingJobOrder
        });
      }
      return res.status(409).json({ success: false, message: 'Yêu cầu này đã có đơn thanh toán. Vui lòng kiểm tra mục Đơn hàng để tiếp tục.' });
    }
    const selectedApplicant = (jobRequest.applicants || []).find(a => 
      a.providerId === providerId || a.providerUserId === providerId ||
      (jobRequest.selectedProviderId && (a.providerId === jobRequest.selectedProviderId || a.providerUserId === jobRequest.selectedProviderId))
    );
    const quotedPrice = Number(selectedApplicant?.proposedPriceNum || String(selectedApplicant?.proposedPrice || '').replace(/[^0-9]/g, '')) || Number(price);
    if (!Number.isFinite(quotedPrice) || quotedPrice <= 0) {
      return res.status(400).json({ success: false, message: 'Báo giá của Provider không hợp lệ.' });
    }
    priceNum = quotedPrice;
  }
  if (!jobRequest && service && service.price) {
    // Nếu có hours (từ req.body, mặc định 1)
    const hours = Number(req.body.hours) || 1;
    priceNum = Number(service.price) * hours;
  }

  const platformFee = Math.round(priceNum * 0.05); // 5% escrow protection & platform fee
  const escrowDeposit = priceNum + platformFee;

  const users = db.getCollection('users');
  const customer = users.find(u => u.id === req.authUser.id || (u.uid && u.uid === req.authUser.uid));

  // Thanh toán qua cổng VNPay (ví VNPay / VietQR / thẻ quốc tế): tạo đơn chờ thanh toán, trả về paymentUrl
  if (vnpay.isGatewayMethod(paymentMethod)) {
    if (!customer) {
      return res.status(401).json({ success: false, message: 'Không tìm thấy thông tin khách hàng.' });
    }
    try {
      const { orders: created, txn, paymentUrl } = startGatewayCheckout({
        customer,
        specs: [{
          providerId,
          providerName: provider.name || providerName || 'Provider',
          providerPhone: provider.phone || '',
          serviceId: serviceId || null,
          serviceTitle: jobRequest?.title || (service ? service.title : serviceTitle) || 'Hợp đồng dịch vụ',
          jobId: jobRequest?.id,
          price: priceNum,
          platformFee,
          escrowDeposit,
          deadline,
          scheduledDate: scheduledDate || '',
          scheduledTime: scheduledTime || ''
        }],
        paymentMethod,
        customerPhone,
        customerAddress,
        notes,
        returnOrigin: allowedFrontendOrigin(req.headers.origin),
        ipAddr: req.headers['x-forwarded-for'] || req.socket.remoteAddress
      });
      return res.status(201).json({
        success: true,
        requiresPayment: true,
        message: 'Đã tạo đơn chờ thanh toán. Đang chuyển tới cổng VNPay...',
        paymentUrl,
        txnRef: txn.id,
        order: created[0]
      });
    } catch (err) {
      return res.status(err.status || 400).json({ success: false, message: err.message });
    }
  }

  if (!customer) {
    return res.status(401).json({ success: false, message: 'Không tìm thấy thông tin khách hàng.' });
  }

  // Đối soát số dư thực tế từ lịch sử ví (Real Balance)
  const txns = db.getCollection('walletTransactions') || [];
  const userTxns = txns.filter(t => 
    (t.userId === customer.id || (customer.uid && t.userId === customer.uid)) &&
    (t.status === 'success' || t.status === 'completed')
  );
  const userBalance = Number(customer.balance) || 0;
  const totalDeposits = userTxns
    .filter(t => t.type === 'deposit' || t.type === 'refund')
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const totalDeductions = userTxns
    .filter(t => t.type === 'escrow' || t.type === 'order_payment' || t.type === 'withdraw')
    .reduce((sum, t) => sum + Math.abs(Number(t.amount) || 0), 0);
  const ledgerBalance = Math.max(0, totalDeposits - totalDeductions);
  const realBalance = Math.max(userBalance, ledgerBalance);

  if (realBalance < escrowDeposit) {
    return res.status(400).json({ 
      success: false, 
      message: `Số dư ví không đủ. Cần ${escrowDeposit.toLocaleString('vi-VN')}đ (bao gồm phí sàn), nhưng số dư khả dụng hiện tại là ${realBalance.toLocaleString('vi-VN')}đ. Vui lòng nạp thêm tiền hoặc chọn VietQR.`
    });
  }

  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  let newId;
  do {
    newId = `DH00${Math.floor(1000 + Math.random() * 9000)}`;
  } while (orders.some(o => o.id === newId));

  const newBalance = realBalance - escrowDeposit;
  customer.balance = newBalance;
  db.saveCollection('users', users);

  const txnId = `TXN_${Date.now()}_${Math.floor(Math.random() * 100000)}`;

  const newOrder = {
    id: newId,
    customerId: req.authUser.id,
    customerName: req.authUser.name,
    customerPhone: customerPhone || customer.phone || '',
    customerAddress: customerAddress || customer.address || '',
    providerId: providerId,
    providerName: provider.name || providerName || 'Provider',
    providerPhone: provider.phone || '',
    serviceId: serviceId || null,
    serviceTitle: jobRequest?.title || (service ? service.title : serviceTitle) || 'Hợp đồng dịch vụ',
    ...(jobRequest ? { jobId: jobRequest.id } : {}),
    price: priceNum,
    priceFormatted: priceNum.toLocaleString('vi-VN') + 'đ',
    platformFee: platformFee,
    escrowDeposit: escrowDeposit,
    escrowStatus: 'escrow_held', // Funds securely locked in Escrow vault
    paymentStatus: 'paid',        // Paid via wallet balance
    paidAt: now.toISOString(),
    paymentRef: txnId,
    orderStatus: jobRequest ? 'processing' : 'pending', // Provider already confirmed job requests before escrow.
    paymentMethod: paymentMethod || 'Số dư ví SkillRental (Escrow)',
    date: dateStr,
    deadline: deadline || '7 ngày sau đặt cọc',
    scheduledDate: scheduledDate || '',
    scheduledTime: scheduledTime || '',
    notes: notes || '',
    milestones: [
      { title: 'Ký quỹ Escrow bảo vệ 100% thành công', done: true, time: dateStr },
      { title: 'Provider tiếp nhận yêu cầu & triển khai công việc', done: Boolean(jobRequest), time: jobRequest ? dateStr : 'Chờ tiếp nhận' },
      { title: 'Bàn giao sản phẩm / hoàn thành dịch vụ', done: false, time: 'Chờ bàn giao' },
      { title: 'Khách hàng nghiệm thu & Giải ngân Escrow', done: false, time: 'Chờ nghiệm thu' }
    ]
  };

  orders.unshift(newOrder);
  db.saveCollection('orders', orders);

  if (jobRequest) {
    jobRequest.selectedProviderId = providerId;
    (jobRequest.applicants || []).forEach(applicant => {
      if (applicant.providerId !== providerId) {
        if (applicant.status === 'pending' || applicant.status === 'selected') {
          applicant.status = 'rejected';
          notifyProvider(applicant.providerId, 'Yêu cầu tuyển dụng đã có chuyên gia',
            `Yêu cầu “${jobRequest.title}” đã được khách hàng giao cho một chuyên gia khác. Cảm ơn bạn đã quan tâm và gửi báo giá.`,
            'info', '/jobs.html?tab=tab-uc36');
        }
      } else {
        applicant.status = 'accepted';
      }
    });
    jobRequest.status = 'closed';
    jobRequest.closeReason = 'provider_selected';
    jobRequest.paymentOrderId = newId;
    jobRequest.statusUpdatedAt = new Date().toISOString();
    db.saveCollection('jobRequests', db.getCollection('jobRequests').map(j => j.id === jobRequest.id ? jobRequest : j));
  }

  // Add Wallet Transaction for Escrow
  const transactions = db.getCollection('walletTransactions') || [];
  transactions.unshift({
    id: txnId,
    userId: req.authUser.id,
    userName: customer.name || req.authUser.name || 'Khách hàng',
    type: 'escrow',
    amount: -escrowDeposit,
    status: 'completed',
    createdAt: dateStr,
    createdAtISO: now.toISOString(),
    description: `Ký quỹ Escrow cho đơn hàng ${newId} (Trừ từ số dư ví)`,
    orderIds: [newId],
    balanceAfter: newBalance
  });
  db.saveCollection('walletTransactions', transactions);

  createNotification(req.authUser.id, jobRequest ? 'Đã ký quỹ, đơn hàng bắt đầu' : 'Đơn hàng đã được tạo',
    jobRequest
      ? `Đơn ${newId} cho yêu cầu “${jobRequest.title}” đã được ký quỹ ${newOrder.escrowDeposit.toLocaleString('vi-VN')}đ và Provider có thể bắt đầu thực hiện.`
      : `Đơn ${newId} đã được tạo và ký quỹ ${newOrder.escrowDeposit.toLocaleString('vi-VN')}đ. Đang chờ Provider tiếp nhận.`,
    'success', `/customer_orders.html?orderId=${encodeURIComponent(newId)}`);

  // Notify Provider
  notifyProvider(
    providerId,
    jobRequest ? 'Ký quỹ hoàn tất - Bắt đầu dự án' : 'Đơn hàng mới',
    jobRequest
      ? `Khách hàng ${req.authUser.name} đã ký quỹ ${newOrder.priceFormatted} cho yêu cầu “${jobRequest.title}”. Dự án đã chuyển sang mục Đặt lịch & Tiến độ để bạn bắt đầu thực hiện.`
      : `Bạn có một yêu cầu dịch vụ mới từ ${req.authUser.name} với giá trị ${newOrder.priceFormatted}. Đã ký quỹ Escrow an toàn.`,
    'success',
    jobRequest ? `/bookings.html?tab=tab-uc39&orderId=${encodeURIComponent(newId)}` : `/bookings.html?orderId=${encodeURIComponent(newId)}`
  );

  res.status(201).json({
    success: true,
    message: 'Tạo đơn đặt lịch & Ký quỹ Escrow thành công! Tiền được bảo vệ an toàn 100% tại sàn.',
    order: newOrder
  });
});

// Provider accepts the order
router.put('/:id/accept', requireRole('Provider'), (req, res) => {
  try {
    const order = processAcceptOrder(req.params.id, req.authUser.id);
    res.json({ success: true, message: 'Đã tiếp nhận đơn hàng!', order });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, message: err.message });
  }
});

// Provider delivers the order
router.put('/:id/deliver', requireRole('Provider'), (req, res) => {
  try {
    const order = processDeliverOrder(req.params.id, req.authUser.id);
    res.json({ success: true, message: 'Đã bàn giao đơn hàng!', order });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, message: err.message });
  }
});

// Provider updates progress
router.put('/:id/progress', requireRole('Provider'), (req, res) => {
  try {
    const order = processProgressOrder(req.params.id, req.authUser.id, req.body.note || '');
    res.json({ success: true, message: 'Đã cập nhật tiến độ!', order });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, message: err.message });
  }
});

// For Admin to force status change (legacy support if needed)
router.put('/:id/status', requireRole('Admin'), (req, res) => {
  const { status } = req.body;
  const orders = db.getCollection('orders');
  const order = orders.find(o => o.id === req.params.id);

  if (!order) {
    return res.status(404).json({ success: false, message: 'Đơn hàng không tồn tại!' });
  }

  if (status) {
    order.orderStatus = status;
  }

  db.saveCollection('orders', orders);

  res.json({
    success: true,
    message: 'Cập nhật trạng thái đơn hàng thành công!',
    order
  });
});

// Customer releases Escrow funds to Provider
router.put('/:id/release-escrow', requireCustomer, (req, res) => {
  try {
    const order = processReleaseEscrow(req.params.id, { customerId: req.authUser.id });
    res.json({
      success: true,
      message: `Đã nghiệm thu thành công! Số tiền ${order.priceFormatted || order.price} đã được giải ngân an toàn vào ví Provider.`,
      order
    });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, message: err.message });
  }
});

// Customer gửi yêu cầu hủy đơn (hoặc hủy thẳng nếu chưa thanh toán / chưa tiếp nhận)
router.put('/:id/cancel', requireSignedIn, (req, res) => {
  try {
    const order = processCancelOrder(req.params.id, req.authUser.id, req.authUser.role, req.body.reason);
    let message;
    if (order.orderStatus === 'cancel_requested') {
      message = 'Đã gửi yêu cầu hủy đến Provider. Đơn tạm dừng trong khi chờ phản hồi. Tiền ký quỹ vẫn được giữ an toàn.';
    } else if (order.paymentStatus === 'cancelled') {
      message = 'Đơn hàng chờ thanh toán đã được hủy. Không có khoản tiền nào bị trừ.';
    } else {
      message = 'Đơn hàng đã được hủy. Tiền ký quỹ đã hoàn vào ví khách hàng.';
    }
    res.json({ success: true, message, order });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, message: err.message });
  }
});

// Provider phản hồi yêu cầu hủy: chấp thuận (hoàn 100%) hoặc từ chối (→ Admin phân xử)
// Body: { decision: 'approve' | 'reject', note: string }
router.put('/:id/cancel-respond', requireRole('Provider'), (req, res) => {
  const { decision, note } = req.body;
  if (!decision) {
    return res.status(400).json({ success: false, message: 'Thiếu trường "decision" (approve | reject).' });
  }
  try {
    const order = processRespondCancelRequest(req.params.id, req.authUser.id, decision, note);
    const message = decision === 'approve'
      ? 'Đã chấp thuận yêu cầu hủy. Đơn hàng kết thúc và tiền ký quỹ hoàn 100% cho khách.'
      : 'Đã từ chối yêu cầu hủy. Đơn hàng chuyển Admin phân xử — tiền ký quỹ vẫn được giữ nguyên.';
    res.json({ success: true, message, order });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, message: err.message });
  }
});

router.put('/:id/undo-cancel', requireCustomer, (req, res) => {
  try {
    const order = processUndoCancelOrder(req.params.id, req.authUser.id);
    res.json({ success: true, message: 'Đã hoàn tác hủy đơn và khôi phục đơn hàng.', order });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, message: err.message });
  }
});

// Pay pending order using customer wallet balance
router.post('/:id/pay-with-balance', requireCustomer, (req, res) => {
  try {
    const result = payOrderWithBalance({
      orderId: req.params.id,
      customerId: req.authUser.id
    });
    res.json({
      success: true,
      message: `Ký quỹ thành công! Số tiền ${result.order.priceFormatted || result.order.price} đã được chuyển vào quỹ Escrow bảo vệ an toàn 100%.`,
      order: result.order,
      newBalance: result.newBalance
    });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, message: err.message });
  }
});

module.exports = router;
