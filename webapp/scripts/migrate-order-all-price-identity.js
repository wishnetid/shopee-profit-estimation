#!/usr/bin/env node

/**
 * Evolve Order.all physical current-state identity from:
 *   (store_id, no_pesanan, nomor_referensi_sku, nama_variasi)
 * to:
 *   (store_id, no_pesanan, nomor_referensi_sku, nama_variasi, harga_setelah_diskon)
 *
 * Shopee can split the same order/SKU/variation into separate promotion lines
 * with different discounted prices. The command is read-only by default.
 * MySQL/MariaDB DDL can implicit-commit, so apply is intentionally guarded by
 * both --apply and --confirm-ddl and must run only after a verified backup.
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const ORDER_ALL_PRICE_IDENTITY = Object.freeze([
  'store_id',
  'no_pesanan',
  'nomor_referensi_sku',
  'nama_variasi',
  'harga_setelah_diskon',
]);

const IDENTITY_COLUMN_DEFINITIONS = Object.freeze({
  store_id: 'BIGINT UNSIGNED NOT NULL',
  no_pesanan: 'VARCHAR(50) NOT NULL',
  nomor_referensi_sku: 'VARCHAR(100) NOT NULL',
  nama_variasi: 'VARCHAR(255) NOT NULL',
  harga_setelah_diskon: 'DECIMAL(15,2) NOT NULL',
});

const LEGACY_UNIQUE_INDEX = 'uk_order_item_store';
const PRICE_UNIQUE_INDEX = 'uk_order_item_store_price';

function isApplyConfirmed(argv = process.argv.slice(2)) {
  return argv.includes('--apply') && argv.includes('--confirm-ddl');
}

function loadEnv(file = path.join(process.cwd(), '.env.local')) {
  const env = {};
  if (!fs.existsSync(file)) return env;

  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
  return env;
}

function databaseConfig(env) {
  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = env;
  if (!DB_HOST || !DB_USER || !DB_PASSWORD || !DB_NAME) {
    throw new Error('Database configuration is incomplete.');
  }
  return {
    host: DB_HOST,
    port: Number(DB_PORT || 3306),
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    dateStrings: true,
  };
}

function describeIndex(indexRows, indexName) {
  const rows = indexRows
    .filter((row) => row.index_name === indexName)
    .sort((left, right) => Number(left.seq_in_index) - Number(right.seq_in_index));
  if (rows.length === 0) return { exists: false, columns: [], nonUnique: null };
  return {
    exists: true,
    columns: rows.map((row) => row.column_name),
    nonUnique: Number(rows[0].non_unique),
  };
}

function isExpectedUniqueIndex(index) {
  return index.exists
    && index.nonUnique === 0
    && JSON.stringify(index.columns) === JSON.stringify(ORDER_ALL_PRICE_IDENTITY);
}

function buildIdentityColumnStates(columnRows) {
  const byName = new Map(columnRows.map((row) => [row.column_name, row]));
  return Object.fromEntries(ORDER_ALL_PRICE_IDENTITY.map((column) => {
    const row = byName.get(column);
    return [column, {
      exists: Boolean(row),
      columnType: row?.column_type || null,
      isNullable: row ? row.is_nullable === 'YES' : null,
    }];
  }));
}

async function inspectOrderAllIdentity(conn) {
  const [columns] = await conn.query(`
    SELECT column_name, column_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'order_all'
    ORDER BY ordinal_position
  `);

  const [indexRows] = await conn.query(`
    SELECT index_name, non_unique, seq_in_index, column_name
    FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'order_all'
    ORDER BY index_name, seq_in_index
  `);

  const [[counts]] = await conn.query(`
    SELECT
      COUNT(*) AS row_count,
      SUM(store_id IS NULL) AS missing_store_id,
      SUM(no_pesanan IS NULL OR TRIM(no_pesanan) = '') AS missing_no_pesanan,
      SUM(nomor_referensi_sku IS NULL OR TRIM(nomor_referensi_sku) = '') AS missing_nomor_referensi_sku,
      SUM(nama_variasi IS NULL OR TRIM(nama_variasi) = '') AS missing_nama_variasi,
      SUM(harga_setelah_diskon IS NULL) AS null_harga_setelah_diskon
    FROM order_all
  `);
  const [[duplicateCounts]] = await conn.query(`
    SELECT
      COUNT(*) AS duplicate_group_count,
      COALESCE(SUM(group_count - 1), 0) AS duplicate_extra_rows
    FROM (
      SELECT COUNT(*) AS group_count
      FROM order_all
      GROUP BY store_id, no_pesanan, nomor_referensi_sku, nama_variasi, harga_setelah_diskon
      HAVING COUNT(*) > 1
    ) duplicate_groups
  `);

  return {
    expectedIdentity: [...ORDER_ALL_PRICE_IDENTITY],
    identityColumnStates: buildIdentityColumnStates(columns),
    identityComponentMissingCounts: {
      storeId: Number(counts.missing_store_id || 0),
      noPesanan: Number(counts.missing_no_pesanan || 0),
      nomorReferensiSku: Number(counts.missing_nomor_referensi_sku || 0),
      namaVariasi: Number(counts.missing_nama_variasi || 0),
      hargaSetelahDiskon: Number(counts.null_harga_setelah_diskon || 0),
    },
    rowCount: Number(counts.row_count),
    hasDiscountedPriceColumn: columns.some((row) => row.column_name === 'harga_setelah_diskon'),
    nullDiscountedPriceCount: Number(counts.null_harga_setelah_diskon || 0),
    duplicateFivePartKeyGroups: Number(duplicateCounts.duplicate_group_count),
    duplicateFivePartKeyExtraRows: Number(duplicateCounts.duplicate_extra_rows),
    legacyIndex: describeIndex(indexRows, LEGACY_UNIQUE_INDEX),
    priceIndex: describeIndex(indexRows, PRICE_UNIQUE_INDEX),
  };
}

function assertSafeToApply(state) {
  if (!state.hasDiscountedPriceColumn) {
    throw new Error('Migration stopped: order_all.harga_setelah_diskon is missing.');
  }
  for (const [column, columnState] of Object.entries(state.identityColumnStates || {})) {
    if (!columnState?.exists) {
      throw new Error(`Migration stopped: order_all.${column} is missing.`);
    }
  }
  for (const [component, missingCount] of Object.entries(state.identityComponentMissingCounts || {})) {
    if (Number(missingCount) > 0) {
      throw new Error(`Migration stopped: Order.all identity component ${component} has ${missingCount} blank/null row(s).`);
    }
  }
  if (state.nullDiscountedPriceCount > 0) {
    throw new Error('Migration stopped: harga_setelah_diskon contains NULL rows and cannot safely become identity.');
  }
  if (state.duplicateFivePartKeyGroups > 0) {
    throw new Error('Migration stopped: duplicate five-part Order.all keys must be resolved before index changes.');
  }
  if (state.priceIndex.exists && !isExpectedUniqueIndex(state.priceIndex)) {
    throw new Error('Migration stopped: existing uk_order_item_store_price does not match the expected unique identity.');
  }
}

function assertFinalIdentityState(state) {
  assertSafeToApply(state);
  for (const column of ORDER_ALL_PRICE_IDENTITY) {
    const columnState = state.identityColumnStates?.[column];
    if (!columnState || columnState.isNullable !== false) {
      throw new Error(`Migration verification failed: order_all.${column} must be NOT NULL.`);
    }
  }
}

function plannedNullabilityChanges(state) {
  return ORDER_ALL_PRICE_IDENTITY
    .filter((column) => state.identityColumnStates?.[column]?.isNullable !== false)
    .map((column) => `MODIFY COLUMN ${column} ${IDENTITY_COLUMN_DEFINITIONS[column]}`);
}

async function main(argv = process.argv.slice(2)) {
  const apply = isApplyConfirmed(argv);
  const env = { ...loadEnv(), ...process.env };
  const conn = await mysql.createConnection(databaseConfig(env));

  try {
    const before = await inspectOrderAllIdentity(conn);
    assertSafeToApply(before);
    const nullabilityChanges = plannedNullabilityChanges(before);

    if (!apply) {
      console.log(JSON.stringify({
        mode: 'dry-run',
        applyRequires: ['--apply', '--confirm-ddl'],
        plannedActions: [
          ...nullabilityChanges,
          `ADD UNIQUE KEY ${PRICE_UNIQUE_INDEX} (${ORDER_ALL_PRICE_IDENTITY.join(', ')}) when missing`,
          `DROP INDEX ${LEGACY_UNIQUE_INDEX} after replacement exists`,
        ],
        before,
      }, null, 2));
      return;
    }

    const applied = [];
    for (const column of ORDER_ALL_PRICE_IDENTITY) {
      if (before.identityColumnStates[column]?.isNullable === false) continue;
      await conn.query(`ALTER TABLE order_all MODIFY COLUMN ${column} ${IDENTITY_COLUMN_DEFINITIONS[column]}`);
      applied.push(`modified ${column} NOT NULL`);
    }

    const afterNullability = await inspectOrderAllIdentity(conn);
    assertFinalIdentityState(afterNullability);

    if (!afterNullability.priceIndex.exists) {
      await conn.query(`
        ALTER TABLE order_all
        ADD UNIQUE KEY ${PRICE_UNIQUE_INDEX}
          (store_id, no_pesanan, nomor_referensi_sku, nama_variasi, harga_setelah_diskon)
      `);
      applied.push(`added ${PRICE_UNIQUE_INDEX}`);
    }

    const afterAdd = await inspectOrderAllIdentity(conn);
    assertFinalIdentityState(afterAdd);
    if (!isExpectedUniqueIndex(afterAdd.priceIndex)) {
      throw new Error('Migration stopped: replacement unique index verification failed.');
    }

    if (afterAdd.legacyIndex.exists) {
      await conn.query(`ALTER TABLE order_all DROP INDEX ${LEGACY_UNIQUE_INDEX}`);
      applied.push(`dropped ${LEGACY_UNIQUE_INDEX}`);
    }

    const after = await inspectOrderAllIdentity(conn);
    assertFinalIdentityState(after);
    if (after.legacyIndex.exists || !isExpectedUniqueIndex(after.priceIndex)) {
      throw new Error('Migration verification failed: final Order.all index state is not safe.');
    }

    console.log(JSON.stringify({ mode: 'apply', applied, before, after }, null, 2));
  } finally {
    await conn.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = {
  IDENTITY_COLUMN_DEFINITIONS,
  LEGACY_UNIQUE_INDEX,
  ORDER_ALL_PRICE_IDENTITY,
  PRICE_UNIQUE_INDEX,
  assertFinalIdentityState,
  assertSafeToApply,
  databaseConfig,
  inspectOrderAllIdentity,
  isApplyConfirmed,
  loadEnv,
  main,
  plannedNullabilityChanges,
};
