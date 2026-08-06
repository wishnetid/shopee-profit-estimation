-- ============================================================================
-- Shopee Profit Estimation - Database Schema v2
-- ============================================================================
-- Created: 2026-08-06
-- Version: 2.0 (Fixed: multi-item orders + orphan income records)
-- ============================================================================

-- Drop existing tables
DROP TABLE IF EXISTS profit_calculation;
DROP TABLE IF EXISTS income_penghasilan;
DROP TABLE IF EXISTS order_all;
DROP TABLE IF EXISTS master_products;

-- ============================================================================
-- TABLE 1: master_products
-- ============================================================================

CREATE TABLE master_products (
  id INT PRIMARY KEY AUTO_INCREMENT,
  sku1 VARCHAR(100) NOT NULL,
  sku2 VARCHAR(100) NULL,
  harga DECIMAL(15,2) NOT NULL,
  idproduk VARCHAR(100) NOT NULL,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_sku1 (sku1),
  INDEX idx_sku2 (sku2),
  INDEX idx_idproduk (idproduk)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- TABLE 2: order_all (ALLOW DUPLICATES - multi-item orders)
-- ============================================================================

CREATE TABLE order_all (
  id INT PRIMARY KEY AUTO_INCREMENT,
  no_pesanan VARCHAR(50) NOT NULL COMMENT 'NOT UNIQUE - multi-item orders',
  status_pesanan VARCHAR(50) NULL,
  alasan_pembatalan TEXT NULL,
  status_pembatalan_pengembalian VARCHAR(100) NULL,
  no_resi VARCHAR(100) NULL,
  
  nama_produk TEXT NULL,
  nomor_referensi_sku VARCHAR(100) NULL,
  sku_induk VARCHAR(100) NULL,
  nama_variasi VARCHAR(255) NULL,
  
  harga_awal DECIMAL(15,2) NULL,
  harga_setelah_diskon DECIMAL(15,2) NULL,
  jumlah INT NULL,
  subtotal_pesanan DECIMAL(15,2) NULL,
  total_diskon DECIMAL(15,2) NULL,
  diskon_dari_penjual DECIMAL(15,2) NULL,
  diskon_dari_shopee DECIMAL(15,2) NULL,
  
  opsi_pengiriman VARCHAR(100) NULL,
  ongkos_kirim_dibayar_pembeli DECIMAL(15,2) NULL,
  perkiraan_ongkos_kirim DECIMAL(15,2) NULL,
  total_pembayaran DECIMAL(15,2) NULL,
  
  waktu_pesanan_dibuat DATETIME NULL,
  waktu_pembayaran_dilakukan DATETIME NULL,
  waktu_pesanan_selesai DATETIME NULL,
  
  username_pembeli VARCHAR(100) NULL,
  metode_pembayaran VARCHAR(100) NULL,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_no_pesanan (no_pesanan),
  INDEX idx_status (status_pesanan),
  INDEX idx_nomor_referensi_sku (nomor_referensi_sku),
  INDEX idx_sku_induk (sku_induk)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Order.all - Multi-item orders allowed (no UNIQUE constraint)';

-- ============================================================================
-- TABLE 3: income_penghasilan (NO FK - allow orphan records)
-- ============================================================================

CREATE TABLE income_penghasilan (
  id INT PRIMARY KEY AUTO_INCREMENT,
  no_pesanan VARCHAR(50) NOT NULL COMMENT 'NO FK - allow orphan records',
  lihat_berdasarkan VARCHAR(20) NOT NULL,
  
  waktu_pesanan_dibuat DATE NULL,
  tanggal_dana_dilepaskan DATE NULL,
  
  harga_produk DECIMAL(15,2) DEFAULT 0,
  ongkir_dibayar_pembeli DECIMAL(15,2) DEFAULT 0,
  ongkos_kirim_ke_jasa_kirim DECIMAL(15,2) DEFAULT 0,
  gratis_ongkir_dari_shopee DECIMAL(15,2) DEFAULT 0,
  
  biaya_administrasi DECIMAL(15,2) DEFAULT 0,
  biaya_proses_pesanan DECIMAL(15,2) DEFAULT 0,
  biaya_gratis_ongkir_xtra DECIMAL(15,2) DEFAULT 0,
  biaya_layanan_promo_xtra DECIMAL(15,2) DEFAULT 0,
  biaya_lainnya DECIMAL(15,2) DEFAULT 0,
  
  jumlah_dibayar_pembeli DECIMAL(15,2) DEFAULT 0,
  metode_pembayaran_pembeli VARCHAR(100) NULL,
  username_pembeli VARCHAR(100) NULL,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_no_pesanan (no_pesanan),
  INDEX idx_lihat_berdasarkan (lihat_berdasarkan),
  INDEX idx_tanggal_dilepaskan (tanggal_dana_dilepaskan)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Income Penghasilan - Orphan records allowed (NO FK constraint)';

-- ============================================================================
-- TABLE 4: profit_calculation
-- ============================================================================

CREATE TABLE profit_calculation (
  id INT PRIMARY KEY AUTO_INCREMENT,
  no_pesanan VARCHAR(50) NOT NULL COMMENT 'Can have multiple rows per order (multi-item)',
  order_item_id INT NULL COMMENT 'Reference to order_all.id for multi-item',
  
  sku_matched VARCHAR(100) NULL,
  hpp DECIMAL(15,2) NULL,
  idproduk VARCHAR(100) NULL,
  
  net_payout DECIMAL(15,2) NULL,
  profit DECIMAL(15,2) NULL,
  margin_percent DECIMAL(5,2) NULL,
  
  profit_status VARCHAR(20) NULL,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_no_pesanan (no_pesanan),
  INDEX idx_order_item_id (order_item_id),
  INDEX idx_profit (profit)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Profit calculation - Multi-item orders supported';

-- ============================================================================
-- STORED PROCEDURE: calculate_profit_per_item()
-- ============================================================================

DELIMITER $$

CREATE PROCEDURE calculate_profit_per_item()
BEGIN
  TRUNCATE TABLE profit_calculation;
  
  INSERT INTO profit_calculation (
    no_pesanan,
    order_item_id,
    sku_matched,
    hpp,
    idproduk,
    net_payout,
    profit,
    margin_percent,
    profit_status
  )
  SELECT 
    o.no_pesanan,
    o.id AS order_item_id,
    
    CASE 
      WHEN m1.sku1 IS NOT NULL THEN COALESCE(o.nomor_referensi_sku, o.sku_induk)
      WHEN m2.sku2 IS NOT NULL THEN COALESCE(o.nomor_referensi_sku, o.sku_induk)
      ELSE NULL
    END AS sku_matched,
    
    COALESCE(m1.harga, m2.harga) AS hpp,
    COALESCE(m1.idproduk, m2.idproduk) AS idproduk,
    
    -- Net Payout (from income, divided by item count for multi-item orders)
    (
      SELECT 
        (
          COALESCE(i.harga_produk, 0)
          + COALESCE(i.gratis_ongkir_dari_shopee, 0)
          + COALESCE(i.ongkos_kirim_ke_jasa_kirim, 0)
          + COALESCE(i.biaya_administrasi, 0)
          + COALESCE(i.biaya_proses_pesanan, 0)
          + COALESCE(i.biaya_gratis_ongkir_xtra, 0)
          + COALESCE(i.biaya_layanan_promo_xtra, 0)
          + COALESCE(i.biaya_lainnya, 0)
        ) / (SELECT COUNT(*) FROM order_all WHERE no_pesanan = o.no_pesanan)
      FROM income_penghasilan i
      WHERE i.no_pesanan = o.no_pesanan AND i.lihat_berdasarkan = 'Order'
      LIMIT 1
    ) AS net_payout,
    
    -- Profit = Net Payout - HPP
    (
      (
        SELECT 
          (
            COALESCE(i.harga_produk, 0)
            + COALESCE(i.gratis_ongkir_dari_shopee, 0)
            + COALESCE(i.ongkos_kirim_ke_jasa_kirim, 0)
            + COALESCE(i.biaya_administrasi, 0)
            + COALESCE(i.biaya_proses_pesanan, 0)
            + COALESCE(i.biaya_gratis_ongkir_xtra, 0)
            + COALESCE(i.biaya_layanan_promo_xtra, 0)
            + COALESCE(i.biaya_lainnya, 0)
          ) / (SELECT COUNT(*) FROM order_all WHERE no_pesanan = o.no_pesanan)
        FROM income_penghasilan i
        WHERE i.no_pesanan = o.no_pesanan AND i.lihat_berdasarkan = 'Order'
        LIMIT 1
      )
      - COALESCE(m1.harga, m2.harga, 0)
    ) AS profit,
    
    -- Margin %
    CASE 
      WHEN (
        SELECT 
          (
            COALESCE(i.harga_produk, 0)
            + COALESCE(i.gratis_ongkir_dari_shopee, 0)
            + COALESCE(i.ongkos_kirim_ke_jasa_kirim, 0)
            + COALESCE(i.biaya_administrasi, 0)
            + COALESCE(i.biaya_proses_pesanan, 0)
            + COALESCE(i.biaya_gratis_ongkir_xtra, 0)
            + COALESCE(i.biaya_layanan_promo_xtra, 0)
            + COALESCE(i.biaya_lainnya, 0)
          ) / (SELECT COUNT(*) FROM order_all WHERE no_pesanan = o.no_pesanan)
        FROM income_penghasilan i
        WHERE i.no_pesanan = o.no_pesanan AND i.lihat_berdasarkan = 'Order'
        LIMIT 1
      ) > 0 THEN
        (
          (
            (
              SELECT 
                (
                  COALESCE(i.harga_produk, 0)
                  + COALESCE(i.gratis_ongkir_dari_shopee, 0)
                  + COALESCE(i.ongkos_kirim_ke_jasa_kirim, 0)
                  + COALESCE(i.biaya_administrasi, 0)
                  + COALESCE(i.biaya_proses_pesanan, 0)
                  + COALESCE(i.biaya_gratis_ongkir_xtra, 0)
                  + COALESCE(i.biaya_layanan_promo_xtra, 0)
                  + COALESCE(i.biaya_lainnya, 0)
                ) / (SELECT COUNT(*) FROM order_all WHERE no_pesanan = o.no_pesanan)
              FROM income_penghasilan i
              WHERE i.no_pesanan = o.no_pesanan AND i.lihat_berdasarkan = 'Order'
              LIMIT 1
            )
            - COALESCE(m1.harga, m2.harga, 0)
          )
          /
          (
            SELECT 
              (
                COALESCE(i.harga_produk, 0)
                + COALESCE(i.gratis_ongkir_dari_shopee, 0)
                + COALESCE(i.ongkos_kirim_ke_jasa_kirim, 0)
                + COALESCE(i.biaya_administrasi, 0)
                + COALESCE(i.biaya_proses_pesanan, 0)
                + COALESCE(i.biaya_gratis_ongkir_xtra, 0)
                + COALESCE(i.biaya_layanan_promo_xtra, 0)
                + COALESCE(i.biaya_lainnya, 0)
              ) / (SELECT COUNT(*) FROM order_all WHERE no_pesanan = o.no_pesanan)
            FROM income_penghasilan i
            WHERE i.no_pesanan = o.no_pesanan AND i.lihat_berdasarkan = 'Order'
            LIMIT 1
          )
        ) * 100
      ELSE 0
    END AS margin_percent,
    
    CASE 
      WHEN o.status_pesanan = 'Selesai' THEN 'Confirmed'
      ELSE 'Expected'
    END AS profit_status
    
  FROM order_all o
  LEFT JOIN master_products m1 ON COALESCE(o.nomor_referensi_sku, o.sku_induk) = m1.sku1
  LEFT JOIN master_products m2 ON COALESCE(o.nomor_referensi_sku, o.sku_induk) = m2.sku2 AND m1.sku1 IS NULL;
  
END$$

DELIMITER ;
