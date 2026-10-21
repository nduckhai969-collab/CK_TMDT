const express = require('express');
const router = express.Router();
const db = require('../data/db');
const { requireCustomer, requireProvider } = require('./customerAuth');
const { generateId } = require('../utils/id');
const { createNotification, notifyProvider } = require('../services/notificationService');

async function persistJobs(jobs, res) {
  try {
    await db.saveCollectionAndWait('jobRequests', jobs);
    return true;
  } catch (err) {
    console.error('[jobs] Không lưu được yêu cầu:', err.message);
    res.status(503).json({ success: false, message: 'Chưa lưu được thay đổi lên hệ thống. Vui lòng thử lại.' });
    return false;
  }
}

function getProviderProfile(user) {
  const providers = db.getCollection('providers') || [];
  let provider = providers.find(p => p.userId === user.id);
  if (!provider && process.env.NODE_ENV !== 'production') {
    provider = {
      id: generateId('PRV'),
      userId: user.id,
      name: user.name || user.email || 'Provider thử nghiệm',
      specialty: 'Chuyên gia Freelancer',
      category: 'Other',
      rating: 0,
      reviewCount: 0,
      completedOrders: 0,
      verified: false,
      avatar: user.avatar || '',
      availabilityStatus: 'ready'
    };
    providers.push(provider);
    db.saveCollection('providers', providers);
  }
  return provider || null;
}

// List job requests
router.get('/', (req, res, next) => (req.query.customerId || req.query.mine === '1') ? requireCustomer(req, res, next) : next(), async (req, res) => {
  const { customerId, category, status, search, limit } = req.query;
  let jobs = await db.getCollectionFresh('jobRequests');

  // Public marketplace only exposes requests that are still accepting proposals.
  if (!req.query.mine && !customerId) jobs = jobs.filter(j => j.status === 'open');

  if (req.query.mine === '1') {
    jobs = jobs.filter(j => j.customerId === req.authUser.id);
  }
  if (customerId) {
    if (customerId !== req.authUser.id) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền xem yêu cầu của tài khoản khác.' });
    }
    jobs = jobs.filter(j => j.customerId === customerId);
  }
  if (category && category !== 'all') {
    jobs = jobs.filter(j => j.category && j.category.toLowerCase() === category.toLowerCase());
  }
  if (status) {
    jobs = jobs.filter(j => j.status === status);
  }
  if (search) {
    const q = search.toLowerCase().trim();
    jobs = jobs.filter(j =>
      (j.title && j.title.toLowerCase().includes(q)) ||
      (j.desc && j.desc.toLowerCase().includes(q)) ||
      (j.tags && j.tags.some(t => t.toLowerCase().includes(q)))
    );
  }

  const total = jobs.length;
  if (limit && !isNaN(limit)) {
    jobs = jobs.slice(0, Number(limit));
  }

  res.json({
    success: true,
    total,
    jobs
  });
});

// Provider xem các yêu cầu khách đã chọn mình và đang chờ xác nhận.
router.get('/provider/selected', requireProvider, async (req, res) => {
  const provider = getProviderProfile(req.authUser);
  if (!provider) return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ Provider.' });
  const jobs = (await db.getCollectionFresh('jobRequests')).filter(job =>
    job.status === 'awaiting_provider' && (job.applicants || []).some(a => a.providerId === provider.id && a.status === 'selected')
  );
  res.json({ success: true, jobs });
});

// Provider xem các báo giá mình đã gửi, lấy trực tiếp từ yêu cầu trong database.
router.get('/provider/applications', requireProvider, async (req, res) => {
  const provider = getProviderProfile(req.authUser);
  if (!provider) return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ Provider.' });
  const applications = (await db.getCollectionFresh('jobRequests')).flatMap(job =>
    (job.applicants || [])
      .filter(applicant => applicant.providerId === provider.id)
      .map(applicant => ({
        jobId: job.id,
        title: job.title,
        customerName: job.customerName || 'Khách hàng',
        budget: job.budget,
        createdAt: applicant.appliedAt || applicant.createdAt || job.createdAt,
        status: applicant.status || 'pending',
        ...applicant
      }))
  );
  res.json({ success: true, applications });
});

