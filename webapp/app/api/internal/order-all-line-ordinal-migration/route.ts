import { NextRequest, NextResponse } from 'next/server';
import { createConnection } from 'mysql2/promise';

const { isValidBasicAuthorization } = require('../../../../lib/dashboard-auth.js') as {
  isValidBasicAuthorization: (authorization: string | null, username?: string, password?: string) => boolean;
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const INDEX_NAME = 'uk_order_item_store_price';
const LEGACY_CONFLICTING_UNIQUE_INDEXES = ['uk_order_item_store', 'uk_order_item'];
const IDENTITY = [
  'store_id',
  'no_pesanan',
  'nomor_referensi_sku',
  'nama_variasi',
  'harga_setelah_diskon',
  'line_ordinal',
];

async function connection() {
  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;
  if (!DB_HOST || !DB_USER || !DB_PASSWORD || !DB_NAME) throw new Error('Database environment variables are incomplete.');
  return createConnection({
    host: DB_HOST,
    port: Number(DB_PORT || 3306),
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    dateStrings: true,
  });
}

async function inspect(conn: Awaited<ReturnType<typeof connection>>) {
  const [columns] = await conn.query<any[]>(`
    SELECT column_name, is_nullable
    FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'order_all'
  `);
  const [indexRows] = await conn.query<any[]>(`
    SELECT index_name, non_unique, seq_in_index, column_name
    FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'order_all'
    ORDER BY index_name, seq_in_index
  `);
  const definition = (indexName: string) => {
    const rows = indexRows.filter((row) => row.index_name === indexName);
    return {
      exists: rows.length > 0,
      nonUnique: rows.length ? Number(rows[0].non_unique) : null,
      columns: rows.map((row) => row.column_name),
    };
  };
  const ordinalColumn = columns.find((row) => row.column_name === 'line_ordinal');
  const index = definition(INDEX_NAME);
  const legacyConflictingUniqueIndexes = LEGACY_CONFLICTING_UNIQUE_INDEXES.filter((indexName) => {
    const legacy = definition(indexName);
    return legacy.exists && legacy.nonUnique === 0;
  });
  return {
    lineOrdinal: ordinalColumn ? { exists: true, nullable: ordinalColumn.is_nullable === 'YES' } : { exists: false, nullable: null },
    index,
    legacyConflictingUniqueIndexes,
    ready: Boolean(ordinalColumn)
      && ordinalColumn.is_nullable === 'NO'
      && index.nonUnique === 0
      && JSON.stringify(index.columns) === JSON.stringify(IDENTITY)
      && legacyConflictingUniqueIndexes.length === 0,
  };
}

export async function POST(request: NextRequest) {
  if (!isValidBasicAuthorization(
    request.headers.get('authorization'),
    process.env.DASHBOARD_BASIC_AUTH_USER,
    process.env.DASHBOARD_BASIC_AUTH_PASSWORD,
  )) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  let conn: Awaited<ReturnType<typeof connection>> | null = null;
  try {
    const body = await request.json().catch(() => null);
    if (!body || body.action !== 'apply-order-all-line-ordinal') {
      return NextResponse.json({ error: 'Explicit migration confirmation is required.' }, { status: 400 });
    }

    conn = await connection();
    const before = await inspect(conn);
    const applied: string[] = [];

    if (!before.lineOrdinal.exists) {
      await conn.query('ALTER TABLE order_all ADD COLUMN line_ordinal INT UNSIGNED NOT NULL DEFAULT 1 AFTER updated_at');
      applied.push('added line_ordinal');
    }

    let current = await inspect(conn);
    const expectedIdentityIndex = current.index.exists
      && current.index.nonUnique === 0
      && JSON.stringify(current.index.columns) === JSON.stringify(IDENTITY);
    if (!expectedIdentityIndex) {
      if (current.index.exists) {
        await conn.query(`ALTER TABLE order_all DROP INDEX ${INDEX_NAME}`);
        applied.push(`dropped ${INDEX_NAME}`);
      }
      await conn.query(`ALTER TABLE order_all ADD UNIQUE KEY ${INDEX_NAME} (${IDENTITY.join(', ')})`);
      applied.push(`created ${INDEX_NAME}`);
    }

    current = await inspect(conn);
    for (const indexName of current.legacyConflictingUniqueIndexes) {
      await conn.query(`ALTER TABLE order_all DROP INDEX ${indexName}`);
      applied.push(`dropped legacy conflicting ${indexName}`);
    }

    const after = await inspect(conn);
    if (!after.ready) throw new Error('Migration verification failed: Order.all requires only the six-column physical-line unique identity.');
    return NextResponse.json({ success: true, applied, before, after });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Migration failed.' }, { status: 500 });
  } finally {
    if (conn) await conn.end();
  }
}
