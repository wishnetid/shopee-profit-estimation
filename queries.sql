-- Shopee Profit Estimation - SQL Query Examples
-- Useful queries untuk analisis data profit

-- ============================================================================
-- 1. BASIC PROFIT CALCULATION
-- ============================================================================

-- Profit per order
SELECT 
    o.no_pesanan,
    o.nama_produk,
    i.waktu_pesanan_dibuat,
    o.hpp,
    i.net_payout_calculated as net_payout,
    (i.net_payout_calculated - o.hpp) as profit,
    ROUND((i.net_payout_calculated - o.hpp) / i.net_payout_calculated * 100, 1) as margin_pct
FROM orders o
JOIN income_penghasilan i ON o.no_pesanan = i.no_pesanan
WHERE o.hpp > 0 AND i.net_payout_calculated > 0
ORDER BY i.waktu_pesanan_dibuat DESC;

-- ============================================================================
-- 2. PROFIT SUMMARY STATISTICS
-- ============================================================================

-- Overall profit summary
SELECT 
    COUNT(*) as total_orders,
    SUM(i.net_payout_calculated - o.hpp) as total_profit,
    AVG(i.net_payout_calculated - o.hpp) as avg_profit,
    MIN(i.net_payout_calculated - o.hpp) as min_profit,
    MAX(i.net_payout_calculated - o.hpp) as max_profit,
    ROUND(AVG((i.net_payout_calculated - o.hpp) / i.net_payout_calculated * 100), 1) as avg_margin_pct
FROM orders o
JOIN income_penghasilan i ON o.no_pesanan = i.no_pesanan
WHERE o.hpp > 0 AND i.net_payout_calculated > 0;

-- ============================================================================
-- 3. TOP PRODUCTS BY PROFIT
-- ============================================================================

-- Top 20 products by total profit
SELECT 
    o.idproduk,
    o.nomor_referensi_sku,
    COUNT(*) as order_count,
    AVG(o.hpp) as avg_hpp,
    AVG(i.net_payout_calculated) as avg_net_payout,
    SUM(i.net_payout_calculated - o.hpp) as total_profit,
    AVG(i.net_payout_calculated - o.hpp) as avg_profit,
    ROUND(AVG((i.net_payout_calculated - o.hpp) / i.net_payout_calculated * 100), 1) as avg_margin_pct
FROM orders o
JOIN income_penghasilan i ON o.no_pesanan = i.no_pesanan
WHERE o.hpp > 0 AND i.net_payout_calculated > 0
GROUP BY o.idproduk, o.nomor_referensi_sku
ORDER BY total_profit DESC
LIMIT 20;

-- ============================================================================
-- 4. DAILY PROFIT TREND
-- ============================================================================

-- Profit per day
SELECT 
    DATE(i.waktu_pesanan_dibuat) as tanggal,
    COUNT(*) as order_count,
    SUM(i.net_payout_calculated) as total_revenue,
    SUM(o.hpp) as total_hpp,
    SUM(i.net_payout_calculated - o.hpp) as total_profit,
    ROUND(AVG((i.net_payout_calculated - o.hpp) / i.net_payout_calculated * 100), 1) as avg_margin_pct
FROM orders o
JOIN income_penghasilan i ON o.no_pesanan = i.no_pesanan
WHERE o.hpp > 0 AND i.net_payout_calculated > 0
GROUP BY DATE(i.waktu_pesanan_dibuat)
ORDER BY tanggal DESC;

-- ============================================================================
-- 5. COST BREAKDOWN ANALYSIS
-- ============================================================================

-- Average cost components per order
SELECT 
    COUNT(*) as order_count,
    AVG(harga_produk) as avg_harga_produk,
    AVG(gratis_ongkir_shopee) as avg_gratis_ongkir_shopee,
    AVG(ongkir_ke_jasa_kirim) as avg_ongkir_jasa_kirim,
    AVG(biaya_administrasi) as avg_biaya_admin,
    AVG(biaya_proses_pesanan) as avg_biaya_proses,
    AVG(biaya_gratis_ongkir_xtra) as avg_biaya_xtra_ongkir,
    AVG(biaya_layanan_promo_xtra) as avg_biaya_xtra_promo,
    AVG(biaya_lainnya) as avg_biaya_lainnya,
    AVG(net_payout_calculated) as avg_net_payout
