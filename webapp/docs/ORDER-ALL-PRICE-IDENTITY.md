# Order.all Physical Line Identity

## Purpose

`Order.all` is a current-state snapshot at order-line / variation grain. A
single order, SKU reference, and variation can legitimately appear more than
once when Shopee splits commercial lines by discounted price or repeats a
physical source line. The importer must retain every source line separately
instead of treating it as a duplicated source row.

## Canonical identity

Every persisted Order.all line is scoped to a store and identified by:

```text
store_id
no_pesanan
nomor_referensi_sku
nama_variasi
harga_setelah_diskon
line_ordinal
```

`line_ordinal` is the 1-based occurrence of the same base line inside one
workbook, assigned by import order without editing the source report. It keeps
identical repeated source lines separate. `harga_setelah_diskon` is required.
The identity is invalid when any base component is blank or when the discounted
price cannot be parsed.

## Canonical price handling

The source export uses Indonesian IDR text while MySQL stores the amount as a
DECIMAL value. Both representations must generate the same identity key.

```text
Source IDR text       → parsed numeric amount
Stored DECIMAL text   → parsed numeric amount
Canonical key price   → fixed two-decimal representation
```

Do not compose an Order.all key from only order number, SKU reference, and
variation. Do not compare raw source IDR text directly with stored DECIMAL
text.

## Import behavior

- Different discounted prices: separate valid physical lines.
- Repeated same-price source lines: retained through distinct `line_ordinal`
  values; never reject the original report merely for this pattern.
- Preview lookup and snapshot upsert use the same ordinal-aware identity.
- A source snapshot may update non-identity fields through the existing
  status/timestamp protection rules. It must not overwrite a line with a
  different discounted-price identity.

## Database migration

The current unique index is:

```text
uk_order_item_store_price
(store_id, no_pesanan, nomor_referensi_sku, nama_variasi, harga_setelah_diskon, line_ordinal)
```

Existing production databases need the additive migration:

```text
scripts/migrate-order-all-line-ordinal.js
```

Run it without flags for a read-only preflight. Apply only with both `--apply`
and `--confirm-ddl` after a verified database backup. MySQL/MariaDB DDL can
implicit-commit; the migration checks its final index state and does not claim
transactional rollback for DDL.

## Regression boundary

The identity contract is covered by `test/order-all-price-identity.test.mjs`
and the live multi-store index assertion. Any future importer, migration, or
repair script that touches `order_all` must use this five-field identity.