import { NextRequest, NextResponse } from 'next/server';
import { createConnection } from 'mysql2/promise';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildIncomeQueryPlan } = require('../../../lib/income-query.js') as {
  buildIncomeQueryPlan: (options?: Record<string, unknown>) => {
    table: string;
    selectSql: string;
    whereSql: string;
    params: unknown[];
    orderSql: string;
  };
};

const ALLOWED_SECTIONS = new Set(['penghasilan', 'adjustment', 'shipping']);
const ALLOWED_VIEWS = new Set(['Order', 'Sku']);

async function getConnection() {
  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;
  if (!DB_HOST || !DB_USER || !DB_PASSWORD || !DB_NAME) throw new Error('Database configuration is incomplete.');
  return createConnection({ host: DB_HOST, port: Number(DB_PORT || 3306), user: DB_USER, password: DB_PASSWORD, database: DB_NAME, dateStrings: true });
}

export async function GET(request: NextRequest) {
  const conn = await getConnection();
  try {
    const sp = request.nextUrl.searchParams;
    const section = sp.get('section') || 'penghasilan';
    const view = sp.get('view') || 'Order';
    const page = Math.max(1, Number(sp.get('page') || 1));
    const limit = Math.min(100, Math.max(5, Number(sp.get('limit') || 50)));
    const search = (sp.get('search') || '').trim();
    const sort = sp.get('sort') || 'report_period_from';
    const direction = sp.get('direction') || 'desc';
    if (!ALLOWED_SECTIONS.has(section) || (section === 'penghasilan' && !ALLOWED_VIEWS.has(view))) {
      return NextResponse.json({ error: 'Invalid Income query.' }, { status: 400 });
    }

    const [imports] = await conn.query(`SELECT id, source_file, source_sha256, report_period_from, report_period_to, summary_payload, summary_total_yang_dilepas, reconciliation_order_signed_total, reconciliation_difference, reconciliation_status, warnings_payload, imported_at FROM income_report_imports ORDER BY imported_at DESC, id DESC`) as any;
    const importRows = imports as any[];
    const plan = buildIncomeQueryPlan({ section, view, search, sort, direction });
    const offset = (page - 1) * limit;
    const fromClause = `${plan.table} r INNER JOIN income_report_imports i ON i.id = r.income_report_import_id`;
    const [rows] = await conn.query(`SELECT ${plan.selectSql} FROM ${fromClause} ${plan.whereSql} ORDER BY ${plan.orderSql}, r.id DESC LIMIT ? OFFSET ?`, [...plan.params, limit, offset]) as any;
    const [[count]] = await conn.query(`SELECT COUNT(*) AS total FROM ${fromClause} ${plan.whereSql}`, plan.params) as any;
    return NextResponse.json({
      success: true,
      imports: importRows,
      packageCount: importRows.length,
      selectedImport: null,
      summary: null,
      data: rows,
      total: Number(count.total || 0),
      page,
      limit,
      section,
      view: section === 'penghasilan' ? view : null,
      sort,
      direction,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Income query failed.' }, { status: 500 });
  } finally { await conn.end(); }
}
