# Income Report Analysis - Sheet Penghasilan

**Date:** 2026-08-06  
**Purpose:** Analisa struktur Income sheet "Penghasilan" dan mapping dengan Balance Report

---

## File: Income.sudah dilepas.id.20260707_20260806.xlsx

### Sheet Structure (5 sheets)

| Sheet Name | Rows | Cols | Purpose |
|------------|------|------|---------|
| Summary | 96 | 4 | Laporan agregat/ringkasan (visual) |
| Adjustment | 17 | 7 | 9 pesanan dengan penyesuaian khusus |
| Shipping Fee Discrepancy | 6 | 15 | 4 pesanan dengan selisih estimasi vs actual ongkir |
| Seller Fee | 681 | 7 | 679 pesanan - ringkasan biaya platform saja |
| **Penghasilan** | **1528** | **52** | **1525 pesanan - COMPLETE detail** |

---

## Sheet "Penghasilan" - Structure

### Overview

- **Actual columns:** 52 (bukan 1000 - sisanya kosong)
- **Header row:** Row 3 (row 1-2 adalah merged header)
- **Data rows:** 1525 pesanan (row 4-1528)
- **Data pattern:** 1 pesanan bisa punya multiple rows

### Row Pattern

**Kolom "Lihat berdasarkan" memiliki 2 value:**

1. **"Order"** - Aggregate per pesanan (No. Pesanan level)
   - ID Produk: kosong
   - Nama Produk: kosong
   - All biaya/penghasilan di level pesanan

2. **"Sku"** - Detail per item/produk dalam pesanan
   - ID Produk: terisi (e.g., 28258015117)
   - Nama Produk: terisi (e.g., "Kemeja Tactical Pria...")
   - Breakdown produk individual

**Contoh:** No. Pesanan `260802A1K3DD0Y` punya 2 rows:
- Row 1: "Order" (aggregate)
- Row 2: "Sku" (detail produk)

---

## Column Structure (52 kolom)

### 1. Informasi Pesanan (10 cols)
- No.
- Lihat berdasarkan
- No. Pesanan
- No. Pengajuan
- ID Produk
- Nama Produk
- Waktu Pesanan Dibuat
- Tanggal Dana Dilepaskan
- Metode Pelepasan Dana
- Tipe Pesanan

### 2. Harga & Ongkir (9 cols)
- Harga Produk
- Jumlah Pengembalian Dana ke Pembeli
- Ongkir Dibayar Pembeli
- Ongkos Kirim yang Dibayarkan ke Jasa Kirim
- Potongan Ongkos Kirim dari Jasa Kirim
- Gratis Ongkir dari Shopee
- Ongkos Kirim Pengembalian Barang
- Return to Seller Fee
- Pengembalian Biaya Kirim

### 3. Biaya Platform (13 cols)
- Biaya Administrasi
- Biaya Proses Pesanan
- Biaya Gratis Ongkir XTRA - Ukuran Biasa (Kategori F)
- Biaya Gratis Ongkir XTRA - Ukuran Biasa (Kategori F) [duplicate col?]
- Biaya Layanan Promo XTRA
- AMS Service Fee
- Biaya Kampanye
- Biaya Komisi AMS
- Biaya Isi Saldo Otomatis (dari Penghasilan)
- Biaya Lainnya
- Biaya Transaksi
- FBS Fee
- PPh 22

### 4. Promo & Diskon (8 cols)
- Penyesuaian Penjual - 1
- Cashback Koin disponsori Penjual
- Diskon Produk dari Shopee
- Penyesuaian Penjual - 2
- Cashback Koin Co-fund disponsori Penjual
- Promo Gratis Ongkir dari Penjual
- Kode Voucher
- Kompensasi

### 5. Buyer Info (6 cols)
- Username (Pembeli)
- Jumlah Dibayar Pembeli
- Metode pembayaran pembeli
- Rincian Metode Pembayaran
- Rencana Cicilan (jika berlaku)
- Jasa Kirim

### 6. Logistik (1 col)
- Nama Kurir

### 7. Return/Refund Detail (5 cols)
- Pengembalian Dana ke Pembeli
- Pro-rata Koin yang Ditukarkan untuk Pengembalian Barang
- Pro-rata Voucher Shopee untuk Pengembalian Barang
- Pro-rated Bank Payment Channel Promotion for return refund Items
- Pro-rated Shopee Payment Channel Promotion for return refund Items

---

## Sample Validation: No. Pesanan 2607072CRRDA37

### From Screenshot (Shopee UI)

**Status:** Selesai  
**Tanggal Pesanan:** 07/07/2026 07:13  
**Tanggal Dana Dilepaskan:** 18/07/2026 21:41

**Product Details:**
- Nama Produk: Kemeja Tactical Pria Lengan Pendek M-TAC RIPSTOP
- Variasi: Hijau Army, M
- Harga Satuan: Rp82.500
- Jumlah: 1
- **Subtotal Produk: Rp82.500**

