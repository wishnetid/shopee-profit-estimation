import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import mysql from 'mysql2/promise';
import pagination from '../lib/pagination.js';

const { parsePagination } = pagination;
const require = createRequire(import.meta.url);
const { buildProfitActualReport } = require('../lib/profit-actual.js');
const { buildSettlementBalanceReconciliation } = require('../lib/settlement-balance-reconciliation.js');
const { buildMyBalanceAnalysis } = require('../lib/my-balance-analysis.js');

function loadDbEnv() {
  const result = { ...process.env };
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return result;

  for (const rawLine of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const separator = line.indexOf('=');
    const key = line.slice(0, separator).trim();
    if (!/^DB_(HOST|PORT|USER|PASSWORD|NAME)$/.test(key) || result[key]) continue;
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

const env = loadDbEnv();
let dbAvailable = Boolean(env.DB_HOST && env.DB_USER && env.DB_PASSWORD && env.DB_NAME);
let connection;

before(async () => {
  if (!dbAvailable) return;
  try {
    connection = await mysql.createConnection({
      host: env.DB_HOST,
      port: Number(env.DB_PORT || 3306),
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      database: env.DB_NAME,
      connectTimeout: 5000,
    });
  } catch {
    // Source-contract tests must remain runnable when the optional live DB is unreachable.
    dbAvailable = false;
  }
});

after(async () => {
  await connection?.end();
});

function skipIfUnavailable(t) {
  if (!dbAvailable) {
    t.skip('Live DB is unavailable; live multi-store checks skipped.');
  }
}

test('Settings UI sends store-scoped read and clear contracts', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'app/settings/page.tsx'), 'utf8');
  assert.match(source, /useStore/);
  assert.match(source, /api\/settings\/database\?storeId=/);
  assert.match(source, /action: ['"]clear_store['"]/);
  assert.match(source, /confirmation: true/);
  assert.doesNotMatch(source, /clear_table/);
  assert.doesNotMatch(source, /clear_all/);
});

test('Settings API uses a non-reserved alias for row counts', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'app/api/settings/database/route.ts'), 'utf8');
  assert.match(source, /AS row_count/);
  assert.doesNotMatch(source, /AS rows\b/);
});

test('Settings API clears every store-scoped parent and child while preserving shared Master SKU', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'app/api/settings/database/route.ts'), 'utf8');
  const clearStoreSource = source.slice(source.indexOf("if (body.action !== 'clear_store')"));
  const expectedDeletes = [
    'income_penghasilan_raw', 'income_adjustments_raw', 'income_shipping_fee_discrepancies_raw', 'income_report_imports',
    'balance_transactions_raw', 'balance_report_imports',
    'order_cancellation_raw', 'order_cancellation_report_imports',
    'order_failed_delivery_raw', 'order_failed_delivery_report_imports',
    'order_return_refund_raw', 'order_return_refund_report_imports',
    'ads_transactions_raw', 'ads_report_imports', 'order_all',
  ];
  assert.match(source, /body\.action !== ['"]clear_store['"]/);
  for (const table of expectedDeletes) assert.match(clearStoreSource, new RegExp(`DELETE FROM ${table}`));
  assert.doesNotMatch(clearStoreSource, /DELETE FROM sku_master_raw/);
  assert.doesNotMatch(clearStoreSource, /DELETE FROM sku_report_imports/);
  for (const [child, parent] of [
    ['income_penghasilan_raw', 'income_report_imports'],
    ['balance_transactions_raw', 'balance_report_imports'],
    ['order_cancellation_raw', 'order_cancellation_report_imports'],
    ['order_failed_delivery_raw', 'order_failed_delivery_report_imports'],
    ['order_return_refund_raw', 'order_return_refund_report_imports'],
    ['ads_transactions_raw', 'ads_report_imports'],
  ]) assert.ok(clearStoreSource.indexOf(`DELETE FROM ${child}`) < clearStoreSource.indexOf(`DELETE FROM ${parent}`), `${child} must delete before ${parent}`);
  assert.match(source, /Aksi reset tidak dikenali/);
  assert.doesNotMatch(source, /TRUNCATE TABLE/);
  assert.doesNotMatch(source, /clear_all/);
});

test('RAW packages block store deletion and Clear Data Toko Aktif removes them first', () => {
  const stores = fs.readFileSync(path.resolve(process.cwd(), 'app/api/stores/route.ts'), 'utf8');
  const page = fs.readFileSync(path.resolve(process.cwd(), 'app/settings/page.tsx'), 'utf8');
  assert.match(stores, /balance_package_count/);
  assert.match(stores, /cancellation_package_count/);
  assert.match(stores, /failed_delivery_package_count/);
  assert.match(stores, /return_refund_package_count/);
  assert.match(stores, /ads_package_count/);
  assert.match(page, /seluruh data operasional toko/);
  assert.match(page, /Master SKU shared tetap aman/);
});

test('Settings API provides an explicit confirmed global Master SKU reset that deletes children before parents', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'app/api/settings/database/route.ts'), 'utf8');
  assert.match(source, /body\.action === ['"]clear_shared_sku['"]/);
  assert.match(source, /DELETE FROM sku_master_raw/);
  assert.match(source, /DELETE FROM sku_report_imports/);
  assert.ok(source.indexOf('DELETE FROM sku_master_raw') < source.indexOf('DELETE FROM sku_report_imports'));
  assert.match(source, /confirmation !== true/);
});

test('Settings UI gives Master SKU reset a separate global warning and explicit confirmation', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'app/settings/page.tsx'), 'utf8');
  assert.match(source, /Reset Master SKU Shared/);
  assert.match(source, /seluruh toko/);
  assert.match(source, /confirmedSharedSku/);
  assert.match(source, /action: 'clear_shared_sku', confirmation: true/);
  assert.match(source, /Ya, Reset Master SKU/);
  assert.match(source, /onClick=\{\(\) => \{ setConfirmedSharedSku\(false\); setConfirmedStoreId\(storeId\); \}\}/);
});

test('Store deletion requires explicit confirmation, refuses the last store and non-empty scopes, then deletes only the selected store', () => {
  const route = fs.readFileSync(path.resolve(process.cwd(), 'app/api/stores/route.ts'), 'utf8');
  assert.match(route, /export async function DELETE/);
  assert.match(route, /body\.confirmation !== true/);
  assert.match(route, /requireStoreId/);
  assert.match(route, /SELECT id FROM stores FOR UPDATE/);
  assert.match(route, /Tidak dapat menghapus toko terakhir/);
  assert.match(route, /FROM order_all WHERE store_id = \?\) AS order_count/);
  assert.match(route, /FROM income_report_imports WHERE store_id = \?\) AS income_package_count/);
  assert.match(route, /FROM balance_report_imports WHERE store_id = \?\) AS balance_package_count/);
  assert.match(route, /FROM ads_report_imports WHERE store_id = \?\) AS ads_package_count/);
  assert.match(route, /Clear data toko terlebih dahulu/);
  assert.match(route, /DELETE FROM stores WHERE id = \?/);
  assert.match(route, /isMutationAuthorized/);
  assert.match(route, /isSameOriginMutation/);
});

test('Settings UI separates delete-store confirmation and refreshes the global selector after success', () => {
  const page = fs.readFileSync(path.resolve(process.cwd(), 'app/settings/page.tsx'), 'utf8');
  assert.match(page, /Hapus Toko Aktif/);
  assert.match(page, /confirmedDeleteStoreId/);
  assert.match(page, /method: 'DELETE'/);
  assert.match(page, /confirmation: true/);
  assert.match(page, /await refreshStores\(\)/);
  assert.match(page, /Tidak bisa dihapus bila hanya tersisa satu toko/);
});

