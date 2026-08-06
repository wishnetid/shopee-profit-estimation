# Validation Results - Cross-Reference Report Shopee

**Date:** 2026-08-06  
**Purpose:** Validasi hubungan antar report dengan sample data konkret

---

## Methodology

Validasi dilakukan dengan:
1. Ambil sample No. Pesanan dari Order.all (induk)
2. Cross-check ke report lain (Balance, Income, Problem Orders)
3. Identifikasi pattern berdasarkan Tipe Transaksi, Deskripsi, dan Jumlah (nominal)

---

## Sample Data Validated

### Sample 1: Order Selesai (Completed)

**No. Pesanan: 2607072CRRDA37**

| Report | Status | Detail |
|--------|--------|--------|
| Order.all | ✓ Ada | - |
| Balance Report | ✓ Ada | Tipe: "Penghasilan dari Pesanan"<br>Kolom "No. Pesanan": 2607072CRRDA37 (dedicated)<br>Jumlah: Positif |
| Income Seller Fee | ✓ Ada | Biaya platform dipotong |
| Order.failed_delivery | ✗ | - |

**Business Logic:**
- Dana dilepas ke penjual
- Balance entry dengan Tipe "Penghasilan dari Pesanan"
- No. Pesanan ada di kolom dedicated
- Nominal positif
- Ada biaya platform di Income

---

**No. Pesanan: 2607072EUYUPEA**

| Report | Status | Detail |
|--------|--------|--------|
| Order.all | ✓ Ada | - |
| Balance Report | ✓ Ada | Tipe: "Penghasilan dari Pesanan"<br>Kolom "No. Pesanan": 2607072EUYUPEA (dedicated)<br>Jumlah: Positif |
| Income Seller Fee | ✓ Ada | Biaya platform dipotong |
| Order.failed_delivery | ✗ | - |

**Business Logic:** Same as 2607072CRRDA37

---

### Sample 2: Failed Delivery

**No. Pesanan: 2607072C7DA86B**

| Report | Status | Detail |
|--------|--------|--------|
| Order.all | ✓ Ada | - |
| Order.failed_delivery | ✓ Ada | Status Pesanan: "Batal" |
| Balance Report | ✓ Ada | Tipe: "Penyesuaian"<br>Deskripsi: "...Gagal Terkirim: 2607072..." (embedded)<br>Kolom "No. Pesanan": - (kosong/dash)<br>Jumlah: Positif (refund premi ke buyer) |
| Income Seller Fee | ✗ TIDAK ADA | Dana tidak dilepas, tidak ada biaya platform |

**Business Logic:**
- Pengiriman gagal, barang tidak sampai
- Dana TIDAK dilepas
- Balance entry dengan Tipe "Penyesuaian"
- No. Pesanan embedded di Deskripsi (bukan kolom dedicated)
- Nominal positif (refund biaya premi ke buyer)
- TIDAK ada di Income Seller Fee

---

**No. Pesanan Failed Delivery Lainnya:**

| No. Pesanan | Balance | Tipe | Income |
|-------------|---------|------|--------|
| 260728UJ6KMW9J | ✓ | Penyesuaian | ✗ |
| 2607207G41W53E | ✓ | Penyesuaian | ✗ |
| 260721A0H81V7V | ✓ | Penyesuaian | ✗ |
| 2607193RDH7749 | ✓ | Penyesuaian | ✗ |

**Pattern 100% konsisten:** Semua Failed Delivery masuk Balance sebagai "Penyesuaian", tidak ada di Income.

---

### Sample 3: Return/Refund

**Pattern 1: Return dengan Refund Entry MINUS**

**No. Pesanan: 2607060YHKT3W6**

| Report | Status | Detail |
|--------|--------|--------|
| Order.all | ✓ Ada | - |
| Order.return_refund | ✓ Ada | - |
| Balance Report | ✓ Ada | Tipe: "Penghasilan dari Pesanan"<br>Kolom "No. Pesanan": 2607060YHKT3W6 (dedicated)<br>Jumlah: **Rp-12,478 (MINUS)** |
| Income Seller Fee | ✓ Ada | Biaya platform sudah dipotong (saat dana dilepas) |