FROM income_penghasilan
WHERE lihat_berdasarkan = 'Order';

-- Cost breakdown by product
SELECT 
    o.idproduk,
    o.nomor_referensi_sku,
    COUNT(*) as order_count,
    AVG(i.harga_produk) as avg_harga_jual,
    AVG(o.hpp) as avg_hpp,
    AVG(i.biaya_administrasi) as avg_biaya_admin,
    AVG(i.biaya_proses_pesanan) as avg_biaya_proses,
    AVG(i.biaya_gratis_ongkir_xtra + i.biaya_layanan_promo_xtra) as avg_biaya_promo,
    AVG(i.net_payout_calculated) as avg_net_payout,
    AVG(i.net_payout_calculated - o.hpp) as avg_profit
FROM orders o
JOIN income_penghasilan i ON o.no_pesanan = i.no_pesanan
WHERE o.hpp > 0 AND i.net_payout_calculated > 0
GROUP BY o.idproduk, o.nomor_referensi_sku
ORDER BY order_count DESC;

-- ============================================================================
-- 6. HPP MAPPING VERIFICATION
-- ============================================================================

-- Check HPP mapping success rate
SELECT 
    matched_sku_type,
    COUNT(*) as count,
    ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM orders), 1) as percentage
FROM orders
WHERE matched_sku_type IS NOT NULL
GROUP BY matched_sku_type;

-- Orders without HPP mapping
SELECT 
    no_pesanan,
    nomor_referensi_sku,
    sku_induk,
    nama_produk,
    hpp
FROM orders
WHERE hpp = 0 OR hpp IS NULL
LIMIT 20;

-- Master products not used
SELECT 
    m.sku1,
    m.sku2,
    m.harga,
    m.idproduk
FROM master_products m
LEFT JOIN orders o ON (o.nomor_referensi_sku = m.sku1 OR o.nomor_referensi_sku = m.sku2 
                       OR o.sku_induk = m.sku1 OR o.sku_induk = m.sku2)
WHERE o.id IS NULL;

-- ============================================================================
-- 7. DATA COMPLETENESS CHECK
-- ============================================================================

-- Orders without income data
SELECT 
    o.no_pesanan,
    o.status_pesanan,
    o.nama_produk,
    o.waktu_pesanan_dibuat
FROM orders o
LEFT JOIN income_penghasilan i ON o.no_pesanan = i.no_pesanan
WHERE i.no_pesanan IS NULL
LIMIT 20;

-- Income without order data
SELECT 
    i.no_pesanan,
    i.nama_produk,
    i.waktu_pesanan_dibuat,
    i.net_payout_calculated
FROM income_penghasilan i
LEFT JOIN orders o ON i.no_pesanan = o.no_pesanan
WHERE o.no_pesanan IS NULL
LIMIT 20;

-- Data completeness summary
SELECT 
    'Total Orders' as metric,
    COUNT(*) as count
FROM orders
UNION ALL
SELECT 
    'Orders with Income' as metric,
    COUNT(DISTINCT o.no_pesanan) as count
FROM orders o
JOIN income_penghasilan i ON o.no_pesanan = i.no_pesanan
UNION ALL
SELECT 
    'Orders with HPP' as metric,
    COUNT(*) as count
FROM orders
WHERE hpp > 0
UNION ALL
SELECT 
    'Total Income Records' as metric,
    COUNT(*) as count
FROM income_penghasilan
UNION ALL
SELECT 
    'Income (Order type)' as metric,
    COUNT(*) as count
FROM income_penghasilan
WHERE lihat_berdasarkan = 'Order';

-- ============================================================================
-- 8. NEGATIVE PROFIT ANALYSIS
-- ============================================================================

