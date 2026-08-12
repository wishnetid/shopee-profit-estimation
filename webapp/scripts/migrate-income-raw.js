#!/usr/bin/env node

const { createConnection } = require('mysql2/promise');

const TABLES = {
  income_report_imports: `
    CREATE TABLE IF NOT EXISTS income_report_imports (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      source_file VARCHAR(255) NOT NULL,
      source_sha256 CHAR(64) NOT NULL,
      report_period_from DATE DEFAULT NULL,
      report_period_to DATE DEFAULT NULL,
      summary_payload JSON NOT NULL,
      summary_total_yang_dilepas DECIMAL(18,2) DEFAULT NULL,
      reconciliation_order_signed_total DECIMAL(18,2) DEFAULT NULL,
      reconciliation_difference DECIMAL(18,2) DEFAULT NULL,
      reconciliation_status VARCHAR(32) NOT NULL,
      warnings_payload JSON DEFAULT NULL,
      imported_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_income_report_import_sha256 (source_sha256),
      KEY idx_income_report_period (report_period_from, report_period_to),
      KEY idx_income_report_imported_at (imported_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  income_penghasilan_raw: `
    CREATE TABLE IF NOT EXISTS income_penghasilan_raw (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      income_report_import_id BIGINT UNSIGNED NOT NULL,
      source_excel_row INT NOT NULL,
      lihat_berdasarkan VARCHAR(20) NOT NULL,
      no_pesanan VARCHAR(50) DEFAULT NULL,
      id_produk VARCHAR(50) DEFAULT NULL,
      nama_produk TEXT DEFAULT NULL,
      waktu_pesanan_dibuat DATE DEFAULT NULL,
      tanggal_dana_dilepaskan DATE DEFAULT NULL,
      signed_total DECIMAL(18,2) NOT NULL,
      raw_payload JSON NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uk_income_penghasilan_raw_source (income_report_import_id, source_excel_row),
      KEY idx_income_penghasilan_raw_view (income_report_import_id, lihat_berdasarkan),
      KEY idx_income_penghasilan_raw_order (no_pesanan),
      CONSTRAINT fk_income_penghasilan_raw_import
        FOREIGN KEY (income_report_import_id) REFERENCES income_report_imports(id)
        ON DELETE RESTRICT ON UPDATE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  income_adjustments_raw: `
    CREATE TABLE IF NOT EXISTS income_adjustments_raw (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      income_report_import_id BIGINT UNSIGNED NOT NULL,
      source_excel_row INT NOT NULL,
      no_pesanan_terhubung VARCHAR(50) DEFAULT NULL,
      tanggal_penyesuaian_dibuat DATE DEFAULT NULL,
      tanggal_dana_dilepaskan DATE DEFAULT NULL,
      biaya_penyesuaian DECIMAL(18,2) DEFAULT NULL,
      raw_payload JSON NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uk_income_adjustments_raw_source (income_report_import_id, source_excel_row),
      KEY idx_income_adjustments_raw_order (no_pesanan_terhubung),
      CONSTRAINT fk_income_adjustments_raw_import
        FOREIGN KEY (income_report_import_id) REFERENCES income_report_imports(id)
        ON DELETE RESTRICT ON UPDATE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  income_shipping_fee_discrepancies_raw: `
    CREATE TABLE IF NOT EXISTS income_shipping_fee_discrepancies_raw (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      income_report_import_id BIGINT UNSIGNED NOT NULL,
      source_excel_row INT NOT NULL,
      no_pesanan VARCHAR(50) DEFAULT NULL,
      estimasi_ongkos_kirim DECIMAL(18,2) DEFAULT NULL,
      ongkos_kirim_dibayarkan_jasa_kirim DECIMAL(18,2) DEFAULT NULL,
      discrepancy_reason TEXT DEFAULT NULL,
      raw_payload JSON NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uk_income_shipping_discrepancy_raw_source (income_report_import_id, source_excel_row),
      KEY idx_income_shipping_discrepancy_raw_order (no_pesanan),
      CONSTRAINT fk_income_shipping_discrepancy_raw_import
        FOREIGN KEY (income_report_import_id) REFERENCES income_report_imports(id)
        ON DELETE RESTRICT ON UPDATE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
};

async function main() {
  const apply = process.argv.includes('--apply');
  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;
  if (!DB_HOST || !DB_USER || !DB_PASSWORD || !DB_NAME) throw new Error('Database environment variables are incomplete');
  const conn = await createConnection({ host: DB_HOST, port: Number(DB_PORT || 3306), user: DB_USER, password: DB_PASSWORD, database: DB_NAME });
  try {
    const report = [];
    for (const name of Object.keys(TABLES)) {
      const [rows] = await conn.query('SHOW TABLES LIKE ?', [name]);
      report.push({ table: name, exists: rows.length > 0, action: rows.length ? 'unchanged' : apply ? 'create' : 'would_create' });
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

main().catch((error) => { console.error(error.stack || error.message); process.exit(1); });

module.exports = { TABLES };
