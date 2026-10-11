// Sinh id ngắn, khó trùng: PREFIX + thời gian (base36) + 2 ký tự ngẫu nhiên.
function generateId(prefix = 'ID') {
  const time = Date.now().toString(36).toUpperCase();
  const rand = Math.floor(Math.random() * 1296).toString(36).toUpperCase().padStart(2, '0');
  return `${prefix}${time}${rand}`;
}

// `id` là tên cũ mà một số file đang import: giữ lại để không vỡ code cũ.
module.exports = { generateId, id: generateId };
