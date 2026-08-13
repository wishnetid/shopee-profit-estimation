# NEXTAGENTS — Shopee Profit Estimation

**Last updated:** 2026-08-13 WIB

**Production:** https://webapp-umber-five.vercel.app

**Repository:** `wishnetid/shopee-profit-estimation`

**Branch:** `master`

**Code release:** pending current estimation-logic release

**Last code verification deployment:** pending current estimation-logic release

> Mulai dengan membaca `README.md` penuh, lalu file ini. RAW Order.all, Income, Balance, order exceptions, Ads, dan Master SKU shared sudah live. **Estimasi Kotor** sudah live di `/profit`; Profit Aktual tetap disengaja terkunci. Jangan migration, import, clear, reset, atau hapus store tanpa diskusi/approval.

---

## 1. Handoff Operasional

### Production state saat dokumentasi diperbarui

```text
Store aktif
  TACTICALIZED

Data live
  Order.all current-state, Income package/child RAW,
  Balance, order exceptions, Ads, dan Master SKU sudah terimport.

Master SKU
  shared/global; tidak dimiliki store tertentu
```

> Jangan gunakan count atau package pada dokumen ini sebagai kebenaran saat ini. Untuk kondisi live terbaru, gunakan database read-only atau canonical production API dengan Basic Auth.

### Selesai dan live

- Multi-store **single-admin** dengan selector store global.
- `order_all` dan `income_report_imports` store-scoped.
- Income child RAW mewarisi scope melalui parent `income_report_imports`.
- Master SKU tetap shared/global.
- Orders, Income, Upload, Settings, dan Dashboard mengikuti store aktif.
- `clear_store` menghapus data operasional satu store saja.
- `clear_shared_sku` mereset Master SKU global dengan confirmation eksplisit.
- `DELETE /api/stores` menghapus store kosong dengan confirmation eksplisit.
- Basic Auth berlaku untuk page dan API.
- `/profit` live sebagai **Profit & Estimasi**: tab **Estimasi Kotor** manual-load dan tab **Profit Aktual** terkunci.
- `GET /api/profit-estimation` live, read-only, store-scoped. Ia menampilkan summary, daily aggregate, serta detail order paginated untuk monitoring Ads Spend.
- Scope Estimasi Kotor bukan migration DB, bukan import, dan bukan perubahan RAW source.
- Formula Estimasi Kotor: satu `Total Pembayaran` order dikurangi Σ(HPP × quantity). Bukan Profit Bersih.
- Ads Spend hanya `Deduction for Product Ad` dengan nominal signed negatif.
- Estimasi PPN Iklan = 11% Ads Spend per hari, dibulatkan ke rupiah penuh per hari; summary adalah jumlah seluruh PPN harian agar cocok dengan Ringkasan Harian.
- Sisa Estimasi Setelah Ads & PPN = Estimasi Kotor − Ads Spend − Estimasi PPN. PPN ini alokasi estimasi, bukan row pajak aktual Ads RAW dan bukan biaya yang dialokasikan ke per order/item.
- Legacy `/api/profit-calculation` dan `/api/profit-calculation/summary` tetap `503 PROFIT_NOT_READY`; itu adalah boundary Profit Aktual.
- GitHub `master` memuat release `1a8ea47`; canonical production deployment `dpl_Frw4Geu2zEawcpRqCooadBhXQSmX` sudah Ready dan smoke test production lulus.
- Master SKU tetap shared/global. State Order/Income/RAW terbaru wajib dicek dari database read-only atau API production karena data operasional dapat berubah.

### Belum selesai

- Profit aktual/confirmed per-order dan per hari dari settlement `Penghasilan / Order`.
- Ads accounting layer dan alokasi biaya iklan ke order/item.
- Biaya eksternal per order: packaging, tenaga kerja, dan biaya operasional lain.
- QC stok return/refund untuk menentukan restock layak versus HPP yang menjadi kerugian.
- Multi-user ownership authorization per store.
- Baseline lint cleanup.

### Jangan salah simpulkan

- Production sudah Ready dan menerima import operasional yang telah dilakukan user.
- Income package selalu scope per store; jangan membaca package satu store sebagai data global.
- State live dapat berubah sesudah clear/hapus store; query API production sebelum membuat klaim count/package.
- Master SKU memang global/shared, bukan per-store.
- Estimasi Kotor bukan Profit Bersih dan tidak boleh dipasarkan sebagai angka laba final.

---

## 2. Kondisi Git yang Harus Dipertahankan

Mulai dengan:

```bash
cd /home/yogaimawan/Dokumentasi/shopee_profit_estimation
```

```bash
git status --short
```

Artifacts user yang boleh tetap untracked:

```text
NEXTAGENTS.md.backup-20260809-044404
README.md.backup-20260809-044404
data_sample/Income.sudah dilepas.id.20260601_20260630.xlsx
data_sample/Income.sudah dilepas.id.20260701_20260731.xlsx
data_sample/Income.sudah dilepas.id.20260801_20260808.xlsx
data_sample/sample_all_store/
```

Rules:

- Jangan `git add -A` atau `git commit -am`.
- Jangan commit `.env.local`, workbook, `Archive/`, atau backup tanpa instruksi eksplisit user.
- Jangan overwrite perubahan user yang belum commit.
- Backup sebelum sinkronisasi docs state live:

```text
Archive/docs-backups/README.md.pre-live-state-correction-20260809-180312
Archive/docs-backups/NEXTAGENTS.md.pre-live-state-correction-20260809-180312
```

---

## 3. Model Data Multi-Store

### Scope class

```text
order_all                               store-scoped
income_report_imports                   store-scoped
income_penghasilan_raw                  child scope via income parent
income_adjustments_raw                  child scope via income parent
income_shipping_fee_discrepancies_raw  child scope via income parent
sku_report_imports                      shared/global
sku_master_raw                          shared/global
```

### Identity

```text
Order.all
(store_id, no_pesanan, nomor_referensi_sku, nama_variasi)

Income package
(store_id, source_sha256)

Income RAW child
(income_report_import_id, source_excel_row)
```

### Authorization boundary

- Basic Auth sekarang mewakili satu admin yang sah mengelola semua store.
- Endpoint memvalidasi format dan eksistensi `storeId`.
- Jangan mengklaim isolation antar-user/tenant.
- Sebelum ada user/credential per store, implement identity session dan server-side ownership check terhadap `stores.owner_user_id` pada seluruh read/mutation route.

---

## 4. Kontrak RAW Aktif

### Order.all

```text
Satu row = satu item/variasi pesanan
```

- Current-state merge, bukan ledger append.
- Snapshot/export timestamp wajib mengendalikan freshness.
- Status tidak boleh mundur.
- Field populated tidak boleh overwritten oleh blank/masked/older snapshot.
- Duplicate composite key di workbook ditolak sebelum import.
- Import transaction: satu kegagalan membatalkan seluruh batch.

Files:

```text
webapp/app/api/upload/route.ts
webapp/lib/order-all-import.js
webapp/test/order-all-import.test.mjs
```

### Income

- Satu workbook = satu RAW package/provenance pada store aktif.
- Exact SHA-256 duplicate hanya berlaku dalam store yang sama.
- Overlap periode dengan file berbeda tetap package RAW terpisah.
- `Penghasilan Order` dan `Penghasilan Sku` tidak boleh dijumlahkan bersama.
- Summary hanya reconciliation metadata.
- Adjustment/Shipping Fee Discrepancy tetap section terpisah.
- Income dapat tidak mempunyai pasangan snapshot Order.all; jangan tambahkan FK wajib ke order.
- Jika header aggregate `Biaya Layanan` ada, jangan ikut menjumlahkan breakdown legacy yang sudah tercakup di dalamnya: `Biaya Layanan Promo XTRA`, `Biaya Layanan Gratis Ongkir XTRA (Kategori F)`, dan `Biaya Gratis Ongkir XTRA - Ukuran Biasa (Kategori F)`.
- Breakdown tersebut wajib tetap ada di `raw_payload`; pengecualian hanya berlaku untuk signed checksum aggregate layout. Non-aggregate layout tidak boleh berubah.
- Gate reconciliation `Summary 3. Total yang Dilepas` tetap fail-closed. Mismatch tidak boleh dibypass.
- Status source-to-DB saat import terakhir hanya terbukti untuk kontrak RAW aktif. `Seller Fee` tetap audit-only dan belum dimaterialisasi sebagai child RAW transaksi.

Files:

```text
webapp/lib/income-raw-import.js
webapp/lib/income-raw-db.js
webapp/lib/income-query.js
webapp/app/api/income/route.ts
webapp/app/income/page.tsx
webapp/test/income-raw-import.test.mjs
```

### Master SKU

- Shared semua store.
- Tidak memakai `store_id`.
- Tidak ikut `clear_store` atau hapus store.
- `clear_shared_sku` menghapus child `sku_master_raw` sebelum parent `sku_report_imports` dan membutuhkan confirmation eksplisit.
- `/sku` tidak memerlukan active-store scope kecuali produk memutuskan SKU override per store pada fase lain.

### Kelayakan report financial per order — verified read-only

Batas ini telah diuji terhadap data RAW nyata dan hanya berlaku saat seluruh input terkait ditemukan.

```text
Profit Bersih Produk Saat Ini
= Penghasilan / Order signed_total
- Σ(HPP Master × quantity item)

Estimasi Kotor Sementara
= Total Pembayaran Pembeli
- Σ(HPP Master × quantity item)

Kerugian Cash Settlement Retur
= Penghasilan / Order signed_total
```

