# Shopee Profit Estimation

Dashboard untuk estimasi profit Shopee menggunakan Next.js + MySQL (cPanel) + Vercel.

## Tech Stack

- Framework: Next.js
- Database: MySQL (cPanel remote)
- Git: GitHub (repo baru)
- Deploy: Vercel
- Development: VPS local only

## Database Credentials

```
Database: supplie3_shopee_profit_estimation
Username: supplie3_shopee_profit_estimation
Password: Persib1933
Host: 103.136.19.30
Port: 3306 (default)
```

## Karakteristik Report Shopee

**⚠️ CRITICAL:**
- Report Shopee **mentah & ambigue**
- Butuh **cross-reference multiple reports** untuk pecahkan logic
- **WAJIB analisa teliti dulu** sebelum bangun section apapun
- **File Excel Shopee bisa punya multiple sheets**
- **Header kolom TIDAK SELALU di row pertama** (bisa di row 18, dll)

**Workflow Ketat:**
1. User kasih sampling report
2. **Analisa bareng** dulu — identifikasi:
   - Field apa aja yang ada
   - Field mana yang ambigu/missing
   - Report mana aja yang perlu di-cross untuk dapet insight
3. **Diskusi** logic/calculation yang bener
4. Baru coding section tersebut

**Flow: Report → Analisa → Diskusi → Coding**

## Workflow Development

1. User siapin data MySQL + sampling report sebagai reference
2. Bangun aplikasi di VPS local (`/home/yogaimawan/Dokumentasi/shopee_profit_estimation`)
3. Push ke GitHub repo baru: "Shopee Profit Estimation"
4. Deploy ke Vercel

## Status Credential

- [x] GitHub CLI: terhubung (HOME=/home/yogaimawan)
- [x] Vercel CLI: terhubung (HOME=/home/yogaimawan)
- [x] Database credentials: tersedia

---

## Business Logic (dari Analisa Report)

### 1. Primary Key: No. Pesanan

**Format:** `YYMMDD[A-Z0-9]{8-10}`

**Coverage:** Semua report punya No. Pesanan sebagai identifier untuk cross-reference

### 2. Balance Report - No. Pesanan Location

**Lokasi 1: Kolom "No. Pesanan" (dedicated column)**
- Tipe transaksi: "Penghasilan dari Pesanan"
- Method: Direct column read

**Lokasi 2: Kolom "Deskripsi" (embedded text)**
- Tipe transaksi: "Penyesuaian..." (adjustment/refund entries)
- Method: Regex extraction
- Keywords: `"Pesanan #"`, `"Gagal Terkirim:"`, `"pesanan X karena"`

### 3. Balance Report - Transaction Types

| Tipe Transaksi | No. Pesanan Location |
|----------------|---------------------|
| Penghasilan dari Pesanan | Kolom "No. Pesanan" (direct) |
| Isi Ulang Saldo Iklan | - (bukan order-related) |
| Penarikan Dana | - (withdrawal) |
| Penyesuaian Failed Delivery | Deskripsi (regex) |
| Penyesuaian Return/Refund | Deskripsi (regex) |

### 4. Data Relationship

**Pesanan Selesai:**
- Dana dilepas ke penjual
- Masuk Balance Report sebagai "Penghasilan dari Pesanan"
- Masuk Income Seller Fee (biaya platform detail)
- Masuk Order.all (detail pesanan)

**Failed Delivery:**
- Dana TIDAK dilepas (barang tidak sampai)
- Balance Report: entry "Penyesuaian...Gagal Terkirim" (refund premi saja)
- Tidak ada di Income Seller Fee
- Ada di Order.failed_delivery

**Return/Refund:**
- Mayoritas ada di Balance → dana pernah dilepas, lalu di-refund
- Sebagian kecil tidak ada di Balance → return sebelum dana dilepas
- Ada di Order.return_refund

**Cancellation:**
- Belum dianalisa detail

### 5. Formula Profit

**Net Payout (dari Income Penghasilan):**
```
Net Payout = Harga Produk
           + Gratis Ongkir dari Shopee
           - Ongkir ke Jasa Kirim
           - Biaya Administrasi
           - Biaya Proses Pesanan
           - Biaya Gratis Ongkir XTRA
           - Biaya Layanan Promo XTRA
           - Biaya Lainnya
           + ... (adjustments lainnya)
```

**Profit Bersih (target calculation):**
```
Profit = Net Payout - HPP (dari master.xlsx)
```

**Note:** HPP di master.xlsx sudah termasuk biaya packaging

### 6. File Types & Purpose

**Order Reports:**
- `Order.all.*.xlsx` - Semua pesanan (complete, cancelled, failed, returned)
- `Order.failed_delivery.*.xlsx` - Pesanan gagal terkirim
- `Order.cancellation.*.xlsx` - Pesanan dibatalkan
- `Order.return_refund.*.xls` - Pesanan return/refund

