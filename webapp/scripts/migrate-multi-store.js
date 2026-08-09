#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const STORES = [
  { slug: 'tacticalized', name: 'TACTICALIZED' },
  { slug: 'tacticality', name: 'TACTICALITY' },
  { slug: 'tacticalist', name: 'TACTICALIST' },
  { slug: 'tacticaluxe', name: 'TACTICALUXE' },
];
const DEFAULT_OWNER = { username: 'yogaimawan', displayName: 'Yogi Imawan' };

function loadEnv(file = path.join(process.cwd(), '.env.local')) {
  const env = {};
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
  return env;
}

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  return Number(rows[0].count) > 0;
}

async function indexExists(conn, table, indexName) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS count FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, indexName],
  );
  return Number(rows[0].count) > 0;
}

async function foreignKeyExists(conn, table, constraintName) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS count FROM information_schema.TABLE_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
    [table, constraintName],
  );
  return Number(rows[0].count) > 0;
}

async function tableExists(conn, table) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS count FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table],
  );
  return Number(rows[0].count) > 0;
}

async function count(conn, sql, params = []) {
  const [rows] = await conn.query(sql, params);
  return Number(rows[0].count ?? rows[0].rows ?? 0);
}

async function ensureTables(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      username VARCHAR(64) NOT NULL,
      display_name VARCHAR(160) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_users_username (username)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await conn.query(`
    CREATE TABLE IF NOT EXISTS stores (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      owner_user_id BIGINT UNSIGNED NOT NULL,
      store_name VARCHAR(160) NOT NULL,
      store_slug VARCHAR(80) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_stores_slug (store_slug),
      KEY idx_stores_owner (owner_user_id),
      CONSTRAINT fk_stores_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function seedStores(conn) {
  await conn.query(
    `INSERT INTO users (username, display_name) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE display_name = VALUES(display_name)`,
    [DEFAULT_OWNER.username, DEFAULT_OWNER.displayName],
  );
  const [[owner]] = await conn.query('SELECT id FROM users WHERE username = ? LIMIT 1', [DEFAULT_OWNER.username]);
  for (const store of STORES) {
    await conn.query(
      `INSERT INTO stores (owner_user_id, store_name, store_slug) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE store_name = VALUES(store_name), owner_user_id = VALUES(owner_user_id)`,
      [owner.id, store.name, store.slug],
    );
  }
  const [[defaultStore]] = await conn.query('SELECT id FROM stores WHERE store_slug = ? LIMIT 1', ['tacticalized']);
  return { ownerId: Number(owner.id), defaultStoreId: Number(defaultStore.id) };
}

async function addStoreColumns(conn) {
  if (!(await columnExists(conn, 'order_all', 'store_id'))) {
    await conn.query('ALTER TABLE order_all ADD COLUMN store_id BIGINT UNSIGNED NULL AFTER id');
  }
  if (!(await columnExists(conn, 'income_report_imports', 'store_id'))) {
    await conn.query('ALTER TABLE income_report_imports ADD COLUMN store_id BIGINT UNSIGNED NULL AFTER id');
  }
}

async function assignExistingData(conn, defaultStoreId) {
  const [orderUpdate] = await conn.query('UPDATE order_all SET store_id = ? WHERE store_id IS NULL', [defaultStoreId]);
  const [incomeUpdate] = await conn.query('UPDATE income_report_imports SET store_id = ? WHERE store_id IS NULL', [defaultStoreId]);
  return { orderRowsAssigned: orderUpdate.affectedRows, incomePackagesAssigned: incomeUpdate.affectedRows };
}

async function verifyScopedKeyConflicts(conn, projectedDefaultStoreId = null) {
  const orderStoreExpression = projectedDefaultStoreId == null ? 'store_id' : 'COALESCE(store_id, ?)';
  const incomeStoreExpression = projectedDefaultStoreId == null ? 'store_id' : 'COALESCE(store_id, ?)';
  const orderParams = projectedDefaultStoreId == null ? [] : [projectedDefaultStoreId];
  const incomeParams = projectedDefaultStoreId == null ? [] : [projectedDefaultStoreId];
  const [[orderConflict]] = await conn.query(`
    SELECT COUNT(*) AS count FROM (
      SELECT ${orderStoreExpression} AS scoped_store_id, no_pesanan, nomor_referensi_sku, nama_variasi, COUNT(*) AS duplicate_count
      FROM order_all
      GROUP BY scoped_store_id, no_pesanan, nomor_referensi_sku, nama_variasi
      HAVING duplicate_count > 1
      LIMIT 1
    ) conflicts
  `, orderParams);
  if (Number(orderConflict.count) > 0) {
    throw new Error('Migration stopped: duplicate scoped Order.all keys must be resolved before index changes.');
  }

  const [[incomeConflict]] = await conn.query(`
    SELECT COUNT(*) AS count FROM (
      SELECT ${incomeStoreExpression} AS scoped_store_id, source_sha256, COUNT(*) AS duplicate_count
      FROM income_report_imports
      GROUP BY scoped_store_id, source_sha256
      HAVING duplicate_count > 1
      LIMIT 1
    ) conflicts
  `, incomeParams);
  if (Number(incomeConflict.count) > 0) {
    throw new Error('Migration stopped: duplicate scoped Income hashes must be resolved before index changes.');
  }
}

async function ensureIndexesAndForeignKeys(conn) {
  // Add replacement indexes before dropping legacy uniqueness. If the new
  // scoped uniqueness fails, the old protection remains intact for retry.
  if (!(await indexExists(conn, 'order_all', 'uk_order_item_store'))) {
    await conn.query('ALTER TABLE order_all ADD UNIQUE KEY uk_order_item_store (store_id, no_pesanan, nomor_referensi_sku, nama_variasi)');
  }
  if (await indexExists(conn, 'order_all', 'uk_order_item')) await conn.query('ALTER TABLE order_all DROP INDEX uk_order_item');
  if (!(await indexExists(conn, 'order_all', 'idx_order_all_store'))) {
    await conn.query('ALTER TABLE order_all ADD KEY idx_order_all_store (store_id, waktu_pesanan_dibuat)');
  }

  if (!(await indexExists(conn, 'income_report_imports', 'uk_income_report_import_store_sha256'))) {
    await conn.query('ALTER TABLE income_report_imports ADD UNIQUE KEY uk_income_report_import_store_sha256 (store_id, source_sha256)');
  }
  if (await indexExists(conn, 'income_report_imports', 'uk_income_report_import_sha256')) {
    await conn.query('ALTER TABLE income_report_imports DROP INDEX uk_income_report_import_sha256');
  }
  if (!(await indexExists(conn, 'income_report_imports', 'idx_income_report_store'))) {
    await conn.query('ALTER TABLE income_report_imports ADD KEY idx_income_report_store (store_id, imported_at)');
  }

  if (!(await foreignKeyExists(conn, 'order_all', 'fk_order_all_store'))) {
    await conn.query('ALTER TABLE order_all ADD CONSTRAINT fk_order_all_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE RESTRICT');
  }
  if (!(await foreignKeyExists(conn, 'income_report_imports', 'fk_income_report_store'))) {
    await conn.query('ALTER TABLE income_report_imports ADD CONSTRAINT fk_income_report_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE RESTRICT');
  }
}

async function setNotNull(conn) {
  await conn.query('ALTER TABLE order_all MODIFY COLUMN store_id BIGINT UNSIGNED NOT NULL');
  await conn.query('ALTER TABLE income_report_imports MODIFY COLUMN store_id BIGINT UNSIGNED NOT NULL');
}

async function verify(conn) {
  const [stores] = await conn.query('SELECT id, store_name, store_slug FROM stores ORDER BY id');
  const [orderCounts] = await conn.query('SELECT store_id, COUNT(*) AS count FROM order_all GROUP BY store_id ORDER BY store_id');
  const [incomeCounts] = await conn.query('SELECT store_id, COUNT(*) AS count FROM income_report_imports GROUP BY store_id ORDER BY store_id');
  const nullOrders = await count(conn, 'SELECT COUNT(*) AS count FROM order_all WHERE store_id IS NULL');
  const nullIncome = await count(conn, 'SELECT COUNT(*) AS count FROM income_report_imports WHERE store_id IS NULL');
  if (nullOrders || nullIncome) throw new Error(`Verification failed: unassigned order_all=${nullOrders}, income_report_imports=${nullIncome}`);
  return { stores, orderCounts, incomeCounts, unassigned: { orderAll: nullOrders, incomePackages: nullIncome } };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const env = { ...loadEnv(), ...process.env };
  for (const key of ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']) {
    if (!env[key]) throw new Error(`Missing ${key}`);
  }
  const conn = await mysql.createConnection({
    host: env.DB_HOST,
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    dateStrings: true,
  });
  try {
    if (!apply) {
      console.log(JSON.stringify({ mode: 'dry_run', creates: ['users', 'stores'], adds: ['order_all.store_id', 'income_report_imports.store_id'], seeds: STORES, defaultAssignment: 'existing data → tacticalized' }, null, 2));
      return;
    }
    await ensureTables(conn);
    const seed = await seedStores(conn);
    await addStoreColumns(conn);
    await verifyScopedKeyConflicts(conn, seed.defaultStoreId);
    const assigned = await assignExistingData(conn, seed.defaultStoreId);
    await ensureIndexesAndForeignKeys(conn);
    await setNotNull(conn);
    const verification = await verify(conn);
    console.log(JSON.stringify({ mode: 'apply', seed, assigned, verification }, null, 2));
  } finally {
    await conn.end();
  }
}

main().catch((error) => { console.error(error.stack || error.message); process.exit(1); });

module.exports = { STORES, DEFAULT_OWNER };