test('mutation routes do not inherit the public read-mode bypass', () => {
  const settings = fs.readFileSync(path.resolve(process.cwd(), 'app/api/settings/database/route.ts'), 'utf8');
  const upload = fs.readFileSync(path.resolve(process.cwd(), 'app/api/upload/route.ts'), 'utf8');
  const stores = fs.readFileSync(path.resolve(process.cwd(), 'app/api/stores/route.ts'), 'utf8');
  assert.match(settings, /isMutationAuthorized/);
  assert.match(upload, /isMutationAuthorized/);
  assert.match(stores, /isMutationAuthorized/);
  assert.doesNotMatch(settings, /if \\(!isDashboardAuthEnabled\\(\\)\\) return true/);
  assert.doesNotMatch(upload, /if \\(isDashboardAuthEnabled\\(\\)\\)/);
  assert.doesNotMatch(stores, /if \\(isDashboardAuthEnabled\\(\\)\\)/);
});

test('legacy upload status endpoint is explicitly retired', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'app/api/upload/status/route.ts'), 'utf8');
  assert.match(source, /410/);
  assert.doesNotMatch(source, /SELECT \\* FROM upload_jobs/);
});

test('active upload route does not contain the legacy Income writer', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'app/api/upload/route.ts'), 'utf8');
  assert.doesNotMatch(source, /async function importIncome\(/);
  assert.doesNotMatch(source, /INSERT INTO income_penghasilan \(/);
});

test('pagination rejects malformed, fractional, and offset-overflow values instead of producing unsafe SQL parameters', () => {
  assert.deepEqual(parsePagination(null, null), { page: 1, limit: 50, error: null });
  assert.deepEqual(parsePagination('2', '10'), { page: 2, limit: 10, error: null });
  assert.equal(parsePagination('abc', '10').error, 'page must be a positive integer.');
  assert.equal(parsePagination('1', 'abc').error, 'limit must be a positive integer.');
  assert.equal(parsePagination('1.5', '10').error, 'page must be a positive integer.');
  assert.equal(parsePagination('1', '0').error, 'limit must be a positive integer.');
  assert.equal(parsePagination('9007199254740991', '100').error, 'page and limit produce an unsafe offset.');
});

test('store-dependent pages clear stale payloads and reset the table when the active store changes', () => {
  const orders = fs.readFileSync(path.resolve(process.cwd(), 'app/orders/page.tsx'), 'utf8');
  const income = fs.readFileSync(path.resolve(process.cwd(), 'app/income/page.tsx'), 'utf8');
  assert.match(orders, /setData\(\[\]\);\s*setTotalRows\(0\);/);
  assert.match(orders, /loadedStoreId === storeId/);
  assert.match(orders, /key=\{storeId\}/);
  assert.match(income, /setPayload\(null\);/);
  assert.match(income, /String\(payload\?\.storeId \|\| ''\) === storeId/);
  assert.match(income, /key=\{`\$\{storeId\}-\$\{section\}-\$\{view\}`\}/);
});

test('clear-store confirmation and completion remain bound to the confirmed store', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'app/settings/page.tsx'), 'utf8');
  assert.match(source, /confirmedStoreId/);
  assert.match(source, /const targetStoreId = confirmedStoreId/);
  assert.match(source, /const operationStoreId = targetStoreId/);
  assert.match(source, /body: JSON\.stringify\(\{ action: 'clear_store', storeId: operationStoreId, confirmation: true \}\)/);
  assert.match(source, /setConfirmedStoreId\(null\)/);
  assert.match(source, /if \(storeId === targetStoreId\) await fetchTables\(\)/);
});

test('upload invalidates all preview and import UI state on store switch and labels shared SKU explicitly', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'app/upload/page.tsx'), 'utf8');
  assert.match(source, /setPreview\(null\);/);
  assert.match(source, /setPreviewStoreId\(null\);/);
  assert.match(source, /setSelectedFile\(null\);/);
  assert.match(source, /setChecking\(false\);/);
  assert.match(source, /previewStoreId === storeId/);
  assert.match(source, /Master SKU tetap shared/);
});

test('SKU importId uses strict positive-integer validation and ignores stale responses', () => {
  const route = fs.readFileSync(path.resolve(process.cwd(), 'app/api/sku/route.ts'), 'utf8');
  const page = fs.readFileSync(path.resolve(process.cwd(), 'app/sku/page.tsx'), 'utf8');
  assert.match(route, /parsePositiveInteger\(requestedImport/);
  assert.match(route, /Invalid importId/);
  assert.match(page, /requestSequence/);
  assert.match(page, /requestId !== requestSequence\.current/);
});

test('single-admin mode does not leave a public auth bypass in the proxy', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'proxy.ts'), 'utf8');
  assert.doesNotMatch(source, /DASHBOARD_AUTH_ENABLED/);
  assert.match(source, /isAuthorized\(request\)/);
});

test('upload preview and import bind to the selected store in the client', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'app/upload/page.tsx'), 'utf8');
  assert.match(source, /previewStoreId/);
  assert.match(source, /previewStoreId !== storeId/);
});

test('store and settings mutation handlers return 400 for malformed JSON', () => {
  const stores = fs.readFileSync(path.resolve(process.cwd(), 'app/api/stores/route.ts'), 'utf8');
  const settings = fs.readFileSync(path.resolve(process.cwd(), 'app/api/settings/database/route.ts'), 'utf8');
  assert.match(stores, /Malformed JSON/);
  assert.match(settings, /Malformed JSON/);
});

test('live store parents reference valid stores and income children inherit parent scope', async (t) => {
  skipIfUnavailable(t);
  if (!dbAvailable) return;

  const [[{ storeCount }]] = await connection.query('SELECT COUNT(*) AS storeCount FROM stores');
  if (Number(storeCount) < 2) {
    t.skip('Live DB has fewer than two stores; multi-store fixture checks skipped.');
    return;
  }

  const [[{ invalidOrderStores }]] = await connection.query(`
    SELECT COUNT(*) AS invalidOrderStores
    FROM order_all o
    LEFT JOIN stores s ON s.id = o.store_id
    WHERE s.id IS NULL
  `);
  assert.equal(Number(invalidOrderStores), 0);

  const [[{ invalidIncomeStores }]] = await connection.query(`
    SELECT COUNT(*) AS invalidIncomeStores
    FROM income_report_imports i
    LEFT JOIN stores s ON s.id = i.store_id
    WHERE s.id IS NULL
  `);
  assert.equal(Number(invalidIncomeStores), 0);

  for (const childTable of [
    'income_penghasilan_raw',
    'income_adjustments_raw',
    'income_shipping_fee_discrepancies_raw',
  ]) {
    const [[result]] = await connection.query(`
      SELECT COUNT(*) AS orphanRows
      FROM ${childTable} child
      LEFT JOIN income_report_imports parent ON parent.id = child.income_report_import_id
      WHERE parent.id IS NULL
    `);
    assert.equal(Number(result.orphanRows), 0, `${childTable} contains orphan rows`);
  }
});

test('live unique keys include store scope for current-state and package identities', async (t) => {
  skipIfUnavailable(t);
  if (!dbAvailable) return;

  const [orderIndexes] = await connection.query('SHOW INDEX FROM order_all');
  const orderColumns = orderIndexes
    .filter(row => Number(row.Non_unique) === 0 && row.Key_name === 'uk_order_item_store_price')
    .sort((left, right) => Number(left.Seq_in_index) - Number(right.Seq_in_index))
    .map(row => row.Column_name);
  assert.deepEqual(orderColumns, ['store_id', 'no_pesanan', 'nomor_referensi_sku', 'nama_variasi', 'harga_setelah_diskon']);

  const [incomeIndexes] = await connection.query('SHOW INDEX FROM income_report_imports');
  const incomeColumns = incomeIndexes
    .filter(row => Number(row.Non_unique) === 0 && row.Key_name === 'uk_income_report_import_store_sha256')
    .sort((left, right) => Number(left.Seq_in_index) - Number(right.Seq_in_index))
    .map(row => row.Column_name);
  assert.deepEqual(incomeColumns, ['store_id', 'source_sha256']);
});

