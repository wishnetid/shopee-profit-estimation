# Shopee Profit Estimation

**Last updated:** 2026-08-08
**Production:** https://webapp-umber-five.vercel.app
**Repository:** https://github.com/wishnetid/shopee-profit-estimation
**Current branch:** `master`

> **Baca file ini dulu sebelum menyentuh project.** Fokus project saat ini hanya memastikan `Order.all` masuk ke `order_all` sebagai raw snapshot yang benar. Jangan melanjutkan logic profit, Income, Balance, HPP allocation, atau perubahan schema tanpa analisa report terkait dan diskusi dulu.

---

## 1. Status Saat Ini

### Sudah selesai dan tervalidasi

- Aplikasi Next.js sudah deploy di Vercel dan terhubung ke MySQL cPanel.
- `Order.all` sudah menjadi raw source/master untuk data order-item.
- Import memakai composite unique key:

```text
(no_pesanan, nomor_referensi_sku, nama_variasi)
```

- Composite key menangani multi-item order; `no_pesanan` sendiri **bukan** key baris.
- Import mendukung tiga hasil:
  - **Baru**: insert.
  - **Identik**: skip.
  - **Berubah dan terbukti lebih baru**: update snapshot, termasuk bila file tidak punya row baru.
  - **Lebih lama / ambigu / menurunkan kualitas data**: database dipertahankan.
- Setiap upload `Order.all` wajib menyertakan **waktu snapshot/export** dari Shopee. Waktu ini disimpan sebagai provenance per item (`source_snapshot_at`, `source_snapshot_file`) dan menjadi urutan utama saat dua export overlap.
- Jika provenance lama belum tersedia, aplikasi memakai mode konservatif: status yang maju boleh memperbarui data; status yang sama tetapi nilai terisi saling konflik ditahan sampai snapshot baru memiliki waktu yang lebih baru.
- Snapshot lama tidak boleh menimpa field mana pun. Nilai terisi juga tidak boleh diturunkan menjadi kosong atau versi tersamarkan (`******`).
- Parser nominal Shopee sudah benar untuk format IDR bertitik:

```text
82.500 → 82500
1.234,50 → 1234.50
```

- Semua nilai monetary `order_all` yang pernah masuk dengan parser lama sudah dipulihkan dari raw report dan diverifikasi terhadap raw snapshot terbaru.
- Import `Order.all` dilakukan dalam satu database transaction. Jika ada batch gagal, seluruh import rollback; tidak boleh ada snapshot setengah masuk.
- Preview membandingkan seluruh field import yang dipetakan, bukan hanya status dan resi.
- Schema guard menolak `Order.all` yang tidak memiliki satu sheet `orders` dengan exact 50 header yang diharapkan.
- Workbook juga ditolak sebelum preview/import jika ada composite key duplicate atau bagian key kosong.
- Waktu snapshot memakai validasi kalender strict dan dinormalisasi menjadi `YYYY-MM-DD HH:mm:ss`.
- Dashboard dan seluruh `/api/*` memakai Basic Auth dari environment; `POST /api/upload` dan `POST /api/settings/database` juga memvalidasi auth di route serta same-origin.
- Upload server-side hanya menerima `.xlsx`/`.xls` hingga batas ukuran yang ditentukan.
- Seluruh koneksi DB runtime memakai environment-only; tidak ada credential/fallback DB hardcoded pada source runtime.
- Unit test parser, schema, duplicate key, strict timestamp, auth, origin, dan file validation lulus.
- Production health, auth, preview raw asli, reject duplicate key, reject timestamp invalid, dan reject cross-origin sudah diverifikasi setelah deploy.
- Preview kelima raw `Order.all` di `data_sample/` juga lulus terhadap endpoint production tanpa mutasi DB; evidence lokal di `Archive/order_all-preview-rotation-production-20260808-001300.json`.

### Belum dikerjakan — jangan diasumsikan selesai

