// Kiểm tra tĩnh phần giao diện trước khi commit.
// Chạy: npm run check
//
// Bắt các lỗi đã từng xảy ra trong dự án:
//   1. Trang HTML trỏ tới file js/css/ảnh/trang không tồn tại
//      (từng gây lỗi jobs.html vì thiếu js/number-format.js).
//   2. Trang dùng input tiền (data-thousands) nhưng quên nạp js/number-format.js.
//   3. File giao diện (.html/.css) mọc lại ở thư mục gốc - nơi server không phục vụ.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
// Repo luu thu muc giao dien voi ten "Frontend" (chu F hoa); tren may Windows
// o dia co the la "frontend" do he thong tep khong phan biet hoa/thuong.
function resolveFrontendDir() {
  for (const name of ['Frontend', 'frontend']) {
    const dir = path.join(ROOT, name);
    if (fs.existsSync(dir)) return dir;
  }
  console.error('Không tìm thấy thư mục Frontend/ trong dự án.');
  process.exit(1);
}

const FRONTEND = resolveFrontendDir();
const NUMBER_FORMAT_SCRIPT = 'number-format.js';
const ATTRIBUTE_PATTERN = /(?:src|href)\s*=\s*["']([^"']*)["']/gi;
const EXTERNAL_PATTERN = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\?|\/)/i;
// Chỉ kiểm tra các tham chiếu trỏ tới file tĩnh thật, bỏ qua giá trị do JS sinh ra
// (ví dụ src="${p.avatar}") để không báo lỗi giả.
const STATIC_FILE_PATTERN = /\.(?:html?|css|js|png|jpe?g|gif|svg|ico|webp|woff2?|ttf|pdf)$/i;
const TEMPLATE_PATTERN = /[${}<>%]/;

const problems = [];

function listFrontendPages() {
  return fs.readdirSync(FRONTEND).filter((name) => name.endsWith('.html'));
}

// Bỏ query string và hash để so khớp với đường dẫn thật trên đĩa.
function toLocalPath(reference) {
  return reference.split('#')[0].split('?')[0];
}

function checkPage(page) {
  const content = fs.readFileSync(path.join(FRONTEND, page), 'utf8');

  for (const match of content.matchAll(ATTRIBUTE_PATTERN)) {
    const reference = match[1].trim();
    if (!reference || EXTERNAL_PATTERN.test(reference) || TEMPLATE_PATTERN.test(reference)) continue;

    const localFile = toLocalPath(reference);
    if (!STATIC_FILE_PATTERN.test(localFile)) continue;

    const target = path.resolve(FRONTEND, localFile);
    if (!fs.existsSync(target)) {
      problems.push(`${page}: thiếu file "${reference}"`);
    }
  }

  const usesMoneyInput = /data-thousands/.test(content);
  const loadsNumberFormat = new RegExp(`src\\s*=\\s*["'][^"']*${NUMBER_FORMAT_SCRIPT}`).test(content);
  if (usesMoneyInput && !loadsNumberFormat) {
    problems.push(`${page}: có input data-thousands nhưng chưa nạp js/${NUMBER_FORMAT_SCRIPT}`);
  }
}

// Server chỉ phục vụ thư mục Frontend/, nên file giao diện ở gốc là bản sao thừa.
function findStrayRootFiles() {
  return fs.readdirSync(ROOT, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(?:html|css)$/i.test(entry.name))
    .map((entry) => entry.name);
}

const pages = listFrontendPages();
pages.forEach(checkPage);
const strayRootFiles = findStrayRootFiles();

console.log(`Đã kiểm tra ${pages.length} trang trong Frontend/.`);

if (strayRootFiles.length) {
  console.log('\n[CHỐNG LẶP LẠI] File giao diện thừa ở thư mục gốc (server không phục vụ):');
  strayRootFiles.forEach((name) => console.log(`  - ${name}`));
  console.log('  -> Giao diện phải nằm trong Frontend/. Hãy xóa hoặc chuyển các file trên.');
}

if (problems.length) {
  console.log('\n[LỖI] Tham chiếu không hợp lệ:');
  problems.forEach((message) => console.log(`  - ${message}`));
}

const total = problems.length + strayRootFiles.length;
if (total) {
  console.log(`\nTìm thấy ${total} vấn đề. Hãy sửa rồi chạy lại "npm run check".`);
  process.exitCode = 1;
} else {
  console.log('\nOK: không có tham chiếu thiếu, link hỏng hay file giao diện thừa ở gốc.');
}
