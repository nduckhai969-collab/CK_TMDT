
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

function loadCredential() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    return admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT));
  }
  const file = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (file) {
    const abs = path.resolve(__dirname, file);
    if (!fs.existsSync(abs)) {
      throw new Error(`Không tìm thấy service account: ${abs}`);
    }
    return admin.credential.cert(JSON.parse(fs.readFileSync(abs, 'utf8')));
  }

  return admin.credential.applicationDefault();
}

if (!admin.apps.length) {
  admin.initializeApp({ credential: loadCredential() });
}

const firestore = admin.firestore();
firestore.settings({ ignoreUndefinedProperties: true });
const auth = admin.auth();

module.exports = { admin, firestore, auth };
