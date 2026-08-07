#!/usr/bin/env node

const mysql = require('mysql2/promise');

const APPLY = process.argv.includes('--apply');
const REQUIRED_COLUMNS = {
  source_snapshot_at: 'DATETIME NULL',
  source_snapshot_file: 'VARCHAR(255) NULL',
};

function databaseConfig(env = process.env) {
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
  };
}

async function main() {
  const connection = await mysql.createConnection(databaseConfig());
  try {
    const [rows] = await connection.execute('SHOW COLUMNS FROM order_all');
    const existing = new Set(rows.map((row) => row.Field));
    const missing = Object.entries(REQUIRED_COLUMNS)
      .filter(([column]) => !existing.has(column));

    console.log(JSON.stringify({
      mode: APPLY ? 'apply' : 'dry-run',
      table: 'order_all',
      missing_columns: missing.map(([column]) => column),
    }, null, 2));

    if (!APPLY || missing.length === 0) return;

    for (const [column, definition] of missing) {
      await connection.execute(`ALTER TABLE order_all ADD COLUMN \`${column}\` ${definition}`);
    }
    console.log(JSON.stringify({ applied: true, added_columns: missing.map(([column]) => column) }));
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

module.exports = { REQUIRED_COLUMNS, databaseConfig };
