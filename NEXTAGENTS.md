# NEXTAGENTS — Shopee Profit Estimation

> Baca file ini lalu `README.md` penuh. `Order.all` dan RAW Income sudah live serta tervalidasi di production. Jangan melanjutkan ke Balance, HPP, return/refund, atau profit sebelum user secara eksplisit memilih report berikutnya.

## Status handoff — 2026-08-08

### Production

```text
URL: https://webapp-umber-five.vercel.app
Repository: wishnetid/shopee-profit-estimation
Branch: master
Commit: 8006c1fe7317aaf743b6bdf6d5ee75b2a0d01af9
Deployment: Ready
```

### Scope yang sudah selesai

`Order.all` sekarang adalah RAW current-state per item dengan key:

```text
(no_pesanan, nomor_referensi_sku, nama_variasi)
```

- Snapshot overlap di-merge, bukan di-append sebagai row baru.
- Snapshot lama tidak boleh overwrite state/field terbaru.
- Status tidak boleh mundur.
- Nilai terisi tidak boleh turun menjadi kosong atau `******`.
- `source_snapshot_at` dan `source_snapshot_file` menjadi provenance per item.
- Workbook ditolak sebelum preview/import jika header tidak tepat, composite key kosong, atau composite key duplicate dalam workbook.
- Timestamp snapshot memakai validasi kalender strict dan disimpan sortable sebagai `YYYY-MM-DD HH:mm:ss`.
- Import memakai DB transaction.

## Income RAW — Live dan Tervalidasi di Production

### Batas scope dan urutan kerja

```text
Order.all RAW current-state                 ✅ live
Income RAW package + halaman Income baru    ← implementasi berikutnya
Balance Transaction                         ← hanya setelah Income live dan tervalidasi
Return / Refund → Failed Delivery → Cancellation → Master HPP → Iklan
Schema financial + profit                   ← terakhir, setelah seluruh report diaudit
```

- Jangan mulai observasi atau coding `Balance` sebelum Income selesai sampai endpoint production nyata.
- Jangan menganggap table, route, UI, atau importer Income lama sebagai implementasi valid. Mereka artefak legacy dari fase sebelum analisa report selesai.
- Perubahan berikutnya harus tetap mengikuti: `Report → Analisa → Diskusi → Coding → Test → Deploy → Endpoint test nyata`.

### Sumber dan bentuk report Income

Satu file `Income.sudah dilepas...xlsx` adalah **satu paket report**, bukan satu sheet tunggal. Sheet yang ada dan fungsi penyimpanannya:

| Sheet sumber | Status implementasi | Tujuan penyimpanan |
|---|---|---|
| `Penghasilan` | WAJIB | Sumber RAW settlement finance utama. Simpan dua view: `Order` dan `Sku`. |
| `Adjustment` | WAJIB | Sumber RAW event penyesuaian dan biaya yang dapat terkait pesanan. |
| `Shipping Fee Discrepancy` | WAJIB | Sumber RAW exception/silang ongkir untuk audit. |
| `Summary` | WAJIB sebagai metadata | Ringkasan/checksum per file import; bukan row transaksi. |
| `Seller Fee` | Audit-only v1 | Dibaca/validasi struktur, tetapi belum jadi table atau tab operasional. Bukan sumber payout/profit utama. |

Jangan menjumlahkan antar-sheet. `Seller Fee`, `Summary`, `Adjustment`, dan `Shipping Fee Discrepancy` bukan pengganti atau tambahan otomatis untuk semua nilai `Penghasilan`.

### Grain dan aturan financial yang sudah tervalidasi

- `Penghasilan` memiliki view `Order` dan `Sku` pada field `Lihat berdasarkan`.
- `Order` adalah settlement total per `No. Pesanan`; dipakai untuk rekonsiliasi dan dashboard order-level.
- `Sku` adalah rincian/alokasi per item. Wajib disimpan karena menjadi dasar HPP/profit per item nanti; **bukan duplicate sampah**.
- Untuk order multi-item, total setiap komponen financial pada `Order` cocok dengan penjumlahan rincian `Sku`.
- Seluruh nominal disimpan bertanda asli positif/negatif. Jangan memakai `ABS()`, membalik tanda, atau menghitung net payout/profit baru sebelum report lain selesai dianalisa.
- `Income` dapat memuat pesanan yang dibuat sebelum periode `Order.all` tetapi dana-nya dilepas pada periode Income. Itu normal; gunakan relasi/query `LEFT JOIN`, **tanpa foreign key wajib** ke `order_all`.
- Ada nama header display yang identik untuk komponen Gratis Ongkir XTRA. Parser dan schema harus memakai key canonical yang berbeda per source field; jangan membangun object dengan nama header mentah sampai nilai pertama tertimpa nilai kedua.

### Model RAW berkala yang akan dibuat

