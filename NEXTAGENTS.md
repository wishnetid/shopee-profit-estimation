# NEXTAGENTS — Shopee Profit Estimation

**Last updated:** 2026-08-09 14:22 WIB

**Production:** https://webapp-umber-five.vercel.app

**Repository:** `wishnetid/shopee-profit-estimation`

**Branch:** `master`

**Current release:** `add3501` — `feat(settings): add shared SKU reset control`

**Vercel production:** `dpl_BnuP6YxYMebS3KHt4neNJcUBRQs6` — `Ready`

> Mulai dengan membaca `README.md` penuh, lalu file ini. Jangan langsung coding, migration, import, clear, atau mengubah Vercel/DB. RAW Order.all, Income, dan multi-store sudah release. Profit final belum tersedia.

---

## 1. Handoff Ringkas

### Selesai dan live

- Multi-store **single-admin** dengan selector store global.
- Store: `TACTICALIZED`, `TACTICALITY`, `TACTICALIST`, `TACTICALUXE`.
- `order_all` dan `income_report_imports` sudah store-scoped.
- Child Income membaca scope melalui parent `income_report_imports`.
- Master SKU tetap shared/global.
- Orders, Income, Upload, Settings, dan Dashboard mengikuti active store.
- Production memiliki `clear_store` untuk data operasional store aktif dan `clear_shared_sku` untuk reset Master SKU global.
- Working tree menambahkan `DELETE /api/stores` dan UI **Hapus Toko Aktif**; belum commit/push/deploy.
- Basic Auth berlaku untuk page dan API.
- Profit legacy disengaja mengembalikan `503 PROFIT_NOT_READY`.
- GitHub `master` dan Vercel Production sudah memuat release `add3501`.

### Belum selesai

- Preview workbook real pada endpoint production setelah release `d143899`.
- Import real ke store kosong belum dilakukan.
- Balance Transaction RAW.
- Return/refund, failed delivery, cancellation.
- HPP final, ads, net payout, actual profit, dan estimation profit.
- Multi-user authorization: `storeId` sekarang selector scope satu admin, bukan ownership boundary per user.
- Baseline lint cleanup.

### Jangan salah simpulkan

- Production deployment sudah `Ready`; bukan staging/local-only.
- API smoke production sudah lulus untuk auth, store list, isolation store kosong, invalid pagination, invalid SKU import ID, dan Profit guard.
- Upload preview real **belum** dieksekusi setelah release. Jangan menyebut upload production final sebelum test itu.
- Tidak ada clear, import, atau migration apply saat release multi-store.

---

## 2. Kondisi Git yang Harus Dipertahankan

Mulai dengan:

```bash
cd /home/yogaimawan/Dokumentasi/shopee_profit_estimation
```

```bash
git status --short
```

Expected user artifacts yang boleh tetap untracked:

```text
NEXTAGENTS.md.backup-20260809-044404
README.md.backup-20260809-044404
data_sample/Income.sudah dilepas.id.20260601_20260630.xlsx
data_sample/Income.sudah dilepas.id.20260701_20260731.xlsx
data_sample/Income.sudah dilepas.id.20260801_20260808.xlsx
```

Rules:

- Jangan `git add -A` atau `git commit -am`.
- Jangan commit `.env.local`, workbook, Archive, atau backup tanpa instruksi eksplisit user.
- Jangan overwrite change user yang belum commit.
- Backup docs release terakhir tersimpan di:

```text
Archive/docs-backups/README.md.pre-current-state-20260809-142212
Archive/docs-backups/NEXTAGENTS.md.pre-current-state-20260809-142212
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

- Basic Auth saat ini mewakili satu admin yang sah mengelola semua store.
- Endpoint memvalidasi format serta eksistensi `storeId`.
- Jangan mengklaim isolation antar-user/tenant.
- Sebelum membuat user/credential per store, implement identity session dan server-side ownership check terhadap `stores.owner_user_id` pada seluruh read/mutation route.

---

## 4. Kontrak Aktif

### Order.all

```text
Satu row = satu item/variasi pesanan
```

- Current-state merge, bukan ledger append.
- Snapshot/export timestamp wajib untuk mengendalikan freshness.
- Status tidak boleh mundur.
- Field populated tidak boleh overwritten oleh blank/masked/older snapshot.
- Duplicate composite key di dalam workbook ditolak sebelum import.
- Import transaction: satu kegagalan membatalkan seluruh batch.

Files:

```text
webapp/app/api/upload/route.ts
webapp/lib/order-all-import.js
webapp/test/order-all-import.test.mjs
```

### Income

- Satu workbook = satu RAW package/provenance untuk satu store.
- Exact SHA-256 duplicate hanya berlaku dalam store yang sama.
- Overlap periode dengan file berbeda tetap diimport sebagai package RAW terpisah.
- `Penghasilan Order` dan `Penghasilan Sku` tidak boleh dijumlahkan bersama.
- Summary hanya reconciliation metadata.
- Adjustment/Shipping Fee Discrepancy tetap section terpisah.

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
- Tidak ikut `clear_store`.
- `clear_shared_sku` memakai confirmation eksplisit; child `sku_master_raw` dihapus sebelum parent `sku_report_imports`.
- Working tree menambahkan hapus store dengan confirmation eksplisit. Backend wajib menolak store terakhir dan store yang masih memiliki Order.all atau Income; Master SKU shared tidak ikut dihapus.
- Halaman `/sku` tidak perlu active-store scope kecuali produk memutuskan override SKU per store pada fase lain.

---

## 5. UI/API Contract yang Harus Dijaga

### Halaman

```text
/upload    Preview/import Order.all, Income, Master SKU
/orders    Order.all store aktif
/income    Income RAW store aktif
/sku       Master SKU shared
/settings  Database management store aktif
/profit    Informational guard, belum ada angka profit
```

### Race/stale guard

Sudah diimplementasikan. Jangan regress:

- Orders/Income/Settings tidak boleh menampilkan payload store lama di bawah label store baru.
- Upload membatalkan preview/import state pada saat `storeId` berubah.
- Preview dan import terikat ke `previewStoreId`.
- Settings confirmation clear dan completion/fetch terikat ke store yang dikonfirmasi.
- SKU request mengabaikan response stale.

### Pagination/input guard

- `page`, `limit`, dan `importId` diparse strict.
- Nilai pecahan, malformed, non-positif, atau offset unsafe harus `400`.
- Jangan mengembalikan `500` untuk malformed JSON body pada mutation Store/Settings.

### Upload

```text
POST /api/upload
action=preview  Preview only; jangan dimaksudkan write DB
action=import   Mutasi database; hanya setelah user approve
```

- Client hanya menerima `.xlsx`/`.xls`.
- Preview/import mengirim `storeId`.
- Untuk Order.all, `source_snapshot_at` wajib diisi UI.
- Test preview production memakai `action=preview` masih tertunda; user sudah menyediakan source di `data_sample/`.
- Jangan menjalankan import otomatis hanya karena preview lulus.

### Settings destructive route

```json
{
  "action": "clear_store",
  "storeId": 1,
  "confirmation": true
}
```

- Tidak ada lagi `clear_table` atau `clear_all` pada kontrak baru.
- Jangan gunakan endpoint ini untuk test, smoke, atau cleanup.

---

## 6. Access, Deployment, dan Runtime

### Production

```text
Canonical alias: https://webapp-umber-five.vercel.app
Project: wishnet-s-projects/webapp
Project ID: prj_WdCpV0HGeTzPpreRDIuZqI6i00IJ
Root Directory: webapp
Current deployment: dpl_5ELAu1nmb9MLUKk9ByZjLberBtHU
```

Vercel aliases current deployment:

```text
https://webapp-umber-five.vercel.app
https://webapp-wishnet-s-projects.vercel.app
https://webapp-git-master-wishnet-s-projects.vercel.app
```

### Security

- Basic Auth wajib untuk page/API.
- Mutation juga memeriksa Basic Auth dan same-origin.
- `DASHBOARD_AUTH_ENABLED` bukan public bypass switch aktif.
- Jangan ubah env Vercel atau credential tanpa persetujuan eksplisit user.
- DB credential harus tetap hanya di server-side environment.

---

## 7. Quality Gate yang Sudah Lulus

Pada release `d143899`:

```text
npm test                                      60/60 PASS
./node_modules/.bin/tsc --noEmit ...          PASS
npm run build                                 PASS
git diff --check                              PASS
Independent read-only review                  PASS
```

Production smoke sudah membuktikan:

```text
Tanpa Basic Auth                              401
/api/stores dengan Auth                       200
Orders + Income store kosong                  200 / isolated empty result
Pagination unsafe                             400
SKU importId invalid                          400
Profit route                                 503 PROFIT_NOT_READY
```

`npm run lint` belum PASS karena baseline legacy yang masih berisi `any`, `require()`, dan React hook rule. Jangan mengklaim lint hijau atau mencampurkannya dengan build/typecheck PASS.

---

## 8. Opening Procedure Jika Akan Ubah Kode

1. Baca `README.md` penuh.
2. Jalankan `git status --short` dan pastikan artifacts user tidak disentuh.
3. Baca `webapp/AGENTS.md` dan dokumentasi Next.js lokal yang relevan sebelum mengubah source Next.
4. Audit source dan DDL live read-only sebelum mengubah schema/migration.
5. Jika report baru: berhenti di fase analisa lalu diskusi. Jangan langsung coding.
6. Jika import real: preview dulu, laporkan hasil, tunggu persetujuan import.
7. Setelah perubahan source: test, TypeScript, build, `git diff --check`, review independen fresh, baru commit/deploy bila user mengizinkan.

---

## 9. Next Scope — Harus Diskusi Dulu

Urutan rekomendasi:

1. Preview real production memakai satu workbook yang user sediakan.
2. Analisa Balance Transaction: sheet/header, grain, tipe transaksi, sign, `No. Pesanan`, duplicate policy.
3. Analisa return/refund, failed delivery, cancellation terhadap Order.all/Income/Balance.
4. Diskusi financial layer: Income Order, Income Sku, HPP, ads, return, settlement.
5. Baru bangun actual profit dan estimation profit.

## 10. Larangan Keras

- Jangan clear/truncate/reimport DB tanpa backup tervalidasi dan approval eksplisit.
- Jangan auto-import workbook dari `data_sample/`.
- Jangan commit `.env.local`, raw customer report, Archive, atau backup.
- Jangan menghitung `Penghasilan Order` dan `Penghasilan Sku` bersamaan.
- Jangan membuat profit dari `Order.all` saja.
- Jangan memperlakukan `schema.sql` sebagai DDL live tanpa audit.
- Jangan mengubah security/config production demi meredam warning kosmetik.
