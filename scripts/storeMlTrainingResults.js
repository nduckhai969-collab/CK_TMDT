require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { ensureMlTables, persistTrainingRun } = require('../data/mlResultsStore');

async function main() {
  const resultsPath = path.join(__dirname, '..', 'reports', 'eval_results.json');
  const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
  const pool = mysql.createPool({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'skillrental',
    waitForConnections: true,
    connectionLimit: 1,
    charset: 'utf8mb4'
  });

  try {
    await ensureMlTables(pool);
    const runId = await persistTrainingRun(pool, results);
    console.log(`[ML] Đã lưu kết quả train/validation/test vào MySQL (run ${runId}).`);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('[ML] Không lưu được kết quả huấn luyện vào MySQL:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { main };
