# NEXTAGENTS — Shopee Profit Estimation

**Last updated:** 2026-08-12 WIB

**Production:** https://webapp-umber-five.vercel.app

**Repository:** `wishnetid/shopee-profit-estimation`

**Branch:** `master`

**Code release:** `7bfab44` — `feat(raw): add balance exceptions and ads packages`

**Code verification deployment:** `dpl_8sVCM8uuL71w15UV3qmgmh3nPz4b` — `Ready`

> Mulai dengan membaca `README.md` penuh, lalu file ini. Jangan langsung coding, migration, import, clear, reset, atau hapus store. RAW Order.all, Income, Master SKU shared, serta multi-store sudah live. Profit final belum tersedia.

---

## 1. Handoff Operasional

### Production state saat dokumentasi diperbarui

```text
Store aktif yang tersisa
  TACTICALIZED

TACTICALIZED
  Order.all: 0 row
  Income parent/child RAW: 0 row
  RAW Expansion parent/child: 0 row

Master SKU
  shared/global; tidak dimiliki store tertentu
```

> Jangan gunakan angka row dalam dokumen ini sebagai kebenaran saat ini. Untuk kondisi live terbaru, cek `/api/stores` dan `/api/settings/database?storeId=<id>` dengan Basic Auth.

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
- Profit legacy disengaja mengembalikan `503 PROFIT_NOT_READY`.
- GitHub `master` dan Vercel Production memuat source release `7bfab44`, termasuk RAW Expansion Balance, Cancellation, Failed Delivery, Return/Refund, dan Ads.
- Master SKU shared tetap berisi satu package dan 32 source row. State Order/Income/RAW terbaru wajib dicek dari API production karena data operasional dapat berubah.

### Belum selesai

- RAW Expansion sudah deployed. DDL live dibuat dari backup tervalidasi; post-DDL audit, preview-only sembilan sample real lokal, dan preview-only Balance canonical production lulus tanpa write. Import real belum dilakukan. Handoff: `RAW-EXPANSION-IMPLEMENTATION.md` lalu `webapp/docs/RAW-EXPANSION.md`.
- HPP final, ads accounting layer, net payout, actual profit, estimation profit.
- Multi-user ownership authorization per store.
- Baseline lint cleanup.

### Jangan salah simpulkan

- Production sudah Ready dan menerima import operasional yang telah dilakukan user.
- Income package selalu scope per store; jangan membaca package satu store sebagai data global.
- State live dapat berubah sesudah clear/hapus store; query API production sebelum membuat klaim count/package.
- Master SKU memang global/shared, bukan per-store.
- Profit belum dapat dipakai sebagai angka bisnis.

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
/profit    Informational guard; belum ada angka profit
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
