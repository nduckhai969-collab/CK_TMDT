// Worker M3: quét khách đủ điều kiện, dựng gợi ý theo sở thích và gửi email.
// Chạy riêng, KHÔNG nhét vào server.js để không chặn request của web.
//   node scripts/emailWorker.js          -> gửi thật (hoặc dry-run nếu chưa có SMTP)
//   node scripts/emailWorker.js --dry    -> chỉ in kết quả, không gửi, không ghi log
require('dotenv').config();
const db = require('../data/db');
const { runRecommendationCampaign } = require('../services/recommendationCampaign');

const DRY = process.argv.includes('--dry');

async function main() {
  try {
    await db.init();
    await runRecommendationCampaign({ dry: DRY });
  } finally {
    await db.close();
  }
}

main().catch(error => { console.error('Worker lỗi:', error.message); process.exitCode = 1; });
