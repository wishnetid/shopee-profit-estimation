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

## 2.1 Estimasi Order Belum Selesai — additive, terpisah dari finansial aktual

Profit Pesanan menampilkan section **Estimasi Order Belum Selesai** yang hanya mencakup bucket `pending` / status `Belum Selesai`; `completed_unsettled` tidak dimasukkan karena order tersebut sudah selesai dan hanya menunggu coverage settlement.

Empat kartu wajib:

```text
Pesanan Belum Selesai       = unique No. Pesanan bucket pending
PCS Belum Selesai           = Σ quantity item pending
Nominal Belum Selesai       = Σ Total Pembayaran, sekali per No. Pesanan
Estimasi Profit Belum Selesai
                           = Estimasi Kotor tanpa Ads
                           = subtotal seller − voucher seller − fee standar Shopee − HPP
```

Guardrail:

- `Total Pembayaran` adalah nominal order, bukan settlement Income dan bukan My Balance.
- Profit adalah **estimasi**, bukan Profit Aktual, tidak memasukkan Ads/PPN Ads, refund, adjustment, atau biaya operasional.
- Resolver HPP dan fee wajib memakai formula yang sama dengan tab existing Estimasi Kotor.
- Bila salah satu order pending tidak memiliki nilai order atau basis/HPP aman, total terkait tampil `—`, tidak diasumsikan Rp0.
- Section ini visual dan semantik terpisah dari **Cakupan Finansial** serta tidak mengubah summary Profit Aktual Normal/Profit Terhitung.

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

### 2026-09-25 — Ads RAW overlap canonicalization untuk update berkala

- Ads CSV RAW package tetap immutable. Canonical Ads memakai business fingerprint tanpa `Urutan`, karena sequence export berubah antar snapshot: `transaction_date + description + jumlah_signed + note + occurrence_rank`.
- `occurrence_rank` menjaga repeated physical event valid pada hari yang sama (contoh tiga `Isi Saldo` Rp100.000 pada 25 September); snapshot baru hanya menggantikan occurrence yang sama, bukan meruntuhkan tiga event menjadi satu.
- Preview update `tacticalized_adwords_bill_2026-09-25.csv` dibanding Ads package lama: 153 raw event, 144 overlap event, 9 event canonical baru/koreksi. Delta itu mencakup 4 deduction Ads pada 24–25 September dan 3 top-up Rp100.000 pada 25 September; preview/raw counts tidak disamakan dengan Actual Ads spend.
- My Balance Analysis dan Profit Estimation memakai selector canonical Ads yang sama. Balance top-up tetap dipisahkan dari actual deduction Ads; raw Ads table tetap physical/provenance.
- Test: preview live fixture menghasilkan 9 baru/144 overlap; `npm test` 146 pass/2 skipped dan `npm run build` berhasil. Tidak ada schema migration atau package RAW dihapus.

### 2026-09-25 — Balance overlap canonicalization untuk update berkala

- Balance RAW package tetap immutable. Untuk update `1–25 September` terhadap package lama `1 Agustus–24 September`, comparison event-level menunjukkan 655 raw event: 614 overlap identik dan 41 event baru (21 event lanjutan 24 September, 20 event 25 September).
- Identity canonical event Balance: `transaction_at + type_transaksi + description + No. Pesanan direct/extracted + jenis_transaksi + jumlah_signed + status + saldo_akhir`. Satu identity yang muncul di beberapa package memilih provenance import terbaru; raw event lain tetap tersedia untuk audit package.
- My Balance Analisis, Profit Aktual cash routing, dan Settlement↔My Balance Reconciliation menggunakan selector canonical yang sama. Balance RAW table tetap menampilkan physical source rows/package.
- Preview Upload Balance membedakan `raw event disimpan`, `event canonical baru`, dan `event overlap raw yang tidak dihitung ganda`; tidak lagi menyamakan raw 655 dengan delta financial/cash canonical 41.
- Guardrail: top-up wallet/PPN tetap cash funding terpisah; Balance tidak menggantikan Income settlement dan tidak otomatis mengubah Profit Aktual Normal; tidak ada schema migration maupun penghapusan package lama.
- Test: fixture live preview menghasilkan tepat 41 baru/614 overlap; `npm test` 146 pass/2 skipped dan `npm run build` berhasil.

### 2026-09-25 — Income overlap canonicalization untuk update berkala

