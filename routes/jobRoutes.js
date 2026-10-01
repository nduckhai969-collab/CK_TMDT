const express = require('express');
const router = express.Router();
const db = require('../data/db');
const { requireCustomer } = require('./customerAuth');

// List job requests
router.get('/', (req, res, next) => req.query.customerId ? requireCustomer(req, res, next) : next(), (req, res) => {
  const { customerId, category, status, search, limit } = req.query;
  let jobs = db.getCollection('jobRequests') || [];

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

// Single job request detail
router.get('/:id', (req, res) => {
  const jobs = db.getCollection('jobRequests');
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
router.post('/', requireCustomer, (req, res) => {
  const { title, category, budget, budgetNum, deadline, location, desc } = req.body;

  if (!title || !category || (!budget && !budgetNum)) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập đầy đủ tiêu đề, danh mục và ngân sách!' });
  }

  const jobs = db.getCollection('jobRequests');
  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const newId = `JOB-${now.getFullYear()}-${String(jobs.length + 1).padStart(2, '0')}`;

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
  db.saveCollection('jobRequests', jobs);

  res.status(201).json({
    success: true,
    message: 'Đăng yêu cầu tuyển dụng thành công!',
    job: newJob
  });
});

// Customer updates an open request they own.
router.patch('/:id', requireCustomer, (req, res) => {
  const jobs = db.getCollection('jobRequests') || [];
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
  db.saveCollection('jobRequests', jobs);
  res.json({ success: true, message: 'Đã cập nhật yêu cầu.', job });
});

// Customer can pause or reopen a request until a provider is selected.
router.patch('/:id/status', requireCustomer, (req, res) => {
  const jobs = db.getCollection('jobRequests') || [];
  const job = jobs.find(item => item.id === req.params.id);
  if (!job) return res.status(404).json({ success: false, message: 'Không tìm thấy yêu cầu.' });
  if (job.customerId !== req.authUser.id) {
    return res.status(403).json({ success: false, message: 'Bạn không có quyền quản lý yêu cầu này.' });
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
  db.saveCollection('jobRequests', jobs);
  res.json({ success: true, message: status === 'closed' ? 'Đã đóng yêu cầu, chuyên gia không thể gửi thêm đề xuất.' : 'Đã mở lại yêu cầu.', job });
});

// Provider applies to job request
router.post('/:id/apply', (req, res) => {
  const { providerId, providerName, specialty, avatar, proposedPrice, proposalText } = req.body;
  const jobs = db.getCollection('jobRequests');
  const job = jobs.find(j => j.id === req.params.id);

  if (!job) {
    return res.status(404).json({ success: false, message: 'Yêu cầu không tồn tại!' });
  }

  if (job.status !== 'open') {
    return res.status(400).json({ success: false, message: 'Yêu cầu này đã đóng, hiện không nhận thêm đề xuất.' });
  }

  const existing = (job.applicants || []).find(a => a.providerId === providerId);
  if (existing) {
    return res.status(400).json({ success: false, message: 'Bạn đã gửi đề xuất ứng tuyển cho yêu cầu này rồi!' });
  }

  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const applicant = {
    providerId: providerId || 'PRV001',
    providerName: providerName || 'Nguyễn Văn An',
    specialty: specialty || 'Chuyên gia Freelancer',
    avatar: avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100',
    proposedPrice: proposedPrice || job.budget,
    appliedAt: dateStr,
    proposalText: proposalText || 'Chào bạn, tôi rất tự tin hoàn thành tốt dự án này đúng tiến độ.',
    status: 'pending'
  };

  job.applicants = job.applicants || [];
  job.applicants.push(applicant);
  db.saveCollection('jobRequests', jobs);

  res.status(201).json({
    success: true,
    message: 'Gửi đề xuất ứng tuyển thành công!',
    applicant
  });
});

// Customer accepts an applicant -> creates order with escrow
router.post('/:id/accept-applicant', requireCustomer, (req, res) => {
  const { providerId } = req.body;
  const jobs = db.getCollection('jobRequests');
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

  const applicant = (job.applicants || []).find(a => a.providerId === providerId);
  if (!applicant) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy ứng viên này!' });
  }

  applicant.status = 'accepted';
  job.status = 'closed';
  job.closeReason = 'provider_selected';
  job.statusUpdatedAt = new Date().toISOString();
  db.saveCollection('jobRequests', jobs);

  res.json({
    success: true,
    message: `Đã chọn ứng viên ${applicant.providerName}! Vui lòng tiến hành thanh toán ký quỹ Escrow.`,
    applicant,
    job
  });
});

module.exports = router;