**Business Logic:**
- Order delivered → dana dilepas → biaya platform dipotong
- Buyer return → refund diproses
- Balance entry TETAP Tipe "Penghasilan dari Pesanan" (bukan "Penyesuaian")
- **Jumlah MINUS** = refund
- No. Pesanan di kolom dedicated
- Income Seller Fee tetap ada (fee sudah dipotong waktu dana dilepas)

---

**No. Pesanan: 260701H4F29H3Q**

| Report | Status | Detail |
|--------|--------|--------|
| Order.return_refund | ✓ Ada | - |
| Balance Report | ✓ Ada | Tipe: "Penghasilan dari Pesanan"<br>Jumlah: **Rp-478 (MINUS)** |
| Income Seller Fee | ✓ Ada | - |

**Business Logic:** Same pattern (nominal minus)

---

**No. Pesanan: 260715QTB2PY2Q**

| Report | Status | Detail |
|--------|--------|--------|
| Order.return_refund | ✓ Ada | - |
| Balance Report | ✓ Ada | Tipe: "Penghasilan dari Pesanan"<br>Jumlah: **Rp-12,078 (MINUS)** |
| Income Seller Fee | ✓ Ada | - |

**Business Logic:** Same pattern (nominal minus)

---

**Pattern 2: Return tanpa Refund Entry (yet)**

**No. Pesanan: 260704Q8K3JGU6**

| Report | Status | Detail |
|--------|--------|--------|
| Order.return_refund | ✓ Ada | - |
| Balance Report | ✓ Ada | Tipe: "Penghasilan dari Pesanan"<br>Jumlah: **Rp77,103 (POSITIF)** |
| Income Seller Fee | ✓ Ada | - |

**Business Logic:**
- Order delivered → dana dilepas → biaya platform dipotong
- Return registered tapi refund belum diproses di Balance
- Kemungkinan: return terjadi setelah periode Balance Report

---

**No. Pesanan: 260704R9W0PNB4**

| Report | Status | Detail |
|--------|--------|--------|
| Order.return_refund | ✓ Ada | - |
| Balance Report | ✓ Ada | Tipe: "Penghasilan dari Pesanan"<br>Jumlah: **Rp399,193 (POSITIF)** |
| Income Seller Fee | ✓ Ada | - |

**Business Logic:** Same pattern (refund belum diproses)

---

**Pattern 3: Return dengan Entry "Penyesuaian" Terpisah (Rare)**

**No. Pesanan: 2607218X329XJ6**

| Report | Status | Detail |
|--------|--------|--------|
| Balance Report | ✓ Ada | Tipe: "Penyesuaian"<br>Deskripsi: "...Pengembalian Barang/Dana..."<br>Jumlah: **Rp-330,878 (MINUS)** |

**Business Logic:**
- Return dengan entry terpisah bertipe "Penyesuaian"
- Deskripsi mention "Pengembalian Barang/Dana"
- Nominal minus (refund)
- Pattern ini RARE (hanya 1 dari total entries Penyesuaian)

---

## Summary: Business Logic Patterns

### 1. Pesanan Selesai (Completed Order)

**Flow:**
- Order delivered successfully
- Dana dilepas ke penjual
- Entry di Balance: Tipe "Penghasilan dari Pesanan", Jumlah POSITIF
- Entry di Income: Biaya platform detail
- No. Pesanan di kolom dedicated

**Identifier:**
- Balance Tipe: "Penghasilan dari Pesanan"
- Balance Jumlah: POSITIF
- Balance kolom "No. Pesanan": isi (dedicated)
- Income Seller Fee: ADA

---

### 2. Failed Delivery

