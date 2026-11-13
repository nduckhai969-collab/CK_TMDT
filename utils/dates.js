function formatDateTime(date) {
  const d = new Date(date);
  const DD = String(d.getDate()).padStart(2, '0');
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const YYYY = d.getFullYear();
  const HH = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${DD}/${MM}/${YYYY} ${HH}:${mm}`;
}

// Đọc ngày ở CẢ 2 định dạng đang tồn tại trong hệ thống:
//   "18/10/2026 09:15" (đơn hàng) và "2026-10-18T02:15:00.000Z" (ví).
// Trả về Date, hoặc null nếu không đọc được.
function parseDateTime(value) {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;

  const raw = String(value).trim();
  if (!raw) return null;

  const vn = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2}))?/);
  if (vn) {
    const [, d, m, y, h, mi] = vn;
    const date = new Date(Number(y), Number(m) - 1, Number(d), Number(h || 0), Number(mi || 0));
    return isNaN(date.getTime()) ? null : date;
  }

  const iso = new Date(raw);
  return isNaN(iso.getTime()) ? null : iso;
}

// Khoảng cách ngày từ `from` đến `to` (mặc định là bây giờ). null nếu không đọc được.
function daysBetween(from, to = new Date()) {
  const a = parseDateTime(from);
  const b = parseDateTime(to);
  if (!a || !b) return null;
  return (b.getTime() - a.getTime()) / 86400000;
}

module.exports = {
  formatDateTime,
  parseDateTime,
  daysBetween
};
