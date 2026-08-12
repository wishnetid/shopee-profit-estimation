# RAW Expansion — Live DDL Audit

**Date:** 2026-08-12
**Mode:** Read-only preflight; DDL apply and post-DDL verification recorded below
**Target database:** `supplie3_shopee_profit_estimation`
**Server:** MariaDB `10.11.14-MariaDB-cll-lve`
**Access path:** VPS-1 → existing Windows OpenVPN SSH bridge → temporary local SSH tunnel → remote MySQL.

## Scope

This audit did not run migration, import, DDL, DML, commit, or deploy. It queried only:

- `SELECT DATABASE(), VERSION(), CURRENT_USER()`
- `information_schema.TABLES`
- target RAW table existence

## Access result

Direct outbound connections from VPS-1 and VPS-2 to the hosting MySQL port timed out. The Windows residential bridge reached MySQL successfully, proving the database credentials and remote MySQL authorization work from that path.

The cPanel PHP API gateway returned HTTP 403 from the Windows path and remained unsuitable for this audit. The direct MySQL tunnel was sufficient and read-only.

## Existing live tables

The database currently contains the established Order.all, Income RAW, SKU RAW, store, and legacy tables.

## RAW Expansion target state

All ten new RAW Expansion tables are absent:

```text
balance_report_imports
balance_transactions_raw
order_cancellation_report_imports
order_cancellation_raw
order_failed_delivery_report_imports
order_failed_delivery_raw
order_return_refund_report_imports
order_return_refund_raw
ads_report_imports
ads_transactions_raw
```

## DDL compatibility finding

Because all target tables are absent, the migration script's `absent` state is the expected clean create-only case. There is no partial target schema to reconcile and no existing target FK/index/name collision to remediate.

This does not authorize migration automatically. Before `--apply --confirm-ddl`:

1. Create the approved timestamped database backup.
2. Re-open the temporary Windows SSH tunnel.
3. Run migration with the database route above.
4. Run `SHOW CREATE TABLE` for every target parent and child.
5. Verify indexes, unique keys, `RESTRICT` foreign keys, and existing-table row counts remain unchanged.
6. Do not import any real workbook in the migration step.

## DDL apply and post-DDL verification

- Timestamped logical backup was created before DDL under `Archive/db-backups/`; it contains all existing base-table schema/data and was SHA-256 verified.
- `node scripts/migrate-raw-expansion.js --apply --confirm-ddl` created all five parents and five children.
- Post-DDL read-only audit verified the expected unique keys, indexes, restrictive foreign keys, and zero initial rows in all ten tables.
- Authenticated preview-only checks against nine real Balance, exception, and Ads samples all returned valid import previews with store/hash/report-bound preview tickets. No parent or child RAW row was inserted.

## Current release gate

- Source verification and RAW-focused lint checks must be green.
- Full-repository lint remediation is tracked separately and must finish before a clean release gate can be claimed.
- Real import remains unperformed.
- Commit, push, deploy, and production preview-only verification remain pending.