- Pakai `Penghasilan / Order` sebagai settlement; jangan dijumlahkan dengan `Penghasilan / Sku`.
- Gunakan `Penghasilan / Sku` hanya sebagai alokasi item pada order multi-item.
- Cari HPP dengan `Nomor Referensi SKU`, fallback `SKU Induk`; alias Master SKU ekuivalen bukan beberapa HPP untuk ditotal.
- Retur membutuhkan status QC persediaan sebelum hasil akhir diakui: restock layak mempertahankan HPP sebagai stok, rusak/hilang membebankan HPP ke kerugian.
- Exclude packaging, tenaga kerja, dan ads sampai ada kontrak alokasi.
- `Seller Fee` tetap audit-only; tidak ditambahkan ke `Penghasilan`.

### 4A. Estimasi Kotor — production release

**Keputusan user:** gunakan satu menu existing `/profit`, dengan label navigasi **Profit & Estimasi**. Tidak ada menu global baru karena navigasi mobile sudah padat dan domain finansial tidak boleh terpecah.

**Status release:** source `c41c890` sudah dipush ke GitHub `master`; deployment Production `dpl_8pfdd8wtTBsjxsPAgn2DG3Z4cFBa` sudah `Ready`. Smoke authenticated `/profit` dan `/api/profit-estimation` lulus. Hanya Profit Aktual yang tetap mengembalikan `503 PROFIT_NOT_READY` melalui route legacy.

**Struktur UI yang live:**

```text
/profit  — Profit & Estimasi
├─ Estimasi Kotor
│  ├─ Ringkasan Harian
│  └─ Per Order
└─ Profit Aktual
   └─ tetap terkunci / belum dihitung
```

Jangan membuat halaman Ads kedua untuk kalkulasi. `/ads` tetap halaman RAW/audit source.

### Kontrak angka yang disetujui

```text
Basis potongan standar Shopee
= Σ(Subtotal Pesanan item)
- Σ(Voucher Ditanggung Penjual item)

Biaya Administrasi             = round(basis × 8,25%)
Biaya Proses Pesanan           = Rp1.250 per order
Biaya Gratis Ongkir XTRA       = round(basis × 5%)
Biaya Layanan Promo XTRA       = round(basis × 4,5%)
Premi                          = round(basis × 0,5%)

Estimasi Penghasilan Seller
= basis - semua potongan standar

Estimasi Kotor Setelah HPP per order
= Estimasi Penghasilan Seller
- Σ(HPP Master × quantity item)

Sisa Setelah Ads & PPN per hari
= Σ(Estimasi Kotor Setelah HPP order eligible)
- Ads Spend Harian
- Estimasi PPN Iklan Harian
```

`Subtotal Pesanan` berada pada grain item dan dijumlahkan lintas seluruh item pesanan. Formula ini sengaja tidak memakai `Total Pembayaran Pembeli`: nominal buyer-side dapat memuat komponen ongkir, voucher buyer, atau biaya layanan buyer yang bukan basis penghasilan seller.

Label UI:

```text
Estimasi Kotor Setelah HPP
Ads Spend
Estimasi PPN Iklan (11%)
Sisa Setelah Ads & PPN
Profit Aktual — Belum Tersedia
```

### Batas data dan safety rule

1. **Order eligible** hanya memiliki status `Perlu Dikirim`, `Sedang Dikirim`, `Telah Dikirim`, atau `Selesai`.
2. Exclude order jika `Alasan Pembatalan` atau `Status Pembatalan/ Pengembalian` pada `Order.all` memiliki nilai bisnis. Perlakukan kosong, `-`, `N/A`, dan `null` sebagai blank saja.
3. Exclude juga `no_pesanan` yang ada pada RAW Cancellation, Return/Refund, atau Failed Delivery untuk toko aktif. RAW exception dapat lebih baru dari current-state snapshot.
4. `returned_quantity > 0` pada salah satu item membuat seluruh order `Tidak Eligible`.
5. `Subtotal Pesanan`, Voucher Ditanggung Penjual, tanggal, quantity, dan mapping HPP harus valid. HPP missing/ambiguous tidak boleh menjadi Rp0.
6. Mapping HPP memakai `Nomor Referensi SKU`, fallback `SKU Induk`; lalu `SKU1`, fallback `SKU2`, dari Master SKU import terbaru. Alias dengan HPP berbeda adalah conflict.
7. Income `Penghasilan / Order`, settlement, dan cohort payout historis **bukan syarat** Estimasi Kotor. Missing Income tidak boleh membuat order eligible berubah menjadi `—`.
8. Komisi atau program khusus seperti AMS belum dimasukkan sebagai potongan standar. Jangan memasukkan rate global tanpa bukti coverage order-level.
9. Ads dan PPN tetap agregat toko/hari. Jangan alokasikan ke order/item tanpa relasi campaign/order yang terbukti.
10. Packaging, tenaga kerja, biaya operasional lain, Seller Fee, settlement, return QC, dan refund final tetap di luar fase ini.