- Problem ditemukan dari comparison raw Seller Centre: package lama `1 Agu–24 Sep` dan update `1–25 Sep` punya 516 settlement `Penghasilan / Order` yang overlap; hanya 30 settlement order baru. Raw package harus tetap disimpan immutable untuk provenance, tetapi overlap tidak boleh dijumlah dalam Profit Aktual.
- Contract canonical `Penghasilan / Order`: satu settlement per `No. Pesanan + Tanggal Dana Dilepaskan`; bila snapshot Seller Centre berikutnya membawa nilai koreksi pada identity sama, package/import terbaru menjadi canonical. Identity sengaja tidak memasukkan nominal agar koreksi menggantikan, bukan menambah settlement kedua.
- Profit Aktual dan allocation audit `Penghasilan / SKU` sekarang memilih canonical row dengan `ROW_NUMBER()` per identity dan freshness `imported_at, import_id, row_id` terbaru. Penghasilan Order dan SKU tetap tidak pernah dijumlah. Adjustment memakai canonical identity sendiri agar overlap package tidak menggandakan evidence exception.
- Preview Income sekarang menampilkan settlement Order canonical: pada fixture live update September, 546 Order rows terdiri dari 30 canonical baru dan 516 overlap existing; package tetap importable karena immutable raw provenance baru.
- Baseline sebelum import update: canonical Income 1.120 Order row / Rp127.775.146; Profit Aktual September 1–25: financial final Rp7.420.957, pending estimate Rp4.033.634. Ini menjadi pembanding after-import.
- UI Upload Income menjelaskan eksplisit sebelum import: seluruh raw row disimpan sebagai package provenance baru; angka canonical baru adalah yang memengaruhi Profit Aktual; overlap tetap evidence raw tetapi tidak dihitung ganda.
- Test/deploy: `npm test` 146 pass/2 skipped dan `npm run build` berhasil. Tidak ada schema migration; package raw lama tidak diubah/dihapus.

### 2026-09-25 — Search universal dan Bulk Search lintas report

- `Cari / Bulk Search` ditambahkan secara read-only ke report utama: Order All, Income beserta section RAW, My Balance, Return & Refund RAW, Ads RAW, SKU Master, Estimasi Kotor, Profit Pesanan, dan Retur & Refund.
- Input menerima teks biasa atau daftar Excel satu identifier per baris; delimiter legacy `||` tetap diterima. Baris kosong dibuang, duplikat dinormalisasi, maksimum 500 term.
- Pencarian tetap store-scoped serta mengikuti filter tanggal/status/cohort aktif. Query dipertahankan saat pagination dan sorting.
- Cakupan bukti: No. Pesanan, No. Resi, No. Pengembalian bila ada, SKU/reference, produk/variasi, status, serta description/reference sesuai source. Profit Pesanan/Retur & Refund ikut mencari evidence exception terkait order.
- Guardrail: tidak mengubah RAW, summary finansial, HPP, atau definisi Estimasi Kotor. Bulk search hanya filter audit/crosscheck.
- Test/deploy: `npm test` 146 pass / 2 skipped; `npm run build` berhasil; production deploy dan smoke test Order All/Estimasi Kotor memakai `260814BQYKUWFW` dan `260901UY5MGHJX` berhasil. Commit `2b2acb5`.

### 2026-09-25 — Control profit cohort dan basis Finance

- Untuk audit Finance, basis harus selalu dipisahkan: cohort `Waktu Pesanan Dibuat` versus cash basis `Tanggal Dana Dilepaskan`. Intersection kedua filter pada Profit Pesanan bukan otomatis full cash-basis P&L.
- Evaluasi cohort bulanan yang sudah lewat wajib membuka dana dilepas hingga coverage Income terbaru; jangan berhenti di akhir bulan cohort karena order bisa cair di bulan berikutnya.
- Control cohort berjalan dapat menampilkan `Hasil Finansial Final sudah cair + Estimasi Profit Belum Selesai − Actual Ads`. Estimasi pending tetap proyeksi tanpa Ads dan bukan settlement final; `completed_unsettled` tidak dipaksakan sebagai pending estimate.
- Profit bersih setelah Ads default: `Hasil Finansial Final sebelum Ads − actual Ads spend`. PPN wallet tampil sebagai pengurang opsional terpisah; gross top-up wallet bukan pengganti actual Ads spend.
- Belum ada fitur Finance Reconciliation/write input. Saat Finance menyerahkan Excel, audit harus membandingkan cutoff, komponen settlement/HPP/return-adjustment, Ads per channel, dan PPN dengan RAW application sebelum menyimpulkan angka final.

