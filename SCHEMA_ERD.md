# Entity Relationship Diagram - Shopee Profit Estimation

## Database Schema Visual Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SHOPEE PROFIT ESTIMATION                         │
│                    MySQL Database Schema (Version 1.0)                   │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────┐
│   master_products        │
│  (HPP Reference)         │
├──────────────────────────┤
│ PK: id                   │
│     sku1 ◄───────┐       │
│     sku2 ◄───────┤       │
│     hpp          │       │
│     idproduk     │       │
└──────────────────────────┘
                   │
                   │ LEFT JOIN
                   │ COALESCE(nomor_referensi_sku, sku_induk)
                   │ = sku1 OR sku2
                   │
┌──────────────────────────┐
│   orders                 │
│  (Source of Truth)       │
├──────────────────────────┤
│ PK: id                   │
│ UK: no_pesanan ◄─────────┼──────┐
│     status_pesanan       │      │
│     nomor_referensi_sku ─┼──────┘ (Priority 1)
│     sku_induk ───────────┘ (Fallback)
│     nama_produk          │
│     subtotal_pesanan     │
│     waktu_pesanan_dibuat │
│     waktu_pesanan_selesai│
│     ... (50 fields)      │
└──────────────────────────┘
            │
            │ 1:1 FK
            │ no_pesanan
            ▼
┌──────────────────────────┐
│  income_penghasilan      │
│  (Fees & Income Detail)  │
├──────────────────────────┤
│ PK: id                   │
│ FK: no_pesanan           │
│     lihat_berdasarkan ◄──┼─── FILTER: = 'Order' only!
│     harga_produk         │
│     gratis_ongkir_*      │
│     biaya_administrasi   │
│     biaya_proses_*       │
│     biaya_gratis_ongkir_*│
│     biaya_layanan_*      │
│     biaya_lainnya        │
│     ... (52 fields)      │
└──────────────────────────┘
            │
            │ Processed by:
            │ CALL calculate_profit()
            ▼
┌──────────────────────────┐
│  profit_calculation      │
│  (Materialized Results)  │
├──────────────────────────┤
│ PK: id                   │
│ UK: no_pesanan           │
│     matched_sku          │
│     idproduk             │
│     hpp                  │
│     net_payout ◄─────────┼─── income - fees
│     profit ◄─────────────┼─── net_payout - hpp
│     margin_percent       │
│     hpp_matched          │
│     hpp_match_method     │
│     ... (calculated)     │
└──────────────────────────┘
            │
            │ Dashboard Queries
            ▼
┌──────────────────────────┐
│    Next.js Dashboard     │
│   (Vercel Deployment)    │
├──────────────────────────┤
│ • Monthly Profit Chart   │
│ • Top Products Table     │
│ • Margin Distribution    │
│ • Unmatched HPP Alert    │
│ • Date Range Filter      │
└──────────────────────────┘
```

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            DATA IMPORT FLOW                              │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────┐
│ master.xlsx  │
│              │
│ SKU1  SKU2   │
│ HPP  IDPRODUK│
└──────┬───────┘
       │ pandas → CSV → LOAD DATA
       ▼
┌──────────────────────────┐
│   master_products        │
│   (HPP Lookup Table)     │
└──────────────────────────┘


┌──────────────────────────┐
│ Order.all.*.xlsx         │
│                          │
│ • No. Pesanan            │
│ • Nomor Referensi SKU    │
│ • SKU Induk              │
│ • 50 fields total        │
└──────┬───────────────────┘
       │ pandas → CSV → LOAD DATA
       ▼
┌──────────────────────────┐
│   orders                 │
│   (All Orders)           │
└──────────────────────────┘


┌────────────────────────────────┐
│ Income.*.xlsx                  │
│ Sheet: "Penghasilan"           │
│ Header: Row 2 (0-indexed)      │
│                                │
│ Row 0: Category headers        │
│ Row 1: Sub-headers (NaN)       │
│ Row 2: Column names ◄── USE    │
│ Row 3+: Data                   │
└──────┬─────────────────────────┘
       │ pandas → filter: lihat_berdasarkan = 'Order'
       │         → CSV → LOAD DATA
       ▼
┌──────────────────────────┐
│  income_penghasilan      │
│  (Order rows only)       │
└──────────────────────────┘


┌──────────────────────────────────────────────────────────────────┐
│                   PROFIT CALCULATION PROCEDURE                    │
│                                                                   │
│  CALL calculate_profit()                                          │
│                                                                   │
│  1. TRUNCATE profit_calculation                                   │
│  2. JOIN orders + income_penghasilan + master_products            │
│  3. CALCULATE net_payout:                                         │
│     = harga_produk + gratis_ongkir - all fees                    │
│  4. CALCULATE profit:                                             │
│     = net_payout - hpp                                            │
│  5. SET hpp_matched flag                                          │
│  6. INSERT INTO profit_calculation                                │
└───────────────────────────┬───────────────────────────────────────┘
                            ▼
                  ┌──────────────────────────┐
                  │  profit_calculation      │
                  │  (Ready for Dashboard)   │
                  └──────────────────────────┘
```

