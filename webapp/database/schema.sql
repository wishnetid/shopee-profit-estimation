-- Shopee Profit Estimation — active RAW foundation reference schema
--
-- This file documents the intended multi-store RAW model. It is NOT the live
-- database source of truth and is NOT a migration. Audit live DDL before any
-- database change. Use webapp/scripts/migrate-multi-store.js only for the
-- reviewed multi-store migration path.
--
-- Active boundary:
--   store-scoped: order_all, income_report_imports and their child RAW rows
--   shared:       sku_report_imports, sku_master_raw
--   not active:   legacy orders, income_penghasilan, master_products,
--                 balance_transactions, and profit_calculation objects

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(64) NOT NULL,
  display_name VARCHAR(160) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Order.all: current-state snapshot at item/variation grain.
CREATE TABLE IF NOT EXISTS order_all (
  id INT NOT NULL AUTO_INCREMENT,
  store_id BIGINT UNSIGNED NOT NULL,
  no_pesanan VARCHAR(50) NOT NULL,
  status_pesanan VARCHAR(50),
  alasan_pembatalan TEXT,
  status_pembatalan_pengembalian VARCHAR(100),
  no_resi VARCHAR(100),
  nama_produk TEXT,
  nomor_referensi_sku VARCHAR(100),
  sku_induk VARCHAR(100),
  nama_variasi VARCHAR(255),
  harga_awal DECIMAL(15,2),
  harga_setelah_diskon DECIMAL(15,2),
  jumlah INT,
  returned_quantity INT DEFAULT 0,
  subtotal_pesanan DECIMAL(15,2),
  total_diskon DECIMAL(15,2),
  diskon_dari_penjual DECIMAL(15,2),
  diskon_dari_shopee DECIMAL(15,2),
  berat_produk VARCHAR(50),
  jumlah_produk_di_pesan INT,
  total_berat VARCHAR(50),
  voucher_ditanggung_penjual DECIMAL(15,2) DEFAULT 0,
  cashback_koin DECIMAL(15,2) DEFAULT 0,
  voucher_ditanggung_shopee DECIMAL(15,2) DEFAULT 0,
  paket_diskon VARCHAR(10),
  paket_diskon_shopee DECIMAL(15,2) DEFAULT 0,
  paket_diskon_penjual DECIMAL(15,2) DEFAULT 0,
  potongan_koin_shopee DECIMAL(15,2) DEFAULT 0,
  diskon_kartu_kredit DECIMAL(15,2) DEFAULT 0,
  opsi_pengiriman VARCHAR(100),
  antar_ke_counter VARCHAR(50),
  pesanan_harus_dikirim_sebelum DATETIME,
  waktu_pengiriman_diatur DATETIME,
  ongkos_kirim_dibayar_pembeli DECIMAL(15,2),
  estimasi_potongan_biaya_pengiriman DECIMAL(15,2) DEFAULT 0,
  ongkos_kirim_pengembalian_barang DECIMAL(15,2) DEFAULT 0,
  perkiraan_ongkos_kirim DECIMAL(15,2),
  catatan_dari_pembeli TEXT,
  catatan TEXT,
  total_pembayaran DECIMAL(15,2),
  waktu_pesanan_dibuat DATETIME,
  waktu_pembayaran_dilakukan DATETIME,
  tipe_pesanan VARCHAR(50),
  waktu_pesanan_selesai DATETIME,
  username_pembeli VARCHAR(100),
  nama_penerima VARCHAR(200),
  no_telepon VARCHAR(50),
  alamat_pengiriman TEXT,
  kota_kabupaten VARCHAR(100),
  provinsi VARCHAR(100),
  metode_pembayaran VARCHAR(100),
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  source_snapshot_at DATETIME,
  source_snapshot_file VARCHAR(255),
  PRIMARY KEY (id),
  UNIQUE KEY uk_order_item_store (store_id, no_pesanan, nomor_referensi_sku, nama_variasi),
  KEY idx_order_all_store (store_id, waktu_pesanan_dibuat),
  CONSTRAINT fk_order_all_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Income package parent: one workbook remains one isolated RAW package.
CREATE TABLE IF NOT EXISTS income_report_imports (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  store_id BIGINT UNSIGNED NOT NULL,
  source_file VARCHAR(255) NOT NULL,
  source_sha256 CHAR(64) NOT NULL,
  report_period_from DATE,
  report_period_to DATE,
  summary_payload JSON NOT NULL,
  summary_total_yang_dilepas DECIMAL(18,2),
  reconciliation_order_signed_total DECIMAL(18,2),
  reconciliation_difference DECIMAL(18,2),
  reconciliation_status VARCHAR(32) NOT NULL,
  warnings_payload JSON,
  imported_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_income_report_import_store_sha256 (store_id, source_sha256),
  KEY idx_income_report_period (report_period_from, report_period_to),
  KEY idx_income_report_imported_at (imported_at),
  KEY idx_income_report_store (store_id, imported_at),
  CONSTRAINT fk_income_report_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Penghasilan keeps both Order and Sku views in the same RAW table.
CREATE TABLE IF NOT EXISTS income_penghasilan_raw (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  income_report_import_id BIGINT UNSIGNED NOT NULL,
  source_excel_row INT NOT NULL,
  lihat_berdasarkan VARCHAR(20) NOT NULL,
  no_pesanan VARCHAR(50),
  id_produk VARCHAR(50),
  nama_produk TEXT,
  waktu_pesanan_dibuat DATE,
  tanggal_dana_dilepaskan DATE,
  signed_total DECIMAL(18,2) NOT NULL,
  raw_payload JSON NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_income_penghasilan_raw_source (income_report_import_id, source_excel_row),
  KEY idx_income_penghasilan_raw_view (income_report_import_id, lihat_berdasarkan),
  KEY idx_income_penghasilan_raw_order (no_pesanan),
  CONSTRAINT fk_income_penghasilan_raw_import FOREIGN KEY (income_report_import_id) REFERENCES income_report_imports(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS income_adjustments_raw (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  income_report_import_id BIGINT UNSIGNED NOT NULL,
  source_excel_row INT NOT NULL,
  no_pesanan_terhubung VARCHAR(50),
  tanggal_penyesuaian_dibuat DATE,
  tanggal_dana_dilepaskan DATE,
  biaya_penyesuaian DECIMAL(18,2),
  raw_payload JSON NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_income_adjustments_raw_source (income_report_import_id, source_excel_row),
  KEY idx_income_adjustments_raw_order (no_pesanan_terhubung),
  CONSTRAINT fk_income_adjustments_raw_import FOREIGN KEY (income_report_import_id) REFERENCES income_report_imports(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS income_shipping_fee_discrepancies_raw (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  income_report_import_id BIGINT UNSIGNED NOT NULL,
  source_excel_row INT NOT NULL,
  no_pesanan VARCHAR(50),
  estimasi_ongkos_kirim DECIMAL(18,2),
  ongkos_kirim_dibayarkan_jasa_kirim DECIMAL(18,2),
  discrepancy_reason TEXT,
  raw_payload JSON NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_income_shipping_discrepancy_raw_source (income_report_import_id, source_excel_row),
  KEY idx_income_shipping_discrepancy_raw_order (no_pesanan),
  CONSTRAINT fk_income_shipping_discrepancy_raw_import FOREIGN KEY (income_report_import_id) REFERENCES income_report_imports(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- SKU/HPP source remains shared until store-specific differences are proven.
CREATE TABLE IF NOT EXISTS sku_report_imports (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  source_file VARCHAR(255) NOT NULL,
  source_sha256 CHAR(64) NOT NULL,
  sheet_name VARCHAR(255) NOT NULL,
  headers_payload JSON NOT NULL,
  warnings_payload JSON,
  imported_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_sku_report_import_sha256 (source_sha256),
  KEY idx_sku_report_imported_at (imported_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sku_master_raw (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sku_report_import_id BIGINT UNSIGNED NOT NULL,
  source_excel_row INT NOT NULL,
  sku1 VARCHAR(255),
  sku2 VARCHAR(255),
  harga DECIMAL(18,2),
  idproduk VARCHAR(255),
  raw_payload JSON NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_sku_master_raw_source (sku_report_import_id, source_excel_row),
  KEY idx_sku_master_raw_sku1 (sku1),
  KEY idx_sku_master_raw_sku2 (sku2),
  KEY idx_sku_master_raw_idproduk (idproduk),
  CONSTRAINT fk_sku_master_raw_import FOREIGN KEY (sku_report_import_id) REFERENCES sku_report_imports(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Upload progress support table. The current synchronous upload route does not
-- rely on /tmp; this table remains available for future bounded jobs.
CREATE TABLE IF NOT EXISTS upload_jobs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  job_id VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL,
  progress INT NOT NULL DEFAULT 0,
  message TEXT,
  stage VARCHAR(128),
  error TEXT,
  stats JSON,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_upload_jobs_job_id (job_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- RAW expansion: Balance, order exceptions, and Ads are store-scoped
-- periodic packages. Full executable DDL lives in scripts/migrate-raw-expansion.js.
-- This reference intentionally keeps every event package separate; it performs no
-- business deduplication or financial aggregation across reports.
--
-- Parent identities:
--   balance_report_imports                 (store_id, source_sha256)
--   order_cancellation_report_imports      (store_id, source_sha256)
--   order_failed_delivery_report_imports   (store_id, source_sha256)
--   order_return_refund_report_imports     (store_id, source_sha256)
--   ads_report_imports                     (store_id, source_sha256)
--
-- Child identities:
--   balance_transactions_raw               (balance_report_import_id, source_excel_row)
--   order_cancellation_raw                 (order_cancellation_report_import_id, source_excel_row)
--   order_failed_delivery_raw              (order_failed_delivery_report_import_id, source_excel_row)
--   order_return_refund_raw                (order_return_refund_report_import_id, source_excel_row)
--   ads_transactions_raw                   (ads_report_import_id, source_csv_row)
--
-- Parent packages include source_file, source_sha256, report period, metadata,
-- headers, warnings, and imported_at. Every child retains raw_payload and source
-- row provenance. Child and parent foreign keys use ON DELETE RESTRICT.
--
-- Do not use legacy balance_transactions for this feature. Do not calculate
-- profit, net payout, or final ad cost from this RAW layer.

-- Deliberately absent from the active financial layer:
--   orders, income_penghasilan, master_products, balance_transactions,
--   profit_calculation.
-- They are legacy/unfinished objects and must not be used as the source of truth
-- for the RAW foundation or Profit page.
