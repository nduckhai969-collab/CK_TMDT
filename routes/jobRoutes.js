const express = require('express');
const router = express.Router();
const db = require('../data/db');

// List job requests
router.get('/', (req, res) => {
  const { customerId, category, status } = req.query;
  let jobs = db.getCollection('jobRequests');

  if (customerId) {
    jobs = jobs.filter(j => j.customerId === customerId);
  }
  if (category && category !== 'all') {
    jobs = jobs.filter(j => j.category.toLowerCase() === category.toLowerCase());
  }
  if (status) {
    jobs = jobs.filter(j => j.status === status);
  }

  res.json({
    success: true,
    total: jobs.length,
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
router.post('/', (req, res) => {
  const { title, category, budget, budgetNum, deadline, location, desc, customerId, customerName } = req.body;

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
    customerId: customerId || 'USR003',
    customerName: customerName || 'Lê Hoàng Long',
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

// Provider applies to job request
router.post('/:id/apply', (req, res) => {
  const { providerId, providerName, specialty, avatar, proposedPrice, proposalText } = req.body;
  const jobs = db.getCollection('jobRequests');
  const job = jobs.find(j => j.id === req.params.id);

  if (!job) {
    return res.status(404).json({ success: false, message: 'Yêu cầu không tồn tại!' });
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
router.post('/:id/accept-applicant', (req, res) => {
  const { providerId } = req.body;
  const jobs = db.getCollection('jobRequests');
  const job = jobs.find(j => j.id === req.params.id);

  if (!job) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy yêu cầu tuyển dụng!' });
  }

  const applicant = (job.applicants || []).find(a => a.providerId === providerId);
  if (!applicant) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy ứng viên này!' });
  }

  applicant.status = 'accepted';
  job.status = 'closed';
  db.saveCollection('jobRequests', jobs);

  res.json({
    success: true,
    message: `Đã chọn ứng viên ${applicant.providerName}! Vui lòng tiến hành thanh toán ký quỹ Escrow.`,
    applicant,
    job
  });
});

module.exports = router;