### Target source dan test

```text
webapp/lib/profit-estimation.js                 pure grouping/mapping/formula logic
webapp/test/profit-estimation.test.mjs          regression test logic terlebih dahulu
webapp/app/api/profit-estimation/route.ts       GET read-only, store-scoped, dynamic
webapp/app/profit/page.tsx                      UI tab Estimasi Kotor / Profit Aktual
webapp/app/layout.tsx                           label nav Profit & Estimasi
```

Target API read-only:

```text
GET /api/profit-estimation?storeId=<id>&dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD&page=<n>&limit=<n>
```

- `storeId` wajib divalidasi memakai boundary existing `requireStoreId`.
- `dateFrom` dan `dateTo` optional, harus kalender valid, dan `dateFrom <= dateTo`.
- `page`/`limit` wajib dibatasi seperti endpoint existing.
- Route tidak boleh melakukan INSERT/UPDATE/DELETE, migration, upload, atau mutation metadata.
- Response harus memisahkan daily aggregate, summary, order detail paginated, dan order HPP incomplete/review count.
- Keep `/api/profit-calculation` dan `/api/profit-calculation/summary` sebagai `503 PROFIT_NOT_READY`; itu boundary Profit Aktual, bukan endpoint Estimasi Kotor.

### Implementasi, review, dan release evidence

1. Regression mencakup kalkulasi standar, pembulatan PPN ke rupiah penuh, summary yang menjumlahkan PPN harian, dan kondisi tanpa Ads Spend.
2. `npm test`, TypeScript, `npm run lint -- --quiet`, `npm run build`, serta `git diff --check` lulus sebelum release.
3. Independent review final menyatakan PASS: Ads Spend tetap negative Product Ad saja, PPN terlabel estimasi, API/guard Profit Aktual tidak berubah, dan UI/table contract konsisten.
4. Source release `1a8ea47` dipush ke GitHub `master`; local `HEAD` dan `origin/master` sama.
5. Deployment Production `dpl_Frw4Geu2zEawcpRqCooadBhXQSmX` Ready pada canonical alias.
6. Smoke production dengan Basic Auth lulus: `/profit` `200`; `/api/profit-estimation` `200`, memuat field PPN summary/daily, summary PPN cocok dengan jumlah harian, dan final summary konsisten; tanggal invalid `400`; legacy `/api/profit-calculation` tetap `503 PROFIT_NOT_READY`; request tanpa Basic Auth ke `/profit` `401`.
7. Tidak ada real upload/import/mutasi DB pada validasi Estimasi Kotor. Semua evidence live adalah `GET` read-only.
8. Backup dokumentasi sebelum release ada di `Archive/docs-backups/ppn-ads-estimation-20260813-020631/`; SHA-256 dan byte equality telah diverifikasi. Archive tidak di-stage.

### Runtime note

- Canonical production API dengan Basic Auth adalah sumber state live. Jangan memakai summary/count dokumen ini sebagai fakta yang tidak berubah.
- Direct cPanel MySQL dari VPS bisa `ETIMEDOUT`; Windows OpenVPN SSH bridge pernah terbukti sebagai jalur read-only alternatif. Jangan mengubah config jaringan/database hanya untuk test Estimasi Kotor.
- Ads RAW memiliki event `Deduction for Product Ad`, `Isi Saldo`, dan `ROAS Protection Free Ads Credit Rebate`; klasifikasi kontrak di atas harus dipertahankan.

---

## 5. Flow Operasional yang Wajib Dipertahankan

### Import Order.all

```text
Pilih store aktif
→ /upload
→ isi waktu snapshot/export
→ pilih Order.all
→ preview
→ cek target store + kategori perubahan
→ import bila benar
→ verifikasi /orders + /settings store yang sama
```

Jika ada beberapa snapshot, urutkan dari lebih lama ke lebih baru.

### Import Income

```text
Pilih store aktif
→ /upload
→ pilih workbook Income
→ preview
→ cek target store, file, periode, section, reconciliation
→ import bila reconciliation matched
→ verifikasi /income + /settings store yang sama
```

- Jangan menganggap overlap periode sebagai duplicate.
- Jangan import otomatis hanya karena file ditemukan di `data_sample/`.
- Jangan pindah store selama preview/import berlangsung; UI sengaja membatalkan state lama jika selector berubah.

### Bulk queue folder / banyak file