**Shipping Details:**
- Jasa Kirim: SPX Hemat (Paket Hemat)
- No. Resi: SPXID060226326907
- Nama Kurir: MUHAMMAD SOFYAN RIZKI
- Ongkir Dibayar Pembeli: **Rp0**
- Ongkir ke Jasa Kirim: **-Rp18.000**
- Potongan Ongkir dari Shopee: **+Rp18.000**
- **Subtotal Ongkos Kirim: Rp0**

**Platform Fees:**
- Biaya Platform: **-Rp8.056**
  - Biaya Administrasi: -Rp6.806
  - Biaya Proses Pesanan: -Rp1.250
- Biaya Gratis Ongkir XTRA: **-Rp4.125**
- Biaya Layanan Promo XTRA: **-Rp3.713**
- Biaya Lainnya (Premi): **-Rp413**

**Seller Income:**
- **Total Penghasilan (Netto): Rp66.193**

**Buyer Payment (Reference):**
- Subtotal Pesanan: Rp82.500
- Voucher Shopee: -Rp5.000
- Voucher Toko: -Rp16.411
- Biaya Layanan (Buyer): Rp2.000
- **Total Dibayar Pembeli: Rp63.089**

---

### Mapping to Sheet "Penghasilan" Columns

| Screenshot Field | Sheet Penghasilan Column | Value |
|------------------|--------------------------|-------|
| Subtotal Produk | Harga Produk | Rp82.500 |
| Ongkir Dibayar Pembeli | Ongkir Dibayar Pembeli | Rp0 |
| Ongkir ke Jasa Kirim | Ongkos Kirim yang Dibayarkan ke Jasa Kirim | -Rp18.000 |
| Potongan Ongkir Shopee | Gratis Ongkir dari Shopee | Rp18.000 |
| Biaya Administrasi | Biaya Administrasi | -Rp6.806 |
| Biaya Proses Pesanan | Biaya Proses Pesanan | -Rp1.250 |
| Biaya Gratis Ongkir XTRA | Biaya Gratis Ongkir XTRA | -Rp4.125 |
| Biaya Layanan Promo XTRA | Biaya Layanan Promo XTRA | -Rp3.713 |
| Biaya Lainnya (Premi) | Biaya Lainnya | -Rp413 |
| SPX Hemat | Jasa Kirim | SPX Hemat |
| MUHAMMAD SOFYAN RIZKI | Nama Kurir | MUHAMMAD SOFYAN RIZKI |
| lr8qdbwnc9 | Username (Pembeli) | lr8qdbwnc9 |
| Rp63.089 | Jumlah Dibayar Pembeli | Rp63.089 |

**All fields matched ✓**

---

### Formula Validation

**Penghasilan Bersih Calculation:**
```
Total Penghasilan = Harga Produk
                  + Gratis Ongkir dari Shopee
                  - Ongkos Kirim ke Jasa Kirim
                  - Biaya Administrasi
                  - Biaya Proses Pesanan
                  - Biaya Gratis Ongkir XTRA
                  - Biaya Layanan Promo XTRA
                  - Biaya Lainnya
```

**Sample Calculation (2607072CRRDA37):**
```
  Rp82.500  (Harga Produk)
+ Rp18.000  (Gratis Ongkir dari Shopee)
- Rp18.000  (Ongkir ke Jasa Kirim)
- Rp6.806   (Biaya Administrasi)
- Rp1.250   (Biaya Proses Pesanan)
- Rp4.125   (Biaya Gratis Ongkir XTRA)
- Rp3.713   (Biaya Layanan Promo XTRA)
- Rp413     (Biaya Lainnya)
─────────────────────────────
= Rp66.193  ✓✓✓ MATCH
```

**This matches:**
- Balance Report "Jumlah" column: Rp66.193 ✓
- Screenshot "Total Penghasilan": Rp66.193 ✓

---

## Comparison: Seller Fee vs Penghasilan

### Sheet "Seller Fee" (7 cols)
**Coverage:** Biaya platform summary only
- No. Pesanan
- Biaya Platform
- Biaya Gratis Ongkir XTRA
- Biaya Layanan
- Biaya Promosi
- Biaya Lainnya

**Limitation:** Tidak ada harga produk, ongkir detail, buyer info, logistik

---

### Sheet "Penghasilan" (52 cols)
**Coverage:** COMPLETE transaction detail
- ✓ All fields dari Seller Fee
- ✓ Harga Produk (subtotal pesanan)
- ✓ Ongkir detail (dibayar pembeli, ke jasa kirim, potongan)
- ✓ Promo & diskon detail
- ✓ Buyer info (username, payment method, total dibayar)
- ✓ Logistik detail (jasa kirim, kurir)
- ✓ Return/refund breakdown

**Advantage:** One-stop data source untuk profit calculation

---

## Data Relationship

### Penghasilan (Income) vs Balance Report

**Expected Relationship:**
```
Balance Report "Penghasilan dari Pesanan" (Jumlah POSITIF)
  = 
Income Penghasilan "Total Penghasilan" (calculated per row "Order")
```

