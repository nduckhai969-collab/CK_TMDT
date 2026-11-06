// Worker M3: quét khách đủ điều kiện, dựng gợi ý theo sở thích và gửi email.
// Chạy riêng, KHÔNG nhét vào server.js để không chặn request của web.
//   node scripts/emailWorker.js          -> gửi thật (hoặc dry-run nếu chưa có SMTP)
//   node scripts/emailWorker.js --dry    -> chỉ in kết quả, không gửi, không ghi log
require('dotenv').config();
const db = require('../data/db');
const { recommendForUser } = require('../services/recommendService');
const { enqueueAndSend, isSuppressed } = require('../services/emailQueue');
const { daysBetween } = require('../utils/dates');

const DRY = process.argv.includes('--dry');
const MIN_ORDERS = 2;
const TRIGGER_DAYS = 14;

async function main() {
  try {
    await db.init();

    const customers = (db.getCollection('users') || []).filter(u => u.role === 'Customer' && u.email);
    let sent = 0, skipped = 0, noTrigger = 0;

    for (const user of customers) {
      if (isSuppressed(user.email)) { skipped += 1; continue; }

      const result = recommendForUser(user.id);
      if (!result.eligible || result.profileOrders < MIN_ORDERS) { skipped += 1; continue; }

      const elapsed = result.lastOrderAt ? daysBetween(result.lastOrderAt) : null;
      if (elapsed == null || elapsed < TRIGGER_DAYS) { noTrigger += 1; continue; }

      if (DRY) {
        console.log(`[dry] ${user.email} (đơn cuối cách ${Math.floor(elapsed)} ngày):`);
        result.items.forEach(i => console.log(`   - ${i.title} | ${i.score} | ${i.matched.join(', ')}`));
        sent += 1;
        continue;
      }

      const outcome = await enqueueAndSend({ user, items: result.items, reason: result.reason });
      if (outcome.sent) { sent += 1; console.log(`[M3] gửi ${user.email} (${outcome.status})`); }
      else { skipped += 1; console.log(`[M3] bỏ qua ${user.email}: ${outcome.skipped}`); }
    }

    console.log(`[M3] xong - khách xét: ${customers.length}, gửi: ${sent}, chưa tới mốc 14 ngày: ${noTrigger}, bỏ qua: ${skipped}.`);
  } finally {
    await db.close();
  }
}

main().catch(error => { console.error('Worker lỗi:', error.message); process.exitCode = 1; });
