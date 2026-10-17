// Nhập dữ liệu mẫu (data/database.json) vào Firestore và tạo tài khoản Firebase Auth.
// Chạy:  npm run seed          (bỏ qua nếu Firestore đã có user)
//        npm run seed -- --force   (ghi đè theo id)
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { firestore, auth } = require('../firebase');
const { INITIAL_DATABASE, COLLECTIONS } = require('../data/db');

const FORCE = process.argv.includes('--force');
const DEFAULT_PASSWORD = process.env.SEED_DEFAULT_PASSWORD || 'SkillRental@123';

function loadSource() {
  const file = path.join(__dirname, '..', 'data', 'database.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  return JSON.parse(JSON.stringify(INITIAL_DATABASE));
}

async function ensureAuthUser(user) {
  let record;
  try {
    record = await auth.getUserByEmail(user.email);
  } catch (err) {
    if (err.code !== 'auth/user-not-found') throw err;
    record = await auth.createUser({
      email: user.email,
      password: DEFAULT_PASSWORD,
      displayName: user.name,
      emailVerified: true // tài khoản mẫu coi như đã xác nhận email
    });
  }
  await auth.setCustomUserClaims(record.uid, { role: user.role });
  return record.uid;
}

async function writeCollection(name, items) {
  for (let i = 0; i < items.length; i += 400) {
    const batch = firestore.batch();
    items.slice(i, i + 400).forEach((item, offset) => {
      const id = String(item.id).replace(/\//g, '_');
      batch.set(firestore.collection(name).doc(id), { ...item, _idx: i + offset });
    });
    await batch.commit();
  }
}

async function main() {
  const existing = await firestore.collection('users').limit(1).get();
  if (!existing.empty && !FORCE) {
    console.log('Firestore đã có dữ liệu. Dùng "npm run seed -- --force" nếu muốn ghi đè.');
    return;
  }

  const source = loadSource();
  const summary = [];

  // 1. Tạo tài khoản Auth cho từng user mẫu, bỏ mật khẩu plaintext khỏi hồ sơ
  source.users = await Promise.all(source.users.map(async (user) => {
    const uid = await ensureAuthUser(user);
    const { password, ...profile } = user;
    summary.push(`${user.role.padEnd(8)} ${user.email}`);
    return { ...profile, uid };
  }));

  // 2. Ghi toàn bộ collection lên Firestore
  for (const name of COLLECTIONS) {
    const items = (source[name] || []).filter(item => item && item.id !== undefined);
    await writeCollection(name, items);
    console.log(`  ✓ ${name}: ${items.length} document`);
  }

  console.log('\nĐã tạo/cập nhật tài khoản (mật khẩu tạm: ' + DEFAULT_PASSWORD + '):');
  summary.forEach(line => console.log('  - ' + line));
  console.log('\nHoàn tất. Hãy đổi mật khẩu sau khi đăng nhập lần đầu.');
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('Seed thất bại:', err);
  process.exit(1);
});
