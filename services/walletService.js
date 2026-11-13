const db = require('../data/db');
const { generateId } = require('../utils/id');
const { formatDateTime, parseDateTime } = require('../utils/dates');

const MIN_WITHDRAWAL = 50000;
const BALANCE_TRANSACTION_TYPES = new Set([
  'opening_balance_adjustment', 'wallet_reconciliation', 'deposit', 'refund', 'escrow',
  'order_payment', 'withdraw', 'withdrawal_refund', 'disbursement', 'earning', 'penalty',
  'package_purchase', 'payout_settlement', 'payout_refund', 'refund_reversal'
]);
let mutationQueue = Promise.resolve();

function serializeMutation(work) {
  const result = mutationQueue.then(work);
  mutationQueue = result.catch(() => {});
  return result;
}

function formatVND(value) {
  return `${Math.round(Number(value) || 0).toLocaleString('vi-VN')}đ`;
}

function providerForUser(userId) {
  return (db.getCollection('providers') || []).find(p => p.userId === userId || p.id === userId) || null;
}

function timestampForSort(value) {
  const parsed = parseDateTime(value?.createdAtISO || value?.createdAt || value?.date);
  return parsed ? parsed.getTime() : 0;
}

async function saveCollections(changes) {
  for (const [name, rows] of changes) {
    if (typeof db.saveCollectionAndWait === 'function') await db.saveCollectionAndWait(name, rows);
    else db.saveCollection(name, rows);
  }
}

function transactionAffectsBalance(transaction) {
  if (transaction.walletAffectsBalance === false) return false;
  const type = String(transaction.type || '').toLowerCase();
  if (!BALANCE_TRANSACTION_TYPES.has(type)) return false;
  if (['withdraw', 'payout_settlement'].includes(type)) return true;
  return ['completed', 'success', 'paid'].includes(String(transaction.status || '').toLowerCase());
}

function reconcileWalletLedger(user, users, transactions) {
  let ledgerBalance = transactions
    .filter(transaction => transaction.userId === user.id && transactionAffectsBalance(transaction))
    .reduce((sum, transaction) => sum + (Number(transaction.amount) || 0), 0);
  const currentBalance = Number(user.balance) || 0;
  const adjustment = Math.round((currentBalance - ledgerBalance) * 100) / 100;
  if (!user.walletLedgerInitializedAt) {
    if (Math.abs(adjustment) >= 1) {
      transactions.unshift({
        id: generateId('TXN'),
        userId: user.id,
        providerId: providerForUser(user.id)?.id || user.id,
        type: 'opening_balance_adjustment',
        amount: adjustment,
        balanceAfter: currentBalance,
        status: 'completed',
        walletAffectsBalance: true,
        description: 'Số dư đầu kỳ được đối chiếu một lần khi chuyển sang sổ giao dịch.',
        createdAt: formatDateTime(new Date()),
        createdAtISO: new Date().toISOString()
      });
      ledgerBalance += adjustment;
    }
    user.walletLedgerInitializedAt = new Date().toISOString();
    db.saveCollection('walletTransactions', transactions);
  }
  ledgerBalance = Math.round(ledgerBalance);
  if (Number(user.balance) !== ledgerBalance) {
    user.balance = ledgerBalance;
    db.saveCollection('users', users);
  }
  return ledgerBalance;
}

