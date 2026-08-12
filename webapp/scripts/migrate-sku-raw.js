#!/usr/bin/env node

const { createConnection } = require('mysql2/promise');

const TABLES = {
  sku_report_imports: `
    CREATE TABLE IF NOT EXISTS sku_report_imports (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      source_file VARCHAR(255) NOT NULL,
      source_sha256 CHAR(64) NOT NULL,
      sheet_name VARCHAR(255) NOT NULL,
      headers_payload JSON NOT NULL,
      warnings_payload JSON DEFAULT NULL,
      imported_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_sku_report_import_sha256 (source_sha256),
      KEY idx_sku_report_imported_at (imported_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  sku_master_raw: `
    CREATE TABLE IF NOT EXISTS sku_master_raw (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      sku_report_import_id BIGINT UNSIGNED NOT NULL,
      source_excel_row INT NOT NULL,
      sku1 VARCHAR(255) DEFAULT NULL,
      sku2 VARCHAR(255) DEFAULT NULL,
      harga DECIMAL(18,2) DEFAULT NULL,
      idproduk VARCHAR(255) DEFAULT NULL,
      raw_payload JSON NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uk_sku_master_raw_source (sku_report_import_id, source_excel_row),
      KEY idx_sku_master_raw_sku1 (sku1),
      KEY idx_sku_master_raw_sku2 (sku2),
      KEY idx_sku_master_raw_idproduk (idproduk),
      CONSTRAINT fk_sku_master_raw_import
        FOREIGN KEY (sku_report_import_id) REFERENCES sku_report_imports(id)
        ON DELETE RESTRICT ON UPDATE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
};

async function main() {
  const apply = process.argv.includes('--apply');
  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;
  if (!DB_HOST || !DB_USER || !DB_PASSWORD || !DB_NAME) {
    throw new Error('Database environment variables are incomplete');
  }
  const conn = await createConnection({
    host: DB_HOST,
    port: Number(DB_PORT || 3306),
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
  });
  try {
    const report = [];
    for (const table of Object.keys(TABLES)) {
      const [rows] = await conn.query('SHOW TABLES LIKE ?', [table]);
      report.push({ table, exists: rows.length > 0, action: rows.length ? 'unchanged' : apply ? 'create' : 'would_create' });
    }
    if (apply) {
      await conn.beginTransaction();
      try {
        for (const ddl of Object.values(TABLES)) await conn.query(ddl);
        await conn.commit();
      } catch (error) {
        await conn.rollback();
        throw error;
      }
    }
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry_run', report }, null, 2));
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});

module.exports = { TABLES };
