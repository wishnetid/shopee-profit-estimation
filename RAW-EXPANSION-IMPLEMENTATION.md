# RAW Expansion — Balance, Order Exceptions, dan Ads

**Status:** Implementasi lokal tervalidasi; DDL live sudah dibuat dan preview-only sample real sudah lulus. Commit/deploy production masih pending.
**Dibuat:** 2026-08-12
**Fix audit:** 2026-08-12
**Target app:** `webapp/`
**Production saat dokumen dibuat:** `https://webapp-umber-five.vercel.app`

> Dokumen ini adalah handoff implementasi. Baca penuh sebelum mengubah parser, schema, upload route, UI, atau migration. Scope ini hanya menambah penyimpanan dan pembacaan RAW. Tidak ada kalkulasi profit, dedup bisnis, atau penggabungan finansial otomatis. Implementasi lokal sudah melewati unit test, typecheck, dan production build. DDL live sudah dibuat dari backup tervalidasi, lalu preview-only sembilan sample real lulus tanpa membuat parent/child RAW. Import real dan post-import audit tetap belum dilakukan.

---

## 1. Goal

Menambah dukungan preview-first, import RAW package, dan halaman baca untuk lima report Shopee berikut yang semuanya terikat ke store aktif:

```text
1. Balance Transaction Report
2. Order Cancellation
3. Order Failed Delivery
4. Order Return/Refund
5. Ads Transaction Ledger
```

Hasil akhir yang dimaksud adalah data source/provenance lengkap dan dapat diaudit. Hasil akhir **bukan** perhitungan net payout, biaya iklan final, actual profit, atau estimation profit.

---

## 2. Boundary yang Tidak Boleh Dilanggar

### Tidak boleh dilakukan dalam scope ini

- Jangan mengubah logic `Order.all RAW`, `Income RAW`, dan `SKU Master RAW` yang sudah aktif.
- Jangan memakai tabel legacy `balance_transactions` sebagai storage baru.
- Jangan menghitung `Penghasilan dari Pesanan` Balance sebagai profit.
- Jangan menghitung top-up `Isi Ulang Saldo Iklan/Koin Penjual` di Balance sebagai biaya iklan final.
- Jangan menjumlahkan Income `Order` dan `Sku` bersama-sama.
- Jangan melakukan `INNER JOIN` yang menyembunyikan RAW record tanpa pasangan report lain.
- Jangan membuat foreign key wajib dari RAW baru ke `order_all`; report periodik dapat memuat pesanan di luar snapshot Order.all yang tersedia.
- Jangan menghapus, clear, truncate, atau import workbook real saat development tanpa backup tervalidasi dan persetujuan eksplisit user.
- Jangan auto-import workbook hanya karena berada di `data_sample/`.

### Prinsip operasional

```text
Report → analisa struktur → preview → user review → import → audit source-to-DB
```

Semua import tetap harus melalui preview. `action=preview` tidak boleh menulis database.

---

## 3. Bukti Sample yang Sudah Diaudit

Folder fixture baru:

```text
/home/yogaimawan/Dokumentasi/shopee_profit_estimation/data_sample/new_sample/
```

Artefak yang sudah diperiksa:

```text
Order.cancellation.20260707_20260807.xlsx
Order.failed_delivery.20260707_20260807.xlsx
Order.return_refund.20260707_20260807.xls
tacticalized_adwords_bill_2026-08-12.csv
```

Semua cukup untuk mendesain parser RAW karena masing-masing memiliki metadata atau header bisnis yang diperlukan.

### Cross-reference yang sudah terbukti

1. **Balance Penghasilan vs Income / Order**
   - Untuk workbook Balance dan Income dengan periode sama, `No. Pesanan` dan nominal signed `Penghasilan dari Pesanan` cocok secara penuh dengan Income `Penghasilan / Order`.
   - Ini membuktikan hubungan audit settlement, bukan izin untuk membuat profit layer.

2. **Failed Delivery vs Balance Penyesuaian**
   - Balance `Penyesuaian` dapat berisi `No. Pesanan` langsung atau hanya di `Deskripsi`.
   - Pola deskripsi failed delivery memuat ID pesanan setelah teks mengenai biaya premi pesanan gagal terkirim.
   - `Order.failed_delivery` dan Balance memiliki relasi audit ini, tetapi tetap masing-masing RAW package independen.

