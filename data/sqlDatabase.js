const mysql = require('mysql2/promise');
const { ensureMlTables, persistReviewAnalyses } = require('./mlResultsStore');

const clone = value => JSON.parse(JSON.stringify(value));

class SqlDatabase {
  constructor(collections, initialData) {
    this.collections = collections;
    this.initialData = initialData;
    this.cache = {};
    this.ready = false;
    this.queue = Promise.resolve();
    this.writeErrors = 0;
    this.pool = mysql.createPool({
      host: process.env.MYSQL_HOST || '127.0.0.1',
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'skillrental',
      waitForConnections: true,
      connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 10),
      charset: 'utf8mb4'
    });
  }

  async init() {
    await this.pool.query(`CREATE TABLE IF NOT EXISTS app_records (
      collection_name VARCHAR(64) NOT NULL,
      record_id VARCHAR(191) NOT NULL,
      position INT NOT NULL DEFAULT 0,
      payload JSON NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (collection_name, record_id),
      INDEX idx_app_records_position (collection_name, position)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await ensureMlTables(this.pool);

    const [[{ total }]] = await this.pool.query('SELECT COUNT(*) AS total FROM app_records');
    if (Number(total) === 0) {
      const relational = await this.readRelationalSeed();
      for (const name of this.collections) {
        const rows = relational[name]?.length ? relational[name] : (this.initialData[name] || []);
        if (rows.length) await this.replaceCollection(name, rows);
      }
    }
    for (const name of this.collections) await this.getCollectionFresh(name);
    await this.ensureSeedUserCredentials();
    // Keep the relational users table visible to SQL clients as well as the
    // app_records collection used by the existing application routes.
    await this.syncRelationalUsers(this.pool, this.cache.users || []);
    this.ready = true;
    console.log(`[db] Đã nạp MySQL: ${this.collections.length} collection, ${(this.cache.users || []).length} user.`);
  }

  async ensureSeedUserCredentials() {
    const users = this.cache.users || [];
    const seedUsers = this.initialData.users || [];
    let changed = false;
    let hashPassword;

    for (const seedUser of seedUsers) {
      const seedEmail = String(seedUser.email || '').trim().toLowerCase();
      const user = users.find(item => String(item.id) === String(seedUser.id) &&
        String(item.email || '').trim().toLowerCase() === seedEmail);
      if (!user) continue;

      if (!user.passwordHash && typeof user.password === 'string' && user.password) {
        if (user.password.startsWith('scrypt:')) {
          user.passwordHash = user.password;
        } else {
          if (!hashPassword) hashPassword = require('../utils/authTokens').hashPassword;
          user.passwordHash = await hashPassword(user.password);
        }
        delete user.password;
        changed = true;
      }

      if (!user.passwordHash && !user.password && (seedUser.passwordHash || seedUser.password)) {
        if (seedUser.passwordHash) {
          user.passwordHash = seedUser.passwordHash;
        } else {
          if (!hashPassword) hashPassword = require('../utils/authTokens').hashPassword;
          user.passwordHash = await hashPassword(seedUser.password);
        }
        changed = true;
      }

      if (user.emailVerified == null && seedUser.emailVerified != null) {
        user.emailVerified = Boolean(seedUser.emailVerified);
        changed = true;
      }
    }

    if (changed) await this.saveCollectionAndWait('users', users);
  }

  async readRelationalSeed() {
    const [users] = await this.pool.query('SELECT * FROM users ORDER BY created_at, id');
    const [providerRows] = await this.pool.query('SELECT p.*, u.name, u.email, u.phone, u.avatar FROM providers p JOIN users u ON u.id = p.user_id ORDER BY p.id');
    const [serviceRows] = await this.pool.query('SELECT * FROM services ORDER BY id');
    const [orders] = await this.pool.query('SELECT * FROM orders ORDER BY created_at, id');
    const [transactions] = await this.pool.query('SELECT * FROM wallet_transactions ORDER BY created_at, id');
    const [reviews] = await this.pool.query('SELECT * FROM reviews ORDER BY created_at, id');
    const dateValue = value => value instanceof Date ? value.toISOString() : value;
    const camel = (row, map) => Object.fromEntries(Object.entries(map).map(([key, column]) => [key, row[column]]));
    return {
      users: users.map(row => {
        const user = { id: row.id, uid: row.uid || '', name: row.name, email: row.email, phone: row.phone, role: row.role, balance: Number(row.balance), avatar: row.avatar, address: row.address, bio: row.bio, status: row.status, joinDate: dateValue(row.created_at) };
        if (typeof row.password === 'string' && row.password.startsWith('scrypt:')) user.passwordHash = row.password;
        else if (row.password) user.password = row.password;
        return user;
      }),
      providers: providerRows.map(row => ({ ...camel(row, { id: 'id', userId: 'user_id', specialty: 'specialty', category: 'category', hourlyRate: 'hourly_rate', rating: 'rating', reviewCount: 'review_count', completedOrders: 'completed_orders', location: 'location', verified: 'verified', badge: 'badge', availabilityStatus: 'availability_status', bio: 'bio' }), hourlyRate: Number(row.hourly_rate), rating: Number(row.rating), name: row.name, email: row.email, phone: row.phone, avatar: row.avatar })),
      services: serviceRows.map(row => ({ ...camel(row, { id: 'id', providerId: 'provider_id', title: 'title', price: 'price', duration: 'duration', category: 'category', description: 'description', status: 'status' }), price: Number(row.price) })),
      orders: orders.map(row => ({ ...camel(row, { id: 'id', customerId: 'customer_id', providerId: 'provider_id', serviceId: 'service_id', serviceTitle: 'service_title', price: 'price', platformFee: 'platform_fee', escrowDeposit: 'escrow_deposit', escrowStatus: 'escrow_status', orderStatus: 'order_status', paymentStatus: 'payment_status', paymentExpireAt: 'payment_expire_at', deadline: 'deadline', note: 'note', createdAt: 'created_at' }), price: Number(row.price), platformFee: Number(row.platform_fee), escrowDeposit: Number(row.escrow_deposit), paymentExpireAt: dateValue(row.payment_expire_at), deadline: dateValue(row.deadline), createdAt: dateValue(row.created_at) })),
      walletTransactions: transactions.map(row => ({ ...camel(row, { id: 'id', userId: 'user_id', orderId: 'order_id', type: 'type', amount: 'amount', balanceAfter: 'balance_after', method: 'method', status: 'status', description: 'description', createdAt: 'created_at' }), amount: Number(row.amount), balanceAfter: row.balance_after == null ? null : Number(row.balance_after), createdAt: dateValue(row.created_at) })),
      reviews: reviews.map(row => ({ ...camel(row, { id: 'id', orderId: 'order_id', customerId: 'customer_id', providerId: 'provider_id', rating: 'rating', content: 'content', reply: 'reply', createdAt: 'created_at' }), rating: Number(row.rating), createdAt: dateValue(row.created_at) }))
    };
  }

  getCollection(name) {
    if (!this.ready) console.warn(`[db] getCollection("${name}") trước db.init()`);
    return clone(this.cache[name] || []);
  }

  async getCollectionFresh(name) {
    await this.flush();
    const [rows] = await this.pool.execute(
      'SELECT payload FROM app_records WHERE collection_name = ? ORDER BY position ASC', [name]
    );
    this.cache[name] = rows.map(row => typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload);
    return clone(this.cache[name]);
  }

  saveCollection(name, items) {
    if (!Array.isArray(items)) return false;
    const next = this.prepare(items);
    this.cache[name] = next;
    const write = this.queue.then(() => this.replaceCollection(name, next));
    this.queue = write.catch(err => {
      this.writeErrors += 1;
      console.error(`[db] MySQL write failed (${name}):`, err.message);
    });
    return true;
  }

  async replaceCollection(name, items) {
    return this.replaceCollections({ [name]: items });
  }

  async replaceCollections(collections) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      for (const [name, incomingItems] of Object.entries(collections)) {
        let items = incomingItems;
        // Orders and order items are append-only business records. A request
        // can hold an older in-memory snapshot while another request commits;
        // preserve records already committed instead of replacing them with
        // that stale snapshot.
        if (name === 'orders' || name === 'order_items' || name === 'notifications') {
          const [existingRows] = await connection.execute(
            'SELECT payload FROM app_records WHERE collection_name = ? ORDER BY position ASC FOR UPDATE',
            [name]
          );
          const existingItems = existingRows.map(row => typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload);
          const incomingIds = new Set(items.map(item => String(item.id)));
          const missingItems = existingItems.filter(item => !incomingIds.has(String(item.id)));
          if (missingItems.length) {
            items = [...items, ...missingItems];
            collections[name] = items;
            this.cache[name] = items;
          }
        }
        await connection.execute('DELETE FROM app_records WHERE collection_name = ?', [name]);
        if (items.length) {
          const values = items.map((item, position) => [name, String(item.id), position, JSON.stringify(item)]);
          await connection.query('INSERT INTO app_records (collection_name, record_id, position, payload) VALUES ?', [values]);
        }
        if (name === 'reviews') await persistReviewAnalyses(connection, items);
        if (name === 'users') await this.syncRelationalUsers(connection, items);
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async syncRelationalUsers(connection, users) {
    for (const user of users) {
      if (!user.id || !user.email || !['Admin', 'Customer', 'Provider'].includes(user.role)) continue;
      const [conflicts] = await connection.execute(
        'SELECT id, email FROM users WHERE email = ? OR id = ?', [String(user.email), String(user.id)]
      );
      // Old SQL seeds can contain a different account with the same email;
      // leave that row intact rather than stealing its primary key or FK links.
      if (conflicts.some(row => String(row.id) !== String(user.id) || String(row.email).toLowerCase() !== String(user.email).toLowerCase())) continue;
      await connection.execute(
        `INSERT INTO users (id, name, email, phone, role, password, balance, avatar, address, bio, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), email = VALUES(email), phone = VALUES(phone),
           role = VALUES(role), password = VALUES(password), balance = VALUES(balance),
           avatar = VALUES(avatar), address = VALUES(address), bio = VALUES(bio), status = VALUES(status)`,
        [String(user.id), String(user.name || 'Người dùng').slice(0, 100), String(user.email).slice(0, 100),
          String(user.phone || '').slice(0, 20), user.role, user.passwordHash || user.password || null,
          Number(user.balance) || 0, user.avatar || null, user.address || null, user.bio || null, user.status || 'active']
      );
    }
  }

  async saveCollectionAndWait(name, items) {
    if (!Array.isArray(items)) return false;
    const next = this.prepare(items);
    this.cache[name] = next;
    const errorsBefore = this.writeErrors;
    const write = this.queue.then(() => this.replaceCollection(name, next));
    this.queue = write.catch(err => {
      this.writeErrors += 1;
      console.error(`[db] MySQL write failed (${name}):`, err.message);
    });
    await write;
    if (this.writeErrors > errorsBefore) throw new Error(`MySQL write failed for collection "${name}".`);
    return true;
  }

  async saveCollectionsAndWait(collections) {
    if (!collections || typeof collections !== 'object' || Array.isArray(collections)) {
      throw new TypeError('Collections to save must be an object of arrays.');
    }

    const prepared = {};
    const previous = {};
    for (const [name, items] of Object.entries(collections)) {
      if (!Array.isArray(items)) throw new TypeError(`Collection "${name}" must be an array.`);
      previous[name] = this.cache[name];
      prepared[name] = this.prepare(items);
      this.cache[name] = prepared[name];
    }

    const names = Object.keys(prepared);
    if (!names.length) return true;

    const write = this.queue.then(() => this.replaceCollections(prepared));
    this.queue = write.catch(error => {
      this.writeErrors += 1;
      console.error(`[db] MySQL write failed (${names.join(', ')}):`, error.message);
    });

    try {
      await write;
      return true;
    } catch (error) {
      // Keep in-memory reads aligned with the last committed data when this
      // write failed. Do not roll back a newer write queued after this one.
      for (const name of names) {
        if (this.cache[name] === prepared[name]) {
          if (previous[name] === undefined) delete this.cache[name];
          else this.cache[name] = previous[name];
        }
      }
      if (!error.status) error.status = 500;
      throw error;
    }
  }

  async saveCollectionsAtomic(changes) {
    const prepared = changes.map(([name, items]) => [name, this.prepare(items)]);
    const write = this.queue.then(async () => {
      const connection = await this.pool.getConnection();
      try {
        await connection.beginTransaction();
        for (const [name, items] of prepared) {
          await connection.execute('DELETE FROM app_records WHERE collection_name = ?', [name]);
          if (items.length) {
            const values = items.map((item, position) => [name, String(item.id), position, JSON.stringify(item)]);
            await connection.query('INSERT INTO app_records (collection_name, record_id, position, payload) VALUES ?', [values]);
          }
          if (name === 'users') await this.syncRelationalUsers(connection, items);
        }
        await connection.commit();
        for (const [name, items] of prepared) this.cache[name] = items;
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    });
    this.queue = write.catch(err => {
      this.writeErrors += 1;
      console.error('[db] Atomic MySQL write failed:', err.message);
    });
    await write;
    return true;
  }

  prepare(items) {
    const next = clone(items);
    next.forEach((item, index) => {
      if (item.id === undefined || item.id === null || item.id === '') {
        item.id = `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 9)}`;
      }
    });
    return next;
  }

  flush() { return this.queue; }
  async close() { await this.flush(); await this.pool.end(); }
  read() { return Object.fromEntries(this.collections.map(name => [name, this.getCollection(name)])); }
}

module.exports = SqlDatabase;
