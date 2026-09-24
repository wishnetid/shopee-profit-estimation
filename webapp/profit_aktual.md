# Profit Aktual — Rencana, Kontrak, dan Progress

**Status:** LIVE — Profit Aktual normal, audit settlement, Return QC, dan Rekonsiliasi My Balance read-only tersedia; policy profit final retur/adjustment masih menunggu persetujuan.

**Tujuan dokumen:** handoff lintas sesi/agent. Semua keputusan, data source, progress verifikasi, perubahan kontrak, dan release Profit Aktual harus dicatat di file ini.

---

## 1. Batas Produk

Menu existing `/profit` tetap dipakai dengan dua tab:

```text
Profit & Estimasi
├─ Estimasi Kotor                 LIVE, read-only
└─ Profit Aktual                  belum dibangun
```

Profit Aktual **bukan** penggantian atau modifikasi Estimasi Kotor. Implementasi harus additive dan menjaga perilaku seluruh fitur Estimasi Kotor yang sudah ada, termasuk:

- filter tanggal;
- multi-select Status Shopee;
- filter No. Resi: semua / ada resi / belum ada resi;
- summary card order unik, resi unik, total PCS SKU, Total HPP, Estimasi Kotor, Ads, PPN Ads, dan sisa setelah Ads/PPN.

Tidak boleh migration, import, clear data, reset master SKU, atau perubahan schema sebelum source report dianalisis dan scope disetujui user.

---

## 2. Definisi Profit Aktual Fase 1

### 2.1 Target awal

**Profit Aktual Tersettle — Normal** pada grain `No. Pesanan`.

```text
Profit Aktual Produk
= Penghasilan / Order signed_total yang sudah dana dilepas
- Σ(HPP Master × quantity item)
```

### 2.2 Aturan penting

- `Penghasilan / Order` adalah settlement finansial utama per order.
- `Penghasilan / SKU` hanya dipakai untuk rincian/alokasi item pada order multi-SKU; jangan dijumlahkan dengan `Penghasilan / Order`.
- HPP mencari `Nomor Referensi SKU`, lalu fallback `SKU Induk`, sesuai kontrak Master SKU existing.
- HPP kosong atau konflik tidak boleh dibaca sebagai Rp0.
- Ads, PPN Ads, packaging, tenaga kerja, dan biaya operasional lain **tidak** dialokasikan ke order pada Fase 1.
- `Seller Fee` audit-only; tidak boleh ditambahkan lagi apabila sudah tercermin dalam settlement Penghasilan.
- Return/refund, failed delivery, cancellation, serta Adjustment bukan bagian dari profit normal tanpa rule khusus dan evidence source yang cukup.

---

## 3. Cohort dan Status Finansial

Cohort ditentukan oleh **tanggal order dibuat pada Order.all**, bukan tanggal dana dilepas.

Contoh pilot awal yang direkomendasikan: seluruh order dibuat **1–31 Agustus 2026**. Order tersebut tetap masuk walau dana baru dilepas setelah Agustus.

Order yang belum selesai atau belum menerima settlement **tetap di-import dan ditampilkan**. Jangan hilangkan dari cohort.

| Kondisi | Status Profit Aktual yang direncanakan | Perlakuan angka |
|---|---|---|
| Penghasilan / Order ada dan HPP valid | Profit Aktual Tersettle | Masuk total actual normal |
| Perlu Dikirim / Sedang Dikirim / Telah Dikirim | Belum Tersettle | Tidak masuk total actual |
| Selesai tetapi belum ada Penghasilan / Order | Menunggu Dana Dilepas | Tidak masuk total actual |
| HPP kosong atau conflict | Perlu Mapping HPP | Settlement tampil, profit ditahan |
| Return/refund atau failed delivery | Perlu Finalisasi Exception | Tidak masuk actual normal |
| Batal | Tidak Ada Profit | Tidak masuk total actual |
| Adjustment yang berelasi ke order | Perlu Rekonsiliasi Adjustment | Jangan otomatis ditambahkan/dikurangkan sebelum kontrak disetujui |

Target UI harus memisahkan setidaknya:

```text
Profit Aktual Tersettle
Belum Tersettle
Menunggu Dana Dilepas
Perlu Mapping HPP
Perlu Finalisasi Exception
```

---

