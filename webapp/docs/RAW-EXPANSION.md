# RAW Expansion Runtime Handoff

## Status

Source release baseline `7bfab44` introduced RAW Expansion. Live DDL is created, operational RAW packages sudah diimport, dan audit source-to-DB read-only kemudian membuktikan parent SHA, physical source-row identity, payload fidelity, serta child integrity. Gunakan database read-only atau canonical production API untuk state/count terkini.

Local repair verification passed: classifier collision, physical source-row provenance, RAW preview field keys, store/hash/report-bound preview ticket, duplicate no-op copy, store lifecycle guards, search bounds, and API aliases were added. Direct cPanel MySQL access from the VPS still times out, but the Windows OpenVPN SSH bridge provides a verified route. The clean absent state was backed up, then all ten RAW target tables were created and post-DDL-audited. Preview-only checks of nine real RAW samples and a canonical-production Balance preview passed without writes. Import real kemudian dilakukan melalui Upload/Bulk Upload dan post-import audit source-to-DB lulus untuk kontrak RAW aktif. See `docs/RAW-EXPANSION-LIVE-DDL-AUDIT-20260812.md`.

## Scope

New RAW report classes:

```text
balance
order_cancellation
order_failed_delivery
order_return_refund
ads_ledger
```

Read UI aliases:

```text
/balance                    reportType=balance
/exceptions                 cancellation | failed_delivery | return_refund
/ads                        reportType=ads
```

No profit/net payout/ad-cost calculation is included.

## Implementation Map

```text
lib/balance-raw-import.js
  Balance semantic header detection, signed reconciliation, ledger continuity,
  direct/extracted order reference.

lib/exception-raw-import.js
  Cancellation, Failed Delivery, and Return/Refund semantic parsers.

lib/ads-raw-import.js
  UTF-8 CSV parser, metadata/period extraction, DD/MM/YYYY validation.

lib/raw-expansion-classifier.js
  Structure-first report classification.

lib/raw-expansion-db.js
  Preview contract, store-scoped SHA duplicate lookup, transaction import.

lib/raw-expansion-query.js
  Store-scoped parameterized/whitelisted read query plans.

scripts/migrate-raw-expansion.js
  Dry-run by default; only `--apply --confirm-ddl` creates 5 parent and 5 child tables.

app/api/upload/route.ts
  Existing preview/import extended to all RAW classes.

app/api/raw/route.ts
  Read-only paginated store-scoped API.

app/balance/page.tsx
app/exceptions/page.tsx
app/ads/page.tsx
components/RawReportPage.tsx
  Read UI and navigation.
```

## Validation Passed Locally

```text
node --test test/raw-expansion-query.test.mjs    PASS
node --test test/raw-expansion-import.test.mjs  PASS
node --test test/dashboard-auth.test.mjs        PASS
npm run build                                   PASS
```

`npm test` cannot fully pass in this runtime because existing `multi-store.test.mjs` tries a live cPanel MySQL connection and receives `ETIMEDOUT`. The baseline showed the same failure before this feature.

## Remaining Data Gate

1. Wait for explicit approval before a real `action=import`.
2. After import, prove parent SHA, child source row parity, no orphans, store scoping, and `/api/raw` output.

## Do Not

- Do not use legacy `balance_transactions`.
- Do not join the new RAW tables to calculate profit.
- Do not sum item-level Return/Refund monetary fields by order.
- Do not auto-import files from `data_sample/`.
- Do not change clear-store/delete-store semantics as part of the migration. New RAW package cleanup needs a separate reviewed destructive-control change.
- Do not run `--apply` while DB connectivity/DDL audit remains unresolved.

For full design, parser contracts, table definitions, and recovery procedure, read:

```text
../RAW-EXPANSION-IMPLEMENTATION.md
```
