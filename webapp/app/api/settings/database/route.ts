/**
 * Settings - Database Management API
 * POST /api/settings/database — clear/truncate tables
 */

import { NextRequest, NextResponse } from 'next/server';
import { createConnection } from 'mysql2/promise';

async function getConnection() {
  return createConnection({
    host: process.env.DB_HOST || '103.136.19.30',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'supplie3_shopee_profit_estimation',
    password: process.env.DB_PASSWORD || 'Persib1933',
    database: process.env.DB_NAME || 'supplie3_shopee_profit_estimation',
  });
}

// GET — list tables with row counts
export async function GET() {
  let conn;
  try {
    conn = await getConnection();
    const [tables] = await conn.execute('SHOW TABLES') as any[];

    const result: any[] = [];
    for (const row of tables) {
      const tableName = String(Object.values(row)[0]);
      const [countResult] = await conn.execute(`SELECT COUNT(*) as cnt FROM \`${tableName}\``) as any[];
      result.push({
        name: tableName,
        rows: countResult[0].cnt,
      });
    }

    return NextResponse.json({ success: true, tables: result });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    if (conn) await conn.end();
  }
}

// POST — clear specific table or all tables
export async function POST(request: NextRequest) {
  let conn;
  try {
    const body = await request.json();
    const { action, table } = body;

    if (!action) {
      return NextResponse.json({ success: false, error: 'Missing action' }, { status: 400 });
    }

    conn = await getConnection();

    if (action === 'clear_table' && table) {
      // Get row count before
      const [before] = await conn.execute(`SELECT COUNT(*) as cnt FROM \`${table}\``) as any[];
      const countBefore = before[0].cnt;

      // Truncate
      await conn.execute('SET FOREIGN_KEY_CHECKS = 0');
      await conn.execute(`TRUNCATE TABLE \`${table}\``);
      await conn.execute('SET FOREIGN_KEY_CHECKS = 1');

      return NextResponse.json({
        success: true,
        message: `Table "${table}" cleared (${countBefore} rows removed)`,
        rowsRemoved: countBefore,
      });
    }

    if (action === 'clear_all') {
      // Get all tables
      const [tables] = await conn.execute('SHOW TABLES') as any[];

      await conn.execute('SET FOREIGN_KEY_CHECKS = 0');

      const results: any[] = [];
      for (const row of tables) {
        const tableName = String(Object.values(row)[0]);
        const [before] = await conn.execute(`SELECT COUNT(*) as cnt FROM \`${tableName}\``) as any[];
        const countBefore = before[0].cnt;
        await conn.execute(`TRUNCATE TABLE \`${tableName}\``);
        results.push({ table: tableName, rowsRemoved: countBefore });
      }

      await conn.execute('SET FOREIGN_KEY_CHECKS = 1');

      return NextResponse.json({
        success: true,
        message: `All tables cleared (${results.length} tables)`,
        results,
      });
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    if (conn) await conn.end();
  }
}