## 4. Data Source yang Dibutuhkan

### Wajib untuk membangun Fase 1

1. **Master SKU + HPP**
   - Shared/global.
   - Harus mencakup semua SKU pada cohort.

2. **Order.all**
   - Seluruh order pada cohort.
   - Export/snapshot terbaru agar status, resi, cancellation marker, dan return marker lebih final.
   - Waktu snapshot/export harus dicatat saat import.

3. **Income — Sudah Dilepas**
   - Wajib menyertakan `Penghasilan / Order`.
   - `Penghasilan / SKU` diimport jika tersedia untuk audit/alokasi item.
   - Import semua workbook yang mencakup pelepasan dana order cohort, termasuk bulan setelah cohort bila settlement terlambat.
   - Exact hash duplicate dalam toko sama adalah no-op. File berbeda dengan periode overlap tetap RAW package terpisah dan perlu dedupe di layer kalkulasi berdasarkan identitas settlement yang nanti disetujui.

### Wajib sebelum menyatakan laporan seluruh cohort final

4. **Return / Refund**
   - Coverage dari awal cohort sampai tanggal export sekarang.
   - Barang kembali layak jual vs rusak/hilang membutuhkan keputusan QC.

5. **Failed Delivery**
   - Coverage dari awal cohort sampai tanggal export sekarang.
   - Dipakai untuk klaim/kompensasi dan finality exception.

6. **Cancellation**
   - Minimal seluruh cohort; disarankan sampai tanggal export sekarang.

7. **Balance Transaction**
   - Coverage dari awal cohort hingga pelepasan dana terbaru yang masih menyelesaikan cohort.
   - Digunakan untuk audit/reconciliation, bukan dijumlahkan sebagai profit per order.

### Opsional untuk layer toko/hari

8. **Ads RAW**
   - Boleh diupload untuk monitoring biaya Ads harian.
   - Tidak digunakan untuk alokasi biaya per order pada Fase 1.

---

## 5. Rekomendasi Intake Pilot

Jangan mulai dari banyak bulan sekaligus. Pilot satu cohort dulu supaya mismatch dapat ditelusuri.

### Pilot yang direkomendasikan

```text
Cohort order: 1–31 Agustus 2026
```

### Paket upload yang diminta

```text
1. Master SKU + HPP
2. Order.all: seluruh order dibuat 1–31 Agustus 2026; snapshot terbaru
3. Income: Agustus dan bulan lanjutan sampai tanggal export saat ini,
   selama masih ada order Agustus yang dana-nya dilepas
4. Return / Refund: 1 Agustus 2026 sampai tanggal export
5. Failed Delivery: 1 Agustus 2026 sampai tanggal export
6. Cancellation: 1 Agustus 2026 sampai tanggal export
7. Balance: 1 Agustus 2026 sampai settlement cohort terakhir yang tersedia
8. Ads RAW Agustus: opsional
```

### Urutan upload

```text
Master SKU + HPP
→ Order.all cohort
→ Income packages
→ Return / Refund
→ Failed Delivery
→ Cancellation
→ Balance
→ Ads RAW (opsional)
```

---

## 6. Gate Sebelum Coding

Setelah user upload, lakukan audit read-only pada canonical production API/database:

1. Pastikan store target dan package/row count tiap report sesuai upload.
2. Audit mapping `Order.all` → Master HPP.
3. Cocokkan `No. Pesanan` cohort dengan `Penghasilan / Order` settlement.
4. Pisahkan:
   - settled normal;
   - belum settle;
   - settlement tanpa pasangan order;
   - order selesai tanpa settlement;
   - HPP missing/conflict;
   - cancellation/return/refund/failed delivery;
   - adjustment.
5. Jangan menjumlahkan `Penghasilan / Order` dan `Penghasilan / SKU`.
6. Audit Balance sebagai reconciliation independen, bukan sumber profit order.
7. Dokumentasikan coverage dan mismatch sebelum coding.

Coding Fase 1 hanya dimulai setelah user menyetujui hasil reconciliation dan rule treatment exception.

---

## 7. Rencana Implementasi Bertahap

### Fase 0 — Intake dan reconciliation

- Upload raw sources cohort.
- Preview/import dan audit read-only.
- Buat laporan coverage/mismatch.
- Tentukan identity settlement, policy overlap package, dan status UI final.