3. **Return/Refund vs Balance Penghasilan Negatif / Penyesuaian**
   - Sebagian order return/refund muncul pada Balance sebagai `Penghasilan dari Pesanan` bernilai negatif.
   - Ada juga pola `Penyesuaian` karena pengembalian barang/dana setelah dana dilepaskan.
   - Nominal dan event tidak boleh disimpulkan sebagai satu formula tanpa financial layer yang disetujui.

4. **Ads Ledger vs Balance top-up**
   - CSV Ads memuat transaksi `Isi Saldo` dan `Deduction for Product Ad`.
   - Balance memuat mutasi `Isi Ulang Saldo Iklan/Koin Penjual`.
   - Kedua ledger tidak boleh dipaksa reconcile satu-banding-satu atau dianggap identik. Simpan terpisah agar fase ads nanti dapat membedakan top-up, pemakaian iklan, refund, dan saldo.

5. **Cancellation vs Failed Delivery**
   - Failed Delivery memiliki irisan dengan report Cancellation, tetapi membawa metadata tambahan seperti status pengiriman gagal dan klaim/kompensasi.
   - Keduanya tidak boleh digabung atau dideduplicate lintas report pada RAW layer.

---

## 4. Model Data Baru

Seluruh tabel berikut adalah **store-scoped**. Nama tabel dan identity ini adalah kontrak target; sebelum migration wajib audit DDL live read-only.

### 4.1 Parent package

```text
balance_report_imports
order_cancellation_report_imports
order_failed_delivery_report_imports
order_return_refund_report_imports
ads_report_imports
```

Common fields yang harus tersedia pada setiap parent:

```text
id
store_id
source_file
source_sha256
report_period_from
report_period_to
metadata_payload
headers_payload
warnings_payload
imported_at
```

Perbedaan khusus:

```text
balance_report_imports
  summary_payload
  summary_total_saldo_masuk
  summary_total_saldo_keluar
  summary_jumlah_transaksi_masuk
  summary_jumlah_transaksi_keluar
  ledger_continuity_status

ads_report_imports
  source_format              -- csv
  currency
  seller_username
  source_store_reference
```

### 4.2 Child RAW rows

```text
balance_transactions_raw
order_cancellation_raw
order_failed_delivery_raw
order_return_refund_raw
ads_transactions_raw
```

Common child fields:

```text
id
<parent_import_id>
source_excel_row OR source_csv_row
raw_payload
```

Identity RAW setiap child:

```text
(balance_report_import_id, source_excel_row)
(order_cancellation_report_import_id, source_excel_row)
(order_failed_delivery_report_import_id, source_excel_row)
(order_return_refund_report_import_id, source_excel_row)
(ads_report_import_id, source_csv_row)
```

### 4.3 Field terindeks untuk read/audit

#### `balance_transactions_raw`

```text
transaction_at
type_transaksi
description
no_pesanan_direct
no_pesanan_extracted
jenis_transaksi
jumlah_signed
status
saldo_akhir
```

Aturan ID order Balance:

```text
order_reference = COALESCE(no_pesanan_direct, no_pesanan_extracted)
```

- `no_pesanan_direct` hanya diisi jika kolom `No. Pesanan` bukan kosong atau `-`.
- `no_pesanan_extracted` hanya diisi bila pola ID pesanan valid ditemukan dalam `Deskripsi`.
- Jangan menimpa nilai direct dengan extraction.
- Regex extraction adalah alat audit; `raw_payload` tetap sumber lengkap dan tidak berubah.

#### `order_cancellation_raw`

```text
no_pesanan
status_pesanan
alasan_pembatalan
status_pembatalan_pengembalian
no_resi
nomor_referensi_sku
nama_variasi
jumlah
subtotal_pesanan
total_pembayaran
waktu_pesanan_dibuat
waktu_pesanan_selesai
```

#### `order_failed_delivery_raw`

```text
no_pesanan
status_pesanan
status_pembatalan_pengembalian
status_pengiriman_gagal
no_resi
nomor_referensi_sku
nama_variasi
jumlah
subtotal_pesanan
total_pembayaran
waktu_pesanan_dibuat
waktu_pesanan_selesai
status_klaim
tanggal_klaim_diajukan
tanggal_klaim_disetujui
tanggal_klaim_dicairkan
tanggal_klaim_ditolak
jumlah_kompensasi
```

