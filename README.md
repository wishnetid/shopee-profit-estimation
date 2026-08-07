# Shopee Profit Estimation — Documentation

**Last Updated:** 2026-08-07  
**Production URL:** https://webappumber-five.vercel.app  
**GitHub:** https://github.com/wishnetid/shopee-profit-estimation

---

## 1. Database Info

```
Host:     103.136.19.30
Port:     3306
Database: supplie3_shopee_profit_estimation
User:     supplie3_shopee_profit_estimation
Password: Persib1933
```

---

## 2. Tables

### order_all
Order details — 1 row per item (multi-item orders = multiple rows).

| Column | Type | Note |
|---|---|---|
| id | INT AUTO_INCREMENT | PK |
| no_pesanan | VARCHAR(50) NOT NULL | Order number |
| status_pesanan | VARCHAR(50) | Selesai/Batal/Sedang Dikirim/Telah Dikirim/Perlu Dikirim/Belum Bayar |
| alasan_pembatalan | TEXT | Cancel reason (only for Batal) |
| status_pembatalan_pengembalian | VARCHAR(100) | Return status (e.g. Permintaan Disetujui, Sedang Dikembalikan) |
| no_resi | VARCHAR(100) | Tracking number |
| nama_produk | TEXT | Product name |
| nomor_referensi_sku | VARCHAR(100) | SKU reference (base SKU) |
| sku_induk | VARCHAR(100) | Parent SKU |
| nama_variasi | VARCHAR(255) | Variation (format: "Warna,Size") |
| harga_awal | DECIMAL(15,2) | Original price |
| harga_setelah_diskon | DECIMAL(15,2) | Price after discount |
| jumlah | INT | Quantity |
| returned_quantity | INT | Returned quantity |
| subtotal_pesanan | DECIMAL(15,2) | Order subtotal |
| total_diskon | DECIMAL(15,2) | Total discount |
| diskon_dari_penjual | DECIMAL(15,2) | Seller discount |
| diskon_dari_shopee | DECIMAL(15,2) | Shopee discount |
| berat_produk | VARCHAR(50) | Product weight (e.g. "333 gr") |
| jumlah_produk_di_pesan | INT | Items ordered |
| total_berat | VARCHAR(50) | Total weight |
| voucher_ditanggung_penjual | DECIMAL(15,2) | Seller voucher |
| cashback_koin | DECIMAL(15,2) | Coin cashback |
| voucher_ditanggung_shopee | DECIMAL(15,2) | Shopee voucher |
| paket_diskon | VARCHAR(10) | Discount package flag |
| paket_diskon_shopee | DECIMAL(15,2) | Shopee package discount |
| paket_diskon_penjual | DECIMAL(15,2) | Seller package discount |
| potongan_koin_shopee | DECIMAL(15,2) | Shopee coin deduction |
| diskon_kartu_kredit | DECIMAL(15,2) | Credit card discount |
| opsi_pengiriman | VARCHAR(100) | Shipping option |
| antar_ke_counter | VARCHAR(50) | Counter delivery |
| pesanan_harus_dikirim_sebelum | DATETIME | Shipping deadline |
| waktu_pengiriman_diatur | DATETIME | Scheduled shipping |
| ongkos_kirim_dibayar_pembeli | DECIMAL(15,2) | Shipping paid by buyer |
| estimasi_potongan_biaya_pengiriman | DECIMAL(15,2) | Estimated shipping cost deduction |
| ongkos_kirim_pengembalian_barang | DECIMAL(15,2) | Return shipping cost |
| perkiraan_ongkos_kirim | DECIMAL(15,2) | Estimated shipping |
| catatan_dari_pembeli | TEXT | Buyer notes |
| catatan | TEXT | Notes |
| total_pembayaran | DECIMAL(15,2) | Total payment |
| waktu_pesanan_dibuat | DATETIME | Order created |
| waktu_pembayaran_dilakukan | DATETIME | Payment time |
| tipe_pesanan | VARCHAR(50) | Order type |
| waktu_pesanan_selesai | DATETIME | Order completed |
| username_pembeli | VARCHAR(100) | Buyer username |
| nama_penerima | VARCHAR(200) | Receiver name |
| no_telepon | VARCHAR(50) | Phone number |
| alamat_pengiriman | TEXT | Shipping address |
| kota_kabupaten | VARCHAR(100) | City/Regency |
| provinsi | VARCHAR(100) | Province |
| metode_pembayaran | VARCHAR(100) | Payment method |
| created_at | TIMESTAMP | Auto |
| updated_at | TIMESTAMP | Auto |

