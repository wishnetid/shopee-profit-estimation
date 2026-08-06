# Database Schema Documentation

**Project:** Shopee Profit Estimation  
**Database:** supplie3_shopee_profit_estimation@103.136.19.30  
**Date:** 2026-08-06  
**Optimized for:** Vercel Serverless + MySQL cPanel Remote

---

## Overview

Schema terdiri dari 3 core tables + 1 calculated table:

1. **master_products** - HPP reference dari master.xlsx
2. **orders** - Source of truth dari Order.all
3. **income_penghasilan** - Detail biaya & penghasilan dari Income sheet
4. **profit_calculation** - Pre-calculated profit (materialized)

---

## Critical Business Logic

### HPP Mapping Logic ⚠️

**Priority Order:**

```
Step 1: Ambil SKU dari orders table
  → COALESCE(nomor_referensi_sku, sku_induk)
  → Jika nomor_referensi_sku ada, gunakan itu
  → Jika kosong, fallback ke sku_induk

Step 2: Match ke master_products
  → Coba match dengan sku1 dulu
  → Jika tidak match, coba sku2
  → Ambil hpp (sudah termasuk packaging)
  → Simpan idproduk sebagai universal identifier

Step 3: Calculate Profit
  → profit = net_payout - hpp
```

**SQL Implementation:**

```sql
LEFT JOIN master_products m ON (
  COALESCE(o.nomor_referensi_sku, o.sku_induk) = m.sku1 OR
  COALESCE(o.nomor_referensi_sku, o.sku_induk) = m.sku2
)
```

### Net Payout Formula

```
Net Payout = harga_produk
           + gratis_ongkir_dari_shopee
           - ongkos_kirim_dibayarkan_ke_jasa_kirim
           - biaya_administrasi
           - biaya_proses_pesanan
           - biaya_gratis_ongkir_xtra (sum of 2 columns)
           - biaya_layanan_promo_xtra
           - biaya_lainnya
```

### Profit Formula

```
Profit = Net Payout - HPP

Margin % = (Profit / Net Payout) × 100
```

---

## Table Details

### 1. master_products

**Source:** master.xlsx  
**Columns:** 4 (sku1, sku2, hpp, idproduk)  
**Primary Key:** id (auto-increment)  
**Unique Constraint:** None (SKU bisa duplicate across stores)

**Key Fields:**
- `sku1` - Primary SKU identifier (indexed)
- `sku2` - Alternative SKU identifier (indexed)
- `hpp` - Harga Pokok Penjualan (sudah + packaging)
- `idproduk` - Universal product identifier (indexed)

**Indexes:**
- idx_sku1, idx_sku2, idx_idproduk

---

### 2. orders

**Source:** Order.all.*.xlsx  
**Columns:** 50 fields  
**Primary Key:** id (auto-increment)  
**Unique Constraint:** no_pesanan

**Key Fields for HPP Mapping:**
- `nomor_referensi_sku` - **Priority 1** untuk matching
- `sku_induk` - **Fallback** jika nomor_referensi_sku kosong

**Important Fields:**
- `no_pesanan` - Format: YYMMDD[A-Z0-9]{8-10}
- `status_pesanan` - Selesai, Dibatalkan, Dikembalikan, dll
- `waktu_pesanan_dibuat`, `waktu_pesanan_selesai` - Timestamps
- `subtotal_pesanan`, `total_pembayaran` - Financial summary

**Indexes:**
- no_pesanan (unique)
- status_pesanan, waktu_dibuat, waktu_selesai
- sku_induk, nomor_referensi_sku (untuk HPP mapping)
- date_status composite index (untuk dashboard)

---

### 3. income_penghasilan

**Source:** Income.sudah dilepas.*.xlsx - Sheet "Penghasilan"  
**Header Position:** Row 2 (skip row 0-1)  
**Filter:** Hanya row dengan `lihat_berdasarkan = "Order"`  
**Columns:** 52 fields

**Important Filter:**
```sql
WHERE lihat_berdasarkan = 'Order'
```

