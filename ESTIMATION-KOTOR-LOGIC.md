# Estimasi Kotor Setelah HPP

## Tujuan

Halaman `/profit` memberikan estimasi cepat per order dan harian tanpa menunggu Income, pelepasan dana, atau model payout historis. Ini bukan Profit Aktual dan bukan settlement final Shopee.

## Input

- `Order.all` store aktif, pada grain item/variasi.
- Master SKU terbaru untuk HPP item.
- Ads RAW hanya untuk pengurang agregat harian.

## Formula per order

```text
Basis potongan standar Shopee
= Σ(Subtotal Pesanan item)
- Σ(Voucher Ditanggung Penjual item)

Biaya Administrasi
= round(basis × 8,25%)

Biaya Proses Pesanan
= Rp1.250 per order

Biaya Gratis Ongkir XTRA
= round(basis × 5%)

Biaya Layanan Promo XTRA
= round(basis × 4,5%)

Premi
= round(basis × 0,5%)

Estimasi Penghasilan Seller
= basis
- Biaya Administrasi
- Biaya Proses Pesanan
- Biaya Gratis Ongkir XTRA
- Biaya Layanan Promo XTRA
- Premi

Estimasi Kotor Setelah HPP
= Estimasi Penghasilan Seller
- Σ(HPP Master × quantity item)
```

`Subtotal Pesanan` dijumlahkan pada grain item. `Total Pembayaran Pembeli` tidak digunakan karena dapat memasukkan komponen buyer-side seperti ongkir, voucher pembeli, dan biaya layanan pembeli.

## Guard

Order hanya masuk total bila:

- Status order adalah `Perlu Dikirim`, `Sedang Dikirim`, `Telah Dikirim`, atau `Selesai`.
- Tidak memiliki marker cancellation/return.
- Tidak muncul pada RAW Cancellation, Return/Refund, atau Failed Delivery.
- Tidak memiliki `returned_quantity > 0`.
- Subtotal, voucher seller, tanggal, quantity, dan HPP valid.
- Mapping HPP tidak missing atau conflict.

Income, `Penghasilan / Order`, dana dilepas, dan historical payout cohort bukan syarat estimasi ini.

## Ads dan PPN

```text
Ads Spend
= Σ abs(Jumlah signed)
  untuk Deduction for Product Ad bernilai negatif

Estimasi PPN Iklan Harian
= round(Ads Spend Harian × 11%)

Sisa Setelah Ads & PPN
= Σ(Estimasi Kotor Setelah HPP pada tanggal order)
- Ads Spend Harian
- Estimasi PPN Iklan Harian
```

Ads Spend dan PPN tetap biaya agregat toko/hari. Tidak dialokasikan ke order atau item.

## Batas model

- Komisi AMS dan program khusus lain tidak dimasukkan sebagai rate standar sampai ada bukti coverage order-level.
- Packaging, tenaga kerja, overhead, Seller Fee, settlement, return QC, serta refund final tetap di luar Estimasi Kotor.
- `Profit Aktual` tetap terkunci sampai kontrak financial berikutnya disetujui.

## Implementasi

```text
webapp/lib/profit-estimation.js
webapp/app/api/profit-estimation/route.ts
webapp/app/profit/page.tsx
webapp/test/profit-estimation.test.mjs
```

API read-only:

```text
GET /api/profit-estimation?storeId=<id>&dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD&page=<n>&limit=<n>
```

Tidak ada migration, import, atau perubahan data RAW dalam release logic ini.
