import { NextRequest, NextResponse } from 'next/server';
import { getConnection, getPool, withTransaction } from '@/lib/db';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  isMutationAuthorized,
  isSameOriginMutation,
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
    const [stores] = await getPool().query<any[]>(`
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
      const [rows] = await connection.query<any[]>('SELECT id FROM users ORDER BY id ASC LIMIT 1');
      if (rows.length) ownerUserId = Number(rows[0].id);
      else {
        const [created] = await connection.execute<any>(
          'INSERT INTO users (username, display_name) VALUES (?, ?)',
          ['yogaimawan', 'Yogi Imawan'],
        );
        ownerUserId = Number(created.insertId);
      }
      const [created] = await connection.execute<any>(
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

export async function HEAD() {
  const conn = await getConnection();
  await conn.release();
  return new NextResponse(null, { status: 204 });
}
