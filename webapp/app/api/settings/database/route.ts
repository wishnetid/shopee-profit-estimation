import { NextRequest, NextResponse } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { getConnection } from '@/lib/db';
import { requireStoreId } from '../../../../lib/store';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  isMutationAuthorized,
  isSameOriginMutation,
} = require('../../../../lib/dashboard-auth.js') as {
  isMutationAuthorized: (authorization: string | null, env?: NodeJS.ProcessEnv) => boolean;
  isSameOriginMutation: (origin: string | null, expectedOrigin: string) => boolean;
};

function unauthorizedResponse() {
  return NextResponse.json(
    { success: false, error: 'Authentication required.' },
    { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="Shopee Profit Estimation"' } },
  );
}

function isAuthorized(request: NextRequest) {
  return isMutationAuthorized(request.headers.get('authorization'));
}

export async function GET(request: NextRequest) {
  const storeCheck = await requireStoreId(request.nextUrl.searchParams.get('storeId'));
  if (storeCheck.response) return storeCheck.response;
  const storeId = storeCheck.storeId as number;
  const conn = await getConnection();
  try {
    const [storeRows] = await conn.execute(
      'SELECT id, store_name, store_slug FROM stores WHERE id = ? LIMIT 1',
      [storeId],
    ) as any;
    const [counts] = await conn.execute(`
      SELECT 'order_all' AS name, COUNT(*) AS row_count, 'store' AS scope FROM order_all WHERE store_id = ?
      UNION ALL
      SELECT 'income_report_imports', COUNT(*), 'store' FROM income_report_imports WHERE store_id = ?
      UNION ALL
      SELECT 'income_penghasilan_raw', COUNT(*), 'store'
        FROM income_penghasilan_raw r JOIN income_report_imports i ON i.id = r.income_report_import_id WHERE i.store_id = ?
      UNION ALL
      SELECT 'income_adjustments_raw', COUNT(*), 'store'
        FROM income_adjustments_raw r JOIN income_report_imports i ON i.id = r.income_report_import_id WHERE i.store_id = ?
      UNION ALL
      SELECT 'income_shipping_fee_discrepancies_raw', COUNT(*), 'store'
        FROM income_shipping_fee_discrepancies_raw r JOIN income_report_imports i ON i.id = r.income_report_import_id WHERE i.store_id = ?
      UNION ALL
      SELECT 'sku_report_imports', COUNT(*), 'shared' FROM sku_report_imports
      UNION ALL
      SELECT 'sku_master_raw', COUNT(*), 'shared' FROM sku_master_raw
    `, [storeId, storeId, storeId, storeId, storeId]) as any;
    return NextResponse.json({ success: true, store: storeRows[0], tables: counts.map((row: any) => ({ name: row.name, rows: Number(row.row_count), scope: row.scope })) });
  } catch {
    return NextResponse.json({ success: false, error: 'Database request failed.' }, { status: 500 });
  } finally {
    conn.release();
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorizedResponse();
  if (!isSameOriginMutation(request.headers.get('origin'), request.nextUrl.origin)) {
    return NextResponse.json({ success: false, error: 'Cross-origin request rejected.' }, { status: 403 });
  }

  let body: { action?: string; storeId?: unknown; confirmation?: boolean };
  try {
    body = await request.json() as { action?: string; storeId?: unknown; confirmation?: boolean };
  } catch {
    return NextResponse.json({ success: false, error: 'Malformed JSON.' }, { status: 400 });
  }
  if (body.confirmation !== true) {
    return NextResponse.json({ success: false, error: 'Reset membutuhkan konfirmasi eksplisit.' }, { status: 400 });
  }

  if (body.action === 'clear_shared_sku') {
    const conn = await getConnection();
    try {
      await conn.beginTransaction();
      const [beforeRows] = await conn.execute<(RowDataPacket & { sku_import_count: number; sku_master_count: number })[]>(`
        SELECT
          (SELECT COUNT(*) FROM sku_report_imports) AS sku_import_count,
          (SELECT COUNT(*) FROM sku_master_raw) AS sku_master_count
      `);
      const before = beforeRows[0];

      await conn.execute('DELETE FROM sku_master_raw');
      await conn.execute('DELETE FROM sku_report_imports');
      await conn.commit();

      return NextResponse.json({
        success: true,
        message: 'Master SKU shared berhasil di-reset untuk semua toko.',
        removed: Object.fromEntries(Object.entries(before).map(([key, value]) => [key, Number(value)])),
      });
    } catch (error) {
      await conn.rollback();
      return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Reset Master SKU shared gagal.' }, { status: 500 });
    } finally {
      conn.release();
    }
  }

  if (body.action !== 'clear_store') {
    return NextResponse.json({ success: false, error: 'Aksi reset tidak dikenali.' }, { status: 400 });
  }
  const storeCheck = await requireStoreId(body.storeId == null ? null : String(body.storeId));
  if (storeCheck.response) return storeCheck.response;
  const storeId = storeCheck.storeId as number;
  const conn = await getConnection();

  try {
    await conn.beginTransaction();
    const [beforeRows] = await conn.execute(`
      SELECT
        (SELECT COUNT(*) FROM order_all WHERE store_id = ?) AS order_count,
        (SELECT COUNT(*) FROM income_report_imports WHERE store_id = ?) AS income_package_count,
        (SELECT COUNT(*) FROM income_penghasilan_raw r JOIN income_report_imports i ON i.id = r.income_report_import_id WHERE i.store_id = ?) AS income_penghasilan_count,
        (SELECT COUNT(*) FROM income_adjustments_raw r JOIN income_report_imports i ON i.id = r.income_report_import_id WHERE i.store_id = ?) AS income_adjustment_count,
        (SELECT COUNT(*) FROM income_shipping_fee_discrepancies_raw r JOIN income_report_imports i ON i.id = r.income_report_import_id WHERE i.store_id = ?) AS income_shipping_count
    `, [storeId, storeId, storeId, storeId, storeId]) as any;
    const before = beforeRows[0];

    await conn.execute('DELETE FROM income_penghasilan_raw WHERE income_report_import_id IN (SELECT id FROM income_report_imports WHERE store_id = ?)', [storeId]);
    await conn.execute('DELETE FROM income_adjustments_raw WHERE income_report_import_id IN (SELECT id FROM income_report_imports WHERE store_id = ?)', [storeId]);
    await conn.execute('DELETE FROM income_shipping_fee_discrepancies_raw WHERE income_report_import_id IN (SELECT id FROM income_report_imports WHERE store_id = ?)', [storeId]);
    await conn.execute('DELETE FROM income_report_imports WHERE store_id = ?', [storeId]);
    await conn.execute('DELETE FROM order_all WHERE store_id = ?', [storeId]);
    await conn.commit();

    return NextResponse.json({
      success: true,
      message: `Data operasional toko berhasil di-clear. Master SKU shared tetap aman.`,
      storeId,
      removed: Object.fromEntries(Object.entries(before).map(([key, value]) => [key, Number(value)])),
    });
  } catch (error) {
    await conn.rollback();
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Clear toko gagal.' }, { status: 500 });
  } finally {
    conn.release();
  }
}