### 2026-09-25 — Kompensasi Return Final: return penuh dengan cash positif

- Return penuh dengan settlement negatif, My Balance keluar yang cocok, Income Adjustment positif order-linked yang cocok dengan My Balance masuk, dan evidence return/appeal selesai masuk `Kompensasi Return Final`.
- Formula: `net My Balance final − Rp0 HPP`.
- Masuk `Hasil Finansial Final`, terpisah dari Profit Aktual Normal dan Loss/Biaya Retur Final.
- Contoh tervalidasi: `260814BQYKUWFW` menghasilkan kompensasi net `Rp4.041`.
- Mismatch, cash event tambahan yang belum dijelaskan, atau evidence return tidak lengkap tetap `Perlu Audit`.

### 2026-09-25 — Loss/Biaya Retur Final: return penuh tanpa ketergantungan QC

- Berdasarkan audit RAW `Order.all`, `Return/Refund`, `Income / Penghasilan / Order`, dan `My Balance`, return penuh otomatis menjadi `Loss/Biaya Retur Final` bila: seluruh PCS return; status return `Dana Dikembalikan ke Pembeli`; settlement Income negatif; My Balance net dan mutasi `Penghasilan dari Pesanan` keluar cocok persis; tidak ada event cash tambahan; seluruh exception adalah Return/Refund.
- Formula: `net cash final − Rp0 HPP`. Semua PCS return diasumsikan kembali persediaan untuk tujuan finansial. Ini bukan klaim kondisi fisik barang.
- QC di tab Retur & Refund menjadi catatan internal opsional; tidak lagi mengubah routing profit/loss retur penuh maupun parsial.
- `Loss/Biaya Retur Final` terpisah dari Profit Aktual Normal dan mengurangi `Hasil Finansial Final`.
- `Hasil Finansial Final = Profit Aktual Normal + Profit Retur Parsial Final + Loss/Biaya Retur Final + Kompensasi Return Final`.
- `Hasil Finansial Terhitung` menambahkan Profit Retur Parsial Sementara untuk monitoring, tetap diberi label terpisah.
- Cash positive khusus/kompensasi, mismatch cash, return pending, atau missing Order.all tetap `Perlu Audit`; tidak dipaksa final.

### 2026-09-25 — Profit Retur Parsial Final: asumsi stok finansial otomatis

- Bucket `partial_return_final_restock` bersifat additive dan tetap **bukan Profit Aktual Normal**.
- Policy finansial disetujui: retur parsial yang cash-nya sudah cocok otomatis memakai asumsi PCS retur masih menjadi persediaan. Tidak perlu action QC di tab Retur & Refund, karena pemeriksaan fisik dikelola aplikasi return terpisah.
- Syarat: retur parsial; settlement `Penghasilan / Order` positif; My Balance incoming cocok persis dengan settlement; tidak ada mutasi My Balance keluar; HPP seluruh PCS non-retur valid; seluruh exception order adalah Return/Refund.
- Formula: `settlement − HPP PCS non-retur`. HPP PCS retur tidak dibebankan karena asumsi stok finansial, bukan bukti QC fisik.
- UI Profit Pesanan memisahkan `Profit Retur Parsial Final` dan `Profit Retur Parsial Sementara`, serta menambah `Profit Final Terhitung = Profit Aktual Normal + Profit Retur Parsial Final`. `Profit Terhitung` tetap monitoring gabungan final + sementara.
- Mutasi My Balance tetap RAW read-only dan tetap tampil. Jika ada mutasi keluar, settlement/My Balance mismatch, exception non-return, atau return berubah menjadi full return, order tidak masuk bucket final.
- QC Return internal tetap boleh dipakai sebagai catatan terpisah dan masih berlaku untuk policy full-return stok diasumsikan; QC itu tidak lagi mengubah finalitas retur parsial.

### 2026-09-25 — My Balance Analisis: wallet Ads/Koin dan summary card

