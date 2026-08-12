# Shopee Profit Estimation — Web App

Next.js 16 App Router dashboard for RAW Shopee Order.all, Income, and shared Master SKU management. Financial/profit calculation remains intentionally unavailable until its source contracts are analyzed and approved.

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
- **Profit:** Explicit `PROFIT_NOT_READY` guard; UI/API calculator belum dipublikasikan. RAW sudah terbukti dapat mendukung probe read-only profit per-order, cash settlement return, dan estimasi sebelum fee.
- **Settings:** Guarded store-scoped clear, shared SKU reset, and safe store deletion controls.

## Runtime Contract

- Basic Auth is required for page and API access.
- Every mutation additionally requires Basic Auth and same-origin validation.
- Income packages are identified by `(store_id, source_sha256)`; exact hash is a no-op only within the same store.
- Income RAW child identity is `(income_report_import_id, source_excel_row)`.
- When a legacy export has aggregate `Biaya Layanan`, validated XTRA/Gratis Ongkir breakdown labels remain in `raw_payload` but are excluded from the signed reconciliation checksum to prevent double counting.
- `Summary 3. Total yang Dilepas` must reconcile with `Penghasilan / Order`; mismatches block import.
- `Seller Fee` is audit-only and is not a materialized RAW transaction table yet.

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
