// Render + gửi email marketing. Tái dùng cấu hình SMTP đã có cho email tài khoản.
// Nếu chưa cấu hình SMTP thì chạy dry-run: chỉ ghi log ra console.
const nodemailer = require('nodemailer');
const { formatDateTime } = require('../utils/dates');

const BASE_URL = String(process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');

let cachedTransporter;

function getTransporter() {
  if (cachedTransporter !== undefined) return cachedTransporter;
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_APP_PASSWORD || '').replace(/\s/g, '');
  if (!user || !pass) {
    cachedTransporter = null;
    return null;
  }
  const port = Number(process.env.SMTP_PORT || 465);
  cachedTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
    auth: { user, pass }
  });
  return cachedTransporter;
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
  return `${BASE_URL}/api/email/c/${emailId}?u=${encodeURIComponent(target)}`;
}

function renderRecommendation(user, items, emailId) {
  const name = String(user.name || '').split(' ').slice(-1)[0] || 'bạn';
  const subject = 'Gợi ý dịch vụ dành riêng cho bạn - SkillRental';

  const cards = items.map(item => {
    const url = trackedLink(emailId, `${BASE_URL}/customer.html`);
    const reason = item.matched && item.matched.length
      ? `Vì bạn quan tâm: ${item.matched.join(', ')}`
      : 'Dựa trên các dịch vụ bạn đã dùng';
    return `
      <tr><td style="padding:12px 0;border-bottom:1px solid #eee">
        <a href="${url}" style="font-size:16px;font-weight:600;color:#111;text-decoration:none">${escapeHtml(item.title)}</a>
        <div style="color:#666;font-size:13px;margin-top:4px">${escapeHtml(item.providerName || '')} · ${escapeHtml(item.category || '')}</div>
        <div style="color:#e11d48;font-weight:600;margin-top:4px">${escapeHtml(formatPrice(item.price, item.priceUnit))}</div>
        <div style="color:#888;font-size:12px;margin-top:4px;font-style:italic">${escapeHtml(reason)}</div>
      </td></tr>`;
  }).join('');

  const html = `<!doctype html><html><body style="margin:0;background:#f6f7f9;font-family:Arial,Helvetica,sans-serif">
    <div style="max-width:560px;margin:0 auto;padding:24px">
      <h2 style="color:#111">Chào ${escapeHtml(name)},</h2>
      <p style="color:#444;line-height:1.5">Dựa trên ${items.length} gợi ý phù hợp với sở thích của bạn, đây là vài dịch vụ bạn có thể quan tâm:</p>
      <table style="width:100%;border-collapse:collapse">${cards}</table>
      <p style="text-align:center;margin:28px 0">
        <a href="${trackedLink(emailId, `${BASE_URL}/customer.html`)}" style="background:#e11d48;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Xem gợi ý</a>
      </p>
      <p style="color:#999;font-size:12px;text-align:center">
        Bạn nhận được email này vì đã sử dụng dịch vụ trên SkillRental.<br>
        <a href="${BASE_URL}/api/email/unsubscribe?e=${encodeURIComponent(emailId)}" style="color:#999">Hủy nhận email marketing</a>
      </p>
    </div>
    <img src="${BASE_URL}/api/email/o/${encodeURIComponent(emailId)}" width="1" height="1" alt="" style="display:block">
  </body></html>`;

  const text = `Chào ${name},\n\nGợi ý dịch vụ phù hợp với sở thích của bạn:\n` +
    items.map(i => `- ${i.title} (${formatPrice(i.price, i.priceUnit)})`).join('\n') +
    `\n\nXem tại: ${BASE_URL}/customer.html\nHủy nhận email: ${BASE_URL}/api/email/unsubscribe?e=${encodeURIComponent(emailId)}`;

  return { subject, html, text };
}

// Gửi thật; nếu chưa cấu hình SMTP thì đánh dấu 'logged' (dry-run).
async function deliver(record, content) {
  const transporter = getTransporter();

  if (!transporter) {
    console.log(`[email] dry-run -> ${record.to} | ${content.subject}`);
    record.status = 'logged';
    record.sentAt = formatDateTime(new Date());
    return record;
  }

  try {
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || `SkillRental <${process.env.SMTP_USER}>`,
      to: record.to,
      subject: content.subject,
      html: content.html,
      text: content.text,
      headers: { 'List-Unsubscribe': `<${BASE_URL}/api/email/unsubscribe?e=${encodeURIComponent(record.id)}>` }
    });
    record.status = 'sent';
    record.providerMessageId = info && info.messageId ? info.messageId : '';
    record.sentAt = formatDateTime(new Date());
  } catch (error) {
    record.status = 'failed';
    record.error = String(error && error.message ? error.message : error);
  }
  return record;
}

module.exports = { BASE_URL, getTransporter, renderRecommendation, deliver };