**UNIQUE KEY:** `(no_pesanan, nomor_referensi_sku, nama_variasi)` — composite key for dedup

### income_penghasilan
Fee breakdown per order.

| Column | Type |
|---|---|
| id | INT AUTO_INCREMENT |
| no_pesanan | VARCHAR(50) |
| lihat_berdasarkan | VARCHAR(20) |
| waktu_pesanan_dibuat | DATETIME |
| tanggal_dana_dilepaskan | DATETIME |
| harga_produk | DECIMAL(15,2) |
| ongkir_dibayar_pembeli | DECIMAL(15,2) |
| ongkos_kirim_ke_jasa_kirim | DECIMAL(15,2) |
| gratis_ongkir_dari_shopee | DECIMAL(15,2) |
| biaya_administrasi | DECIMAL(15,2) |
| biaya_proses_pesanan | DECIMAL(15,2) |
| biaya_gratis_ongkir_xtra | DECIMAL(15,2) |
| biaya_layanan_promo_xtra | DECIMAL(15,2) |
| biaya_lainnya | DECIMAL(15,2) |
| jumlah_dibayar_pembeli | DECIMAL(15,2) |
| metode_pembayaran_pembeli | VARCHAR(100) |
| username_pembeli | VARCHAR(100) |

**Filter:** Only import rows where `lihat_berdasarkan = 'Order'`

### master_products
HPP reference — SKU → price mapping.

| Column | Type |
|---|---|
| id | INT AUTO_INCREMENT |
| sku1 | VARCHAR(100) |
| sku2 | VARCHAR(100) |
| harga | DECIMAL(15,2) |
| idproduk | VARCHAR(100) |

---

## 3. Upload Flow

### Step 1: Select File
User drags & drops or picks a file (.xlsx, .xls, .csv).

### Step 2: Preview (with DB comparison)
API parses Excel → queries DB → returns:
- **Baru:** rows not in DB → will be INSERT
- **Update:** rows in DB with changes → will be UPDATE
- **Duplikat:** rows in DB identical → will be SKIP
- **Total:** all rows in file

Plus:
- **Diff table:** shows exactly which 4 columns changed per row:
  - No. Resi
  - Status Pesanan
  - Alasan Pembatalan
  - Status Pembatalan/Pengembalian
- **Regression detection:** flags rows where status would go backward or resi would be deleted

### Step 3: Import
User clicks "Import" → API applies guards → inserts/updates DB.

### Step 4: Result
Shows: new rows, updated rows, blocked regressions, errors.

---

## 4. Regression Guards

### Status Progression Guard
Status can only move FORWARD, never backward.

```
Belum Bayar → Perlu Dikirim → Sedang Dikirim → Telah Dikirim → Selesai
                                                                     ↓
                                                                   Batal
```

**BLOCKED examples:**
- `Selesai → Belum Bayar` ❌
- `Telah Dikirim → Perlu Dikirim` ❌
- `Sedang Dikirim → Perlu Dikirim` ❌

**ALLOWED examples:**
- `Perlu Dikirim → Sedang Dikirim` ✅
- `Telah Dikirim → Selesai` ✅
- `Sedang Dikirim → Batal` ✅
- `Selesai + Permintaan Disetujui` ✅ (return info, not regression)
- `Selesai + Sedang Dikembalikan` ✅ (return info, not regression)

### Resi Guard
If DB already has a tracking number, it CANNOT be deleted.

**BLOCKED:**
- `SPXID068... → (kosong)` ❌

**ALLOWED:**
- `(kosong) → SPXID068...` ✅ (new resi)
- `SPXID068... → SPXID099...` ✅ (resi change, same order)

