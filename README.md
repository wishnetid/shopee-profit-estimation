# Shopee Profit Estimation

**Last updated:** 2026-08-08
**Production:** https://webapp-umber-five.vercel.app
**Repository:** https://github.com/wishnetid/shopee-profit-estimation
**Branch:** `master`

> Baca file ini penuh sebelum menyentuh project. Kondisi saat ini: fondasi RAW untuk **Order.all** dan **Income** sudah live. Profit final, Balance, HPP, return/refund, dan iklan belum boleh diasumsikan selesai.

---

## 1. Status Fase Saat Ini

### Sudah live dan tervalidasi

1. **Order.all RAW current-state per item**
   - Disimpan pada table live `order_all`.
   - Dipakai sebagai source of truth state terbaru untuk item pesanan.
   - Workbook overlap tidak di-append sebagai histori row baru; data di-merge secara konservatif per item.

2. **Income RAW package berkala**
   - Disimpan sebagai paket report terpisah, bukan current-state upsert.
   - Satu paket Income memuat `Penghasilan`, `Adjustment`, `Shipping Fee Discrepancy`, serta metadata `Summary`.
   - Paket Income awal dari `data_sample/` sudah masuk DB dan seluruhnya lolos rekonsiliasi Summary terhadap `Penghasilan` view `Order`.

3. **Aplikasi dan jalur nyata**
   - Next.js di Vercel terhubung ke MySQL cPanel.
   - `GET /api/health`, `GET /api/orders`, dan `GET /api/income` sudah merespons dari production.
   - Test regression dan production build lulus pada audit terakhir.

### Belum dikerjakan — jangan diasumsikan valid

- Analisa dan kontrak RAW untuk **Balance Transaction**.
- Analisa return/refund, failed delivery, dan cancellation terhadap laporan finansial.
- Mapping HPP final serta alokasi pendapatan/biaya order-level ke item-level.
- Model **estimasi profit** dan **actual/confirmed profit**.
- Alokasi biaya iklan.
- Validasi atau refactor halaman/route Profit lama.
- Rotasi credential DB yang pernah muncul pada riwayat source lama.

---

## 2. Workflow Wajib

```text
Report → Analisa struktur → Diskusi → Coding → Test → Deploy → Endpoint test nyata
```

Aturan utama:

1. Jangan coding logic report yang belum dianalisa.
2. Jangan menyusun net payout atau profit dari `Order.all` saja.
3. Jangan menghapus, truncate, atau re-import DB tanpa backup timestamp dan persetujuan eksplisit user.
4. Jangan menyamakan overlap export dengan duplicate bisnis.
5. Jangan memasukkan credential ke source, Git, dokumentasi, terminal output, atau chat.
6. Dokumentasi business rule harus logic-only: gunakan field, key, pattern, dan rule; jangan menjadikan statistik atau posisi Excel sebagai aturan.
7. Gunakan DDL live secara read-only sebelum migration. `schema.sql` legacy bukan source of truth database production.

---

## 3. Order.all — Kontrak RAW Current-State

### Source dan grain

- Workbook harus memiliki sheet `orders` dengan kontrak header export Shopee yang dikenal.
- Satu row berarti satu item/variasi dalam satu pesanan.
- Identity row live:

```text
(no_pesanan, nomor_referensi_sku, nama_variasi)
```

- `no_pesanan` sendiri bukan unique row karena satu pesanan dapat memiliki beberapa item/variasi.
- Field item: SKU, variasi, quantity, returned quantity, dan HPP nanti berada pada grain item.
- Field seperti `total_pembayaran` berada pada grain order dan bisa berulang pada beberapa item row. Jangan menjumlahkannya langsung per item.

### Snapshot dan freshness