- Audit summary My Balance menunjukkan kartu sebelumnya belum menampilkan top-up wallet/PPN secara eksplisit dan label `Ads Aktual` berpotensi terbaca sebagai cash outflow My Balance.
- Perbaikan read-only: kartu ringkas `Biaya Ads Aktual` sekarang memakai Ads RAW dan ditegaskan bukan biaya yang dialokasikan ke order/SKU; `Net My Balance` diberi label arus kas, bukan profit.
- Section baru `Wallet Ads/Koin & PPN` menyajikan empat bukti terpisah: Top-up Wallet gross dari Balance RAW; kredit `Isi Saldo` dari Ads RAW; PPN top-up = gross Balance RAW dikurangi kredit Ads RAW; dan perubahan kredit wallet = kredit Ads RAW dikurangi Ads spend.
- Validasi live TACTICALIZED, 1–24 September 2026: top-up gross Rp7.159.500 (66 mutasi), kredit wallet Ads RAW Rp6.450.000 (66 event), PPN top-up Rp709.500, Ads aktual Rp6.478.170, perubahan kredit wallet -Rp28.170. Angka terakhir bukan saldo wallet akhir karena opening balance dan mutasi di luar coverage tidak dijadikan asumsi.
- Tidak ada data RAW, HPP, Profit Pesanan, atau alokasi biaya Ads yang dimutasi.

### 2026-09-25 — Estimasi Order Belum Selesai

- Scope additive pada tab `Profit Pesanan`: section amber **Estimasi Order Belum Selesai** dipisahkan dari kartu Profit Aktual dan Cakupan Finansial.
- Kontrak read-only/store-scoped: hanya bucket `pending`; total pesanan unik, PCS, `Total Pembayaran` sekali per No. Pesanan, serta Estimasi Kotor tanpa Ads memakai resolver HPP dan fee standar yang sama dengan Estimasi Kotor existing.
- Guardrail: Income settlement, My Balance, Ads/PPN Ads, refund, Adjustment, dan Profit Aktual Normal tidak dipakai atau diubah. Bila nominal/HPP/basis ada yang tidak valid, total terkait fail-closed menjadi `—`, bukan Rp0.
- Validasi live TACTICALIZED September 2026: 172 order / 301 PCS; Nominal Belum Selesai Rp23.551.634; Estimasi Profit Belum Selesai Rp3.859.354. Semua basis nilai/HPP valid pada snapshot DB saat validasi.
- Test/deploy: `npm test` 146 pass / 2 skipped; `npm run build` berhasil; production API tervalidasi pada 25-09-2026. Commit `e2942cf`; production `/profit` di-deploy.

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
- **Cakupan Finansial** ditambahkan sebagai monitoring terpisah: `Settlement Tercatat`, `Profit Terhitung`, `Cakupan Cash`, dan `Belum Ada Jawaban`. Settlement/profit terhitung hanya menggabungkan normal + retur parsial sementara; tidak mengubah Profit Aktual Normal. Belum Ada Jawaban menjumlahkan bucket yang belum aman dihitung, bukan batal.
- Semua summary status juga menampilkan pcs. `Profit Aktual Normal` menampilkan pcs normal; `Profit Retur Parsial` memisahkan pcs tetap terjual dan pcs retur; bucket unresolved/batal menampilkan pcs order. `Cakupan Cash` menghitung hanya pcs normal + pcs non-retur dari partial return, sehingga pcs retur tidak keliru terlihat sebagai pcs yang profitnya sudah terhitung.
- `Profit Pesanan` menambahkan filter **Mutasi Balance Keluar** dan card audit-only **Mutasi My Balance Keluar**. Card menampilkan jumlah order dan total signed cash-outflow, dengan breakdown `Penghasilan dari Pesanan`, `Penyesuaian`, dan tipe lain. Nilai ini tidak mengurangi Profit Aktual Normal atau Profit Terhitung. Detail order memisahkan tiga tipe outflow dan totalnya; timeline/provenance penuh tetap berada pada Rekonsiliasi My Balance.

### 2026-09-24 — Rekonsiliasi Settlement & My Balance (read-only)

