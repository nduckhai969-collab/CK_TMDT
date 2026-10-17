require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { firestore, auth } = require('../firebase');
const source = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'database.json'), 'utf8'));
const users = source.users.filter(user => String(user.email || '').endsWith('@example.test'));
const sourceProviders = source.providers.filter(provider => users.some(user => user.id === provider.userId));
const originalUserEmails = new Map(users.map(user => [user.id, user.email]));
const password = process.env.SEED_DEFAULT_PASSWORD || 'SkillRental@123';

async function main() {
  if (users.length !== 50 || sourceProviders.length !== 25) throw new Error('Nguồn cần có 50 users và 25 providers mẫu.');
  const [userDocs, providerDocs] = await Promise.all([
    firestore.collection('users').get(),
    firestore.collection('providers').get()
  ]);
  const usersByEmail = new Map(userDocs.docs.map(doc => [String(doc.data().email || '').toLowerCase(), { id:doc.id, data:doc.data() }]));
  const occupiedUserIds = new Map(userDocs.docs.map(doc => [doc.id, doc.data()]));
  const userIdMap = new Map();
  let nextUser = 1;
  for (const user of users) {
    let id = usersByEmail.get(user.email.toLowerCase())?.id || user.id;
    if (occupiedUserIds.has(id) && occupiedUserIds.get(id).email !== user.email) {
      while (true) {
        id = `USR${String(nextUser++).padStart(3, '0')}`;
        if (!occupiedUserIds.has(id)) break;
      }
    }
    user.id = id;
    userIdMap.set(user.email, id);
    occupiedUserIds.set(id, { email:user.email });
  }
  const providerByUser = new Map(providerDocs.docs.map(doc => [doc.data().userId, { id:doc.id, data:doc.data() }]));
  const occupiedProviderIds = new Map(providerDocs.docs.map(doc => [doc.id, doc.data()]));
  const providers = sourceProviders.map(provider => {
    const email = originalUserEmails.get(provider.userId);
    if (!email) throw new Error(`Không tìm thấy user gốc cho ${provider.id}`);
    const userId = userIdMap.get(email);
    const existing = providerByUser.get(userId);
    let id = existing?.id || provider.id;
    if (occupiedProviderIds.has(id) && occupiedProviderIds.get(id).userId !== userId) {
      while (true) {
        id = `PRV${String(nextProvider++).padStart(3, '0')}`;
        if (!occupiedProviderIds.has(id)) break;
      }
    }
    occupiedProviderIds.set(id, { userId });
    return { ...provider, id, userId };
  });
  const authUsers = await Promise.all(users.map(async user => {
    try { return await auth.getUserByEmail(user.email); }
    catch (err) {
      if (err.code !== 'auth/user-not-found') throw err;
      return await auth.createUser({ email:user.email, password, displayName:user.name, emailVerified:true });
    }
  }));
  const authByEmail = new Map(authUsers.map(record => [record.email.toLowerCase(), record]));
  const batch = firestore.batch();
  for (const user of users) {
    const { password: _password, ...profile } = user;
    const record = authByEmail.get(user.email.toLowerCase());
    await auth.setCustomUserClaims(record.uid, { role:user.role });
    batch.set(firestore.collection('users').doc(user.id), { ...profile, uid:record.uid });
  }
  for (const provider of providers) batch.set(firestore.collection('providers').doc(provider.id), provider);
  await batch.commit();
  console.log(`Đã ghi Firebase: ${users.filter(u => u.role === 'Customer').length} customer, ${providers.length} provider (tổng ${users.length} tài khoản).`);
  console.log(`Mật khẩu: ${password}`);
}
let nextProvider = 1;
main().then(() => process.exit(0)).catch(err => { console.error('Tạo dữ liệu Firebase thất bại:', err.message); process.exit(1); });