Rows dengan `lihat_berdasarkan = "Sku"` di-skip karena duplikasi data.

**Income Components:**
- `harga_produk` - Base product price
- `gratis_ongkir_dari_shopee` - Shipping subsidy dari Shopee

**Fee Components (negative values):**
- `biaya_administrasi` - Admin fee (~8.25% dari harga)
- `biaya_proses_pesanan` - Transaction processing (Rp1,250 flat)
- `biaya_gratis_ongkir_xtra_ukuran_biasa_f` - XTRA shipping promo fee 1
- `biaya_gratis_ongkir_xtra_ukuran_biasa_f_2` - XTRA shipping promo fee 2
- `biaya_layanan_promo_xtra` - XTRA service fee (~4.5%)
- `biaya_lainnya` - Premi & miscellaneous (Rp413 typical)
- `ongkos_kirim_dibayarkan_ke_jasa_kirim` - Actual shipping cost

**Foreign Key:**
- `no_pesanan` → orders(no_pesanan) ON DELETE CASCADE

**Indexes:**
- no_pesanan (FK)
- lihat_berdasarkan (filter)
- tanggal_dana_dilepaskan, waktu_pesanan_dibuat
- date_filter composite index

---

### 4. profit_calculation

**Purpose:** Pre-calculated profit untuk dashboard performance  
**Type:** Materialized table (bukan view)  
**Populated by:** Stored procedure `calculate_profit()`

**Why Materialized?**
- Avoid complex joins di setiap dashboard query
- Faster response untuk Vercel serverless (cold start)
- Query complexity → O(1) lookup vs O(n) join

**Key Fields:**
- `no_pesanan` - FK ke orders (unique)
- `hpp`, `net_payout`, `profit`, `margin_percent`
- `hpp_matched` - Boolean flag (TRUE jika HPP found)
- `hpp_match_method` - 'sku1', 'sku2', atau NULL
- `matched_sku` - SKU yang berhasil match
- `idproduk` - Universal product identifier

**Status Flags:**
```sql
hpp_matched = FALSE  -- Orders tanpa HPP, perlu review
hpp_match_method = 'sku1'  -- Matched via master.sku1
hpp_match_method = 'sku2'  -- Matched via master.sku2 (fallback)
```

**Indexes:**
- no_pesanan (unique, FK)
- profit, margin_percent (untuk sorting)
- hpp_matched (untuk filtering)
- waktu_dibuat, tanggal_dilepas
- idproduk, product_profit, date_range_profit (composites)

---

## Stored Procedure

### calculate_profit()

**Purpose:** Populate profit_calculation table  
**Run frequency:** After every data import  
**Execution time:** ~1-5s untuk 1000 orders

**Logic Flow:**

1. **TRUNCATE** profit_calculation (clear old data)
2. **JOIN** orders + income_penghasilan + master_products
3. **Filter** income rows dengan `lihat_berdasarkan = 'Order'`
4. **Calculate** net_payout (income - fees)
5. **Calculate** profit (net_payout - hpp)
6. **Calculate** margin_percent
7. **Set flags** hpp_matched & hpp_match_method
8. **INSERT** hasil ke profit_calculation

**Usage:**

```sql
CALL calculate_profit();
```

Run this after:
- Import orders dari Order.all
- Import income dari Income Penghasilan
- Update master_products HPP

---

## Vercel Serverless Optimization

### 1. Connection Pooling

**Issue:** MySQL cPanel remote + Vercel serverless = cold start penalty

**Solution:**

```javascript
// Use @planetscale/database atau mysql2 pool
const pool = mysql.createPool({
  host: '103.136.19.30',
  user: 'supplie3_shopee_profit_estimation',
  password: 'Persib1933',
  database: 'supplie3_shopee_profit_estimation',
  waitForConnections: true,
  connectionLimit: 10,  // Conservative untuk cPanel shared
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});
```

### 2. Query Strategy

**Bad (slow):**
```sql
-- Complex join di setiap request
SELECT ... FROM orders o
LEFT JOIN income_penghasilan i ...
LEFT JOIN master_products m ...
WHERE ... (complex conditions)
```