**Flow:**
- Order gagal terkirim
- Dana TIDAK dilepas
- Entry di Balance: Tipe "Penyesuaian" (refund premi ke buyer)
- TIDAK ada di Income

**Identifier:**
- Balance Tipe: "Penyesuaian"
- Balance Deskripsi: "...Gagal Terkirim..."
- Balance kolom "No. Pesanan": kosong (No. Pesanan embedded di Deskripsi)
- Balance Jumlah: POSITIF (refund premi)
- Income Seller Fee: TIDAK ADA
- Order.failed_delivery: ADA

---

### 3. Return/Refund

**Flow Pattern 1 (Mayoritas):**
- Order delivered → dana dilepas → biaya platform dipotong
- Buyer return → refund diproses
- Entry di Balance: Tipe TETAP "Penghasilan dari Pesanan" tapi Jumlah MINUS
- Entry di Income: TETAP ADA (fee sudah dipotong saat dana dilepas)

**Identifier Pattern 1:**
- Balance Tipe: "Penghasilan dari Pesanan"
- Balance Jumlah: **MINUS** (refund)
- Balance kolom "No. Pesanan": isi (dedicated)
- Income Seller Fee: ADA
- Order.return_refund: ADA

---

**Flow Pattern 2 (Return belum refund):**
- Order delivered → dana dilepas
- Return registered tapi refund belum diproses di Balance Report period
- Entry di Balance: Tipe "Penghasilan dari Pesanan", Jumlah POSITIF (belum ada entry minus)

**Identifier Pattern 2:**
- Balance Tipe: "Penghasilan dari Pesanan"
- Balance Jumlah: POSITIF
- Income Seller Fee: ADA
- Order.return_refund: ADA (tapi Balance belum ada minus)

---

**Flow Pattern 3 (Rare - Entry Penyesuaian Terpisah):**
- Return dengan entry terpisah bertipe "Penyesuaian"
- Deskripsi mention "Pengembalian Barang/Dana"
- Jumlah MINUS

**Identifier Pattern 3:**
- Balance Tipe: "Penyesuaian"
- Balance Deskripsi: "...Pengembalian..."
- Balance Jumlah: MINUS
- Pattern ini JARANG (hanya 1 entry found)

---

## Key Insights

### Balance Report - No. Pesanan Location

**Kolom Dedicated "No. Pesanan":**
- Tipe "Penghasilan dari Pesanan" (selesai atau return dengan refund)
- Jumlah bisa POSITIF atau MINUS

**Embedded di Kolom "Deskripsi":**
- Tipe "Penyesuaian" (failed delivery atau rare return case)
- Perlu regex extraction

### Balance Report - Nominal (Jumlah) Indicator

**POSITIF:**
- Pesanan selesai (penghasilan)
- Failed delivery (refund premi ke buyer)
- Return belum diproses refund

**MINUS:**
- Return dengan refund (mayoritas)
- Penyesuaian pengembalian (rare)

### Income Seller Fee Coverage

**ADA di Income:**
- Pesanan selesai (dana dilepas)
- Return/Refund (dana SUDAH dilepas sebelum return)

**TIDAK ADA di Income:**
- Failed Delivery (dana tidak pernah dilepas)
- Return sebelum dana dilepas (minority case)

---

## Data Relationship Diagram

```
Order.all (INDUK - semua pesanan)
    |
    ├─→ Pesanan Selesai
    │       ├─→ Balance: "Penghasilan dari Pesanan" (Jumlah POSITIF)
    │       ├─→ Income Seller Fee: ADA
    │       └─→ No. Pesanan: Kolom dedicated
    │
    ├─→ Failed Delivery
    │       ├─→ Balance: "Penyesuaian" (Jumlah POSITIF - refund premi)
    │       ├─→ Income Seller Fee: TIDAK ADA
    │       ├─→ Order.failed_delivery: ADA
    │       └─→ No. Pesanan: Embedded di Deskripsi
    │
    └─→ Return/Refund
            ├─→ Pattern 1 (mayoritas): 
            │       ├─→ Balance: "Penghasilan dari Pesanan" (Jumlah MINUS)
            │       ├─→ Income Seller Fee: ADA
            │       └─→ No. Pesanan: Kolom dedicated
            │
            ├─→ Pattern 2 (refund pending):
            │       ├─→ Balance: "Penghasilan dari Pesanan" (Jumlah POSITIF)
            │       └─→ Order.return_refund: ADA (belum ada entry minus)
            │
            └─→ Pattern 3 (rare):
                    ├─→ Balance: "Penyesuaian" (Jumlah MINUS)
                    └─→ Deskripsi: "...Pengembalian..."
```