**Financial Reports:**
- `my_balance_transaction_report.*.xlsx` - Transaksi dana (penghasilan, penarikan, adjustment)
- `Income.sudah dilepas.*.xlsx` - Detail biaya platform & penghasilan (multiple sheets)

**Supporting Data:**
- `master.xlsx` - Master SKU (HPP reference)
- `tacticalized_adwords_bill_*.csv` - Biaya iklan Shopee

### 7. Known Data Patterns

**Header Row Position:**
- Order files: Row 1
- Income Seller Fee: Row 2
- Balance Report: Row 18 (!!!)
- **Always scan first 20-30 rows** untuk detect header

**Multiple Sheets:**
- Income file punya 5 sheets: Summary, Adjustment, Shipping Fee Discrepancy, Seller Fee, Penghasilan
- Order files biasanya 1 sheet saja

**File Format Issues:**
- `.xls` files mungkin hybrid format (butuh python-calamine, bukan xlrd)

### 8. HPP Mapping Logic ⚠️ CRITICAL

**Source Data:**

**Order.all (2 kolom untuk mapping):**
1. **Nomor Referensi SKU** (prioritas pertama)
2. **SKU Induk** (fallback jika Nomor Referensi SKU kosong)

**master.xlsx (2 kolom untuk matching):**
1. **SKU1** (cek pertama)
2. **SKU2** (fallback jika SKU1 tidak match)
3. **Harga** = HPP (sudah termasuk biaya packaging)
4. **IDPRODUK** = identifier universal (level atas, sama across all stores)

**Mapping Rule (Priority Order):**

**Step 1: Ambil identifier dari Order.all**
- Jika **Nomor Referensi SKU** ada → gunakan ini
- Jika kosong → gunakan **SKU Induk**

**Step 2: Match ke master.xlsx**
- Coba match dengan **SKU1** dulu
- Jika tidak ketemu → coba **SKU2**
- Ambil **Harga** sebagai HPP
- Simpan **IDPRODUK** sebagai product identifier universal

**Reason:**
- Setiap toko input SKU beda-beda di Dashboard Shopee
- **IDPRODUK** adalah identifier universal across stores
- SKU1/SKU2 adalah varian/alias dari IDPRODUK yang sama
- HPP sama untuk IDPRODUK yang sama
- **HPP di master.xlsx sudah FIX (termasuk packaging)**

**Example:**
```
Order.all:
  Nomor Referensi SKU: "M-TAC Pendek"
  SKU Induk: "MTAC-SHORT-001"

master.xlsx:
  SKU1: "M-TAC Pendek"  ← MATCH!
  SKU2: "MTAC-SHORT"
  Harga: 52500  ← HPP (sudah + packaging)
  IDPRODUK: "M-TAC Pendek"

Result: HPP = Rp52,500
```

**Complete Tracing Example: No. Pesanan 2607072CRRDA37**

Tested on: 2026-08-06

**Step 1: Order.all → Get SKU**
```
No. Pesanan: 2607072CRRDA37
Nama Produk: Kemeja Tactical Pria Lengan Pendek M-TAC RIPSTOP Baju Kerja Lapangan
Nomor Referensi SKU: "M-TAC Pendek" ✓
SKU Induk: (kosong)

→ SKU untuk mapping HPP: "M-TAC Pendek"
```

**Step 2: master.xlsx → Get HPP**
```
SKU untuk mapping: "M-TAC Pendek"
Matched dengan: SKU1 ✓
IDPRODUK: M-TAC Pendek
HPP (sudah + packaging): Rp52,500 ✓
```

**Step 3: Income Penghasilan → Get Net Payout**
```
Harga Produk:                Rp82,500
Gratis Ongkir dari Shopee:  +Rp18,000
Ongkir ke Jasa Kirim:        -Rp18,000
Biaya Administrasi:          -Rp6,806
Biaya Proses Pesanan:        -Rp1,250
Biaya Gratis Ongkir XTRA:    -Rp4,125
Biaya Layanan Promo XTRA:    -Rp3,713
Biaya Lainnya (Premi):       -Rp413
─────────────────────────────────────
Net Payout: Rp66,193 ✓
```

**Step 4: Profit Calculation**
```
Profit = Net Payout - HPP
       = Rp66,193 - Rp52,500
       = Rp13,693

Margin = (Profit / Net Payout) × 100%
       = (13,693 / 66,193) × 100%
       = 20.69%
```

**Hasil Akhir:**
- **Net Payout:** Rp66,193
- **HPP (+ packaging):** Rp52,500
- **PROFIT BERSIH:** Rp13,693
- **MARGIN:** 20.69%

**Validasi:**
- ✓ HPP mapping logic verified (Nomor Referensi SKU → master.xlsx SKU1)
- ✓ Net Payout matches Balance Report & Screenshot (Rp66,193)
- ✓ All components calculated correctly
- ✓ End-to-end data flow proven: Order → master → Income → Profit

---

### 9. Biaya Iklan (AdWords)

