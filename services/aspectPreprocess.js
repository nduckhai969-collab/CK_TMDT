/**
 * services/aspectPreprocess.js
 * Tiền xử lý văn bản tiếng Việt đồng bộ 100% với ml/preprocess.py
 */

const TEENCODE_DICT = {
  'ko': 'không',
  'k': 'không',
  'kh': 'không',
  'khg': 'không',
  'hok': 'không',
  'hem': 'không',
  'hổng': 'không',
  'chớ': 'chớ',
  'đc': 'được',
  'dc': 'được',
  'mk': 'mình',
  'lun': 'luôn',
  'luon': 'luôn',
  'ng': 'người',
  'vs': 'với',
  'cx': 'cũng',
  'mn': 'mọi người',
  'kp': 'không phải',
  'r': 'rồi',
  'rùi': 'rồi',
  'quớ': 'quá',
  'wa': 'quá',
  'qúa': 'quá',
  'oke': 'tốt',
  'oki': 'tốt',
  'okey': 'tốt',
  'ok': 'tốt',
  'thik': 'thích',
  'thjk': 'thích',
  'chug': 'chung',
  'bh': 'bảo hành',
  'sp': 'sản phẩm',
  'dv': 'dịch vụ',
  'nv': 'nhân viên',
  'tks': 'cảm ơn',
  'thank': 'cảm ơn',
  'thanks': 'cảm ơn',
  'a/c': 'anh chị',
  'ac': 'anh chị',
  'ib': 'nhắn tin',
  'inbox': 'nhắn tin',
  'rep': 'trả lời'
};

// Khử ký tự lặp >= 3 lần (chuẩnnn -> chuẩn, quáaa -> quá)
const RE_REPEATED = /([a-zA-Z\u00C0-\u1EF9])\1{2,}/gu;

function removeAccents(text) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFC');
}

function normalizeTextBase(text) {
  if (!text) return '';

  // 1. Unicode NFC
  let res = text.normalize('NFC');

  // 2. Lowercase
  res = res.toLowerCase();

  // 3. Rút gọn ký tự lặp
  res = res.replace(RE_REPEATED, '$1');

  // 4. Map teencode (tách token theo khoảng trắng hoặc ranh giới ký tự)
  // Trong JS: tách giữ nguyên delimiter dùng capture group
  const tokens = res.split(/(\s+|[^\p{L}\p{N}])/u);
  const mapped = tokens.map(tok => {
    const cleanTok = tok.trim();
    if (TEENCODE_DICT[cleanTok]) {
      return TEENCODE_DICT[cleanTok];
    }
    return tok;
  });
  res = mapped.join('');

  // Chuẩn hóa khoảng trắng
  res = res.replace(/\s+/g, ' ').trim();
  return res;
}

function preprocessText(text, includeUnaccented = true) {
  const base = normalizeTextBase(text);
  if (!base) return '';
  if (includeUnaccented) {
    const unacc = removeAccents(base);
    return `${base} ${unacc}`;
  }
  return base;
}

module.exports = {
  preprocessText,
  normalizeTextBase,
  removeAccents,
  TEENCODE_DICT
};
