#!/usr/bin/env node

const { createConnection } = require('mysql2/promise');

const PARENTS = {
  balance_report_imports: `CREATE TABLE IF NOT EXISTS balance_report_imports (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, store_id BIGINT UNSIGNED NOT NULL,
    source_file VARCHAR(255) NOT NULL, source_sha256 CHAR(64) NOT NULL,
    report_period_from DATE DEFAULT NULL, report_period_to DATE DEFAULT NULL,
    metadata_payload JSON NOT NULL, headers_payload JSON NOT NULL, warnings_payload JSON DEFAULT NULL,
    summary_payload JSON NOT NULL, summary_total_saldo_masuk DECIMAL(18,2) DEFAULT NULL,
    summary_total_saldo_keluar DECIMAL(18,2) DEFAULT NULL,
    summary_jumlah_transaksi_masuk INT DEFAULT NULL, summary_jumlah_transaksi_keluar INT DEFAULT NULL,
    reconciliation_status VARCHAR(32) NOT NULL, ledger_continuity_status VARCHAR(32) NOT NULL,
    imported_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uk_balance_report_store_sha (store_id, source_sha256),
    KEY idx_balance_report_store_imported (store_id, imported_at),
    CONSTRAINT fk_balance_report_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE RESTRICT ON UPDATE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  order_cancellation_report_imports: `CREATE TABLE IF NOT EXISTS order_cancellation_report_imports (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, store_id BIGINT UNSIGNED NOT NULL,
    source_file VARCHAR(255) NOT NULL, source_sha256 CHAR(64) NOT NULL,
    report_period_from DATE DEFAULT NULL, report_period_to DATE DEFAULT NULL,
    metadata_payload JSON NOT NULL, headers_payload JSON NOT NULL, warnings_payload JSON DEFAULT NULL,
    imported_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uk_cancellation_report_store_sha (store_id, source_sha256),
    KEY idx_cancellation_report_store_imported (store_id, imported_at),
    CONSTRAINT fk_cancellation_report_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE RESTRICT ON UPDATE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  order_failed_delivery_report_imports: `CREATE TABLE IF NOT EXISTS order_failed_delivery_report_imports (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, store_id BIGINT UNSIGNED NOT NULL,
    source_file VARCHAR(255) NOT NULL, source_sha256 CHAR(64) NOT NULL,
    report_period_from DATE DEFAULT NULL, report_period_to DATE DEFAULT NULL,
    metadata_payload JSON NOT NULL, headers_payload JSON NOT NULL, warnings_payload JSON DEFAULT NULL,
    imported_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uk_failed_delivery_report_store_sha (store_id, source_sha256),
    KEY idx_failed_delivery_report_store_imported (store_id, imported_at),
    CONSTRAINT fk_failed_delivery_report_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE RESTRICT ON UPDATE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  order_return_refund_report_imports: `CREATE TABLE IF NOT EXISTS order_return_refund_report_imports (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, store_id BIGINT UNSIGNED NOT NULL,
    source_file VARCHAR(255) NOT NULL, source_sha256 CHAR(64) NOT NULL,
    report_period_from DATE DEFAULT NULL, report_period_to DATE DEFAULT NULL,
    metadata_payload JSON NOT NULL, headers_payload JSON NOT NULL, warnings_payload JSON DEFAULT NULL,
    imported_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uk_return_refund_report_store_sha (store_id, source_sha256),
    KEY idx_return_refund_report_store_imported (store_id, imported_at),
    CONSTRAINT fk_return_refund_report_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE RESTRICT ON UPDATE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ads_report_imports: `CREATE TABLE IF NOT EXISTS ads_report_imports (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, store_id BIGINT UNSIGNED NOT NULL,
    source_file VARCHAR(255) NOT NULL, source_sha256 CHAR(64) NOT NULL,
    report_period_from DATE DEFAULT NULL, report_period_to DATE DEFAULT NULL,
    metadata_payload JSON NOT NULL, headers_payload JSON NOT NULL, warnings_payload JSON DEFAULT NULL,
    source_format VARCHAR(16) NOT NULL, currency VARCHAR(16) DEFAULT NULL,
    seller_username VARCHAR(255) DEFAULT NULL, source_store_reference VARCHAR(255) DEFAULT NULL,
    imported_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uk_ads_report_store_sha (store_id, source_sha256),
    KEY idx_ads_report_store_imported (store_id, imported_at),
    CONSTRAINT fk_ads_report_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE RESTRICT ON UPDATE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
};
const CHILDREN = {
  balance_transactions_raw: `CREATE TABLE IF NOT EXISTS balance_transactions_raw (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, balance_report_import_id BIGINT UNSIGNED NOT NULL,
    source_excel_row INT NOT NULL, transaction_at DATETIME DEFAULT NULL, type_transaksi VARCHAR(255) DEFAULT NULL,
    description TEXT DEFAULT NULL, no_pesanan_direct VARCHAR(50) DEFAULT NULL, no_pesanan_extracted VARCHAR(50) DEFAULT NULL,
    jenis_transaksi VARCHAR(100) DEFAULT NULL, jumlah_signed DECIMAL(18,2) DEFAULT NULL, status VARCHAR(100) DEFAULT NULL,
    saldo_akhir DECIMAL(18,2) DEFAULT NULL, raw_payload JSON NOT NULL,
    PRIMARY KEY (id), UNIQUE KEY uk_balance_raw_source (balance_report_import_id, source_excel_row),
    KEY idx_balance_raw_transaction_at (transaction_at), KEY idx_balance_raw_type (type_transaksi),
    KEY idx_balance_raw_description (description(255)), KEY idx_balance_raw_order_direct (no_pesanan_direct),
    KEY idx_balance_raw_order_extracted (no_pesanan_extracted), KEY idx_balance_raw_kind (jenis_transaksi),
    KEY idx_balance_raw_jumlah_signed (jumlah_signed), KEY idx_balance_raw_status (status), KEY idx_balance_raw_saldo_akhir (saldo_akhir),
    CONSTRAINT fk_balance_raw_import FOREIGN KEY (balance_report_import_id) REFERENCES balance_report_imports(id) ON DELETE RESTRICT ON UPDATE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  order_cancellation_raw: `CREATE TABLE IF NOT EXISTS order_cancellation_raw (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, order_cancellation_report_import_id BIGINT UNSIGNED NOT NULL,
    source_excel_row INT NOT NULL, no_pesanan VARCHAR(50) DEFAULT NULL, status_pesanan VARCHAR(100) DEFAULT NULL,
    alasan_pembatalan TEXT DEFAULT NULL, status_pembatalan_pengembalian VARCHAR(100) DEFAULT NULL, no_resi VARCHAR(100) DEFAULT NULL,
    nomor_referensi_sku VARCHAR(255) DEFAULT NULL, nama_variasi VARCHAR(255) DEFAULT NULL, jumlah DECIMAL(18,2) DEFAULT NULL,
    subtotal_pesanan DECIMAL(18,2) DEFAULT NULL, total_pembayaran DECIMAL(18,2) DEFAULT NULL,
    waktu_pesanan_dibuat DATETIME DEFAULT NULL, waktu_pesanan_selesai DATETIME DEFAULT NULL, raw_payload JSON NOT NULL,
    PRIMARY KEY (id), UNIQUE KEY uk_cancellation_raw_source (order_cancellation_report_import_id, source_excel_row),
    KEY idx_cancellation_raw_order (no_pesanan), KEY idx_cancellation_raw_status (status_pesanan),
    KEY idx_cancellation_raw_reason (alasan_pembatalan(255)), KEY idx_cancellation_raw_return_status (status_pembatalan_pengembalian),
    KEY idx_cancellation_raw_resi (no_resi), KEY idx_cancellation_raw_sku (nomor_referensi_sku), KEY idx_cancellation_raw_variasi (nama_variasi),
    KEY idx_cancellation_raw_jumlah (jumlah), KEY idx_cancellation_raw_subtotal (subtotal_pesanan), KEY idx_cancellation_raw_total (total_pembayaran),
    KEY idx_cancellation_raw_created (waktu_pesanan_dibuat), KEY idx_cancellation_raw_finished (waktu_pesanan_selesai),
    CONSTRAINT fk_cancellation_raw_import FOREIGN KEY (order_cancellation_report_import_id) REFERENCES order_cancellation_report_imports(id) ON DELETE RESTRICT ON UPDATE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  order_failed_delivery_raw: `CREATE TABLE IF NOT EXISTS order_failed_delivery_raw (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, order_failed_delivery_report_import_id BIGINT UNSIGNED NOT NULL,
    source_excel_row INT NOT NULL, no_pesanan VARCHAR(50) DEFAULT NULL, status_pesanan VARCHAR(100) DEFAULT NULL,
    status_pembatalan_pengembalian VARCHAR(100) DEFAULT NULL, status_pengiriman_gagal VARCHAR(255) DEFAULT NULL,
    no_resi VARCHAR(100) DEFAULT NULL, nomor_referensi_sku VARCHAR(255) DEFAULT NULL, nama_variasi VARCHAR(255) DEFAULT NULL,
    jumlah DECIMAL(18,2) DEFAULT NULL, subtotal_pesanan DECIMAL(18,2) DEFAULT NULL, total_pembayaran DECIMAL(18,2) DEFAULT NULL,
    waktu_pesanan_dibuat DATETIME DEFAULT NULL, waktu_pesanan_selesai DATETIME DEFAULT NULL, status_klaim VARCHAR(100) DEFAULT NULL,
    tanggal_klaim_diajukan DATE DEFAULT NULL, tanggal_klaim_disetujui DATE DEFAULT NULL, tanggal_klaim_dicairkan DATE DEFAULT NULL, tanggal_klaim_ditolak DATE DEFAULT NULL,
    jumlah_kompensasi DECIMAL(18,2) DEFAULT NULL, raw_payload JSON NOT NULL,
    PRIMARY KEY (id), UNIQUE KEY uk_failed_delivery_raw_source (order_failed_delivery_report_import_id, source_excel_row),
    KEY idx_failed_delivery_raw_order (no_pesanan), KEY idx_failed_delivery_raw_status (status_pesanan),
    KEY idx_failed_delivery_raw_return_status (status_pembatalan_pengembalian), KEY idx_failed_delivery_raw_delivery_status (status_pengiriman_gagal),
    KEY idx_failed_delivery_raw_resi (no_resi), KEY idx_failed_delivery_raw_sku (nomor_referensi_sku), KEY idx_failed_delivery_raw_variasi (nama_variasi),
    KEY idx_failed_delivery_raw_jumlah (jumlah), KEY idx_failed_delivery_raw_subtotal (subtotal_pesanan), KEY idx_failed_delivery_raw_total (total_pembayaran),
    KEY idx_failed_delivery_raw_created (waktu_pesanan_dibuat), KEY idx_failed_delivery_raw_finished (waktu_pesanan_selesai),
    KEY idx_failed_delivery_raw_claim_status (status_klaim), KEY idx_failed_delivery_raw_claim_submitted (tanggal_klaim_diajukan),
    KEY idx_failed_delivery_raw_claim_approved (tanggal_klaim_disetujui), KEY idx_failed_delivery_raw_claim_paid (tanggal_klaim_dicairkan),
    KEY idx_failed_delivery_raw_claim_rejected (tanggal_klaim_ditolak), KEY idx_failed_delivery_raw_compensation (jumlah_kompensasi),
    CONSTRAINT fk_failed_delivery_raw_import FOREIGN KEY (order_failed_delivery_report_import_id) REFERENCES order_failed_delivery_report_imports(id) ON DELETE RESTRICT ON UPDATE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  order_return_refund_raw: `CREATE TABLE IF NOT EXISTS order_return_refund_raw (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, order_return_refund_report_import_id BIGINT UNSIGNED NOT NULL,
    source_excel_row INT NOT NULL, no_pengembalian VARCHAR(50) DEFAULT NULL, no_pesanan VARCHAR(50) DEFAULT NULL,
    waktu_pesanan_dibuat DATETIME DEFAULT NULL, kode_variasi VARCHAR(255) DEFAULT NULL, variasi VARCHAR(255) DEFAULT NULL,
    status_pembatalan_pengembalian VARCHAR(100) DEFAULT NULL, tipe_pengembalian VARCHAR(100) DEFAULT NULL,
    jumlah_produk_dikembalikan DECIMAL(18,2) DEFAULT NULL, solusi_pengembalian TEXT DEFAULT NULL, alasan_pengembalian TEXT DEFAULT NULL,
    total_pengembalian_dana DECIMAL(18,2) DEFAULT NULL, waktu_pengembalian_dana_selesai DATETIME DEFAULT NULL,
    status_pengembalian_barang VARCHAR(255) DEFAULT NULL, pelepasan_dana_signed DECIMAL(18,2) DEFAULT NULL,
    ongkos_kirim_pengiriman_signed DECIMAL(18,2) DEFAULT NULL, ongkos_kirim_pengembalian_signed DECIMAL(18,2) DEFAULT NULL,
    jumlah_kompensasi_signed DECIMAL(18,2) DEFAULT NULL, raw_payload JSON NOT NULL,
    PRIMARY KEY (id), UNIQUE KEY uk_return_refund_raw_source (order_return_refund_report_import_id, source_excel_row),
    KEY idx_return_refund_raw_return (no_pengembalian), KEY idx_return_refund_raw_order (no_pesanan), KEY idx_return_refund_raw_created (waktu_pesanan_dibuat),
    KEY idx_return_refund_raw_variant_code (kode_variasi), KEY idx_return_refund_raw_variant (variasi), KEY idx_return_refund_raw_status (status_pembatalan_pengembalian),
    KEY idx_return_refund_raw_type (tipe_pengembalian), KEY idx_return_refund_raw_quantity (jumlah_produk_dikembalikan), KEY idx_return_refund_raw_solution (solusi_pengembalian(255)),
    KEY idx_return_refund_raw_reason (alasan_pengembalian(255)), KEY idx_return_refund_raw_refund (total_pengembalian_dana),
    KEY idx_return_refund_raw_refund_finished (waktu_pengembalian_dana_selesai), KEY idx_return_refund_raw_return_status (status_pengembalian_barang),
    KEY idx_return_refund_raw_release (pelepasan_dana_signed), KEY idx_return_refund_raw_shipping_out (ongkos_kirim_pengiriman_signed),
    KEY idx_return_refund_raw_shipping_return (ongkos_kirim_pengembalian_signed), KEY idx_return_refund_raw_compensation (jumlah_kompensasi_signed),
    CONSTRAINT fk_return_refund_raw_import FOREIGN KEY (order_return_refund_report_import_id) REFERENCES order_return_refund_report_imports(id) ON DELETE RESTRICT ON UPDATE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ads_transactions_raw: `CREATE TABLE IF NOT EXISTS ads_transactions_raw (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, ads_report_import_id BIGINT UNSIGNED NOT NULL, source_csv_row INT NOT NULL,
    sequence_number INT DEFAULT NULL, transaction_date DATE DEFAULT NULL, description TEXT DEFAULT NULL,
    jumlah_signed DECIMAL(18,2) DEFAULT NULL, note TEXT DEFAULT NULL, raw_payload JSON NOT NULL,
    PRIMARY KEY (id), UNIQUE KEY uk_ads_raw_source (ads_report_import_id, source_csv_row), KEY idx_ads_raw_sequence (sequence_number),
    KEY idx_ads_raw_date (transaction_date), KEY idx_ads_raw_description (description(255)), KEY idx_ads_raw_jumlah_signed (jumlah_signed), KEY idx_ads_raw_note (note(255)),
    CONSTRAINT fk_ads_raw_import FOREIGN KEY (ads_report_import_id) REFERENCES ads_report_imports(id) ON DELETE RESTRICT ON UPDATE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
};

async function main() {
  const apply = process.argv.includes('--apply');
  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;
  if (!DB_HOST || !DB_USER || !DB_PASSWORD || !DB_NAME) throw new Error('Database environment variables are incomplete.');
  const conn = await createConnection({ host: DB_HOST, port: Number(DB_PORT || 3306), user: DB_USER, password: DB_PASSWORD, database: DB_NAME, connectTimeout: 10000 });
  try {
    const report = [];
    for (const name of [...Object.keys(PARENTS), ...Object.keys(CHILDREN)]) {
      const [rows] = await conn.query('SHOW TABLES LIKE ?', [name]);
      report.push({ table: name, exists: rows.length > 0, action: rows.length ? 'unchanged' : apply ? 'create' : 'would_create' });
    }
    const existingCount = report.filter((item) => item.exists).length;
    const targetCount = report.length;
    const state = existingCount === 0 ? 'absent' : existingCount === targetCount ? 'complete_or_requires_audit' : 'partial';
    if (apply && state === 'partial') {
      throw new Error('RAW Expansion migration dihentikan: target DDL partial. Audit SHOW CREATE TABLE sebelum melanjutkan; script tidak akan mencampur create baru dengan tabel lama.');
    }
    if (apply && state === 'complete_or_requires_audit') {
      throw new Error('RAW Expansion migration tidak melakukan no-op pada tabel yang sudah ada. Audit SHOW CREATE TABLE / DESCRIBE untuk seluruh target sebelum menyatakan schema sesuai.');
    }
    if (apply && !process.argv.includes('--confirm-ddl')) {
      throw new Error('Migration APPLY membutuhkan --confirm-ddl. DDL MySQL dapat implicit commit, sehingga rollback transaction tidak menjamin atomic rollback CREATE TABLE.');
    }
    if (apply) {
      for (const [name, ddl] of Object.entries(PARENTS)) {
        await conn.query(ddl);
        console.log(JSON.stringify({ action: 'created', table: name }));
      }
      for (const [name, ddl] of Object.entries(CHILDREN)) {
        await conn.query(ddl);
        console.log(JSON.stringify({ action: 'created', table: name }));
      }
    }
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry_run', state, report }, null, 2));
  } finally { await conn.end(); }
}
if (require.main === module) main().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
module.exports = { PARENTS, CHILDREN };