test('Order All exposes the complete business RAW contract, including buyer delivery fields', () => {
  const ordersPage = fs.readFileSync(path.resolve(process.cwd(), 'app/orders/page.tsx'), 'utf8');
  const ordersRoute = fs.readFileSync(path.resolve(process.cwd(), 'app/api/orders/route.ts'), 'utf8');
  for (const field of ['alasan_pembatalan', 'status_pembatalan_pengembalian', 'no_resi', 'waktu_pembayaran_dilakukan', 'metode_pembayaran', 'returned_quantity', 'alamat_pengiriman', 'no_telepon', 'waktu_pesanan_selesai']) {
    assert.match(ordersPage, new RegExp(field));
    assert.match(ordersRoute, new RegExp(`${field}: '${field}'`));
  }
  assert.doesNotMatch(ordersPage, /source_snapshot_file/);
  assert.doesNotMatch(ordersPage, /line_ordinal/);
  assert.match(ordersPage, /boundedScroll/);
  const dataTable = fs.readFileSync(path.resolve(process.cwd(), 'components/DataTable.tsx'), 'utf8');
  assert.match(dataTable, /max-h-\[437px\] overflow-auto/);
  assert.match(dataTable, /sticky top-0 z-10/);
  assert.match(ordersPage, /Filter Tanggal/);
  assert.match(ordersPage, /completedOnly/);
  for (const field of ['pesanan_harus_dikirim_sebelum', 'waktu_pengiriman_diatur', 'waktu_pesanan_dibuat', 'waktu_pembayaran_dilakukan', 'waktu_pesanan_selesai']) {
    assert.match(ordersPage, new RegExp(field));
    assert.match(ordersRoute, /DATE_FILTER_COLUMNS/);
    assert.match(ordersRoute, /\$\{column\}From/);
    assert.match(ordersRoute, /\$\{column\}To/);
  }
  assert.match(ordersRoute, /waktu_pesanan_selesai IS NOT NULL/);
  assert.match(ordersRoute, /Seller Centre's local calendar values/);
  assert.match(ordersRoute, /CONCAT\(\?, ' 00:00:00'\)/);
  assert.doesNotMatch(ordersRoute, /DATE_SUB\(CONCAT\(\?, ' 00:00:00'\), INTERVAL 7 HOUR\)/);
});

test('Profit Aktual route is read-only, store-scoped, uses the approved RAW sources, and preserves WIB cohort boundaries', () => {
  const route = fs.readFileSync(path.resolve(process.cwd(), 'app/api/profit-calculation/route.ts'), 'utf8');
  assert.match(route, /requireStoreId/);
  assert.match(route, /income_penghasilan_raw/);
  assert.match(route, /lihat_berdasarkan=.*Order/);
  assert.match(route, /lihat_berdasarkan='Sku'/);
  assert.match(route, /skuAllocations/);
  assert.match(route, /order_cancellation_raw/);
  assert.match(route, /order_failed_delivery_raw/);
  assert.match(route, /order_return_refund_raw/);
  assert.match(route, /income_adjustments_raw/);
  assert.match(route, /alasan_pembatalan,no_resi,waktu_pengiriman_diatur/);
  assert.match(route, /reason: row.reason/);
  assert.match(route, /exceptionDetails/);
  assert.match(route, /return_qc_decisions/);
  assert.match(route, /source_reference/);
  assert.match(route, /returnQcByReference/);
  assert.match(route, /Seller Centre local timestamp text as DATETIME/);
  assert.match(route, /waktu_pesanan_dibuat >= CONCAT\(\?, \\' 00:00:00\\'\)/);
  assert.match(route, /releaseDateFrom/);
  assert.match(route, /releaseDateTo/);
  assert.match(route, /tanggal_dana_dilepaskan >= CONCAT\(\?, \\' 00:00:00\\'\)/);
  assert.match(route, /tanggal_dana_dilepaskan < DATE_ADD\(CONCAT\(\?, \\' 00:00:00\\'\), INTERVAL 1 DAY\)/);
  assert.doesNotMatch(route, /INTERVAL 7 HOUR/);
  assert.doesNotMatch(route, /INSERT INTO|UPDATE |DELETE FROM/);
});

test('Pending-order estimate stays separate from settlement and uses one Total Pembayaran per order', () => {
  const input = { skuRows: [{ sku1: 'PENDING-REF', sku2: null, harga: 50000 }], settlementRows: [], exceptionOrderNumbers: [], orderRows: [{ no_pesanan: 'PENDING-ORDER', status_pesanan: 'Sedang Dikirim', nomor_referensi_sku: 'PENDING-REF', sku_induk: null, jumlah: 2, returned_quantity: 0, subtotal_pesanan: 180000, voucher_ditanggung_penjual: 0, total_pembayaran: 190000, waktu_pesanan_dibuat: '2026-09-01', waktu_pesanan_selesai: null }] };
  const report = buildProfitActualReport(input);
  assert.equal(report.summary.pending, 1);
  assert.equal(report.summary.pendingPcs, 2);
  assert.equal(report.summary.pendingOrderValue, 190000);
  assert.equal(report.summary.pendingValueComplete, true);
  assert.equal(report.summary.pendingEstimatedProfit, 45900);
  assert.equal(report.summary.pendingEstimatedProfitComplete, true);
  assert.equal(report.orders[0].settlement, null);
  assert.equal(report.orders[0].pendingOrderValue, 190000);
});

test('Profit Aktual reports settlement excluded from normal profit separately', () => {
  const report = buildProfitActualReport({
    skuRows: [{ sku1: 'RETURN-SKU', sku2: '', harga: 10000 }],
    settlementRows: [{ no_pesanan: 'RETURNED', signed_total: 64066, tanggal_dana_dilepaskan: '2026-09-04' }],
    exceptionOrderNumbers: ['RETURNED'],
    orderRows: [{ no_pesanan: 'RETURNED', status_pesanan: 'Selesai', nomor_referensi_sku: 'RETURN-SKU', sku_induk: '', jumlah: 1, waktu_pesanan_selesai: '2026-09-04 19:00:00', waktu_pesanan_dibuat: '2026-09-01' }],
  });
  assert.equal(report.summary.cohortOrders, 1);
  assert.equal(report.summary.cohortPcs, 1);
  assert.equal(report.summary.settledNormal, 0);
  assert.equal(report.summary.settlement, 0);
  assert.equal(report.summary.exception, 1);
  assert.equal(report.summary.settlementExcluded, 64066);
});

test('Return cancelled cash matched becomes Profit Aktual and retains its audit sub-status', () => {
  const report = buildProfitActualReport({
    skuRows: [{ sku1: 'RETURN-CANCELLED', sku2: '', harga: 50000 }],
    settlementRows: [{ no_pesanan: 'CANCELLED-RETURN', signed_total: 132002, tanggal_dana_dilepaskan: '2026-09-10' }],
    exceptionOrderNumbers: ['CANCELLED-RETURN'],
    exceptionEvidenceRows: [{ no_pesanan: 'CANCELLED-RETURN', source_type: 'return_refund', source_status: 'Pengembalian Barang/Dana Dibatalkan' }],
    balanceRows: [{ no_pesanan: 'CANCELLED-RETURN', type_transaksi: 'Penghasilan dari Pesanan', jumlah_signed: 132002 }],
    orderRows: [{ no_pesanan: 'CANCELLED-RETURN', status_pesanan: 'Selesai', nomor_referensi_sku: 'RETURN-CANCELLED', sku_induk: '', jumlah: 2, waktu_pesanan_selesai: '2026-09-10 04:10:00', waktu_pesanan_dibuat: '2026-08-31' }],
  });
  assert.equal(report.orders[0].bucket, 'settled_normal');
  assert.equal(report.orders[0].exceptionSubstatus, 'return_cancelled_cash_matched');
  assert.equal(report.orders[0].profitActual, 32002);
  assert.equal(report.summary.exception, 0);
  assert.equal(report.summary.settledNormal, 1);
  assert.equal(report.summary.profit, 32002);
  assert.equal(report.summary.cashCoveredOrders, 1);
  assert.equal(report.summary.hppApplied, 100000);
  const withOutgoing = buildProfitActualReport({
    skuRows: [{ sku1: 'RETURN-CANCELLED', sku2: '', harga: 50000 }],
    settlementRows: [{ no_pesanan: 'CANCELLED-RETURN', signed_total: 132002, tanggal_dana_dilepaskan: '2026-09-10' }],
    exceptionOrderNumbers: ['CANCELLED-RETURN'],
    exceptionEvidenceRows: [{ no_pesanan: 'CANCELLED-RETURN', source_type: 'return_refund', source_status: 'Pengembalian Barang/Dana Dibatalkan' }],
    balanceRows: [{ no_pesanan: 'CANCELLED-RETURN', type_transaksi: 'Penghasilan dari Pesanan', jumlah_signed: 132002 }, { no_pesanan: 'CANCELLED-RETURN', type_transaksi: 'Penghasilan dari Pesanan', jumlah_signed: -1 }],
    orderRows: [{ no_pesanan: 'CANCELLED-RETURN', status_pesanan: 'Selesai', nomor_referensi_sku: 'RETURN-CANCELLED', sku_induk: '', jumlah: 2, waktu_pesanan_selesai: '2026-09-10 04:10:00', waktu_pesanan_dibuat: '2026-08-31' }],
  });
  assert.equal(withOutgoing.orders[0].bucket, 'exception');
  assert.equal(withOutgoing.orders[0].exceptionSubstatus, null);
  const returned = buildProfitActualReport({
    skuRows: [{ sku1: 'RETURN-CANCELLED', sku2: '', harga: 50000 }],
    settlementRows: [{ no_pesanan: 'RETURNED-CANCELLED', signed_total: 132002, tanggal_dana_dilepaskan: '2026-09-10' }],
    exceptionOrderNumbers: ['RETURNED-CANCELLED'],
    exceptionEvidenceRows: [{ no_pesanan: 'RETURNED-CANCELLED', source_type: 'return_refund', source_status: 'Pengembalian Barang/Dana Dibatalkan' }],
    balanceRows: [{ no_pesanan: 'RETURNED-CANCELLED', type_transaksi: 'Penghasilan dari Pesanan', jumlah_signed: 132002 }],
    orderRows: [{ no_pesanan: 'RETURNED-CANCELLED', status_pesanan: 'Selesai', nomor_referensi_sku: 'RETURN-CANCELLED', sku_induk: '', jumlah: 2, returned_quantity: 1, waktu_pesanan_selesai: '2026-09-10 04:10:00', waktu_pesanan_dibuat: '2026-08-31' }],
  });
  assert.equal(returned.orders[0].bucket, 'exception');
  assert.equal(returned.orders[0].exceptionSubstatus, null);
});

test('Completed full return with reconciled negative cash becomes final return cost without physical QC', () => {
  const report = buildProfitActualReport({
    skuRows: [{ sku1: 'FULL-RETURN', sku2: '', harga: 52500 }],
    settlementRows: [{ no_pesanan: 'FULL-RETURN-ORDER', signed_total: -47813, tanggal_dana_dilepaskan: '2026-08-25' }],
    exceptionOrderNumbers: ['FULL-RETURN-ORDER'],
    exceptionEvidenceRows: [{ no_pesanan: 'FULL-RETURN-ORDER', source_type: 'return_refund', source_status: 'Dana Dikembalikan ke Pembeli', return_type: 'Seluruh Pesanan', stock_status: 'Pengiriman pengembalian barang selesai' }],
    balanceRows: [{ no_pesanan: 'FULL-RETURN-ORDER', type_transaksi: 'Penghasilan dari Pesanan', jumlah_signed: -47813 }],
    orderRows: [{ no_pesanan: 'FULL-RETURN-ORDER', status_pesanan: 'Selesai', nomor_referensi_sku: 'FULL-RETURN', sku_induk: '', jumlah: 1, returned_quantity: 1, waktu_pesanan_selesai: '2026-08-25 00:22:00', waktu_pesanan_dibuat: '2026-08-13' }],
  });
  assert.equal(report.orders[0].bucket, 'full_return_cash_final_negative');
  assert.equal(report.orders[0].profitActual, null);
  assert.equal(report.orders[0].provisionalProfit, null);
  assert.equal(report.summary.fullReturnCashFinalNegative, 1);
  assert.equal(report.summary.fullReturnCashFinalNegativePcs, 1);
  assert.equal(report.summary.fullReturnCashFinalNegativeOutcome, -47813);
  assert.equal(report.orders[0].returnStockAssumption, 'stok_retur_diasumsikan');
  assert.equal(report.summary.returnFinalCost, -47813);
  assert.equal(report.summary.financialFinalOutcome, -47813);
  assert.equal(report.summary.exception, 0);
  assert.equal(report.summary.profitComputable, -47813);
  assert.equal(report.summary.hppApplied, 0);
  assert.equal(report.summary.unresolvedOrders, 0);
  assert.equal(report.summary.unresolvedPcs, 0);
  const unsafe = buildProfitActualReport({
    skuRows: [{ sku1: 'FULL-RETURN', sku2: '', harga: 52500 }],
    settlementRows: [{ no_pesanan: 'UNSAFE', signed_total: -47813, tanggal_dana_dilepaskan: '2026-08-25' }],
    exceptionOrderNumbers: ['UNSAFE'],
    exceptionEvidenceRows: [{ no_pesanan: 'UNSAFE', source_type: 'return_refund', source_status: 'Dana Dikembalikan ke Pembeli', return_type: 'Seluruh Pesanan', stock_status: 'Pengiriman pengembalian barang selesai' }],
    balanceRows: [{ no_pesanan: 'UNSAFE', type_transaksi: 'Penghasilan dari Pesanan', jumlah_signed: -47813 }, { no_pesanan: 'UNSAFE', type_transaksi: 'Penyesuaian', jumlah_signed: 5000 }],
    orderRows: [{ no_pesanan: 'UNSAFE', status_pesanan: 'Selesai', nomor_referensi_sku: 'FULL-RETURN', sku_induk: '', jumlah: 1, returned_quantity: 1, waktu_pesanan_selesai: '2026-08-25 00:22:00', waktu_pesanan_dibuat: '2026-08-13' }],
  });
  assert.equal(unsafe.orders[0].bucket, 'exception');
});

test('Full-return final cost does not depend on physical QC state', () => {
  const input = {
    skuRows: [{ sku1: 'ASSUMED-STOCK', sku2: '', harga: 52500 }],
    settlementRows: [{ no_pesanan: 'ASSUMED-STOCK-ORDER', signed_total: -412, tanggal_dana_dilepaskan: '2026-08-24' }],
    exceptionOrderNumbers: ['ASSUMED-STOCK-ORDER'],
    exceptionEvidenceRows: [{ no_pesanan: 'ASSUMED-STOCK-ORDER', source_type: 'return_refund', source_reference: 'RETURN-ASSUMED-STOCK', source_status: 'Dana Dikembalikan ke Pembeli', return_type: 'Seluruh Pesanan' }],
    balanceRows: [{ no_pesanan: 'ASSUMED-STOCK-ORDER', type_transaksi: 'Penghasilan dari Pesanan', jumlah_signed: -412 }],
    orderRows: [{ no_pesanan: 'ASSUMED-STOCK-ORDER', status_pesanan: 'Selesai', nomor_referensi_sku: 'ASSUMED-STOCK', sku_induk: '', jumlah: 1, returned_quantity: 1, waktu_pesanan_selesai: '2026-08-24 18:18:00', waktu_pesanan_dibuat: '2026-08-13' }],
  };
  const withoutQc = buildProfitActualReport(input);
  const restock = buildProfitActualReport({ ...input, returnQcByReference: { 'RETURN-ASSUMED-STOCK': 'restock_layak' } });
  const damaged = buildProfitActualReport({ ...input, returnQcByReference: { 'RETURN-ASSUMED-STOCK': 'rusak' } });
  for (const report of [withoutQc, restock, damaged]) {
    assert.equal(report.orders[0].bucket, 'full_return_cash_final_negative');
    assert.equal(report.orders[0].returnStockAssumption, 'stok_retur_diasumsikan');
    assert.equal(report.orders[0].profitActual, null);
    assert.equal(report.summary.fullReturnCashFinalNegative, 1);
    assert.equal(report.summary.fullReturnCashFinalNegativePcs, 1);
    assert.equal(report.summary.fullReturnCashFinalNegativeOutcome, -412);
    assert.equal(report.summary.returnFinalCost, -412);
    assert.equal(report.summary.financialFinalOutcome, -412);
    assert.equal(report.summary.exception, 0);
    assert.equal(report.summary.unresolvedOrders, 0);
    assert.equal(report.summary.unresolvedPcs, 0);
    assert.equal(report.summary.profitComputable, -412);
    assert.equal(report.summary.hppApplied, 0);
  }
});

test('Completed full return with reconciled positive Shopee compensation becomes Kompensasi Return Final', () => {
  const report = buildProfitActualReport({
    skuRows: [{ sku1: 'FULL-POSITIVE', sku2: '', harga: 62500 }],
    settlementRows: [{ no_pesanan: 'FULL-POSITIVE-ORDER', signed_total: -959, tanggal_dana_dilepaskan: '2026-09-07' }],
    exceptionOrderNumbers: ['FULL-POSITIVE-ORDER'],
    exceptionEvidenceRows: [
      { no_pesanan: 'FULL-POSITIVE-ORDER', source_type: 'return_refund', source_status: 'Pengembalian Barang/Dana Dibatalkan', return_type: 'Seluruh Pesanan' },
      { no_pesanan: 'FULL-POSITIVE-ORDER', source_type: 'return_refund', source_status: 'Banding Ditolak', return_type: 'Seluruh Pesanan', stock_status: 'Pengiriman pengembalian barang gagal' },
      { no_pesanan: 'FULL-POSITIVE-ORDER', source_type: 'adjustment', amount: 5000 },
    ],
    balanceRows: [
      { no_pesanan: 'FULL-POSITIVE-ORDER', type_transaksi: 'Penghasilan dari Pesanan', jumlah_signed: -959 },
      { no_pesanan: 'FULL-POSITIVE-ORDER', type_transaksi: 'Penyesuaian', jumlah_signed: 5000 },
    ],
    orderRows: [
      { no_pesanan: 'FULL-POSITIVE-ORDER', status_pesanan: 'Selesai', nomor_referensi_sku: 'FULL-POSITIVE', sku_induk: '', jumlah: 1, returned_quantity: 1, waktu_pesanan_selesai: '2026-09-07 10:04:00', waktu_pesanan_dibuat: '2026-08-14' },
      { no_pesanan: 'FULL-POSITIVE-ORDER', status_pesanan: 'Selesai', nomor_referensi_sku: 'FULL-POSITIVE', sku_induk: '', jumlah: 1, returned_quantity: 1, waktu_pesanan_selesai: '2026-09-07 10:04:00', waktu_pesanan_dibuat: '2026-08-14' },
    ],
  });
  assert.equal(report.orders[0].bucket, 'full_return_cash_final_positive');
  assert.equal(report.orders[0].balanceNet, 4041);
  assert.equal(report.orders[0].balanceIncomingAdjustment, 5000);
  assert.equal(report.orders[0].profitActual, null);
  assert.equal(report.orders[0].provisionalProfit, null);
  assert.equal(report.summary.fullReturnCashFinalPositive, 1);
  assert.equal(report.summary.fullReturnCashFinalPositivePcs, 2);
  assert.equal(report.summary.fullReturnCashFinalPositiveOutcome, 4041);
  assert.equal(report.summary.returnFinalCompensation, 4041);
  assert.equal(report.summary.financialFinalOutcome, 4041);
  assert.equal(report.summary.exception, 0);
  assert.equal(report.summary.cashCoveredOrders, 0);
  assert.equal(report.summary.profitComputable, 4041);
  assert.equal(report.summary.hppApplied, 0);
  assert.equal(report.summary.unresolvedOrders, 0);
  assert.equal(report.summary.unresolvedPcs, 0);
  const unsafe = buildProfitActualReport({
    skuRows: [{ sku1: 'FULL-POSITIVE', sku2: '', harga: 62500 }],
    settlementRows: [{ no_pesanan: 'UNSAFE-POSITIVE', signed_total: -959, tanggal_dana_dilepaskan: '2026-09-07' }],
    exceptionOrderNumbers: ['UNSAFE-POSITIVE'],
    exceptionEvidenceRows: [
      { no_pesanan: 'UNSAFE-POSITIVE', source_type: 'return_refund', source_status: 'Banding Ditolak', return_type: 'Seluruh Pesanan', stock_status: 'Pengiriman pengembalian barang gagal' },
      { no_pesanan: 'UNSAFE-POSITIVE', source_type: 'adjustment', amount: 5000 },
    ],
    balanceRows: [{ no_pesanan: 'UNSAFE-POSITIVE', type_transaksi: 'Penghasilan dari Pesanan', jumlah_signed: -959 }, { no_pesanan: 'UNSAFE-POSITIVE', type_transaksi: 'Penyesuaian', jumlah_signed: 5001 }],
    orderRows: [{ no_pesanan: 'UNSAFE-POSITIVE', status_pesanan: 'Selesai', nomor_referensi_sku: 'FULL-POSITIVE', sku_induk: '', jumlah: 1, returned_quantity: 1, waktu_pesanan_selesai: '2026-09-07 10:04:00', waktu_pesanan_dibuat: '2026-08-14' }],
  });
  assert.equal(unsafe.orders[0].bucket, 'exception');
});

test('Profit Aktual finalizes a cash-reconciled partial return under the returned-stock assumption without QC', () => {
  const input = {
    skuRows: [{ sku1: 'SOLD', sku2: '', harga: 52500 }, { sku1: 'RETURNED', sku2: '', harga: 50000 }],
    settlementRows: [{ no_pesanan: 'PARTIAL', signed_total: 64066, tanggal_dana_dilepaskan: '2026-09-04' }],
    exceptionOrderNumbers: ['PARTIAL'],
    orderRows: [
      { no_pesanan: 'PARTIAL', status_pesanan: 'Selesai', nomor_referensi_sku: 'SOLD', sku_induk: '', jumlah: 1, returned_quantity: 0, waktu_pesanan_selesai: '2026-09-04 19:00:00', waktu_pesanan_dibuat: '2026-09-01' },
      { no_pesanan: 'PARTIAL', status_pesanan: 'Selesai', nomor_referensi_sku: 'RETURNED', sku_induk: '', jumlah: 1, returned_quantity: 1, waktu_pesanan_selesai: '2026-09-04 19:00:00', waktu_pesanan_dibuat: '2026-09-01' },
    ],
  };
  const report = buildProfitActualReport({ ...input,
    exceptionEvidenceRows: [{ no_pesanan: 'PARTIAL', source_type: 'return_refund', source_reference: 'RET-PARTIAL', source_status: 'Dana Dikembalikan ke Pembeli' }],
    balanceRows: [{ no_pesanan: 'PARTIAL', type_transaksi: 'Penghasilan dari Pesanan', jumlah_signed: 64066 }],
  });
  assert.equal(report.summary.settledNormal, 0);
  assert.equal(report.summary.partialReturnFinalRestock, 1);
  assert.equal(report.summary.partialReturnProvisional, 0);
  assert.equal(report.summary.partialReturnSettlement, 64066);
  assert.equal(report.summary.partialReturnHpp, 52500);
  assert.equal(report.summary.partialReturnProfit, 11566);
  assert.equal(report.summary.settlementExcluded, 0);
  assert.equal(report.summary.cashCoveredOrders, 1);
  assert.equal(report.summary.cashCoveredPcs, 1);
  assert.equal(report.summary.partialReturnOrderedPcs, 2);
  assert.equal(report.summary.partialReturnNonReturnedPcs, 1);
  assert.equal(report.summary.partialReturnReturnedPcs, 1);
  assert.equal(report.summary.settlementRecorded, 64066);
  assert.equal(report.summary.hppApplied, 52500);
  assert.equal(report.summary.profitComputable, 11566);
  assert.equal(report.summary.profitFinalComputed, 11566);
  assert.equal(report.summary.unresolvedOrders, 0);
  assert.equal(report.summary.unresolvedPcs, 0);
  assert.equal(report.orders[0].bucket, 'partial_return_final_restock');
  assert.equal(report.orders[0].nonReturnedPcs, 1);
  assert.equal(report.orders[0].returnedPcs, 1);
  assert.equal(report.orders[0].provisionalProfit, null);
  assert.equal(report.orders[0].finalRestockProfit, 11566);
  assert.equal(report.orders[0].returnStockAssumption, 'stok_retur_diasumsikan');
  const corrected = buildProfitActualReport({ ...input, balanceRows: [{ no_pesanan: 'PARTIAL', type_transaksi: 'Penghasilan dari Pesanan', jumlah_signed: 64066 }, { no_pesanan: 'PARTIAL', type_transaksi: 'Penghasilan dari Pesanan', jumlah_signed: -500 }] });
  assert.equal(corrected.orders[0].bucket, 'exception');
  assert.equal(corrected.summary.partialReturnProvisional, 0);
  assert.equal(corrected.summary.settlementExcluded, 64066);
  assert.equal(corrected.summary.balanceOutgoingOrders, 1);
  assert.equal(corrected.summary.balanceOutgoingTotal, -500);
  assert.equal(corrected.summary.balanceOrderIncomeOutgoing, -500);
  assert.equal(corrected.summary.balanceAdjustmentOutgoing, 0);
  assert.match(corrected.orders[0].balanceOutgoingReason, /Penghasilan dari Pesanan/);
});

test('Cancelled orders expose logistics sub-status without changing Batal accounting', () => {
  const report = buildProfitActualReport({
    skuRows: [{ sku1: 'BATAL', sku2: '', harga: 50000 }],
    settlementRows: [],
    exceptionOrderNumbers: ['CANCELLED-BEFORE', 'CANCELLED-FAILED'],
    exceptionEvidenceRows: [
      { no_pesanan: 'CANCELLED-BEFORE', source_type: 'cancellation', reason: 'Dibatalkan oleh Pembeli. Alasan: Ubah Pesanan yang Ada' },
      { no_pesanan: 'CANCELLED-FAILED', source_type: 'cancellation', reason: 'Dibatalkan secara otomatis oleh sistem Shopee. Alasan: Pengiriman gagal' },
      { no_pesanan: 'CANCELLED-FAILED', source_type: 'failed_delivery', reason: 'Selesai Dikirim ke Penjual' },
    ],
    balanceRows: [{ no_pesanan: 'CANCELLED-FAILED', type_transaksi: 'Penyesuaian', jumlah_signed: -412 }],
    orderRows: [
      { no_pesanan: 'CANCELLED-BEFORE', status_pesanan: 'Batal', alasan_pembatalan: 'Dibatalkan oleh Pembeli. Alasan: Ubah Pesanan yang Ada', no_resi: null, waktu_pengiriman_diatur: null, nomor_referensi_sku: 'BATAL', sku_induk: '', jumlah: 1, waktu_pesanan_dibuat: '2026-08-31' },
      { no_pesanan: 'CANCELLED-FAILED', status_pesanan: 'Batal', alasan_pembatalan: 'Dibatalkan secara otomatis oleh sistem Shopee. Alasan: Pengiriman gagal', no_resi: 'SPXID-TEST', waktu_pengiriman_diatur: '2026-09-01 16:31:00', nomor_referensi_sku: 'BATAL', sku_induk: '', jumlah: 1, waktu_pesanan_dibuat: '2026-08-31' },
      { no_pesanan: 'CANCELLED-UNKNOWN', status_pesanan: 'Batal', alasan_pembatalan: 'Dibatalkan oleh Pembeli', no_resi: null, waktu_pengiriman_diatur: null, nomor_referensi_sku: 'BATAL', sku_induk: '', jumlah: 1, waktu_pesanan_dibuat: '2026-08-31' },
    ],
  });
  const byId = Object.fromEntries(report.orders.map((row) => [row.no_pesanan, row]));
  assert.equal(byId['CANCELLED-BEFORE'].bucket, 'batal');
  assert.equal(byId['CANCELLED-BEFORE'].cancellationSubstatus, 'cancelled_before_shipment');
  assert.equal(byId['CANCELLED-BEFORE'].noResi, null);
  assert.equal(byId['CANCELLED-FAILED'].bucket, 'batal');
  assert.equal(byId['CANCELLED-FAILED'].cancellationSubstatus, 'cancelled_after_failed_delivery');
  assert.equal(byId['CANCELLED-FAILED'].balanceNet, -412);
  assert.equal(byId['CANCELLED-UNKNOWN'].cancellationSubstatus, null);
  assert.equal(report.summary.cancelled, 3);
  assert.equal(report.summary.cancelledPcs, 3);
  assert.equal(report.summary.cancelledBeforeShipment, 1);
  assert.equal(report.summary.cancelledAfterFailedDelivery, 1);
  assert.equal(report.summary.cashCoveredOrders, 0);
  assert.equal(report.summary.profitComputable, 0);
});

test('Profit Aktual reports full cohort order and pcs coverage independently of settlement buckets', () => {
  const report = buildProfitActualReport({
    skuRows: [{ sku1: 'REF-1', sku2: '', harga: 10000 }], settlementRows: [], exceptionOrderNumbers: [],
    orderRows: [
      { no_pesanan: 'MULTI-ITEM', status_pesanan: 'Batal', nomor_referensi_sku: 'REF-1', sku_induk: '', jumlah: 2, waktu_pesanan_dibuat: '2026-09-01' },
      { no_pesanan: 'MULTI-ITEM', status_pesanan: 'Batal', nomor_referensi_sku: 'REF-1', sku_induk: '', jumlah: 3, waktu_pesanan_dibuat: '2026-09-01' },
      { no_pesanan: 'ONE-ITEM', status_pesanan: 'Sedang Dikirim', nomor_referensi_sku: 'REF-1', sku_induk: '', jumlah: 1, waktu_pesanan_dibuat: '2026-09-01' },
    ],
  });
  assert.equal(report.summary.cohortOrders, 2);
  assert.equal(report.summary.cohortPcs, 6);
  assert.equal(report.summary.cancelled, 1);
  assert.equal(report.summary.pending, 1);
});

test('Profit Aktual keeps an existing settlement outside a selected release range separate from completed-unsettled', () => {
  const report = buildProfitActualReport({
    skuRows: [{ sku1: 'REF-1', sku2: '', harga: 10000 }],
    settlementRows: [],
    settlementExistenceRows: [{ no_pesanan: 'RELEASED-LATER', signed_total: 60000, tanggal_dana_dilepaskan: '2026-09-04' }],
    exceptionOrderNumbers: [],
    orderRows: [{ no_pesanan: 'RELEASED-LATER', status_pesanan: 'Selesai', nomor_referensi_sku: 'REF-1', sku_induk: '', jumlah: 1, waktu_pesanan_selesai: '2026-09-03 10:00:00', waktu_pesanan_dibuat: '2026-09-01' }],
  });
  assert.equal(report.summary.settlementOutsideReleaseRange, 1);
  assert.equal(report.summary.completedUnsettled, 0);
  assert.equal(report.orders[0].bucket, 'settlement_outside_release_range');
});

test('Profit Aktual separates completed-unsettled orders from ordinary pending orders', () => {
  const report = buildProfitActualReport({
    skuRows: [{ sku1: 'REF-1', sku2: '', harga: 10000 }],
    settlementRows: [], exceptionOrderNumbers: [],
    orderRows: [
      { no_pesanan: 'COMPLETED-UNSETTLED', status_pesanan: 'Selesai', nomor_referensi_sku: 'REF-1', sku_induk: '', jumlah: 1, waktu_pesanan_selesai: '2026-09-10 10:00:00', waktu_pesanan_dibuat: '2026-09-01' },
      { no_pesanan: 'PENDING', status_pesanan: 'Sedang Dikirim', nomor_referensi_sku: 'REF-1', sku_induk: '', jumlah: 1, waktu_pesanan_selesai: null, waktu_pesanan_dibuat: '2026-09-01' },
    ],
  });
  assert.equal(report.summary.completedUnsettled, 1);
  assert.equal(report.summary.pending, 1);
  assert.equal(report.orders.find((order) => order.no_pesanan === 'COMPLETED-UNSETTLED').bucket, 'completed_unsettled');
});

test('Settlement and My Balance reconciliation keeps negative ledger events audit-only', () => {
  const report = buildSettlementBalanceReconciliation({
    orderRows: [{ no_pesanan: 'REVERSAL', status_pesanan: 'Selesai', waktu_pesanan_dibuat: '2026-08-20', jumlah: 1, returned_quantity: 0 }],
    incomeRows: [{ no_pesanan: 'REVERSAL', signed_total: 70000, tanggal_dana_dilepaskan: '2026-08-25', source_file: 'income.xlsx', source_excel_row: 2 }],
    balanceRows: [
      { no_pesanan: 'REVERSAL', transaction_at: '2026-08-25 10:00:00', type_transaksi: 'Penghasilan dari Pesanan', jenis_transaksi: 'Transaksi Masuk', jumlah_signed: 70000, description: 'Penghasilan dari Pesanan #REVERSAL', status: 'Transaksi Selesai', saldo_akhir: 500000, source_file: 'balance.xlsx', source_excel_row: 10 },
      { no_pesanan: 'REVERSAL', transaction_at: '2026-08-27 10:00:00', type_transaksi: 'Penghasilan dari Pesanan', jenis_transaksi: 'Transaksi Keluar', jumlah_signed: -70000, description: 'Penghasilan dari Pesanan #REVERSAL', status: 'Transaksi Selesai', saldo_akhir: 430000, source_file: 'balance.xlsx', source_excel_row: 11 },
    ],
    exceptionRows: [],
  });
  assert.equal(report.summary.incomeSettlement, 70000);
  assert.equal(report.summary.balanceOrderIncomeIn, 70000);
  assert.equal(report.summary.balanceOrderIncomeOut, -70000);
  assert.equal(report.summary.balanceNet, 0);
  assert.equal(report.summary.reversal, 1);
  assert.equal(report.rows[0].reconciliationStatus, 'Ada pembalikan saldo');
  assert.equal(report.rows[0].events.length, 3);
});

test('My Balance analysis keeps wallet top-up, withdrawal, order corrections, and Ads spend in separate read-only taxonomy buckets', () => {
  const report = buildMyBalanceAnalysis({
    dateFrom: '2026-08-01', dateTo: '2026-08-31',
    balanceRows: [
      { transaction_at: '2026-08-02 10:00:00', type_transaksi: 'Pembayaran dengan Saldo Penjual', jenis_transaksi: 'Transaksi Keluar', status: 'Transaksi Selesai', description: 'Isi Ulang Saldo Iklan/Koin Penjual', jumlah_signed: -50000 },
      { transaction_at: '2026-08-03 10:00:00', type_transaksi: 'Penarikan Dana', jenis_transaksi: 'Transaksi Keluar', status: 'Transaksi Selesai', description: 'Penarikan Dana', jumlah_signed: -100000 },
      { transaction_at: '2026-08-04 10:00:00', type_transaksi: 'Penyesuaian', jenis_transaksi: 'Transaksi Keluar', status: 'Transaksi Selesai', description: 'Biaya premi gagal terkirim', no_pesanan_direct: 'ORDER-1', jumlah_signed: -400 },
    ],
    adsRows: [
      { ads_report_import_id: 1, sequence_number: '1', transaction_date: '2026-08-02', description: 'Deduction for Product Ad (Auto Bidding - GMV Max)', jumlah_signed: -700 },
      { ads_report_import_id: 1, sequence_number: '2', transaction_date: '2026-08-03', description: 'Pengurangan untuk Iklan Toko (Bidding Manual)', jumlah_signed: -300 },
      { transaction_date: '2026-08-04', description: 'Isi Saldo', jumlah_signed: 1000 },
    ],
  });
  const byKey = Object.fromEntries(report.categories.map((item) => [item.key, item]));
  assert.equal(byKey.ads_wallet_topup.net, -50000);
  assert.equal(byKey.withdrawal.net, -100000);
  assert.equal(byKey.order_adjustment.net, -400);
  assert.equal(byKey.ads_actual.net, -1000);
  assert.equal(report.ads.gmvMax, 700);
  assert.equal(report.ads.manual, 300);
  assert.equal(report.ads.total, 1000);
  assert.equal(report.ads.walletCredit, 1000);
  assert.equal(report.ads.walletCreditRows, 1);
  assert.equal(report.adsWallet.grossTopup, 50000);
  assert.equal(report.adsWallet.walletCredit, 1000);
  assert.equal(report.adsWallet.ppnTopup, 49000);
  assert.equal(report.adsWallet.walletMovement, 0);
  assert.equal(report.rows.length, 3);
});

test('Profit page exposes an additive Profit Aktual panel while Estimasi Kotor stays present', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'app/profit/page.tsx'), 'utf8');
  const panel = fs.readFileSync(path.resolve(process.cwd(), 'components/ProfitActualPanel.tsx'), 'utf8');
  assert.match(source, /Estimasi Kotor/);
  assert.match(source, /Profit Pesanan/);
  assert.match(source, /view="orders"/);
  assert.match(source, /ProfitActualPanel/);
  assert.match(panel, /\/api\/profit-calculation/);
  assert.match(panel, /Cohort Pesanan/);
  assert.match(panel, /Berdasarkan Waktu Pesanan Dibuat/);
  assert.match(panel, /Filter Settlement/);
  assert.match(panel, /Berdasarkan Tanggal Dana Dilepaskan/);
  assert.match(panel, /releaseDateFrom/);
  assert.match(panel, /releaseDateTo/);
  assert.match(panel, /Mode: irisan cohort order \+ cash release/);
  assert.match(panel, /Penghasilan \/ Order/);
  assert.match(source, /Retur & Refund/);
  assert.match(source, /Rekonsiliasi My Balance/);
  assert.match(source, /My Balance Analisis/);
  assert.match(source, /MyBalanceAnalysisPanel/);
  const balanceAnalysisRoute = fs.readFileSync(path.resolve(process.cwd(), 'app/api/my-balance-analysis/route.ts'), 'utf8');
  const balanceAnalysisPanel = fs.readFileSync(path.resolve(process.cwd(), 'components/MyBalanceAnalysisPanel.tsx'), 'utf8');
  assert.match(balanceAnalysisRoute, /requireStoreId/);
  assert.match(balanceAnalysisRoute, /balance_transactions_raw/);
  assert.match(balanceAnalysisRoute, /ads_transactions_raw/);
  assert.doesNotMatch(balanceAnalysisRoute, /INSERT INTO|UPDATE |DELETE FROM/);
  assert.match(balanceAnalysisPanel, /Saldo Iklan\/Koin/);
  assert.match(balanceAnalysisPanel, /Ads Aktual Store\/Day/);
  assert.match(balanceAnalysisPanel, /order\/SKU/);
  assert.match(balanceAnalysisPanel, /Wallet Ads\/Koin & PPN/);
  assert.match(balanceAnalysisPanel, /Kredit Wallet dari Ads RAW/);
  assert.match(balanceAnalysisPanel, /PPN Top-up Wallet/);
  assert.match(source, /SettlementBalanceReconciliationPanel/);
  const reconciliationRoute = fs.readFileSync(path.resolve(process.cwd(), 'app/api/settlement-balance-reconciliation/route.ts'), 'utf8');
  const reconciliationPanel = fs.readFileSync(path.resolve(process.cwd(), 'components/SettlementBalanceReconciliationPanel.tsx'), 'utf8');
  assert.match(reconciliationRoute, /requireStoreId/);
  assert.match(reconciliationRoute, /balance_transactions_raw/);
  assert.match(reconciliationRoute, /income_penghasilan_raw/);
  assert.doesNotMatch(reconciliationRoute, /INSERT INTO|UPDATE |DELETE FROM/);
  assert.match(reconciliationPanel, /Rekonsiliasi Settlement & My Balance/);
  assert.match(reconciliationPanel, /Lihat detail/);
  assert.match(reconciliationPanel, /My Balance · Penghasilan Keluar/);
  assert.match(panel, /Profit Aktual Normal/);
  assert.match(panel, /Profit Retur Parsial/);
  assert.match(panel, /Estimasi Order Belum Selesai/);
  assert.match(panel, /Pesanan Belum Selesai/);
  assert.match(panel, /PCS Belum Selesai/);
  assert.match(panel, /Nominal Belum Selesai/);
  assert.match(panel, /Estimasi Profit Belum Selesai/);
  assert.match(panel, /Total Pembayaran per order/);
  assert.match(panel, /Estimasi Kotor tanpa Ads; bukan profit aktual/);
  assert.match(panel, /Cakupan Finansial/);
  assert.match(panel, /Settlement Tercatat/);
  assert.match(panel, /Hasil Finansial Final/);
  assert.match(panel, /Hasil Finansial Terhitung/);
  assert.match(panel, /Cakupan Cash/);
  assert.match(panel, /Belum Ada Jawaban/);
  assert.match(panel, /\['unresolved', 'Belum Ada Jawaban'\]/);
  assert.match(panel, /\['settled_normal', 'partial_return_provisional', 'partial_return_final_restock', 'full_return_cash_final_negative', 'full_return_cash_final_positive', 'batal'\]/);
  assert.match(panel, /Profit Retur Parsial Final/);
  assert.match(panel, /partial_return_final_restock/);
  assert.match(panel, /Loss\/Biaya Retur Final/);
  assert.match(panel, /returnFinalCost/);
  assert.match(panel, /financialFinalOutcome/);
  assert.match(panel, /Kompensasi Return Final/);
  assert.match(panel, /fullReturnCashFinalNegativeOutcome/);
  assert.match(panel, /fullReturnCashFinalPositiveOutcome/);
  assert.match(panel, /Batal Sebelum Pengiriman/);
  assert.match(panel, /Batal Setelah Pengiriman Gagal/);
  assert.match(panel, /cancelledBeforeShipment/);
  assert.match(panel, /cancelledAfterFailedDelivery/);
  assert.match(panel, /cancellationSubstatus/);
  assert.match(panel, /No\. Resi/);
  assert.match(panel, /Pengiriman diatur/);
  assert.match(panel, /settlementRecorded/);
  assert.match(panel, /profitComputable/);
  assert.match(panel, /unresolvedOrders/);
  assert.match(panel, /Mutasi My Balance Keluar/);
  assert.match(panel, /balance_outgoing/);
  assert.match(panel, /balanceOutgoingTotal/);
  assert.match(panel, /balanceOutgoingOrders/);
  assert.match(panel, /Dana Dilepas/);
  assert.match(panel, /Margin/);
  assert.match(panel, /balanceOutgoingReason/);
  assert.match(panel, /order dimuat/);
  assert.match(panel, /Penghasilan keluar/);
  assert.match(panel, /Penyesuaian keluar/);
  assert.match(panel, /audit cashflow, bukan profit final/);
  assert.match(panel, /cashCoveredPcs/);
  assert.match(panel, /settledNormalPcs/);
  assert.match(panel, /pcs terjual/);
  assert.match(panel, /pcs retur/);
  assert.match(panel, /Menunggu Settlement/);
  assert.match(panel, /Perlu Audit/);
  assert.match(panel, /partial_return_provisional/);
  assert.match(panel, /My Balance keluar/);
  assert.match(panel, /Retur parsial belum memenuhi rekonsiliasi cash/);
  assert.match(panel, /stok retur diasumsikan tetap persediaan/);
  assert.match(panel, /pcs stok retur diasumsikan/);
  assert.match(panel, /Nilai minus adalah profit yang sudah terhitung/);
  assert.match(panel, /strip berarti belum aman dihitung/);
  assert.match(panel, /Cakupan Cohort/);
  assert.match(panel, /Pesanan unik/);
  assert.match(panel, /Total pcs/);
  assert.match(panel, /cohortOrders/);
  assert.match(panel, /cohortPcs/);
  assert.match(panel, /sebelum filter settlement/);
  assert.match(panel, /Lihat detail/);
  assert.match(panel, /Item order/);
  assert.match(panel, /Status retur/);
  assert.match(source, /view="orders"/);
  assert.match(source, /view="returns"/);
  assert.match(panel, /settled_normal:/);
  assert.match(panel, /completed_unsettled:/);
  assert.match(panel, /exception:/);
  assert.match(panel, /dateFrom/);
  assert.match(panel, /dateTo/);
  assert.match(panel, /new URLSearchParams\(\{ storeId, dateFrom, dateTo \}\)/);
  assert.match(panel, /Return QC Internal/);
  assert.match(panel, /Pilih semua Return/);
  assert.match(panel, /Terapkan QC Terpilih/);
  assert.match(panel, /Asumsi bulk stok oleh user/);
  assert.match(panel, /api\/return-qc/);
  const returnQcRoute = fs.readFileSync(path.resolve(process.cwd(), 'app/api/return-qc/route.ts'), 'utf8');
  assert.match(returnQcRoute, /returns/);
  assert.match(returnQcRoute, /unique.length > 500/);
  assert.match(returnQcRoute, /Catatan wajib untuk keputusan bulk/);
  assert.match(returnQcRoute, /beginTransaction/);
  assert.match(returnQcRoute, /return_qc_decisions/);
  assert.match(panel, /max-h-\[520px\] overflow-auto/);
  assert.match(panel, /sticky top-0/);
});
