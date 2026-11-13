// Hàng đợi + kiểm soát gửi: chu kỳ 14 ngày, chống spam, chặn người đã hủy nhận.
const db = require('../data/db');
const { generateId } = require('../utils/id');
const { formatDateTime, daysBetween } = require('../utils/dates');
const { renderRecommendation, deliver } = require('./emailService');

const CYCLE_DAYS = Math.max(1, Number(process.env.MARKETING_CYCLE_DAYS || 14));

const CFG = {
  GLOBAL_FREQUENCY_DAYS: CYCLE_DAYS, // tối đa 1 email marketing / khách / 14 ngày
  COOLDOWN_DAYS: CYCLE_DAYS
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

// Kiểm tra trạng thái chu kỳ 14 ngày của khách hàng đối với email marketing.
function getMarketingCooldown(userId) {
  const existing = listEmails();
  const lastEmail = existing.find(e =>
    e.userId === userId &&
    (e.type || 'marketing') === 'marketing' &&
    e.status !== 'failed'
  ) || null;

  if (!lastEmail) {
    return { inCooldown: false, daysSinceLast: null, nextEligibleInDays: 0, lastEmail: null };
  }

  const elapsed = daysSince(lastEmail.sentAt || lastEmail.createdAt);
  const inCooldown = elapsed < CFG.COOLDOWN_DAYS;
  const nextEligibleInDays = inCooldown ? Math.max(1, Math.ceil(CFG.COOLDOWN_DAYS - elapsed)) : 0;
  return {
    inCooldown,
    daysSinceLast: Number.isFinite(elapsed) ? Math.floor(elapsed) : null,
    nextEligibleInDays,
    lastEmail
  };
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

// Soạn và gửi 1 email marketing (hoặc email test).
async function enqueueAndSend({
  user,
  items,
  reason = '',
  template = 'M3',
  campaignType = 'personalized',
  forceResend = false,
  type = 'marketing'
}) {
  if (!user || !user.email) return { sent: false, skipped: 'missing-email' };
  if (type === 'marketing' && isSuppressed(user.email)) return { sent: false, skipped: 'suppressed' };
  if (!items || !items.length) return { sent: false, skipped: 'no-items' };

  if (type === 'marketing' && !forceResend) {
    const cooldown = getMarketingCooldown(user.id);
    if (cooldown.inCooldown) {
      return {
        sent: false,
        skipped: 'frequency-cap',
        daysSinceLast: cooldown.daysSinceLast,
        nextEligibleInDays: cooldown.nextEligibleInDays
      };
    }
  }

  const record = {
    id: generateId('EML'),
    userId: user.id || 'TEST',
    userName: user.name || '',
    to: user.email,
    template,
    campaignType,
    type,
    subject: '',
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

  const content = renderRecommendation(user, items, record.id, campaignType);
  record.subject = content.subject;
  await deliver(record, content);

  const latest = listEmails();
  latest.unshift(record);
  await db.saveCollectionAndWait('emails', latest);

  return {
    sent: record.status === 'sent',
    dryRun: record.status === 'logged',
    status: record.status,
    id: record.id,
    messageId: record.providerMessageId,
    error: record.error
  };
}

function findEmail(id) {
  return listEmails().find(e => e.id === id) || null;
}

function getStats() {
  const emails = listEmails();
  const sent = emails.filter(e => e.status === 'sent').length;
  const logged = emails.filter(e => e.status === 'logged').length;
  const failed = emails.filter(e => e.status === 'failed').length;
  const opened = emails.filter(e => e.openedAt).length;
  const clicked = emails.filter(e => e.clickedAt).length;
  const basis = sent || logged;
  return {
    total: emails.length,
    sent,
    logged,
    failed,
    opened,
    clicked,
    ctr: basis ? Number(((clicked / basis) * 100).toFixed(2)) : 0,
    unsubscribed: listSuppressions().length
  };
}

module.exports = {
  CFG,
  CYCLE_DAYS,
  isSuppressed,
  addSuppression,
  getMarketingCooldown,
  recordEvent,
  enqueueAndSend,
  findEmail,
  getStats,
  listEmails
};
