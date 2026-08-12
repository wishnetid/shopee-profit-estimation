import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const routePath = new URL('../app/api/profit-estimation/route.ts', import.meta.url);

test('profit estimation route is a dynamic, Node-only, store-scoped GET that preserves the actual-profit guard boundary', async () => {
  const source = await readFile(routePath, 'utf8');

  assert.match(source, /export const dynamic = 'force-dynamic';/);
  assert.match(source, /export const runtime = 'nodejs';/);
  assert.match(source, /export async function GET\(request: NextRequest\)/);
  assert.match(source, /requireStoreId\(sp\.get\('storeId'\)\)/);
  assert.match(source, /validateDateRange\(sp\.get\('dateFrom'\), sp\.get\('dateTo'\)\)/);
  assert.match(source, /buildEstimationReport\(/);
  assert.match(source, /o\.store_id = \?/);
  assert.match(source, /i\.store_id = \?/);
  assert.match(source, /DATE\(scoped\.waktu_pesanan_dibuat\) >= \?/);
  assert.match(source, /INNER JOIN \(\s*SELECT DISTINCT\s*scoped\.store_id,[\s\S]*FROM order_all scoped/);
  assert.match(source, /scoped_orders\.store_id = o\.store_id\s*AND scoped_orders\.selected_order_key = CASE/);
  assert.match(source, /o\.returned_quantity/);
  assert.match(source, /r\.transaction_date >= \?/);
  assert.match(source, /FROM order_cancellation_raw r/);
  assert.match(source, /FROM order_return_refund_raw r/);
  assert.match(source, /FROM order_failed_delivery_raw r/);
  assert.match(source, /exceptionOrderNumbers: exceptionOrderRows\.map/);
  assert.match(source, /FROM income_penghasilan_raw recent_income/);
  assert.match(source, /recent_import\.store_id = \?/);
  assert.match(source, /recent_import\.imported_at > i\.imported_at/);
  assert.match(source, /recent_income\.id > r\.id/);
  assert.match(source, /r\.lihat_berdasarkan = 'Order'/);
  assert.match(source, /historicalOrderRows,/);
  assert.match(source, /settlementRows,/);
  assert.doesNotMatch(source, /\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE)\b/i);
});

test('profit estimation route queries source-calendar dates as SQL strings so browser ISO serialization cannot shift daily grouping', async () => {
  const source = await readFile(routePath, 'utf8');

  assert.match(source, /DATE_FORMAT\(o\.waktu_pesanan_dibuat, '%Y-%m-%d %H:%i:%s'\)/);
  assert.match(source, /r\.ads_report_import_id,/);
  assert.match(source, /DATE_FORMAT\(r\.transaction_date, '%Y-%m-%d'\)/);
  assert.match(source, /ORDER BY imported_at DESC, id DESC\s+LIMIT 1/);
});
