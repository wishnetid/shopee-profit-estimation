# NEXTAGENTS — Shopee Profit Estimation

**Last updated:** 2026-08-09
**Production:** https://webapp-umber-five.vercel.app
**Repository:** `wishnetid/shopee-profit-estimation`
**Branch:** `master`
**Latest commit:** `c58e689` — `feat(income): show all raw report packages`
**Latest deployment:** Vercel Production `Ready` — `dpl_6SWf2kBAT7G1GBEd3XCDeBKSgVmz`

> Mulai dengan membaca `README.md` penuh, lalu baca file ini. Jangan langsung coding, migration, import, atau mengubah konfigurasi. Fase RAW **Order.all** dan **Income** sudah live; report berikutnya belum dipilih user.

---

## 1. Kondisi Nyata Saat Handoff

### Yang sudah selesai

- `Order.all` live sebagai RAW **current-state per item** pada `order_all`.
- `Income` live sebagai RAW **package berkala**, dengan parent import dan child table per section.
- Paket Income yang sudah di-import lolos rekonsiliasi `Summary Total yang Dilepas` terhadap signed total `Penghasilan` view `Order`.
- Halaman `/orders` dan `/income`, endpoint production `/api/orders`, `/api/income`, dan `/api/health` aktif.
- Test regression, typecheck, dan build lulus pada audit terakhir.

### Yang belum selesai

- Balance Transaction.
- Return/refund, failed delivery, cancellation.
- Master HPP final dan alokasi ke item.
- Biaya iklan.
- Financial layer: net payout, actual profit, estimation profit.
- Validasi/refactor halaman dan route Profit legacy.

**Batas penting:** jangan menganggap UI Profit lama atau table legacy sudah benar hanya karena masih ada di source.

---

## 2. Opening Procedure Wajib

1. Baca `README.md` penuh.
2. Cek working tree sebelum menyentuh file:

```bash
cd /home/yogaimawan/Dokumentasi/shopee_profit_estimation
```

```bash
git status --short
```

3. Jangan menimpa perubahan user yang belum committed.
4. Raw workbook Income dapat tampil sebagai untracked di `data_sample/`. Jangan jalankan `git add -A`, jangan commit raw report, dan jangan menghapus file tersebut tanpa arahan user.
5. Untuk perubahan database, inspeksi DDL live secara read-only dahulu. Jangan memakai `schema.sql` atau `setup-db.js` sebagai fakta database live.
6. Untuk report baru, berhenti setelah analisa dan diskusi. Coding hanya setelah user menyetujui kontraknya.

---

## 3. Kontrak Aktif — Order.all

### Grain dan identity

```text
Satu row = satu item/variasi pesanan
(no_pesanan, nomor_referensi_sku, nama_variasi)
```

- `no_pesanan` tidak cukup sebagai key karena order dapat multi-item.
- `total_pembayaran` adalah nominal order-level dan dapat berulang pada item row; jangan dijumlahkan per item.
- `jumlah`, SKU, variasi, return quantity, dan HPP nanti berada di item-level.

### Import behavior

- `Order.all` adalah current-state merge, bukan ledger append.
- Operator wajib mengisi waktu snapshot/export Shopee.
- `source_snapshot_at` dan `source_snapshot_file` menyimpan provenance.
- Snapshot lama tidak boleh overwrite state terbaru.
- Status tidak boleh mundur.
- Nilai terisi tidak boleh menjadi kosong/tersamarkan.
- Preview harus memperlihatkan row baru, update aman, identik, dan field yang ditahan.
- Import transactional; satu kegagalan membatalkan seluruh batch.

### File penting

```text
webapp/app/api/upload/route.ts
webapp/lib/order-all-import.js
webapp/test/order-all-import.test.mjs
webapp/scripts/migrate-order-all-snapshot-metadata.js
webapp/scripts/repair-order-all-currency.js
```

---

## 4. Kontrak Aktif — Income RAW Package

### Storage live

```text
income_report_imports
income_penghasilan_raw
income_adjustments_raw
income_shipping_fee_discrepancies_raw
```

### Aturan penting

- Satu workbook Income adalah satu **package import**.
- Exact SHA-256 yang pernah masuk berarti duplicate/no-op.
- Workbook berbeda dengan periode overlap tetap disimpan terpisah; jangan merge, overwrite, atau agregasi lintas package di layer RAW.
- Semua child section harus berada dalam satu DB transaction dengan parent import.
- `Summary` adalah metadata/reconciliation, bukan tabel transaksi.
- `Seller Fee` audit-only pada fase ini.

### Penghasilan punya dua view valid

```text
Order  = settlement total per No. Pesanan
Sku    = alokasi settlement per item
```

- Keduanya wajib disimpan.
- Jangan menjumlahkan view `Order` dan `Sku` bersamaan.
- Semua nominal mempertahankan tanda asli.
- Header display duplikat harus disimpan dengan canonical key berbeda.
- Income bisa memiliki order yang belum terlihat pada snapshot Order.all yang tersedia. Gunakan `LEFT JOIN`, bukan foreign key wajib.

### File penting

```text
webapp/lib/income-raw-import.js
webapp/lib/income-raw-db.js
webapp/scripts/migrate-income-raw.js
webapp/app/api/income/route.ts
webapp/app/income/page.tsx
webapp/test/income-raw-import.test.mjs
```

### Legacy yang jangan dipakai

- `income_penghasilan` bukan kontrak RAW aktif.
- Helper `previewIncome()` dan `importIncome()` legacy masih ada dalam `webapp/app/api/upload/route.ts`, tetapi jalur runtime Income yang benar memakai `parseIncomePackage()` dan `importIncomePackage()`.
- Jangan memperluas atau memperbaiki helper legacy sebagai bagian feature baru; lakukan penghapusan/refactor hanya setelah dibahas.