- Import `Order.all` adalah merge state terbaru per item, bukan append ledger.
- Operator wajib mengisi waktu snapshot/export dari Shopee.
- Provenance disimpan melalui `source_snapshot_at` dan `source_snapshot_file`.
- Snapshot lebih lama tidak boleh menimpa field state terbaru.
- Status tidak boleh mundur.
- Nilai terisi tidak boleh diturunkan menjadi kosong atau versi tersamarkan seperti `******`.
- Bila waktu snapshot belum membuktikan data incoming lebih baru, konflik nilai terisi ditahan secara konservatif.
- Preview harus membedakan row baru, update aman, identik, dan field yang dipertahankan.

### Validasi sebelum import

- Header schema harus valid.
- Composite key tidak boleh kosong.
- Composite key duplicate di dalam workbook harus ditolak sebelum preview/import.
- Nominal IDR bertitik harus diparse sebagai nominal penuh, bukan pecahan desimal.
- Seluruh import berada dalam satu database transaction; gagal batch berarti rollback seluruh snapshot.

Implementasi utama:

```text
webapp/app/api/upload/route.ts
webapp/lib/order-all-import.js
webapp/test/order-all-import.test.mjs
```

---

## 4. Income — Kontrak RAW Package

### Prinsip dasar

Income adalah **paket report** berkala. Jangan dipaksa menjadi satu table current-state atau di-upsert lintas export berdasarkan `No. Pesanan`.

Setiap paket menyimpan:

```text
income_report_imports
  Parent/provenance per workbook: nama file, SHA-256, periode, Summary, hasil rekonsiliasi.

income_penghasilan_raw
  Seluruh row Penghasilan view Order dan Sku.
  Identity RAW: (income_report_import_id, source_excel_row).

income_adjustments_raw
  Event Adjustment per import + source_excel_row.

income_shipping_fee_discrepancies_raw
  Exception Selisih Ongkir per import + source_excel_row.
```

### Sheet dan fungsi

- `Penghasilan` adalah sumber settlement RAW utama.
- `Summary` adalah metadata dan target rekonsiliasi; bukan tabel transaksi.
- `Adjustment` adalah event terpisah, bukan nilai yang otomatis ditambahkan ke setiap payout.
- `Shipping Fee Discrepancy` adalah exception/audit ongkir.
- `Seller Fee` bersifat audit-only pada fase ini; bukan source payout/profit utama.

### Dua grain Penghasilan

- **`Order`**: total settlement per `No. Pesanan`; dipakai untuk rekonsiliasi dan tampilan order-level.
- **`Sku`**: rincian/alokasi settlement per item; harus disimpan untuk HPP dan profit item-level nanti.
- Jangan menghitung kedua view bersama-sama karena akan double count.
- Semua nominal disimpan dengan tanda sumber asli. Jangan memakai `ABS()` atau membalik tanda sebelum model financial disetujui.

### Ketentuan import

1. Exact SHA-256 yang sudah ada adalah duplicate/no-op.
2. Workbook berbeda walaupun periodenya overlap tetap disimpan sebagai RAW package terpisah.
3. Semua section satu workbook di-import dalam satu transaction.
4. Summary `Total yang Dilepas` harus cocok dengan signed total `Penghasilan` view `Order`; mismatch memblok import.
5. Parser mencari header berdasarkan nama field yang diperlukan, bukan asumsi posisi header.
6. Header display yang sama harus mempunyai canonical key berbeda agar payload tidak tertimpa.
7. Income boleh memiliki order yang belum ada pada snapshot `Order.all` yang tersedia karena tanggal dana dilepas dan waktu pesanan dibuat berbeda. Gunakan `LEFT JOIN`; jangan membuat foreign key wajib ke `order_all`.

Implementasi utama:

```text
webapp/lib/income-raw-import.js
webapp/lib/income-raw-db.js
webapp/scripts/migrate-income-raw.js
webapp/app/api/income/route.ts
webapp/app/income/page.tsx
webapp/test/income-raw-import.test.mjs
```

---

## 5. Data Model Live dan Batas Legacy

### Source of truth aktif

```text
order_all
income_report_imports
income_penghasilan_raw
income_adjustments_raw
income_shipping_fee_discrepancies_raw
```

### Artefak legacy — jangan dijadikan acuan baru

