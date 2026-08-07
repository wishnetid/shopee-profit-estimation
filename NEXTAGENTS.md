# NEXTAGENTS — Shopee Profit Estimation

> Mulai dengan membaca file ini, lalu `README.md`. Jangan menganggap code, DB, dan deployment sudah sinkron sebelum verifikasi aktual.

## Tujuan tahap berikutnya

Menyelesaikan hardening `Order.all` agar aman dipakai sebagai **database RAW current-state berkala**:

- snapshot export overlap boleh merge;
- snapshot lama tidak boleh menurunkan data terbaru;
- app dan endpoint mutasi tidak terbuka untuk publik;
- bukti test harus melalui endpoint Vercel production, bukan hanya unit test.

Workflow wajib:

```text
Report → Analisa → Diskusi bila logic bisnis ambigu → Coding → Test → Deploy → Endpoint test nyata
```

---

## Status production yang sudah ada

### Git dan deployment

- Repository: `wishnetid/shopee-profit-estimation`
- Branch: `master`
- Commit yang sudah dipush dan auto-deploy:

```text
98aad7557bb91a1316225cb78d1002433aa6e110
fix(order-all): protect stale snapshot fields
```

- Deployment Vercel terakhir dari commit tersebut sudah `Ready`.
- Production URL:

```text
https://webapp-umber-five.vercel.app
```

### Logic Order.all yang sudah live

- Grain/raw key:

```text
(no_pesanan, nomor_referensi_sku, nama_variasi)
```

- Snapshot lama tidak boleh menurunkan status.
- Status bersifat monotonic: `Selesai` tidak boleh kembali ke `Telah Dikirim`, bahkan jika user memasukkan waktu snapshot yang lebih baru.
- Nilai terisi tidak boleh diganti `NULL`, kosong, `-`, atau versi alamat tersamarkan `******`.
- Saat status sama tetapi field terisi konflik dan belum ada proof snapshot incoming lebih baru, DB mempertahankan nilai lama secara konservatif.
- Upload UI meminta `Waktu snapshot/export`; nilai ini dikirim ke API sebagai `source_snapshot_at`.
- Preview membedakan `Update Aman` dari perubahan yang diblok.

### Schema live yang sudah dimigrasikan manual

Kolom berikut sudah ditambahkan ke table live `order_all`:

```text
source_snapshot_at DATETIME NULL
source_snapshot_file VARCHAR(255) NULL
```

Backup sebelum migration:

```text
Archive/order_all-pre-snapshot-metadata-20260807-223007.json
SHA-256: 3c67b0bdee05769aba95c87738320ad0d6442d51a6c0c0ff3ed2ee3de28aaf27
```

**Penting:** kolom ini belum memiliki migration script tracked yang reproducible. Tambahkan migration yang idempotent setelah inspeksi `SHOW CREATE TABLE order_all`; jangan menjalankan `ALTER TABLE` buta.

### Bukti test lama

Sebelum hardening terakhir, endpoint production sudah diuji dengan rotasi lima raw report `Order.all`, lalu replay file terbaru, simulasi file lama, dan restore snapshot terbaru.

Bukti:

```text
Archive/order_all-endpoint-rotation-test-20260807150440.json
SHA-256: c6fac70e0431277afc899f58becc50842ac03c6213f755470c6ee5d62860ea06
```

Hasil lama membuktikan dedupe/replay/restoration aman, tetapi menemukan bahwa snapshot lama masih dapat mencoba overwrite field selain status/resi. Commit `98aad75` dibuat untuk menutup masalah logic itu. **Test endpoint production wajib diulang setelah hardening security selesai.**

---

## BLOCKER: jangan klaim app sudah solid atau aman public

Independent review menghasilkan `passed: false`. Tiga blocker ini wajib dibereskan dulu.

### 1. Authentication dan authorization endpoint mutasi

Saat review, endpoint berikut belum dilindungi:

```text
POST /api/upload
POST /api/settings/database
```

Risiko:

- siapa pun yang mengakses app public dapat mengirim workbook dan memalsukan waktu snapshot;
- endpoint Settings memiliki operasi `TRUNCATE` database;
- timestamp dari browser adalah input tidak terpercaya tanpa auth.

Implementasi minimal yang disarankan:

1. Gunakan Basic Auth khusus dashboard melalui environment production:

```text
DASHBOARD_BASIC_AUTH_USER
DASHBOARD_BASIC_AUTH_PASSWORD
```

2. Buat `webapp/proxy.ts` mengikuti dokumentasi Next.js 16 (`proxy`, bukan middleware), untuk melindungi seluruh page dan `/api/*`.
3. Tambahkan validasi auth juga di route mutasi sebagai defense-in-depth:

