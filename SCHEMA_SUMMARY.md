# MySQL Schema Summary - Shopee Profit Estimation

## Quick Reference

### Database Info
- **Host:** 103.136.19.30:3306
- **Database:** supplie3_shopee_profit_estimation
- **User:** supplie3_shopee_profit_estimation
- **Optimized for:** Vercel Serverless + MySQL cPanel

---

## Tables Overview

| Table | Source | Rows (est) | Purpose |
|-------|--------|------------|---------|
| master_products | master.xlsx | ~100-500 | HPP reference |
| orders | Order.all.xlsx | ~1000-5000/month | All orders |
| income_penghasilan | Income Penghasilan sheet | ~1000-5000/month | Fees & income detail |
| profit_calculation | Calculated | ~1000-5000/month | Pre-calculated profit |

---

## Critical HPP Mapping Logic

```sql
-- Step 1: Get SKU from orders
COALESCE(orders.nomor_referensi_sku, orders.sku_induk)

-- Step 2: Match with master_products
LEFT JOIN master_products m ON (
  COALESCE(o.nomor_referensi_sku, o.sku_induk) = m.sku1 OR
  COALESCE(o.nomor_referensi_sku, o.sku_induk) = m.sku2
)

-- Step 3: Get HPP
m.hpp  -- Already includes packaging cost
```

**Priority:**
1. `nomor_referensi_sku` (if exists) → match with `sku1` or `sku2`
2. `sku_induk` (if nomor_referensi_sku empty) → match with `sku1` or `sku2`

---

## Profit Formula

```
Net Payout = harga_produk 
           + gratis_ongkir_dari_shopee
           - ongkos_kirim_dibayarkan_ke_jasa_kirim
           - biaya_administrasi
           - biaya_proses_pesanan
           - biaya_gratis_ongkir_xtra (2 columns summed)
           - biaya_layanan_promo_xtra
           - biaya_lainnya

Profit = Net Payout - HPP

Margin % = (Profit / Net Payout) × 100
```

---

## Key Indexes

```sql
-- HPP mapping performance
master_products: idx_sku1, idx_sku2, idx_idproduk
orders: idx_nomor_referensi_sku, idx_sku_induk

-- Dashboard queries
profit_calculation: idx_profit, idx_margin, idx_date_range_profit
profit_calculation: idx_product_profit, idx_hpp_matched

-- Date filtering
orders: idx_date_status
income_penghasilan: idx_date_filter
```

---

## Import Workflow

```bash
# 1. Import master HPP
LOAD DATA → master_products

# 2. Import orders
LOAD DATA → orders

# 3. Import income (FILTER: lihat_berdasarkan = 'Order')
pandas filter → CSV → LOAD DATA → income_penghasilan

# 4. Calculate profit
CALL calculate_profit();

# 5. Verify
SELECT COUNT(*), 
       SUM(hpp_matched) * 100.0 / COUNT(*) as match_rate
FROM profit_calculation;
```

---

## Data Validation Checklist

- [ ] Income rows filtered: `lihat_berdasarkan = 'Order'` only
- [ ] No orphaned income entries (all have matching order)
- [ ] HPP match rate >95%
- [ ] Net payout calculation matches Balance Report
- [ ] No duplicate `no_pesanan` in orders/income
- [ ] Date ranges consistent across all tables

---

## Common Dashboard Queries

### Monthly Profit
```sql
SELECT DATE_FORMAT(tanggal_dana_dilepaskan, '%Y-%m') AS bulan,
       COUNT(*) AS orders,
       SUM(profit) AS total_profit,
       AVG(margin_percent) AS avg_margin
FROM profit_calculation
WHERE hpp_matched = TRUE
GROUP BY bulan;
```

### Top Products
```sql
SELECT idproduk, ANY_VALUE(nama_produk) AS nama,
       COUNT(*) AS orders, SUM(profit) AS profit
FROM profit_calculation
WHERE hpp_matched = TRUE
GROUP BY idproduk
ORDER BY profit DESC LIMIT 10;
```

### Unmatched HPP
```sql
SELECT COALESCE(o.nomor_referensi_sku, o.sku_induk) AS sku,
       COUNT(*) AS order_count
FROM orders o
LEFT JOIN profit_calculation pc ON o.no_pesanan = pc.no_pesanan
WHERE pc.hpp_matched = FALSE
GROUP BY sku;
```

---

## Vercel Optimization

### Connection Pool Config
```javascript
const pool = mysql.createPool({
  host: '103.136.19.30',
  user: 'supplie3_shopee_profit_estimation',
  password: process.env.MYSQL_PASSWORD,
  database: 'supplie3_shopee_profit_estimation',
  connectionLimit: 10,
  enableKeepAlive: true
});
```

### Query Strategy
- ✅ **USE:** `profit_calculation` table (pre-calculated)
- ❌ **AVOID:** Complex JOINs in API routes
- ✅ **USE:** Prepared statements for caching
- ✅ **USE:** Indexes for all WHERE/ORDER BY columns

---

## Performance Targets

| Query Type | Target Time |
|------------|-------------|
| Simple SELECT | <10ms |
| Date range filter | <50ms |
| Monthly aggregate | <100ms |
| calculate_profit() | 1-5s (batch only) |
| Dashboard load (cold start) | <2s |

---

## Income Sheet Header Position

⚠️ **CRITICAL:** Income Penghasilan sheet header di **row 2** (0-indexed)

```python
# Pandas read
df = pd.read_excel(file, sheet_name='Penghasilan', header=2)

# Filter
df = df[df['Lihat berdasarkan'] == 'Order']
```

Row 0: Category headers (Informasi Pesanan, Rincian Jumlah, etc.)  
Row 1: Sub-headers (mostly NaN, some column group headers)  
Row 2: **Actual column names** ← Use this as header  
Row 3+: Data

---

## Files Generated

1. **schema.sql** (21KB) - Complete DDL with:
   - 4 table definitions
   - All indexes & foreign keys
   - Stored procedure `calculate_profit()`
   - Optimization notes for Vercel

2. **SCHEMA_DOCUMENTATION.md** (16KB) - Full documentation:
   - Business logic explained
   - Query examples
   - Import workflow
   - Troubleshooting guide

3. **SCHEMA_SUMMARY.md** (this file) - Quick reference

---

## Next Actions

1. Test schema execution:
   ```bash
   mysql -h 103.136.19.30 -u supplie3_shopee_profit_estimation -p \
     supplie3_shopee_profit_estimation < schema.sql
   ```

2. Build import script (Python):
   - Read Excel files
   - Clean & transform data
   - Bulk insert to MySQL
   - Run calculate_profit()

3. Build Next.js dashboard:
   - API routes with connection pooling
   - Query profit_calculation table
   - Charts & filters

4. Deploy to Vercel:
   - Set environment variables
   - Test remote MySQL connection
   - Monitor query performance

---

**Schema Version:** 1.0  
**Created:** 2026-08-06  
**Status:** Ready for testing