Income **tidak** boleh dipaksa menjadi satu upsert business-key current-state seperti `Order.all`. Detail `Sku` tidak memiliki natural key bisnis yang stabil dari field yang tersedia untuk melakukan upsert aman lintas export overlap.

Target table/layer:

```text
income_report_imports
  Satu row per file report yang lolos import.
  Menyimpan provenance: nama file, SHA-256, periode report, waktu import,
  serta nilai Summary untuk rekonsiliasi.

income_penghasilan_raw
  Semua row Penghasilan view Order DAN Sku.
  Identity RAW: (income_report_import_id, source_excel_row).
  Simpan raw source payload + field normalized bertanda asli.

income_adjustments_raw
  Semua row Adjustment, identity RAW per import + source_excel_row.

income_shipping_fee_discrepancies_raw
  Semua row Shipping Fee Discrepancy, identity RAW per import + source_excel_row.
```

Aturan import:

1. Exact file SHA-256 yang sudah pernah diimport harus preview sebagai duplicate/no-op; tidak boleh menduplikasi row RAW.
2. Export berbeda, walau periodenya overlap, tetap disimpan sebagai import RAW terpisah. Jangan merge, overwrite, atau menjumlahkan lintas report pada tahap RAW.
3. App memilih `report terbaru` sebagai tampilan default; operator tetap bisa memilih riwayat import/report lain untuk audit.
4. `Summary` harus direkonsiliasi dengan penjumlahan komponen bertanda dari `Penghasilan` view `Order` sebelum import diizinkan.
5. Semua insert untuk satu paket report harus berada dalam satu DB transaction. Satu sheet/baris gagal berarti rollback seluruh paket.
6. Tidak ada truncate/clear table. Migration harus tracked, idempotent, default dry-run, dan didahului backup timestamp tervalidasi.

### Kontrak parser, preview, dan test

- Cari header dengan presence field bernama (`No. Pesanan` dan `Lihat berdasarkan`), bukan dengan asumsi header berada di first cell atau nomor row tertentu.
- Validasi sheet wajib serta kontrak header setiap sheet. Sheet hilang, header bergeser/berubah, atau sheet baru yang belum dikenali harus ditampilkan sebagai `BLOCKED`/warning; jangan silently drop data.
- Representasi raw harus membedakan source field yang label tampilannya sama.
- Normalisasi nilai kosong/`-` secara eksplisit tanpa menghancurkan raw source payload.
- Parser nominal harus menjaga tanda dan format IDR; date harus diparse tanpa timezone shift.
- Preview sebelum import wajib menampilkan per-section: `Penghasilan Order`, `Penghasilan Sku`, `Adjustment`, `Shipping Fee Discrepancy`, status duplicate hash, periode report, dan hasil rekonsiliasi Summary.
- TDD wajib: test failing dulu untuk header nyata, duplicate display header, kedua view `Order`/`Sku`, duplicate file hash, rollback package, dan mismatch Summary; baru implementasi minimal.
- Production verification wajib memakai raw Income asli melalui endpoint preview dulu, lalu import eksplisit setelah user menyetujui preview. Sesudah import: query jumlah per section, rekonsiliasi Summary, re-upload file sama sebagai no-op, cek halaman Income, dan cek screenshot sampel yang sudah tervalidasi.

### UI yang akan diterapkan

Sidebar tetap hanya satu primary menu: `Income`. Jangan menambah submenu di sidebar atau bottom navigation.

```text
Income
├─ Penghasilan                 # tab default
│  ├─ Per Pesanan              # view Order
│  └─ Per SKU                  # view Sku
├─ Penyesuaian                 # Adjustment
├─ Selisih Ongkir              # Shipping Fee Discrepancy
└─ Riwayat Import              # pilih/audit report RAW
```

- Default saat membuka halaman: `Income → Penghasilan → Per Pesanan → report terbaru`.
- `Summary` ditampilkan sebagai kartu ringkasan untuk report yang sedang dipilih, bukan sebagai tab tabel.
- `Seller Fee` belum muncul sebagai tab awal. Bila nanti diperlukan, tambahkan sebagai `Audit Fee`, bukan source profit.
- Header/tab berada di area konten halaman Income, di bawah judul dan sebelum search/table; sidebar tetap bersih sebagai primary navigation.

### Legacy yang wajib diganti/diaudit saat coding

- `income_penghasilan` live saat handoff ini masih kosong, hanya menampung subset kolom, tidak punya provenance import, dan bukan kontrak RAW baru.
- `webapp/app/api/upload/route.ts` legacy `previewIncome()`/`importIncome()` gagal untuk workbook Income asli karena hanya mencari `No. Pesanan` di first cell header; header asli dimulai dengan `No.`.
- Mapping object legacy dengan header display mentah menyebabkan collision pada label Gratis Ongkir XTRA yang muncul lebih dari sekali.
- `webapp/app/api/income/route.ts` dan `webapp/app/income/page.tsx` masih membaca table legacy kosong. Ganti hanya setelah API/table RAW baru siap; jangan deploy UI tab yang belum memiliki jalur data nyata.
- Raw files Income baru di `data_sample/` dapat muncul sebagai untracked Git files. Jangan `git add -A` atau commit data raw tanpa arahan eksplisit user.

