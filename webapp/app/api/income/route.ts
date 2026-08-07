import { NextRequest, NextResponse } from 'next/server';
import { createConnection } from 'mysql2/promise';

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
    const selectedImport = sp.get('importId');
    const page = Math.max(1, Number(sp.get('page') || 1));
    const limit = Math.min(100, Math.max(5, Number(sp.get('limit') || 50)));
    const search = (sp.get('search') || '').trim();
    if (!ALLOWED_SECTIONS.has(section) || !ALLOWED_VIEWS.has(view)) return NextResponse.json({ error: 'Invalid Income query.' }, { status: 400 });

    const [imports] = await conn.query(`SELECT id, source_file, source_sha256, report_period_from, report_period_to, summary_payload, summary_total_yang_dilepas, reconciliation_order_signed_total, reconciliation_difference, reconciliation_status, warnings_payload, imported_at FROM income_report_imports ORDER BY imported_at DESC, id DESC`) as any;
    const importRows = imports as any[];
    const importId = selectedImport ? Number(selectedImport) : importRows[0]?.id;
    if (!importId) return NextResponse.json({ success: true, imports: [], selectedImport: null, summary: null, data: [], total: 0, page, limit });
    const selected = importRows.find((row) => Number(row.id) === importId);
    if (!selected) return NextResponse.json({ error: 'Income import tidak ditemukan.' }, { status: 404 });

    let table = 'income_penghasilan_raw';
    let where = 'WHERE income_report_import_id = ?';
    let params: any[] = [importId];
    let orderBy = 'source_excel_row ASC';
    if (section === 'penghasilan') { where += ' AND lihat_berdasarkan = ?'; params.push(view); }
    if (section === 'adjustment') { table = 'income_adjustments_raw'; }
    if (section === 'shipping') { table = 'income_shipping_fee_discrepancies_raw'; }
    if (search) {
      const col = section === 'adjustment' ? 'no_pesanan_terhubung' : 'no_pesanan';
      where += ` AND ${col} LIKE ?`; params.push(`%${search}%`);
    }
    const offset = (page - 1) * limit;
    const [rows] = await conn.query(`SELECT * FROM ${table} ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`, [...params, limit, offset]) as any;
    const [[count]] = await conn.query(`SELECT COUNT(*) AS total FROM ${table} ${where}`, params) as any;
    return NextResponse.json({ success: true, imports: importRows, selectedImport: selected, summary: typeof selected.summary_payload === 'string' ? JSON.parse(selected.summary_payload) : selected.summary_payload, data: rows, total: count.total, page, limit, section, view });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Income query failed.' }, { status: 500 });
  } finally { await conn.end(); }
}