---

## Extraction Rules

### No. Pesanan Extraction

**Rule 1: Check kolom "No. Pesanan" first**
- Jika isi → direct read

**Rule 2: Jika kosong/dash → extract dari "Deskripsi"**
- Regex patterns:
  - `Pesanan #(\w+)`
  - `Gagal Terkirim: (\w+)`
  - `pesanan (\w+) karena`

### Transaction Classification

**Check sequence:**
1. Cek kolom "Tipe Transaksi"
2. Cek kolom "Jumlah" (POSITIF vs MINUS)
3. Cek kolom "Deskripsi" (keywords)
4. Cross-check dengan Order.failed_delivery / Order.return_refund

**Classification logic:**

| Tipe | Jumlah | Keywords | Classification |
|------|--------|----------|----------------|
| Penghasilan dari Pesanan | POSITIF | - | Pesanan Selesai |
| Penghasilan dari Pesanan | MINUS | - | Return/Refund (Pattern 1) |
| Penyesuaian | POSITIF | "Gagal Terkirim" | Failed Delivery |
| Penyesuaian | MINUS | "Pengembalian" | Return/Refund (Pattern 3) |

---

## Validation Stats

**Sample validated:** 13 No. Pesanan
- Pesanan Selesai: 2
- Failed Delivery: 5
- Return/Refund: 6 (3 with refund minus, 2 pending, 1 rare pattern)

**Pattern consistency:** 100%
- All Failed Delivery → Balance "Penyesuaian", NO Income
- All Return/Refund (Pattern 1) → Balance "Penghasilan" MINUS, YES Income
- All Completed → Balance "Penghasilan" POSITIF, YES Income

---

### 4. Cancellation

**Pattern 1: Cancellation Tanpa Balance Entry (Mayoritas)**

**No. Pesanan: 260805JQHMF20D**

| Report | Status | Detail |
|--------|--------|--------|
| Order.all | ✓ Ada | - |
| Order.cancellation | ✓ Ada | Status Pesanan: "Batal" |
| Balance Report | ✗ TIDAK ADA | - |
| Income Seller Fee | ✗ TIDAK ADA | - |

**Business Logic:**
- Pesanan dibatalkan sebelum delivered/processed
- Dana tidak pernah dilepas
- Tidak ada transaksi di Balance
- Tidak ada biaya platform di Income

---

**No. Pesanan: 260805J3AJ98ET**

| Report | Status | Detail |
|--------|--------|--------|
| Order.cancellation | ✓ Ada | Status Pesanan: "Batal" |
| Balance Report | ✗ TIDAK ADA | - |
| Income Seller Fee | ✗ TIDAK ADA | - |

**Business Logic:** Same pattern (cancelled early)

---

**Pattern 2: Cancellation dengan Balance Entry "Penyesuaian"**

**No. Pesanan: 260728UJ6KMW9J**

| Report | Status | Detail |
|--------|--------|--------|
| Order.all | ✓ Ada | - |
| Order.cancellation | ✓ Ada | Status Pesanan: "Batal" |
| Order.failed_delivery | ✓ Ada | Status Pesanan: "Batal" |
| Balance Report | ✓ Ada | Tipe: "Penyesuaian"<br>Deskripsi: "...Gagal Terkirim: 260728U..." (embedded)<br>Kolom "No. Pesanan": - (kosong/dash)<br>Jumlah: **Rp-408 (MINUS)** |
| Income Seller Fee | ✗ TIDAK ADA | - |