#### `order_return_refund_raw`

```text
no_pengembalian
no_pesanan
waktu_pesanan_dibuat
kode_variasi
variasi
status_pembatalan_pengembalian
tipe_pengembalian
jumlah_produk_dikembalikan
solusi_pengembalian
alasan_pengembalian
total_pengembalian_dana
waktu_pengembalian_dana_selesai
status_pengembalian_barang
pelepasan_dana_signed
ongkos_kirim_pengiriman_signed
ongkos_kirim_pengembalian_signed
jumlah_kompensasi_signed
```

#### `ads_transactions_raw`

```text
sequence_number
transaction_date
description
jumlah_signed
note
```

Semua monetary field mempertahankan tanda source. Parser perlu menangani format nominal seperti `RP 82.500`, `-111000`, dan numeric Excel tanpa `Math.abs()`.

---

## 5. Duplicate dan Import Policy

### Parent package

```text
Unique: (store_id, source_sha256)
```

- Exact file/hash pada store yang sama: duplicate/no-op.
- Exact file/hash pada store lain: boleh diimport sebagai package store lain.
- File berbeda dengan report period overlap: tetap package RAW terpisah.
- Tidak ada upsert/deduplication bisnis lintas workbook.

### Transaction dan error safety

1. Validasi artifact, report type, metadata, header, dan parser sebelum membuat transaction DB.
2. `action=preview` menjalankan parser yang sama dengan import, lalu membaca duplicate scope dan hasil audit tanpa DB mutation.
3. `action=import` membuka satu DB transaction untuk parent + seluruh child row.
4. Gagal satu child insert harus rollback parent dan seluruh child row.
5. Parent dan child baru harus memakai foreign key `RESTRICT`, seperti Income RAW dan SKU RAW.
6. Counter hasil import harus memakai result DB nyata, bukan panjang array input.

---

## 6. Parser Contracts

### 6.1 Report classifier pada `POST /api/upload`

Classifier saat ini hanya mengenal `order_all`, `income`, dan `master`. Tambahkan tipe berikut tanpa melemahkan kontrak report lama:

```text
balance
order_cancellation
order_failed_delivery
order_return_refund
ads_ledger
```

Urutan classifier harus spesifik agar report exceptions tidak salah dibaca sebagai `Order.all` biasa:

```text
1. balance by semantic transaction headers
2. failed delivery by required failed-delivery header
3. return/refund by required return header
4. cancellation by cancellation-specific header set
5. existing Order.all
6. existing Income
7. existing Master SKU
8. reject unknown report with HTTP 400
```

Jangan mengklasifikasikan berdasarkan nama file saja. Nama file hanya provenance; structure workbook/CSV adalah bukti classifier.

### 6.2 Balance parser

Input:

```text
Excel workbook
Sheet expected: Transaction Report
```

Aturan:

1. Cari header secara semantik, bukan nomor baris.
2. Required labels:

```text
Tanggal Transaksi
Tipe Transaksi
Deskripsi
No. Pesanan
Jenis Transaksi
Jumlah
Status
Saldo Akhir
```

3. Parse metadata `Username (Penjual)`, `Dari`, `Ke`, dan ringkasan melalui label.
4. Sum seluruh `Jumlah` positif dan negatif secara signed.
5. Cocokkan total signed positif dengan `Total Saldo Masuk` dan total signed negatif dengan `Total Saldo Keluar`.
6. Validasi ledger continuity dari urutan source. Untuk source descending, saldo row yang lebih lama harus sesuai saldo row lebih baru dikurangi nominal row lebih baru.
7. Jika summary atau ledger continuity mismatch, preview menghasilkan `canImport: false`; import diblok fail-closed.
8. Variasi tipe transaksi tidak boleh di-hardcode sebagai whitelist. Simpan semua type/description RAW, termasuk nilai baru pada export berikutnya.

### 6.3 Cancellation parser

Input:

```text
Excel workbook
Sheet expected: orders
```

Aturan:

1. Required labels harus membedakan Cancellation dari Order.all dan Failed Delivery, termasuk `Alasan Pembatalan`.
2. Semua row source non-empty disimpan pada grain item/variasi.
3. Tidak ada unique business key antar workbook. Identity hanya parent import + source Excel row.
4. Jangan menolak report karena `Total Pembayaran` bernilai nol; ini merupakan kondisi report cancellation yang valid.

### 6.4 Failed Delivery parser

Input:

```text
Excel workbook
Sheet expected: orders
```

Aturan:

1. Required label pembeda utama: `Status pengiriman gagal`.
2. Bila tersedia, preserve semua field klaim dan kompensasi RAW.
3. Tidak boleh menyimpulkan `Jumlah Kompensasi` sebagai revenue/cost final.
4. Semua row disimpan item-level walaupun `No. Pesanan` muncul berulang karena multi-item order.

### 6.5 Return/Refund parser

Input:

```text
Legacy .xls atau .xlsx
Sheet may vary; semantic header required
```

Aturan:

1. Jangan bergantung pada nama sheet `Sheet1`.
2. Required labels minimal:

```text
No. Pengembalian
No. Pesanan
Status Pembatalan/ Pengembalian
Tipe Pengembalian
Total Pengembalian Dana
Pelepasan Dana
```

3. Satu `No. Pengembalian` atau `No. Pesanan` dapat memiliki beberapa item row. Pertahankan semua row.
4. `Total Pengembalian Dana`, `Pelepasan Dana`, dan ongkir harus diparse signed dan disimpan RAW. Jangan dijumlahkan sebagai final per-order karena nilai dapat berulang pada item row.
5. Status return yang selesai, dibatalkan, atau menunggu semua tetap RAW valid. Jangan filter hanya yang selesai.

### 6.6 Ads CSV parser

Input:

```text
CSV UTF-8, optional BOM
```

Aturan:

1. Parse metadata melalui label, bukan fixed line:

```text
Mata uang:
Username:
Tanggal:
ID Toko:
```

2. Cari header row semantik:

```text
Urutan
Waktu
Deskripsi
Jumlah
Catatan
```

3. Date format source `DD/MM/YYYY` harus diparse sebagai tanggal kalender yang valid.
4. `Jumlah` disimpan signed.
5. Jangan mengelompokkan atau menggabungkan transaksi dengan deskripsi sama; event harian dapat memiliki nominal sama.
6. Jangan reconcile CSV Ads terhadap Balance pada parser/import gate. Perbandingan itu hanya audit layer kemudian.

---

## 7. UI dan Routing Target

### 7.1 Upload Manager

Tetap gunakan halaman tunggal:

```text
webapp/app/upload/page.tsx
webapp/app/api/upload/route.ts
```

Update UI:

- Ubah copy agar menyebut seluruh report RAW yang didukung.
- Terima `.xlsx`, `.xls`, dan `.csv`.
- Tetap meminta `source_snapshot_at` hanya untuk `Order.all`; report package lain mengambil periode dari metadata source.
- Preview perlu menampilkan:

```text
Report type
Store target
Source file
Source SHA-256
Report period
Detected sheet/format
Header validity
Parent duplicate status
Section/transaction counts
Balance reconciliation dan ledger continuity bila report Balance
Warnings parser
canImport
```

- Import button hanya aktif bila `canImport` true dan preview masih terikat dengan `previewStoreId` yang sama dengan store aktif.
- Perubahan store harus membatalkan selected file, preview, dan confirmation seperti perilaku existing upload.

### 7.2 Menu baru

Tambahkan pada desktop sidebar dan mobile navigation di:

```text
webapp/app/layout.tsx
```

Routes:

```text
/balance
/exceptions
/ads
```

Menu tetap mobile-first. Jangan menambah semua exception sebagai tombol navigasi utama terpisah; gunakan satu halaman `Order Exceptions RAW` dengan tab:

```text
Cancellation
Failed Delivery
Return/Refund
```

### 7.3 Halaman `Balance RAW`

Target file:

```text
webapp/app/balance/page.tsx
```

Kontrak tampilan:

```text
Tab: Transactions | Import History
```

Transactions:

- Default semua package Balance milik store aktif.
- Table read-only dengan provenance: report file, period, import ID, source Excel row.
- Filter tipe transaksi, jenis transaksi, status, periode, dan multi-line search.
- Display direct and extracted order reference secara jelas; jangan menjadikan extraction sebagai mutasi source.
- Jangan tampilkan total tersebut sebagai profit.

