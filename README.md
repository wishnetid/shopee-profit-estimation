# Shopee Profit Estimation

**Last updated:** 2026-08-13 WIB

**Production:** https://webapp-umber-five.vercel.app

**Repository:** https://github.com/wishnetid/shopee-profit-estimation

**Branch:** `master`

**Latest code release:** `1a8ea47` — `feat(profit): estimate ads PPN in daily summary`

**Last code verification deployment:** `dpl_Frw4Geu2zEawcpRqCooadBhXQSmX` — `Ready`, Production

> Baca file ini penuh sebelum menyentuh project. App production mengelola RAW **Order.all**, **Income**, **Balance**, **order exceptions**, **Ads**, **Master SKU shared**, dan **multi-toko**. `/profit` live sebagai **Profit & Estimasi** dengan tab **Estimasi Kotor** read-only; Profit Aktual tetap sengaja terkunci sampai kontrak settlement/return/QC disetujui.

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
   - Package Income operasional sudah tersimpan pada store `TACTICALIZED`; kondisi package/count terbaru harus selalu dibuktikan melalui database read-only atau API production.
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
   - DDL tabel RAW sudah dibuat dari backup tervalidasi. Data operasional TACTICALIZED sudah diimport; package/count terbaru wajib dicek dari API production atau database read-only.

7. **Profit & Estimasi — read-only**
   - `/profit` memuat tab **Estimasi Kotor** secara manual; ia tidak melakukan import, mutation, atau perubahan RAW.
   - `GET /api/profit-estimation` mengembalikan summary, Ringkasan Harian, dan detail order store-scoped.
   - Estimasi tidak memakai Income, settlement `Penghasilan / Order`, atau cohort historis. Order eligible tetap mendapat angka bila Subtotal Pesanan, voucher seller, quantity, dan HPP valid.
   - Basis per order adalah `Σ(Subtotal Pesanan item) − Σ(Voucher Ditanggung Penjual item)`, lalu dikurangi potongan standar Shopee dan HPP item.
   - Ads Spend hanya berasal dari `Deduction for Product Ad` dengan nominal signed negatif.
   - `Estimasi PPN Iklan (11%)` adalah alokasi dari Ads Spend harian, dibulatkan ke rupiah penuh per hari; ia bukan row pajak aktual dari Ads RAW.
   - Summary PPN menjumlahkan alokasi harian agar selalu cocok dengan Ringkasan Harian. `Sisa Setelah Ads & PPN` mengurangi Ads Spend dan PPN tepat satu kali.

### Belum tersedia — jangan diasumsikan valid

- Profit Aktual per order/per hari dari settlement `Penghasilan / Order`; legacy endpoint Profit Aktual tetap guard `503 PROFIT_NOT_READY`.
- Ads cashflow/accounting lengkap dan alokasi biaya iklan aktual ke order/item. Estimasi PPN harian bukan pengganti transaksi cash top-up.
- Biaya eksternal per order: packaging tambahan, tenaga kerja, dan biaya operasional lain.
- Keputusan QC persediaan retur: layak restock, rusak, atau hilang.
- Multi-user ownership authorization per store.

### Kelayakan financial per-order — sudah dibuktikan read-only

Data RAW aktif sudah cukup untuk menghitung hasil per order dengan batas yang jelas. Ini adalah **kontrak analitis yang tervalidasi**, belum berarti UI Profit atau API kalkulasi sudah diimplementasikan.

```text
Order selesai normal / multi-item
Profit Bersih Produk Saat Ini
= Dana Dilepas Shopee (Penghasilan / Order signed_total)
- Σ(HPP Master × quantity item)

Order eligible sebelum settlement
Estimasi Kotor Setelah HPP
= Estimasi Penghasilan Seller
- Σ(HPP Master × quantity item)

Estimasi Penghasilan Seller
= Σ(Subtotal Pesanan item)
- Σ(Voucher Ditanggung Penjual item)
- Estimasi potongan standar Shopee

Order retur/refund
Kerugian Cash Settlement Shopee
= Penghasilan / Order signed_total

Kerugian final retur
= Kerugian Cash Settlement Shopee
- HPP barang yang tidak kembali layak jual
```

