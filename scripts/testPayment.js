// Kiểm thử tự động luồng thanh toán (VNPay) - chạy: npm run test:payment   (hoặc: node scripts/testPayment.js)
// Không cần Firebase / VNPay thật: Firestore và Firebase Auth được thay bằng bản giả trong bộ nhớ,
// chữ ký VNPay được tạo bằng khóa demo cố định bên dưới (ghi đè VNPAY_* trong .env của bạn khi chạy test).
// Bao gồm: ví, đơn chờ thanh toán, callback Return/IPN, thanh toán lại, chống giả mạo, hết hạn,
// nạp ví, đặt trực tiếp 1 dịch vụ và lịch sử giao dịch.
const fs = require('fs'), crypto = require('crypto'), qs = require('querystring');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
process.env.PORT = '3992';
process.env.VNPAY_TMN_CODE = 'SKILLRENTAL';
process.env.VNPAY_HASH_SECRET = 'MYSECRETKEY1234567890';
delete process.env.VNPAY_URL;
delete process.env.VNPAY_RETURN_URL;
const store = {}, seed = JSON.parse(fs.readFileSync(ROOT + '/data/database.json', 'utf8'));
for (const [n, items] of Object.entries(seed)) { store[n] = {}; items.forEach((it, i) => { const { password, ...r } = it; store[n][it.id || ('k' + i)] = { ...r, _idx: i }; }); }
let auto = 0;
const firestore = { settings() {}, collection: (n) => ({ get: async () => ({ docs: Object.values(store[n] || {}).map(d => ({ data: () => JSON.parse(JSON.stringify(d)) })) }), doc: (id) => ({ _n: n, _id: id || ('a' + (++auto)), id: id || ('a' + auto) }) }),
  batch: () => { const ops = []; return { set: (r, d) => ops.push(['s', r, d]), delete: (r) => ops.push(['d', r]), commit: async () => ops.forEach(([t, r, d]) => { store[r._n] = store[r._n] || {}; if (t === 's') store[r._n][r._id] = JSON.parse(JSON.stringify(d)); else delete store[r._n][r._id]; }) }; } };
const auth = { verifyIdToken: async (t) => { const [uid, email, v] = String(t).split('|'); if (!uid || !email) throw new Error('bad'); return { uid, email, email_verified: v === '1' }; }, setCustomUserClaims: async () => {} };
const fbp = require.resolve(ROOT + '/firebase.js');
require.cache[fbp] = { id: fbp, filename: fbp, loaded: true, exports: { admin: {}, firestore, auth } };
require(ROOT + '/server.js');
const base = 'http://localhost:3992';
const call = async (m, u, tok, body) => { const r = await fetch(base + u, { method: m, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined }); const tx = await r.text(); let j; try { j = JSON.parse(tx); } catch (_) { j = { raw: tx.slice(0, 150) }; } return { s: r.status, j }; };
const users = seed.users, cust = users.find(u => u.id === 'USR003'), pUser = users.find(u => u.id === 'USR001'), pUser2 = users.find(u => u.id === 'USR002'), adm = users.find(u => u.role === 'Admin');
const T = (u) => `uid_${u.id}|${u.email}|1`;
let ok = 0, bad = 0; const t = (n, c, x) => { c ? ok++ : bad++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '   -> ' + String(JSON.stringify(x)).slice(0, 230))); };
const flush = () => require(ROOT + '/data/db').flush();
const bal = async (u) => (await call('GET', '/api/auth/me', T(u))).j.user.balance;
const getDoc = (c, id) => Object.values(store[c] || {}).find(d => d.id === id);
const notifs = (uid) => Object.values(store.notifications || {}).filter(n => n.userId === uid);