### Fase 1 — Profit Aktual Tersettle Normal

- Read-only endpoint/store-scoped.
- Join settlement `Penghasilan / Order` dengan order/item dan HPP.
- Summary actual normal, detail per order, serta bucket pending/review.
- Tidak mengalokasikan Ads maupun biaya eksternal ke order.
- Tidak mengubah Estimasi Kotor.

### Fase 2 — Exception visibility

- Surface cancellation, return/refund, failed delivery, dan adjustment sebagai bucket audit yang terpisah.
- Belum mengklaim profit final return sebelum policy QC disetujui.

### Fase 3 — Return QC dan finality

- Tambah keputusan QC stock return jika source/process disepakati:
  - restock layak;
  - rusak;
  - hilang;
  - belum dinilai.
- Baru dapat menghitung kerugian HPP retur secara final.

### Fase 4 — Optional costs

- Hanya setelah ada source evidence dan kontrak alokasi: Ads attribution, packaging, tenaga kerja, atau OPEX.

---

## 8. Progress Log

### 2026-09-23 — Planning dibuat

- User menyatakan dapat menyediakan seluruh report.
- User sudah clear data aplikasi untuk memilih sample cohort dengan lebih presisi.
- Disepakati bahwa order belum selesai tetap bagian cohort dan harus ditandai, bukan dikeluarkan.
- Belum ada source Profit Aktual yang diimport setelah clear data.
- Belum ada coding, schema change, migration, atau endpoint Profit Aktual baru.

### 2026-09-24 — Income sampling parser fixed dan diverifikasi

- Input/report: `Income.sudah dilepas.id.20260801_20260924.xlsx`, periode 2026-08-01 s.d. 2026-09-24.
- Verifikasi: parser membaca 1.120 row `Penghasilan / Order`, 1.437 row `Penghasilan / Sku`, 6 row Adjustment, dan 2 row Shipping Fee Discrepancy. Checksum `Penghasilan / Order` = Summary `Total yang Dilepas` Rp127.775.146; selisih Rp0.
- Temuan/mismatch: aplikasi hanya mengenali header lama `Discrepancy reason`; export Shopee aktif memakai header Indonesia `Alasan perbedaan`, sehingga seluruh Income package fail-closed dan ditolak meskipun settlement utama cocok.
- Keputusan yang disetujui: parser menerima kedua label header, menyimpan alasan dalam key kanonis `discrepancy_reason`, dan tetap fail-closed bila struktur inti berubah.
- Perubahan source/schema/code: parser + regression test saja; tanpa schema change, import, reset, atau kalkulasi Profit Aktual.
- Test/deploy: `npm test` 132 pass, 2 live-DB check skipped; `npm run build` berhasil. Lint global masih gagal pada file lama di `app/api/internal/order-all-line-ordinal-migration/route.ts` dan `scripts/migrate-order-all-line-ordinal.js`, tidak terkait perubahan Income.
- Next step: deploy perbaikan parser; setelah itu preview ulang lalu import Income melalui aplikasi sebelum audit cohort Fase 0.

### 2026-09-24 — Fase 0 audit cohort Agustus via canonical DB

