// Render + gửi email marketing. Tái dùng cấu hình SMTP đã có cho email tài khoản.
// Nếu chưa cấu hình SMTP thì chạy dry-run: chỉ ghi log ra console.
const nodemailer = require('nodemailer');
const { formatDateTime } = require('../utils/dates');

const BASE_URL = String(process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');

let cachedConfigKey = '';
let cachedTransporter = null;

function getSmtpConfig() {
  const host = String(process.env.SMTP_HOST || 'smtp.gmail.com').trim();
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465;
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_APP_PASSWORD || '').replace(/\s/g, '');
  const from = String(process.env.SMTP_FROM || (user ? `SkillRental <${user}>` : '')).trim();
  return { host, port, secure, user, pass, from };
}

function getTransporter() {
  const cfg = getSmtpConfig();
  if (!cfg.user || !cfg.pass) {
    cachedConfigKey = '';
    cachedTransporter = null;
    return null;
  }
  const key = `${cfg.host}|${cfg.port}|${cfg.secure}|${cfg.user}|${cfg.pass}`;
  if (cachedTransporter && cachedConfigKey === key) return cachedTransporter;

  cachedConfigKey = key;
  cachedTransporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    connectionTimeout: 15000,
    greetingTimeout: 15000
  });
  return cachedTransporter;
}

async function verifySmtp() {
  const cfg = getSmtpConfig();
  const isLocalBaseUrl = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(BASE_URL);
  const transporter = getTransporter();

  if (!transporter) {
    return {
      configured: false,
      verified: false,
      mode: 'dry-run',
      user: cfg.user,
      host: cfg.host,
      port: cfg.port,
      baseUrl: BASE_URL,
      isLocalBaseUrl,
      warning: 'Chưa cấu hình SMTP_USER hoặc SMTP_APP_PASSWORD trong .env. Hệ thống đang chạy chế độ Dry-run (chỉ ghi log, không gửi thư thật).'
    };
  }

  try {
    await transporter.verify();
    return {
      configured: true,
      verified: true,
      mode: 'smtp',
      user: cfg.user,
      host: cfg.host,
      port: cfg.port,
      baseUrl: BASE_URL,
      isLocalBaseUrl,
      warning: isLocalBaseUrl
        ? 'APP_BASE_URL đang là localhost — email gửi tới hộp thư trường học (.edu.vn) hoặc công ty có thể rơi vào thư mục Spam/Quảng cáo.'
        : ''
    };
  } catch (error) {
    return {
      configured: true,
      verified: false,
      mode: 'smtp-error',
      user: cfg.user,
      host: cfg.host,
      port: cfg.port,
      baseUrl: BASE_URL,
      isLocalBaseUrl,
      error: String(error && error.message ? error.message : error),
      warning: 'Kết nối SMTP thất bại. Hãy kiểm tra lại SMTP_USER và App Password trong .env.'
    };
  }
}

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatPrice(value, unit) {
  if (value == null || value === '') return '';
  const num = Number(value);
  const text = isNaN(num) ? String(value) : num.toLocaleString('vi-VN') + 'đ';
  return unit ? `${text} / ${unit}` : text;
}

// Link click được bọc qua route theo dõi để đếm CTR.
function trackedLink(emailId, target) {
  return `${BASE_URL}/api/email/c/${encodeURIComponent(emailId)}?u=${encodeURIComponent(target)}`;
}