- Tab baru **Rekonsiliasi My Balance** ditambahkan di `/profit`; tidak mengubah Estimasi Kotor, Profit Aktual Normal, HPP normal, Settlement Dikecualikan, atau Return QC.
- Cohort wajib memakai `Order.all.waktu_pesanan_dibuat` dengan batas kalender Seller Centre `[mulai 00:00, hari setelah akhir 00:00)`. Satu baris UI adalah satu `No. Pesanan`.
- API `GET /api/settlement-balance-reconciliation` bersifat store-scoped dan read-only. Ia menggabungkan `Income → Penghasilan / Order`, mutasi `Balance RAW`, dan evidence Return/Refund, Failed Delivery, serta Cancellation. `Penghasilan / SKU` tidak dibaca dan tidak dijumlahkan.
- Summary memisahkan: settlement Income, Penghasilan dari Pesanan masuk/keluar My Balance, Penyesuaian masuk/keluar, net mutasi Balance, dan jumlah order perlu rekonsiliasi.
- Detail event menyimpan waktu, arah, nominal, deskripsi, status, saldo setelah mutasi, source file, dan Excel row agar alasan cash outflow dapat diaudit tanpa asumsi.
- Status read-only: `Match normal`, `Ada pembalikan saldo`, `Ada penyesuaian`, `Ada exception + mutasi keluar`, `Retur parsial — menunggu alokasi`, `Perlu rekonsiliasi`, dan `Belum ada My Balance`.
- Audit canonical cohort Agustus 2026: 756 order; mutasi negatif terkait 27 order. Seluruh 27 memiliki evidence exception: 8 pembalikan `Penghasilan dari Pesanan` total -Rp198.916 dan 19 Penyesuaian keluar total -Rp9.190. Tidak ada nilai ini yang otomatis dipotong dari Profit Aktual Normal.
- Policy gate: kategori biaya premi pesanan gagal terkirim tetap hanya cash-adjustment audit sampai kebijakan eksplisit menetapkan apakah dan kapan dibebankan ke profit final. Tidak ada policy finansial otomatis pada rilis ini.

### 2026-09-24 — Audit inventory My Balance dan pengayaan Profit Pesanan

- Input/report: `my_balance_transaction_report.shopee.20260801_20260924.xlsx`, package Balance #4, read-only audit canonical DB lewat Windows OpenVPN SSH bridge.
- Coverage: 1.341 ledger row, 1 Agustus–24 September 2026, summary/ledger continuity `matched`.
- Verifikasi: mutasi aktual hanya enam kombinasi tipe/arah: Penghasilan dari Pesanan masuk/keluar; Penyesuaian masuk/keluar; Pembayaran dengan Saldo Penjual keluar; Penarikan Dana keluar. Semua berstatus `Transaksi Selesai`.
- Temuan: `Pembayaran dengan Saldo Penjual` berdeskripsi `Isi Ulang Saldo Iklan/Koin Penjual`, 153 row total -Rp15.873.000 dan tidak punya No. Pesanan. Ini adalah perpindahan dana My Balance ke saldo Iklan/Koin, bukan bukti Ads Spend atau biaya per pesanan. Ads RAW terpisah mencatat `Deduction for Product Ad (Auto Bidding - GMV Max)` -Rp13.169.722 dan `Pengurangan untuk Iklan Toko (Bidding Manual)` -Rp1.129.365 untuk coverage import yang sama; tidak boleh dialokasikan ke order/SKU.
- Temuan order-linked: seluruh `Penyesuaian` keluar yang terimpor berdeskripsi biaya premi Pesanan Gagal Terkirim; tetap cashflow audit, bukan profit final otomatis. Penyesuaian masuk meliputi kompensasi pesanan hilang, kompensasi kemasan program garansi bebas pengembalian, dan refund PPh 22.
- Perubahan code: Profit Pesanan menampilkan `Dana Dilepas`, `Margin` hanya pada profit valid/final-sementara, alasan raw mutasi keluar di Keterangan, serta jumlah row yang sedang dimuat. Tidak mengubah formula maupun summary Profit Aktual.
- Next step: taxonomy ledger read-only perlu persetujuan user sebelum membuat tab My Balance Analisis.

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

### 2026-09-25 — Asumsi bulk `Restock layak` untuk menghitung cash return tanpa menunggu aplikasi QC fisik

- Scope: tab **Retur & Refund** menyediakan checkbox per Return, pilih semua hasil filter, dropdown QC, catatan audit, dan aksi bulk maksimal 500 Return per simpan. Bulk perubahan harus memakai catatan; keputusan tetap disimpan per `store_id + no_pengembalian`, sehingga dapat dioverride satu per satu oleh aplikasi QC fisik.
- Immutability: bulk hanya menulis `return_qc_decisions`; tidak mengubah Order.all, Penghasilan, My Balance, Return/Refund RAW, HPP master, atau Estimasi Kotor.
- `Restock layak` adalah **asumsi/keputusan internal**, bukan klaim bahwa Seller Centre membuktikan penerimaan atau pemeriksaan fisik.
- Gate `Cash Final Negatif — Stok Diasumsikan`:
  ```text
  seluruh PCS order return
  + settlement Income negatif
  + My Balance Penghasilan Pesanan keluar tepat sama
  + tidak ada My Balance masuk/adjustment/mutasi lain
  + semua evidence exception order adalah Return/Refund
  + semua No. Pengembalian pada order tersebut diberi QC Restock layak
  ```