```text
POST /api/upload
POST /api/settings/database
```

4. Untuk POST, cek `Origin` terhadap `request.nextUrl.origin` agar request cross-site ditolak.
5. Batasi ukuran file upload dan validasi type/extension server-side. Jangan hanya percaya `accept` browser.
6. Jangan masukkan user/password ke Git, README, source, logs, terminal output, atau chat. Tambahkan hanya melalui Vercel Environment Variables dan `.env.local` lokal yang di-ignore Git.

Partial work lokal sudah ada tetapi **belum diintegrasikan/deploy**:

```text
webapp/lib/dashboard-auth.js
webapp/test/dashboard-auth.test.mjs
```

Helper tersebut harus direview dan dipakai atau diganti dengan solusi yang lebih tepat. Jangan menganggap auth sudah aktif hanya karena file helper ada.

### 2. Duplicate composite key dalam satu workbook

Root cause:

- unique key DB melindungi antar-import;
- tetapi dua row dengan composite key sama di satu batch `INSERT ... ON DUPLICATE KEY UPDATE` dapat diproses dua kali, sehingga urutan row file menentukan hasil.

Wajib:

- validasi seluruh `Order.all` setelah parsing;
- reject request sebelum preview/import bila ada duplicate key atau bagian composite key kosong;
- return sample row number dan key tanpa membocorkan PII berlebihan;
- tambah test regression.

Partial helper/test sudah mulai ada di local working tree:

```text
validateOrderAllCompositeKeys()
```

Pastikan helper benar-benar diexport dari `webapp/lib/order-all-import.js` dan dipanggil di `route.ts` untuk preview **dan** import.

### 3. Strict snapshot timestamp validation

Masalah reviewer:

```text
2099-99-99 99:99:00
```

dulu lolos regex format, padahal bukan calendar datetime valid.

Wajib:

- parse dan round-trip validasi tahun/bulan/tanggal/jam/menit/detik;
- reject impossible date/time;
- pertimbangkan batas waktu masa depan yang masuk akal;
- pakai representasi sortable konsisten `YYYY-MM-DD HH:mm:ss`;
- test invalid calendar date dan valid timestamp.

Partial helper/test sudah mulai ada di local working tree:

```text
parseSnapshotAt()
```

Pastikan helper strict ini menjadi satu-satunya path validasi di API.

---

## Security debt yang ditemukan, jangan diabaikan

Upload route baru sudah tidak memakai fallback credential. Tetapi source lain masih memiliki credential database hardcoded/fallback, antara lain:

```text
webapp/app/api/orders/route.ts
webapp/app/api/income/route.ts
webapp/app/api/sku/route.ts
webapp/app/api/settings/database/route.ts
webapp/scripts/repair-order-all-currency.js
webapp/test-db.js
```

Wajib pada hardening ini:

1. Rotasi password DB karena pernah tracked di repository.
2. Ganti semua koneksi runtime menjadi environment-only, idealnya shared `webapp/lib/db.ts`.
3. Hapus atau ubah `test-db.js` agar tidak menyimpan credential.
4. Pastikan environment Vercel tetap memiliki:

```text
DB_HOST
DB_PORT
DB_USER
DB_PASSWORD
DB_NAME
```

5. Jangan deploy route yang gagal jika env DB tidak lengkap; fail fast dengan error generik, tidak mengungkap secret.

Catatan: security hardening ini menyentuh beberapa file di luar Order.all. Jangan menunda hanya karena issue awalnya import RAW; `Settings` dapat melakukan destructive action.

---

## Current local working tree — WAJIB inspeksi sebelum edit

Setelah commit `98aad75`, ada perubahan lokal **belum commit dan belum deploy**. Jangan overwrite atau `git reset --hard`.

File yang diperkirakan berubah/baru:

```text
README.md
webapp/app/api/upload/route.ts
webapp/app/upload/page.tsx
webapp/lib/order-all-import.js
webapp/test/order-all-import.test.mjs
webapp/package.json
webapp/lib/dashboard-auth.js                 # baru, belum terintegrasi
webapp/test/dashboard-auth.test.mjs          # baru
```

Urutan pertama sesi baru:

```bash
cd /home/yogaimawan/Dokumentasi/shopee_profit_estimation
```

```bash
git status --short
```

```bash
git diff -- README.md webapp/app/api/upload/route.ts webapp/app/upload/page.tsx webapp/lib/order-all-import.js webapp/test/order-all-import.test.mjs webapp/package.json
```

```bash
cd webapp
```

```bash
npm test
```

Pada titik handoff ini, test baru belum boleh dianggap lulus sampai helper duplicate key dan strict date diintegrasikan lalu seluruh suite hijau.

