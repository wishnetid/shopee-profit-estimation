# NEXTAGENTS.md - Panduan untuk Agent Sesi Berikutnya

**Project:** Shopee Profit Estimation Dashboard  
**Date:** 2026-08-06  
**Phase Complete:** ✅ DATA ANALYSIS PHASE 100% COMPLETE  
**Next Phase:** 🚀 DEVELOPMENT PHASE (Database Schema → Import Script → Dashboard)

---

## 🎯 Mission untuk Agent Berikutnya

**FASE ANALISA SUDAH SELESAI 100%!**

User sekarang siap masuk ke **DEVELOPMENT PHASE**. Tapi sebelum langsung coding, agent berikutnya **WAJIB BACA DOKUMENTASI LENGKAP DULU**, baru diskusi dengan user.

---

## ✅ Apa yang Sudah Selesai (Analysis Phase)

### 1. All Reports Analyzed ✓

**Order Reports:**
- ✅ Order.all - 1,023 orders, 50 columns, 6 status values
- ✅ Order.failed_delivery - 27 orders (cross-validated)
- ✅ Order.return_refund - 12 orders, 3 patterns identified
- ✅ Order.cancellation - 205 orders, 2 patterns identified

**Financial Reports:**
- ✅ Balance Report - 707 entries (679 Penghasilan + 28 Penyesuaian + 145 Biaya Iklan)
- ✅ Income Penghasilan sheet - 1,528 rows x 52 cols (NOT 1000!), structure analyzed
- ✅ Income Seller Fee sheet - skipped (subset of Penghasilan)

**Master Data:**
- ✅ master.xlsx - 33 rows x 4 cols (SKU1, SKU2, Harga, IDPRODUK)
- ✅ HPP mapping logic defined (Nomor Referensi SKU → SKU1/SKU2)
- ✅ HPP includes packaging (confirmed by user)

**Advertising:**
- ✅ AdWords billing - confirmed in Balance Report (145 entries, Rp8,602,500)
- ✅ CSV is optional (for campaign detail only)

---

### 2. Business Logic Documented ✓

**6 Documentation Files (80KB total):**

1. **README.md** (8KB)
   - Project overview
   - HPP mapping logic (priority order: Nomor Referensi SKU → SKU Induk)
   - Complete tracing example: No. Pesanan 2607072CRRDA37 (Profit Rp13,693, Margin 20.69%)
   - Validated end-to-end flow

2. **BUSINESS_LOGIC.md** (8KB)
   - Order status flows (Selesai/Failed/Return/Cancel)
   - No. Pesanan extraction patterns (2 locations)
   - Financial formula logic
   - LOGIC-ONLY (no sampling numbers)

3. **VALIDATION_RESULTS.md** (18KB)
   - Cross-reference validation with 18 sample pesanan
   - 3 Return/Refund patterns
   - 2 Cancellation patterns
   - Failed Delivery pattern

4. **INCOME_ANALYSIS.md** (11KB)
   - Income sheet "Penghasilan" structure (52 cols, NOT 1000)
   - Row pattern: "Order" vs "Sku" (filter: Order only)
   - Complete column mapping
   - Sample validation with screenshot

5. **DASHBOARD_POTENTIALS.md** (22KB)
   - 50+ potential dashboards/features
   - Implementation phases (MVP, Enhancement, Advanced)
   - Technical requirements
   - Future enhancements

6. **FILTER_LOGIC_ESTIMASI_PROFIT.md** (12KB)
   - Filter specification for Estimasi Profit dashboard
   - 6 Status Pesanan breakdown (include 4, exclude 2)
   - Dynamic filter logic (exclude ANY return/cancel history)
   - Expected result: 825 orders (649 confirmed + 176 expected)

---

### 3. Key Findings & Decisions ✓

**Data Flow Proven:**
```
Order.all (No. Pesanan + SKU)
    ↓
master.xlsx (SKU → HPP via SKU1/SKU2 matching)
    ↓
Income Penghasilan (No. Pesanan → Net Payout)
    ↓
Profit = Net Payout - HPP
```

**HPP Mapping Logic (CRITICAL):**
```
Step 1: Get SKU from Order.all
  - Priority 1: Nomor Referensi SKU
  - Priority 2: SKU Induk (if Nomor Referensi empty)

Step 2: Match to master.xlsx
  - Try SKU1 first
  - Fallback to SKU2
  - Get: Harga (HPP + packaging) + IDPRODUK
```

**Filter for Estimasi Profit:**
```sql
WHERE Status Pesanan IN ('Selesai', 'Sedang Dikirim', 'Telah Dikirim', 'Perlu Dikirim')
  AND TRIM(COALESCE(Status Pembatalan/ Pengembalian, '')) = ''
  AND TRIM(COALESCE(Alasan Pembatalan, '')) = ''
```