### Security yang sudah live

- `webapp/proxy.ts` melindungi seluruh page dan `/api/*` memakai Basic Auth environment-only.
- `POST /api/upload` dan `POST /api/settings/database` melakukan Basic Auth lagi di route serta menolak cross-origin POST.
- Upload hanya menerima Excel `.xlsx`/`.xls` dalam batas ukuran server-side.
- Runtime DB connection memakai environment-only; fallback credential hardcoded sudah dihapus dari source aktif.
- `webapp/scripts/migrate-order-all-snapshot-metadata.js` adalah migration idempotent tracked. Default hanya dry-run.

### Bukti verifikasi

```text
Archive/order_all-security-hardening-production-20260808-000813.json
SHA-256: 593134df4284e4475eed89a1aef75d83d70678a3e04f56b801b3654fc75da174
```

Bukti ini tidak melakukan mutasi DB dan mencatat:

- unauthenticated upload: `401`;
- unauthenticated Settings POST: `401`;
- unauthenticated/wrong-auth page: `401`;
- authenticated health: `200`, database connected;
- authenticated raw `Order.all` preview: `200`;
- duplicate composite key: `400`;
- invalid calendar timestamp: `400`;
- cross-origin upload: `403`.

Local gate terakhir:

```text
npm test: 18 pass, 0 fail
npm run build: pass
migration dry-run: no missing metadata columns
```

Backup code sebelum hardening:

```text
Archive/code-backups/20260807-234738-order-all-security-hardening/
```

## Remaining security work

Credential DB lama pernah tersimpan di riwayat repository sebelum hardening. Runtime aktif sudah tidak memakai fallback itu, tetapi password DB tetap perlu **dirotasi melalui cPanel**, lalu nilai baru dipasang di:

```text
webapp/.env.local
Vercel Production Environment Variables
```

Jangan menaruh password di source, Git, README, terminal output, atau chat. Setelah rotasi, test endpoint authenticated dan `/api/health` lagi.

## Rules wajib

```text
Report → Analisa struktur → Diskusi → Coding → Test → Deploy → Endpoint test nyata
```

- Jangan truncate/clear database tanpa backup timestamp tervalidasi dan persetujuan eksplisit user.
- Jangan menganggap `webapp/database/schema.sql`, `webapp/scripts/setup-db.js`, table `orders`, atau profit routes sebagai source of truth untuk RAW `Order.all`.
- Gunakan DDL live read-only sebelum migration:

```bash
cd /home/yogaimawan/Dokumentasi/shopee_profit_estimation/webapp
```

```bash
set -a
. ./.env.local
set +a
node scripts/migrate-order-all-snapshot-metadata.js
```

- RAW Income boleh diimplementasikan **hanya** mengikuti kontrak Income di atas. Report lain tetap dilarang dikerjakan sampai Income live dan tervalidasi.

## Quality gates sebelum perubahan Order.all atau implementasi RAW Income

```bash
cd /home/yogaimawan/Dokumentasi/shopee_profit_estimation/webapp
```

```bash
npm test
```

```bash
npm run build
```

```bash
cd /home/yogaimawan/Dokumentasi/shopee_profit_estimation
```

```bash
git diff --check
```

Untuk perubahan import, test endpoint production harus mencakup request tanpa auth, auth valid, cross-origin, serta preview raw valid. Untuk `Order.all` tambahkan duplicate key dan timestamp invalid. Untuk Income tambahkan duplicate file hash, header asli multi-row, duplicate display header, kedua view, Summary reconciliation, dan rollback package. Jangan menjalankan import mutasi terhadap DB tanpa persetujuan eksplisit.

## Langkah berikutnya yang direkomendasikan

1. Rotasi password DB lewat cPanel dan update `.env.local` + Vercel Production Environment Variables.
2. Verifikasi ulang health dan raw preview `Order.all` setelah rotasi.
3. RAW Income telah diimplementasikan: migration idempotent, parser package, preview, importer transaction, API, dan halaman Income tabs; commit production: `d82125a`.
4. Preview production report `Income.sudah dilepas.id.20260701_20260731.xlsx` lulus: SHA baru, Summary `Total yang Dilepas` sama dengan signed total Penghasilan `Order`, dan seluruh section tersedia. Minta persetujuan user sebelum import mutasi pertama.
5. Sesudah persetujuan: import report Juli, query count setiap table RAW, re-upload file yang sama sebagai duplicate/no-op, cek `/api/income` serta halaman Income. Baru setelah seluruhnya lulus lanjut observasi **Balance Transaction**.
