# NEXTAGENTS — Shopee Profit Estimation

**Last updated:** 2026-08-13 WIB

**Production:** https://webapp-umber-five.vercel.app

**Repository:** `wishnetid/shopee-profit-estimation`

**Branch:** `master`

**Code release:** `c41c890` — `feat(profit): add gross estimation dashboard`

**Last code verification deployment:** `dpl_8pfdd8wtTBsjxsPAgn2DG3Z4cFBa` — `Ready`, Production

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
- Legacy `/api/profit-calculation` dan `/api/profit-calculation/summary` tetap `503 PROFIT_NOT_READY`; itu adalah boundary Profit Aktual.
- GitHub `master` memuat release `c41c890`; canonical production deployment `dpl_8pfdd8wtTBsjxsPAgn2DG3Z4cFBa` sudah Ready dan smoke test production lulus.
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
Estimasi Kotor Sebelum Fee & Ads per order
= satu nilai Total Pembayaran order-level
- Σ(HPP Master × jumlah item)

Estimasi Kotor Harian
= Σ Estimasi Kotor order eligible dan HPP-lengkap pada tanggal order

Ads Spend Harian
= Σ abs(Jumlah signed) untuk transaksi Ads
  dengan deskripsi mulai "Deduction for Product Ad"
  dan nilai signed negatif

Sisa Estimasi Setelah Ads per hari
= Estimasi Kotor Harian - Ads Spend Harian
```

Label UI wajib memakai istilah berikut, bukan `Profit Bersih`:

```text
Estimasi Kotor Sebelum Fee & Ads
Ads Spend
Sisa Estimasi Setelah Ads
Profit Aktual — Belum Tersedia
```

`Sisa Estimasi Setelah Ads` adalah angka agregat hari/toko. Jangan mengalokasikan Ads Spend ke order atau item sampai ada relasi campaign/order yang terbukti.

### Batas data dan safety rule

1. **Order eligible** hanya memiliki status `Perlu Dikirim`, `Sedang Dikirim`, `Telah Dikirim`, atau `Selesai`.
2. Exclude order jika `Alasan Pembatalan` atau `Status Pembatalan/ Pengembalian` pada `Order.all` memiliki nilai bisnis. Perlakukan kosong, `-`, `N/A`, dan `null` sebagai blank saja.
3. Sebagai guard tambahan, exclude juga seluruh `no_pesanan` yang ada pada RAW Cancellation, Return/Refund, atau Failed Delivery untuk toko aktif, walaupun current-state `Order.all` masih `Selesai`/`Telah Dikirim` dan marker-nya blank. RAW exception dapat lebih baru dari snapshot current-state.
4. `returned_quantity > 0` pada salah satu item membuat seluruh order `Tidak Eligible`. Ini guard fail-closed walaupun marker return belum muncul atau RAW exception belum terimport.
5. Satu order dapat punya banyak item. `Total Pembayaran` adalah nilai order-level dan **tidak boleh dijumlahkan per item row**.
6. Bila satu order mempunyai `Total Pembayaran` berbeda, tanggal order tidak valid/berbeda, quantity tidak valid, atau HPP item tidak lengkap/ambigu, tampilkan sebagai `Perlu Review` / `HPP Belum Lengkap` dan exclude dari total Estimasi Kotor.
7. HPP missing/ambiguous tidak boleh diperlakukan sebagai Rp0.
8. Mapping HPP memakai `Nomor Referensi SKU` lebih dulu, lalu `SKU Induk` fallback. Pada masing-masing field, cari `SKU1` dulu lalu `SKU2` dari **Master SKU import terbaru** seperti perilaku `/api/sku`.
9. Alias Master SKU dengan HPP sama adalah satu mapping. Satu alias yang menghasilkan HPP berbeda adalah conflict; jangan pilih arbitrer dan jangan masukkan ke total.
10. Tanggal order harian berasal dari kalender source `DATE(Waktu Pesanan Dibuat)` dalam WIB. Tanggal Ads memakai `transaction_date` source. Jangan group melalui parsing ISO UTC di browser karena bisa menggeser hari.
11. Hanya `Deduction for Product Ad` bernilai negatif yang menjadi Ads Spend. `Isi Saldo` adalah top-up, `ROAS Protection Free Ads Credit Rebate` adalah kredit, dan transaksi Ads lain tidak boleh diam-diam dianggap spend.
12. Jika export Ads periodik overlap, deduplicate hanya event dengan `sequence_number` nonblank serta fingerprint sama: tanggal source, deskripsi, nominal signed, dan catatan. Event tanpa `sequence_number` tidak boleh otomatis dicollapse; ia tetap dihitung agar transaksi sah tidak hilang. Return `adsDuplicateEventCount` untuk audit.
13. Packaging, tenaga kerja, biaya operasional lain, Seller Fee, Income Order/Sku, settlement, return QC, dan refund final tetap di luar fase ini.

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

1. Test-first helper, route contract, dan UI contract sudah lulus; `npm test`: **105 pass, 0 fail, 2 skip** live-fixture lama.
2. `npm run lint -- --quiet`, `npm run build`, serta `git diff --check` lulus sebelum release.
3. Tiga independent review dilakukan. Review pertama menemukan omission RAW exception; review kedua memverifikasi fix tersebut; review final memverifikasi `returned_quantity > 0` juga menjadi `not_eligible`. Tidak ada issue high/medium tersisa.
4. Source release `c41c890` dipush ke GitHub `master`; local `HEAD` dan `origin/master` sama.
5. Deployment Production `dpl_8pfdd8wtTBsjxsPAgn2DG3Z4cFBa` Ready pada canonical alias.
6. Smoke production dengan Basic Auth lulus: `/profit` `200`; `/api/profit-estimation` `200` dan menghasilkan summary/daily/order; tanggal invalid `400`; legacy `/api/profit-calculation` tetap `503 PROFIT_NOT_READY`; request tanpa Basic Auth ke `/profit` `401`.
7. Tidak ada real upload/import/mutasi DB pada validasi Estimasi Kotor. Semua evidence live adalah `GET` read-only.
8. Backup handoff sebelum release dan setelah production verification tersimpan di `Archive/docs-backups/` serta SHA-256 diverifikasi. Archive tidak di-stage.

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

## 9. Next Scope — Diskusi Dulu

1. **Balance Transaction**
   - Sheet/header, grain, tipe transaksi, sign, `No. Pesanan`, duplicate policy.
   - Bedakan settlement, adjustment, refund, dan biaya iklan dengan bukti source.

2. **Return/refund, failed delivery, cancellation**
   - Cocokkan dengan Order.all, Income, dan Balance.
   - Jangan menyederhanakan menjadi satu status linear tanpa report finansial.

3. **Financial layer**
   - Diskusikan Income Order, Income Sku, HPP, ads, return, settlement, serta alokasi item.
   - Baru bangun actual profit dan estimation profit.

## 10. Larangan Keras

- Jangan clear/truncate/reimport DB tanpa backup tervalidasi dan approval eksplisit.
- Jangan auto-import workbook dari `data_sample/`.
- Jangan commit `.env.local`, raw customer report, Archive, atau backup.
- Jangan menghitung Penghasilan Order dan Penghasilan Sku bersamaan.
- Jangan membuat profit dari Order.all saja.
- Jangan memperlakukan `schema.sql` sebagai DDL live tanpa audit.
- Jangan mengubah security/config production demi warning kosmetik.