Import History:

- Menampilkan package metadata, source SHA, summary masuk/keluar, serta status reconciliation/ledger continuity.

### 7.4 Halaman `Order Exceptions RAW`

Target file:

```text
webapp/app/exceptions/page.tsx
```

Kontrak tampilan:

```text
Tabs: Cancellation | Failed Delivery | Return/Refund
```

- Masing-masing tab membaca package RAW store aktif, lintas package dengan provenance per row.
- Tab Failed Delivery menampilkan status gagal kirim, klaim, dan kompensasi jika source menyediakannya.
- Tab Return/Refund menampilkan status, solusi, total refund source, pelepasan dana source, dan ongkir source tanpa menghitung total per order.
- Jangan menyembunyikan status dibatalkan atau pending.

### 7.5 Halaman `Ads RAW`

Target file:

```text
webapp/app/ads/page.tsx
```

Kontrak tampilan:

```text
Tabs: Transactions | Import History
```

- Transactions: semua event Ads ledger store aktif dengan report file, period, source CSV row, date, description, signed amount, catatan.
- Import History: metadata seller/currency/store source reference serta SHA.
- Tidak boleh menampilkan label `Biaya Iklan Final` atau menggabungkan dengan Balance.

---

## 8. API Target

### Existing route extended

```text
POST /api/upload
```

Request existing:

```text
file
storeId
action=preview|import
source_snapshot_at   -- hanya Order.all
source_snapshot_file
```

Response baru harus tetap mempunyai common contract supaya `UploadPage` tidak membuat asumsi report Order.all:

```text
reportType
fileName
fileSize
storeId
sha256
reportPeriod
sheetName OR sourceFormat
headers
previewColumns
previewRows
warnings
errors
canImport
duplicateHash
sections OR summary
```

### Read-only routes baru

```text
GET /api/balance?storeId=<id>&page=&limit=&search=&type=&kind=&status=&sort=&direction=
GET /api/exceptions?storeId=<id>&section=cancellation|failed_delivery|return_refund&page=&limit=&search=&sort=&direction=
GET /api/ads?storeId=<id>&page=&limit=&search=&description=&sort=&direction=
```

Rules seluruh route:

- Basic Auth existing wajib tetap berlaku.
- `storeId` valid dan existing wajib dicek server-side memakai helper existing.
- Pagination harus memakai helper/guard existing.
- Search multi-line memakai pattern query existing, parameterized SQL, dan whitelist sort column.
- `section`, `sort`, `direction`, `limit`, filter values invalid harus HTTP 400.
- Semua query parameterized; tidak boleh string interpolation dari input user.
- Read-only route tidak memicu import, reconciliation ulang, atau mutasi database.

---

## 9. File Plan

### Create

```text
webapp/lib/balance-raw-import.js
webapp/lib/balance-raw-db.js
webapp/lib/exception-raw-import.js
webapp/lib/exception-raw-db.js
webapp/lib/ads-raw-import.js
webapp/lib/ads-raw-db.js
webapp/lib/balance-query.js
webapp/lib/exception-query.js
webapp/lib/ads-query.js
webapp/app/balance/page.tsx
webapp/app/exceptions/page.tsx
webapp/app/ads/page.tsx
webapp/app/api/balance/route.ts
webapp/app/api/exceptions/route.ts
webapp/app/api/ads/route.ts
webapp/scripts/migrate-raw-expansion.js
webapp/test/balance-raw-import.test.mjs
webapp/test/exception-raw-import.test.mjs
webapp/test/ads-raw-import.test.mjs
webapp/test/raw-expansion-api.test.mjs
```

### Modify

```text
webapp/app/api/upload/route.ts
webapp/app/upload/page.tsx
webapp/app/layout.tsx
webapp/database/schema.sql
webapp/package.json                 -- only if a required dependency is proven missing
README.md
NEXTAGENTS.md
webapp/README.md
```

### Preserve unchanged unless a proven integration requirement appears

```text
webapp/lib/order-all-import.js
webapp/lib/income-raw-import.js
webapp/lib/income-raw-db.js
webapp/lib/sku-raw-import.js
webapp/lib/sku-raw-db.js
```

---

## 10. Database Migration Procedure

Before running a migration:

1. Inspect live DDL read-only. `database/schema.sql` is documentation, not production truth.
2. Inspect existing table names and foreign keys.
3. Create a timestamped SQL/DDL backup according to approved DB backup procedure.
4. Run migration in a controlled environment.
5. Verify tables, columns, indexes, unique keys, and foreign keys with `SHOW CREATE TABLE` / `DESCRIBE`.
6. Verify no current store data was modified.
7. Do not import production workbooks during migration smoke testing.

Target foreign-key deletion behavior:

```text
child RAW rows reference parent imports with ON DELETE RESTRICT
parent imports reference stores with ON DELETE RESTRICT
```

Follow-up work may later extend selected-store clear to include these new parents/children. That destructive behavior is explicitly **out of scope** for this first RAW expansion unless separately specified, tested, and approved.

---

## 11. TDD and Verification Plan

### Parser test fixtures

Use the specific files under `data_sample/new_sample/` only as local fixtures. Do not commit or alter raw user files.

### Balance tests

Must prove:

- semantic header detection works despite metadata above transaction table;
- metadata and report period extraction use labels;
- signed income/outgoing summary reconciliation;
- ledger continuity passes on valid fixture;
- malformed/missing required header blocks parser;
- summary mismatch blocks `canImport`;
- direct order reference has priority over extracted reference;
- order ID extraction from Penyesuaian description works;
- unknown transaction type stays valid RAW, not rejected.

### Exception tests

Must prove:

- classifier differentiates Cancellation, Failed Delivery, Return/Refund, and Order.all;
- all item rows survive including multi-item orders;
- Failed Delivery preserves claim fields;
- Return/Refund handles `.xls` and semantic header detection;
- Return/Refund does not collapse rows with same order/refund ID;
- monetary source fields retain sign;
- missing required header returns blocked parser result.

### Ads tests

Must prove:

- CSV UTF-8 BOM handling;
- metadata parsed by labels;
- semantic header detection;
- date parser accepts actual `DD/MM/YYYY` source values and rejects impossible calendar dates;
- signed positive top-up and negative deduction preserved;
- same description/amount on different source rows remains independent;
- malformed header blocks import.

### DB/import tests

Must prove per report type:

- `(store_id, source_sha256)` duplicate is no-op only in the same store;
- same hash can exist in another store;
- child identity is source row scoped to parent;
- parent/child import rolls back on injected child failure;
- preview never writes a parent or child;
- raw payload remains complete;
- query is scoped by store and cannot leak rows from another store.

### API/UI tests and smoke checks

Must prove:

- unsupported/misclassified file returns HTTP 400 before DB transaction;
- read routes reject invalid store, section, pagination, and unsafe sort with HTTP 400;
- no Basic Auth remains 401;
- normal read-only responses include provenance and only active-store data;
- `/balance`, `/exceptions`, `/ads` render in production build;
- sidebar/mobile navigation exposes each route;
- changing active store invalidates page payload / upload preview state;
- `npm test`, TypeScript check, `npm run build`, and `git diff --check` pass;
- lint must be reported separately because existing baseline lint issues are known.

### Real report release gate

After code review and only after explicit user approval:

1. Send one exact real workbook/CSV via `action=preview` to the canonical production alias.
2. Bind result to full source path and SHA-256.
3. Compare database state before and after preview to prove non-mutation.
4. Report classifier, target store, hash duplicate status, parser warnings, balance reconciliation/continuity when applicable, and `canImport`.
5. Wait for explicit approval before `action=import`.
6. After import, perform source-to-DB audit: parent hash, section row identity, orphan check, store scope, and deployed read API response.

---

## 12. Implementation Order

1. Re-read this file plus `README.md`, `NEXTAGENTS.md`, and `webapp/AGENTS.md`.
2. Audit Git state and preserve all untracked user workbooks/backups.
3. Audit live DDL read-only and document differences from target schema before migration.
4. Add failing parser tests for Balance; implement minimal Balance parser.
5. Add failing parser tests for Cancellation/Failed Delivery/Return-Refund; implement minimal exception parsers.
6. Add failing parser tests for Ads CSV; implement minimal Ads parser.
7. Add migrations and DB helpers; verify transactional parent/child storage with test DB/mocks.
8. Extend upload classifier and preview/import route; test wrong-type rejection and preview non-mutation.
9. Add read query helpers and route handlers; test scope, pagination, sort, and auth boundary.
10. Add `/balance`, `/exceptions`, `/ads` pages and navigation; verify mobile layout.
11. Update documentation only after source behavior is verified.
12. Run full test/type/build/diff checks.
13. Obtain independent read-only review after the final source edit.
14. Commit only approved source/test/docs paths explicitly. Never `git add -A`.
15. Push/deploy only with explicit user authorization.
16. Run production preview-only smoke only with explicit user authorization.