- Analisa struktural dan import yang benar untuk `Income`, `Balance`, `Failed Delivery`, `Cancellation`, dan `Return/Refund`.
- Desain final profit. `Order.all` sendiri **belum cukup** untuk menentukan net payout atau profit final.
- Mapping HPP final dan alokasi pendapatan order-level ke item-level.
- Rekonsiliasi return/refund dengan laporan finansial.
- Rotasi password DB di cPanel dan Vercel. Password lama pernah ada di riwayat source; source aktif sudah environment-only, tetapi credential tetap perlu dirotasi terpisah.
- Audit dan desain ulang endpoint/table legacy di luar scope RAW `Order.all`; `webapp/database/schema.sql` dan `webapp/scripts/setup-db.js` bukan source of truth untuk table live `order_all` saat ini.

---

## 2. Workflow Wajib

```text
Report → Analisa struktur → Diskusi → Coding → Test → Deploy
```

Aturan:

1. Jangan coding logic report yang belum dianalisa.
2. Jangan mendesain profit dari `Order.all` saja.
3. Jangan menganggap nama file export sebagai transaksi baru; export bisa snapshot overlap.
4. Jangan append seluruh export sebagai row baru.
5. Jangan menghapus/truncate database tanpa backup timestamp dan persetujuan eksplisit.
6. Jangan memakai password atau credential fallback hardcoded di source baru. Credential hanya melalui environment variables.
7. Dokumentasi harus logic-only: pakai nama field, pattern, key, dan rule. Jangan hardcode nomor row/kolom Excel atau statistik sample sebagai business rule.

---

## 3. Akses dan Konfigurasi

### Project path

```text
/home/yogaimawan/Dokumentasi/shopee_profit_estimation
```

### Aplikasi

```text
webapp/
```

### Data source

```text
data_sample/
```

### Database

- Database MySQL remote cPanel.
- Environment names:

```text
DB_HOST
DB_PORT
DB_USER
DB_PASSWORD
DB_NAME
DASHBOARD_BASIC_AUTH_USER
DASHBOARD_BASIC_AUTH_PASSWORD
```

- Local development: `webapp/.env.local`.
- Production: Vercel Production Environment Variables.
- Jangan tulis credential di README, source code, Git, log, atau output chat.

### Deploy

Push ke `master` memicu auto-deploy Vercel.

```bash
git push origin master
```

---

## 4. Order.all — Kontrak Raw Import

### Source dan struktur

- Satu workbook harus punya sheet `orders`.
- Header harus persis cocok dengan 50 header export Shopee yang dikenal.
- Semua nilai raw report, termasuk nominal, quantity, dan tanggal, dapat tersimpan sebagai string Excel. Jangan mengandalkan type native Excel.
- Waktu valid memakai pola `YYYY-MM-DD HH:mm`.
- Blank dan `-` berarti data belum tersedia; normalisasi ke `NULL` pada field yang nullable.

### Grain data

Satu row = satu item/variasi dalam satu pesanan.

```text
no_pesanan + nomor_referensi_sku + nama_variasi
```

Implikasi:

- Multi-item order menghasilkan beberapa row dengan `no_pesanan` yang sama.
- `Total Pembayaran` berada pada grain order dan dapat berulang pada setiap item row. Jangan menjumlahkannya per item saat membangun laporan finansial.
- SKU, variasi, `jumlah`, `returned_quantity`, dan HPP berada pada grain item.
- Status return dapat berlaku parsial di satu item/variasi; jangan menganggap return berlaku untuk semua item dalam order.

### Snapshot behaviour

Export dengan period berbeda dapat memiliki order yang sama karena jendela export overlap. Snapshot yang lebih baru dapat memperbarui:

- status pesanan;
- resi;
- return/cancellation state;
- alamat;
- jadwal pengiriman;
- voucher/diskon;
- ongkir;
- total pembayaran;
- waktu selesai.

Karena itu, import adalah **merge state terbaru per item**, bukan append ledger.

### Duplicate dan update

