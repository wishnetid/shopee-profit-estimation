# Shopee Profit Estimation

**Last updated:** 2026-08-12 WIB

**Production:** https://webapp-umber-five.vercel.app

**Repository:** https://github.com/wishnetid/shopee-profit-estimation

**Branch:** `master`

**Code release commit:** `7bfab44` — `feat(raw): add balance exceptions and ads packages`

**Code verification deployment:** `dpl_8sVCM8uuL71w15UV3qmgmh3nPz4b` — `Ready`

> Baca file ini penuh sebelum menyentuh project. App production mengelola RAW **Order.all**, **Income**, **Balance**, **order exceptions**, **Ads**, **Master SKU shared**, dan **multi-toko**. Financial/profit final belum tersedia; jangan menyimpulkan profit dari data RAW yang ada.

---

## 1. Kondisi Operasional Saat Ini

### Live dan sudah dipakai

1. **Multi-toko single-admin**
   - Selector global menentukan store aktif untuk Orders, Income, Upload, dan Settings.
   - Store yang tersisa saat dokumentasi ini diperbarui: `TACTICALIZED`.
   - Satu Basic Auth dashboard mengelola semua store.
   - Ini bukan model multi-user atau tenant authorization.

2. **Order.all RAW current-state per item**
   - Source of truth: `order_all`.
   - Satu row berarti satu item/variasi dalam pesanan.
   - Snapshot baru di-merge secara konservatif, bukan ditambahkan sebagai ledger histori.

3. **Income RAW package per store**
   - Satu workbook Income disimpan sebagai satu package/provenance.
   - Saat dokumentasi ini diperbarui, API production menunjukkan belum ada package Income pada store `TACTICALIZED`.
   - Kontrak RAW aktif menyimpan `Penghasilan` view `Order` dan `Sku`, serta `Adjustment` bila source menyediakannya.
   - Tidak adanya sheet `Shipping Fee Discrepancy` pada source berarti tidak ada child RAW section yang diharapkan untuk package tersebut.
   - `Seller Fee` tetap audit-only dan belum dimaterialisasi sebagai child RAW transaksi.
   - Package Income yang pernah diimport dapat dihapus melalui Clear Data Toko Aktif bersama data operasional store tersebut.
   - Setiap package Income yang diimport selalu scope ke store aktif dan tidak bocor lintas store.

4. **Master SKU shared**
   - `sku_report_imports` dan `sku_master_raw` berlaku lintas semua store.
   - Master SKU tidak ikut clear data store atau hapus store.

5. **Aplikasi production**
   - Next.js App Router di Vercel.
   - MySQL cPanel hanya diakses server-side.
   - Basic Auth wajib pada page dan API.

6. **RAW Expansion — source evidence per store**
   - Balance Transaction, Cancellation, Failed Delivery, Return/Refund, dan Ads Ledger tersedia pada Upload serta halaman `/balance`, `/exceptions`, dan `/ads`.
   - Semua report baru menggunakan preview-first, package SHA-256 per store, source-row provenance, dan preview ticket yang terikat store/hash/report.
   - DDL sepuluh tabel RAW sudah dibuat dari backup tervalidasi. Production preview-only Balance lulus dengan reconciliation dan ledger continuity `matched`, tanpa write.
   - Semua tabel RAW Expansion masih kosong sampai operator memberi approval import eksplisit.

### Belum tersedia — jangan diasumsikan valid

- Settlement/financial interpretation dari Balance, return/refund, failed delivery, dan cancellation.
- Mapping HPP final serta alokasi order-level ke item-level.
- Ads accounting layer dan alokasi biaya iklan ke order/item.
- Financial layer: net payout, actual profit, dan estimation profit.
- Multi-user ownership authorization per store.

### Snapshot runtime saat dokumentasi diperbarui