---

## HPP Mapping Logic Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        HPP MATCHING ALGORITHM                            │
└─────────────────────────────────────────────────────────────────────────┘

Start: Order needs HPP
│
├─ Step 1: Get SKU identifier from orders table
│   │
│   └─► COALESCE(nomor_referensi_sku, sku_induk)
│       │
│       ├─ IF nomor_referensi_sku NOT NULL
│       │  └─► Use nomor_referensi_sku  (Priority 1)
│       │
│       └─ ELSE
│          └─► Use sku_induk  (Fallback)
│
├─ Step 2: Try match with master_products.sku1
│   │
│   └─► WHERE identifier = master_products.sku1
│       │
│       ├─ IF MATCH FOUND
│       │  └─► RETURN hpp, SET hpp_match_method = 'sku1' ✓
│       │
│       └─ ELSE continue to Step 3
│
├─ Step 3: Try match with master_products.sku2
│   │
│   └─► WHERE identifier = master_products.sku2
│       │
│       ├─ IF MATCH FOUND
│       │  └─► RETURN hpp, SET hpp_match_method = 'sku2' ✓
│       │
│       └─ ELSE no match
│
└─ Result:
    │
    ├─ MATCH FOUND
    │  └─► hpp_matched = TRUE
    │      hpp = master_products.hpp
    │      idproduk = master_products.idproduk
    │      profit = net_payout - hpp
    │
    └─ NO MATCH
       └─► hpp_matched = FALSE
           hpp = NULL
           profit = NULL
           ⚠️ ALERT: Need to add SKU to master_products
```

---

## Profit Calculation Breakdown

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        PROFIT CALCULATION FORMULA                        │
└─────────────────────────────────────────────────────────────────────────┘

INCOME COMPONENTS (+)
├─ harga_produk                          Rp  82,500
└─ gratis_ongkir_dari_shopee            Rp  18,000
                                         ──────────
   Subtotal Income                       Rp 100,500

FEE COMPONENTS (-)
├─ ongkos_kirim_dibayarkan_ke_jasa_kirim Rp  18,000
├─ biaya_administrasi                    Rp   6,806
├─ biaya_proses_pesanan                  Rp   1,250
├─ biaya_gratis_ongkir_xtra (column 1)   Rp   4,125
├─ biaya_gratis_ongkir_xtra (column 2)   Rp       0
├─ biaya_layanan_promo_xtra              Rp   3,713
└─ biaya_lainnya                         Rp     413
                                         ──────────
   Total Fees                            Rp  34,307

NET PAYOUT = Income - Fees
           = 100,500 - 34,307
           = Rp 66,193  ◄─── Amount released to seller

HPP (from master_products)
           = Rp 52,500  ◄─── Cost + packaging

PROFIT     = Net Payout - HPP
           = 66,193 - 52,500
           = Rp 13,693  ◄─── Pure profit

MARGIN %   = (Profit / Net Payout) × 100
           = (13,693 / 66,193) × 100
           = 20.69%     ◄─── Profit margin
```