| Kondisi | Aksi |
|---|---|
| Composite key belum ada | INSERT + simpan provenance snapshot |
| Composite key ada, seluruh field mapped sama | SKIP; provenance dapat disematkan sekali pada row legacy yang clean |
| Snapshot punya waktu lebih baru dan tidak menurunkan kualitas field | UPDATE |
| Snapshot lebih lama | BLOCK seluruh perbedaan; DB tetap dipakai |
| Waktu sama atau provenance belum ada, tetapi nilai terisi konflik | HOLD/BLOCK; butuh snapshot yang terbukti lebih baru |
| File hanya berisi update aman, tanpa row baru | UPDATE tetap diizinkan |

### Guards saat update

- Setiap `Order.all` wajib membawa waktu saat snapshot/report diexport dari Shopee. Nama file dan waktu order tidak dipakai sebagai penentu freshness.
- Status ranked bersifat monotonic: tidak boleh mundur, bahkan bila sebuah snapshot yang diinput diberi waktu lebih baru.
- Snapshot yang lebih lama tidak boleh menimpa field mana pun.
- Nilai terisi tidak boleh diturunkan menjadi kosong atau versi tersamarkan (`******`).
- Bila status sama tetapi nilai terisi berbeda dan belum ada provenance yang membuktikan incoming lebih baru, database dipertahankan secara konservatif.
- Provenance per item tersimpan di `source_snapshot_at` dan `source_snapshot_file`.
- Preview wajib membedakan `Update Aman` dari perbedaan yang diblok/dipertahankan.

> Lifecycle `Batal`, return, dan refund belum boleh disederhanakan sebagai status linear sempurna. Saat menambah rule baru, validasi dulu dengan report finansial terkait.

---

## 5. Database Live yang Dipakai Sekarang

### Source of truth aktif untuk tahap ini

```text
order_all
```

- Unique index live: `uk_order_item` pada composite key item.
- Gunakan `SHOW CREATE TABLE order_all` untuk melihat DDL nyata sebelum migration.
- Jangan memakai table `orders` untuk flow `Order.all` saat ini; table tersebut adalah artefak lama dan belum dipakai oleh importer aktif.
- Table/route profit lama belum boleh dianggap valid karena masih bergantung pada model `orders` dan report finansial yang belum dianalisa ulang.

### Backup recovery terakhir

Sebelum repair nominal dilakukan backup lokal:

```text
Archive/order_all-pre-repair-20260807-204459.json
```

- Berisi snapshot database dan DDL sebelum repair.
- Diproteksi oleh `.gitignore`; jangan commit karena mengandung customer/order data.
- Repair script bersifat idempotent: dry-run setelah repair harus menunjukkan `rows_requiring_currency_repair: 0`.

---

## 6. Implementasi Penting

### Import route

```text
webapp/app/api/upload/route.ts
```

Tanggung jawab:

- detect report;
- exact header validation untuk `Order.all`;
- preview DB comparison;
- full-field diff;
- status/resi regression guard;
- transactional `INSERT ... ON DUPLICATE KEY UPDATE`;
- raw import `Order.all`, Income, dan Master.

### Shared Order.all logic

```text
webapp/lib/order-all-import.js
```

Memuat:

- `parseIdr()`;
- `parseSnapshotAt()`;
- `validateOrderAllHeaders()`;
- `validateOrderAllCompositeKeys()`;
- `shouldAllowImport()`.

### Dashboard protection

```text
webapp/proxy.ts
webapp/lib/dashboard-auth.js
```

- `proxy.ts` memakai Basic Auth environment-only untuk page dan `/api/*`.
- Mutating route tetap melakukan validasi auth dan same-origin sendiri.
- Tidak ada credential Basic Auth di Git, README, atau source.

### Snapshot metadata migration

```text
webapp/scripts/migrate-order-all-snapshot-metadata.js
```

Default dry-run membaca DDL live tanpa mutasi. `--apply` hanya menambah kolom metadata yang belum ada.

### Currency repair utility

```text
webapp/scripts/repair-order-all-currency.js
```

Mode aman default:

```bash
node scripts/repair-order-all-currency.js
```

Mode mutasi DB, hanya sesudah backup tervalidasi:

```bash
node scripts/repair-order-all-currency.js --apply
```

### Regression test

```text
webapp/test/order-all-import.test.mjs
```

Jalankan:

```bash
cd /home/yogaimawan/Dokumentasi/shopee_profit_estimation/webapp
```

```bash
npm test
```

### Build

```bash
npm run build
```

---

## 7. Verifikasi sebelum Mengubah Import Order.all

Wajib jalankan:

```bash
cd /home/yogaimawan/Dokumentasi/shopee_profit_estimation/webapp
```

```bash
npm test
```

```bash
./node_modules/.bin/tsc --noEmit --incremental false
```

```bash
npm run build
```

Untuk check raw/DB tanpa mutasi:

```bash
node scripts/repair-order-all-currency.js
```

Hasil yang sehat:

- `raw_latest_composite_rows` sama dengan `db_rows`;
- `missing_in_db: 0`;
- `unexpected_db_rows: 0`;
- `rows_requiring_currency_repair: 0`.

Untuk production health, gunakan Basic Auth dari environment lokal dan jangan paste credential ke command history:

```bash
cd /home/yogaimawan/Dokumentasi/shopee_profit_estimation/webapp
```

```bash
set -a
. ./.env.local
set +a
curl -sS -u "$DASHBOARD_BASIC_AUTH_USER:$DASHBOARD_BASIC_AUTH_PASSWORD" https://webapp-umber-five.vercel.app/api/health
```

---

## 8. Report yang Tersedia tetapi Belum Boleh Diolah

Folder `data_sample/` berisi report tambahan sebagai bahan analisa berikutnya:

- `Income.sudah dilepas...xlsx`
- `my_balance_transaction_report...xlsx`
- `Order.failed_delivery...xlsx`
- `Order.cancellation...xlsx`
- `Order.return_refund...xls`
- `master.xlsx`
- report iklan CSV

Urutan next yang disarankan:

1. Analisa penuh **Income Penghasilan**: sheet, header, grain, key, duplicate, nominal sign, dan keterkaitan terhadap `Order.all`.
2. Analisa **Balance**: tipe transaksi, lokasi No. Pesanan, settlement, adjustment, dan biaya iklan.
3. Analisa **Return/Refund** serta Failed Delivery dan Cancellation.
4. Diskusi model data: order header vs item vs financial transaction.
5. Baru desain schema final dan logic estimasi/actual profit.

---

## 9. Struktur Project

```text
shopee_profit_estimation/
├── README.md
├── .gitignore
├── Archive/                         # backup lokal, di-ignore Git
├── data_sample/                     # raw report export + reference
└── webapp/
    ├── app/
    │   ├── upload/page.tsx
    │   └── api/upload/route.ts
    ├── lib/
    │   └── order-all-import.js
    ├── scripts/
    │   └── repair-order-all-currency.js
    ├── test/
    │   └── order-all-import.test.mjs
    ├── database/                    # legacy; jangan jadikan DDL live tanpa verifikasi
    ├── package.json
    └── .env.local                   # local only, tidak di-commit
```

---

## 10. Handoff untuk Agent Baru

Mulai dengan urutan ini:

1. Baca README ini penuh.
2. Cek `git status --short` dan jangan menimpa kerja yang belum committed.
3. Jika menyentuh `Order.all`, baca:
   - `webapp/app/api/upload/route.ts`
   - `webapp/lib/order-all-import.js`
   - `webapp/test/order-all-import.test.mjs`
4. Jalankan `npm test` sebelum dan setelah perubahan.
5. Untuk query/DDL DB, inspeksi live dulu secara read-only. Jangan percaya schema legacy tanpa `SHOW CREATE TABLE`.
6. Untuk report baru: lakukan Report → Analisa → Diskusi → Coding.
7. Jangan melanjutkan profit calculation sampai Income, Balance, Return/Refund selesai dianalisa dan user menyetujui design-nya.

**Commit terakhir yang membenahi Order.all import:**

```text
f9c5bac fix(order-all): protect snapshot imports
```