function getWallet(user) {
  const provider = providerForUser(user.id);
  const providerIds = new Set([user.id, provider?.id].filter(Boolean));
  const orders = (db.getCollection('orders') || []).filter(order => providerIds.has(order.providerId));
  const users = db.getCollection('users') || [];
  const walletUser = users.find(row => row.id === user.id) || user;
  const allTransactions = db.getCollection('walletTransactions') || [];
  const balance = reconcileWalletLedger(walletUser, users, allTransactions);
  const transactions = allTransactions
    .filter(transaction => transaction.userId === user.id)
    .sort((a, b) => timestampForSort(b) - timestampForSort(a));
  const payouts = (db.getCollection('payouts') || [])
    .filter(payout => payout.userId === user.id || providerIds.has(payout.providerId))
    .sort((a, b) => timestampForSort(b) - timestampForSort(a));
  const cumulativeEarnings = Math.max(0, transactions
    .filter(t => ['disbursement', 'earning'].includes(t.type) && t.status === 'completed')
    .reduce((sum, t) => sum + Math.max(0, Number(t.amount) || 0), 0)
    - transactions.filter(t => t.type === 'penalty' && t.status === 'completed')
      .reduce((sum, t) => sum + Math.abs(Math.min(0, Number(t.amount) || 0)), 0));
  const escrowHeld = orders
    .filter(o => ['escrow_held', 'disputed'].includes(o.escrowStatus))
    .reduce((sum, o) => sum + Math.max(0, Number(o.escrowDeposit) || Number(o.price) || 0), 0);
  const payoutStatements = (db.getCollection('payout_statements') || [])
    .filter(statement => providerIds.has(statement.providerId));
  const pendingWithdrawals = payouts
    .filter(p => p.status === 'pending')
    .reduce((sum, p) => sum + Math.max(0, Number(p.amountNum) || Number(String(p.amount || '').replace(/[^0-9.-]/g, '')) || 0), 0)
    + payoutStatements.filter(statement => String(statement.status).toUpperCase() === 'PENDING')
      .reduce((sum, statement) => sum + Math.max(0, Number(statement.amount) || 0), 0);

  return {
    balance,
    balanceFormatted: formatVND(balance),
    escrowHeld,
    escrowHeldFormatted: formatVND(escrowHeld),
    cumulativeEarnings,
    cumulativeEarningsFormatted: formatVND(cumulativeEarnings),
    pendingWithdrawals,
    pendingWithdrawalsFormatted: formatVND(pendingWithdrawals),
    bankAccount: provider?.bankAccount || null,
    transactions,
    payoutHistory: [
      ...payouts.map(p => ({
      id: p.id,
      date: p.date || p.createdAt || '',
      amount: p.amount || formatVND(p.amountNum),
      amountNum: Number(p.amountNum) || 0,
      bank: p.bank || '',
      account: p.account || '',
      status: p.status,
      rejectReason: p.rejectReason || ''
      })),
      ...payoutStatements.map(statement => ({
        id: statement.id,
        date: statement.createdAt || '',
        amount: formatVND(statement.amount),
        amountNum: Number(statement.amount) || 0,
        bank: statement.bankName || '',
        account: statement.bankAccount || '',
        status: String(statement.status).toUpperCase() === 'COMPLETED' ? 'paid' : String(statement.status).toUpperCase() === 'FAILED' ? 'rejected' : 'pending',
        rejectReason: statement.failureReason || ''
      }))
    ].sort((a, b) => timestampForSort(b) - timestampForSort(a))
  };
}

