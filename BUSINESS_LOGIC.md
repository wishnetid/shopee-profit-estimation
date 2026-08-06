# Business Logic - Shopee Profit Estimation

**Date:** 2026-08-06  
**Purpose:** Dokumentasi LOGIC-ONLY (bukan sampling data)

---

## 1. Primary Key & Identifier

### No. Pesanan

**Format Pattern:** `YYMMDD[A-Z0-9]{8-10}`

**Usage:**
- Primary key untuk cross-reference semua report
- Unique identifier per order
- Konsisten di semua file (Order, Balance, Income)

---

## 2. Balance Report Structure

### No. Pesanan Location Pattern

**Pattern 1: Dedicated Column**
- Column name: "No. Pesanan"
- Transaction type: "Penghasilan dari Pesanan"
- Extraction: Direct read

**Pattern 2: Embedded in Description**
- Column name: "Deskripsi"
- Transaction types: "Penyesuaian..." (adjustment entries)
- Extraction: Regex
- Common patterns:
  - `Pesanan #(\w+)`
  - `Gagal Terkirim: (\w+)`
  - `pesanan (\w+) karena`

### Transaction Type Classification

| Tipe Transaksi | Order-Related? | No. Pesanan Source |
|----------------|----------------|-------------------|
| Penghasilan dari Pesanan | ✓ | Column "No. Pesanan" |
| Penyesuaian (Failed/Return) | ✓ | Regex from "Deskripsi" |
| Isi Ulang Saldo Iklan | ✗ | - |
| Penarikan Dana | ✗ | - |

---

## 3. Order Status & Data Flow

### Pesanan Selesai (Completed Order)

**Flow:**
1. Order delivered successfully
2. Dana dilepas ke penjual
3. Appears in Balance Report as "Penghasilan dari Pesanan"
4. Appears in Income Seller Fee (platform fees)
5. Appears in Order.all

**Data Coverage:**
- Balance Report: ✓ (Net Payout)
- Income Seller Fee: ✓ (Fee breakdown)
- Order.all: ✓ (Order details)

### Failed Delivery

**Flow:**
1. Order gagal terkirim
2. Dana TIDAK dilepas
3. Only adjustment entry in Balance (refund premi to buyer)
4. Appears in Order.failed_delivery

**Data Coverage:**
- Balance Report: ✓ (Adjustment entry only)
- Income Seller Fee: ✗
- Order.all: ✓
- Order.failed_delivery: ✓

### Return/Refund

**Flow Pattern 1 (Majority):**
1. Order delivered → dana dilepas
2. Buyer return → refund processed
3. Appears in Balance (both original income + adjustment)
4. Appears in Order.return_refund

**Flow Pattern 2 (Minority):**
1. Return before dana dilepas
2. No entry in Balance
3. Only in Order.return_refund

**Data Coverage:**
- Balance Report: ✓ (most cases) / ✗ (some cases)
- Income Seller Fee: ✓ (when dana dilepas)
- Order.all: ✓
- Order.return_refund: ✓

### Cancellation

**Status:** Belum dianalisa detail

**Expected Flow:**
- Similar to Failed Delivery atau Return pattern
- Need cross-check dengan Balance Report
- Data in Order.cancellation

---

## 4. Financial Calculation Logic

### Net Payout (Balance Report)

**Formula:**
```
Net Payout = Subtotal Pesanan
           - Biaya Platform
           - Biaya Gratis Ongkir
           - Biaya Layanan
           - Biaya Lainnya (Premi)
           - Ongkir ke Jasa Kirim
           + Potongan Ongkir dari Shopee
```

**Data Source:**
- Subtotal: Order.all
- Biaya breakdown: Income Seller Fee
- Net result: Balance Report

### Profit Calculation (Target)

**Formula:**
```
Profit Bersih = Net Payout - HPP - Biaya Packaging
```

**Missing Components:**
- HPP: from master.xlsx (need confirmation)
- Biaya Packaging: source TBD (per SKU atau per order?)

**Optional Enhancement:**
```
Profit Bersih Adjusted = Profit Bersih - (Biaya Iklan / Total Orders)
```

---

## 5. Report Relationships

### Core Data Flow

```
Order.all (all orders)
    │
    ├─→ Pesanan Selesai
    │       ├─→ Balance Report (Penghasilan)
    │       ├─→ Income Seller Fee (Biaya Platform)
    │       └─→ Profit Calculation (+ HPP + Packaging)
    │
    ├─→ Failed Delivery
    │       ├─→ Balance Report (Adjustment only)
    │       └─→ Order.failed_delivery
    │
    ├─→ Return/Refund
    │       ├─→ Balance Report (conditional)
    │       ├─→ Income Seller Fee (conditional)
    │       └─→ Order.return_refund
    │
    └─→ Cancellation
            ├─→ Balance Report (TBD)
            └─→ Order.cancellation
```

### Join Strategy