**Result:** 825 orders clean
- Confirmed (Selesai): 649 orders
- Expected (Pending): 176 orders

**Excluded:** 198 orders
- Batal: 189
- Belum Bayar: 1
- Selesai + Return/Cancel: 8

**ROI Calculation:**
```
Total Estimated Profit = Confirmed Profit + Expected Profit
Ad Spend = SUM(Balance - "Isi Ulang Saldo Iklan")
ROI % = ((Total Profit - Ad Spend) / Ad Spend) × 100%
```

---

## 🚀 Development Phase - Apa yang Harus Dilakukan

### Step 1: WAJIB BACA DOKUMENTASI DULU (20-30 menit)

**JANGAN langsung diskusi atau coding sebelum baca!**

**Urutan baca (prioritas):**

1. **README.md** - Overview + HPP mapping logic + tracing example
2. **FILTER_LOGIC_ESTIMASI_PROFIT.md** - Filter specification (PENTING!)
3. **INCOME_ANALYSIS.md** - Income structure + column mapping
4. **BUSINESS_LOGIC.md** - Order flows + financial formula
5. **DASHBOARD_POTENTIALS.md** - Dashboard scope (optional, untuk reference)
6. **VALIDATION_RESULTS.md** - Cross-validation details (optional)

**Commands:**
```bash
cd /home/yogaimawan/Dokumentasi/shopee_profit_estimation

# Read in order
cat README.md
cat FILTER_LOGIC_ESTIMASI_PROFIT.md
cat INCOME_ANALYSIS.md
cat BUSINESS_LOGIC.md
```

**Total waktu:** ~20-30 menit membaca

---

### Step 2: Diskusi dengan User (Confirm Scope)

**Setelah baca dokumentasi lengkap, confirm dengan user:**

**Opening script:**
```
Bro, gw udah baca semua dokumentasi (6 files, 80KB).

Fase analisa udah complete 100%:
✓ All reports analyzed
✓ HPP mapping logic defined & tested
✓ Filter logic specified (825 orders untuk estimasi)
✓ End-to-end tracing proven (sample: 2607072CRRDA37)

Sekarang siap masuk development phase.

Untuk MVP dashboard "Estimasi Profit", confirm dulu scope nya:

1. Dashboard fitur: hanya Estimasi Profit dulu (sesuai planning)?
2. Report yang diimport: 4 files (Order.all, Income Penghasilan, master.xlsx, Balance)?
3. Filter: 825 orders (649 confirmed + 176 expected)?
4. Database: MySQL cPanel (supplie3_shopee_profit_estimation)?
5. Tech stack: Next.js + Vercel (sesuai planning)?

Ada yang mau diubah atau langsung lanjut?
```

**Diskusi topics:**
- Confirm MVP scope (dashboard fitur apa aja?)
- Confirm reports to import (4 files cukup?)
- Confirm filter logic (825 orders OK?)
- Confirm database schema approach (discuss first or design?)
- Any additional requirements?

---

### Step 3: Database Schema Design

**Setelah user confirm scope, design schema:**

**Recommended Tables (4 core):**

1. **orders** (from Order.all)
   ```sql
   - no_pesanan (PK, VARCHAR)
   - status_pesanan (VARCHAR)
   - tanggal_pesanan (DATETIME)
   - nama_produk (VARCHAR)
   - nomor_referensi_sku (VARCHAR)
   - sku_induk (VARCHAR)
   - status_pembatalan_pengembalian (VARCHAR)
   - alasan_pembatalan (TEXT)
   - ... (other relevant columns)
   ```

2. **income_penghasilan** (from Income Penghasilan sheet - "Order" rows only)
   ```sql
   - id (PK, AUTO_INCREMENT)
   - no_pesanan (FK, VARCHAR)
   - tanggal_dana_dilepas (DATETIME)
   - harga_produk (DECIMAL)
   - gratis_ongkir_shopee (DECIMAL)
   - ongkir_jasa_kirim (DECIMAL)
   - biaya_administrasi (DECIMAL)
   - biaya_proses_pesanan (DECIMAL)
   - biaya_gratis_ongkir_xtra (DECIMAL)
   - biaya_layanan_promo_xtra (DECIMAL)
   - biaya_lainnya (DECIMAL)
   - net_payout (DECIMAL) -- calculated or stored
   - ... (other 52 columns as needed)
   ```