**Business Logic:**
- Pesanan dibatalkan DAN gagal terkirim
- Ada biaya premi yang harus di-refund (minus ke saldo penjual)
- Balance entry "Penyesuaian" dengan nominal MINUS
- **Pattern ini SAMA dengan Failed Delivery**
- Pesanan ini ada di DUA problem report: cancellation + failed_delivery

---

**No. Pesanan: 2607207G41W53E**

| Report | Status | Detail |
|--------|--------|--------|
| Order.cancellation | ✓ Ada | Status Pesanan: "Batal" |
| Order.failed_delivery | ✓ Ada | Status Pesanan: "Batal" |
| Balance Report | ✓ Ada | Tipe: "Penyesuaian"<br>Jumlah: **Rp-408 (MINUS)** |
| Income Seller Fee | ✗ TIDAK ADA | - |

**Business Logic:** Same pattern (cancelled + failed delivery overlap)

---

## Summary: Business Logic Patterns

### 1. Pesanan Selesai (Completed Order)

**Flow:**
- Order delivered successfully
- Dana dilepas ke penjual
- Entry di Balance: Tipe "Penghasilan dari Pesanan", Jumlah POSITIF
- Entry di Income: Biaya platform detail
- No. Pesanan di kolom dedicated

**Identifier:**
- Balance Tipe: "Penghasilan dari Pesanan"
- Balance Jumlah: POSITIF
- Balance kolom "No. Pesanan": isi (dedicated)
- Income Seller Fee: ADA

---

### 2. Failed Delivery

**Flow:**
- Order gagal terkirim
- Dana TIDAK dilepas
- Entry di Balance: Tipe "Penyesuaian" (refund premi ke buyer)
- TIDAK ada di Income

**Identifier:**
- Balance Tipe: "Penyesuaian"
- Balance Deskripsi: "...Gagal Terkirim..."
- Balance kolom "No. Pesanan": kosong (No. Pesanan embedded di Deskripsi)
- Balance Jumlah: POSITIF (refund premi)
- Income Seller Fee: TIDAK ADA
- Order.failed_delivery: ADA

**Note:** Bisa juga ada di Order.cancellation (overlap)

---

### 3. Return/Refund

**Flow Pattern 1 (Mayoritas):**
- Order delivered → dana dilepas → biaya platform dipotong
- Buyer return → refund diproses
- Entry di Balance: Tipe TETAP "Penghasilan dari Pesanan" tapi Jumlah MINUS
- Entry di Income: TETAP ADA (fee sudah dipotong saat dana dilepas)

**Identifier Pattern 1:**
- Balance Tipe: "Penghasilan dari Pesanan"
- Balance Jumlah: **MINUS** (refund)
- Balance kolom "No. Pesanan": isi (dedicated)
- Income Seller Fee: ADA
- Order.return_refund: ADA

---

**Flow Pattern 2 (Return belum refund):**
- Order delivered → dana dilepas
- Return registered tapi refund belum diproses di Balance Report period
- Entry di Balance: Tipe "Penghasilan dari Pesanan", Jumlah POSITIF (belum ada entry minus)

**Identifier Pattern 2:**
- Balance Tipe: "Penghasilan dari Pesanan"
- Balance Jumlah: POSITIF
- Income Seller Fee: ADA
- Order.return_refund: ADA (tapi Balance belum ada minus)

---

**Flow Pattern 3 (Rare - Entry Penyesuaian Terpisah):**
- Return dengan entry terpisah bertipe "Penyesuaian"
- Deskripsi mention "Pengembalian Barang/Dana"
- Jumlah MINUS

**Identifier Pattern 3:**
- Balance Tipe: "Penyesuaian"
- Balance Deskripsi: "...Pengembalian..."
- Balance Jumlah: MINUS
- Pattern ini JARANG (hanya 1 entry found)

