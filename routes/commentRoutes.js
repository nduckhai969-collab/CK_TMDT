const express = require('express');
const router = express.Router();
const db = require('../data/db');
const { requireSignedIn } = require('./customerAuth');

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
router.post('/', requireSignedIn, (req, res) => {
  const { targetType, targetId, content, parentId } = req.body;
  if (!targetType || !targetId || !content) {
    return res.status(400).json({ success: false, message: 'Thiếu thông tin bắt buộc.' });
  }

  const comments = db.getCollection('comments') || [];
  
  if (parentId) {
    const parentComment = comments.find(c => c.id === parentId);
    if (!parentComment) {
      return res.status(404).json({ success: false, message: 'Bình luận gốc không tồn tại.' });
    }
    
    // Check reply permission
    if (targetType === 'service') {
      const services = db.getCollection('services') || [];
      const service = services.find(s => s.id === targetId);
      const providers = db.getCollection('providers') || [];
      const serviceProvider = service ? providers.find(p => p.id === service.providerId) : null;
      
      const isServiceProvider = serviceProvider && serviceProvider.userId === req.authUser.id;
      const isParentAuthor = parentComment.userId === req.authUser.id;
      
      if (!isServiceProvider && !isParentAuthor) {
        return res.status(403).json({ success: false, message: 'Chỉ chủ dịch vụ hoặc tác giả bình luận gốc mới được phản hồi.' });
      }
    }
  }

  const newId = `CMT${String(comments.length + 1).padStart(4, '0')}-${Date.now()}`;
  const newComment = {
    id: newId,
    targetType,
    targetId,
    userId: req.authUser.id,
    userName: req.authUser.name,
    content: content.trim(),
    parentId: parentId || null,
    status: 'active',
    createdAt: new Date().toISOString()
  };

  comments.push(newComment);
  db.saveCollection('comments', comments);

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