**Good (fast):**
```sql
-- Simple lookup dari pre-calculated table
SELECT * FROM profit_calculation
WHERE tanggal_dana_dilepaskan BETWEEN ? AND ?
ORDER BY profit DESC;
```

### 3. Index Coverage

Semua dashboard queries sudah di-cover dengan composite indexes:

- Date range queries → idx_date_status, idx_date_filter, idx_date_range_profit
- Product analysis → idx_product_profit, idx_idproduk
- Status filtering → idx_status, idx_hpp_matched
- Sorting → idx_profit, idx_margin

### 4. Prepared Statements

```javascript
// Cache query plans
const stmt = await pool.prepare(
  'SELECT * FROM profit_calculation WHERE tanggal_dana_dilepaskan BETWEEN ? AND ?'
);
const [rows] = await stmt.execute([startDate, endDate]);
```

---

## Dashboard Query Examples

### Query 1: Monthly Profit Summary

```sql
SELECT 
  DATE_FORMAT(tanggal_dana_dilepaskan, '%Y-%m') AS bulan,
  COUNT(*) AS total_orders,
  SUM(net_payout) AS total_revenue,
  SUM(hpp) AS total_hpp,
  SUM(total_fees) AS total_fees,
  SUM(profit) AS total_profit,
  AVG(margin_percent) AS avg_margin
FROM profit_calculation
WHERE tanggal_dana_dilepaskan BETWEEN '2026-07-01' AND '2026-07-31'
  AND hpp_matched = TRUE
GROUP BY bulan;
```

**Expected Performance:** <50ms (indexed)

---

### Query 2: Top Products by Profit

```sql
SELECT 
  idproduk,
  ANY_VALUE(nama_produk) AS nama_produk,
  COUNT(*) AS total_orders,
  SUM(profit) AS total_profit,
  AVG(margin_percent) AS avg_margin,
  SUM(net_payout) AS total_revenue
FROM profit_calculation
WHERE tanggal_dana_dilepaskan BETWEEN '2026-07-01' AND '2026-07-31'
  AND hpp_matched = TRUE
GROUP BY idproduk
ORDER BY total_profit DESC
LIMIT 10;
```

**Expected Performance:** <100ms (covered by idx_product_profit)

---

### Query 3: Orders Without HPP (Need Review)

```sql
SELECT 
  pc.no_pesanan,
  o.nama_produk,
  o.nomor_referensi_sku,
  o.sku_induk,
  COALESCE(o.nomor_referensi_sku, o.sku_induk) AS attempted_match,
  pc.net_payout,
  pc.hpp_matched
FROM profit_calculation pc
JOIN orders o ON pc.no_pesanan = o.no_pesanan
WHERE pc.hpp_matched = FALSE
ORDER BY pc.net_payout DESC;
```

**Expected Performance:** <100ms

**Action Required:** Add missing SKUs to master_products, then re-run `calculate_profit()`

---

### Query 4: Daily Profit Trend

```sql
SELECT 
  DATE(tanggal_dana_dilepaskan) AS tanggal,
  COUNT(*) AS total_orders,
  SUM(profit) AS daily_profit,
  AVG(margin_percent) AS avg_margin
FROM profit_calculation
WHERE tanggal_dana_dilepaskan BETWEEN '2026-07-01' AND '2026-07-31'
  AND hpp_matched = TRUE
GROUP BY tanggal
ORDER BY tanggal;
```

**Expected Performance:** <50ms

---

### Query 5: Profit Distribution by Margin Range

```sql
SELECT 
  CASE 
    WHEN margin_percent < 0 THEN 'Loss'
    WHEN margin_percent < 10 THEN '0-10%'
    WHEN margin_percent < 20 THEN '10-20%'
    WHEN margin_percent < 30 THEN '20-30%'
    ELSE '30%+'
  END AS margin_range,
  COUNT(*) AS order_count,
  SUM(profit) AS total_profit
FROM profit_calculation
WHERE hpp_matched = TRUE
GROUP BY margin_range
ORDER BY MIN(margin_percent);
```