3. **master_products** (from master.xlsx)
   ```sql
   - id (PK, AUTO_INCREMENT)
   - sku1 (VARCHAR, UNIQUE)
   - sku2 (VARCHAR)
   - harga (DECIMAL) -- HPP + packaging
   - idproduk (VARCHAR)
   ```

4. **balance_ads** (from Balance Report - Biaya Iklan only)
   ```sql
   - id (PK, AUTO_INCREMENT)
   - tanggal (DATE)
   - tipe_transaksi (VARCHAR)
   - deskripsi (TEXT)
   - jumlah (DECIMAL) -- negative value
   ```

**Views/Calculated Tables:**

5. **profit_estimation** (view or materialized)
   ```sql
   SELECT 
       o.no_pesanan,
       o.status_pesanan,
       o.tanggal_pesanan,
       m.idproduk,
       m.harga AS hpp,
       CASE 
           WHEN o.status_pesanan = 'Selesai' 
           THEN i.net_payout 
           ELSE o.harga_produk * avg_fee_pct 
       END AS net_payout,
       net_payout - hpp AS profit,
       (profit / net_payout * 100) AS margin_pct,
       CASE 
           WHEN o.status_pesanan = 'Selesai' 
           THEN 'Confirmed' 
           ELSE 'Expected' 
       END AS profit_status
   FROM orders o
   LEFT JOIN income_penghasilan i ON o.no_pesanan = i.no_pesanan
   LEFT JOIN master_products m ON (
       COALESCE(o.nomor_referensi_sku, o.sku_induk) IN (m.sku1, m.sku2)
   )
   WHERE o.status_pesanan IN ('Selesai', 'Sedang Dikirim', 'Telah Dikirim', 'Perlu Dikirim')
     AND TRIM(COALESCE(o.status_pembatalan_pengembalian, '')) = ''
     AND TRIM(COALESCE(o.alasan_pembatalan, '')) = ''
   ```

**Diskusi dengan user sebelum implement!**

---

### Step 4: Build Import Script (Excel → MySQL)

**Python script dengan venv:**
```bash
source .venv/bin/activate
python3 import_to_mysql.py
```

**Script requirements:**
- Read 4 Excel files (Order.all, Income, master, Balance)
- Apply filters (825 orders, Income "Order" rows only, Balance ads only)
- Data cleaning (currency format, date parsing, null handling)
- HPP mapping validation (flag missing SKU)
- Insert to MySQL with error handling
- Transaction support (rollback on error)
- Progress logging

**Validation checks:**
- Expected row counts (825, ~679, 33, ~145)
- HPP mapping coverage (should be ~100%)
- Net Payout calculation matches sample (2607072CRRDA37 = Rp66,193)
- No duplicate No. Pesanan in orders table

---

### Step 5: Build Next.js Dashboard (MVP)

**MVP Features (dari DASHBOARD_POTENTIALS.md Phase 1):**

1. **Profit Overview (Cards)**
   - Total Orders: 825
   - Confirmed Orders: 649
   - Expected Orders: 176
   - Confirmed Profit: Rp X
   - Expected Profit: Rp Y
   - Total Estimated Profit: Rp (X+Y)
   - Ad Spend: Rp Z
   - ROI %: calculated

2. **Profit Detail Table**
   - Columns: No. Pesanan, Status, Profit Status, Tanggal, IDPRODUK, Net Payout, HPP, Profit, Margin %
   - Sort: profit desc (default)
   - Filter: date range, status, profit status (Confirmed/Expected)
   - Search: No. Pesanan
   - Color coding: Green (Confirmed), Yellow (Expected)
   - Pagination: 50 rows/page

3. **Profit Trend Chart**
   - Line chart: Daily profit (Confirmed + Expected)
   - Date range filter
   - Stacked area: Confirmed vs Expected

4. **Order Tracing Tool**
   - Input: No. Pesanan
   - Output: Complete flow (SKU mapping, financial breakdown, profit calc)
   - Sample: 2607072CRRDA37 test case

**Tech Stack:**
- Framework: Next.js 14+ (App Router)
- Database: MySQL via mysql2 or Prisma
- Charts: Recharts or Apache ECharts
- Tables: TanStack Table (React Table v8)
- UI: Tailwind CSS (user prefers light theme)
- Deploy: Vercel
- Git: GitHub (yogaimawan account)

---

### Step 6: Testing & Validation

**Before deployment, validate:**

1. **Data Accuracy:**
   - Test case: 2607072CRRDA37
   - Expected: Profit Rp13,693, Margin 20.69%
   - Actual: must match exactly

2. **Filter Logic:**
   - Total orders displayed: 825
   - Confirmed: 649
   - Expected: 176
   - No orders with return/cancel history