function renderRecommendation(user, items, emailId, campaignType = 'personalized') {
  const name = String(user.name || '').split(' ').slice(-1)[0] || 'bạn';
  const isDiscovery = campaignType === 'discovery';

  const subject = isDiscovery
    ? `[SkillRental] Khám phá các dịch vụ nổi bật dành cho ${user.name || 'bạn'}`
    : `[SkillRental] Gợi ý dịch vụ dành riêng cho ${user.name || 'bạn'}`;

  const introText = isDiscovery
    ? `Chào mừng bạn đồng hành cùng SkillRental! Dưới đây là toàn bộ ${items.length} dịch vụ uy tín đang hoạt động trên hệ thống mà bạn có thể đặt lịch ngay:`
    : `Dựa trên ${items.length} gợi ý phù hợp với sở thích của bạn, đây là vài dịch vụ bạn có thể quan tâm:`;

  const cards = items.map(item => {
    const dest = item.id ? `${BASE_URL}/customer_service_detail.html?id=${encodeURIComponent(item.id)}` : `${BASE_URL}/customer.html`;
    const url = trackedLink(emailId, dest);
    const reason = isDiscovery
      ? (item.desc ? String(item.desc).slice(0, 110) + (String(item.desc).length > 110 ? '...' : '') : 'Dịch vụ đang sẵn sàng nhận đặt lịch trên SkillRental')
      : (item.matched && item.matched.length
        ? `Vì bạn quan tâm: ${item.matched.join(', ')}`
        : 'Dựa trên các dịch vụ bạn đã dùng');
    return `
      <tr><td style="padding:12px 0;border-bottom:1px solid #eee">
        <a href="${url}" style="font-size:16px;font-weight:600;color:#111;text-decoration:none">${escapeHtml(item.title)}</a>
        <div style="color:#666;font-size:13px;margin-top:4px">${escapeHtml(item.providerName || '')} · ${escapeHtml(item.category || '')}</div>
        <div style="color:#e11d48;font-weight:600;margin-top:4px">${escapeHtml(formatPrice(item.price, item.priceUnit))}</div>
        <div style="color:#64748b;font-size:12px;margin-top:4px;${isDiscovery ? '' : 'font-style:italic'}">${escapeHtml(reason)}</div>
      </td></tr>`;
  }).join('');

  const html = `<!doctype html><html><body style="margin:0;background:#f6f7f9;font-family:Arial,Helvetica,sans-serif">
    <div style="max-width:560px;margin:0 auto;padding:24px;background:#ffffff;border-radius:8px">
      <h2 style="color:#111;margin-top:0">Chào ${escapeHtml(name)},</h2>
      <p style="color:#444;line-height:1.5">${escapeHtml(introText)}</p>
      <table style="width:100%;border-collapse:collapse">${cards}</table>
      <p style="text-align:center;margin:28px 0">
        <a href="${trackedLink(emailId, `${BASE_URL}/customer.html`)}" style="background:#16a34a;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Khám phá ngay trên SkillRental</a>
      </p>
      <p style="color:#999;font-size:12px;text-align:center">
        Bạn nhận được email này vì tài khoản của bạn đang hoạt động trên SkillRental.<br>
        <a href="${BASE_URL}/api/email/unsubscribe?e=${encodeURIComponent(emailId)}" style="color:#999">Hủy nhận email marketing</a>
      </p>
    </div>
    <img src="${BASE_URL}/api/email/o/${encodeURIComponent(emailId)}" width="1" height="1" alt="" style="display:block">
  </body></html>`;

  const text = `Chào ${name},\n\n${introText}\n` +
    items.map(i => `- ${i.title} (${formatPrice(i.price, i.priceUnit)})`).join('\n') +
    `\n\nXem tại: ${BASE_URL}/customer.html\nHủy nhận email: ${BASE_URL}/api/email/unsubscribe?e=${encodeURIComponent(emailId)}`;

  return { subject, html, text };
}

// Gửi thật; nếu chưa cấu hình SMTP thì đánh dấu 'logged' (dry-run).
async function deliver(record, content) {
  const transporter = getTransporter();
  const cfg = getSmtpConfig();

  if (!transporter) {
    console.log(`[email] dry-run -> ${record.to} | ${content.subject}`);
    record.status = 'logged';
    record.sentAt = formatDateTime(new Date());
    return record;
  }

  try {
    const info = await transporter.sendMail({
      from: cfg.from || `SkillRental <${cfg.user}>`,
      to: record.to,
      subject: content.subject,
      html: content.html,
      text: content.text
    });
    console.log(`[email] Sent to ${record.to}: messageId=${info?.messageId}, response=${info?.response}`);
    record.status = 'sent';
    record.providerMessageId = info && info.messageId ? info.messageId : '';
    record.error = '';
    record.sentAt = formatDateTime(new Date());
  } catch (error) {
    const errMsg = String(error && error.message ? error.message : error);
    console.error(`[email] ❌ Send failed to ${record.to}:`, errMsg);
    record.status = 'failed';
    record.error = errMsg;
  }
  return record;
}

module.exports = { BASE_URL, getTransporter, verifySmtp, renderRecommendation, deliver };