- Input/report: audit read-only database `supplie3_shopee_profit_estimation` melalui SSH tunnel VPS → Windows → cPanel MySQL. Store `TACTICALIZED` (`store_id=1`).
- Coverage: `Order.all` cohort dibuat 1–31 Agustus 2026 berisi 756 order / 989 physical item row: 600 `Selesai`, 139 `Batal`, dan 2 `Sedang Dikirim`. Income package #12 periode 1 Agustus–24 September, checksum matched: 1.120 `Order`, 1.437 `Sku`, 6 Adjustment, 2 Shipping Fee Discrepancy. Balance package #4 status reconciliation dan ledger continuity `matched`. Ads package #12 tersedia tetapi tetap di luar alokasi Fase 1.
- Verifikasi: 600 order `Selesai` masing-masing mempunyai tepat satu `Penghasilan / Order`, total Rp72.992.154; tidak ada duplicate settlement row. Semua 587 order settled non-exception punya mapping HPP valid lewat `Nomor Referensi SKU`: 753 item row / 1.042 pcs. Balance menemukan seluruh 1.120 settlement order ID; 1.119 nominal exact match.
- Temuan/mismatch: 13 order `Selesai` tersettle dengan total Rp333.138 beririsan Return/Refund, sehingga dikeluarkan dari normal dan tetap bucket `Perlu Finalisasi Exception`. Balance mismatch satu order `260814BQYKUWFW`: Income -Rp959 vs net Balance Rp4.041 karena Balance memuat transaksi masuk dan keluar; tidak dipakai untuk mengubah settlement. 139 order batal tanpa settlement; 2 sedang dikirim tanpa settlement. Failed Delivery ada 17 order / 18 row dan Return/Refund ada 13 order / 17 row; exception visibility tetap wajib dipisah dari actual normal.
- Keputusan yang disetujui: bukti cukup untuk kontrak Fase 1 read-only: 587 order `Profit Aktual Tersettle Normal`, settlement Rp72.659.016 sebelum HPP; 2 `Belum Tersettle`; 13 `Perlu Finalisasi Exception`; 139 `Tidak Ada Profit — Batal`. Adjustment, Ads, PPN Ads, Balance mismatch, failed delivery dan return/refund tidak dialokasikan ke normal profit.
- Perubahan source/schema/code: belum ada. Audit hanya SELECT/read-only.
- Test/deploy: koneksi canonical DB melalui Windows berhasil; tidak ada data DB yang diubah.
- Next step: implementasi Fase 1 additive, tanpa migration/schema change: endpoint read-only + tab Profit Aktual dengan summary, bucket, dan detail order settled normal.

### 2026-09-24 — Fase 1 implemented (pending production verification)

- Endpoint baru `GET /api/profit-calculation`, read-only dan store-scoped. Mengambil hanya `Penghasilan / Order` sebagai settlement, memakai resolver HPP aplikasi (`Nomor Referensi SKU` dulu, lalu `SKU Induk`), dan membentuk exception dari Cancellation + Failed Delivery + Return/Refund.
- Kalender cohort menggunakan batas WIB eksplisit (`UTC+7`), tidak memakai `DATE()` server-dependent.
- UI tab `Profit Aktual` dibuat additive pada halaman `/profit`; Estimasi Kotor tidak diubah. Summary menampilkan profit normal, settlement, HPP, serta bucket review; tabel tetap memperlihatkan seluruh order cohort dengan bucket masing-masing.
- Verifikasi canonical DB sebelum UI: 741 unique order / 972 physical item row; 587 settled normal, 2 pending, 13 exception, 139 batal; settlement normal Rp72.659.016, HPP Rp59.152.500, Profit Aktual Normal Rp13.506.516.
- Test: `npm test` 132 pass, 2 live-DB test skipped. `npm run build` berhasil. Tidak ada migration, import, atau mutasi database.
- Next step: commit/push, Production deployment, API smoke test dan browser visual QA.

### 2026-09-24 — Fase 2 exception visibility implemented

- Scope: menambahkan tabel audit-only `Exception & Rekonsiliasi` di tab Profit Aktual. Tidak mengubah total Profit Aktual Normal, HPP normal, maupun Estimasi Kotor.
- Source RAW: Return/Refund, Failed Delivery, Cancellation, dan Income Adjustment. Setiap baris membawa No. Pesanan, jenis, referensi/status sumber, alasan, qty, nilai, status pengembalian barang/QC bila tersedia, serta provenance nama source file.
- Coverage cohort Agustus: Return/Refund 17 row / 13 order / nilai refund Rp1.883.773; Failed Delivery 18 row / 17 order; Cancellation 192 row / 139 order; Adjustment 1 row / 1 order / Rp5.000. Angka tersebut hanya visibility/reconciliation, bukan alokasi profit.
- Guardrail: Return tetap `Menunggu QC / N/A` bila status stok tidak tersedia; Adjustment tidak ditambahkan atau dikurangkan otomatis; cancellation/failed delivery tidak membatalkan atau mengubah Settlement normal secara baru.
- Test/deploy: `npm test` dan `npm run build` sudah berhasil setelah implementasi Fase 2. Tidak ada migration/import/mutasi DB.
- Next step: Fase 3 persistence QC internal setelah user menyetujui status dan scope audit.

### 2026-09-24 — Fase 3 QC internal persistence