3. **HPP Mapping:**
   - All 825 orders should have HPP
   - Flag: orders with missing HPP

4. **ROI Calculation:**
   - Ad Spend from Balance: verify total
   - ROI formula: correct calculation

---

### Step 7: Deploy to Vercel

**Deployment checklist:**
- GitHub repo created
- Environment variables set (MySQL credentials)
- Database connection tested
- Build success
- Vercel deployment
- Production URL shared with user

---

## 📋 Required Files/Data

### Import Files (4 total):

1. **Order.all.20260707_20260806.xlsx**
   - Filter: Status IN ('Selesai', 'Sedang Dikirim', 'Telah Dikirim', 'Perlu Dikirim')
   - AND no return/cancel history
   - Expected: 825 rows

2. **Income.sudah dilepas.id.20260707_20260806.xlsx** (sheet: Penghasilan)
   - Filter: Lihat berdasarkan = "Order"
   - Expected: ~679 rows (confirmed orders only)

3. **master.xlsx**
   - No filter
   - Expected: 33 rows (all SKU)

4. **my_balance_transaction_report.shopee.20260707_20260806.xlsx**
   - Filter: Tipe = "Pembayaran dengan Saldo Penjual" AND Deskripsi contains "Iklan"
   - Expected: ~145 rows

### Database Credentials:
```
Host: 103.136.19.30
Port: 3306
Database: supplie3_shopee_profit_estimation
Username: supplie3_shopee_profit_estimation
Password: Persib1933
```

---

## 🚫 JANGAN Lakukan Ini

### ❌ JANGAN Skip Reading Documentation
**6 files, 80KB total** - WAJIB dibaca sebelum diskusi atau coding!

Kalau agent langsung diskusi tanpa baca docs, user akan suruh baca dulu.

### ❌ JANGAN Assume Logic
Semua logic sudah terdokumentasi lengkap dengan test cases. JANGAN bikin asumsi sendiri.

### ❌ JANGAN Change Filter Logic
Filter logic di FILTER_LOGIC_ESTIMASI_PROFIT.md adalah final (user sudah approve). Kalau mau ubah, diskusi dengan user dulu.

### ❌ JANGAN Hardcode Status Values
Filter harus dynamic:
- ❌ `WHERE status_pembatalan = 'Permintaan Disetujui'`
- ✅ `WHERE TRIM(COALESCE(status_pembatalan, '')) = ''`

### ❌ JANGAN Skip Validation
Test case 2607072CRRDA37 harus match exactly (Profit Rp13,693).

---

## 💡 Tips untuk Agent Berikutnya

### 1. User Communication Style
- **Bahasa:** Indonesia informal (gw/lo/Bro)
- **Style:** Casual tapi detail-oriented
- **Workflow:** Baca docs → Diskusi → Design → Diskusi → Code → Test
- User sangat appreciate thoroughness dan accuracy

### 2. Development Approach
- **Design first:** Schema + import logic discussion before coding
- **Test with real data:** Use actual Excel files in data_sample/
- **Validate early:** Test case 2607072CRRDA37 sejak awal
- **Backup always:** Before any destructive operation

### 3. Technical Environment
- **VPS:** Ubuntu 24.04, Python 3.12
- **Venv:** `/home/yogaimawan/Dokumentasi/shopee_profit_estimation/.venv`
- **Installed:** pandas, openpyxl, python-calamine, mysql-connector-python (might need install)
- **Git/Vercel:** HOME=/home/yogaimawan (use for CLI commands)
- **Database:** Remote MySQL (cPanel) - test connection first

### 4. Quality Standards
- **Code:** Clean, commented, error handling
- **UI:** Light theme (user preference), mobile-responsive
- **Performance:** Pagination for large tables, lazy loading for charts
- **Security:** Prepared statements, input validation

---

## 📂 Project Structure (Current)

