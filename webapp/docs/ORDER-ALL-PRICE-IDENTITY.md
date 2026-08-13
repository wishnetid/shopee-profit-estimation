# Order.all Physical Line Identity

## Purpose

`Order.all` is a current-state snapshot at order-line / variation grain. A
single order, SKU reference, and variation can legitimately appear more than
once when Shopee splits commercial lines by discounted price. The importer must
retain those lines separately instead of treating them as a duplicated source
row.

## Canonical identity

Every persisted Order.all line is scoped to a store and identified by:

```text
store_id
no_pesanan
nomor_referensi_sku
nama_variasi
harga_setelah_diskon
```

`harga_setelah_diskon` is required. The identity is invalid when any component
is blank or when the discounted price cannot be parsed.

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
- Same five identity components: duplicate physical line; reject it before
  preview or import writes.
- Preview lookup, snapshot upsert, and currency-repair reconciliation use the
  same canonical identity helper.
- A source snapshot may update non-identity fields through the existing
  status/timestamp protection rules. It must not overwrite a line with a
  different discounted-price identity.

## Database migration

The replacement unique index is:

```text
uk_order_item_store_price
(store_id, no_pesanan, nomor_referensi_sku, nama_variasi, harga_setelah_diskon)
```

Use `scripts/migrate-order-all-price-identity.js`:

1. Run without flags for a read-only preflight.
2. Verify a timestamped database backup and the reported absence of null or
   duplicate five-part identities.
3. Apply only with both `--apply` and `--confirm-ddl`.
4. Verify the replacement index exists before the legacy
   `uk_order_item_store` index is removed.

MySQL/MariaDB DDL can implicit-commit. The migration logs and verifies each
index state; it does not claim transactional rollback for DDL.

## Regression boundary

The identity contract is covered by `test/order-all-price-identity.test.mjs`
and the live multi-store index assertion. Any future importer, migration, or
repair script that touches `order_all` must use this five-field identity.