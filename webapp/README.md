# Shopee Profit Estimation — Web App

Next.js 16 App Router dashboard for RAW Shopee Order.all, Income, shared Master SKU, dan monitoring Estimasi Kotor. Profit Aktual tetap sengaja unavailable sampai kontrak settlement, return, dan QC disetujui.

**Production:** https://webapp-umber-five.vercel.app

> Read the repository-level [README.md](../README.md) and [NEXTAGENTS.md](../NEXTAGENTS.md) before changing source, schema, importer behavior, or production configuration.

## Quick Start

```bash
cd webapp
npm install
npm run dev
```

## Features

- **Upload Manager:** Preview-first import for Order.all, periodic Income RAW packages, and shared Master SKU RAW packages.
- **Order All:** Store-scoped current-state item snapshots.
- **Income:** Store-scoped RAW packages; `Penghasilan / Order`, `Penghasilan / Sku`, Adjustment, and Shipping Fee Discrepancy stay separate.
- **SKU Master:** Shared RAW source packages; no HPP mapping or profit join at this layer.
- **Profit & Estimasi:** `/profit` menyediakan Estimasi Kotor Setelah HPP manual-load, read-only, dan store-scoped. Basisnya adalah Subtotal Pesanan seller dikurangi voucher seller, potongan standar Shopee, dan HPP; tidak menunggu Income/settlement/cohort historis. Ringkasan Harian menampilkan Ads Spend, Estimasi PPN Iklan 11%, dan Sisa Setelah Ads & PPN. Profit Aktual legacy tetap `PROFIT_NOT_READY`.
- **Settings:** Guarded store-scoped clear, shared SKU reset, and safe store deletion controls.

## Runtime Contract

- Browser access memakai custom Login Page; sesi HTTP-only yang ditandatangani dibuat setelah dashboard credential valid.
- Setiap mutasi dari browser membutuhkan sesi login dan validasi same-origin.
- Income packages are identified by `(store_id, source_sha256)`; exact hash is a no-op only within the same store.
- Income RAW child identity is `(income_report_import_id, source_excel_row)`.
- When a legacy export has aggregate `Biaya Layanan`, validated XTRA/Gratis Ongkir breakdown labels remain in `raw_payload` but are excluded from the signed reconciliation checksum to prevent double counting.
- `Summary 3. Total yang Dilepas` must reconcile with `Penghasilan / Order`; mismatches block import.
- `Seller Fee` is audit-only and is not a materialized RAW transaction table yet.
- Ads Spend hanya memakai `Deduction for Product Ad` bernilai signed negatif. Estimasi PPN Iklan dihitung 11% per hari, dibulatkan ke rupiah penuh, lalu dijumlahkan ke summary agar cocok dengan Ringkasan Harian.
- Estimasi PPN bukan transaksi pajak RAW harian dan tidak boleh dianggap sebagai alokasi biaya aktual per order/item.

## Verification

```bash
npm test
```

```bash
./node_modules/.bin/tsc --noEmit --incremental false
```

```bash
npm run build
```

Do not use `git add -A` or `git commit -am` in this repository: raw workbooks and documentation backups may be intentionally untracked.

## Docs

See [README.md](../README.md) for the full project contract and [NEXTAGENTS.md](../NEXTAGENTS.md) for the operational handoff.