- User menyetujui pencatatan QC internal per `No. Pengembalian`, store-scoped, dengan status `belum_dinilai`, `restock_layak`, `rusak`, atau `hilang` serta catatan opsional.
- Migration eksplisit `scripts/migrate-return-qc.js` dibuat dan diterapkan melalui bridge canonical DB; tabel `return_qc_decisions` punya unique identity `(store_id, no_pengembalian)` dan index audit `(store_id, no_pesanan)`.
- UI `Return QC Internal` menampilkan evidence RAW Return/Refund, pilihan status, catatan, dan aksi simpan per retur.
- `POST /api/return-qc` memerlukan sesi dashboard atau Basic API valid; browser mutation wajib same-origin. Input status di-whitelist dan catatan dibatasi 2.000 karakter.
- API Profit Aktual membaca keputusan QC yang tersimpan untuk toko aktif. Clear Data Toko Aktif menghapus `return_qc_decisions` sebelum RAW return agar tidak ada orphan data.
- Guardrail: QC adalah catatan operasional/audit. Tidak mengubah HPP, settlement, Profit Aktual Normal, Estimasi Kotor, atau melakukan alokasi finansial return.
- Keputusan scope: tab `Profit Aktual` dikhususkan untuk profit pesanan selesai saja. Policy finansial retur, refund, dan dampak HPP return akan dibuat pada tab baru terpisah; tidak dicampur ke Profit Aktual.

### 2026-09-24 — Pemisahan tab Profit Aktual vs Retur & Refund

- Tab `Profit Aktual` sekarang hanya merender bucket `settled_normal`: pesanan selesai dengan settlement `Penghasilan / Order` dan HPP valid.
- Tab baru `Retur & Refund` memuat Return QC Internal dan Exception & Rekonsiliasi: return/refund, failed delivery, cancellation, serta adjustment.
- Kedua tab membaca evidence yang sama secara store-scoped; pemisahan hanya presentasi dan scope analisis. Tidak ada perubahan formula, schema, atau mutasi finansial.
- Return QC tetap dapat disimpan hanya dari tab Retur & Refund dan tidak tampil pada tab Profit Aktual.

### 2026-09-24 — Rentang tanggal dinamis

- Profit Aktual dan Retur & Refund sekarang menyediakan `Dari tanggal` dan `Sampai tanggal`.
- Default awal mempertahankan cohort audit Agustus 2026, tetapi user dapat memilih rentang kalender lain sebelum memuat data.
- Permintaan API memakai parameter `dateFrom`/`dateTo` dari input; scope yang benar-benar dipakai API ditampilkan kembali setelah load.
- Rentang kosong atau terbalik ditolak di client, sementara API tetap menjalankan validasi tanggal independen.

### 2026-09-24 — Bounded scroll Profit Pesanan Selesai

- Tabel `Profit Pesanan Selesai` memakai bounded scroll container: tinggi area kira-kira sembilan baris data dan scrollbar vertikal untuk baris lain.
- Header tabel dibuat sticky saat scroll. Tidak ada pagination atau limit API tambahan; seluruh hasil tetap tersedia melalui scroll.

### 2026-09-24 — Retur Parsial: Profit Menunggu Alokasi

- Settlement dengan return parsial tidak lagi dipresentasikan sebagai exception generik. Jika sebuah order memiliki `Penghasilan / Order` yang cair, `returned_quantity > 0`, dan masih ada pcs non-retur, API memberi bucket `partial_return_pending_allocation`.
- Bucket ini tetap dikecualikan dari **Profit Aktual Normal**, Total HPP normal, dan Profit normal. Ia terlihat pada kartu serta klasifikasi **Retur Parsial — Menunggu Alokasi** di tab Settlement Dikecualikan.
- UI menampilkan dana settlement order, jumlah pcs tetap terjual versus pcs retur, return/refund detail, dan QC. Ini menghindari kesan bahwa seluruh order otomatis rugi atau bahwa settlement belum cair.
- API juga mengirim `Penghasilan / SKU` sebagai **bukti audit alokasi**. Nilai view SKU tidak pernah dijumlahkan lagi ke `Penghasilan / Order` dan tidak otomatis menjadi profit final. UI menunjukkan total SKU dan selisih terhadap settlement Order agar mismatch terlihat.
- Validasi live `260901UY5MGHJX`: settlement Order/My Balance Rp64.066; 2 pcs order, 1 pcs W-TAC tetap terjual, 1 pcs BLACKHAWK diretur; Penghasilan/SKU W-TAC Rp63.756 dan BLACKHAWK -Rp408, total Rp63.348, sehingga masih ada selisih Rp718 terhadap settlement Order. Profit final tetap ditahan sampai rekonsiliasi selisih dan QC return/policy HPP diputuskan.
- Tidak ada schema/migration atau perubahan angka Profit Aktual Normal. Klasifikasi dan bukti ini read-only.