---

## Index Coverage Map

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         QUERY OPTIMIZATION MAP                           │
└─────────────────────────────────────────────────────────────────────────┘

DASHBOARD QUERY                              INDEX USED
───────────────────────────────────────────────────────────────────────────

1. Get order by no_pesanan
   WHERE no_pesanan = ?                      ► no_pesanan (PK, unique)

2. Date range filter
   WHERE waktu_pesanan_dibuat BETWEEN ? AND ? ► idx_date_status (composite)

3. Monthly aggregation
   GROUP BY DATE_FORMAT(tanggal_dana_...)    ► idx_date_filter (composite)

4. Top products by profit
   GROUP BY idproduk ORDER BY profit DESC    ► idx_product_profit (composite)

5. Filter by HPP matched
   WHERE hpp_matched = TRUE                  ► idx_hpp_matched

6. HPP lookup
   WHERE sku1 = ? OR sku2 = ?                ► idx_sku1, idx_sku2

7. Product analysis
   WHERE idproduk = ?                        ► idx_idproduk

8. Profit sorting
   ORDER BY profit DESC                      ► idx_profit

9. Margin filtering
   WHERE margin_percent > ?                  ► idx_margin

All major dashboard queries covered! ✓
Expected query time: <100ms (warm), <2s (cold start)
```

---

## Table Size Estimates

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         STORAGE REQUIREMENTS                             │
└─────────────────────────────────────────────────────────────────────────┘

TABLE                    ROWS/MONTH    ROW SIZE    MONTHLY SIZE    YEARLY
───────────────────────────────────────────────────────────────────────────
master_products          100-500       ~200 bytes  ~100 KB         ~100 KB*
orders                   1,000-5,000   ~2 KB       ~10 MB          ~120 MB
income_penghasilan       1,000-5,000   ~1.5 KB     ~7.5 MB         ~90 MB
profit_calculation       1,000-5,000   ~500 bytes  ~2.5 MB         ~30 MB
───────────────────────────────────────────────────────────────────────────
TOTAL                                               ~20 MB/month    ~240 MB/year

* master_products is relatively static (updated occasionally)

Indexes overhead: ~20-30% additional storage
Total with indexes: ~300 MB/year

MySQL cPanel limit typical: 1-5 GB
Capacity: ~3-15 years of data ✓
```

---

## Query Performance Matrix

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    EXPECTED QUERY PERFORMANCE                            │
└─────────────────────────────────────────────────────────────────────────┘

QUERY TYPE              COMPLEXITY    INDEXED    EXPECTED TIME
───────────────────────────────────────────────────────────────────────────
PK lookup               O(1)          ✓          <10ms
Date range filter       O(log n)      ✓          <50ms
Monthly aggregate       O(n)          ✓          <100ms
Product grouping        O(n log n)    ✓          <150ms
3-table JOIN            O(n²)         ✗          500-1000ms ⚠️
calculate_profit()      O(n²)         ✓          1-5s (batch)

Dashboard load (5 queries parallel):
• Cold start (Vercel):  1-2s
• Warm requests:        50-200ms ✓

Optimization strategy:
✓ Use profit_calculation (pre-calculated)
✗ Avoid real-time JOINs in API routes
✓ Connection pooling (reuse connections)
✓ Prepared statements (cache query plans)
```

---

## Schema Version History

```
Version 1.0 (2026-08-06) - Initial Release
─────────────────────────────────────────────
✓ 4 core tables defined
✓ HPP mapping logic implemented
✓ Profit calculation stored procedure
✓ 15+ indexes for dashboard performance
✓ Optimized for Vercel serverless
✓ Validated against sample data
✓ Documentation complete (48KB)

Status: READY FOR PRODUCTION
```

---

**Created:** 2026-08-06  
**Schema Version:** 1.0  
**Diagram Format:** ASCII Art (Markdown compatible)