---

## 13. Known Risks and Decision Log

### Risk: report structure can drift

Mitigation: semantic header detection, raw payload preservation, reject unknown/missing required contracts before import, then add a fixture after user supplies a changed export.

### Risk: report overlap creates apparent duplicates

Mitigation: package provenance and source-row identity. Do not deduplicate across report packages.

### Risk: same order exists at multiple grains

Mitigation: exception reports remain item-level RAW. Return/refund and cancellation values may be repeated across item rows; do not aggregate in this phase.

### Risk: Balance/Ads monetary events may look equivalent

Mitigation: maintain separate packages/tables. Treat comparisons only as a future audit feature.

### Risk: destructive Settings path becomes incomplete after new tables

Mitigation: do not silently modify clear/delete behavior within this scope. Any extension of `clear_store` must be a dedicated, separately reviewed change with FK order, confirmation behavior, and store-isolation tests.

### Open decisions deliberately deferred

```text
- Final Balance × Income reconciliation/audit dashboard
- Ads top-up vs actual spend vs refund accounting rule
- Return/refund impact on actual profit
- Failed delivery claim/compensation treatment
- HPP allocation and product cost mapping
- Net payout formula
- Actual profit and estimation profit formula
- Whether store-clear should include each new RAW package
```

---

## 14. Recovery / Error Triage Procedure

Jika implementasi error, agent berikutnya wajib:

1. Baca `README.md`, `NEXTAGENTS.md`, lalu dokumen ini penuh.
2. Jangan mengedit source sebelum membedakan error parser, migration/DDL, DB transaction, upload route, query route, UI state, atau deployment.
3. Ikat analisa ke file source yang exact dan SHA-256, jangan menggeneralisasi dari workbook periode lain.
4. Reproduksi lokal memakai parser production yang sama.
5. Untuk import route, coba `action=preview` dulu; jangan pakai `action=import` untuk debugging.
6. Pisahkan bukti berikut dalam laporan:

```text
parser result
preview API result
live DDL result
DB state
read API result
rendered UI result
```

7. Jika ada report classifier mismatch, jangan melemahkan classifier. Inspect semantic header source dan branch route yang benar terlebih dahulu.
8. Jika ada migration failure, stop sebelum mutasi lanjutan; inspect `SHOW CREATE TABLE`, transaction/error SQL, dan rollback state.
9. Jika ada perbedaan financial nominal, simpan RAW dan laporkan sebagai audit mismatch. Jangan "memperbaiki" nominal source atau membuat formula baru tanpa diskusi.

---

## 15. Completion Definition

Scope ini dianggap complete hanya bila semua poin berikut terbukti:

```text
[ ] Lima report baru terdeteksi dari structure, bukan nama file saja
[ ] Preview-first berjalan untuk setiap report tanpa DB mutation
[ ] Parent/child RAW storage per store dan package provenance bekerja
[ ] Exact hash duplicate scoped per store
[ ] Balance reconciliation + ledger continuity gate bekerja
[ ] Exception dan Ads source rows lengkap, bertanda asli, dan tidak teragregasi
[ ] /balance, /exceptions, /ads membaca data store aktif secara scoped
[ ] Auth, same-origin mutation, pagination, parameterized SQL, dan sort whitelist tetap terjaga
[ ] Unit/integration test, TypeScript, build, diff check, dan fresh independent review selesai
[ ] Production preview-only dan post-import audit dilakukan hanya setelah approval user
[ ] README/NEXTAGENTS/webapp README sudah sinkron dengan source dan runtime yang terbukti
```

Tidak ada bagian scope ini yang membuktikan profit bisnis. Profit tetap `PROFIT_NOT_READY` sampai financial contracts yang ditunda di atas dianalisa dan disetujui.