function requestWithdrawal(userId, amount) {
  return serializeMutation(async () => {
    const users = db.getCollection('users') || [];
    const user = users.find(row => row.id === userId);
    const provider = providerForUser(userId);
    const transactions = db.getCollection('walletTransactions') || [];
    const ledgerBalance = user && provider ? reconcileWalletLedger(user, users, transactions) : 0;
    if (!user || !provider) throw Object.assign(new Error('Không tìm thấy tài khoản Provider.'), { status: 404 });

    const numericAmount = Number(amount);
    if (!Number.isSafeInteger(numericAmount) || numericAmount < MIN_WITHDRAWAL) {
      throw Object.assign(new Error(`Số tiền rút tối thiểu là ${formatVND(MIN_WITHDRAWAL)}.`), { status: 400 });
    }
    const bank = provider.bankAccount || {};
    if (!String(bank.bank || '').trim() || !String(bank.account || '').trim() || !String(bank.holder || '').trim()) {
      throw Object.assign(new Error('Vui lòng cập nhật đầy đủ ngân hàng, số tài khoản và tên chủ tài khoản trước khi rút.'), { status: 400 });
    }
    const balance = ledgerBalance;
    if (numericAmount > balance) throw Object.assign(new Error('Số dư khả dụng không đủ để rút.'), { status: 400 });

    const payouts = db.getCollection('payouts') || [];
    const now = new Date();
    const id = generateId('WD');
    const updatedUser = { ...user, balance: balance - numericAmount };
    const payout = {
      id,
      userId,
      providerId: provider.id,
      provider: provider.name || user.name,
      bank: bank.bank,
      account: bank.account,
      accountHolder: bank.holder,
      amount: formatVND(numericAmount),
      amountNum: numericAmount,
      date: formatDateTime(now),
      createdAt: now.toISOString(),
      status: 'pending'
    };
    const transaction = {
      id: generateId('TXN'),
      userId,
      providerId: provider.id,
      payoutId: id,
      type: 'withdraw',
      amount: -numericAmount,
      balanceAfter: updatedUser.balance,
      status: 'pending',
      bankCode: bank.bank,
      bankAccount: bank.account,
      createdAt: formatDateTime(now),
      description: `Yêu cầu rút ${formatVND(numericAmount)} về ${bank.bank}`
    };

    const oldUsers = JSON.parse(JSON.stringify(users));
    const oldPayouts = JSON.parse(JSON.stringify(payouts));
    const oldTransactions = JSON.parse(JSON.stringify(transactions));
    users[users.findIndex(row => row.id === userId)] = updatedUser;
    payouts.unshift(payout);
    transactions.unshift(transaction);
    try {
      await saveCollections([['users', users], ['payouts', payouts], ['walletTransactions', transactions]]);
    } catch (error) {
      await saveCollections([['users', oldUsers], ['payouts', oldPayouts], ['walletTransactions', oldTransactions]]).catch(() => {});
      throw error;
    }
    return payout;
  });
}

function settleWithdrawal(payoutId, action, reason = '') {
  return serializeMutation(async () => {
    const payouts = db.getCollection('payouts') || [];
    const payout = payouts.find(row => row.id === payoutId);
    if (!payout) throw Object.assign(new Error('Yêu cầu rút tiền không tồn tại.'), { status: 404 });
    if (payout.status !== 'pending') {
      throw Object.assign(new Error('Yêu cầu này đã được xử lý trước đó.'), { status: 409 });
    }

    const users = db.getCollection('users') || [];
    const transactions = db.getCollection('walletTransactions') || [];
    const oldPayouts = JSON.parse(JSON.stringify(payouts));
    const oldUsers = JSON.parse(JSON.stringify(users));
    const oldTransactions = JSON.parse(JSON.stringify(transactions));
    const now = new Date();
    const amount = Math.max(0, Number(payout.amountNum) || 0);
    const provider = (db.getCollection('providers') || []).find(row => row.id === payout.providerId);
    const user = users.find(row => row.id === payout.userId) || users.find(row => row.id === provider?.userId);
    payout.status = action === 'approve' ? 'paid' : 'rejected';
    if (action === 'approve') {
      payout.paidAt = now.toISOString();
    } else {
      payout.rejectReason = String(reason || 'Thông tin nhận tiền cần được kiểm tra.').trim();
      payout.rejectedAt = now.toISOString();
      if (user) {
        user.balance = (Number(user.balance) || 0) + amount;
        const refund = {
          id: generateId('TXN'),
          userId: user.id,
          providerId: payout.providerId,
          payoutId: payout.id,
          type: 'withdrawal_refund',
          amount,
          balanceAfter: user.balance,
          status: 'completed',
          createdAt: formatDateTime(now),
          description: `Hoàn lại khoản rút bị từ chối ${payout.id}`
        };
        transactions.unshift(refund);
      }
    }
    const withdrawalTxn = transactions.find(t => t.payoutId === payout.id && t.type === 'withdraw');
    if (withdrawalTxn) {
      withdrawalTxn.status = payout.status;
      withdrawalTxn.updatedAt = formatDateTime(now);
    }
    try {
      await saveCollections([['payouts', payouts], ['users', users], ['walletTransactions', transactions]]);
    } catch (error) {
      await saveCollections([['payouts', oldPayouts], ['users', oldUsers], ['walletTransactions', oldTransactions]]).catch(() => {});
      throw error;
    }
    return payout;
  });
}

module.exports = { MIN_WITHDRAWAL, getWallet, requestWithdrawal, settleWithdrawal };
