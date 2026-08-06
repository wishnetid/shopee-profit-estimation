-- =====================================================
-- QUICK TEST QUERIES - Shopee Profit Estimation
-- =====================================================
-- Run these after schema creation to verify structure
-- =====================================================

-- 1. Verify tables created
SHOW TABLES;

-- 2. Check table structures
DESCRIBE master_products;
DESCRIBE orders;
DESCRIBE income_penghasilan;
DESCRIBE profit_calculation;

-- 3. Check indexes
SHOW INDEX FROM master_products;
SHOW INDEX FROM orders;
SHOW INDEX FROM income_penghasilan;
SHOW INDEX FROM profit_calculation;

-- 4. Verify stored procedure exists
SHOW PROCEDURE STATUS WHERE Db = 'supplie3_shopee_profit_estimation';

-- 5. Check foreign key constraints
SELECT 
  TABLE_NAME,
  COLUMN_NAME,
  CONSTRAINT_NAME,
  REFERENCED_TABLE_NAME,
  REFERENCED_COLUMN_NAME
FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'supplie3_shopee_profit_estimation'
  AND REFERENCED_TABLE_NAME IS NOT NULL;

-- =====================================================
-- SAMPLE DATA INSERT (for testing)
-- =====================================================

-- Insert sample master_products
INSERT INTO master_products (sku1, sku2, hpp, idproduk) VALUES
('M-TAC Pendek', 'MTAC-SHORT', 52500, 'M-TAC Pendek'),
('TEST-SKU-001', 'TEST-ALT-001', 100000, 'TEST-PRODUCT-001');

-- Insert sample order
INSERT INTO orders (
  no_pesanan,
  status_pesanan,
  nama_produk,
  nomor_referensi_sku,
  sku_induk,
  waktu_pesanan_dibuat,
  waktu_pesanan_selesai,
  subtotal_pesanan,
  jumlah
) VALUES (
  '2607072CRRDA37',
  'Selesai',
  'Kemeja Tactical Pria Lengan Pendek M-TAC RIPSTOP',
  'M-TAC Pendek',
  NULL,
  '2026-07-07 12:00:00',
  '2026-07-15 14:30:00',
  82500,
  1
);

-- Insert sample income_penghasilan
INSERT INTO income_penghasilan (
  lihat_berdasarkan,
  no_pesanan,
  nama_produk,
  waktu_pesanan_dibuat,
  tanggal_dana_dilepaskan,
  harga_produk,
  gratis_ongkir_dari_shopee,
  ongkos_kirim_dibayarkan_ke_jasa_kirim,
  biaya_administrasi,
  biaya_proses_pesanan,
  biaya_gratis_ongkir_xtra_ukuran_biasa_f,
  biaya_layanan_promo_xtra,
  biaya_lainnya
) VALUES (
  'Order',
  '2607072CRRDA37',
  'Kemeja Tactical Pria Lengan Pendek M-TAC RIPSTOP',
  '2026-07-07 12:00:00',
  '2026-07-15 14:30:00',
  82500,
  18000,
  18000,
  6806,
  1250,
  4125,
  3713,
  413
);

-- Run profit calculation
CALL calculate_profit();

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Check if sample data inserted correctly
SELECT COUNT(*) as master_count FROM master_products;
SELECT COUNT(*) as orders_count FROM orders;
SELECT COUNT(*) as income_count FROM income_penghasilan;
SELECT COUNT(*) as profit_count FROM profit_calculation;

-- Verify HPP mapping worked
SELECT 
  no_pesanan,
  nama_produk,
  matched_sku,
  hpp,
  hpp_matched,
  hpp_match_method,
  net_payout,
  profit,
  margin_percent
FROM profit_calculation;

-- Expected result for sample data:
-- no_pesanan: 2607072CRRDA37
-- matched_sku: M-TAC Pendek
-- hpp: 52500
-- hpp_matched: TRUE
-- hpp_match_method: sku1
-- net_payout: 66193 (82500 + 18000 - 18000 - 6806 - 1250 - 4125 - 3713 - 413)
-- profit: 13693 (66193 - 52500)
-- margin_percent: 20.69

-- Verify net payout calculation breakdown
SELECT 
  no_pesanan,
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
  -- Manual calculation to verify
  (harga_produk + gratis_ongkir_dari_shopee - ongkos_kirim_dibayarkan_ke_jasa_kirim -
   biaya_administrasi - biaya_proses_pesanan - biaya_gratis_ongkir_xtra -
   biaya_layanan_promo_xtra - biaya_lainnya) as calculated_net_payout
FROM profit_calculation;

-- =====================================================
-- CLEANUP TEST DATA (optional)
-- =====================================================

-- Uncomment to remove test data:
-- DELETE FROM profit_calculation WHERE no_pesanan = '2607072CRRDA37';
-- DELETE FROM income_penghasilan WHERE no_pesanan = '2607072CRRDA37';
-- DELETE FROM orders WHERE no_pesanan = '2607072CRRDA37';
-- DELETE FROM master_products WHERE sku1 IN ('M-TAC Pendek', 'TEST-SKU-001');

-- =====================================================
-- PERFORMANCE TEST QUERIES
-- =====================================================

-- Test index performance (run EXPLAIN on these)
EXPLAIN SELECT * FROM orders WHERE no_pesanan = '2607072CRRDA37';
EXPLAIN SELECT * FROM orders WHERE nomor_referensi_sku = 'M-TAC Pendek';
EXPLAIN SELECT * FROM profit_calculation WHERE hpp_matched = TRUE;
EXPLAIN SELECT * FROM profit_calculation 
WHERE tanggal_dana_dilepaskan BETWEEN '2026-07-01' AND '2026-07-31'
ORDER BY profit DESC;

-- Check index cardinality
SELECT 
  TABLE_NAME,
  INDEX_NAME,
  SEQ_IN_INDEX,
  COLUMN_NAME,
  CARDINALITY
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = 'supplie3_shopee_profit_estimation'
ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX;