- Source files dipreview berurutan melalui endpoint preview yang sama seperti upload tunggal; preview tidak menulis DB.
- Report type ditentukan dari struktur source, bukan nama file. Periode berasal dari metadata/row source jika parser menyediakannya.
- Operator hanya dapat memilih status `Siap`; duplicate/no-op, invalid, rejected, dan unselected tidak dapat ditulis.
- `Import Selected` tetap sequential dan per-file transaction/provenance. Gagal satu file tidak membatalkan package lain.
- `Retry Gagal` hanya mengaktifkan ulang file failed dengan preview masih importable; tidak mengulang file siap lain atau duplicate.
- Store switch menghapus queue dan menginvalidasi request aktif. Preview ticket terikat store, SHA-256, dan report type; dikembalikan hanya pada file yang menghasilkan ticket tersebut.
- Jangan mencampur Order.all dari snapshot/export timestamp berbeda dalam satu import bulk. Kelompokkan dan jalankan per timestamp agar freshness guard benar.

Files:

```text
webapp/app/upload/page.tsx
webapp/lib/bulk-upload-queue.js
webapp/test/bulk-upload-queue.test.mjs
webapp/test/bulk-upload-ui.test.mjs
```

### Management destructive

```text
Clear Data Toko Aktif
  Menghapus Order.all + Income store aktif.
  Tidak menghapus store record atau Master SKU.

Reset Master SKU Shared
  Menghapus Master SKU global saja.
  Tidak menghapus store, Order.all, Income.

Hapus Toko Aktif
  Hanya untuk store kosong.
  Ditolak bila store terakhir.
  Tidak menghapus Master SKU shared.
```

Setiap aksi memakai confirmation kedua. Jangan panggil endpoint mutasi untuk smoke test.

---

## 6. UI/API Contract yang Harus Dijaga

### Halaman

```text
/upload    Preview/import Order.all, Income, Master SKU
/orders    Order.all store aktif
/income    Income RAW store aktif
/sku       Master SKU shared
/settings  Database management + destructive controls terjaga
/profit    Profit & Estimasi: Estimasi Kotor manual-load; Profit Aktual tetap terkunci
```

### Race/stale guard

Jangan regress:

- Orders/Income/Settings tidak menampilkan payload store lama di bawah label store baru.
- Upload membatalkan preview/import state jika `storeId` berubah.
- Preview dan import terikat ke `previewStoreId`.
- Confirmation clear/hapus dan completion/fetch terikat store yang dikonfirmasi.
- Hapus store memanggil `refreshStores()`; StoreContext memilih store tersisa jika selected ID sudah tidak ada.
- SKU request mengabaikan response stale.

### API

```text
GET    /api/health
GET    /api/stores
POST   /api/stores
DELETE /api/stores
GET    /api/orders?storeId=<id>
GET    /api/profit-estimation?storeId=<id>&dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD&page=<n>&limit=<n>
GET    /api/income?storeId=<id>
GET    /api/sku
POST   /api/upload
GET    /api/settings/database?storeId=<id>
POST   /api/settings/database
```

Mutation contract umum:

```text
Basic Auth wajib
same-origin wajib
JSON valid wajib
confirmation: true untuk clear/reset/hapus
```

---

## 7. Quality dan Runtime

Quality gate source release `7bfab44`:

```text
Income regression suite                        16/16 PASS
npm test                                      64/65 PASS; 1 live-fixture lama mengharuskan minimal dua store
./node_modules/.bin/tsc --noEmit ...          PASS
npm run build                                 PASS
git diff --check                              PASS
Independent read-only review                  PASS
Production preview-only Income Mei            200; reconciliation matched; database tidak berubah
Post-import live DB/API audit                 parent SHA, source-row identity, child integrity PASS
```

Production sudah membuktikan:

```text
Basic Auth guard                              401 tanpa credential
Store list dan Settings                       scoped + readable dengan credential
Pagination invalid/unsafe                     400
SKU importId invalid                          400
Profit legacy                                 503 PROFIT_NOT_READY
Clear/reset/delete                            confirmation dan boundary guard aktif
Income package                                tersimpan/terisolasi per store
Master SKU                                   tetap shared setelah clear/hapus store
```

`npm run lint` belum PASS karena baseline legacy (`any`, `require()`, React hook rule). Jangan mengklaim lint hijau atau menyamakan lint dengan build/typecheck.

---

## 8. Opening Procedure Jika Akan Ubah Kode