- Store aktif: `TACTICALIZED` (`id=1`).
- `order_all`, seluruh parent/child Income, serta seluruh parent/child RAW Expansion: `0` row.
- Master SKU shared tetap berisi satu package dan 32 source row.
- Nilai ini adalah snapshot API production setelah preview-only; query API live sebelum membuat klaim data/import baru.

Route dan halaman Profit sengaja mengembalikan:

```text
503 PROFIT_NOT_READY
```

Itu adalah product guard, bukan masalah deployment.

---

## 2. Kontrak Multi-Store

### Scope data

```text
Store-scoped current state
  order_all

Store-scoped package parent
  income_report_imports

Child yang mewarisi scope Income parent
  income_penghasilan_raw
  income_adjustments_raw
  income_shipping_fee_discrepancies_raw

Shared master lintas semua store
  sku_report_imports
  sku_master_raw
```

### Identity aktif

```text
Order.all
(store_id, no_pesanan, nomor_referensi_sku, nama_variasi)

Income package
(store_id, source_sha256)

Income RAW child
(income_report_import_id, source_excel_row)
```

### Boundary operasi

- Orders, Income, preview upload, import upload, dan Settings selalu memakai `storeId`.
- Server memvalidasi format dan eksistensi `storeId`.
- Saat ini `storeId` adalah selector scope satu admin, bukan otorisasi tenant antar-user.
- Sebelum membuat credential/user per store, wajib tambahkan identity session dan ownership check `stores.owner_user_id` pada seluruh read/mutation route.
- Pindah store membatalkan state request/preview/confirmation lama supaya data toko A tidak tampil atau tertindak sebagai toko B.

---

## 3. Order.all — RAW Current-State

### Grain dan identity

```text
Satu row = satu item/variasi pesanan
(store_id, no_pesanan, nomor_referensi_sku, nama_variasi)
```

- `no_pesanan` tidak cukup sebagai key karena satu pesanan dapat berisi beberapa item/variasi.
- `total_pembayaran` adalah nominal order-level dan dapat muncul di beberapa item row. Jangan dijumlahkan langsung pada grain item.
- Quantity, SKU, variasi, returned quantity, dan HPP nantinya berada pada grain item.

### Aturan snapshot

- Import adalah merge current-state, bukan histori append.
- Operator wajib mengisi waktu snapshot/export dari Shopee.
- Provenance memakai `source_snapshot_at` dan `source_snapshot_file`.
- Snapshot lebih lama tidak boleh menimpa state terbaru.
- Status tidak boleh bergerak mundur.
- Nilai populated tidak boleh turun menjadi kosong atau tersamarkan seperti `******`.
- Konflik populated value ditahan bila freshness belum terbukti.
- Preview membedakan row baru, update aman, identik, serta field yang dilindungi.

### Validasi

- Header export harus valid.
- Composite key wajib lengkap.
- Duplicate composite key di dalam workbook ditolak sebelum preview/import.
- Nominal IDR bertitik diparse sebagai nominal penuh.
- Import berjalan dalam transaction; kegagalan batch membatalkan seluruh snapshot.

Implementasi utama:

```text
webapp/app/api/upload/route.ts
webapp/lib/order-all-import.js
webapp/test/order-all-import.test.mjs
```

---

## 4. Income — RAW Package

### Storage

```text
income_report_imports
  Parent/provenance workbook per store.

income_penghasilan_raw
  Seluruh row Penghasilan view Order dan Sku.

income_adjustments_raw
  Event Adjustment per package.

income_shipping_fee_discrepancies_raw
  Exception Selisih Ongkir per package.
```

### Aturan package

1. Exact SHA-256 yang sudah ada untuk **store yang sama** adalah duplicate/no-op.
2. File berbeda dengan periode overlap tetap disimpan sebagai RAW package terpisah.
3. Semua parent dan child section satu workbook di-import dalam satu transaction.
4. Summary `Total yang Dilepas` harus cocok dengan signed total `Penghasilan` view `Order`; mismatch memblok import.
5. Parser mencari header berdasarkan nama field yang diperlukan, bukan posisi fixed.
6. Header display duplikat memakai canonical key berbeda agar payload tidak tertimpa.
7. Income boleh belum mempunyai pasangan `Order.all`; gunakan `LEFT JOIN`, bukan foreign key wajib ke order.

