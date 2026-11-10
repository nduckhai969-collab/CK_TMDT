const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const baseUploadDir = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads'));

// Hàm sinh thư mục dạng: uploads/disputes/YYYY-MM
function getDisputeFolderPath() {
  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const targetDir = path.join(baseUploadDir, 'disputes', yearMonth);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  return { targetDir, yearMonth };
}

// Cấu hình Multer Disk Storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    try {
      const { targetDir } = getDisputeFolderPath();
      cb(null, targetDir);
    } catch (err) {
      cb(err);
    }
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const rand = crypto.randomBytes(6).toString('hex');
    const filename = `evidence-${rand}-${Date.now()}${ext}`;
    cb(null, filename);
  }
});

// Kiểm tra loại file (chỉ cho phép jpeg, jpg, png, webp)
const fileFilter = function (req, file, cb) {
  const allowedExts = ['.jpg', '.jpeg', '.png', '.webp'];
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];

  if (allowedExts.includes(ext) && allowedMimes.includes(file.mimetype.toLowerCase())) {
    cb(null, true);
  } else {
    cb(new Error('Loại file không được hỗ trợ! Chỉ chấp nhận ảnh JPG, PNG hoặc WEBP.'), false);
  }
};

// Cấu hình Multer: tối đa 5 file, mỗi file tối đa 5MB
const disputeUpload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 5 // Tối đa 5 file
  }
});

/**
 * Xóa file vật lý khỏi ổ đĩa một cách an toàn
 * @param {string} fileUrlOrPath - URL (ví dụ: /uploads/disputes/2026-11/evidence-...jpg) hoặc đường dẫn tương đối
 */
function deleteDisputeFile(fileUrlOrPath) {
  if (!fileUrlOrPath || typeof fileUrlOrPath !== 'string') return false;

  try {
    let cleanPath = fileUrlOrPath.trim();
    // Bỏ host / protocol nếu có
    if (cleanPath.startsWith('http://') || cleanPath.startsWith('https://')) {
      try {
        const parsed = new URL(cleanPath);
        cleanPath = parsed.pathname;
      } catch (_) {}
    }

    // Bỏ tiền tố /uploads/
    if (cleanPath.startsWith('/uploads/')) {
      cleanPath = cleanPath.slice('/uploads/'.length);
    } else if (cleanPath.startsWith('uploads/')) {
      cleanPath = cleanPath.slice('uploads/'.length);
    }

    const absolutePath = path.resolve(baseUploadDir, cleanPath);
    // Phòng chống Directory Traversal: đảm bảo file nằm trong baseUploadDir
    if (!absolutePath.toLowerCase().startsWith(baseUploadDir.toLowerCase() + path.sep)) {
      console.warn(`[Multer] Cảnh báo: Đường dẫn xóa không hợp lệ: ${fileUrlOrPath}`);
      return false;
    }

    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
      console.log(`[Multer] 🗑️ Đã xóa file chứng cứ vật lý thành công: ${absolutePath}`);
      return true;
    }
  } catch (err) {
    console.error(`[Multer] Lỗi khi xóa file vật lý (${fileUrlOrPath}):`, err.message);
  }
  return false;
}

module.exports = {
  disputeUpload,
  deleteDisputeFile,
  baseUploadDir
};