Aturan interpretasi:

- `Penghasilan / Order` adalah settlement utama; jangan menjumlahkannya dengan `Penghasilan / Sku`.
- `Penghasilan / Sku` dipakai untuk alokasi item ketika satu order memiliki beberapa item/variasi.
- HPP memakai `Nomor Referensi SKU` terlebih dahulu, lalu `SKU Induk` sebagai fallback; Master SKU yang berisi alias ekuivalen adalah bukti mapping, bukan HPP tambahan untuk dijumlahkan.
- Untuk retur, HPP hanya menjadi kerugian jika barang hilang/rusak/tidak layak dijual lagi. Barang yang lolos QC dan kembali ke stok tidak boleh mengurangi HPP kedua kali.
- `Seller Fee` audit-only; jangan ditambahkan lagi ke settlement `Penghasilan`.
- Packaging, tenaga kerja, dan Ads belum termasuk dalam Profit Aktual hingga ada kontrak alokasi per order.
- Estimasi Kotor memakai Subtotal Pesanan seller, voucher seller, potongan standar Shopee, dan HPP; ia tidak menunggu Income/settlement/cohort historis.
- Ads Spend dan Estimasi PPN Iklan 11% adalah angka agregat toko/hari; keduanya tidak dialokasikan ke order/item.
- Kontrak formula dan batas model: `ESTIMATION-KOTOR-LOGIC.md`.

Report yang dapat dihasilkan dari RAW sekarang:

- Profit bersih aktual per order yang settlement dan HPP-nya terbukti.
- Kerugian cash dari settlement Shopee, termasuk dampak refund/potongan yang sudah tercermin dalam settlement.
- Estimasi kotor sementara untuk order yang belum dana-dilepas, serta ringkasan harian sebelum fee dengan Ads Spend dan Estimasi PPN Iklan.
- Margin aktual/estimasi, rincian potongan Shopee, rekonsiliasi Penghasilan dengan Balance, serta status risiko Cancellation/Failed Delivery/Return/Refund/Adjustment.

### Snapshot runtime saat dokumentasi diperbarui

- Store aktif: `TACTICALIZED` (`id=1`).
- Order.all, Income RAW, Balance, order exceptions, Ads, dan Master SKU sudah memiliki data operasional hasil import.
- Nilai row/package bersifat dinamis. Query database read-only atau canonical production API sebelum membuat klaim count, package, atau periode terbaru.
- Dokumentasi financial per-order di atas berasal dari probe database read-only terhadap data yang sudah tersimpan; tidak ada data ditulis atau diubah selama probe.

Route legacy Profit Aktual sengaja mengembalikan:

```text
503 PROFIT_NOT_READY
```

Itu adalah product guard, bukan masalah deployment. Halaman `/profit` sendiri adalah **Profit & Estimasi**; tab Estimasi Kotor tetap read-only dan bukan pengganti Profit Aktual.

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

## 9. Verifikasi Release Terkini

Code release Estimasi PPN Iklan:

```text
Commit                                      1a8ea47
Deploy code verification                    dpl_Frw4Geu2zEawcpRqCooadBhXQSmX (Ready, Production)
npm test                                    PASS
TypeScript                                  PASS
npm run lint                                PASS
npm run build                               PASS
git diff --check                            PASS
Independent read-only review                PASS
```

Smoke production authenticated:

```text
/profit                                     200
/api/profit-estimation                      200
PPN summary + Ringkasan Harian fields       present dan rekonsiliasi
Tanggal kalender tidak valid                400
Profit Aktual legacy                        503 PROFIT_NOT_READY
Tanpa Basic Auth ke /profit                 401
```

Tidak ada import, mutation, migration, atau perubahan RAW saat release Estimasi PPN. Semua validasi runtime memakai `GET` read-only.

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