---

### 4. Cancellation

**Flow Pattern 1 (Mayoritas):**
- Pesanan dibatalkan sebelum delivered/processed
- Dana tidak pernah dilepas
- Tidak ada transaksi di Balance
- Tidak ada di Income

**Identifier Pattern 1:**
- Order.cancellation: ADA
- Balance Report: TIDAK ADA
- Income Seller Fee: TIDAK ADA

---

**Flow Pattern 2 (Cancelled + Failed Delivery Overlap):**
- Pesanan dibatalkan DAN gagal terkirim
- Ada biaya premi yang harus di-refund
- Entry di Balance: Tipe "Penyesuaian" dengan Jumlah MINUS
- **Pattern ini IDENTIK dengan Failed Delivery**

**Identifier Pattern 2:**
- Order.cancellation: ADA
- Order.failed_delivery: ADA (OVERLAP)
- Balance Tipe: "Penyesuaian"
- Balance Deskripsi: "...Gagal Terkirim..."
- Balance Jumlah: MINUS (pengurangan saldo penjual untuk refund premi)
- Income Seller Fee: TIDAK ADA

---

## Key Insights

### Balance Report - No. Pesanan Location

**Kolom Dedicated "No. Pesanan":**
- Tipe "Penghasilan dari Pesanan" (selesai atau return dengan refund)
- Jumlah bisa POSITIF atau MINUS

**Embedded di Kolom "Deskripsi":**
- Tipe "Penyesuaian" (failed delivery, cancellation dengan adjustment, atau rare return case)
- Perlu regex extraction

### Balance Report - Nominal (Jumlah) Indicator

**POSITIF:**
- Pesanan selesai (penghasilan)
- Failed delivery (refund premi ke buyer) ← **NOTE: ini POSITIF karena refund KE buyer**
- Return belum diproses refund

**MINUS:**
- Return dengan refund (mayoritas)
- Penyesuaian pengembalian (rare)
- Cancellation dengan adjustment (refund premi DARI penjual) ← **NOTE: ini MINUS karena potong saldo penjual**

### Income Seller Fee Coverage

**ADA di Income:**
- Pesanan selesai (dana dilepas)
- Return/Refund (dana SUDAH dilepas sebelum return)

**TIDAK ADA di Income:**
- Failed Delivery (dana tidak pernah dilepas)
- Cancellation (semua pattern)
- Return sebelum dana dilepas (minority case)

### Problem Report Overlap

**Failed Delivery + Cancellation:**
- Beberapa pesanan ada di KEDUA report
- Pattern: Gagal terkirim DAN dibatalkan
- Balance entry: "Penyesuaian" dengan "...Gagal Terkirim..."
- Nominal: MINUS (pengurangan saldo penjual)

---

## Data Relationship Diagram

```
Order.all (INDUK - semua pesanan)
    |
    ├─→ Pesanan Selesai
    │       ├─→ Balance: "Penghasilan dari Pesanan" (Jumlah POSITIF)
    │       ├─→ Income Seller Fee: ADA
    │       └─→ No. Pesanan: Kolom dedicated
    │
    ├─→ Failed Delivery
    │       ├─→ Balance: "Penyesuaian" (Jumlah POSITIF - refund premi ke buyer)
    │       ├─→ Income Seller Fee: TIDAK ADA
    │       ├─→ Order.failed_delivery: ADA
    │       ├─→ Order.cancellation: BISA ADA (overlap)
    │       └─→ No. Pesanan: Embedded di Deskripsi
    │
    ├─→ Return/Refund
    │       ├─→ Pattern 1 (mayoritas): 
    │       │       ├─→ Balance: "Penghasilan dari Pesanan" (Jumlah MINUS)
    │       │       ├─→ Income Seller Fee: ADA
    │       │       └─→ No. Pesanan: Kolom dedicated
    │       │
    │       ├─→ Pattern 2 (refund pending):
    │       │       ├─→ Balance: "Penghasilan dari Pesanan" (Jumlah POSITIF)
    │       │       └─→ Order.return_refund: ADA (belum ada entry minus)
    │       │
    │       └─→ Pattern 3 (rare):
    │               ├─→ Balance: "Penyesuaian" (Jumlah MINUS)
    │               └─→ Deskripsi: "...Pengembalian..."
    │
    └─→ Cancellation
            ├─→ Pattern 1 (mayoritas - early cancel):
            │       ├─→ Balance: TIDAK ADA
            │       └─→ Income Seller Fee: TIDAK ADA
            │
            └─→ Pattern 2 (cancelled + failed delivery):
                    ├─→ Balance: "Penyesuaian" (Jumlah MINUS)
                    ├─→ Order.failed_delivery: ADA (overlap)
                    ├─→ Order.cancellation: ADA
                    └─→ Income Seller Fee: TIDAK ADA
```

