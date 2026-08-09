# Shopee Profit Estimation

**Last updated:** 2026-08-09 14:22 WIB

**Production:** https://webapp-umber-five.vercel.app

**Repository:** https://github.com/wishnetid/shopee-profit-estimation

**Branch:** `master`

**Release commit:** `d143899` — `feat(multistore): scope dashboard data by store`

**Vercel production:** `dpl_5ELAu1nmb9MLUKk9ByZjLberBtHU` — `Ready`

> Baca file ini penuh sebelum menyentuh project. App sudah production untuk fondasi RAW **Order.all**, **Income**, dan manajemen **multi-toko**. Final profit belum tersedia dan tidak boleh diinferensikan dari data RAW saat ini.

---

## 1. Status Saat Ini

### Sudah live

1. **Multi-toko single-admin**
   - Store aktif dikelola lewat selector global.
   - Store tersedia: `TACTICALIZED`, `TACTICALITY`, `TACTICALIST`, `TACTICALUXE`.
   - Satu Basic Auth dashboard mengelola seluruh store.
   - Ini **bukan** desain multi-user/tenant authorization.

2. **Order.all RAW current-state per item**
   - Source of truth: `order_all`.
   - Satu row berarti satu item/variasi dalam pesanan.
   - Import snapshot baru di-merge konservatif; bukan append ledger.

3. **Income RAW package berkala**
   - Satu workbook disimpan sebagai satu package report/provenance.
   - Child RAW dipisahkan untuk `Penghasilan`, `Adjustment`, dan `Shipping Fee Discrepancy`.
   - Workbook overlap tidak otomatis dianggap duplicate bisnis.

4. **Master SKU shared**
   - `sku_report_imports` dan `sku_master_raw` berlaku lintas semua store.
   - Master SKU tidak ikut terhapus oleh clear data store.

5. **Aplikasi production**
   - Next.js App Router di Vercel.
   - MySQL cPanel diakses server-side.
   - Basic Auth diwajibkan untuk page dan API.

### Belum tersedia — jangan diasumsikan valid

- Balance Transaction RAW.
- Return/refund, failed delivery, dan cancellation terhadap settlement finansial.
- Mapping HPP final dan alokasi order-level ke item-level.
- Biaya iklan.
- Financial layer: net payout, actual profit, dan estimation profit.
- Multi-user ownership authorization per store.

Route dan halaman Profit sengaja mengembalikan:

```text
503 PROFIT_NOT_READY
```

Itu adalah guard produk, bukan gangguan deployment.

---

## 2. Kontrak Multi-Store

### Scope data

| Kelas | Tabel | Aturan |
|---|---|---|
| Store-scoped current state | `order_all` | Setiap row wajib memiliki `store_id`. |
| Store-scoped package parent | `income_report_imports` | Setiap package wajib memiliki `store_id`. |
| Child inherit parent scope | `income_penghasilan_raw`, `income_adjustments_raw`, `income_shipping_fee_discrepancies_raw` | Scope diperoleh melalui parent Income package. |
| Shared master | `sku_report_imports`, `sku_master_raw` | Tidak menggunakan `store_id`; dipakai seluruh store. |

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

- Orders, Income, preview upload, import upload, dan Settings selalu membawa `storeId`.
- Server memvalidasi format dan keberadaan `storeId`.
- Saat ini `storeId` adalah selector scope untuk satu admin, **bukan** otorisasi tenant antar-user.
- Jika nanti ada credential/user berbeda, wajib tambahkan identity session dan ownership check `store.owner_user_id` sebelum release multi-user.
- `clear_store` hanya dapat menghapus data operasional store yang dipilih dan dikonfirmasi.
- Clear store tidak menyentuh Master SKU shared.
- `clear_shared_sku` adalah reset global terpisah untuk Master SKU shared; tidak membutuhkan `storeId`, menghapus child `sku_master_raw` sebelum parent `sku_report_imports`, dan tidak menghapus Order.all atau Income.
- Working tree menambahkan `DELETE /api/stores` dan tombol **Hapus Toko Aktif**. Saat release, hapus toko hanya boleh untuk store kosong, tidak boleh menghapus store terakhir, dan tidak menyentuh Master SKU shared.

---

## 3. Order.all — RAW Current-State

### Grain dan identity

```text
Satu row = satu item/variasi pesanan
(store_id, no_pesanan, nomor_referensi_sku, nama_variasi)
```

- `no_pesanan` tidak cukup sebagai key karena satu pesanan dapat berisi beberapa item/variasi.
- `total_pembayaran` adalah nominal order-level dan dapat muncul pada beberapa item row. Jangan menjumlahkannya langsung di grain item.
- Quantity, SKU, variasi, returned quantity, dan HPP nantinya berada pada grain item.

### Aturan snapshot

- Import adalah merge current-state, bukan histori append.
- Operator mengisi waktu snapshot/export dari Shopee.
- Provenance memakai `source_snapshot_at` dan `source_snapshot_file`.
- Snapshot lama tidak boleh menimpa state terbaru.
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
5. Parser menemukan header dari nama field yang dibutuhkan, bukan posisi fixed.
6. Header display duplikat memiliki canonical key berbeda supaya payload tidak tertimpa.
7. Income boleh belum memiliki pasangan `Order.all`; gunakan `LEFT JOIN`, bukan foreign key wajib ke order.

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

## 5. UI dan API Operasional

### Halaman

```text
/upload    Preview/import Order.all, Income, dan Master SKU
/orders    Baca Order.all untuk store aktif
/income    Baca package Income RAW untuk store aktif
/sku       Baca Master SKU shared
/settings  Baca dan clear data operasional store aktif
/profit    Guard informasi; perhitungan belum tersedia
```

### Upload Manager