**Source:** Balance Report - Tipe Transaksi "Pembayaran dengan Saldo Penjual"
- Deskripsi: "Isi Ulang Saldo Iklan/Koin Penjual"
- Total entries: 145
- Total biaya iklan periode: Rp-8,602,500 (minus = keluar dari saldo)

**AdWords Billing CSV:**
- Report tambahan untuk analisa campaign detail (optional)
- Tidak wajib untuk profit calculation
- Total biaya iklan sudah tercatat di Balance Report

**Allocation Strategy:**
```
Biaya Iklan per Order = Total Biaya Iklan Periode / Total Orders Periode
```

atau

```
Profit with Ads Cost = Profit - (Total Biaya Iklan / Total Orders)
```

---

### 10. Database Schema (Recommended)

**Core Tables:**
1. `orders` - dari Order.all
2. `income_penghasilan` - dari Income sheet "Penghasilan" (filter: Lihat berdasarkan = "Order")
3. `balance_transactions` - dari Balance Report
4. `master_products` - dari master.xlsx
5. `profit_calculation` - calculated view/table

**Join Strategy:**
```sql
orders (no_pesanan)
  LEFT JOIN income_penghasilan USING (no_pesanan)
  LEFT JOIN balance_transactions USING (no_pesanan)
  LEFT JOIN master_products ON (
    COALESCE(orders.nomor_referensi_sku, orders.sku_induk) IN (master_products.sku1, master_products.sku2)
  )
```

**Profit Calculation:**
```sql
profit = income_penghasilan.net_payout - master_products.harga
```

---

## Analysis Complete ✓

### Completed Tasks

- [x] ✓ Order.all structure analyzed
- [x] ✓ Balance Report cross-validated (18 sample pesanan)
- [x] ✓ Income sheet "Penghasilan" analyzed (52 cols, 1525 rows)
- [x] ✓ Failed Delivery pattern validated
- [x] ✓ Return/Refund pattern validated (3 patterns)
- [x] ✓ Cancellation pattern validated (2 patterns)
- [x] ✓ AdWords billing confirmed (in Balance Report)
- [x] ✓ master.xlsx HPP mapping logic defined
- [x] ✓ Formula profit verified with screenshot sample

### Documentation Files

1. `README.md` - Overview + business logic + HPP mapping
2. `BUSINESS_LOGIC.md` - Complete logic patterns (logic-only)
3. `VALIDATION_RESULTS.md` - Cross-reference validation (18 samples)
4. `INCOME_ANALYSIS.md` - Income sheet structure + mapping

**Total documentation:** ~45KB

---

## Import Script ✓

**Status: COMPLETE** (2026-08-06)

### Files Created

- `import_to_mysql.py` - Main import script (24KB, 573 lines)
- `requirements.txt` - Python dependencies
- `IMPORT_GUIDE.md` - Comprehensive usage guide (10KB)
- `queries.sql` - SQL query examples for analysis (10KB)

### Features Implemented

✓ **Dynamic Header Detection** - Auto-detect header di row 1, 2, atau 18  
✓ **HPP Mapping Logic** - Priority: Nomor Referensi SKU → SKU Induk → master SKU1 → SKU2  
✓ **Data Cleaning** - Currency parsing, date formatting  
✓ **Net Payout Validation** - Formula verification (100% pass)  
✓ **Comprehensive Logging** - import_log.txt + import_report.txt  
✓ **Error Handling** - Graceful recovery & detailed error messages  

### Import Results (Test Run)

```
DATABASE RECORDS:
-----------------
Master HPP Products    : 32 records
Orders (Order.all)     : 810 records
  - With HPP mapped    : 810 (100.0%)
  - Without HPP        : 0 (0.0%)

Income Penghasilan     : 679 records
  - Validation PASS    : 679 (100.0%)
  - Validation FAIL    : 0

SAMPLE PROFIT CALCULATION:
--------------------------
No. Pesanan            HPP   Net Payout     Profit   Margin
----------------------------------------------------------------------
260802A1K3DD0Y      62,500       77,320     14,820    19.2%
26080183P4NDAG      52,500       66,375     13,875    20.9%
260728UET4AFM7      52,500       63,433     10,933    17.2%
```

**Performance:**
- Total import time: ~32 seconds (1734 records)
- HPP mapping: 99.1% via SKU1, 0.9% via SKU2
- Net Payout validation: 100% accurate

### Quick Start

```bash
# Install dependencies
source .venv/bin/activate
pip install -r requirements.txt

# Run import
python3 import_to_mysql.py

# Check results
cat import_report.txt
```

Lihat `IMPORT_GUIDE.md` untuk dokumentasi lengkap.

---

## Next Steps

- [x] ✓ Finalize database schema detail (column selection)
- [x] ✓ Build Excel → MySQL import script with:
  - [x] ✓ Row filter untuk Income (Lihat berdasarkan = "Order")
  - [x] ✓ HPP mapping logic (Order → master.xlsx)
  - [x] ✓ Data cleaning (currency, date parsing)
  - [x] ✓ Validation (calculated total matches expected)
- [ ] Build Next.js dashboard
- [ ] Deploy ke Vercel