- Efek: status tersebut menutup backlog `Perlu Audit` untuk **cash outcome** dan mengakui stok return secara asumsi; HPP tidak dibebankan sebagai loss. Namun status ini **bukan** `Profit Aktual Normal`, tidak menambah `Profit Terhitung`, dan tetap menampilkan cash final negatif secara terpisah.
- `Rusak`, `Hilang`, dan `Belum dinilai` tidak otomatis mengubah profit/HPP. Policy loss fisik tetap fase terpisah.
- Retur parsial tetap memakai policy lama: HPP PCS non-retur dihitung sebagai `Profit Sementara`, PCS return ditahan sebagai stok; bulk Restock layak hanya menambah evidence audit, bukan mengubah nominal tersebut.

### 2026-09-25 — Sub-status `Batal` berbasis jalur pengiriman

- Scope: pengayaan read-only pada parent status `Batal`; tidak ada schema/migration dan tidak mengubah Estimasi Kotor, settlement, HPP, Profit Aktual, maupun Cakupan Cash.
- Dua sub-status baru:
  ```text
  Batal Sebelum Pengiriman
  Batal Setelah Pengiriman Gagal
  ```
- `Batal Sebelum Pengiriman` hanya bila: status Order.all `Batal`; `no_resi` dan `waktu_pengiriman_diatur` kosong; tidak ada event My Balance terkait; ada Cancellation RAW; tidak ada Failed Delivery, Return/Refund, atau Adjustment evidence. Ini adalah fail-closed: pembatalan yang evidence-nya kurang/tidak cocok tetap parent `Batal` tanpa sub-status.
- `Batal Setelah Pengiriman Gagal` hanya bila: status `Batal`; minimal salah satu dari `no_resi` atau `waktu_pengiriman_diatur` ada; ada Failed Delivery RAW; dan reason Cancellation memuat `Pengiriman gagal` atau Failed Delivery memiliki reason. Ini bukti pernah masuk jalur logistik, bukan keputusan kondisi fisik barang.
- No. Resi bukan rule tunggal; classifier memakai gabungan resi, waktu pengiriman diatur, Cancellation RAW, Failed Delivery RAW, dan mutasi My Balance terkait.
- Parent bucket tetap `batal`: tidak masuk Profit Aktual Normal, Profit Retur Parsial, Settlement Tercatat, Profit Terhitung, Cakupan Cash, atau Belum Ada Jawaban. HPP tetap `—`; cash outflow ditampilkan hanya sebagai audit, bukan loss/profit otomatis.
- UI: badge sub-status, filter khusus, dua card ringkasan, dan drilldown No. Resi + Waktu Pengiriman Diatur.
- Pilot live: `260831STVH3XPH` = Batal Sebelum Pengiriman, tanpa resi/timestamp kirim/cash event. `260831SKPX0NU4` = Batal Setelah Pengiriman Gagal, resi `SPXID068637353259`, pengiriman diatur, Failed Delivery `Selesai Dikirim ke Penjual`, serta Penyesuaian My Balance keluar `-Rp412` untuk premi gagal kirim.
- Guardrail: `-Rp412` tidak dibebankan sebagai HPP atau profit; Failed Delivery tidak sama dengan QC `restock layak/rusak/hilang`.

### 2026-09-25 — Status `Cash Final Positif` untuk return penuh selesai dengan kompensasi Shopee

- Scope: status finansial read-only baru pada `Profit Pesanan`; tanpa schema/migration dan tanpa perubahan Estimasi Kotor.
- Status:
  ```text
  Cash Final Positif
  Return penuh selesai; cash outcome final positif, QC barang menunggu
  ```
- Eligibility fail-closed (seluruhnya wajib):
  1. seluruh pcs order tercatat return;
  2. settlement `Penghasilan / Order` negatif dan sama persis dengan satu-satunya My Balance `Penghasilan dari Pesanan` keluar;
  3. tidak ada My Balance `Penghasilan dari Pesanan` masuk, mutasi keluar lain, atau event exception non-return/non-adjustment;
  4. ada evidence return `Banding Ditolak` dengan `Pengiriman pengembalian barang gagal`, serta seluruh evidence return hanya berstatus `Pengembalian Barang/Dana Dibatalkan` atau `Banding Ditolak`;
  5. ada Penyesuaian Income positif; jumlah seluruh penyesuaian sama persis dengan My Balance `Penyesuaian` masuk;
  6. net My Balance = settlement negatif + penyesuaian masuk, dan net harus positif.