**Expected Performance:** <100ms

---

## Data Import Workflow

### Step 1: Import master_products

```sql
TRUNCATE TABLE master_products;

LOAD DATA LOCAL INFILE '/path/to/master.xlsx.csv'
INTO TABLE master_products
FIELDS TERMINATED BY ','
ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 ROWS
(sku1, sku2, hpp, idproduk);
```

### Step 2: Import orders

```sql
LOAD DATA LOCAL INFILE '/path/to/Order.all.csv'
INTO TABLE orders
FIELDS TERMINATED BY ','
ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 ROWS
(no_pesanan, status_pesanan, ..., waktu_pesanan_selesai);
```

### Step 3: Import income_penghasilan

**Critical:** Filter hanya row dengan `lihat_berdasarkan = "Order"`

```python
# Pandas pre-processing
df = pd.read_excel('Income.xlsx', sheet_name='Penghasilan', header=2)
df_filtered = df[df['Lihat berdasarkan'] == 'Order']
df_filtered.to_csv('income_order_only.csv', index=False)
```

```sql
LOAD DATA LOCAL INFILE '/path/to/income_order_only.csv'
INTO TABLE income_penghasilan
FIELDS TERMINATED BY ','
ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 ROWS
(...);
```

### Step 4: Calculate Profit

```sql
CALL calculate_profit();
```

### Step 5: Verify Results

```sql
-- Check total orders
SELECT COUNT(*) FROM profit_calculation;

-- Check HPP match rate
SELECT 
  hpp_matched,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM profit_calculation), 2) as percentage
FROM profit_calculation
GROUP BY hpp_matched;

-- Check profit summary
SELECT 
  MIN(profit) as min_profit,
  MAX(profit) as max_profit,
  AVG(profit) as avg_profit,
  SUM(profit) as total_profit
FROM profit_calculation
WHERE hpp_matched = TRUE;
```

---

## Data Validation Rules

### 1. Cross-Reference Validation

**Every income entry must have matching order:**

```sql
SELECT COUNT(*) as orphaned_income
FROM income_penghasilan i
LEFT JOIN orders o ON i.no_pesanan = o.no_pesanan
WHERE o.no_pesanan IS NULL;
```

Expected: 0

### 2. HPP Match Rate

**Target:** >95% orders harus match dengan master_products

```sql
SELECT 
  ROUND(SUM(hpp_matched) * 100.0 / COUNT(*), 2) as match_rate_percent
FROM profit_calculation;
```

If <95%: Review unmatched SKUs dan update master_products

### 3. Net Payout Consistency

**Income net_payout harus match dengan Balance Report**

```sql
-- Compare calculated net_payout dengan expected
SELECT 
  no_pesanan,
  net_payout,
  harga_produk,
  total_fees,
  (harga_produk - total_fees) as recalculated_net_payout,
  ABS(net_payout - (harga_produk - total_fees)) as difference
FROM profit_calculation
WHERE ABS(net_payout - (harga_produk - total_fees)) > 1  -- Tolerance Rp1
LIMIT 10;
```

Expected: 0 rows (atau minimal difference <Rp1 rounding error)

---

## Schema Migration Plan

### Phase 1: Core Tables (DONE ✓)
- master_products
- orders
- income_penghasilan
- profit_calculation
- Stored procedure calculate_profit()

### Phase 2: Problem Orders (OPTIONAL)
- failed_deliveries (dari Order.failed_delivery)
- returns_refunds (dari Order.return_refund)
- cancellations (dari Order.cancellation)

**Note:** Phase 2 optional karena semua orders sudah ada di `orders` table. Separate tables hanya untuk detailed analysis jika diperlukan.

### Phase 3: Ad Costs (FUTURE)
- ad_costs table
- Ad allocation logic (per order atau per periode?)
- Biaya iklan sudah tercatat di Balance Report, tapi belum di-map ke individual orders

---

## Common Issues & Solutions

### Issue 1: HPP Not Matched

**Symptom:** `hpp_matched = FALSE` untuk banyak orders

**Root Cause:** SKU di orders tidak ada di master_products