// Single job request detail
router.get('/:id', async (req, res) => {
  const jobs = await db.getCollectionFresh('jobRequests');
  const job = jobs.find(j => j.id === req.params.id);

  if (!job) {
    return res.status(404).json({ success: false, message: 'Yêu cầu tuyển dụng không tồn tại!' });
  }

  res.json({
    success: true,
    job
  });
});

// Customer creates new job request
router.post('/', requireCustomer, async (req, res) => {
  const { title, category, budget, budgetNum, deadline, location, desc } = req.body;

  if (!title || !category || (!budget && !budgetNum)) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập đầy đủ tiêu đề, danh mục và ngân sách!' });
  }

  const jobs = await db.getCollectionFresh('jobRequests');
  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  let newId;
  do {
    newId = generateId('JOB');
  } while (jobs.some(job => job.id === newId));

  const num = Number(budgetNum || String(budget).replace(/[^0-9]/g, '')) || 0;
  const formattedBudget = num.toLocaleString('vi-VN') + 'đ';

  const newJob = {
    id: newId,
    customerId: req.authUser.id,
    customerName: req.authUser.name,
    title: title.trim(),
    category,
    budget: formattedBudget,
    budgetNum: num,
    deadline: deadline || 'Thỏa thuận',
    location: location || 'Toàn quốc / Online',
    status: 'open',
    createdAt: dateStr,
    desc: desc || '',
    applicants: []
  };

  jobs.unshift(newJob);
  try {
    await db.saveCollectionAndWait('jobRequests', jobs);
  } catch (err) {
    console.error('[jobs] Không lưu được yêu cầu mới:', err.message);
    return res.status(503).json({ success: false, message: 'Chưa lưu được yêu cầu lên hệ thống. Vui lòng thử lại.' });
  }

  createNotification(req.authUser.id, 'Yêu cầu đã được đăng',
    `Yêu cầu “${newJob.title}” đang mở để Provider gửi báo giá. Bạn sẽ nhận thông báo khi có người ứng tuyển.`,
    'success', `/customer_requests.html?jobId=${encodeURIComponent(newJob.id)}`);

  res.status(201).json({
    success: true,
    message: 'Đăng yêu cầu tuyển dụng thành công!',
    job: newJob
  });
});

// Customer updates an open request they own.
router.patch('/:id', requireCustomer, async (req, res) => {
  const jobs = await db.getCollectionFresh('jobRequests');
  const job = jobs.find(item => item.id === req.params.id);
  if (!job) return res.status(404).json({ success: false, message: 'Không tìm thấy yêu cầu.' });
  if (job.customerId !== req.authUser.id) {
    return res.status(403).json({ success: false, message: 'Bạn không có quyền chỉnh sửa yêu cầu này.' });
  }
  if (job.status !== 'open') {
    return res.status(400).json({ success: false, message: 'Yêu cầu đã chốt, không thể chỉnh sửa.' });
  }

  const { title, category, budgetNum, deadline, location, desc } = req.body;
  if (!String(title || '').trim() || !category || !Number.isFinite(Number(budgetNum)) || Number(budgetNum) <= 0 || !String(desc || '').trim()) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập tiêu đề, lĩnh vực, ngân sách hợp lệ và mô tả.' });
  }

  const amount = Number(budgetNum);
  Object.assign(job, {
    title: String(title).trim(),
    category,
    budgetNum: amount,
    budget: amount.toLocaleString('vi-VN') + 'đ',
    deadline: deadline || 'Thỏa thuận',
    location: location || 'Toàn quốc / Online',
    desc: String(desc).trim(),
    updatedAt: new Date().toISOString()
  });
  if (!await persistJobs(jobs, res)) return;
  res.json({ success: true, message: 'Đã cập nhật yêu cầu.', job });
});