- Cash outcome memakai **net My Balance** yang telah direkonsiliasi, bukan settlement Income negatif saja. HPP/profit/margin tetap strip karena seluruh item return dan QC fisik belum diputuskan.
- Tidak masuk `Profit Aktual Normal`, `Profit Retur Parsial`, `Settlement Tercatat`, `Profit Terhitung`, atau `Cakupan Cash`; keluar dari `Belum Ada Jawaban` karena outcome cash sudah lengkap.
- Pilot: `260814BQYKUWFW` — settlement/reversal `-Rp959`, Penyesuaian resmi kompensasi biaya kemasan `+Rp5.000`, net My Balance/Penghasilan Akhir `+Rp4.041`, 2/2 pcs return, dan keputusan banding Seller Centre menyatakan barang telah dikembalikan ke seller. QC internal tetap `belum_dinilai`.
- Guardrail: cash mismatch, adjustment tanpa rekonsiliasi, status/return evidence lain, return parsial, net tidak positif, atau event ledger tambahan tetap `Perlu Audit`.

### 2026-09-25 — Status `Cash Final Negatif` untuk return penuh selesai

- Scope: status finansial baru pada `Profit Pesanan`; read-only, tanpa schema migration dan tanpa perubahan Estimasi Kotor.
- Hanya berlaku bila seluruh evidence cocok secara ketat:
  1. hanya ada evidence `return_refund` pada order;
  2. status return `Dana Dikembalikan ke Pembeli`;
  3. tipe `Seluruh Pesanan`;
  4. status kirim return `Pengiriman pengembalian barang selesai`;
  5. settlement `Penghasilan / Order` negatif;
  6. satu-satunya My Balance order-linked adalah `Penghasilan dari Pesanan` keluar yang nilainya persis sama dengan settlement.
- Status yang ditampilkan:
  ```text
  Cash Final Negatif
  Return penuh selesai; cash outcome final, QC barang menunggu
  ```
- Tidak menghitung/menampilkan HPP terpakai, profit, atau margin; tidak masuk `Profit Aktual Normal`, `Profit Retur Parsial`, `Settlement Tercatat`, `Profit Terhitung`, maupun `Cakupan Cash`.
- Tidak lagi masuk backlog `Belum Ada Jawaban`; cash outcome telah terjawab, sementara QC fisik tetap dikelola pada tab `Retur & Refund`.
- Guardrail fail-closed: mutasi My Balance tambahan (mis. penyesuaian/kompensasi), status return/logistik berbeda, return parsial, atau settlement/balance tidak persis cocok tetap `Perlu Audit`.
- Pilot evidence: order `2608139M8365AV` — return penuh selesai, refund pembeli, parcel tertracking sampai alamat return, Income/My Balance `-Rp47.813`, dan belum ada adjustment.

### 2026-09-25 — Return Dibatalkan — Cash Cocok sebagai Profit Aktual

- Scope: memperbarui klasifikasi `Return Dibatalkan — Cash Cocok`; tetap read-only, tanpa schema/migration dan tidak mengubah Estimasi Kotor.
- Order yang lolos dipromosikan ke bucket `Profit Aktual Normal` serta tetap membawa badge audit/histori `Return Dibatalkan — Cash Cocok` dan filter khusus.
- Eligibility ketat (seluruhnya wajib):
  1. semua evidence exception order adalah `return_refund` dengan status persis `Pengembalian Barang/Dana Dibatalkan`;
  2. `returned_quantity` seluruh item adalah 0;
  3. settlement `Penghasilan / Order` positif;
  4. HPP seluruh item valid;
  5. My Balance hanya memiliki `Penghasilan dari Pesanan` masuk yang cocok persis dengan settlement; net Balance juga harus sama;
  6. tidak ada mutasi My Balance keluar, adjustment, failed delivery, cancellation, atau evidence exception lain.