### Free Columns (no guard)
These columns can be updated freely:
- `alasan_pembatalan`
- `status_pembatalan_pengembalian`
- All other columns except `status_pesanan` and `no_resi`

---

## 5. Duplicate Handling

### Composite Unique Key
`(no_pesanan, nomor_referensi_sku, nama_variasi)` — exactly identifies 1 row.

**Why not just `no_pesanan`?**
- 1 order can have multiple items (multi-item orders)
- Example: Order `260610QCJS4F4M` has 5 items = 5 rows with same `no_pesanan`
- Each item has different `nomor_referensi_sku` and/or `nama_variasi`

**Why not `no_pesanan + nomor_referensi_sku`?**
- Same SKU base can have multiple variations (e.g. "M-TAC Pendek" with "Hitam,M" and "Hitam,L")
- 104 duplicate combos found when testing this

**Valid:** `no_pesanan + nomor_referensi_sku + nama_variasi` = 1108 unique, 0 duplicates ✅

### Upload Dedup
`INSERT ... ON DUPLICATE KEY UPDATE` — if same composite key exists, update all columns.

---

## 6. Auto-Detection

| Report | Detection | Sheet | Columns |
|---|---|---|---|
| Order.all | Sheet "orders" + 50+ columns | orders | 50 |
| Income | Sheet name contains "penghasilan" | Penghasilan | 16 (filtered) |
| Master SKU | Has columns "sku1" + "harga" | varies | 4 |

---

## 7. File Structure

```
shopee_profit_estimation/
├── .git/
├── .gitignore
├── .venv/
├── data_sample/                    # Excel files + guides
│   ├── Order.all.*.xlsx
│   ├── Income.*.xlsx
│   ├── master.xlsx
│   └── guide/
│       └── HPP-MAPPING-LOGIC.txt   # HPP calculation logic
│
└── webapp/                         # Next.js 15 app
    ├── app/
    │   ├── layout.tsx              # Root layout + Sidebar
    │   ├── page.tsx                # Homepage (dashboard)
    │   ├── upload/page.tsx         # Upload with preview
    │   ├── orders/page.tsx         # Order list
    │   ├── income/page.tsx         # Income list
    │   ├── sku/page.tsx            # SKU master list
    │   ├── profit/page.tsx         # Profit analysis
    │   ├── settings/page.tsx       # DB management
    │   └── api/
    │       ├── upload/route.ts     # Preview + Import
    │       ├── orders/route.ts     # GET orders
    │       ├── income/route.ts     # GET income
    │       ├── sku/route.ts        # GET SKU
    │       └── settings/database/route.ts
    ├── components/
    │   └── DataTable.tsx           # Reusable table
    ├── database/
    │   └── schema.sql              # DB schema
    └── lib/
        ├── db.ts                   # MySQL pool
        └── types.ts                # TypeScript types
```

---

## 8. Tech Stack

| Component | Tech |
|---|---|
| Framework | Next.js 15 (App Router) |
| Styling | Tailwind CSS v4 |
| Database | MySQL (cPanel remote) |
| File Parsing | xlsx (SheetJS) |
| Icons | lucide-react |
| Deployment | Vercel (auto-deploy on push) |
| Language | TypeScript |

---

## 9. Deploy

```bash
git add .
git commit -m "your message"
git push
```

Vercel auto-deploys from `master` branch. Production: https://webappumber-five.vercel.app

---

## 10. Data Insights (from 5 Order.all files)

| File | Rows | In-Progress | Terminal |
|---|---|---|---|
| 0601_0630 (Juni) | 1108 | ❌ | ✅ |
| 0701_0731 (Juli) | 1093 | ✅ | ✅ |
| 0707_0806 (Jul-Agu) | 1023 | ✅ | ✅ |
| 0708_0807 (Jul-Agu) | 1037 | ✅ | ✅ |
| 0801_0806 (Agu) | 174 | ✅ | ✅ |

**Key findings:**
- Status ALWAYS progresses forward (0 regressions in real data)
- Resi ALWAYS increases (null → has resi, never the reverse)
- 1 order can have 1-5+ items (multi-item orders)
- `Status Pembatalan/Pengembalian` is additional info (not a regression indicator)