- Menerima `.xlsx` dan `.xls`.
- Auto-detect report `Order.all`, `Income`, atau Master SKU.
- Preview dan import mengikat target store pada saat preview dibuat.
- Pindah store membatalkan preview/import state lama agar hasil dari store lama tidak muncul di store baru.
- Import harus dilakukan dari hasil preview yang masih sesuai dengan store aktif.
- Preview memakai endpoint `POST /api/upload` dengan `action=preview`; import memakai `action=import`.

> Belum ada preview workbook production menggunakan file real setelah release `d143899`. Jangan klaim jalur upload production final sebelum preview nyata dilakukan. Preview tidak dimaksudkan menulis DB; import tetap mutasi dan membutuhkan persetujuan eksplisit user.

### Settings

- `GET /api/settings/database?storeId=<id>` menampilkan tabel scoped dan shared.
- Clear memakai `POST /api/settings/database` dengan:

```json
{
  "action": "clear_store",
  "storeId": 1,
  "confirmation": true
}
```

- UI mengikat confirmation dan completion ke store yang sama.
- Tombol merah terpisah **Reset Master SKU Shared** memakai confirmation kedua, berlaku global untuk seluruh toko, menghapus `sku_master_raw` lalu `sku_report_imports`, dan tidak menyentuh Order.all atau Income.
- Working tree juga menambahkan **Hapus Toko Aktif** dengan confirmation kedua. Backend menolak store yang masih memiliki Order.all/Income dan store terakhir; setelah sukses selector direfresh ke store tersisa.
- Jangan memanggil endpoint clear/reset/hapus untuk smoke test atau eksperimen.

### API penting

```text
GET  /api/health
GET  /api/stores
POST /api/stores
DELETE /api/stores
GET  /api/orders?storeId=<id>
GET  /api/income?storeId=<id>
GET  /api/sku
POST /api/upload
GET  /api/settings/database?storeId=<id>
POST /api/settings/database
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

## 6. Access dan Security

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
- Source sekarang protected-by-default dan tidak menyediakan bypass public.
- `DASHBOARD_AUTH_ENABLED` bukan switch akses publik aktif; jangan membuat bypass tanpa security audit dan persetujuan eksplisit.
- Page dan API memerlukan Basic Auth.
- Mutation route tambahan memvalidasi Basic Auth dan same-origin request.
- Rotasi credential DB historis adalah pekerjaan terpisah, tidak termasuk release multi-store ini.

---

## 7. Quality Gate Release `d143899`

Lulus pada source release:

```text
npm test                                      60/60 PASS
./node_modules/.bin/tsc --noEmit ...          PASS
npm run build                                 PASS
git diff --check                              PASS
Independent read-only review                  PASS
```

Production smoke yang sudah lulus:

```text
GET / tanpa Basic Auth                         401
GET /api/stores dengan Basic Auth              200
Orders/Income pada store kosong                200 dengan data terisolasi
Pagination offset overflow                    400
SKU importId invalid                           400
Profit legacy                                  503 PROFIT_NOT_READY
```

`npm run lint` masih memiliki baseline legacy (`any`, `require()`, React hook rule). Jangan menyebut lint sebagai PASS. Itu tidak membatalkan build/typecheck/review release ini dan perlu backlog khusus.

---

## 8. Git dan Raw Reports

- Jangan gunakan `git add -A` atau `git commit -am`.
- Commit hanya file source/test/docs yang memang scope task.
- `Archive/`, backup dokumentasi, `.env.local`, dan raw workbook tidak boleh di-commit tanpa instruksi eksplisit user.
- Workbook Income yang masih untracked di `data_sample/` adalah data kerja user dan harus dibiarkan utuh.
- Backup dokumentasi sebelum update terakhir:

```text
Archive/docs-backups/README.md.pre-current-state-20260809-142212
Archive/docs-backups/NEXTAGENTS.md.pre-current-state-20260809-142212
```

---

## 9. Workflow Wajib

```text
Report → Analisa struktur → Diskusi → Coding → Test → Deploy → Endpoint test nyata
```

Aturan utama:

1. Jangan coding report baru sebelum struktur seluruh report dianalisa.
2. Jangan membangun profit dari `Order.all` saja.
3. Jangan menghapus, clear, truncate, atau re-import DB tanpa backup tervalidasi dan persetujuan eksplisit.
4. Jangan menyamakan overlap export dengan duplicate bisnis.
5. Dokumentasi business rule harus logic-only: field, key, pattern, dan rule; bukan statistik sample atau posisi Excel.
6. Inspeksi DDL live read-only sebelum migration; `schema.sql` adalah dokumentasi sinkron, bukan pengganti database production.

---

## 10. Next Scope — Diskusi Dulu

Prioritas rekomendasi, belum menjadi instruksi implementasi:

1. **Preview production memakai workbook real**
   - Jalankan `action=preview` pada satu file Order.all atau Income.
   - Verifikasi report detection, target store, summary preview, dan tidak ada write DB.

2. **Balance Transaction**
   - Inventaris sheet/header.
   - Tentukan grain, tipe transaksi, tanda nominal, lokasi `No. Pesanan`, dan duplicate policy.
   - Bedakan settlement, adjustment, refund, dan biaya iklan berdasarkan bukti source.

3. **Return/refund, failed delivery, cancellation**
   - Cocokkan dengan Order.all, Income, dan Balance.
   - Jangan menyederhanakan sebagai status linear tanpa report finansial.

4. **Financial layer**
   - Diskusikan relasi order header, item, Income Order, Income Sku, HPP, iklan, dan return.
   - Baru desain actual profit dan estimation profit.

Untuk handoff agent berikutnya, baca `NEXTAGENTS.md` setelah README ini.