1. Baca `README.md` penuh.
2. Cek `git status --short`; jangan sentuh artifacts user.
3. Baca `webapp/AGENTS.md` serta dokumentasi Next.js lokal sebelum mengubah source Next.
4. Audit source dan DDL live read-only sebelum schema/migration.
5. Jika report baru: berhenti pada analisa lalu diskusi. Jangan langsung coding.
6. Jika import real: preview dulu, laporkan hasil, tunggu approval import.
7. Sesudah import real, audit parent SHA, active-section source-row identity, reconciliation, orphan child, dan API production read-only sebelum menyebutnya lengkap.
8. Setelah source berubah: test, TypeScript, build, `git diff --check`, independent review fresh, baru commit/deploy bila user mengizinkan.

---

## 9. Next Scope — Estimation Layer (Rencana, Belum Implementasi)

> **Status:** Rencana hasil diskusi. Belum ada tabel baru, migration, route, UI, import, atau perubahan database yang dilakukan.
>
> **Tujuan fase ini:** membuat estimasi seller yang bisa diperbarui berdasarkan potongan yang terlihat pada detail pesanan Shopee. Fase ini **bukan** implementasi Profit Bersih, Profit Aktual, settlement final, atau accounting lengkap.

### 9.1 Boundary database yang wajib dipertahankan

Database yang dipakai tetap:

```text
supplie3_shopee_profit_estimation
```

Tabel existing dibaca read-only dan tidak boleh diubah strukturnya maupun datanya:

```text
order_all
income_report_imports
income_penghasilan_raw
income_adjustments_raw
income_shipping_fee_discrepancies_raw
sku_report_imports
sku_master_raw
balance_report_imports
balance_transactions_raw
order_cancellation_report_imports
order_cancellation_raw
order_failed_delivery_report_imports
order_failed_delivery_raw
order_return_refund_report_imports
order_return_refund_raw
ads_report_imports
ads_transactions_raw
```

Larangan migration fase ini:

```text
Tidak ada ALTER TABLE pada tabel existing.
Tidak ada penambahan kolom pada order_all atau RAW lain.
Tidak ada perubahan data Order.all, Income, SKU, Balance, Exception, atau Ads.
Tidak ada penggantian/penimpaan RAW source.
```

Yang boleh ditambahkan hanya tabel baru dengan prefix `estimation_` di database yang sama. Detail DDL tetap harus disetujui dan diaudit sebelum migration.

### 9.2 Tujuan data layer baru

`Order.all` hanya menjadi sumber identitas dan data pesanan. `Master SKU` menjadi sumber HPP. Potongan seller yang terlihat pada Dashboard Shopee disimpan di layer estimasi terpisah agar:

```text
Order.all existing + Master SKU existing + Estimation layer baru
→ Estimasi seller setelah potongan dan HPP
```

Settlement Income tidak menjadi syarat untuk menghitung estimasi fase ini. Order yang belum masuk Income tetap dapat memiliki estimasi jika basis seller dan HPP-nya tersedia.

### 9.3 Kandidat struktur tabel baru

Nama dan kolom final masih harus dibahas sebelum migration. Struktur konseptual yang disiapkan:

#### `estimation_order_revisions`

Satu row adalah satu snapshot/revisi potongan untuk satu pesanan pada satu store.

```text
id
store_id
no_pesanan
revision_no
revision_status              active | superseded
source_type                   manual_screenshot pada fase awal
source_file / source_reference
source_sha256                 bila ada artifact sumber
source_captured_at
seller_subtotal_source
source_estimated_income       nilai pembanding dari detail Shopee, bila tersedia
notes
created_at
created_by
```

- Scope berdasarkan `store_id` dan `no_pesanan`.
- Tidak membuat foreign key wajib ke `order_all`; Order.all adalah current-state snapshot yang dapat berubah, sedangkan histori revisi estimasi harus tetap dapat diaudit.
- Parent revision lama tidak dihapus. Hanya revision terbaru yang berstatus `active`.
- `source_estimated_income` adalah nilai audit/reconciliation dari screenshot, bukan angka yang boleh dijumlahkan lagi ke komponen potongan.

#### `estimation_order_adjustments`

Satu row adalah satu komponen signed di dalam revision tertentu.

```text
id
estimation_order_revision_id
component_group
component_code
component_label
amount_signed
source_label
sort_order
raw_payload / source_note
created_at
```

Aturan komponen:

- Potongan disimpan negatif, misalnya `-190059`.
- Kredit/subsidi/kompensasi yang memang menambah penghasilan disimpan positif.
- Tidak memakai daftar kolom tetap seperti `biaya_admin`, `biaya_layanan`, dan `premi`; komponen baru dapat ditambahkan tanpa mengubah schema.
- Parent group seperti `Biaya Platform` tidak dijumlahkan jika child detailnya sudah disimpan. Hanya komponen kalkulasi leaf yang dihitung.
- Potongan yang hilang pada screenshot update tidak dihapus dari revision lama; komponen tersebut tidak muncul atau dinonaktifkan di revision baru.
- HPP bukan input potongan manual. HPP tetap dibaca dari Master SKU existing; keputusan apakah basis HPP perlu disnapshot di revision akan ditetapkan sebelum migration agar perubahan Master SKU tidak mengubah histori secara diam-diam.