// Customer can pause or reopen a request until a provider is selected.
router.patch('/:id/status', requireCustomer, async (req, res) => {
  const jobs = await db.getCollectionFresh('jobRequests');
  const job = jobs.find(item => item.id === req.params.id);
  if (!job) return res.status(404).json({ success: false, message: 'Không tìm thấy yêu cầu.' });
  if (job.customerId !== req.authUser.id) {
    return res.status(403).json({ success: false, message: 'Bạn không có quyền quản lý yêu cầu này.' });
  }

  if (['awaiting_provider', 'awaiting_payment'].includes(job.status)) {
    return res.status(409).json({ success: false, message: 'Đang chờ Provider xác nhận hoặc khách ký quỹ; chưa thể đóng/mở yêu cầu.' });
  }

  const { status } = req.body;
  if (!['open', 'closed'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Trạng thái yêu cầu không hợp lệ.' });
  }
  const hasAcceptedProvider = (job.applicants || []).some(applicant => applicant.status === 'accepted');
  if (hasAcceptedProvider || job.closeReason === 'provider_selected') {
    return res.status(400).json({ success: false, message: 'Yêu cầu đã chốt chuyên gia nên không thể đóng hoặc mở lại.' });
  }

  job.status = status;
  job.closeReason = status === 'closed' ? 'customer' : null;
  job.statusUpdatedAt = new Date().toISOString();
  if (!await persistJobs(jobs, res)) return;
  res.json({ success: true, message: status === 'closed' ? 'Đã đóng yêu cầu, chuyên gia không thể gửi thêm đề xuất.' : 'Đã mở lại yêu cầu.', job });
});

// Provider applies to job request
router.post('/:id/apply', requireProvider, async (req, res) => {
  const { proposedPrice, proposalText, estimatedDays } = req.body;
  const quote = Number(String(proposedPrice || '').replace(/[^0-9]/g, ''));
  if (!Number.isFinite(quote) || quote <= 0) {
    return res.status(400).json({ success: false, message: 'Vui lòng gửi báo giá hợp lệ.' });
  }
  const provider = getProviderProfile(req.authUser);
  if (!provider) return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ Provider.' });
  const jobs = await db.getCollectionFresh('jobRequests');
  const job = jobs.find(j => j.id === req.params.id);

  if (!job) {
    return res.status(404).json({ success: false, message: 'Yêu cầu không tồn tại!' });
  }

  if (job.status !== 'open') {
    return res.status(400).json({ success: false, message: 'Yêu cầu này đã đóng, hiện không nhận thêm đề xuất.' });
  }

  const existing = (job.applicants || []).find(a => a.providerId === provider.id);
  if (existing) {
    return res.status(400).json({ success: false, message: 'Bạn đã gửi đề xuất ứng tuyển cho yêu cầu này rồi!' });
  }

  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const applicant = {
    providerId: provider.id,
    providerName: provider.name || req.authUser.name,
    specialty: provider.specialty || 'Chuyên gia Freelancer',
    avatar: provider.avatar || req.authUser.avatar || '',
    proposedPrice: quote.toLocaleString('vi-VN') + 'đ',
    proposedPriceNum: quote,
    estimatedDays: Number(estimatedDays) > 0 ? Number(estimatedDays) : null,
    appliedAt: dateStr,
    proposalText: proposalText || 'Chào bạn, tôi rất tự tin hoàn thành tốt dự án này đúng tiến độ.',
    status: 'pending'
  };

  job.applicants = job.applicants || [];
  job.applicants.push(applicant);
  if (!await persistJobs(jobs, res)) return;
  createNotification(job.customerId, 'Có Provider mới ứng tuyển',
    `${applicant.providerName} đã gửi báo giá ${applicant.proposedPrice} cho yêu cầu “${job.title}”. Mở danh sách ứng viên để xem hồ sơ và lựa chọn.`,
    'info', `/customer_requests.html?jobId=${encodeURIComponent(job.id)}`);

  res.status(201).json({
    success: true,
    message: 'Gửi đề xuất ứng tuyển thành công!',
    applicant
  });
});

// Customer selects an applicant. No order or payment is created until Provider confirms.
router.post('/:id/accept-applicant', requireCustomer, async (req, res) => {
  const { providerId } = req.body;
  const jobs = await db.getCollectionFresh('jobRequests');
  const job = jobs.find(j => j.id === req.params.id);

  if (!job) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy yêu cầu tuyển dụng!' });
  }

  if (job.customerId !== req.authUser.id) {
    return res.status(403).json({ success: false, message: 'Bạn không có quyền quản lý yêu cầu này.' });
  }

  if (job.status !== 'open') {
    return res.status(400).json({ success: false, message: 'Yêu cầu này đã được đóng hoặc chốt chuyên gia.' });
  }

  const applicant = (job.applicants || []).find(a => a.providerId === providerId && a.status === 'pending');
  if (!applicant) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy ứng viên này!' });
  }

  applicant.status = 'selected';
  job.status = 'awaiting_provider';
  job.selectedProviderId = applicant.providerId;
  job.statusUpdatedAt = new Date().toISOString();
  if (!await persistJobs(jobs, res)) return;
  createNotification(job.customerId, 'Đang chờ Provider xác nhận',
    `Bạn đã chọn ${applicant.providerName} cho yêu cầu “${job.title}”. Chưa có khoản tiền nào bị trừ; Provider cần xác nhận trước khi bạn ký quỹ.`,
    'info', `/customer_requests.html?jobId=${encodeURIComponent(job.id)}`);
  notifyProvider(applicant.providerId, 'Khách hàng chọn báo giá của bạn',
    `Khách hàng đã chọn bạn cho yêu cầu “${job.title}”. Vui lòng xác nhận hoặc từ chối trước khi khách ký quỹ.`, 'info', '/jobs.html?tab=selected');

  res.json({
    success: true,
    message: `Đã gửi lời mời cho ${applicant.providerName}. Chờ Provider xác nhận; bạn chưa bị trừ tiền.`,
    applicant,
    job
  });
});

