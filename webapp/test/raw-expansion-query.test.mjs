import test from 'node:test';
import assert from 'node:assert/strict';
import rawExpansionQuery from '../lib/raw-expansion-query.js';
const { buildRawExpansionQueryPlan } = rawExpansionQuery;

test('buildRawExpansionQueryPlan scopes Balance rows to a store with provenance and parameterized filters', () => {
  const plan = buildRawExpansionQueryPlan({
    section: 'balance',
    storeId: 7,
    search: 'ORDER-1\nORDER-2',
    type: 'Penghasilan dari Pesanan',
    kind: 'Penjualan',
    status: 'Berhasil',
    sort: 'transaction_at',
    direction: 'asc',
  });

  assert.equal(plan.table, 'balance_transactions_raw');
  assert.match(plan.fromSql, /^balance_transactions_raw r INNER JOIN balance_report_imports i ON i\.id = r\.balance_report_import_id$/);
  assert.match(plan.selectSql, /i\.source_file/);
  assert.match(plan.selectSql, /i\.report_period_from/);
  assert.match(plan.selectSql, /r\.balance_report_import_id/);
  assert.match(plan.whereSql, /i\.store_id = \?/);
  assert.match(plan.whereSql, /r\.type_transaksi = \?/);
  assert.match(plan.whereSql, /r\.jenis_transaksi = \?/);
  assert.match(plan.whereSql, /r\.status = \?/);
  assert.match(plan.whereSql, /LIKE \?/);
  assert.deepEqual(plan.params, [
    7,
    'Penghasilan dari Pesanan',
    'Penjualan',
    'Berhasil',
    ...Array(7).fill('%ORDER-1%'),
    ...Array(7).fill('%ORDER-2%'),
  ]);
  assert.equal(plan.orderSql, 'r.transaction_at ASC');
});

test('buildRawExpansionQueryPlan maps every documented exception and Ads section to its own scoped RAW table', () => {
  const cases = [
    ['cancellation', 'order_cancellation_raw', 'order_cancellation_report_imports', 'order_cancellation_report_import_id', 'r.no_pesanan DESC'],
    ['failed_delivery', 'order_failed_delivery_raw', 'order_failed_delivery_report_imports', 'order_failed_delivery_report_import_id', 'r.jumlah_kompensasi DESC'],
    ['return_refund', 'order_return_refund_raw', 'order_return_refund_report_imports', 'order_return_refund_report_import_id', 'r.total_pengembalian_dana DESC'],
    ['ads', 'ads_transactions_raw', 'ads_report_imports', 'ads_report_import_id', 'r.transaction_date DESC'],
  ];

  for (const [section, table, parentTable, foreignKey, orderSql] of cases) {
    const plan = buildRawExpansionQueryPlan({
      section,
      storeId: 9,
      search: 'needle',
      sort: section === 'failed_delivery' ? 'jumlah_kompensasi' : section === 'return_refund' ? 'total_pengembalian_dana' : section === 'ads' ? 'transaction_date' : 'no_pesanan',
    });

    assert.equal(plan.table, table);
    assert.equal(plan.fromSql, `${table} r INNER JOIN ${parentTable} i ON i.id = r.${foreignKey}`);
    assert.match(plan.selectSql, /i\.source_file/);
    assert.match(plan.selectSql, /i\.report_period_from/);
    assert.match(plan.whereSql, /^WHERE i\.store_id = \? AND \(/);
    assert.equal(plan.params[0], 9);
    assert.equal(plan.orderSql, orderSql);
  }
});

test('buildRawExpansionQueryPlan applies Ads description filters and rejects invalid scope or SQL controls', () => {
  const plan = buildRawExpansionQueryPlan({
    section: 'ads',
    storeId: '12',
    description: 'Deduction for Product Ad',
    sort: 'source_file',
    direction: 'ASC',
  });

  assert.match(plan.whereSql, /r\.description = \?/);
  assert.deepEqual(plan.params, [12, 'Deduction for Product Ad']);
  assert.equal(plan.orderSql, 'i.source_file ASC');
  assert.throws(() => buildRawExpansionQueryPlan({ section: 'unknown', storeId: 1 }), /Invalid RAW expansion section/);
  assert.throws(() => buildRawExpansionQueryPlan({ section: 'ads', storeId: 0 }), /storeId is invalid/);
  assert.throws(() => buildRawExpansionQueryPlan({ section: 'ads', storeId: 1, sort: 'source_file; DROP TABLE ads_transactions_raw' }), /Invalid RAW expansion sort/);
  assert.throws(() => buildRawExpansionQueryPlan({ section: 'ads', storeId: 1, direction: 'sideways' }), /Invalid RAW expansion direction/);
  assert.throws(() => buildRawExpansionQueryPlan({ section: 'ads', storeId: 1, search: Array(12).fill('term').join('||') }), /terlalu banyak/);
  assert.throws(() => buildRawExpansionQueryPlan({ section: 'ads', storeId: 1, search: 'x'.repeat(501) }), /terlalu panjang/);
});