### 2026-09-24 — Cakupan Cohort: Total Pesanan dan Total Pcs

- Tab **Profit Aktual** menambahkan strip **Cakupan Cohort** di atas kartu finansial agar volume order tidak disalahartikan sebagai jumlah order yang sudah profit/settle.
- `Pesanan unik` = jumlah `No. Pesanan` unik pada seluruh `Order.all` dalam rentang wajib **Waktu Pesanan Dibuat**, semua status termasuk batal, pending, selesai, exception, dan belum cair.
- `Total pcs` = `SUM(jumlah)` semua physical item-row cohort; repeated product line yang valid tetap dihitung sebagai qty sumber, bukan dideduplikasi per SKU.
- Keduanya sengaja tidak berubah ketika filter sekunder **Tanggal Dana Dilepaskan** dipakai. Filter tersebut hanya mempersempit settlement/profit, bukan arti cohort order.
- Stripe diletakkan terpisah dari kartu finansial dan dilabelkan `sebelum filter settlement`.

### 2026-09-24 — Filter opsional Tanggal Dana Dilepaskan

- Profit Aktual menampilkan dua dimensi tanggal yang sengaja dipisahkan: cohort wajib **Waktu Pesanan Dibuat** dan filter settlement opsional **Tanggal Dana Dilepaskan**.
- Jika filter settlement kosong, perilaku sebelumnya dipertahankan: seluruh settlement untuk cohort order dipakai sesuai guardrail Profit Aktual.
- Jika satu/dua batas dana dilepas terisi, hasil merupakan **AND / irisan**: order harus dibuat di cohort terpilih dan settlement `Penghasilan / Order` harus dilepas dalam rentang settlement.
- API mengembalikan rentang yang benar-benar dieksekusi dan UI menampilkan `Mode: irisan cohort order + cash release`.
- Order yang memang punya settlement tetapi dana dilepas di luar rentang tidak disalahlabeli `Selesai Belum Cair`; dicatat sebagai `settlement_outside_release_range` dan dihitung pada kartu `Cair di Luar Filter`.
- Kolom `Dana Dilepas` ditampilkan pada detail Profit Pesanan Selesai. Ini tetap bukan pengganti cohort order atau formula Profit Aktual.

### 2026-09-24 — Settlement Dikecualikan dan detail retur

- Tab audit `Exception` diganti label bisnis **Settlement Dikecualikan**: settlement cair yang tidak masuk Profit Aktual normal karena return/refund, failed delivery, pembatalan, atau HPP review.
- Profit Aktual menampilkan kartu `Settlement Dikecualikan` berisi jumlah settlement dan jumlah pesanan terdampak. Nilai ini tidak dijumlahkan ke settlement normal, HPP, atau profit normal.
- Setiap baris audit dapat dibuka untuk memperlihatkan settlement/release date, source exception, No. Pengembalian, qty/nilai, status QC, dan seluruh item Order.all beserta qty order, qty retur, dan status retur.
- Return QC tetap bukti operasional saja. Tidak ada alokasi otomatis refund maupun HPP sampai kebijakan finansial retur disetujui.

### 2026-09-24 — Koreksi kalender timestamp Order.all

- Audit terhadap workbook `Order.all.20260901_20260924.xlsx` dan DB canonical membuktikan nilai `DATETIME` `Order.all` dipersist persis seperti kalender lokal Seller Centre; nilainya bukan UTC yang harus ditambah/dikurangi tujuh jam.
- Semua range cohort Order.all (`Order All`, `Profit Aktual`, dan `Estimasi Kotor`) memakai batas lokal `[tanggal mulai 00:00, hari setelah tanggal akhir 00:00)`, tanpa offset timezone pada kolom DB.
- Bukti boundary: 1 September 2026 pada source September berisi 32 pesanan unik, 36 baris item, 37 pcs; 26 selesai dan 6 batal. Nilai sebelumnya yang menghitung 28 akibat asumsi offset UTC dinyatakan tidak valid.