---

## 5. UI dan Endpoint Aktif

```text
/upload  → preview/import Order.all, Income, Master
/orders  → baca order_all
/income  → baca Income RAW package
```

Halaman `/income` saat ini menyediakan:

```text
Penghasilan → Per Pesanan / Per SKU
Penyesuaian
Selisih Ongkir
Semua package Income dalam satu tabel lintas report
```

- Dropdown `Report yang ditampilkan` sudah dihapus.
- API Income membaca semua package dan menambahkan provenance report pada setiap row.
- Pagination, search, dan sort menggunakan kontrak query yang sama-sama di-whitelist.
- `Per Pesanan` dan `Per SKU` tetap terpisah; jangan menjumlahkan keduanya.
- Summary lintas package tidak dijumlahkan karena periode Income dapat overlap.
- Tombol `Riwayat Import` masih placeholder pasif. Histori package sudah terlihat melalui tabel lintas report; tombol belum mempunyai action khusus.

### Kontrak API Income lintas package

`GET /api/income` membaca semua package Income dan melakukan join child RAW ke `income_report_imports`. Filter `importId` tidak lagi digunakan oleh UI.

Parameter yang didukung:

```text
section   = penghasilan | adjustment | shipping
view      = Order | Sku                  # untuk penghasilan
page      = default 1
limit     = 5–100, default 50
search    = istilah newline-delimited atau dipisah ||
sort      = key sort yang di-whitelist per section
direction = asc | desc
```

Setiap row combined Income membawa `income_report_import_id`, `source_file`, `report_period_from`, `report_period_to`, `imported_at`, dan `source_excel_row`. Query builder dan whitelist berada di `webapp/lib/income-query.js`.

---

## 6. Access dan Security State

- Environment source default: Basic Auth aktif.
- `DASHBOARD_AUTH_ENABLED=false` adalah public mode sementara dan melewati Basic Auth untuk page/API termasuk mutation route; same-origin/file/schema/transaction guard tetap aktif.
- Audit production terakhir menunjukkan URL dapat diakses tanpa Basic Auth. Perlakukan ini sebagai temporary public mode.
- Environment lokal dapat berbeda dengan Vercel production. Jangan menyimpulkan mode production dari `.env.local` saja.
- Jangan mengubah `DASHBOARD_AUTH_ENABLED`, credential DB, atau credential Basic Auth tanpa persetujuan eksplisit user.
- Credential historis tetap perlu dirotasi via cPanel lalu diperbarui ke `.env.local` dan Vercel pada sesi terpisah yang disetujui user.

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

---

## 7. Quality Gates

Masuk ke app directory:

```bash
cd /home/yogaimawan/Dokumentasi/shopee_profit_estimation/webapp
```

Regression tests:

```bash
npm test
```

Typecheck:

```bash
./node_modules/.bin/tsc --noEmit --incremental false
```

Build:

```bash
npm run build
```

Income RAW migration dry-run, tanpa mutation:

```bash
set -a
```

```bash
. ./.env.local
```

```bash
set +a
```

```bash
node scripts/migrate-income-raw.js
```

Setelah perubahan importer, jangan klaim selesai hanya dari test/build. Wajib preview endpoint production memakai raw file nyata dulu. Mutation import hanya jika user sudah menyetujui preview.

---

## 8. Next Scope — Diskusi Dulu

**Jangan melanjutkan coding otomatis.** Saat user memilih report berikutnya, ikuti ini:

```text
Report → Analisa struktur → Diskusi → Coding → Test → Deploy → Endpoint test nyata
```

Rekomendasi urutan, belum menjadi instruksi eksekusi:

1. **Balance Transaction**
   - Inventaris sheet/header.
   - Tipe transaksi dan tanda nominal.
   - Lokasi `No. Pesanan`, termasuk bila embedded pada deskripsi.
   - Bedakan settlement, adjustment, dan biaya iklan.
   - Tentukan grain dan duplicate policy sebelum schema/import.

2. **Return/refund, failed delivery, cancellation**
   - Validasi terhadap Order.all, Balance, dan Income.
   - Jangan menyederhanakan sebagai satu status linear tanpa bukti laporan finansial.

3. **Financial layer**
   - Diskusikan relasi order header, item, Income `Order`, Income `Sku`, HPP, biaya iklan, dan return.
   - Baru desain actual vs estimation profit.

---

## 9. Larangan Keras

- Jangan truncate/clear DB tanpa backup timestamp tervalidasi dan approval eksplisit.
- Jangan auto-import raw workbook hanya karena ditemukan di `data_sample/`.
- Jangan commit `.env.local`, raw customer report, backup DB, atau Archive.
- Jangan membangun profit dari `Order.all` saja.
- Jangan menghitung `Penghasilan Order` dan `Penghasilan Sku` sekaligus.
- Jangan menganggap aplikasi/DB legacy valid tanpa audit source dan DDL live.
- Jangan mengubah source, schema, atau Vercel env hanya untuk menyelesaikan warning kosmetik.

---

## 10. Referensi Cepat

```text
README.md                                      Kontrak lengkap dan status aktual
webapp/app/api/upload/route.ts                 Upload route + cabang importer aktif
webapp/lib/order-all-import.js                 Kontrak Order.all
webapp/lib/income-raw-import.js                Parser package Income
webapp/lib/income-raw-db.js                    Preview/transaction Income RAW
webapp/lib/income-query.js                     Query lintas package + whitelist search/sort
webapp/app/api/income/route.ts                 Query Income RAW
webapp/app/income/page.tsx                     UI Income
webapp/test/*.test.mjs                         Regression test
Archive/docs-backups/                          Backup dokumentasi lokal, di-ignore Git
```