**Solution:**
```sql
-- Find unmatched SKUs
SELECT DISTINCT 
  COALESCE(o.nomor_referensi_sku, o.sku_induk) as missing_sku,
  COUNT(*) as order_count
FROM orders o
LEFT JOIN profit_calculation pc ON o.no_pesanan = pc.no_pesanan
WHERE pc.hpp_matched = FALSE OR pc.hpp_matched IS NULL
GROUP BY missing_sku
ORDER BY order_count DESC;
```

Add missing SKUs to master_products, then re-run `calculate_profit()`

### Issue 2: Negative Profit

**Symptom:** Banyak orders dengan profit < 0

**Root Cause:** 
- HPP terlalu tinggi
- Promo/diskon besar dari Shopee
- Return/refund belum di-handle

**Solution:** Analyze margin distribution:
```sql
SELECT 
  CASE 
    WHEN profit < -50000 THEN 'Huge Loss (< -50k)'
    WHEN profit < 0 THEN 'Loss'
    WHEN profit < 10000 THEN 'Low Profit (< 10k)'
    ELSE 'Good Profit (≥ 10k)'
  END as profit_category,
  COUNT(*) as order_count,
  AVG(margin_percent) as avg_margin
FROM profit_calculation
WHERE hpp_matched = TRUE
GROUP BY profit_category;
```

### Issue 3: Duplicate No. Pesanan

**Symptom:** Error saat insert ke orders atau income_penghasilan

**Root Cause:** 
- Multiple rows per order di Income (Sku + Order rows)
- File Excel di-import multiple times

**Solution:**
- Always filter `lihat_berdasarkan = 'Order'` untuk income
- Use `INSERT IGNORE` atau `ON DUPLICATE KEY UPDATE`
- Truncate tables sebelum re-import

---

## Performance Benchmarks

**Expected query times (1000 orders, local cPanel):**

| Query Type | Time | Note |
|------------|------|------|
| Simple SELECT by no_pesanan | <10ms | Primary key lookup |
| Date range filter | <50ms | Indexed |
| Aggregate by month | <100ms | Indexed + GROUP BY |
| Complex JOIN (3 tables) | 500-1000ms | Avoid di production |
| calculate_profit() procedure | 1-5s | Run after import only |

**Vercel Serverless cold start:**
- First request: 1-3s (connection + query)
- Subsequent requests: 50-200ms (pooled connection)

**Optimization target:**
- Dashboard load: <2s total (including cold start)
- Individual queries: <200ms
- Real-time queries: Use profit_calculation table (pre-calculated)

---

## Security Notes

### Database Credentials

**Current:** Stored in README.md (development only)

**Production:** Use environment variables:
```env
MYSQL_HOST=103.136.19.30
MYSQL_USER=supplie3_shopee_profit_estimation
MYSQL_PASSWORD=Persib1933
MYSQL_DATABASE=supplie3_shopee_profit_estimation
```

**Vercel:** Add via Vercel dashboard → Settings → Environment Variables

### SQL Injection Prevention

**Always use prepared statements:**

```javascript
// BAD
const query = `SELECT * FROM orders WHERE no_pesanan = '${userInput}'`;

// GOOD
const [rows] = await pool.execute(
  'SELECT * FROM orders WHERE no_pesanan = ?',
  [userInput]
);
```

### Read-Only Access

Consider creating read-only user untuk dashboard queries:

```sql
CREATE USER 'shopee_readonly'@'%' IDENTIFIED BY 'password';
GRANT SELECT ON supplie3_shopee_profit_estimation.* TO 'shopee_readonly'@'%';
FLUSH PRIVILEGES;
```

---

## Next Steps

1. ✅ Schema design complete
2. ⏳ Build Excel → MySQL import script
3. ⏳ Test schema dengan sample data
4. ⏳ Build Next.js dashboard
5. ⏳ Deploy to Vercel
6. ⏳ Connect to remote MySQL
7. ⏳ Test performance & optimize

---

**Last Updated:** 2026-08-06  
**Schema Version:** 1.0  
**Author:** Hermes Agent