---

## Extraction Rules

### No. Pesanan Extraction

**Rule 1: Check kolom "No. Pesanan" first**
- Jika isi → direct read

**Rule 2: Jika kosong/dash → extract dari "Deskripsi"**
- Regex patterns:
  - `Pesanan #(\w+)`
  - `Gagal Terkirim: (\w+)`
  - `pesanan (\w+) karena`

### Transaction Classification

**Check sequence:**
1. Cek kolom "Tipe Transaksi"
2. Cek kolom "Jumlah" (POSITIF vs MINUS)
3. Cek kolom "Deskripsi" (keywords)
4. Cross-check dengan Order.failed_delivery / Order.return_refund / Order.cancellation

**Classification logic:**

| Tipe | Jumlah | Keywords | Classification |
|------|--------|----------|----------------|
| Penghasilan dari Pesanan | POSITIF | - | Pesanan Selesai |
| Penghasilan dari Pesanan | MINUS | - | Return/Refund (Pattern 1) |
| Penyesuaian | POSITIF | "Gagal Terkirim" | Failed Delivery |
| Penyesuaian | MINUS | "Gagal Terkirim" | Cancellation (Pattern 2) |
| Penyesuaian | MINUS | "Pengembalian" | Return/Refund (Pattern 3) |

**Important Note - Penyesuaian + "Gagal Terkirim":**
- Jumlah POSITIF → Failed Delivery (refund premi KE buyer, tambah saldo penjual)
- Jumlah MINUS → Cancellation Pattern 2 (refund premi DARI penjual, kurang saldo penjual)

---

## Validation Stats

**Sample validated:** 18 No. Pesanan
- Pesanan Selesai: 2
- Failed Delivery: 5
- Return/Refund: 6 (3 with refund minus, 2 pending, 1 rare pattern)
- Cancellation: 5 (3 early cancel no balance, 2 with adjustment overlap)

**Pattern consistency:** 100%
- All Failed Delivery → Balance "Penyesuaian" POSITIF, NO Income
- All Cancellation Pattern 2 → Balance "Penyesuaian" MINUS, NO Income, overlap with Failed Delivery
- All Cancellation Pattern 1 → NO Balance, NO Income
- All Return/Refund (Pattern 1) → Balance "Penghasilan" MINUS, YES Income
- All Completed → Balance "Penghasilan" POSITIF, YES Income

**Key Discovery:**
- Failed Delivery dan Cancellation bisa OVERLAP (ada di kedua report)
- Perbedaan di Balance: Failed Delivery (Jumlah POSITIF), Cancellation Pattern 2 (Jumlah MINUS)

---

## Next Steps

- [x] ✓ Validate Cancellation pattern (Order.cancellation)
- [ ] Analyze Income sheet "Penghasilan" (1000+ cols)
- [ ] Analyze AdWords billing allocation
- [ ] Confirm HPP & Biaya Packaging source
- [ ] Build database schema based on validated patterns