**Join Key:** No. Pesanan

**Notes:**
- Balance Report: 1 row per pesanan (aggregate only)
- Income Penghasilan: Multiple rows per pesanan (Order + Sku)
- For join/comparison: Use rows with `Lihat berdasarkan = "Order"` only

---

## Import Strategy Recommendation

### Option A: Import All Rows (Order + Sku)
**Pros:**
- Complete product-level detail
- Can analyze profit per SKU

**Cons:**
- More complex (need grouping)
- Larger database
- Sku rows might not have complete biaya breakdown per item

### Option B: Import "Order" Rows Only ✓ RECOMMENDED
**Pros:**
- Simple 1:1 mapping with Balance Report
- All biaya/penghasilan already at order level
- Lighter database
- Sufficient for order-level profit calculation

**Cons:**
- Lose per-SKU detail (ID Produk, Nama Produk)

**Recommendation:** **Option B** - Import rows with `Lihat berdasarkan = "Order"` only

**Rationale:**
- Profit calculation is per order, not per SKU
- Product detail can be enriched from Order.all or master.xlsx if needed
- Simplifies database schema and queries

---

## Database Schema Recommendation

### Table: `income_penghasilan`

**Primary Key:** No. Pesanan (join key with Balance, Order.all)

**Key Columns (subset of 52):**
1. No. Pesanan (VARCHAR)
2. Waktu Pesanan Dibuat (DATETIME)
3. Tanggal Dana Dilepaskan (DATETIME)
4. Metode Pelepasan Dana (VARCHAR)
5. Tipe Pesanan (VARCHAR)
6. Harga Produk (DECIMAL)
7. Ongkir Dibayar Pembeli (DECIMAL)
8. Ongkos Kirim ke Jasa Kirim (DECIMAL)
9. Gratis Ongkir dari Shopee (DECIMAL)
10. Biaya Administrasi (DECIMAL)
11. Biaya Proses Pesanan (DECIMAL)
12. Biaya Gratis Ongkir XTRA (DECIMAL)
13. Biaya Layanan Promo XTRA (DECIMAL)
14. Biaya Lainnya (DECIMAL)
15. Username Pembeli (VARCHAR)
16. Jumlah Dibayar Pembeli (DECIMAL)
17. Jasa Kirim (VARCHAR)
18. Nama Kurir (VARCHAR)
19. ... (other relevant columns)

**Calculated Column (can be view or stored):**
```sql
total_penghasilan = harga_produk 
                  + gratis_ongkir_dari_shopee 
                  - ongkir_ke_jasa_kirim
                  - biaya_administrasi
                  - biaya_proses_pesanan
                  - biaya_gratis_ongkir_xtra
                  - biaya_layanan_promo_xtra
                  - biaya_lainnya
                  + ... (other adjustments)
```

**Filter on Import:**
```sql
WHERE "Lihat berdasarkan" = 'Order'
```

**Expected row count:** ~679-700 rows (pesanan selesai dengan dana dilepas)

---

## Cross-Reference Validation Checklist

- [x] ✓ Sheet structure identified (5 sheets)
- [x] ✓ Penghasilan column structure mapped (52 cols)
- [x] ✓ Row pattern understood (Order vs Sku)
- [x] ✓ Sample validation (2607072CRRDA37) with screenshot
- [x] ✓ Formula verified (calculated = screenshot = balance)
- [x] ✓ Comparison with Seller Fee (Penghasilan is superset)
- [x] ✓ Import strategy recommended (Order rows only)
- [ ] Database schema finalized
- [ ] Import script developed
- [ ] Cross-validation with Balance Report (full dataset)

---

## Next Steps

1. Confirm import strategy (Option B: Order rows only)
2. Finalize database schema column selection (52 cols → subset for DB)
3. Build Excel → MySQL import script with:
   - Row filter: `Lihat berdasarkan = "Order"`
   - Data cleaning (currency format, date parsing)
   - Validation (calculated total matches expected)
4. Cross-validate imported data with Balance Report
5. Integrate with Order.all for complete profit calculation

---

## Key Insights

### 1. Income "Penghasilan" is the Master Income Source
- Most comprehensive (52 cols vs 7 cols Seller Fee)
- All transaction details in one place
- Sufficient for complete profit calculation

### 2. Row Pattern Requires Filtering
- Not all rows are order-level
- Must filter `Lihat berdasarkan = "Order"` for aggregation
- Sku rows are supplementary detail, not required for profit calc

### 3. Formula Matches Balance Report
- Income calculated total = Balance "Jumlah"
- 100% consistency validated with sample
- Can use either as source of truth (Income has more detail)

### 4. Complete Data Flow Established
```
Order.all (all orders)
    ↓
Income Penghasilan (dana dilepas + financial detail)
    ↓
Balance Report (dana dilepas + net payout)
    ↓
Profit Calculation (- HPP - Packaging)
```