const SECRET = 'MYSECRETKEY1234567890';
const sortObj = (obj) => { const s = {}, k = Object.keys(obj).map(encodeURIComponent).sort(); k.forEach(x => { s[x] = encodeURIComponent(obj[decodeURIComponent(x)]).replace(/%20/g, '+'); }); return s; };
const toQs = (o) => Object.keys(o).map(k => k + '=' + o[k]).join('&');
const signedQuery = (p) => { const sorted = sortObj(p); const h = crypto.createHmac('sha512', SECRET).update(Buffer.from(toQs(sorted), 'utf-8')).digest('hex'); return toQs({ ...sorted, vnp_SecureHash: h }); };
const getTxn = (id) => Object.values(store.walletTransactions || {}).find(x => x.id === id);
const getOrder = (id) => Object.values(store.orders || {}).find(x => x.id === id);
const callbackQs = (txn, code = '00', amountOverride) => signedQuery({ vnp_Amount: (amountOverride !== undefined ? amountOverride : txn.amount) * 100, vnp_ResponseCode: code, vnp_TransactionStatus: code, vnp_TxnRef: txn.id, vnp_TransactionNo: '14' + Math.floor(Math.random() * 1e6), vnp_BankCode: 'NCB' });
const ret = async (qs) => { const r = await fetch(`${base}/api/payments/vnpay/return?${qs}`, { redirect: 'manual' }); return { s: r.status, loc: r.headers.get('location') || '' }; };
const ipn = async (qs) => (await (await fetch(`${base}/api/payments/vnpay/ipn?${qs}`)).json());
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  await sleep(700);
  const db = require(ROOT + '/data/db');
  const checkout = require(ROOT + '/services/checkoutService');
  const vnpay = require(ROOT + '/services/vnpayService');
  for (const u of [cust, pUser, pUser2, adm]) await call('POST', '/api/auth/login', T(u));
  let r;
  // ---- tìm các khung giờ trống của PRV001 trong 3 tuần tới ----
  const slots = [];
  for (const m of [0, 1]) { const d = new Date(); d.setMonth(d.getMonth() + m); const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const a = await call('GET', `/api/providers/PRV001/availability?month=${month}`); const av = a.j.availability || {};
    for (const date of Object.keys(av).sort()) for (const tm of av[date]) slots.push({ date, tm }); }
  console.log('khung giờ trống tìm được:', slots.length);
  let si = 0; const slot = () => slots[si++];
  const addCart = async (serviceId = 'SVC001', hours = 1) => call('POST', '/api/booking-list/items', T(cust), { serviceId, hours });
  const sched = (s) => ({ PRV001: { scheduledDate: s.date, scheduledTime: s.tm } });
  const TOTAL = 4725000;

  console.log('--- A. Thanh toán bằng số dư ví (không đổi hành vi) ---');
  await addCart(); const b0 = await bal(cust); let s1 = slot();
  r = await call('POST', '/api/booking-list/checkout', T(cust), { paymentMethod: 'Số dư tài khoản (Escrow)', customerPhone: '0911222333', schedulesByProvider: sched(s1) });
  t('ví: checkout 200 + đơn paid/escrow_held', r.s === 200 && r.j.orders[0].paymentStatus === 'paid' && r.j.orders[0].escrowStatus === 'escrow_held', r);
  await db.flush(); t('ví: trừ đúng giá + phí 5%', (await bal(cust)) === b0 - TOTAL, { b0 });
  t('ví: ghi sổ giao dịch "escrow" (-)', Object.values(store.walletTransactions).some(x => x.type === 'escrow' && x.amount === -TOTAL && x.userId === 'USR003'), 'x');
  t('ví: Provider (USR001) được báo đơn mới (đúng userId)', Object.values(store.notifications).some(n => n.userId === 'USR001' && /Đơn đặt lịch mới/.test(n.title)), 'x');
  r = await call('GET', '/api/booking-list', T(cust)); t('ví: giỏ được xóa', r.j.bookingList.items.length === 0, r.j);

  console.log('--- B. Thanh toán qua cổng VNPay: tạo đơn chờ thanh toán ---');
  await addCart(); const b1 = await bal(cust); let s2 = slot(); const notifBefore = Object.values(store.notifications).filter(n => n.userId === 'USR001').length;
  r = await call('POST', '/api/booking-list/checkout', T(cust), { paymentMethod: 'Ví VNPay / MoMo (Escrow)', customerPhone: '0911222333', schedulesByProvider: sched(s2) });
  t('VNPay: 200 + paymentUrl + requiresPayment', r.s === 200 && r.j.requiresPayment && /vnpayment\.vn.*vnp_SecureHash=/.test(r.j.paymentUrl || ''), r);
  const ord1 = r.j.orders[0], txn1 = getTxn(r.j.txnRef); await db.flush();
  t('đơn ở trạng thái CHỜ THANH TOÁN (pending / payment_pending)', ord1.paymentStatus === 'pending' && ord1.escrowStatus === 'payment_pending' && ord1.orderStatus === 'pending', ord1);
  t('chưa trừ ví', (await bal(cust)) === b1, { b1 });
  const q1 = new URL(r.j.paymentUrl).searchParams;
  t('URL: số tiền = tổng ký quỹ × 100', q1.get('vnp_Amount') === String(TOTAL * 100), q1.get('vnp_Amount'));
  t('URL: có hạn thanh toán (vnp_ExpireDate) và không ép kênh', !!q1.get('vnp_ExpireDate') && !q1.get('vnp_BankCode'), [...q1.keys()]);
  t('URL: chữ ký hợp lệ (verify bằng chính vnpayService)', vnpay.verifyQuery(Object.fromEntries(q1.entries())).valid, 'x');
  t('giao dịch pending gắn với đơn', txn1 && txn1.status === 'pending' && txn1.type === 'order_payment' && txn1.amount === TOTAL && txn1.orderIds[0] === ord1.id, txn1);
  t('Provider CHƯA được báo (đơn chưa trả tiền)', Object.values(store.notifications).filter(n => n.userId === 'USR001').length === notifBefore, 'x');
  r = await call('GET', '/api/providers/me/orders', T(pUser)); t('Provider KHÔNG thấy đơn chưa thanh toán', !r.j.orders.some(o => o.id === ord1.id), r.j.orders.map(o => o.id));
  r = await call('PUT', `/api/orders/${ord1.id}/accept`, T(pUser)); t('Provider không nhận được đơn chưa thanh toán → 409', r.s === 409, r);
  let s3 = slot();
  await addCart(); r = await call('POST', '/api/booking-list/checkout', T(cust), { paymentMethod: 'Ví VNPay / MoMo (Escrow)', schedulesByProvider: sched(s2) });
  t('khung giờ đang giữ chỗ cho đơn chờ thanh toán → 409 khi đặt trùng', r.s === 409, r);
  await call('DELETE', '/api/booking-list/items/SVC001', T(cust));
  for (const [label, code] of [['Chuyển khoản VietQR (Escrow)', 'VNPAYQR'], ['Thẻ Tín Dụng Quốc Tế (Escrow)', 'INTCARD']]) {
    await addCart(); const sx = slot();
    r = await call('POST', '/api/booking-list/checkout', T(cust), { paymentMethod: label, schedulesByProvider: sched(sx) });
    t(`${label} → kênh ${code} trên cổng VNPay`, r.s === 200 && new URL(r.j.paymentUrl).searchParams.get('vnp_BankCode') === code, r);
    await call('PUT', `/api/orders/${r.j.orders[0].id}/cancel`, T(cust), { reason: 'dọn' });
  }
  await db.flush();

  console.log('--- C. VNPay báo thành công (Return URL rồi IPN) ---');
  const okQs = callbackQs(txn1);
  r = await ret(okQs); await db.flush();
  t('Return → chuyển về trang đơn hàng (payment=success)', r.s === 302 && /customer_orders\.html\?payment=success&txn=/.test(r.loc), r);
  t('đơn chuyển sang đã thanh toán + ký quỹ', getOrder(ord1.id).paymentStatus === 'paid' && getOrder(ord1.id).escrowStatus === 'escrow_held', getOrder(ord1.id));
  t('giao dịch success', getTxn(txn1.id).status === 'success' && !!getTxn(txn1.id).paidAt, getTxn(txn1.id));
  t('số dư ví KHÔNG đổi (tiền đi qua cổng, không qua ví)', (await bal(cust)) === b1, { b1 });
  t('Provider giờ mới được báo đơn mới', Object.values(store.notifications).filter(n => n.userId === 'USR001').length === notifBefore + 1, 'x');
  r = await call('GET', '/api/providers/me/orders', T(pUser)); t('Provider thấy đơn đã thanh toán', r.j.orders.some(o => o.id === ord1.id), r.j.orders.map(o => o.id));
  const ipnR = await ipn(okQs); t('IPN gọi sau Return → 02 (đã xác nhận, không xử lý lại)', ipnR.RspCode === '02', ipnR);
  r = await ret(okQs); t('Return gọi lại → vẫn về trang thành công, không nhân đôi', /payment=success/.test(r.loc), r);
  await db.flush(); t('không có thông báo/đơn bị nhân đôi', Object.values(store.notifications).filter(n => n.userId === 'USR001').length === notifBefore + 1, 'x');
  r = await call('PUT', `/api/orders/${ord1.id}/accept`, T(pUser)); t('Provider nhận đơn đã thanh toán → 200', r.s === 200, r);

  console.log('--- D. Thanh toán thất bại / khách hủy trên cổng, rồi thanh toán lại ---');
  await addCart(); const s4 = slot(); const b2 = await bal(cust);
  r = await call('POST', '/api/booking-list/checkout', T(cust), { paymentMethod: 'Ví VNPay / MoMo (Escrow)', schedulesByProvider: sched(s4) });
  const ord2 = r.j.orders[0], txn2 = getTxn(r.j.txnRef);
  r = await ret(callbackQs(txn2, '24')); await db.flush();
  t('mã 24 (khách hủy) → payment=failed', /payment=failed/.test(r.loc) && /code=24/.test(r.loc), r);
  t('giao dịch failed, đơn vẫn chờ thanh toán, không trừ tiền', getTxn(txn2.id).status === 'failed' && getOrder(ord2.id).paymentStatus === 'pending' && (await bal(cust)) === b2, 'x');
  r = await call('GET', `/api/payments/status/${txn2.id}`, T(cust)); t('tra cứu trạng thái có thông điệp lý do', r.s === 200 && /hủy/.test(r.j.message || ''), r);
  r = await call('GET', `/api/payments/status/${txn2.id}`, T(pUser)); t('người khác không xem được giao dịch → 404', r.s === 404, r);
  r = await call('POST', `/api/payments/vnpay/orders/${ord2.id}`, T(pUser)); t('Provider không thanh toán hộ được → 403', r.s === 403, r);
  r = await call('POST', `/api/payments/vnpay/orders/${ord2.id}`, T(cust), { bankCode: 'VNPAYQR' }); const txn2b = getTxn(r.j.txnRef);
  t('thanh toán lại đơn đang chờ → URL mới (kênh VNPAYQR)', r.s === 200 && new URL(r.j.paymentUrl).searchParams.get('vnp_BankCode') === 'VNPAYQR' && txn2b.id !== txn2.id, r);
  r = await ret(callbackQs(txn2b)); await db.flush();
  t('trả thành công ở lần 2 → đơn paid', getOrder(ord2.id).paymentStatus === 'paid', getOrder(ord2.id));
  r = await call('POST', `/api/payments/vnpay/orders/${ord2.id}`, T(cust)); t('đơn đã trả không thanh toán lại được → 409', r.s === 409, r);

  console.log('--- E. Chống giả mạo ---');
  await addCart(); const s5 = slot();
  r = await call('POST', '/api/booking-list/checkout', T(cust), { paymentMethod: 'Ví VNPay / MoMo (Escrow)', schedulesByProvider: sched(s5) });
  const ord3 = r.j.orders[0], txn3 = getTxn(r.j.txnRef);
  let rsp = await ipn(callbackQs(txn3, '00', 10000)); t('trả sai số tiền → IPN 04 (từ chối)', rsp.RspCode === '04', rsp);
  rsp = await ipn(callbackQs(txn3).replace(/vnp_SecureHash=[0-9a-f]+/, 'vnp_SecureHash=deadbeef')); t('sai chữ ký → IPN 97', rsp.RspCode === '97', rsp);
  const forged = await fetch(`${base}/api/payments/vnpay/return?${callbackQs(txn3)}&vnp_Amount=100`, { redirect: 'manual' }); t('sửa tham số sau khi ký → bị từ chối (400)', forged.status === 400, forged.status);
  rsp = await ipn(signedQuery({ vnp_Amount: 100000, vnp_ResponseCode: '00', vnp_TxnRef: 'VNPKHONGCO' })); t('mã giao dịch không tồn tại → IPN 01', rsp.RspCode === '01', rsp);
  await db.flush(); t('đơn vẫn chờ thanh toán sau các lần giả mạo', getOrder(ord3.id).paymentStatus === 'pending' && getTxn(txn3.id).status === 'pending', 'x');

  console.log('--- F. Khách hủy đơn chưa thanh toán rồi VNPay mới báo thành công ---');
  const b3 = await bal(cust);
  r = await call('PUT', `/api/orders/${ord3.id}/cancel`, T(cust), { reason: 'Đổi ý' }); await db.flush();
  t('hủy đơn chờ thanh toán: không hoàn tiền, paymentStatus cancelled', r.s === 200 && getOrder(ord3.id).paymentStatus === 'cancelled' && (await bal(cust)) === b3, r);
  r = await ret(callbackQs(txn3)); await db.flush();
  t('VNPay trả tiền muộn → cộng vào ví (không mất tiền), đơn không sống lại', (await bal(cust)) === b3 + TOTAL && getOrder(ord3.id).orderStatus === 'cancelled', { b3, now: await bal(cust) });
  t('ghi sổ hoàn tiền vào ví', Object.values(store.walletTransactions).some(x => x.type === 'refund' && x.amount === TOTAL && /không còn chờ thanh toán/.test(x.description)), 'x');
  t('giao dịch ghi nhận creditedToWallet', getTxn(txn3.id).creditedToWallet === TOTAL, getTxn(txn3.id));

  console.log('--- G. Quá hạn thanh toán -> tự hủy, trả lại khung giờ ---');
  process.env.ORDER_PAYMENT_WINDOW_MINUTES = '0.00001';
  await addCart(); const s6 = slot();
  r = await call('POST', '/api/booking-list/checkout', T(cust), { paymentMethod: 'Ví VNPay / MoMo (Escrow)', schedulesByProvider: sched(s6) });
  const ord4 = r.j.orders[0], txn4 = getTxn(r.j.txnRef); process.env.ORDER_PAYMENT_WINDOW_MINUTES = '30';
  await sleep(50); r = await call('GET', '/api/orders', T(cust)); await db.flush();
  t('xem đơn → đơn quá hạn tự hủy (cancelled / payment_cancelled)', getOrder(ord4.id).orderStatus === 'cancelled' && getOrder(ord4.id).escrowStatus === 'payment_cancelled' && getOrder(ord4.id).cancelledBy === 'System', getOrder(ord4.id));
  t('giao dịch chờ chuyển sang expired', getTxn(txn4.id).status === 'expired', getTxn(txn4.id));
  t('khách được báo đơn hết hạn', Object.values(store.notifications).some(n => n.userId === 'USR003' && /hết hạn thanh toán/.test(n.title)), 'x');
  await addCart(); r = await call('POST', '/api/booking-list/checkout', T(cust), { paymentMethod: 'Số dư tài khoản (Escrow)', schedulesByProvider: sched(s6) });
  t('khung giờ đã được trả lại: đặt lại được', r.s === 200, r); await db.flush();

  console.log('--- H. Đặt trực tiếp 1 dịch vụ qua VNPay ---');
  const s7 = slot(); const b4 = await bal(cust);
  r = await call('POST', '/api/orders', T(cust), { providerId: 'PRV001', serviceId: 'SVC001', price: 1, hours: 1, scheduledDate: s7.date, scheduledTime: s7.tm, paymentMethod: 'Thẻ Tín Dụng Quốc Tế', customerPhone: '0911222333' });
  t('POST /orders + thẻ quốc tế → 201 + paymentUrl (INTCARD)', r.s === 201 && r.j.requiresPayment && new URL(r.j.paymentUrl).searchParams.get('vnp_BankCode') === 'INTCARD', r);
  t('giá do server tính (4.500.000, không theo price:1)', r.j.order && r.j.order.price === 4500000 && r.j.order.paymentStatus === 'pending', r.j.order);
  const dTxn = getTxn(r.j.txnRef); const dOrder = r.j.order; await db.flush(); t('chưa trừ ví', (await bal(cust)) === b4, 'x');
  await ret(callbackQs(dTxn)); await db.flush(); t('callback thành công → đơn paid', getOrder(dOrder.id).paymentStatus === 'paid', getOrder(dOrder.id));
  const s8 = slot(); r = await call('POST', '/api/orders', T(cust), { providerId: 'PRV001', serviceId: 'SVC001', price: 1, hours: 1, scheduledDate: s8.date, scheduledTime: s8.tm, paymentMethod: 'Số dư tài khoản' });
  console.log('   direct-wallet →', r.s, JSON.stringify(r.j).slice(0, 200)); t('POST /orders + số dư → vẫn ký quỹ từ ví', r.s === 201 && r.j.order && r.j.order.escrowStatus === 'escrow_held', r);

  console.log('--- I. Nạp ví ---');
  const dep = async (amount, bankCode) => call('POST', '/api/payments/vnpay/create', T(cust), { amount, bankCode });
  r = await dep(5000); t('nạp < 10.000đ bị từ chối', r.s === 400, r);
  r = await dep(60000000); t('nạp > 50.000.000đ bị từ chối', r.s === 400, r);
  r = await dep(12345.5); t('số tiền lẻ bị từ chối', r.s === 400, r);
  r = await dep(100000, 'VNPAYQR'); t('nạp hợp lệ + kênh QR', r.s === 200 && new URL(r.j.paymentUrl).searchParams.get('vnp_BankCode') === 'VNPAYQR', r);
  const depTxn = getTxn(r.j.txnRef); const b5 = await bal(cust);
  await ret(callbackQs(depTxn)); await ipn(callbackQs(depTxn)); await ret(callbackQs(depTxn)); await db.flush();
  t('nạp thành công: cộng ĐÚNG 1 lần dù callback lặp', (await bal(cust)) === b5 + 100000, { b5, now: await bal(cust) });
  r = await dep(50000); const dep2 = getTxn(r.j.txnRef); await ret(callbackQs(dep2, '24')); await db.flush();
  t('nạp thất bại: không cộng tiền, giao dịch failed', (await bal(cust)) === b5 + 100000 && getTxn(dep2.id).status === 'failed', 'x');
  r = await call('POST', '/api/payments/vnpay/create', T(cust), { amount: 50000, bankCode: 'HACK' }); const hk = getTxn(r.j.txnRef); t('kênh lạ bị bỏ qua (không truyền vào URL)', !new URL(r.j.paymentUrl).searchParams.get('vnp_BankCode'), r);

  console.log('--- J. Lịch sử giao dịch ---');
  r = await call('GET', '/api/payments/transactions', T(cust)); t('GET /payments/transactions', r.s === 200 && r.j.total > 5 && r.j.transactions.every(x => x.userId === undefined), r.s);
  const types = new Set(r.j.transactions.map(x => x.type)); t('có đủ loại: nạp ví, thanh toán đơn, ký quỹ, hoàn tiền', ['deposit', 'order_payment', 'escrow', 'refund'].every(x => types.has(x)), [...types]);
  r = await call('GET', '/api/payments/transactions?type=deposit&status=success', T(cust)); t('lọc theo loại + trạng thái', r.s === 200 && r.j.transactions.length >= 1 && r.j.transactions.every(x => x.type === 'deposit' && x.status === 'success'), r.j.total);
  r = await call('GET', '/api/payments/transactions?limit=2&offset=1', T(cust)); t('phân trang', r.s === 200 && r.j.transactions.length === 2, r.j.transactions.length);
  r = await call('GET', '/api/payments/transactions'); t('cần đăng nhập → 401', r.s === 401, r.s);
  r = await call('GET', '/api/payments/transactions', T(pUser)); t('mỗi người chỉ thấy giao dịch của mình', r.s === 200 && !r.j.transactions.some(x => x.description && /DH00/.test(x.description) && x.type === 'order_payment'), r.j.total);

  console.log(`\n==== ${ok} đạt, ${bad} lỗi ====`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