- Table `orders` bukan source of truth untuk `Order.all`.
- Table `income_penghasilan` adalah artefak legacy dan bukan kontrak Income RAW.
- Route/halaman Profit lama belum tervalidasi terhadap fondasi RAW baru.
- `webapp/database/schema.sql` dan `webapp/scripts/setup-db.js` tidak boleh dipercaya tanpa membandingkan DDL live.
- Ada helper Income legacy dalam `webapp/app/api/upload/route.ts`; jalur runtime Income yang benar menggunakan `parseIncomePackage()` dan `importIncomePackage()`. Jangan memperluas helper legacy itu.

---

## 6. UI dan Jalur Operasional Saat Ini

### Halaman aktif

```text
/upload  → preview dan import Order.all / Income / Master
/orders  → pembacaan order_all
/income  → pembacaan paket Income RAW
```

Di halaman Income:

```text
Penghasilan
  ├─ Per Pesanan (view Order)
  └─ Per SKU      (view Sku)
Penyesuaian
Selisih Ongkir
Semua package Income dalam satu tabel lintas report
```

- Dropdown `Report yang ditampilkan` sudah dihapus.
- Tabel Income membaca seluruh package melalui `JOIN income_report_imports` dan pagination.
- Setiap row membawa provenance report: file, periode, import ID, view, dan source row.
- `Per Pesanan` dan `Per SKU` tetap terpisah agar settlement tidak double count.
- Summary `Total yang Dilepas` tidak dijumlahkan lintas package karena periode export dapat overlap.
- `Adjustment` dan `Selisih Ongkir` tetap menjadi section terpisah karena struktur row dan maknanya berbeda.

---

## 7. Akses, Environment, dan Security

### Environment names

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

- Local development memakai `webapp/.env.local`.
- Production memakai Vercel Production Environment Variables.
- Source default adalah protected Basic Auth.
- `DASHBOARD_AUTH_ENABLED=false` adalah mode public sementara yang juga melewati pemeriksaan Basic Auth di mutating route; same-origin, schema, transaction, dan file guard tetap berlaku.
- Audit production terakhir menunjukkan endpoint dapat dibuka tanpa Basic Auth. Ini harus diperlakukan sebagai **temporary public mode** sampai user memutuskan mengaktifkan proteksi lagi.
- Jangan mengubah mode access atau credential tanpa persetujuan eksplisit user.

### Raw data dan Git

- `Archive/` di-ignore karena berisi backup lokal/database/customer data.
- Raw workbook Income baru dapat muncul sebagai untracked file di `data_sample/`.
- Jangan memakai `git add -A` atau commit raw report tanpa arahan eksplisit user.

---

## 8. Verifikasi Aman

Jalankan dari aplikasi:

```bash
cd /home/yogaimawan/Dokumentasi/shopee_profit_estimation/webapp
```

Test regression:

```bash
npm test
```

Typecheck:

```bash
./node_modules/.bin/tsc --noEmit --incremental false
```

Build production lokal:

```bash
npm run build
```

Dry-run migration Income RAW, tanpa mutasi:

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

Health production:

```bash
curl -sS https://webapp-umber-five.vercel.app/api/health
```

Jika Basic Auth sudah diaktifkan lagi, gunakan credential environment lokal tanpa menulis nilai credential ke command atau dokumentasi.

---

## 9. Langkah Berikutnya

Income lintas package sudah diimplementasikan dan lolos test/typecheck/build. Pilihan report berikutnya perlu diputuskan bersama user.

Urutan yang direkomendasikan:

1. Analisa **Balance Transaction**: struktur, tipe transaksi, lokasi `No. Pesanan`, settlement, adjustment, dan biaya iklan.
2. Analisa return/refund, failed delivery, dan cancellation terhadap Balance/Income.
3. Diskusikan model financial: order header, item, settlement package, HPP, dan alokasi biaya.
4. Baru desain financial layer, actual profit, dan estimation profit.

Untuk handoff detail agent berikutnya, baca `NEXTAGENTS.md` setelah README ini.