-- Orders with negative profit (loss)
SELECT 
    o.no_pesanan,
    o.nama_produk,
    o.hpp,
    i.harga_produk,
    i.net_payout_calculated,
    (i.net_payout_calculated - o.hpp) as profit,
    i.biaya_administrasi,
    i.biaya_gratis_ongkir_xtra,
    i.biaya_layanan_promo_xtra
FROM orders o
JOIN income_penghasilan i ON o.no_pesanan = i.no_pesanan
WHERE (i.net_payout_calculated - o.hpp) < 0
ORDER BY profit ASC
LIMIT 20;

-- ============================================================================
-- 9. HIGH MARGIN PRODUCTS
-- ============================================================================

-- Products with margin > 30%
SELECT 
    o.idproduk,
    o.nomor_referensi_sku,
    COUNT(*) as order_count,
    AVG(o.hpp) as avg_hpp,
    AVG(i.harga_produk) as avg_harga_jual,
    AVG(i.net_payout_calculated) as avg_net_payout,
    AVG(i.net_payout_calculated - o.hpp) as avg_profit,
    ROUND(AVG((i.net_payout_calculated - o.hpp) / i.net_payout_calculated * 100), 1) as avg_margin_pct
FROM orders o
JOIN income_penghasilan i ON o.no_pesanan = i.no_pesanan
WHERE o.hpp > 0 AND i.net_payout_calculated > 0
GROUP BY o.idproduk, o.nomor_referensi_sku
HAVING avg_margin_pct > 30
ORDER BY avg_margin_pct DESC;

-- ============================================================================
-- 10. VALIDATION CHECK
-- ============================================================================

-- Net payout validation failures
SELECT 
    no_pesanan,
    harga_produk,
    net_payout,
    net_payout_calculated,
    (net_payout - net_payout_calculated) as difference,
    validation_status
FROM income_penghasilan
WHERE validation_status = 'FAIL'
LIMIT 20;

-- ============================================================================
-- 11. EXPORT FOR DASHBOARD
-- ============================================================================

-- Complete data export untuk dashboard
SELECT 
    o.no_pesanan,
    DATE(i.waktu_pesanan_dibuat) as tanggal,
    o.idproduk,
    o.nomor_referensi_sku as sku,
    o.nama_produk,
    o.hpp,
    i.harga_produk,
    i.gratis_ongkir_shopee,
    i.ongkir_ke_jasa_kirim,
    i.biaya_administrasi,
    i.biaya_proses_pesanan,
    i.biaya_gratis_ongkir_xtra,
    i.biaya_layanan_promo_xtra,
    i.biaya_lainnya,
    i.net_payout_calculated as net_payout,
    (i.net_payout_calculated - o.hpp) as profit,
    ROUND((i.net_payout_calculated - o.hpp) / i.net_payout_calculated * 100, 1) as margin_pct
FROM orders o
JOIN income_penghasilan i ON o.no_pesanan = i.no_pesanan
WHERE o.hpp > 0 AND i.net_payout_calculated > 0
ORDER BY i.waktu_pesanan_dibuat DESC;

-- ============================================================================
-- 12. MONTHLY SUMMARY
-- ============================================================================

-- Monthly profit summary
SELECT 
    DATE_FORMAT(i.waktu_pesanan_dibuat, '%Y-%m') as bulan,
    COUNT(*) as order_count,
    SUM(i.harga_produk) as total_harga_jual,
    SUM(o.hpp) as total_hpp,
    SUM(i.net_payout_calculated) as total_net_payout,
    SUM(i.net_payout_calculated - o.hpp) as total_profit,
    ROUND(AVG((i.net_payout_calculated - o.hpp) / i.net_payout_calculated * 100), 1) as avg_margin_pct
FROM orders o
JOIN income_penghasilan i ON o.no_pesanan = i.no_pesanan
WHERE o.hpp > 0 AND i.net_payout_calculated > 0
GROUP BY DATE_FORMAT(i.waktu_pesanan_dibuat, '%Y-%m')
ORDER BY bulan DESC;
