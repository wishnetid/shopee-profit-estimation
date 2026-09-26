#!/usr/bin/env node

/**
 * Preserve long Seller Centre Order.all statuses without truncation. Read-only
 * by default; the DDL path needs the two explicit confirmation flags.
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const TABLE = 'order_all';
const COLUMN = 'status_pesanan';
const TARGET_LENGTH = 255;
// Preserve current NULL semantics: an absent source status must not become an
// empty string merely because this migration widens its maximum length.
const TARGET_DEFINITION = `VARCHAR(${TARGET_LENGTH}) DEFAULT NULL`;

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
  return { host: DB_HOST, port: Number(DB_PORT || 3306), user: DB_USER, password: DB_PASSWORD, database: DB_NAME, dateStrings: true };
}

function parseVarcharLength(columnType) {
  const match = String(columnType || '').match(/^varchar\((\d+)\)$/i);
  return match ? Number(match[1]) : null;
}

function needsWidening(state) {
  return !state.exists || state.varcharLength === null || state.varcharLength < TARGET_LENGTH;
}

function assertReady(state) {
  if (!state.exists) throw new Error(`Migration stopped: ${TABLE}.${COLUMN} is missing.`);
  if (state.varcharLength === null || state.varcharLength < TARGET_LENGTH) {
    throw new Error(`Migration verification failed: ${TABLE}.${COLUMN} must be VARCHAR(${TARGET_LENGTH}) or wider.`);
  }
}

async function inspect(conn) {
  const [rows] = await conn.query(`
    SELECT column_name, column_type, character_maximum_length, is_nullable,
           character_set_name, collation_name
    FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?
  `, [TABLE, COLUMN]);
  const column = rows[0];
  if (!column) return { exists: false, varcharLength: null, isNullable: null, columnType: null };
  const [[source]] = await conn.query(`
    SELECT MAX(CHAR_LENGTH(status_pesanan)) AS max_stored_length
    FROM ${TABLE}
  `);
  return {
    exists: true,
    columnType: column.column_type,
    varcharLength: parseVarcharLength(column.column_type),
    characterMaximumLength: Number(column.character_maximum_length || 0),
    isNullable: column.is_nullable === 'YES',
    characterSet: column.character_set_name,
    collation: column.collation_name,
    maxStoredLength: Number(source.max_stored_length || 0),
  };
}

async function main(argv = process.argv.slice(2)) {
  const apply = isApplyConfirmed(argv);
  const conn = await mysql.createConnection(databaseConfig({ ...loadEnv(), ...process.env }));
  try {
    const before = await inspect(conn);
    if (!before.exists) throw new Error(`Migration stopped: ${TABLE}.${COLUMN} is missing.`);
    if (!apply) {
      console.log(JSON.stringify({
        mode: 'dry-run',
        applyRequires: ['--apply', '--confirm-ddl'],
        before,
        needsWidening: needsWidening(before),
        plannedActions: needsWidening(before) ? [`MODIFY COLUMN ${COLUMN} ${TARGET_DEFINITION}`] : [],
      }, null, 2));
      return;
    }
    const applied = [];
    if (needsWidening(before)) {
      await conn.query(`ALTER TABLE ${TABLE} MODIFY COLUMN ${COLUMN} ${TARGET_DEFINITION}`);
      applied.push(`modified ${COLUMN} to ${TARGET_DEFINITION}`);
    }
    const after = await inspect(conn);
    assertReady(after);
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

module.exports = { COLUMN, TABLE, TARGET_LENGTH, TARGET_DEFINITION, assertReady, databaseConfig, inspect, isApplyConfirmed, needsWidening, parseVarcharLength };