### Variasi layout legacy fee

- Bila header `Biaya Layanan` tersedia, nilainya adalah aggregate fee.
- Breakdown yang dapat tampil bersamaan dan sudah tercakup dalam aggregate tersebut adalah:
  - `Biaya Layanan Promo XTRA`
  - `Biaya Layanan Gratis Ongkir XTRA (Kategori F)`
  - `Biaya Gratis Ongkir XTRA - Ukuran Biasa (Kategori F)`
- Breakdown tersebut tetap dipertahankan di `raw_payload`, tetapi tidak ikut dijumlahkan lagi dalam signed checksum `Penghasilan / Order`.
- Parser hanya menerapkan pengecualian ini bila header aggregate `Biaya Layanan` ada. Layout non-aggregate tetap menjumlahkan komponen yang tersedia seperti source.
- Gate `Summary 3. Total yang Dilepas` tetap wajib matched; mismatch tetap memblok import, bukan dibypass.

### Verifikasi source-to-DB setelah import

- Cocokkan SHA-256 source dengan parent `income_report_imports` pada store target.
- Bandingkan setiap `source_excel_row` dari `Penghasilan / Order`, `Penghasilan / Sku`, `Adjustment`, dan `Shipping Fee Discrepancy` yang aktif dengan child RAW package tersebut.
- Pastikan tidak ada row child Income orphan dan reconciliation parent tetap `matched`.
- Verifikasi baca ulang melalui `GET /api/income` serta `/api/settings/database` pada canonical production URL.
- Status lengkap berarti lengkap untuk **kontrak RAW aktif**; `Seller Fee` belum boleh diklaim sebagai table transaksi yang diimport.

### Dua grain Penghasilan

```text
Order  = settlement total per No. Pesanan
Sku    = rincian/alokasi settlement per item
```

- Keduanya disimpan.
- Jangan menjumlahkan view `Order` dan `Sku` bersamaan.
- Semua nominal mempertahankan tanda asli dari source.
- `Summary` adalah metadata/reconciliation, bukan transaksi.
- `Seller Fee` audit-only pada fase ini.

Implementasi utama:

```text
webapp/lib/income-raw-import.js
webapp/lib/income-raw-db.js
webapp/lib/income-query.js
webapp/app/api/income/route.ts
webapp/app/income/page.tsx
webapp/test/income-raw-import.test.mjs
```

---

## 5. Flow Operasional Upload

### Order.all

```text
Pilih store aktif
→ buka /upload
→ isi waktu snapshot/export dari Shopee
→ pilih workbook Order.all
→ tunggu preview
→ cek target store, row baru/update/identik/guarded
→ Import hanya bila preview sudah benar
→ cek /orders dan /settings pada store tersebut
```

Import beberapa snapshot Order.all dilakukan dari snapshot lebih lama ke terbaru agar operator mudah membaca perubahan dan guard freshness bekerja sesuai urutan source.

### Income

```text
Pilih store aktif
→ buka /upload
→ pilih workbook Income
→ tunggu preview
→ cek target store, nama file, periode, sections, dan reconciliation
→ Import hanya bila reconciliation matched dan preview benar
→ cek /income dan /settings pada store tersebut
```

- Overlap periode tidak otomatis berarti duplicate.
- Exact file/hash untuk store yang sama akan menjadi no-op.
- Jangan memilih store lain di tengah preview/import; UI akan membatalkan state lama untuk mencegah lintas-scope.

### Bulk queue folder / banyak file