### 2026-09-24 — Audit selisih Profit Aktual

- Tab `Selesai Belum Cair` memisahkan order yang sudah memiliki `Waktu Pesanan Selesai` di Order.all tetapi belum punya settlement `Income → Penghasilan / Order`. Order ini tidak dihitung sebagai Profit Aktual.
- Tab `Exception` memisahkan order yang punya settlement tetapi dikecualikan dari Profit Aktual Normal karena terdeteksi pada RAW Return/Refund, Failed Delivery, Cancellation, atau HPP perlu review.
- Kedua tab memakai cohort `Waktu Pesanan Dibuat` kalender WIB dan read-only. Tidak mengubah formula maupun total Profit Aktual normal.

### 2026-09-24 — Fase 3 Return QC review-only

- Keputusan user: belum ada source QC; aplikasi hanya membangun review tanpa menyimpan keputusan QC.
- Scope: endpoint mengeluarkan `returnQcReview` dari Return/Refund RAW yang sudah termasuk cohort. UI menampilkan No. Pengembalian, qty, alasan, status barang dari Shopee, status review, dan perlakuan finansial.
- Guardrail: tidak ada tabel/schema/migration QC, tidak ada tombol save/edit, dan tidak ada perubahan HPP, settlement, maupun Profit Aktual Normal. Status barang Shopee bukan keputusan QC internal.
- Next step: bila proses QC nyata sudah tersedia, sepakati source dan status restock/rusak/hilang/belum dinilai sebelum membangun persistence dan finality.

### 2026-09-24 — Profit Retur Parsial Sementara

- Atas keputusan user, retur parsial tidak lagi otomatis masuk `Settlement Dikecualikan`. Layer baru **Profit Retur Parsial Sementara** dipisahkan dari Profit Aktual Normal.
- Eligible hanya jika: ada `Penghasilan / Order` settlement; ada pcs non-retur dan pcs retur pada order yang sama; HPP semua pcs non-retur valid; My Balance memiliki event masuk `Penghasilan dari Pesanan` yang tepat sama dengan settlement; serta tidak ada mutasi My Balance negatif terkait order pada coverage Balance yang terimpor.
- Formula sementara: `Settlement Order - HPP pcs non-retur`. HPP pcs retur tidak dibebankan sementara sebagai asumsi inventory; angka ini adalah cash profit sementara, bukan Profit Aktual Normal atau final.
- Jika My Balance nanti memiliki nominal negatif pada No. Pesanan yang sama, item kembali ke **Settlement Dikecualikan** untuk audit. Retur penuh, HPP item terjual bermasalah, atau balance masuk yang tidak match juga tidak eligible.
- Contoh validasi: `260901UY5MGHJX`: settlement/My Balance masuk Rp64.066, W-TAC non-retur HPP Rp52.500, BLACKHAWK retur 1 pcs, tidak ada balance keluar dalam coverage; profit sementara Rp11.566.
- QC fisik masih manual dan hanya menjadi keputusan inventory/loss pada policy berikutnya; fitur ini tidak otomatis menyatakan barang retur benar-benar masuk stok.

### 2026-09-24 — Profit Pesanan unified financial view