- Perhitungan: `Profit Aktual = Settlement Penghasilan / Order - HPP seluruh item`.
- Masuk `Profit Aktual Normal`, `Settlement Tercatat`, `Profit Terhitung`, dan `Cakupan Cash`; tidak lagi masuk `Perlu Audit` maupun `Belum Ada Jawaban`.
- Fail-closed: return tercatat pada item, Balance keluar/tidak cocok, HPP tidak valid, atau evidence non-return tetap tidak dipromosikan. Return dibatalkan tetapi `returned_quantity > 0` khususnya ditahan sebagai `Perlu Audit`, bukan salah masuk Profit Retur Parsial.
- Live audit cohort Agustus: 3 order lolos — `260831R7HC9RHK` Rp132.002 settlement/Rp27.002 profit; `26082232XMXD1C` Rp156.322/Rp31.322; `260804E8J5Q3UR` Rp151.620/Rp26.620. Total tambahan Profit Aktual Rp84.944.
- Hasil cohort setelah promosi: Profit Aktual Normal 599 order/1.059 pcs/Rp13.732.472; Cakupan Cash 601 order/1.061 pcs; backlog `Belum Ada Jawaban` 6 order/24 pcs.

### 2026-09-25 — Kalibrasi Voucher Seller pada Forecast Profit & Used Ads

- Scope: hanya `Forecast Profit & Used Ads`; tidak ada perubahan ke Profit Aktual, Income settlement canonical, My Balance, HPP, retur/refund, Ads, import, schema, maupun migration.
- Temuan: `Order.all` adalah physical item-row evidence. Pada order multi-SKU, `Voucher Ditanggung Penjual` dapat berulang dengan nominal identik di tiap line; menjumlah setiap line membuat fee base Forecast terlalu kecil dan Forecast Profit terlalu rendah.
- Aturan Forecast baru: satu nominal voucher positif yang identik (termasuk bila sibling line bernilai Rp0) dipakai satu kali per `No. Pesanan`. Total physical line tetap dikembalikan sebagai metadata audit. Jika terdapat dua atau lebih nominal positif berbeda, order masuk `Review` dan tidak diestimasi otomatis.
- Validasi canonical TACTICALITY, cohort dibuat 1–25 September 2026: 342 order settled comparable. Forecast fee lama Rp8.650.456 versus komponen fee Income Rp8.663.812 (selisih -Rp13.356); setelah resolusi voucher order-level Forecast Rp8.663.780 (selisih -Rp32). Income hanya evidence validasi, bukan input Forecast.
- Dampak full Forecast TACTICALITY 1–25 September: Estimasi Potongan Standar Rp11.979.991 → Rp11.998.792; Forecast Profit sebelum Ads Rp9.726.683 → Rp9.810.882. Terdapat 64 order voucher berulang pada scope tersebut, tanpa nominal voucher konflik.
- UI: kolom Voucher Seller menandai `Dedupe per order` dan menunjukkan total `RAW line` bila repetisi sumber dibuang.
- Test/deploy: unit regression mencakup voucher identik berulang, voucher positif + sibling Rp0, serta nominal positif konflik fail-closed. Full test/build dan production smoke test wajib selesai sebelum rilis.

### 2026-09-24 — My Balance Analisis read-only

- Input/report: Balance RAW `Transaksi Selesai` dan Ads RAW store-scoped, periode 1 Agustus–24 September 2026.
- Coverage: 1.341 mutasi Balance; total masuk Rp129.082.682; total keluar -Rp131.129.697; net -Rp2.047.015. Ads RAW 96 event setelah dedupe: GMV Max -Rp13.169.722 dan Iklan Toko Manual -Rp1.129.365.
- Verifikasi: DB live melalui Windows jump tunnel; builder unit test memisahkan wallet top-up, penarikan, koreksi order, dan Ads aktual; `npm test` 140 pass/2 skipped serta `npm run build` berhasil.
- Temuan/mismatch: `Isi Ulang Saldo Iklan/Koin Penjual` My Balance sebesar -Rp15.873.000 adalah transfer ke saldo Iklan/Koin, bukan biaya Ads. Ads aktual dibaca eksklusif dari event pengurangan Ads RAW. Tidak ada event Ads overlap yang didedupe pada coverage ini.
- Keputusan yang disetujui: taxonomy A–F disetujui sebagai layer klasifikasi read-only; tidak ada alokasi Ads ke order/SKU dan tidak ada perubahan Profit Pesanan/Estimasi Kotor.
- Perubahan source/schema/code: tambah tab `My Balance Analisis`, API GET store-scoped `/api/my-balance-analysis`, dan builder `lib/my-balance-analysis.js`; tidak ada schema atau migration.
- Test/deploy: commit `51da4d7`, push `master`, dan production endpoint tervalidasi dengan 1.341 ledger row serta 96 Ads event.
- Next step: audit detail harian Ads sebagai biaya store/day; setiap kebijakan alokasi profit/order harus disetujui terpisah.

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