Perhitungan hasil tidak perlu menjadi source table terpisah pada fase pertama. Hasil dihitung dari active revision + data Order.all + HPP, lalu ditampilkan sebagai read view.

### 9.4 Kontrak perhitungan estimasi

Jika data seller lengkap:

```text
Estimasi Penghasilan Seller
= seller_subtotal_source
+ Σ adjustment.amount_signed

Estimasi Setelah HPP
= Estimasi Penghasilan Seller
- Σ(HPP Master × quantity item)
```

Aturan penting:

1. Gunakan `Subtotal Pesanan` dari sisi seller/detail Shopee sebagai basis bila tersedia. Jangan mengganti basis seller dengan `Total Pembayaran Pembeli` tanpa label yang berbeda.
2. `Total Pembayaran Pembeli` tetap dipertahankan sebagai data Order.all dan informasi pembanding, bukan otomatis sebagai `Estimasi Total Penghasilan Seller`.
3. Satu nilai order-level tidak boleh dijumlahkan berulang pada setiap item row.
4. HPP dihitung pada grain item/variasi, lalu dijumlahkan ke level order.
5. Potongan yang belum diinput, ambigu, atau belum terbukti tidak boleh dianggap `Rp0`.
6. Jika basis seller atau HPP belum lengkap, tampilkan `—`/`Potongan Belum Diinput`/`HPP Belum Lengkap`, bukan angka palsu.
7. `Estimasi Setelah HPP` tidak boleh diberi label `Profit Bersih` atau `Profit Aktual` pada fase ini.
8. Ads Spend dan Estimasi PPN tetap menjadi biaya agregat harian. Jangan dialokasikan ke order/item tanpa relasi campaign/order yang terbukti.
9. Settlement `Income / Penghasilan / Order` dan proyeksi payout historis tetap di luar kontrak Estimasi Seller fase ini.

Label UI yang direncanakan:

```text
Estimasi Kotor Sebelum Potongan
Total Potongan Seller
Estimasi Penghasilan Setelah Potongan
HPP
Estimasi Setelah HPP
Potongan Belum Diinput
HPP Belum Lengkap
```

Label `Estimasi Profit Bersih Shopee` tidak boleh dipakai untuk hasil fase ini.

### 9.5 Letak dan bentuk UI

Layer baru disimpan dan dilihat melalui halaman existing:

```text
/profit
└── Profit & Estimasi
    ├── Estimasi Kotor
    ├── Potongan Estimasi
    └── Profit Aktual — tetap terkunci
```

Tidak membuat menu global baru di bottom navigation, tidak menaruh data ini di Settings, dan tidak mencampurnya dengan halaman Income/Ads RAW.

#### Daftar `Potongan Estimasi`

Daftar store aktif dengan kolom konseptual:

```text
No. Pesanan
Tanggal
Status Order
Subtotal Seller
Total Potongan
HPP
Estimasi Setelah HPP
Revision aktif
Update terakhir
Status kelengkapan
```

#### Detail pesanan

Saat order dibuka, tampilkan:

```text
Data Order.all                 read-only
Master SKU/HPP                 read-only
Revision potongan aktif        read-only sebelum update
Daftar komponen signed         detail leaf
Total potongan
Estimasi seller
Estimasi setelah HPP
Riwayat revisi
```

### 9.6 Mekanisme update melalui UI

Update dilakukan melalui **form UI**, bukan edit database langsung:

```text
Profit & Estimasi
→ Potongan Estimasi
→ cari No. Pesanan
→ buka detail
→ klik “Buat Update/Revisi”
→ form menyalin komponen revision aktif
→ tambah/edit/nonaktifkan komponen
→ lampirkan atau catat screenshot sumber
→ lihat preview perubahan dan hasil estimasi
→ simpan revision baru
```

Aturan revision:

1. Revision aktif lama tidak diedit atau dihapus permanen.
2. Nominal berubah → buat revision baru.
3. Komponen baru → tambah row pada revision baru.
4. Komponen dihilangkan → tidak dimasukkan pada revision baru atau ditandai removed melalui diff; row revision lama tetap utuh.
5. Simpan parent revision dan seluruh child component dalam satu transaction pada tabel baru.
6. Setelah berhasil, revision lama menjadi `superseded`, revision baru menjadi `active`.
7. Summary dan detail hanya memakai satu active revision per `store_id + no_pesanan`.
8. Preview wajib menampilkan diff sebelum save:

```text
Komponen ditambah
Komponen diubah
Komponen dihilangkan
Total lama vs total baru
Estimasi lama vs estimasi baru
```