**Primary Join:**
```sql
orders (no_pesanan)
  LEFT JOIN balance_transactions USING (no_pesanan)
  LEFT JOIN seller_fees USING (no_pesanan)
```

**Why LEFT JOIN:**
- Not all orders have Balance entries (Failed/Cancelled/Return before release)
- Order.all is the source of truth for all orders
- Balance & Income only for completed transactions

---

## 6. File Structure Patterns

### Header Row Detection

**Rule:** Header row position varies by file type

| File Type | Typical Header Row |
|-----------|-------------------|
| Order.all | Row 1 |
| Income Seller Fee | Row 2 |
| Balance Report | Row 18 |

**Strategy:** Always scan first 20-30 rows untuk detect header

### Multiple Sheets

**Income File Structure:**
- Sheet 1: Summary (aggregate)
- Sheet 2: Adjustment
- Sheet 3: Shipping Fee Discrepancy
- Sheet 4: Seller Fee (platform fees detail)
- Sheet 5: Penghasilan (comprehensive income detail - 1000+ cols)

**Strategy:** Always check `sheet_names` before processing

### File Format Issues

**Problem:** `.xls` extension might be hybrid format
- Legacy `.xls` → xlrd (broken in Python 3.12+)
- Modern `.xls` → actually XLSX format → use python-calamine

**Strategy:** Use `engine='calamine'` in pandas for robust reading

---

## 7. Data Validation Rules

### Cross-Reference Validation

**Expected Consistency:**
- Every entry in Balance Report "Penghasilan dari Pesanan" → must exist in Income Seller Fee
- Every entry in Balance Report → must have corresponding No. Pesanan
- Every No. Pesanan in Income → must exist in Order.all

**Validation Queries:**
```sql
-- Check orphaned Balance entries
SELECT b.no_pesanan 
FROM balance_transactions b
LEFT JOIN orders o USING (no_pesanan)
WHERE o.no_pesanan IS NULL;

-- Check orphaned Income entries
SELECT i.no_pesanan
FROM seller_fees i
LEFT JOIN orders o USING (no_pesanan)
WHERE o.no_pesanan IS NULL;

-- Check missing fees for completed orders
SELECT b.no_pesanan
FROM balance_transactions b
WHERE tipe = 'Penghasilan dari Pesanan'
  AND NOT EXISTS (
    SELECT 1 FROM seller_fees i 
    WHERE i.no_pesanan = b.no_pesanan
  );
```

---

## 8. Outstanding Questions

### HPP & Biaya Packaging
- **Source:** master.xlsx atau user input?
- **Granularity:** Per SKU atau per order?
- **Coverage:** Apakah semua produk di Order.all ada di master?
- **Input mechanism:** Import Excel atau manual form?

### Biaya Iklan (AdWords)
- **Allocation strategy:** Per order atau per periode?
- **Mapping logic:** Campaign → Product → Order?
- **Time period:** Daily, weekly, monthly aggregate?

### Income Penghasilan Sheet (1000+ cols)
- **Content:** Apa saja yang ada di 1000 kolom?
- **Overlap:** Apakah duplikasi dengan Seller Fee?
- **Necessity:** Perlu diimport atau Seller Fee sudah cukup?

### Order.cancellation
- **Balance appearance:** Berapa yang masuk Balance Report?
- **Adjustment pattern:** Ada refund premi seperti Failed Delivery?
- **Business impact:** Affect profit calculation atau tidak?

---

## 9. Implementation Notes

### Import Priority

**Phase 1: Core Data**
1. Order.all → `orders` table
2. Balance Report → `balance_transactions` table
3. Income Seller Fee → `seller_fees` table

**Phase 2: Problem Orders**
4. Order.failed_delivery → `failed_deliveries` table
5. Order.return_refund → `returns_refunds` table
6. Order.cancellation → `cancellations` table

**Phase 3: Supporting Data**
7. master.xlsx → `products` / `hpp` table
8. AdWords billing → `ad_costs` table (after allocation logic confirmed)

### Data Cleaning Rules

**No. Pesanan Extraction:**
- Remove whitespace: `strip()`
- Uppercase normalization (if inconsistent)
- Regex validation: `^[0-9]{6}[A-Z0-9]{8,10}$`

**Currency Normalization:**
- Remove "Rp" prefix
- Remove thousand separator (`.`)
- Convert to numeric: `float` or `decimal`

**Date Parsing:**
- Detect format: DD/MM/YYYY vs YYYY-MM-DD
- Convert to ISO format for MySQL: YYYY-MM-DD

---

## Next Actions

1. **Analisa Income Penghasilan sheet** (1000+ cols) → understand content
2. **Analisa AdWords CSV** → design allocation logic
3. **Konfirmasi HPP source** dengan user → finalize profit formula
4. **Design database schema** based on complete understanding
5. **Build import scripts** with validation rules
6. **Develop dashboard** after data foundation solid
