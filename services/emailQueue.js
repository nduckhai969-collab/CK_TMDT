// Hàng đợi + kiểm soát gửi: chống gửi lặp, giới hạn tần suất, chặn người đã hủy nhận.
const db = require('../data/db');
const { generateId } = require('../utils/id');
const { formatDateTime, daysBetween } = require('../utils/dates');
const { renderRecommendation, deliver } = require('./emailService');

const CFG = {
  GLOBAL_FREQUENCY_DAYS: 7, // trần chung: tối đa 1 email marketing / khách / 7 ngày
  COOLDOWN_DAYS: 30         // riêng M3: tối đa 1 lần / 30 ngày
};

const listEmails = () => db.getCollection('emails') || [];
const listSuppressions = () => db.getCollection('emailSuppressions') || [];

// Số ngày kể từ mốc thời gian; không đọc được thì coi như rất cũ.
function daysSince(value) {
  const days = daysBetween(value);
  return days == null ? Infinity : days;
}

function isSuppressed(email) {
  const value = String(email || '').trim().toLowerCase();
  return listSuppressions().some(s => String(s.email || '').toLowerCase() === value);
}

function addSuppression(email, reason = 'unsubscribe') {
  const value = String(email || '').trim().toLowerCase();
  if (!value) return false;
  const list = listSuppressions();
  if (list.some(s => String(s.email || '').toLowerCase() === value)) return true;
  list.unshift({ id: generateId('SUP'), email: value, reason, createdAt: formatDateTime(new Date()) });
  db.saveCollection('emailSuppressions', list);
  return true;
}

// Ghi nhận open/click. Open chỉ để tham khảo, click mới là chỉ số chính.
function recordEvent(emailId, type, url = '') {
  const events = db.getCollection('emailEvents') || [];
  events.unshift({ id: generateId('EVT'), emailId, type, url, createdAt: formatDateTime(new Date()) });
  db.saveCollection('emailEvents', events);

  const emails = listEmails();
  const index = emails.findIndex(e => e.id === emailId);
  if (index >= 0) {
    const record = emails[index];
    if (type === 'open' && !record.openedAt) record.openedAt = formatDateTime(new Date());
    if (type === 'click') {
      if (!record.clickedAt) record.clickedAt = formatDateTime(new Date());
      record.lastClickedUrl = url;
    }
    db.saveCollection('emails', emails);
  }
}

// Soạn và gửi 1 email gợi ý. Trả về { sent, status?, skipped? }.
async function enqueueAndSend({ user, items, reason = '', template = 'M3' }) {
  if (!user || !user.email) return { sent: false, skipped: 'missing-email' };
  if (isSuppressed(user.email)) return { sent: false, skipped: 'suppressed' };
  if (!items || !items.length) return { sent: false, skipped: 'no-items' };

  const existing = listEmails();
  const dedupeKey = `${template}:${user.id}:${new Date().toISOString().slice(0, 7)}`;

  if (existing.some(e => e.dedupeKey === dedupeKey && e.status !== 'failed')) {
    return { sent: false, skipped: 'duplicate' };
  }
  if (existing.some(e => e.userId === user.id && e.type === 'marketing' && e.status !== 'failed' && daysSince(e.createdAt) < CFG.GLOBAL_FREQUENCY_DAYS)) {
    return { sent: false, skipped: 'frequency-cap' };
  }

  const record = {
    id: generateId('EML'),
    userId: user.id,
    to: user.email,
    template,
    type: 'marketing',
    subject: '',
    dedupeKey,
    reason,
    items: items.map(i => ({ id: i.id, title: i.title, score: i.score })),
    status: 'queued',
    providerMessageId: '',
    error: '',
    createdAt: formatDateTime(new Date()),
    sentAt: '',
    openedAt: '',
    clickedAt: ''
  };

  const content = renderRecommendation(user, items, record.id);
  record.subject = content.subject;
  await deliver(record, content);

  const latest = listEmails();
  latest.unshift(record);
  db.saveCollection('emails', latest);

  return { sent: record.status === 'sent' || record.status === 'logged', status: record.status, id: record.id };
}

function findEmail(id) {
  return listEmails().find(e => e.id === id) || null;
}

function getStats() {
  const emails = listEmails();
  const sent = emails.filter(e => e.status === 'sent' || e.status === 'logged').length;
  const opened = emails.filter(e => e.openedAt).length;
  const clicked = emails.filter(e => e.clickedAt).length;
  return {
    total: emails.length,
    sent,
    failed: emails.filter(e => e.status === 'failed').length,
    opened,
    clicked,
    ctr: sent ? Number(((clicked / sent) * 100).toFixed(2)) : 0,
    unsubscribed: listSuppressions().length
  };
}

module.exports = {
  CFG,
  isSuppressed,
  addSuppression,
  recordEvent,
  enqueueAndSend,
  findEmail,
  getStats,
  listEmails
};
