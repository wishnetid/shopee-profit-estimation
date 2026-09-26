import { NextRequest, NextResponse } from 'next/server';
import { createConnection } from 'mysql2/promise';

const { isValidBasicAuthorization } = require('../../../../lib/dashboard-auth.js') as {
  isValidBasicAuthorization: (value: string | null, username?: string, password?: string) => boolean;
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TABLE = 'order_all';
const COLUMN = 'status_pesanan';
const TARGET_LENGTH = 255;
// Preserve the existing nullable semantics while widening source capacity.
const TARGET_DEFINITION = `VARCHAR(${TARGET_LENGTH}) DEFAULT NULL`;

function parseVarcharLength(columnType: unknown) {
  const match = String(columnType || '').match(/^varchar\((\d+)\)$/i);
  return match ? Number(match[1]) : null;
}

async function connection() {
  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;
  if (!DB_HOST || !DB_USER || !DB_PASSWORD || !DB_NAME) throw new Error('Database environment variables are incomplete.');
  return createConnection({ host: DB_HOST, port: Number(DB_PORT || 3306), user: DB_USER, password: DB_PASSWORD, database: DB_NAME, dateStrings: true });
}

async function inspect(conn: Awaited<ReturnType<typeof connection>>) {
  const [rows] = await conn.query<any[]>(`
    SELECT column_type, character_maximum_length, is_nullable, character_set_name, collation_name
    FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?
  `, [TABLE, COLUMN]);
  const column = rows[0];
  if (!column) return { exists: false, varcharLength: null, isNullable: null, columnType: null };
  const [[source]] = await conn.query<any[]>(`SELECT MAX(CHAR_LENGTH(status_pesanan)) AS max_stored_length FROM ${TABLE}`);
  return {
    exists: true,
    columnType: column.column_type,
    varcharLength: parseVarcharLength(column.column_type),
    characterMaximumLength: Number(column.character_maximum_length || 0),
    isNullable: column.is_nullable === 'YES',
    characterSet: column.character_set_name,
    collation: column.collation_name,
    maxStoredLength: Number(source.max_stored_length || 0),
  };
}

function needsWidening(state: Awaited<ReturnType<typeof inspect>>) {
  return !state.exists || state.varcharLength === null || state.varcharLength < TARGET_LENGTH;
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
    if (!body || body.action !== 'apply-order-all-status-length') {
      return NextResponse.json({ error: 'Explicit migration confirmation is required.' }, { status: 400 });
    }

    conn = await connection();
    const before = await inspect(conn);
    if (!before.exists) throw new Error(`${TABLE}.${COLUMN} is missing.`);

    const applied: string[] = [];
    if (needsWidening(before)) {
      await conn.query(`ALTER TABLE ${TABLE} MODIFY COLUMN ${COLUMN} ${TARGET_DEFINITION}`);
      applied.push(`modified ${COLUMN} to ${TARGET_DEFINITION}`);
    }

    const after = await inspect(conn);
    if (!after.exists || after.varcharLength === null || after.varcharLength < TARGET_LENGTH) {
      throw new Error(`Migration verification failed: ${TABLE}.${COLUMN} must be VARCHAR(${TARGET_LENGTH}) or wider.`);
    }
    return NextResponse.json({ success: true, applied, before, after });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Migration failed.' }, { status: 500 });
  } finally {
    if (conn) await conn.end();
  }
}
