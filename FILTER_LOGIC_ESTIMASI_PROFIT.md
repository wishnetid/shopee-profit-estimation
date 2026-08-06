# Filter Logic - Estimasi Profit Dashboard

**Date:** 2026-08-06  
**Purpose:** Spesifikasi filter untuk perhitungan Estimasi Profit (Monitoring Ads Spend)

---

## Overview

Dashboard **Estimasi Profit** berbeda dengan **Confirmed Profit Report**. 

- **Confirmed Profit:** Hanya pesanan yang sudah selesai dan dana dilepas (Status = "Selesai")
- **Estimasi Profit:** Include pesanan selesai + pesanan yang sedang dalam proses (expected profit)

**Use Case:** Monitoring ROI dari Ad Spend secara real-time sebelum semua pesanan selesai.

---

## Data Source: Order.all

**File:** `Order.all.YYYYMMDD_YYYYMMDD.xlsx`  
**Total rows (sample periode 2026-07-07 s/d 2026-08-06):** 1,023 orders

---

## Status Pesanan Breakdown

### Status Values di Order.all (6 unique values)

| Status Pesanan | Count | % | Include? | Kategori |
|----------------|-------|---|----------|----------|
| **Selesai** | 657 | 64.22% | ✅ Ya* | Confirmed Profit |
| **Sedang Dikirim** | 122 | 11.93% | ✅ Ya | Expected Profit |
| **Telah Dikirim** | 41 | 4.01% | ✅ Ya | Expected Profit |
| **Perlu Dikirim** | 13 | 1.27% | ✅ Ya | Expected Profit |
| **Batal** | 189 | 18.48% | ❌ Tidak | Cancelled |
| **Belum Bayar** | 1 | 0.10% | ❌ Tidak | Unpaid |

**Note:** *Status "Selesai" ada syarat tambahan (lihat section "Filter Tambahan")

---

## Include dalam Estimasi (4 Status)

### 1. Status: "Selesai" (657 orders)

**Definisi:** Pesanan completed, dana sudah/akan dilepas ke seller

**Profit Category:** ✅ **CONFIRMED PROFIT**

**Characteristics:**
- Buyer sudah konfirmasi terima barang / auto-complete setelah X hari
- Dana sudah dilepas dari escrow Shopee
- Net Payout sudah confirmed (ada di Income Penghasilan)
- Ada di Balance Report

**Data Source for Calculation:**
- Net Payout: dari **Income Penghasilan** (actual data)
- HPP: dari **master.xlsx** (via SKU mapping)

**Profit Calculation:**
```
Confirmed Profit = Net Payout (Income) - HPP (master)
```

---

### 2. Status: "Sedang Dikirim" (122 orders)

**Definisi:** Pesanan dalam perjalanan ke buyer

**Profit Category:** 🔮 **EXPECTED PROFIT**

**Characteristics:**
- Sudah di-pickup oleh kurir
- Dalam transit (belum delivered)
- Dana masih di-hold Shopee (escrow)
- Belum ada di Income Penghasilan (dana belum dilepas)

**Data Source for Calculation:**
- Net Payout: **ESTIMASI** (tidak ada actual data)
- HPP: dari **master.xlsx** (via SKU mapping)

**Profit Calculation:**
```
Average Fee % = AVG(Net Payout / Harga Produk) FROM confirmed orders

Estimated Net Payout = Harga Produk (Order.all) × Average Fee %
Expected Profit = Estimated Net Payout - HPP
```

**Risk Factor:** Sedang (bisa return, gagal kirim, atau cancel by buyer)

---

### 3. Status: "Telah Dikirim" (41 orders)

**Definisi:** Pesanan sudah delivered, menunggu konfirmasi buyer

**Profit Category:** 🔮 **EXPECTED PROFIT**

**Characteristics:**
- Kurir sudah deliver ke buyer
- Buyer belum konfirmasi terima
- Auto-complete setelah 3-7 hari (tergantung jasa kirim)
- Dana masih di-hold Shopee (escrow)
- Belum ada di Income Penghasilan

**Data Source for Calculation:**
- Net Payout: **ESTIMASI** (tidak ada actual data)
- HPP: dari **master.xlsx**

**Profit Calculation:**
```
Estimated Net Payout = Harga Produk × Average Fee %
Expected Profit = Estimated Net Payout - HPP
```

**Risk Factor:** Rendah (sudah delivered, kemungkinan besar akan complete)

---

### 4. Status: "Perlu Dikirim" (13 orders)

**Definisi:** Pesanan ready to ship, belum di-pickup kurir

**Profit Category:** 🔮 **EXPECTED PROFIT**

**Characteristics:**
- Buyer sudah bayar
- Seller belum kirim / belum di-pickup kurir
- Dana di-hold Shopee (escrow)
- Belum ada di Income Penghasilan

**Data Source for Calculation:**
- Net Payout: **ESTIMASI** (tidak ada actual data)
- HPP: dari **master.xlsx**