---

## Urutan implementasi yang harus dikerjakan

### A. Selesaikan dan verifikasi helper test-first

1. Pastikan test berikut ada dan fail sebelum implementation bila belum ada:
   - duplicate composite key dalam satu workbook ditolak;
   - composite part kosong ditolak;
   - invalid calendar timestamp ditolak;
   - status mundur selalu diblok;
   - snapshot lebih lama memblok semua field berbeda;
   - equal-status conflict tanpa provenance ditahan;
   - newer snapshot yang valid boleh memperbarui field;
   - field populated tidak turun ke kosong/`******`.

2. Export helper dari `order-all-import.js`.
3. Panggil validation sebelum DB preview dan sebelum import. Preview/import harus memakai rule identik.
4. Pastikan result counter benar:
   - `rowsImported` = baris composite baru;
   - `rowsUpdated` = baris yang benar-benar berubah atau provenance maju;
   - `rowsGuarded` = row yang memiliki minimal satu field diblok;
   - `protectedFields` = total field yang dipertahankan.

### B. Auth dan CSRF/origin protection

1. Baca docs lokal Next 16 untuk `proxy.ts`:

```text
webapp/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md
```

2. Tambahkan Basic Auth, environment-only.
3. Pastikan semua UI fetch tetap berfungsi dengan auth browser.
4. Tambahkan server-side validation auth + same-origin untuk mutating routes.
5. Test melalui HTTP:
   - unauthenticated page/API mendapat `401`;
   - wrong Basic Auth mendapat `401`;
   - valid auth dapat preview;
   - cross-origin POST ditolak;
   - Settings destructive POST tanpa auth ditolak.

### C. Credential cleanup

1. Backup file yang akan diedit dengan timestamp ke `Archive/code-backups/`.
2. Ubah semua route DB ke shared `lib/db.ts` atau helper env-only seragam.
3. Rotate DB password di cPanel dan Vercel hanya setelah source sudah siap menerima env baru.
4. Verifikasi `/api/health`, `/api/orders`, `/api/income`, `/api/sku`, `/api/upload`, dan Settings memakai credential baru tanpa fallback hardcoded.

### D. Deploy dan test endpoint nyata

Setelah build/test/security checks lulus:

1. Commit memakai Git identity terverifikasi:

```text
wishnetid <284971674+wishnetid@users.noreply.github.com>
```

2. Push `master`, tunggu deployment Vercel `Ready`.
3. Verifikasi canonical production alias, bukan hanya deployment hash.
4. Jalankan controlled endpoint rotation lagi menggunakan seluruh raw Order.all di `data_sample/`.
5. Untuk setiap request sertakan `source_snapshot_at` yang benar-benar merepresentasikan waktu export/snapshot yang diuji.
6. Wajib test urutan:
   - snapshot lama → snapshot baru;
   - replay snapshot terbaru = zero mutation;
   - snapshot lama setelah terbaru = zero unsafe mutation, seluruh downgrade diblok;
   - snapshot baru setelah snapshot lama = update aman;
   - workbook duplicate key = HTTP 400 dan DB tidak berubah;
   - invalid timestamp = HTTP 400 dan DB tidak berubah;
   - unauthenticated mutation = HTTP 401;
   - authenticated preview/import normal tetap jalan.
7. Setelah test, database harus kembali ke state snapshot terbaru dan diverifikasi:

```text
row count == distinct composite key count
missing keys == 0
unexpected keys == 0
field mismatch == 0
```

8. Simpan evidence JSON baru di `Archive/`, SHA-256, lalu update `README.md` logic-only.

---

## Data dan DB safety rules

- `order_all` adalah **current-state RAW per item**, bukan append-only arsip semua versi export.
- Jangan menghapus/truncate database tanpa backup timestamp terverifikasi dan instruksi eksplisit user.
- Jangan masukkan data customer/order dari backup `Archive/` ke Git.
- Jangan percaya `webapp/database/schema.sql` atau `webapp/scripts/setup-db.js` sebagai DDL live; itu artefak legacy.
- Sebelum migration/query, pakai `SHOW CREATE TABLE order_all` read-only dulu.
- Jangan melanjutkan Income, Balance, HPP, atau profit final sebelum analisa report → diskusi sesuai README.

---

## Quality gates sebelum menyatakan selesai

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

Selain gate lokal, wajib ada bukti endpoint Vercel nyata dan status deployment `Ready`.

> Jangan menyebut hasil sebagai “solid” hanya dari unit test/build. Status final harus mencakup: auth aktif, credential tidak hardcoded, reject duplicate/timestamp invalid terbukti, dan rotasi endpoint production lulus.
