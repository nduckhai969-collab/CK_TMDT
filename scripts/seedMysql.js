// Khởi tạo dữ liệu mẫu trong MySQL.
require('dotenv').config();
const db = require('../data/db');
const { INITIAL_DATABASE, COLLECTIONS } = require('../data/db');
const { hashPassword } = require('../utils/authTokens');
const FORCE = process.argv.includes('--force');
async function main() {
  try {
    await db.init();
    if (FORCE) {
      for (const name of COLLECTIONS) await db.saveCollectionAndWait(name, INITIAL_DATABASE[name] || []);
      const users = db.getCollection('users');
      for (const user of users) {
        if (user.password && !user.passwordHash) user.passwordHash = await hashPassword(user.password);
        delete user.password;
      }
      await db.saveCollectionAndWait('users', users);
    }
    console.log('Dữ liệu MySQL sẵn sàng.');
  } finally { await db.close(); }
}
main().catch(error => { console.error('Seed thất bại:', error.message); process.exitCode = 1; });