```text
Pilih store aktif
→ /upload
→ isi waktu snapshot/export bila queue memuat Order.all
→ pilih Banyak File atau Folder
→ sistem preview setiap file secara berurutan, tanpa write
→ review report type, periode dari isi source, row count, duplicate/no-op, dan error
→ pilih hanya package status Siap
→ Import Selected berjalan berurutan per file
→ gunakan Retry Gagal hanya untuk file gagal yang preview-nya masih valid
```

- Nama file hanya ditampilkan; classifier menentukan report type dari struktur source.
- Tidak ada import sebelum operator menekan `Import Selected`.
- Queue dibatalkan jika store aktif berubah.
- Preview ticket terikat store, SHA-256, dan report type; selalu dikirim kembali pada import file terkait.
- Jangan campur Order.all dengan snapshot/export timestamp berbeda dalam satu import queue. Jalankan per kelompok waktu agar freshness guard tetap benar.
- File invalid, duplicate/no-op, dan file tidak dipilih tidak ditulis ke database.

### Master SKU shared

```text
Pilih /upload
→ pilih master.xlsx
→ preview
→ import satu kali
→ cek /sku atau Settings
```

Master SKU berlaku untuk semua store. Jangan import ulang per store kecuali source Master SKU memang berubah.

---

## 6. Settings dan Aksi Destruktif

### Clear Data Toko Aktif

```text
Scope: hanya store aktif
Terhapus: Order.all dan seluruh package/child Income milik store tersebut
Aman: store record dan Master SKU shared tetap ada
```

- Confirmation terikat store yang dipilih.
- Pindah store membatalkan confirmation.
- Jangan clear hanya untuk eksperimen; backup dan persetujuan user diperlukan.

### Reset Master SKU Shared

```text
Scope: global semua store
Terhapus: sku_master_raw lalu sku_report_imports
Aman: stores, Order.all, Income tetap ada
```

- Aksi memakai confirmation kedua.
- Child SKU dihapus sebelum parent SKU karena FK `RESTRICT`.
- Gunakan hanya bila seluruh Master SKU memang ingin diganti.

### Hapus Toko Aktif

```text
Scope: satu record store
Syarat: bukan store terakhir; Order.all dan Income store harus sudah kosong
Aman: Master SKU shared tidak ikut terhapus
```

- Aksi memakai confirmation kedua.
- Server menolak store yang masih memiliki Order.all atau Income package.
- Server menolak penghapusan store terakhir.
- Setelah sukses, selector global refresh dan berpindah ke store yang tersisa.

---

## 7. UI dan API

### Halaman

```text
/upload    Preview/import Order.all, Income, Master SKU
/orders    Baca Order.all store aktif
/income    Baca Income RAW package store aktif
/sku       Baca Master SKU shared
/settings  Database management, clear/reset/hapus terjaga
/profit    Informational guard; perhitungan belum tersedia
```

### API penting

```text
GET    /api/health
GET    /api/stores
POST   /api/stores
DELETE /api/stores
GET    /api/orders?storeId=<id>
GET    /api/income?storeId=<id>
GET    /api/sku
POST   /api/upload
GET    /api/settings/database?storeId=<id>
POST   /api/settings/database
```

`GET /api/income` mendukung:

```text
section   = penghasilan | adjustment | shipping
view      = Order | Sku
page      = default 1
limit     = 5–100, default 50
search    = istilah dipisah newline atau ||
sort      = key whitelisted per section
direction = asc | desc
```

---

## 8. Access dan Security

Environment names:

```text
DB_HOST
DB_PORT
DB_USER
DB_PASSWORD
DB_NAME
DASHBOARD_BASIC_AUTH_USER
DASHBOARD_BASIC_AUTH_PASSWORD
DASHBOARD_AUTH_ENABLED
```

- `.env.local` hanya untuk local; credential tidak boleh masuk Git atau dokumentasi.
- Vercel Production Environment Variables menjadi runtime production.
- Source protected-by-default dan tidak menyediakan bypass public.
- `DASHBOARD_AUTH_ENABLED` bukan switch akses publik aktif.
- Page dan API memerlukan Basic Auth.
- Mutation route juga memvalidasi same-origin request.
- Jangan ubah environment/credential tanpa persetujuan eksplisit user.

