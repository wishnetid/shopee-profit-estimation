-- Database Schema untuk Shopee Profit Estimation
-- Database: supplie3_shopee_profit_estimation
-- Host: 103.136.19.30:3306

-- ==================== Table: orders ====================
-- Source: Order.all Excel file dari Shopee Seller Center

CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  no_pesanan VARCHAR(50) NOT NULL UNIQUE,
  nama_produk VARCHAR(500),
  nomor_referensi_sku VARCHAR(100),
  sku_induk VARCHAR(100),
  variasi_produk VARCHAR(200),
  jumlah INT DEFAULT 1,
  harga_asli DECIMAL(15,2),
  total_diskon_produk DECIMAL(15,2),
  harga_setelah_diskon DECIMAL(15,2),
  status_pesanan VARCHAR(100),
  waktu_pesanan_dibuat DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_no_pesanan (no_pesanan),
  INDEX idx_sku (nomor_referensi_sku, sku_induk),
  INDEX idx_status (status_pesanan),
  INDEX idx_waktu (waktu_pesanan_dibuat)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==================== Table: income_penghasilan ====================
-- Source: Income "sudah dilepas" Excel file - Sheet "Penghasilan"
-- Filter: Lihat berdasarkan = "Order"

CREATE TABLE IF NOT EXISTS income_penghasilan (
  id INT AUTO_INCREMENT PRIMARY KEY,
  no_pesanan VARCHAR(50) NOT NULL,
  harga_produk DECIMAL(15,2) DEFAULT 0,
  gratis_ongkir_dari_shopee DECIMAL(15,2) DEFAULT 0,
  ongkir_ke_jasa_kirim DECIMAL(15,2) DEFAULT 0,
  biaya_administrasi DECIMAL(15,2) DEFAULT 0,
  biaya_proses_pesanan DECIMAL(15,2) DEFAULT 0,
  biaya_gratis_ongkir_xtra DECIMAL(15,2) DEFAULT 0,
  biaya_layanan_promo_xtra DECIMAL(15,2) DEFAULT 0,
  biaya_lainnya DECIMAL(15,2) DEFAULT 0,
  net_payout DECIMAL(15,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_no_pesanan (no_pesanan),
  FOREIGN KEY (no_pesanan) REFERENCES orders(no_pesanan) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==================== Table: balance_transactions ====================
-- Source: my_balance_transaction_report Excel file
-- Header di Row 18

CREATE TABLE IF NOT EXISTS balance_transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  no_pesanan VARCHAR(50),
  tipe_transaksi VARCHAR(100) NOT NULL,
  waktu_selesai DATETIME,
  jumlah DECIMAL(15,2) NOT NULL,
  deskripsi TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_no_pesanan (no_pesanan),
  INDEX idx_tipe (tipe_transaksi),
  INDEX idx_waktu (waktu_selesai)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==================== Table: master_products ====================
-- Source: master.xlsx
-- HPP sudah termasuk packaging

CREATE TABLE IF NOT EXISTS master_products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  idproduk VARCHAR(100) NOT NULL,
  sku1 VARCHAR(100) NOT NULL,
  sku2 VARCHAR(100),
  harga DECIMAL(15,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_sku1 (sku1),
  INDEX idx_sku2 (sku2),
  INDEX idx_idproduk (idproduk)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==================== View: profit_calculation ====================
-- Calculated view untuk profit per order
-- Formula: profit = income.net_payout - master.harga (HPP)

CREATE OR REPLACE VIEW profit_calculation AS
SELECT 
  o.no_pesanan,
  o.nama_produk,
  o.jumlah,
  o.status_pesanan,
  o.waktu_pesanan_dibuat,
  i.net_payout,
  m.harga as hpp,
  m.idproduk,
  (i.net_payout - m.harga) as profit,
  ((i.net_payout - m.harga) / i.net_payout * 100) as margin_pct
FROM orders o
LEFT JOIN income_penghasilan i ON o.no_pesanan = i.no_pesanan
LEFT JOIN master_products m ON (
  COALESCE(o.nomor_referensi_sku, o.sku_induk) = m.sku1
  OR COALESCE(o.nomor_referensi_sku, o.sku_induk) = m.sku2
)
WHERE i.net_payout IS NOT NULL AND m.harga IS NOT NULL;

-- ==================== HPP Mapping Logic ====================
-- Priority:
-- 1. Ambil Nomor Referensi SKU dari Order.all (prioritas pertama)
-- 2. Jika kosong, ambil SKU Induk
-- 3. Match dengan master_products.sku1 (prioritas pertama)
-- 4. Jika tidak match, coba master_products.sku2
-- 5. Ambil harga (HPP sudah + packaging)
-- 6. Simpan idproduk sebagai identifier universal

-- Example query untuk test HPP mapping:
-- SELECT 
--   o.no_pesanan,
--   o.nama_produk,
--   o.nomor_referensi_sku,
--   o.sku_induk,
--   COALESCE(o.nomor_referensi_sku, o.sku_induk) as sku_for_mapping,
--   m.sku1,
--   m.sku2,
--   m.harga as hpp,
--   m.idproduk
-- FROM orders o
-- LEFT JOIN master_products m ON (
--   COALESCE(o.nomor_referensi_sku, o.sku_induk) = m.sku1
--   OR COALESCE(o.nomor_referensi_sku, o.sku_induk) = m.sku2
-- )
-- WHERE o.no_pesanan = '2607072CRRDA37';
