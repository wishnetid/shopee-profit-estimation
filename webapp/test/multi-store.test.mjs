import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import pagination from '../lib/pagination.js';

const { parsePagination } = pagination;

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

test('Settings API keeps store reset scoped and rejects unknown reset actions', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'app/api/settings/database/route.ts'), 'utf8');
  assert.match(source, /body\.action !== ['"]clear_store['"]/);
  assert.match(source, /DELETE FROM order_all WHERE store_id = \?/);
  assert.match(source, /DELETE FROM income_report_imports WHERE store_id = \?/);
  assert.doesNotMatch(source, /DELETE FROM balance_transactions_raw/);
  assert.doesNotMatch(source, /DELETE FROM balance_report_imports/);
  assert.doesNotMatch(source, /DELETE FROM order_cancellation_report_imports/);
  assert.doesNotMatch(source, /DELETE FROM order_failed_delivery_report_imports/);
  assert.doesNotMatch(source, /DELETE FROM order_return_refund_report_imports/);
  assert.doesNotMatch(source, /DELETE FROM ads_transactions_raw/);
  assert.doesNotMatch(source, /DELETE FROM ads_report_imports/);
  assert.match(source, /Aksi reset tidak dikenali/);
  assert.doesNotMatch(source, /TRUNCATE TABLE/);
  assert.doesNotMatch(source, /clear_all/);
});

test('RAW packages block store deletion but stay outside the legacy clear-store action', () => {
  const stores = fs.readFileSync(path.resolve(process.cwd(), 'app/api/stores/route.ts'), 'utf8');
  const page = fs.readFileSync(path.resolve(process.cwd(), 'app/settings/page.tsx'), 'utf8');
  assert.match(stores, /balance_package_count/);
  assert.match(stores, /cancellation_package_count/);
  assert.match(stores, /failed_delivery_package_count/);
  assert.match(stores, /return_refund_package_count/);
  assert.match(stores, /ads_package_count/);
  assert.match(page, /Tombol clear toko hanya menghapus Order\.all dan package Income/);
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
  assert.ok(Number(storeCount) >= 2, 'multi-store fixture must contain at least two stores');

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
    .filter(row => Number(row.Non_unique) === 0 && row.Key_name === 'uk_order_item_store')
    .sort((left, right) => Number(left.Seq_in_index) - Number(right.Seq_in_index))
    .map(row => row.Column_name);
  assert.deepEqual(orderColumns, ['store_id', 'no_pesanan', 'nomor_referensi_sku', 'nama_variasi']);

  const [incomeIndexes] = await connection.query('SHOW INDEX FROM income_report_imports');
  const incomeColumns = incomeIndexes
    .filter(row => Number(row.Non_unique) === 0 && row.Key_name === 'uk_income_report_import_store_sha256')
    .sort((left, right) => Number(left.Seq_in_index) - Number(right.Seq_in_index))
    .map(row => row.Column_name);
  assert.deepEqual(incomeColumns, ['store_id', 'source_sha256']);
});

test('legacy profit API routes are disabled until the RAW financial contract is approved', () => {
  const route = fs.readFileSync(path.resolve(process.cwd(), 'app/api/profit-calculation/route.ts'), 'utf8');
  const summaryRoute = fs.readFileSync(path.resolve(process.cwd(), 'app/api/profit-calculation/summary/route.ts'), 'utf8');
  assert.match(route, /PROFIT_NOT_READY/);
  assert.match(summaryRoute, /PROFIT_NOT_READY/);
  assert.doesNotMatch(route, /FROM orders/);
  assert.doesNotMatch(summaryRoute, /FROM orders/);
});

test('Profit page clearly marks the financial layer as unavailable', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'app/profit/page.tsx'), 'utf8');
  assert.match(source, /PROFIT_NOT_READY|belum tersedia/i);
  assert.match(source, /Balance|HPP|return|refund/i);
  assert.doesNotMatch(source, /Net Payout - HPP/);
});