// Provider confirms or declines the customer's selection. Payment starts only after confirmation.
router.post('/:id/provider-response', requireProvider, async (req, res) => {
  const { action } = req.body || {};
  if (!['confirm', 'decline'].includes(action)) {
    return res.status(400).json({ success: false, message: 'Phản hồi không hợp lệ.' });
  }
  const provider = getProviderProfile(req.authUser);
  if (!provider) return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ Provider.' });
  const jobs = await db.getCollectionFresh('jobRequests');
  const job = jobs.find(item => item.id === req.params.id);
  if (!job) return res.status(404).json({ success: false, message: 'Không tìm thấy yêu cầu.' });
  if (job.status !== 'awaiting_provider' || job.selectedProviderId !== provider.id) {
    return res.status(409).json({ success: false, message: 'Yêu cầu này không còn chờ bạn xác nhận.' });
  }
  const applicant = (job.applicants || []).find(a => a.providerId === provider.id && a.status === 'selected');
  if (!applicant) return res.status(404).json({ success: false, message: 'Không tìm thấy lời mời ứng tuyển.' });

  if (action === 'confirm') {
    applicant.status = 'accepted';
    job.status = 'awaiting_payment';
    job.statusUpdatedAt = new Date().toISOString();
    createNotification(job.customerId, 'Provider đã xác nhận',
      `${applicant.providerName} đã nhận yêu cầu “${job.title}”. Vui lòng thanh toán ký quỹ để bắt đầu.`,
      'success', `/customer_requests.html?jobId=${encodeURIComponent(job.id)}&action=pay`);
    if (!await persistJobs(jobs, res)) return;
    return res.json({ success: true, message: 'Đã xác nhận nhận việc. Khách hàng sẽ được mời ký quỹ.', job });
  }

  applicant.status = 'declined';
  job.status = 'open';
  delete job.selectedProviderId;
  job.statusUpdatedAt = new Date().toISOString();
  createNotification(job.customerId, 'Provider từ chối yêu cầu',
    `${applicant.providerName} chưa thể nhận yêu cầu “${job.title}”. Bạn có thể chọn ứng viên khác.`, 'warning', '/customer_requests.html');
  if (!await persistJobs(jobs, res)) return;
  return res.json({ success: true, message: 'Đã từ chối lời mời. Yêu cầu được mở lại để khách chọn Provider khác.', job });
});

module.exports = router;
