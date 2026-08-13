import { NextRequest, NextResponse } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { getConnection } from '@/lib/db';
import { requireStoreId } from '../../../../lib/store';

const {
  isMutationAuthorized,
  isSameOriginMutation,
  isValidBasicAuthorization,
// eslint-disable-next-line @typescript-eslint/no-require-imports
} = require('../../../../lib/dashboard-auth.js') as {
  isMutationAuthorized: (authorization: string | null, cookieHeader?: string | null, env?: NodeJS.ProcessEnv) => boolean;
  isSameOriginMutation: (origin: string | null, expectedOrigin: string) => boolean;
  isValidBasicAuthorization: (authorization: string | null, username?: string, password?: string) => boolean;
};

function unauthorizedResponse() {
  return NextResponse.json(
    { success: false, error: 'Authentication required.' },
    { status: 401 },
  );
}

function isAuthorized(request: NextRequest) {
  return isMutationAuthorized(request.headers.get('authorization'), request.headers.get('cookie'));
}

function isTrustedBasicApiClient(request: NextRequest) {
  return isValidBasicAuthorization(
    request.headers.get('authorization'),
    process.env.DASHBOARD_BASIC_AUTH_USER,
    process.env.DASHBOARD_BASIC_AUTH_PASSWORD,
  );
}

