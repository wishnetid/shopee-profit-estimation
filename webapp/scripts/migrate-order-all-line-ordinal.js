#!/usr/bin/env node

/**
 * Extend the existing Order.all current-state identity with a source-line
 * occurrence ordinal. Shopee exports can contain several lines with the same
 * order, SKU, variation, and discounted price; those must remain separate.
 *
 * Dry-run is read-only. Apply requires --apply and --confirm-ddl because DDL
 * can implicit-commit in MySQL/MariaDB.
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const INDEX_NAME = 'uk_order_item_store_price';
// These were historical uniqueness constraints before price and source-line
// ordinal became part of Order.all identity. Keeping either one makes MySQL
// upsert an ordinal 2+ line into ordinal 1 instead of inserting it.
const LEGACY_CONFLICTING_UNIQUE_INDEXES = Object.freeze([
  'uk_order_item_store',
  'uk_order_item',
]);
const IDENTITY = Object.freeze([
  'store_id',
  'no_pesanan',
  'nomor_referensi_sku',
  'nama_variasi',
  'harga_setelah_diskon',
  'line_ordinal',
]);

function isApplyConfirmed(argv = process.argv.slice(2)) {
  return argv.includes('--apply') && argv.includes('--confirm-ddl');
}

function loadEnv(file = path.join(process.cwd(), '.env.local')) {
  if (!fs.existsSync(file)) return {};
  const env = {};
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    env[match[1]] = value;
  }
  return env;
}

function databaseConfig(env) {
  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = env;
  if (!DB_HOST || !DB_USER || !DB_PASSWORD || !DB_NAME) throw new Error('Database configuration is incomplete.');
  return {
    host: DB_HOST,
    port: Number(DB_PORT || 3306),
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    dateStrings: true,
  };
}

function indexDefinition(rows, indexName = INDEX_NAME) {
  const indexRows = rows
    .filter((row) => row.index_name === indexName)
    .sort((left, right) => Number(left.seq_in_index) - Number(right.seq_in_index));
  return {
    exists: indexRows.length > 0,
    nonUnique: indexRows.length ? Number(indexRows[0].non_unique) : null,
    columns: indexRows.map((row) => row.column_name),
  };
}

function legacyConflictingUniqueIndexes(rows) {
  return LEGACY_CONFLICTING_UNIQUE_INDEXES.filter((indexName) => {
    const definition = indexDefinition(rows, indexName);
    return definition.exists && definition.nonUnique === 0;
  });
}

function hasExpectedIndex(index) {
  return index.exists
    && index.nonUnique === 0
    && JSON.stringify(index.columns) === JSON.stringify(IDENTITY);
}

async function inspect(conn) {
  const [columns] = await conn.query(`
    SELECT column_name, column_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'order_all'
    ORDER BY ordinal_position
  `);
  const [indexes] = await conn.query(`
    SELECT index_name, non_unique, seq_in_index, column_name
    FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'order_all'
    ORDER BY index_name, seq_in_index
  `);
  const [[counts]] = await conn.query(`
    SELECT
      COUNT(*) AS row_count,
      SUM(line_ordinal IS NULL OR line_ordinal < 1) AS invalid_ordinal_rows
    FROM order_all
  `).catch((error) => {
    if (error.code === 'ER_BAD_FIELD_ERROR') return [[{ row_count: null, invalid_ordinal_rows: null }]];
    throw error;
  });
  const ordinalColumn = columns.find((row) => row.column_name === 'line_ordinal');
  return {
    rowCount: counts.row_count == null ? null : Number(counts.row_count),
    lineOrdinal: ordinalColumn ? {
      exists: true,
      columnType: ordinalColumn.column_type,
      isNullable: ordinalColumn.is_nullable === 'YES',
      defaultValue: ordinalColumn.column_default,
      invalidRows: Number(counts.invalid_ordinal_rows || 0),
    } : { exists: false, columnType: null, isNullable: null, defaultValue: null, invalidRows: null },
    index: indexDefinition(indexes),
    legacyConflictingUniqueIndexes: legacyConflictingUniqueIndexes(indexes),
  };
}

function assertReady(state) {
  if (state.lineOrdinal.exists && state.lineOrdinal.invalidRows > 0) {
    throw new Error(`Migration stopped: ${state.lineOrdinal.invalidRows} row(s) have an invalid line_ordinal.`);
  }
  if (state.index.exists && state.index.nonUnique !== 0) {
    throw new Error(`${INDEX_NAME} exists but is not unique.`);
  }
}

function assertFinalIdentityState(state) {
  assertReady(state);
  if (!state.lineOrdinal.exists || state.lineOrdinal.isNullable || !hasExpectedIndex(state.index)) {
    throw new Error('Migration verification failed: Order.all line identity is incomplete.');
  }
  if (state.legacyConflictingUniqueIndexes.length > 0) {
    throw new Error(`Migration verification failed: legacy conflicting unique index(es) remain: ${state.legacyConflictingUniqueIndexes.join(', ')}.`);
  }
}

async function main(argv = process.argv.slice(2)) {
  const apply = isApplyConfirmed(argv);
  const conn = await mysql.createConnection(databaseConfig({ ...loadEnv(), ...process.env }));
  try {
    const before = await inspect(conn);
    assertReady(before);
    if (!apply) {
      console.log(JSON.stringify({
        mode: 'dry-run',
        applyRequires: ['--apply', '--confirm-ddl'],
        plannedActions: [
          'ADD COLUMN line_ordinal INT UNSIGNED NOT NULL DEFAULT 1 when missing',
          `DROP INDEX ${INDEX_NAME} and recreate it with (${IDENTITY.join(', ')}) when needed`,
          `DROP legacy conflicting unique indexes when present: ${LEGACY_CONFLICTING_UNIQUE_INDEXES.join(', ')}`,
        ],
        before,
      }, null, 2));
      return;
    }

    const applied = [];
    if (!before.lineOrdinal.exists) {
      await conn.query('ALTER TABLE order_all ADD COLUMN line_ordinal INT UNSIGNED NOT NULL DEFAULT 1 AFTER updated_at');
      applied.push('added line_ordinal');
    }

    let current = await inspect(conn);
    assertReady(current);
    if (!hasExpectedIndex(current.index)) {
      if (current.index.exists) {
        await conn.query(`ALTER TABLE order_all DROP INDEX ${INDEX_NAME}`);
        applied.push(`dropped ${INDEX_NAME}`);
      }
      await conn.query(`ALTER TABLE order_all ADD UNIQUE KEY ${INDEX_NAME} (${IDENTITY.join(', ')})`);
      applied.push(`created ${INDEX_NAME}`);
    }

    current = await inspect(conn);
    for (const indexName of current.legacyConflictingUniqueIndexes) {
      await conn.query(`ALTER TABLE order_all DROP INDEX ${indexName}`);
      applied.push(`dropped legacy conflicting ${indexName}`);
    }

    const after = await inspect(conn);
    assertFinalIdentityState(after);
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
  IDENTITY,
  INDEX_NAME,
  LEGACY_CONFLICTING_UNIQUE_INDEXES,
  assertFinalIdentityState,
  assertReady,
  databaseConfig,
  inspect,
  isApplyConfirmed,
  legacyConflictingUniqueIndexes,
  loadEnv,
  main,
};