Fase awal memakai update satu pesanan secara manual. OCR dan batch screenshot bukan bagian dari implementasi pertama; keduanya baru dibahas setelah flow manual terbukti.

### 9.7 Candidate API contract

Nama route masih dapat berubah saat desain final, tetapi boundary-nya:

```text
GET  /api/estimation-orders?storeId=<id>&search=<term>
GET  /api/estimation-orders/<noPesanan>/revisions?storeId=<id>
POST /api/estimation-orders/revisions/preview
POST /api/estimation-orders/revisions
```

- Semua read wajib store-scoped.
- Mutation wajib Basic Auth, same-origin, validasi order/store, dan payload validation.
- `POST` revision tidak boleh mengubah tabel existing.
- Tidak menyediakan `PUT`/`DELETE` yang merusak histori; perubahan memakai revision baru.
- Preview tidak menulis database.
- Save memakai satu transaction untuk parent revision + child adjustments.
- Error/rollback harus meninggalkan revision aktif lama tetap utuh.

### 9.8 Store lifecycle dan keamanan

Tabel baru bersifat store-scoped dan harus diperhitungkan sebelum implementasi Settings:

- `clear_store` harus menghapus child adjustment lalu parent revision untuk store aktif, hanya setelah kontrak destructive action disetujui.
- Hapus store harus menolak store yang masih memiliki revision estimasi aktif/berhistori, atau menggunakan urutan delete yang telah diaudit.
- Master SKU shared tidak ikut dihapus.
- Tidak boleh melakukan clear, reset, atau delete selama pengembangan fitur tanpa approval eksplisit dan backup tervalidasi.
- Data customer/alamat tidak perlu disalin ke tabel estimasi; simpan hanya identitas order dan field finansial yang diperlukan.

### 9.9 Urutan implementasi setelah rencana disetujui

```text
1. Finalisasi field dan formula berdasarkan beberapa screenshot detail Shopee.
2. Audit label sumber: seller subtotal, fee parent/child, voucher, subsidi, premi, dan total penghasilan.
3. Finalisasi revision policy dan source-evidence policy.
4. Audit DDL live read-only; pastikan hanya tabel estimation baru yang belum ada.
5. Buat backup database tervalidasi sebelum migration.
6. Buat migration create-only untuk tabel estimation baru saja.
7. Verifikasi SHOW CREATE TABLE, index, unique key, dan foreign key tabel baru.
8. Implement read-only query/API dan UI daftar/detail.
9. Implement preview diff + save revision manual satu pesanan.
10. Uji update, penambahan komponen, penghilangan komponen, rollback, dan store isolation.
11. Integrasikan active revision ke summary Estimasi tanpa mengaktifkan Profit Aktual.
12. Test real read path dan preview path; deploy hanya setelah approval eksplisit.
```

Selama langkah 1–3, tidak ada perubahan source atau database yang diperlukan. Selama langkah 4–12, setiap perubahan harus dibahas dan diverifikasi sesuai boundary project.

### 9.10 Belum termasuk dalam fase ini

```text
Profit Bersih final
Profit Aktual settlement
Median payout pending
Seller Fee sebagai accounting final
Alokasi Ads ke order/item
PPN cashflow/top-up aktual
Packaging, tenaga kerja, overhead
QC barang retur dan pembebanan HPP retur
OCR otomatis
Batch update banyak screenshot
Multi-user authorization per store
```

### 9.11 Future source-analysis track

Setelah Estimation Layer stabil, analisa berikut tetap dilakukan terpisah dan tidak boleh dicampur sebagai source profit otomatis:

1. **Balance Transaction**
   - Sheet/header, grain, tipe transaksi, sign, `No. Pesanan`, dan duplicate policy.
   - Bedakan settlement, adjustment, refund, dan biaya iklan dengan bukti source.

2. **Return/refund, failed delivery, cancellation**
   - Cocokkan dengan Order.all, Income, dan Balance.
   - Jangan menyederhanakan menjadi satu status linear tanpa report finansial.

3. **Financial layer**
   - Diskusikan Income Order, Income Sku, HPP, Ads, return, settlement, serta alokasi item.
   - Baru setelah itu bahas Profit Aktual atau Profit Bersih final.

## 10. Larangan Keras

- Jangan clear/truncate/reimport DB tanpa backup tervalidasi dan approval eksplisit.
- Jangan auto-import workbook dari `data_sample/`.
- Jangan commit `.env.local`, raw customer report, Archive, atau backup.
- Jangan menghitung Penghasilan Order dan Penghasilan Sku bersamaan.
- Jangan membuat profit dari Order.all saja.
- Jangan memperlakukan `schema.sql` sebagai DDL live tanpa audit.
- Jangan mengubah security/config production demi warning kosmetik.