export async function GET(request: NextRequest) {
  const storeCheck = await requireStoreId(request.nextUrl.searchParams.get('storeId'));
  if (storeCheck.response) return storeCheck.response;
  const storeId = storeCheck.storeId as number;
  const conn = await getConnection();
  try {
    const [storeRows] = await conn.execute<Array<RowDataPacket & { id: number; store_name: string; store_slug: string }>>(
      'SELECT id, store_name, store_slug FROM stores WHERE id = ? LIMIT 1',
      [storeId],
    );
    const [counts] = await conn.execute<Array<RowDataPacket & { name: string; row_count: number; scope: string }>>(`
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
      SELECT 'balance_report_imports', COUNT(*), 'store' FROM balance_report_imports WHERE store_id = ?
      UNION ALL
      SELECT 'balance_transactions_raw', COUNT(*), 'store' FROM balance_transactions_raw r JOIN balance_report_imports i ON i.id = r.balance_report_import_id WHERE i.store_id = ?
      UNION ALL
      SELECT 'order_cancellation_report_imports', COUNT(*), 'store' FROM order_cancellation_report_imports WHERE store_id = ?
      UNION ALL
      SELECT 'order_failed_delivery_report_imports', COUNT(*), 'store' FROM order_failed_delivery_report_imports WHERE store_id = ?
      UNION ALL
      SELECT 'order_return_refund_report_imports', COUNT(*), 'store' FROM order_return_refund_report_imports WHERE store_id = ?
      UNION ALL
      SELECT 'ads_report_imports', COUNT(*), 'store' FROM ads_report_imports WHERE store_id = ?
      UNION ALL
      SELECT 'ads_transactions_raw', COUNT(*), 'store' FROM ads_transactions_raw r JOIN ads_report_imports i ON i.id = r.ads_report_import_id WHERE i.store_id = ?
      UNION ALL
      SELECT 'sku_report_imports', COUNT(*), 'shared' FROM sku_report_imports
      UNION ALL
      SELECT 'sku_master_raw', COUNT(*), 'shared' FROM sku_master_raw
    `, [storeId, storeId, storeId, storeId, storeId, storeId, storeId, storeId, storeId, storeId, storeId, storeId]);
    return NextResponse.json({ success: true, store: storeRows[0], tables: counts.map((row) => ({ name: row.name, rows: Number(row.row_count), scope: row.scope })) });
  } catch {
    return NextResponse.json({ success: false, error: 'Database request failed.' }, { status: 500 });
  } finally {
    conn.release();
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorizedResponse();
  const basicApiAuthorized = isTrustedBasicApiClient(request);
  if (!basicApiAuthorized && !isSameOriginMutation(request.headers.get('origin'), request.nextUrl.origin)) {
    return NextResponse.json({ success: false, error: 'Cross-origin request rejected.' }, { status: 403 });
  }

  let body: { action?: string; storeId?: unknown; confirmation?: boolean };
  try {
    const payload = await request.json() as unknown;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return NextResponse.json({ success: false, error: 'Malformed JSON.' }, { status: 400 });
    }
    body = payload as { action?: string; storeId?: unknown; confirmation?: boolean };
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
    const [beforeRows] = await conn.execute<Array<RowDataPacket & Record<string, number>>>(`
      SELECT
        (SELECT COUNT(*) FROM order_all WHERE store_id = ?) AS order_count,
        (SELECT COUNT(*) FROM income_report_imports WHERE store_id = ?) AS income_package_count,
        (SELECT COUNT(*) FROM income_penghasilan_raw r JOIN income_report_imports i ON i.id = r.income_report_import_id WHERE i.store_id = ?) AS income_penghasilan_count,
        (SELECT COUNT(*) FROM income_adjustments_raw r JOIN income_report_imports i ON i.id = r.income_report_import_id WHERE i.store_id = ?) AS income_adjustment_count,
        (SELECT COUNT(*) FROM income_shipping_fee_discrepancies_raw r JOIN income_report_imports i ON i.id = r.income_report_import_id WHERE i.store_id = ?) AS income_shipping_count,
        (SELECT COUNT(*) FROM balance_report_imports WHERE store_id = ?) AS balance_package_count,
        (SELECT COUNT(*) FROM balance_transactions_raw r JOIN balance_report_imports i ON i.id = r.balance_report_import_id WHERE i.store_id = ?) AS balance_transaction_count,
        (SELECT COUNT(*) FROM order_cancellation_report_imports WHERE store_id = ?) AS cancellation_package_count,
        (SELECT COUNT(*) FROM order_cancellation_raw r JOIN order_cancellation_report_imports i ON i.id = r.order_cancellation_report_import_id WHERE i.store_id = ?) AS cancellation_row_count,
        (SELECT COUNT(*) FROM order_failed_delivery_report_imports WHERE store_id = ?) AS failed_delivery_package_count,
        (SELECT COUNT(*) FROM order_failed_delivery_raw r JOIN order_failed_delivery_report_imports i ON i.id = r.order_failed_delivery_report_import_id WHERE i.store_id = ?) AS failed_delivery_row_count,
        (SELECT COUNT(*) FROM order_return_refund_report_imports WHERE store_id = ?) AS return_refund_package_count,
        (SELECT COUNT(*) FROM order_return_refund_raw r JOIN order_return_refund_report_imports i ON i.id = r.order_return_refund_report_import_id WHERE i.store_id = ?) AS return_refund_row_count,
        (SELECT COUNT(*) FROM ads_report_imports WHERE store_id = ?) AS ads_package_count,
        (SELECT COUNT(*) FROM ads_transactions_raw r JOIN ads_report_imports i ON i.id = r.ads_report_import_id WHERE i.store_id = ?) AS ads_transaction_count
    `, Array(15).fill(storeId));
    const before = beforeRows[0];

    await conn.execute('DELETE FROM income_penghasilan_raw WHERE income_report_import_id IN (SELECT id FROM income_report_imports WHERE store_id = ?)', [storeId]);
    await conn.execute('DELETE FROM income_adjustments_raw WHERE income_report_import_id IN (SELECT id FROM income_report_imports WHERE store_id = ?)', [storeId]);
    await conn.execute('DELETE FROM income_shipping_fee_discrepancies_raw WHERE income_report_import_id IN (SELECT id FROM income_report_imports WHERE store_id = ?)', [storeId]);
    await conn.execute('DELETE FROM income_report_imports WHERE store_id = ?', [storeId]);

    await conn.execute('DELETE FROM balance_transactions_raw WHERE balance_report_import_id IN (SELECT id FROM balance_report_imports WHERE store_id = ?)', [storeId]);
    await conn.execute('DELETE FROM balance_report_imports WHERE store_id = ?', [storeId]);

    await conn.execute('DELETE FROM order_cancellation_raw WHERE order_cancellation_report_import_id IN (SELECT id FROM order_cancellation_report_imports WHERE store_id = ?)', [storeId]);
    await conn.execute('DELETE FROM order_cancellation_report_imports WHERE store_id = ?', [storeId]);

    await conn.execute('DELETE FROM order_failed_delivery_raw WHERE order_failed_delivery_report_import_id IN (SELECT id FROM order_failed_delivery_report_imports WHERE store_id = ?)', [storeId]);
    await conn.execute('DELETE FROM order_failed_delivery_report_imports WHERE store_id = ?', [storeId]);

    await conn.execute('DELETE FROM order_return_refund_raw WHERE order_return_refund_report_import_id IN (SELECT id FROM order_return_refund_report_imports WHERE store_id = ?)', [storeId]);
    await conn.execute('DELETE FROM order_return_refund_report_imports WHERE store_id = ?', [storeId]);

    await conn.execute('DELETE FROM ads_transactions_raw WHERE ads_report_import_id IN (SELECT id FROM ads_report_imports WHERE store_id = ?)', [storeId]);
    await conn.execute('DELETE FROM ads_report_imports WHERE store_id = ?', [storeId]);

    await conn.execute('DELETE FROM order_all WHERE store_id = ?', [storeId]);
    await conn.commit();

    return NextResponse.json({
      success: true,
      message: `Seluruh data operasional toko berhasil dihapus. Master SKU shared tetap aman.`,
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
