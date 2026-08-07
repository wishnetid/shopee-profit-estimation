import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  isSameOriginMutation,
  isValidBasicAuthorization,
} = require('../../../../lib/dashboard-auth.js') as {
  isSameOriginMutation: (origin: string | null, expectedOrigin: string) => boolean;
  isValidBasicAuthorization: (authorization: string | null, username: string | undefined, password: string | undefined) => boolean;
};

async function listTables(conn: Awaited<ReturnType<typeof getConnection>>) {
  const [tables] = await conn.execute('SHOW TABLES') as any[];
  return tables.map((row: Record<string, unknown>) => String(Object.values(row)[0]));
}

function unauthorizedResponse() {
  return NextResponse.json(
    { success: false, error: 'Authentication required.' },
    { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="Shopee Profit Estimation"' } },
  );
}

function isAuthorized(request: NextRequest) {
  return isValidBasicAuthorization(
    request.headers.get('authorization'),
    process.env.DASHBOARD_BASIC_AUTH_USER,
    process.env.DASHBOARD_BASIC_AUTH_PASSWORD,
  );
}

export async function GET() {
  let conn: Awaited<ReturnType<typeof getConnection>> | null = null;
  try {
    conn = await getConnection();
    const tableNames = await listTables(conn);
    const result: Array<{ name: string; rows: number }> = [];
    for (const tableName of tableNames) {
      const [countResult] = await conn.execute(`SELECT COUNT(*) as cnt FROM \`${tableName}\``) as any[];
      result.push({ name: tableName, rows: countResult[0].cnt });
    }
    return NextResponse.json({ success: true, tables: result });
  } catch {
    return NextResponse.json({ success: false, error: 'Database request failed.' }, { status: 500 });
  } finally {
    conn?.release();
  }
}

export async function POST(request: NextRequest) {
  let conn: Awaited<ReturnType<typeof getConnection>> | null = null;
  try {
    if (!isAuthorized(request)) return unauthorizedResponse();
    if (!isSameOriginMutation(request.headers.get('origin'), request.nextUrl.origin)) {
      return NextResponse.json({ success: false, error: 'Cross-origin request rejected.' }, { status: 403 });
    }

    const { action, table } = await request.json() as { action?: string; table?: string };
    if (action !== 'clear_table' && action !== 'clear_all') {
      return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
    }

    conn = await getConnection();
    const tableNames: string[] = await listTables(conn);
    const targets: string[] = action === 'clear_all' ? tableNames : [table || ''];
    if (targets.some((target) => !tableNames.includes(target))) {
      return NextResponse.json({ success: false, error: 'Invalid table' }, { status: 400 });
    }

    const results: Array<{ table: string; rowsRemoved: number }> = [];
    await conn.beginTransaction();
    try {
      await conn.execute('SET FOREIGN_KEY_CHECKS = 0');
      for (const target of targets) {
        const [before] = await conn.execute(`SELECT COUNT(*) as cnt FROM \`${target}\``) as any[];
        await conn.execute(`TRUNCATE TABLE \`${target}\``);
        results.push({ table: target, rowsRemoved: before[0].cnt });
      }
      await conn.execute('SET FOREIGN_KEY_CHECKS = 1');
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    }

    return NextResponse.json({
      success: true,
      message: action === 'clear_all' ? `All tables cleared (${results.length} tables)` : `Table "${results[0].table}" cleared (${results[0].rowsRemoved} rows removed)`,
      results,
      rowsRemoved: action === 'clear_table' ? results[0].rowsRemoved : undefined,
    });
  } catch {
    return NextResponse.json({ success: false, error: 'Database request failed.' }, { status: 500 });
  } finally {
    conn?.release();
  }
}
