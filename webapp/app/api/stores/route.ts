import { NextRequest, NextResponse } from 'next/server';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { getConnection, getPool, withTransaction } from '@/lib/db';
import { requireStoreId } from '../../../lib/store';

const {
  isMutationAuthorized,
  isSameOriginMutation,
// eslint-disable-next-line @typescript-eslint/no-require-imports
} = require('../../../lib/dashboard-auth.js') as {
  isMutationAuthorized: (authorization: string | null, env?: NodeJS.ProcessEnv) => boolean;
  isSameOriginMutation: (origin: string | null, expectedOrigin: string) => boolean;
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const clean = (value: unknown) => typeof value === 'string' ? value.trim() : '';

export async function GET() {
  try {
    const [stores] = await getPool().query<RowDataPacket[]>(`
      SELECT
        s.id,
        s.store_name,
        s.store_slug,
        s.created_at,
        (SELECT COUNT(*) FROM order_all o WHERE o.store_id = s.id) AS order_count,
        (SELECT COUNT(*) FROM income_report_imports i WHERE i.store_id = s.id) AS income_package_count
      FROM stores s
      ORDER BY s.store_name ASC
    `);
    return NextResponse.json({ success: true, stores });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Database error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isMutationAuthorized(request.headers.get('authorization'))) {
      return NextResponse.json(
        { error: 'Authentication required.' },
        { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="Shopee Profit Estimation"' } },
      );
    }
    if (!isSameOriginMutation(request.headers.get('origin'), request.nextUrl.origin)) {
      return NextResponse.json({ error: 'Cross-origin request rejected.' }, { status: 403 });
    }

    let body: { storeName?: unknown; storeSlug?: unknown };
    try {
      body = await request.json() as { storeName?: unknown; storeSlug?: unknown };
    } catch {
      return NextResponse.json({ error: 'Malformed JSON.' }, { status: 400 });
    }
    const storeName = clean(body.storeName);
    const storeSlug = clean(body.storeSlug).toLowerCase();

    if (!storeName || storeName.length > 160) {
      return NextResponse.json({ error: 'Nama toko wajib diisi, maksimal 160 karakter.' }, { status: 400 });
    }
    if (!slugPattern.test(storeSlug) || storeSlug.length > 80) {
      return NextResponse.json({ error: 'Slug toko wajib huruf kecil, angka, dan strip; contoh: tacticality.' }, { status: 400 });
    }

    const result = await withTransaction(async connection => {
      let ownerUserId: number;
      const [rows] = await connection.query<RowDataPacket[]>('SELECT id FROM users ORDER BY id ASC LIMIT 1');
      if (rows.length) ownerUserId = Number(rows[0].id);
      else {
        const [created] = await connection.execute<ResultSetHeader>(
          'INSERT INTO users (username, display_name) VALUES (?, ?)',
          ['yogaimawan', 'Yogi Imawan'],
        );
        ownerUserId = Number(created.insertId);
      }
      const [created] = await connection.execute<ResultSetHeader>(
        'INSERT INTO stores (owner_user_id, store_name, store_slug) VALUES (?, ?, ?)',
        [ownerUserId, storeName, storeSlug],
      );
      return { storeId: Number(created.insertId), ownerUserId };
    });
    return NextResponse.json({ success: true, ...result }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Pembuatan toko gagal.';
    return NextResponse.json({ error: /Duplicate entry/i.test(message) ? 'Slug toko sudah dipakai.' : message }, { status: /Duplicate entry/i.test(message) ? 409 : 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!isMutationAuthorized(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="Shopee Profit Estimation"' } });
  }
  if (!isSameOriginMutation(request.headers.get('origin'), request.nextUrl.origin)) {
    return NextResponse.json({ error: 'Cross-origin request rejected.' }, { status: 403 });
  }

  let body: { storeId?: unknown; confirmation?: boolean };
  try {
    body = await request.json() as { storeId?: unknown; confirmation?: boolean };
  } catch {
    return NextResponse.json({ error: 'Malformed JSON.' }, { status: 400 });
  }
  if (body.confirmation !== true) {
    return NextResponse.json({ error: 'Hapus toko membutuhkan konfirmasi eksplisit.' }, { status: 400 });
  }
  const storeCheck = await requireStoreId(body.storeId == null ? null : String(body.storeId));
  if (storeCheck.response) return storeCheck.response;
  const storeId = storeCheck.storeId as number;
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const [lockedStores] = await conn.query<RowDataPacket[]>('SELECT id FROM stores FOR UPDATE');
    if (lockedStores.length <= 1) {
      await conn.rollback();
      return NextResponse.json({ error: 'Tidak dapat menghapus toko terakhir.' }, { status: 400 });
    }
    const [[target]] = await conn.query<(RowDataPacket & { store_name: string })[]>('SELECT store_name FROM stores WHERE id = ? FOR UPDATE', [storeId]);
    if (!target) {
      await conn.rollback();
      return NextResponse.json({ error: 'Store tidak ditemukan.' }, { status: 404 });
    }
    const [[usage]] = await conn.query<(RowDataPacket & Record<string, number>)[]>(`
      SELECT
        (SELECT COUNT(*) FROM order_all WHERE store_id = ?) AS order_count,
        (SELECT COUNT(*) FROM income_report_imports WHERE store_id = ?) AS income_package_count,
        (SELECT COUNT(*) FROM balance_report_imports WHERE store_id = ?) AS balance_package_count,
        (SELECT COUNT(*) FROM order_cancellation_report_imports WHERE store_id = ?) AS cancellation_package_count,
        (SELECT COUNT(*) FROM order_failed_delivery_report_imports WHERE store_id = ?) AS failed_delivery_package_count,
        (SELECT COUNT(*) FROM order_return_refund_report_imports WHERE store_id = ?) AS return_refund_package_count,
        (SELECT COUNT(*) FROM ads_report_imports WHERE store_id = ?) AS ads_package_count
    `, [storeId, storeId, storeId, storeId, storeId, storeId, storeId]);
    if (Object.values(usage).some((count) => Number(count) > 0)) {
      await conn.rollback();
      return NextResponse.json({ error: 'Clear data toko terlebih dahulu sebelum menghapus toko.' }, { status: 409 });
    }
    await conn.execute('DELETE FROM stores WHERE id = ?', [storeId]);
    await conn.commit();
    return NextResponse.json({ success: true, storeId, storeName: target.store_name, message: `Toko ${target.store_name} berhasil dihapus.` });
  } catch (error) {
    await conn.rollback();
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Hapus toko gagal.' }, { status: 500 });
  } finally {
    conn.release();
  }
}

export async function HEAD() {
  const conn = await getConnection();
  await conn.release();
  return new NextResponse(null, { status: 204 });
}