---

## 9. Verifikasi yang Sudah Terbukti

Code release Income legacy-fee:

```text
Income regression suite                        16/16 PASS
npm test                                      64/65 PASS; satu live-fixture lama mengharuskan minimal dua store
./node_modules/.bin/tsc --noEmit ...          PASS
npm run build                                 PASS
git diff --check                              PASS
Independent read-only review                  PASS
Production preview-only Income Mei            200; reconciliation matched; database tidak berubah
Post-import source-to-DB audit                parent hash, source-row identity, dan child integrity PASS
```

Production behavior yang sudah terverifikasi:

```text
Tanpa Basic Auth                              401
/api/stores dengan Auth                       200
Pagination invalid/unsafe                     400
SKU importId invalid                          400
Profit legacy                                 503 PROFIT_NOT_READY
Store clear/reset/delete                      guarded confirmation + scope checks
Income RAW                                  diisolasi per store saat diimport
TACTICALIZED Income Mei                       satu package; reconciliation matched
Income RAW active-section identity            source-row parity dan tanpa orphan
Master SKU                                   tetap shared setelah clear/hapus store
```

`npm run lint` masih memiliki baseline legacy (`any`, `require()`, React hook rule). Jangan menyebut lint sebagai PASS atau mencampurkannya dengan build/typecheck PASS.

---

## 10. Git dan Raw Reports

- Jangan gunakan `git add -A` atau `git commit -am`.
- Commit hanya file source/test/docs yang scope task.
- `Archive/`, backup dokumentasi, `.env.local`, dan raw workbook tidak boleh di-commit tanpa instruksi eksplisit user.
- Workbook Income untracked di `data_sample/` adalah data kerja user dan harus dibiarkan utuh.
- `data_sample/sample_all_store/` adalah fixture/raw report user; jangan dihapus, diubah, atau di-stage otomatis.
- Backup dokumentasi sebelum sinkronisasi ini:

```text
Archive/docs-backups/README.md.pre-live-state-correction-20260809-180312
Archive/docs-backups/NEXTAGENTS.md.pre-live-state-correction-20260809-180312
Archive/docs-backups/income-may-live-state-sync-20260809-191119/
Archive/docs-backups/webapp-readme-live-sync-20260809-191551/
```

---

## 11. Workflow Wajib

```text
Report → Analisa struktur → Diskusi → Coding → Test → Deploy → Endpoint test nyata
```

Aturan utama:

1. Jangan coding report baru sebelum struktur report dianalisa penuh.
2. Jangan membangun profit dari `Order.all` saja.
3. Jangan clear, truncate, atau re-import DB tanpa backup tervalidasi dan persetujuan eksplisit.
4. Jangan menyamakan overlap export dengan duplicate bisnis.
5. Dokumentasi business rule harus logic-only: field, key, pattern, dan rule; bukan statistik sample atau posisi Excel.
6. Audit DDL live read-only sebelum migration; `schema.sql` bukan pengganti database production.

---

## 12. Next Scope — Diskusi Dulu

Prioritas rekomendasi, belum menjadi instruksi implementasi:

1. **Balance Transaction**
   - Inventaris sheet/header.
   - Tentukan grain, tipe transaksi, tanda nominal, lokasi `No. Pesanan`, dan duplicate policy.
   - Bedakan settlement, adjustment, refund, dan biaya iklan dari bukti source.

2. **Return/refund, failed delivery, cancellation**
   - Cocokkan dengan Order.all, Income, dan Balance.
   - Jangan menyederhanakan sebagai status linear tanpa bukti report finansial.

3. **Financial layer**
   - Diskusikan relasi order header, item, Income Order, Income Sku, HPP, iklan, dan return.
   - Baru desain actual profit dan estimation profit.

Untuk handoff agent berikutnya, baca `NEXTAGENTS.md` setelah README ini.
