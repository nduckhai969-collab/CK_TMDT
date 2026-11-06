const express = require('express');
const router = express.Router();
const db = require('../data/db');
const { requireSignedIn } = require('./customerAuth');
const { notifyProvider } = require('../services/notificationService');

// List comments
router.get('/', (req, res) => {
  const { targetType, targetId } = req.query;
  if (!targetType || !targetId) {
    return res.status(400).json({ success: false, message: 'Thiếu targetType hoặc targetId' });
  }

  const comments = (db.getCollection('comments') || []).filter(
    c => c.targetType === targetType && c.targetId === targetId && c.status !== 'hidden'
  );

  res.json({
    success: true,
    total: comments.length,
    comments: comments.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
  });
});

// Create a comment
router.post('/', requireSignedIn, async (req, res) => {
  const { targetType, targetId, content, parentId } = req.body;
  const cleanContent = typeof content === 'string' ? content.trim() : '';
  if (!['service', 'post'].includes(targetType) || !targetId || !cleanContent) {
    return res.status(400).json({ success: false, message: 'Thiếu thông tin bắt buộc.' });
  }
  if (cleanContent.length > 1500) {
    return res.status(400).json({ success: false, message: 'Bình luận không được vượt quá 1.500 ký tự.' });
  }

  const comments = db.getCollection('comments') || [];
  let providerId, targetTitle;
  if (targetType === 'service') {
    const service = (db.getCollection('services') || []).find(item => item.id === targetId);
    if (!service) return res.status(404).json({ success: false, message: 'Không tìm thấy dịch vụ.' });
    providerId = service.providerId;
    targetTitle = service.title || service.name || '';
  } else {
    try {
      const post = (await db.getCollectionFresh('posts')).find(item => item.id === targetId);
      if (!post) return res.status(404).json({ success: false, message: 'Không tìm thấy bài viết.' });
      providerId = post.providerId;
      targetTitle = post.title || '';
    } catch (error) {
      return res.status(503).json({ success: false, message: 'Chưa xác minh được bài viết. Vui lòng thử lại.' });
    }
  }
  
  if (parentId) {
    const parentComment = comments.find(c => c.id === parentId && c.targetType === targetType && c.targetId === targetId && c.status !== 'hidden');
    if (!parentComment) {
      return res.status(404).json({ success: false, message: 'Bình luận gốc không tồn tại.' });
    }
    
    // Check reply permission
    const providers = await db.getCollectionFresh('providers');
    const serviceProvider = providers.find(p => p.id === providerId || p.userId === providerId);
    const providerAccountIds = [
      req.authUser.id,
      req.authUser.uid,
      req.authUser.providerId,
      ].filter(Boolean);
    const isSameEmail = serviceProvider && req.authUser.email && serviceProvider.email &&
      serviceProvider.email.toLowerCase() === req.authUser.email.toLowerCase();
    const isServiceProvider = serviceProvider && (
      providerAccountIds.includes(serviceProvider.id) ||
      providerAccountIds.some(id => [serviceProvider.userId, serviceProvider.uid].includes(id)) ||
      isSameEmail
    );
    const isParentAuthor = parentComment.userId === req.authUser.id;
    const isAdmin = req.authUser.role === 'Admin';
    if (!isServiceProvider && !isParentAuthor && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Chỉ chủ Provider của bài viết hoặc tác giả bình luận mới được phản hồi.' });
    }
  }

  const newId = `CMT${String(comments.length + 1).padStart(4, '0')}-${Date.now()}`;
  const newComment = {
    id: newId,
    targetType,
    targetId,
    userId: req.authUser.id,
    userName: req.authUser.name,
    content: cleanContent,
    targetTitle,
    parentId: parentId || null,
    status: 'active',
    createdAt: new Date().toISOString()
  };

  comments.push(newComment);
  db.saveCollection('comments', comments);
  if (!parentId) {
    const targetLabel = targetType === 'post' ? `bài viết “${targetTitle}”` : `dịch vụ ${targetTitle}`;
    notifyProvider(providerId, 'Bình luận mới', `${req.authUser.name || 'Người dùng'} đã bình luận về ${targetLabel}.`, 'info', targetType === 'post' ? `/customer_provider.html?id=${encodeURIComponent(providerId)}` : '');
  }

  res.status(201).json({ success: true, message: 'Đã gửi bình luận.', comment: newComment });
});

// Delete (hide) a comment
router.delete('/:id', requireSignedIn, (req, res) => {
  const comments = db.getCollection('comments') || [];
  const commentIndex = comments.findIndex(c => c.id === req.params.id);
  
  if (commentIndex === -1) {
    return res.status(404).json({ success: false, message: 'Bình luận không tồn tại.' });
  }

  const comment = comments[commentIndex];
  
  if (comment.userId !== req.authUser.id && req.authUser.role !== 'Admin') {
    return res.status(403).json({ success: false, message: 'Không có quyền xóa bình luận này.' });
  }

  comment.status = 'hidden';
  db.saveCollection('comments', comments);

  res.json({ success: true, message: 'Đã xóa bình luận.' });
});

module.exports = router;