**Profit Calculation:**
```
Estimated Net Payout = Harga Produk × Average Fee %
Expected Profit = Estimated Net Payout - HPP
```

**Risk Factor:** Sedang-Tinggi (bisa cancel by buyer, late shipment penalty)

---

## Exclude dari Estimasi (2 Status)

### 5. Status: "Batal" (189 orders)

**Definisi:** Pesanan cancelled (by buyer, seller, atau sistem)

**Profit Category:** ❌ **NO PROFIT**

**Why Exclude:**
- Tidak ada transaksi yang terjadi
- Dana tidak pernah dilepas
- Tidak ada revenue
- Tidak ada di Income Penghasilan

**Sub-categories (dari Alasan Pembatalan):**
- Buyer cancel: 44 + 34 + 32 + 7 + 5 + 4 + 4 + 1 + 1 = 132 orders
- Auto-cancel sistem (unpaid): 42 orders
- Auto-cancel sistem (failed delivery): 14 orders
- Auto-cancel sistem (lainnya): 1 order

---

### 6. Status: "Belum Bayar" (1 order)

**Definisi:** Pesanan created tapi buyer belum bayar

**Profit Category:** ❌ **NO PROFIT**

**Why Exclude:**
- Buyer belum bayar
- Akan auto-cancel setelah X jam
- Tidak ada revenue potensial

---

## Filter Tambahan: Exclude Problematic Orders

### Problem: Orders dengan Return/Refund History

**Ditemukan:** 8 orders dengan Status = "Selesai" tapi ada return/refund yang disetujui

**Sample Cases:**
- No. Pesanan: 260715QTB2PY2Q
- No. Pesanan: 2607218X329XJ6
- No. Pesanan: 260724GKYK6S57
- dll (total 8 orders)

**Characteristics:**
- Status Pesanan = "Selesai" ✅
- Alasan Pembatalan = (kosong)
- Status Pembatalan/Pengembalian = **"Permintaan Disetujui"** ⚠️

**Financial Impact:**
- Net Payout bisa NEGATIF (seller refund ke buyer)
- Atau Net Payout jauh berkurang
- Profit calculation jadi tidak akurat

**Why Exclude:**
- Data finansial tidak reliable
- Bisa menyebabkan profit overestimation
- Risk: include return as profit (misleading)

---

### Filter Logic: Exclude ANY Cancellation/Return Activity

**Columns to Check:**
1. **Alasan Pembatalan** (kolom 3)
2. **Status Pembatalan/ Pengembalian** (kolom 4)

**Rule:** Exclude orders jika **SALAH SATU** kolom ada isi (not empty/null/dash)

**Why Dynamic (not hardcode):**
- Status bisa berubah: "Permintaan Disetujui", "Sedang Diproses", "Menunggu Persetujuan", dll
- Dengan exclude ANY non-empty value, kita cover semua cases
- Future-proof: status baru akan otomatis ter-exclude

**Possible Values di "Status Pembatalan/ Pengembalian":**
- (kosong) - normal order ✅
- "Permintaan Disetujui" - return approved ❌
- "Sedang Diproses" - return in progress ❌
- "Menunggu Persetujuan" - return pending ❌
- (unknown future values) - all excluded ❌

---

## Final Filter SQL

```sql
SELECT 
    o.no_pesanan,
    o.status_pesanan,
    o.tanggal_pesanan,
    o.nama_produk,
    -- ... other columns
FROM orders o
WHERE 
    -- Include 4 status untuk estimasi
    o.status_pesanan IN (
        'Selesai', 
        'Sedang Dikirim', 
        'Telah Dikirim', 
        'Perlu Dikirim'
    )
    -- Exclude orders dengan return/cancel history
    AND TRIM(COALESCE(o.status_pembatalan_pengembalian, '')) = ''
    AND TRIM(COALESCE(o.alasan_pembatalan, '')) = ''
```

**Result: 825 orders clean untuk estimasi**

---

## Breakdown Final Result

### ✅ INCLUDE (825 orders)

**Confirmed Profit (649 orders):**
- Status: "Selesai"
- No return/cancel history
- Net Payout: actual data dari Income Penghasilan
- Calculation: `Net Payout - HPP`

**Expected Profit (176 orders):**
- Status: "Sedang Dikirim" (122) + "Telah Dikirim" (41) + "Perlu Dikirim" (13)
- No return/cancel history
- Net Payout: estimated dari average fee %
- Calculation: `(Harga Produk × Avg Fee %) - HPP`

---

### ❌ EXCLUDE (198 orders)

| Category | Count | Reason |
|----------|-------|--------|
| Status "Batal" | 189 | Cancelled, no revenue |
| Status "Belum Bayar" | 1 | Unpaid, will auto-cancel |
| Status "Selesai" + Return | 8 | Return/refund approved, unreliable data |
| **TOTAL** | **198** | **Not reliable for estimation** |

---

## Dashboard Implementation

### Tab 1: Estimasi Profit Overview

