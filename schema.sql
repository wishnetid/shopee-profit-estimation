-- =====================================================
-- Shopee Profit Estimation - MySQL Database Schema
-- =====================================================
-- Database: supplie3_shopee_profit_estimation
-- Host: 103.136.19.30:3306
-- Optimized for: Vercel Serverless + MySQL cPanel
-- Date: 2026-08-06
-- =====================================================

-- =====================================================
-- 1. MASTER_PRODUCTS TABLE
-- =====================================================
-- Source: master.xlsx
-- Purpose: HPP reference untuk profit calculation
-- Key Logic: COALESCE(order.nomor_referensi_sku, order.sku_induk) 
--            harus match dengan (sku1, sku2)
-- =====================================================

CREATE TABLE IF NOT EXISTS master_products (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  
  -- SKU identifiers (untuk matching)
  sku1 VARCHAR(100) NOT NULL COMMENT 'Primary SKU identifier',
  sku2 VARCHAR(100) DEFAULT NULL COMMENT 'Alternative SKU identifier',
  
  -- HPP & Product Info
  hpp DECIMAL(12,2) NOT NULL COMMENT 'Harga Pokok Penjualan (sudah + packaging)',
  idproduk VARCHAR(100) NOT NULL COMMENT 'Universal product identifier across stores',
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Indexes untuk HPP mapping performance
  INDEX idx_sku1 (sku1),
  INDEX idx_sku2 (sku2),
  INDEX idx_idproduk (idproduk)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Master HPP dari master.xlsx - sudah termasuk biaya packaging';

-- =====================================================
-- 2. ORDERS TABLE
-- =====================================================
-- Source: Order.all.*.xlsx
-- Purpose: Source of truth untuk semua pesanan
-- Key Field: nomor_referensi_sku (prioritas 1) & sku_induk (fallback)
--            untuk mapping ke master_products
-- =====================================================

CREATE TABLE IF NOT EXISTS orders (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  
  -- Primary Identifier
  no_pesanan VARCHAR(20) NOT NULL UNIQUE COMMENT 'Format: YYMMDD[A-Z0-9]{8-10}',
  
  -- Order Status
  status_pesanan VARCHAR(50) DEFAULT NULL COMMENT 'Status: Selesai, Dibatalkan, Dikembalikan, dll',
  alasan_pembatalan TEXT DEFAULT NULL,
  status_pembatalan_pengembalian VARCHAR(100) DEFAULT NULL,
  
  -- Shipping Info
  no_resi VARCHAR(100) DEFAULT NULL,
  opsi_pengiriman VARCHAR(100) DEFAULT NULL,
  antar_ke_counter VARCHAR(50) DEFAULT NULL,
  pesanan_harus_dikirim_sebelum DATETIME DEFAULT NULL,
  waktu_pengiriman_diatur DATETIME DEFAULT NULL,
  
  -- Timestamps
  waktu_pesanan_dibuat DATETIME DEFAULT NULL,
  waktu_pembayaran_dilakukan DATETIME DEFAULT NULL,
  waktu_pesanan_selesai DATETIME DEFAULT NULL,
  
  -- Order Type & Payment
  tipe_pesanan VARCHAR(50) DEFAULT NULL,
  metode_pembayaran VARCHAR(100) DEFAULT NULL,
  
  -- Product Info (CRITICAL for HPP mapping)
  sku_induk VARCHAR(100) DEFAULT NULL COMMENT 'Fallback SKU jika nomor_referensi_sku kosong',
  nama_produk TEXT DEFAULT NULL,
  nomor_referensi_sku VARCHAR(100) DEFAULT NULL COMMENT 'Priority 1 untuk HPP mapping',
  nama_variasi VARCHAR(200) DEFAULT NULL,
  
  -- Pricing
  harga_awal DECIMAL(12,2) DEFAULT NULL,
  harga_setelah_diskon DECIMAL(12,2) DEFAULT NULL,
  jumlah INT DEFAULT NULL COMMENT 'Quantity ordered',
  returned_quantity INT DEFAULT 0,
  subtotal_pesanan DECIMAL(12,2) DEFAULT NULL,
  
  -- Discounts
  total_diskon DECIMAL(12,2) DEFAULT NULL,
  diskon_dari_penjual DECIMAL(12,2) DEFAULT NULL,
  diskon_dari_shopee DECIMAL(12,2) DEFAULT NULL,
  
  -- Product Weight
  berat_produk DECIMAL(10,3) DEFAULT NULL COMMENT 'kg',
  jumlah_produk_di_pesan INT DEFAULT NULL,
  total_berat DECIMAL(10,3) DEFAULT NULL COMMENT 'kg',
  
  -- Vouchers & Cashback
  voucher_ditanggung_penjual DECIMAL(12,2) DEFAULT NULL,
  cashback_koin DECIMAL(12,2) DEFAULT NULL,
  voucher_ditanggung_shopee DECIMAL(12,2) DEFAULT NULL,
  paket_diskon DECIMAL(12,2) DEFAULT NULL,
  paket_diskon_shopee DECIMAL(12,2) DEFAULT NULL,
  paket_diskon_penjual DECIMAL(12,2) DEFAULT NULL,
  potongan_koin_shopee DECIMAL(12,2) DEFAULT NULL,
  diskon_kartu_kredit DECIMAL(12,2) DEFAULT NULL,
  
  -- Shipping Cost
  ongkos_kirim_dibayar_pembeli DECIMAL(12,2) DEFAULT NULL,
  estimasi_potongan_biaya_pengiriman DECIMAL(12,2) DEFAULT NULL,
  ongkos_kirim_pengembalian_barang DECIMAL(12,2) DEFAULT NULL,
  perkiraan_ongkos_kirim DECIMAL(12,2) DEFAULT NULL,
  
  -- Total Payment
  total_pembayaran DECIMAL(12,2) DEFAULT NULL,
  
  -- Buyer Info
  catatan_dari_pembeli TEXT DEFAULT NULL,
  catatan TEXT DEFAULT NULL,
  username_pembeli VARCHAR(100) DEFAULT NULL,
  nama_penerima VARCHAR(200) DEFAULT NULL,
  no_telepon VARCHAR(50) DEFAULT NULL,
  
  -- Delivery Address
  alamat_pengiriman TEXT DEFAULT NULL,
  kota_kabupaten VARCHAR(100) DEFAULT NULL,
  provinsi VARCHAR(100) DEFAULT NULL,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Indexes untuk performance
  INDEX idx_status (status_pesanan),
  INDEX idx_waktu_dibuat (waktu_pesanan_dibuat),
  INDEX idx_waktu_selesai (waktu_pesanan_selesai),
  INDEX idx_sku_induk (sku_induk),
  INDEX idx_nomor_referensi_sku (nomor_referensi_sku),
  INDEX idx_username (username_pembeli)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Order.all - Source of truth untuk semua pesanan';

-- =====================================================
-- 3. INCOME_PENGHASILAN TABLE
-- =====================================================
-- Source: Income.sudah dilepas.*.xlsx - Sheet "Penghasilan"
-- Header Position: Row 2 (0-indexed, skip row 0-1)
-- Filter: Hanya row dengan "Lihat berdasarkan" = "Order"
-- Purpose: Detail penghasilan & biaya per pesanan
-- Key Calculation: Net Payout = sum of all income - sum of all fees
-- =====================================================

CREATE TABLE IF NOT EXISTS income_penghasilan (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  
  -- Identifiers
  no INT DEFAULT NULL COMMENT 'Row number dari Excel',
  lihat_berdasarkan VARCHAR(50) DEFAULT NULL COMMENT 'Filter: hanya "Order" yang diimport',
  no_pesanan VARCHAR(20) NOT NULL COMMENT 'FK ke orders.no_pesanan',
  no_pengajuan VARCHAR(50) DEFAULT NULL,
  id_produk VARCHAR(100) DEFAULT NULL,
  nama_produk TEXT DEFAULT NULL,
  
  -- Timestamps
  waktu_pesanan_dibuat DATETIME DEFAULT NULL,
  tanggal_dana_dilepaskan DATETIME DEFAULT NULL,
  
  -- Order Type
  metode_pelepasan_dana VARCHAR(100) DEFAULT NULL,
  tipe_pesanan VARCHAR(50) DEFAULT NULL,
  
  -- ==================== INCOME COMPONENTS ====================
  -- Base Income
  harga_produk DECIMAL(12,2) DEFAULT NULL COMMENT 'Product price',
  jumlah_pengembalian_dana_ke_pembeli DECIMAL(12,2) DEFAULT NULL,
  
  -- Shipping Income
  ongkir_dibayar_pembeli DECIMAL(12,2) DEFAULT NULL,
  ongkos_kirim_dibayarkan_ke_jasa_kirim DECIMAL(12,2) DEFAULT NULL,
  potongan_ongkos_kirim_dari_jasa_kirim DECIMAL(12,2) DEFAULT NULL,
  gratis_ongkir_dari_shopee DECIMAL(12,2) DEFAULT NULL COMMENT 'Subsidi ongkir dari Shopee',
  ongkos_kirim_pengembalian_barang DECIMAL(12,2) DEFAULT NULL,
  return_to_seller_fee DECIMAL(12,2) DEFAULT NULL,
  pengembalian_biaya_kirim DECIMAL(12,2) DEFAULT NULL,
  
  -- Discounts & Adjustments
  penyesuaian_penjual_1 DECIMAL(12,2) DEFAULT NULL,
  cashback_koin_disponsori_penjual DECIMAL(12,2) DEFAULT NULL,
  diskon_produk_dari_shopee DECIMAL(12,2) DEFAULT NULL,
  penyesuaian_penjual_2 DECIMAL(12,2) DEFAULT NULL,
  cashback_koin_cofund_disponsori_penjual DECIMAL(12,2) DEFAULT NULL,
  
  -- ==================== FEE COMPONENTS ====================
  -- Platform Fees
  biaya_administrasi DECIMAL(12,2) DEFAULT NULL COMMENT 'Admin fee',
  biaya_proses_pesanan DECIMAL(12,2) DEFAULT NULL COMMENT 'Transaction processing fee',
  
  -- Shipping Promo Fees
  biaya_gratis_ongkir_xtra_ukuran_biasa_f DECIMAL(12,2) DEFAULT NULL,
  biaya_gratis_ongkir_xtra_ukuran_biasa_f_2 DECIMAL(12,2) DEFAULT NULL,
  biaya_layanan_promo_xtra DECIMAL(12,2) DEFAULT NULL,
  
  -- Marketing & Campaign Fees
  ams_service_fee DECIMAL(12,2) DEFAULT NULL,
  biaya_kampanye DECIMAL(12,2) DEFAULT NULL,
  biaya_komisi_ams DECIMAL(12,2) DEFAULT NULL,
  
  -- Other Fees
  biaya_isi_saldo_otomatis DECIMAL(12,2) DEFAULT NULL,
  biaya_lainnya DECIMAL(12,2) DEFAULT NULL COMMENT 'Biaya premi, dll',
  biaya_transaksi DECIMAL(12,2) DEFAULT NULL,
  fbs_fee DECIMAL(12,2) DEFAULT NULL,
  pph_22 DECIMAL(12,2) DEFAULT NULL COMMENT 'Tax',
  
  -- ==================== BUYER & PAYMENT INFO ====================
  username_pembeli VARCHAR(100) DEFAULT NULL,
  jumlah_dibayar_pembeli DECIMAL(12,2) DEFAULT NULL,
  metode_pembayaran_pembeli VARCHAR(100) DEFAULT NULL,
  rincian_metode_pembayaran VARCHAR(200) DEFAULT NULL,
  rencana_cicilan VARCHAR(100) DEFAULT NULL,
  
  -- ==================== SHIPPING & PROMO DETAILS ====================
  promo_gratis_ongkir_dari_penjual DECIMAL(12,2) DEFAULT NULL,
  jasa_kirim VARCHAR(100) DEFAULT NULL,
  nama_kurir VARCHAR(100) DEFAULT NULL,
  kode_voucher VARCHAR(100) DEFAULT NULL,
  
  -- ==================== REFUND COMPONENTS ====================
  kompensasi DECIMAL(12,2) DEFAULT NULL,
  pengembalian_dana_ke_pembeli DECIMAL(12,2) DEFAULT NULL,
  prorata_koin_pengembalian DECIMAL(12,2) DEFAULT NULL,
  prorata_voucher_shopee_pengembalian DECIMAL(12,2) DEFAULT NULL,
  prorated_bank_payment_promotion DECIMAL(12,2) DEFAULT NULL,
  prorated_shopee_payment_promotion DECIMAL(12,2) DEFAULT NULL,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Foreign Key
  FOREIGN KEY (no_pesanan) REFERENCES orders(no_pesanan) ON DELETE CASCADE,
  
  -- Indexes
  INDEX idx_lihat_berdasarkan (lihat_berdasarkan),
  INDEX idx_tanggal_dana_dilepaskan (tanggal_dana_dilepaskan),
  INDEX idx_waktu_pesanan_dibuat (waktu_pesanan_dibuat),
  INDEX idx_username (username_pembeli)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Income Penghasilan - Detail biaya & penghasilan per order';

-- =====================================================
-- 4. PROFIT_CALCULATION VIEW (Materialized Alternative)
-- =====================================================
-- Purpose: Pre-calculated profit untuk dashboard performance
-- Formula: profit = net_payout - hpp
-- HPP Mapping: COALESCE(nomor_referensi_sku, sku_induk) 
--              match dengan (sku1, sku2)
-- =====================================================

CREATE TABLE IF NOT EXISTS profit_calculation (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  
  -- Identifiers
  no_pesanan VARCHAR(20) NOT NULL UNIQUE,
  
  -- Product Info
  nama_produk TEXT DEFAULT NULL,
  matched_sku VARCHAR(100) DEFAULT NULL COMMENT 'SKU yang berhasil match (sku1 atau sku2)',
  idproduk VARCHAR(100) DEFAULT NULL COMMENT 'Universal product ID dari master',
  
  -- Financial Components
  hpp DECIMAL(12,2) DEFAULT NULL COMMENT 'HPP dari master_products (sudah + packaging)',
  
  -- Net Payout Calculation (dari income_penghasilan)
  harga_produk DECIMAL(12,2) DEFAULT NULL,
  gratis_ongkir_dari_shopee DECIMAL(12,2) DEFAULT NULL,
  ongkos_kirim_dibayarkan_ke_jasa_kirim DECIMAL(12,2) DEFAULT NULL,
  biaya_administrasi DECIMAL(12,2) DEFAULT NULL,
  biaya_proses_pesanan DECIMAL(12,2) DEFAULT NULL,
  biaya_gratis_ongkir_xtra DECIMAL(12,2) DEFAULT NULL COMMENT 'Sum of XTRA fees',
  biaya_layanan_promo_xtra DECIMAL(12,2) DEFAULT NULL,
  biaya_lainnya DECIMAL(12,2) DEFAULT NULL,
  total_fees DECIMAL(12,2) DEFAULT NULL COMMENT 'Sum of all fees',
  
  net_payout DECIMAL(12,2) DEFAULT NULL COMMENT 'Total income - total fees',
  
  -- Profit Calculation
  profit DECIMAL(12,2) DEFAULT NULL COMMENT 'net_payout - hpp',
  margin_percent DECIMAL(5,2) DEFAULT NULL COMMENT '(profit / net_payout) * 100',
  
  -- Status Flags
  hpp_matched BOOLEAN DEFAULT FALSE COMMENT 'TRUE jika HPP berhasil di-match',
  hpp_match_method VARCHAR(20) DEFAULT NULL COMMENT 'sku1, sku2, atau NULL',
  
  -- Timestamps
  waktu_pesanan_dibuat DATETIME DEFAULT NULL,
  tanggal_dana_dilepaskan DATETIME DEFAULT NULL,
  calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Foreign Key
  FOREIGN KEY (no_pesanan) REFERENCES orders(no_pesanan) ON DELETE CASCADE,
  
  -- Indexes untuk dashboard queries
  INDEX idx_profit (profit),
  INDEX idx_margin (margin_percent),
  INDEX idx_hpp_matched (hpp_matched),
  INDEX idx_waktu_dibuat (waktu_pesanan_dibuat),
  INDEX idx_tanggal_dilepas (tanggal_dana_dilepaskan),
  INDEX idx_idproduk (idproduk)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Pre-calculated profit untuk dashboard performance';

-- =====================================================
-- 5. STORED PROCEDURE: CALCULATE_PROFIT
-- =====================================================
-- Purpose: Populate profit_calculation table dengan HPP mapping logic
-- Logic: 
--   1. Match COALESCE(nomor_referensi_sku, sku_induk) dengan master.sku1
--   2. Jika tidak match, coba master.sku2
--   3. Calculate net_payout dari income_penghasilan
--   4. Calculate profit = net_payout - hpp
-- =====================================================

DELIMITER $$

CREATE PROCEDURE calculate_profit()
BEGIN
  -- Clear existing calculations
  TRUNCATE TABLE profit_calculation;
  
  -- Insert calculated profit dengan HPP mapping
  INSERT INTO profit_calculation (
    no_pesanan,
    nama_produk,
    matched_sku,
    idproduk,
    hpp,
    harga_produk,
    gratis_ongkir_dari_shopee,
    ongkos_kirim_dibayarkan_ke_jasa_kirim,
    biaya_administrasi,
    biaya_proses_pesanan,
    biaya_gratis_ongkir_xtra,
    biaya_layanan_promo_xtra,
    biaya_lainnya,
    total_fees,
    net_payout,
    profit,
    margin_percent,
    hpp_matched,
    hpp_match_method,
    waktu_pesanan_dibuat,
    tanggal_dana_dilepaskan
  )
  SELECT 
    o.no_pesanan,
    o.nama_produk,
    COALESCE(o.nomor_referensi_sku, o.sku_induk) AS matched_sku,
    m.idproduk,
    m.hpp,
    
    -- Income components
    i.harga_produk,
    i.gratis_ongkir_dari_shopee,
    i.ongkos_kirim_dibayarkan_ke_jasa_kirim,
    i.biaya_administrasi,
    i.biaya_proses_pesanan,
    COALESCE(i.biaya_gratis_ongkir_xtra_ukuran_biasa_f, 0) + 
      COALESCE(i.biaya_gratis_ongkir_xtra_ukuran_biasa_f_2, 0) AS biaya_gratis_ongkir_xtra,
    i.biaya_layanan_promo_xtra,
    i.biaya_lainnya,
    
    -- Total fees
    COALESCE(i.biaya_administrasi, 0) +
      COALESCE(i.biaya_proses_pesanan, 0) +
      COALESCE(i.biaya_gratis_ongkir_xtra_ukuran_biasa_f, 0) +
      COALESCE(i.biaya_gratis_ongkir_xtra_ukuran_biasa_f_2, 0) +
      COALESCE(i.biaya_layanan_promo_xtra, 0) +
      COALESCE(i.biaya_lainnya, 0) +
      COALESCE(i.ongkos_kirim_dibayarkan_ke_jasa_kirim, 0) AS total_fees,
    
    -- Net payout
    COALESCE(i.harga_produk, 0) +
      COALESCE(i.gratis_ongkir_dari_shopee, 0) -
      COALESCE(i.ongkos_kirim_dibayarkan_ke_jasa_kirim, 0) -
      COALESCE(i.biaya_administrasi, 0) -
      COALESCE(i.biaya_proses_pesanan, 0) -
      COALESCE(i.biaya_gratis_ongkir_xtra_ukuran_biasa_f, 0) -
      COALESCE(i.biaya_gratis_ongkir_xtra_ukuran_biasa_f_2, 0) -
      COALESCE(i.biaya_layanan_promo_xtra, 0) -
      COALESCE(i.biaya_lainnya, 0) AS net_payout,
    
    -- Profit calculation
    (COALESCE(i.harga_produk, 0) +
      COALESCE(i.gratis_ongkir_dari_shopee, 0) -
      COALESCE(i.ongkos_kirim_dibayarkan_ke_jasa_kirim, 0) -
      COALESCE(i.biaya_administrasi, 0) -
      COALESCE(i.biaya_proses_pesanan, 0) -
      COALESCE(i.biaya_gratis_ongkir_xtra_ukuran_biasa_f, 0) -
      COALESCE(i.biaya_gratis_ongkir_xtra_ukuran_biasa_f_2, 0) -
      COALESCE(i.biaya_layanan_promo_xtra, 0) -
      COALESCE(i.biaya_lainnya, 0)) - COALESCE(m.hpp, 0) AS profit,
    
    -- Margin percentage
    CASE 
      WHEN (COALESCE(i.harga_produk, 0) +
        COALESCE(i.gratis_ongkir_dari_shopee, 0) -
        COALESCE(i.ongkos_kirim_dibayarkan_ke_jasa_kirim, 0) -
        COALESCE(i.biaya_administrasi, 0) -
        COALESCE(i.biaya_proses_pesanan, 0) -
        COALESCE(i.biaya_gratis_ongkir_xtra_ukuran_biasa_f, 0) -
        COALESCE(i.biaya_gratis_ongkir_xtra_ukuran_biasa_f_2, 0) -
        COALESCE(i.biaya_layanan_promo_xtra, 0) -
        COALESCE(i.biaya_lainnya, 0)) = 0 THEN 0
      ELSE (
        ((COALESCE(i.harga_produk, 0) +
          COALESCE(i.gratis_ongkir_dari_shopee, 0) -
          COALESCE(i.ongkos_kirim_dibayarkan_ke_jasa_kirim, 0) -
          COALESCE(i.biaya_administrasi, 0) -
          COALESCE(i.biaya_proses_pesanan, 0) -
          COALESCE(i.biaya_gratis_ongkir_xtra_ukuran_biasa_f, 0) -
          COALESCE(i.biaya_gratis_ongkir_xtra_ukuran_biasa_f_2, 0) -
          COALESCE(i.biaya_layanan_promo_xtra, 0) -
          COALESCE(i.biaya_lainnya, 0)) - COALESCE(m.hpp, 0)) /
        (COALESCE(i.harga_produk, 0) +
          COALESCE(i.gratis_ongkir_dari_shopee, 0) -
          COALESCE(i.ongkos_kirim_dibayarkan_ke_jasa_kirim, 0) -
          COALESCE(i.biaya_administrasi, 0) -
          COALESCE(i.biaya_proses_pesanan, 0) -
          COALESCE(i.biaya_gratis_ongkir_xtra_ukuran_biasa_f, 0) -
          COALESCE(i.biaya_gratis_ongkir_xtra_ukuran_biasa_f_2, 0) -
          COALESCE(i.biaya_layanan_promo_xtra, 0) -
          COALESCE(i.biaya_lainnya, 0))
      ) * 100
    END AS margin_percent,
    
    -- HPP match flags
    CASE WHEN m.hpp IS NOT NULL THEN TRUE ELSE FALSE END AS hpp_matched,
    CASE 
      WHEN m.sku1 = COALESCE(o.nomor_referensi_sku, o.sku_induk) THEN 'sku1'
      WHEN m.sku2 = COALESCE(o.nomor_referensi_sku, o.sku_induk) THEN 'sku2'
      ELSE NULL
    END AS hpp_match_method,
    
    o.waktu_pesanan_dibuat,
    i.tanggal_dana_dilepaskan
    
  FROM orders o
  LEFT JOIN income_penghasilan i ON o.no_pesanan = i.no_pesanan
  LEFT JOIN master_products m ON (
    COALESCE(o.nomor_referensi_sku, o.sku_induk) = m.sku1 OR
    COALESCE(o.nomor_referensi_sku, o.sku_induk) = m.sku2
  )
  WHERE i.lihat_berdasarkan = 'Order';  -- Filter hanya Order rows
  
END$$

DELIMITER ;

-- =====================================================
-- 6. INDEXES FOR VERCEL SERVERLESS OPTIMIZATION
-- =====================================================
-- Purpose: Optimize cold start & connection pooling
-- Strategy: Cover common dashboard queries dengan composite indexes
-- =====================================================

-- Composite index untuk date range + status queries
ALTER TABLE orders ADD INDEX idx_date_status (waktu_pesanan_dibuat, status_pesanan);
ALTER TABLE income_penghasilan ADD INDEX idx_date_filter (tanggal_dana_dilepaskan, lihat_berdasarkan);

-- Composite index untuk profit analysis by product
ALTER TABLE profit_calculation ADD INDEX idx_product_profit (idproduk, profit);
ALTER TABLE profit_calculation ADD INDEX idx_date_range_profit (tanggal_dana_dilepaskan, profit);

-- =====================================================
-- 7. SAMPLE QUERIES FOR DASHBOARD
-- =====================================================

-- Query 1: Total profit per bulan
-- SELECT 
--   DATE_FORMAT(tanggal_dana_dilepaskan, '%Y-%m') AS bulan,
--   COUNT(*) AS total_orders,
--   SUM(net_payout) AS total_revenue,
--   SUM(hpp) AS total_hpp,
--   SUM(profit) AS total_profit,
--   AVG(margin_percent) AS avg_margin
-- FROM profit_calculation
-- WHERE tanggal_dana_dilepaskan BETWEEN '2026-07-01' AND '2026-07-31'
-- GROUP BY bulan;

-- Query 2: Top 10 produk by profit
-- SELECT 
--   idproduk,
--   nama_produk,
--   COUNT(*) AS total_orders,
--   SUM(profit) AS total_profit,
--   AVG(margin_percent) AS avg_margin
-- FROM profit_calculation
-- WHERE hpp_matched = TRUE
-- GROUP BY idproduk, nama_produk
-- ORDER BY total_profit DESC
-- LIMIT 10;

-- Query 3: Orders tanpa HPP match (perlu review)
-- SELECT 
--   o.no_pesanan,
--   o.nama_produk,
--   o.nomor_referensi_sku,
--   o.sku_induk,
--   pc.hpp_matched
-- FROM orders o
-- LEFT JOIN profit_calculation pc ON o.no_pesanan = pc.no_pesanan
-- WHERE pc.hpp_matched = FALSE OR pc.hpp_matched IS NULL;

-- =====================================================
-- 8. CONNECTION POOLING RECOMMENDATIONS
-- =====================================================
-- Untuk Vercel serverless dengan MySQL cPanel remote:
--
-- 1. Use connection pooling library:
--    - @planetscale/database (preferred untuk serverless)
--    - mysql2 dengan pool configuration
--
-- 2. Pool configuration:
--    ```javascript
--    const pool = mysql.createPool({
--      host: '103.136.19.30',
--      user: 'supplie3_shopee_profit_estimation',
--      password: 'Persib1933',
--      database: 'supplie3_shopee_profit_estimation',
--      waitForConnections: true,
--      connectionLimit: 10,  // Conservative untuk cPanel
--      queueLimit: 0,
--      enableKeepAlive: true,
--      keepAliveInitialDelay: 0
--    });
--    ```
--
-- 3. Use prepared statements untuk query caching
-- 4. Implement query result caching (Redis/Vercel KV optional)
-- 5. Pre-calculate profit via stored procedure, bukan real-time
--
-- =====================================================

-- =====================================================
-- END OF SCHEMA
-- =====================================================