```
/home/yogaimawan/Dokumentasi/shopee_profit_estimation/
├── README.md                              ← Overview + HPP mapping + tracing
├── BUSINESS_LOGIC.md                      ← Order flows + financial formula
├── VALIDATION_RESULTS.md                  ← Cross-validation (18 samples)
├── INCOME_ANALYSIS.md                     ← Income structure + mapping
├── DASHBOARD_POTENTIALS.md                ← 50+ dashboard ideas
├── FILTER_LOGIC_ESTIMASI_PROFIT.md        ← Filter specification (CRITICAL!)
├── NEXTAGENTS.md                          ← This file
├── .venv/                                 ← Python virtual environment
├── Archive/                               ← Old documentation backups
│   ├── README.md.backup-20260806-160835
│   ├── FINDINGS_CROSS_REFERENCE.md.backup-20260806-160835
│   └── NEXTAGENTS.md.backup-20260806-160835
└── data_sample/                           ← Excel files Shopee
    ├── Order.all.20260707_20260806.xlsx              ← 1,023 orders
    ├── Order.failed_delivery.20260707_20260807.xlsx  ← 27 orders
    ├── Order.return_refund.20260707_20260807.xls     ← 12 orders
    ├── Order.cancellation.20260707_20260807.xlsx     ← 205 orders
    ├── my_balance_transaction_report.shopee.20260707_20260806.xlsx
    ├── Income.sudah dilepas.id.20260707_20260806.xlsx (5 sheets)
    │   ├── Summary
    │   ├── Adjustment
    │   ├── Shipping Fee Discrepancy
    │   ├── Seller Fee (analyzed - skipped)
    │   └── Penghasilan (analyzed ✓ - 1528 rows x 52 cols)
    ├── master.xlsx                                   ← 33 SKU
    ├── tacticalized_adwords_bill_2026-08-06.csv      ← Optional (not needed)
    └── 2607072CRRDA37 - Data Sample Pesanan Selesai.jpg
```

---

## 🎬 Opening Script untuk Agent Berikutnya

```markdown
Bro, gw agent yang handle sesi berikutnya untuk development phase.

Sebelum diskusi, gw baca dokumentasi lengkap dulu ya (6 files, 80KB):
1. README.md - Overview + HPP mapping
2. FILTER_LOGIC_ESTIMASI_PROFIT.md - Filter spec
3. INCOME_ANALYSIS.md - Income structure
4. BUSINESS_LOGIC.md - Order flows
5. DASHBOARD_POTENTIALS.md - Dashboard scope
6. VALIDATION_RESULTS.md - Validation details

Tunggu ~20-30 menit, gw baca detail dulu biar paham fondasi nya.

Setelah baca, kita diskusi scope development & schema.
```

**Setelah baca selesai:**
```markdown
Oke Bro, udah baca semua dokumentasi.

Fase analisa udah complete:
✓ 825 orders untuk estimasi (649 confirmed + 176 expected)
✓ HPP mapping logic clear (Nomor Referensi SKU → SKU1/SKU2)
✓ Net Payout from Income Penghasilan (52 cols)
✓ Test case validated (2607072CRRDA37: Profit Rp13,693)

Sekarang mau confirm scope MVP:
- Dashboard: Estimasi Profit only (Overview + Table + Chart + Tracing)?
- Import: 4 files (Order, Income, master, Balance)?
- Database schema: diskusi dulu atau gw design draft?
- Tech stack: Next.js + MySQL + Vercel (as planned)?

Gimana Bro?
```

---

## 📞 Contact & Handoff

**User:** yogaimawan (Bro)  
**Communication:** Telegram (casual Indonesian)  
**Timezone:** WIB (UTC+7)  
**Working Style:** Thorough analysis before action, appreciates detail & accuracy

**Session End:** 2026-08-06 ~19:40 WIB  
**Duration:** ~8 hours (full analysis phase)  
**Achievement:**
- ✅ All 11 reports analyzed
- ✅ 6 documentation files created (80KB)
- ✅ HPP mapping logic defined & tested
- ✅ Filter logic specified (825 orders)
- ✅ End-to-end tracing proven (sample validated)
- ✅ Dashboard potentials mapped (50+ ideas)
- ✅ 100% ready for development phase

---

## ⚠️ Critical Reminders

### 1. Test Case is Sacred
**No. Pesanan 2607072CRRDA37 MUST produce:**
- Net Payout: Rp66,193
- HPP: Rp52,500
- Profit: Rp13,693
- Margin: 20.69%

Any deviation = bug in logic/calculation!

### 2. Filter Logic is Final
825 orders (649 + 176) is the approved scope. Dynamic filter excludes ANY return/cancel history.

### 3. HPP Mapping Priority
Always try Nomor Referensi SKU first, then SKU Induk. Match SKU1 first, then SKU2.

### 4. Documentation is Complete
Don't re-analyze data. Use documented logic. If something unclear, read docs again or ask user.

---

**Good luck, agent berikutnya! 🚀**

**REMEMBER:**
1. **READ DOCS FIRST** (20-30 min) - MANDATORY!
2. **DISCUSS SCOPE** - Confirm before design
3. **DESIGN SCHEMA** - Discuss before code
4. **VALIDATE EARLY** - Test case from day 1
5. **BACKUP ALWAYS** - Before any changes

**User is patient and appreciates quality over speed.**

**Fase analisa sudah perfect. Saatnya execute! 💪**