**Metrics:**
- Total Orders: 825
- Confirmed Orders: 649 (78.7%)
- Expected Orders: 176 (21.3%)
- Excluded Orders: 198 (19.4% of 1,023 total)

**Profit:**
- Confirmed Profit: Rp X (actual)
- Expected Profit: Rp Y (estimated)
- **Total Estimated Profit: Rp (X + Y)**

**Ads Spend (dari Balance Report):**
- Total Ad Spend: Rp Z

**ROI:**
```
ROI % = ((Total Estimated Profit - Ad Spend) / Ad Spend) × 100%
```

---

### Tab 2: Profit Detail Table

**Columns:**
- No. Pesanan
- Status Pesanan
- Profit Status (Confirmed / Expected)
- Tanggal
- Produk (IDPRODUK)
- Net Payout (actual / estimated)
- HPP
- **Profit**
- **Margin %**

**Color Coding:**
- 🟢 Hijau: Confirmed (Status "Selesai")
- 🟡 Kuning: Expected (Status Pending)

**Filter Options:**
- Date range
- Status Pesanan (multi-select)
- Profit Status (Confirmed / Expected / Both)
- Produk (IDPRODUK)
- Margin % range

---

## Validation & Quality Check

### Expected Data Consistency

**Order.all (825 orders) vs Income Penghasilan:**
- Income should have ~649 rows (confirmed orders only)
- Pending orders (176) will NOT be in Income yet
- Missing in Income = Expected, not an error

**Order.all (825 orders) vs master.xlsx:**
- All 825 orders should have SKU mapping to master
- If SKU not found → flag as "Missing HPP"
- Show warning in dashboard

**Balance Report vs Income Penghasilan:**
- Balance entries should match Income rows (~649)
- Used for validation, not calculation
- Net Payout: Income is source of truth

---

## Edge Cases & Handling

### Case 1: Order Status Change Mid-Period

**Scenario:** Order starts as "Sedang Dikirim", becomes "Selesai" during analysis

**Handling:**
- Use snapshot date (Order.all export date)
- Real-time dashboard: re-import daily to get latest status
- Historical analysis: lock to specific export date

---

### Case 2: Missing HPP in master.xlsx

**Scenario:** SKU dari Order.all tidak ada di master.xlsx

**Handling:**
- Flag order as "Missing HPP"
- Exclude from profit calculation
- Show in separate "Data Quality Issues" section
- Alert user to add SKU to master

---

### Case 3: Negative Net Payout (Return Cases)

**Scenario:** Order completed but Net Payout is negative (full refund)

**Handling:**
- Should be caught by filter (Status Pembatalan ≠ empty)
- If slips through: show negative profit (reality)
- Flag in dashboard: "⚠️ Negative Profit - Review"

---

### Case 4: Very High/Low Margin (Outliers)

**Scenario:** Margin > 50% or Margin < 5%

**Handling:**
- Show in dashboard (valid data)
- Flag for review: "⚠️ Unusual Margin"
- Possible causes:
  - Wrong HPP in master
  - Heavy discount/promo
  - Wrong SKU mapping

---

## Assumptions & Limitations

### Assumptions for Expected Profit

**1. Average Fee % stays consistent:**
- Calculated from confirmed orders (Status "Selesai")
- Applied to pending orders
- **Risk:** Fee could vary by order value, promo, etc.

**2. Pending orders will complete:**
- Assume "Sedang Dikirim" → "Selesai" eventually
- **Risk:** Could be cancelled, returned, or failed
- **Mitigation:** Historical success rate analysis (Phase 2)

**3. No major fee changes mid-period:**
- Shopee doesn't change fee structure suddenly
- **Risk:** New promo/campaign could affect fees
- **Mitigation:** Recalculate avg fee % regularly

---

### Limitations

**1. Cannot predict exact Net Payout for pending orders:**
- Each order has unique fees (promo, voucher, shipping subsidy)
- Average fee % is approximation only
- **Accuracy:** Estimated ±10-20% variance

**2. Cannot predict cancellation/return for pending orders:**
- "Sedang Dikirim" could become "Batal" (failed delivery)
- "Telah Dikirim" could become return/refund
- **Impact:** Overestimate profit if many fail

**3. Ads attribution not per-order:**
- Ad Spend allocated evenly across all orders
- Cannot tell which orders came from ads
- **Impact:** ROI is aggregate, not per-campaign
- **Enhancement:** Require AdWords CSV with campaign detail (Phase 2)

---

## Version History

**v1.0 (2026-08-06):**
- Initial filter logic defined
- 4 status include, 2 status exclude
- Dynamic filter for return/cancel
- 825 orders for estimation (sample period)

---

## Related Documentation

- `README.md` - Project overview & HPP mapping logic
- `BUSINESS_LOGIC.md` - Order status flows & financial formula
- `VALIDATION_RESULTS.md` - Cross-reference validation samples
- `INCOME_ANALYSIS.md` - Income Penghasilan structure
- `DASHBOARD_POTENTIALS.md` - Dashboard features & roadmap