- Default tab `/profit` sekarang **Profit Pesanan**. Tab sebelumnya yang memecah Profit Aktual, Profit Retur Parsial, Selesai Belum Cair, dan Settlement Dikecualikan dihapus dari navigasi utama; perhitungan/API tetap read-only dan tidak berubah.
- Satu tabel membentuk satu baris per `No. Pesanan` dalam cohort `Waktu Pesanan Dibuat`. Kolomnya: status finansial, settlement Income, net My Balance, HPP yang dipakai, profit, keterangan, serta `Lihat detail` untuk item dan evidence exception.
- Aturan tampilan: profit normal dan profit retur parsial sementara menampilkan angka; angka negatif tetap merah karena sudah dapat dihitung. Untuk order menunggu settlement, belum selesai, batal, HPP belum valid, cair di luar filter, atau perlu audit, kolom profit memakai `—`, bukan Rp0.
- Status filter tersedia di tabel: Semua, Profit Aktual, Profit Sementara, Menunggu Settlement, Cair di Luar Filter, Perlu Audit, HPP Belum Valid, Belum Selesai, dan Batal.
- Summary tetap memisahkan Profit Aktual Normal, Profit Retur Parsial, menunggu settlement, perlu audit, belum selesai, dan batal. Profit parsial tidak dijumlahkan diam-diam ke Profit Aktual Normal.
- Detail order menampilkan settlement/release, My Balance net dan keluar, HPP seluruh/non-retur, qty, evidence exception, dan item order. Retur & Refund tetap khusus QC fisik; Rekonsiliasi My Balance tetap untuk investigasi ledger yang lebih detail.
- Validasi canonical: cohort 1 September 2026 memiliki 25 Profit Aktual Normal, 1 Profit Sementara (`260901UY5MGHJX`, Rp11.566), dan 6 batal. Cohort Agustus 2026 memiliki 596 normal, 2 profit sementara total -Rp7.890, 11 perlu audit, 4 belum selesai, dan 143 batal.

### 2026-09-24 — Rekonsiliasi Settlement & My Balance (read-only)

- Tab baru **Rekonsiliasi My Balance** ditambahkan di `/profit`; tidak mengubah Estimasi Kotor, Profit Aktual Normal, HPP normal, Settlement Dikecualikan, atau Return QC.
- Cohort wajib memakai `Order.all.waktu_pesanan_dibuat` dengan batas kalender Seller Centre `[mulai 00:00, hari setelah akhir 00:00)`. Satu baris UI adalah satu `No. Pesanan`.
- API `GET /api/settlement-balance-reconciliation` bersifat store-scoped dan read-only. Ia menggabungkan `Income → Penghasilan / Order`, mutasi `Balance RAW`, dan evidence Return/Refund, Failed Delivery, serta Cancellation. `Penghasilan / SKU` tidak dibaca dan tidak dijumlahkan.
- Summary memisahkan: settlement Income, Penghasilan dari Pesanan masuk/keluar My Balance, Penyesuaian masuk/keluar, net mutasi Balance, dan jumlah order perlu rekonsiliasi.
- Detail event menyimpan waktu, arah, nominal, deskripsi, status, saldo setelah mutasi, source file, dan Excel row agar alasan cash outflow dapat diaudit tanpa asumsi.
- Status read-only: `Match normal`, `Ada pembalikan saldo`, `Ada penyesuaian`, `Ada exception + mutasi keluar`, `Retur parsial — menunggu alokasi`, `Perlu rekonsiliasi`, dan `Belum ada My Balance`.
- Audit canonical cohort Agustus 2026: 756 order; mutasi negatif terkait 27 order. Seluruh 27 memiliki evidence exception: 8 pembalikan `Penghasilan dari Pesanan` total -Rp198.916 dan 19 Penyesuaian keluar total -Rp9.190. Tidak ada nilai ini yang otomatis dipotong dari Profit Aktual Normal.
- Policy gate: kategori biaya premi pesanan gagal terkirim tetap hanya cash-adjustment audit sampai kebijakan eksplisit menetapkan apakah dan kapan dibebankan ke profit final. Tidak ada policy finansial otomatis pada rilis ini.

### Format progress berikutnya

Tambahkan entri baru di bawah ini setiap ada langkah bermakna:

```md
### YYYY-MM-DD — <judul progress>

- Input/report:
- Coverage:
- Verifikasi:
- Temuan/mismatch:
- Keputusan yang disetujui:
- Perubahan source/schema/code:
- Test/deploy:
- Next step:
```

---

## 9. Larangan / Guardrail

- Jangan menyebut Estimasi Kotor sebagai Profit Aktual.
- Jangan membuat profit dari Order.all saja.
- Jangan membuat HPP missing/conflict menjadi Rp0.
- Jangan menjumlahkan Penghasilan view Order dan SKU.
- Jangan menyamakan period overlap workbook dengan duplicate bisnis tanpa identity yang dibuktikan.
- Jangan menghitung return sebagai rugi HPP sebelum ada status QC barang.
- Jangan melakukan clear/reset/import/migration tanpa persetujuan user dan backup bila tindakan destruktif.
- Jangan menampilkan credential, Basic Auth, hash source, atau PII pembeli dalam laporan user-facing.
