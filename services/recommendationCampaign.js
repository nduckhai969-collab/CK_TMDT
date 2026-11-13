const db = require('../data/db');
const { recommendForMarketing } = require('./recommendService');
const { enqueueAndSend, isSuppressed, getMarketingCooldown, CYCLE_DAYS } = require('./emailQueue');
const { daysBetween } = require('../utils/dates');

const MIN_ORDERS = 2;
const TRIGGER_DAYS = Math.max(1, Number(process.env.MARKETING_TRIGGER_DAYS || CYCLE_DAYS || 14));
const TIME_ZONE = 'Asia/Ho_Chi_Minh';
let campaignRunning = false;

async function runRecommendationCampaign({ dry = false } = {}) {
  if (campaignRunning) return { skipped: true, reason: 'already-running' };
  campaignRunning = true;
  try {
    const customers = (db.getCollection('users') || [])
      .filter(user => user.role === 'Customer' && user.status === 'active' && user.email);
    const counts = { considered: customers.length, sent: 0, logged: 0, skipped: 0, notDue: 0, unapproved: 0 };

    for (const user of customers) {
      if (isSuppressed(user.email)) { counts.skipped += 1; continue; }
      // Chỉ tự động gửi cho tài khoản đã được Admin chấp thuận nhận marketing
      if (user.marketingApproved !== true) { counts.unapproved += 1; continue; }

      const cooldown = getMarketingCooldown(user.id);
      if (cooldown.inCooldown) { counts.notDue += 1; continue; }

      const result = recommendForMarketing(user.id, { MIN_ORDERS });
      if (!result.eligible || !result.items.length) { counts.skipped += 1; continue; }

      // Khách đã có >= 2 đơn: áp dụng thêm ngưỡng chờ 14 ngày sau đơn hoàn tất gần nhất
      if (result.profileOrders >= MIN_ORDERS && result.lastOrderAt) {
        const elapsed = daysBetween(result.lastOrderAt);
        if (elapsed != null && elapsed < TRIGGER_DAYS) {
          counts.notDue += 1;
          continue;
        }
      }

      if (dry) {
        console.log(`[M3 dry] ${user.email} (${result.campaignType}): ${result.items.length} items`);
        counts.sent += 1;
        continue;
      }

      const outcome = await enqueueAndSend({
        user,
        items: result.items,
        reason: result.reason,
        template: result.template,
        campaignType: result.campaignType
      });
      if (outcome.sent) counts.sent += 1;
      else if (outcome.dryRun) counts.logged += 1;
      else counts.skipped += 1;
    }

    console.log(`[M3] considered=${counts.considered} sent=${counts.sent} logged=${counts.logged} unapproved=${counts.unapproved} notDue=${counts.notDue} skipped=${counts.skipped}`);
    return counts;
  } finally {
    campaignRunning = false;
  }
}

function nextRunDelay(now = new Date()) {
  const configuredHour = Number(process.env.MARKETING_EMAIL_HOUR);
  const hour = Number.isInteger(configuredHour) && configuredHour >= 0 && configuredHour <= 23 ? configuredHour : 9;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(now).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
  const currentWallTime = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, now.getUTCMilliseconds());
  let nextWallTime = Date.UTC(parts.year, parts.month - 1, parts.day, hour, 0, 0, 0);
  if (nextWallTime <= currentWallTime) nextWallTime += 24 * 60 * 60 * 1000;
  return nextWallTime - currentWallTime;
}

function startRecommendationScheduler() {
  let stopped = false;
  let timer;
  const schedule = () => {
    if (stopped) return;
    timer = setTimeout(async () => {
      try {
        await runRecommendationCampaign();
      } catch (error) {
        console.error('[M3] Recommendation campaign failed:', error.message);
      }
      schedule();
    }, nextRunDelay());
    timer.unref();
  };
  schedule();
  return () => { stopped = true; clearTimeout(timer); };
}

module.exports = { runRecommendationCampaign, startRecommendationScheduler, nextRunDelay, MIN_ORDERS, TRIGGER_DAYS };
