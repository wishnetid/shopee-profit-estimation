import { NextRequest, NextResponse } from 'next/server';
import { createConnection } from 'mysql2/promise';

const SORT_COLUMNS: Record<string, string> = {
  source_excel_row: 'r.source_excel_row',
  sku1: 'r.sku1',
  sku2: 'r.sku2',
  harga: 'r.harga',
  idproduk: 'r.idproduk',
};

async function getConnection() {
  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;
  if (!DB_HOST || !DB_USER || !DB_PASSWORD || !DB_NAME) {
    throw new Error('Database configuration is incomplete.');
  }
  return createConnection({
    host: DB_HOST,
    port: Number(DB_PORT || 3306),
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    dateStrings: true,
  });
}

export async function GET(request: NextRequest) {
  const conn = await getConnection();
  try {
    const sp = request.nextUrl.searchParams;
    const page = Math.max(1, Number(sp.get('page') || 1));
    const limit = Math.min(100, Math.max(5, Number(sp.get('limit') || 50)));
    const search = (sp.get('search') || '').trim();
    const requestedImport = sp.get('importId');
    const sort = SORT_COLUMNS[sp.get('sort') || 'source_excel_row'] || SORT_COLUMNS.source_excel_row;
    const direction = sp.get('direction') === 'desc' ? 'DESC' : 'ASC';

    const [imports] = await conn.query(
      `SELECT id, source_file, source_sha256, sheet_name, warnings_payload, imported_at
       FROM sku_report_imports
       ORDER BY imported_at DESC, id DESC`,
    ) as any;
    const importRows = imports as any[];
    const importId = requestedImport ? Number(requestedImport) : importRows[0]?.id;
    if (!importId) {
      return NextResponse.json({ success: true, imports: [], selectedImport: null, data: [], total: 0, page, limit });
    }
    const selectedImport = importRows.find((row) => Number(row.id) === importId);
    if (!selectedImport) return NextResponse.json({ error: 'SKU RAW import tidak ditemukan.' }, { status: 404 });

    let where = 'WHERE r.sku_report_import_id = ?';
    const params: any[] = [importId];
    if (search) {
      const clauses = search.split('||').map((query) => query.trim()).filter(Boolean).map(() => `(
        r.sku1 LIKE ? OR r.sku2 LIKE ? OR r.idproduk LIKE ?
      )`);
      if (clauses.length) {
        where += ` AND (${clauses.join(' OR ')})`;
        for (const query of search.split('||').map((value) => value.trim()).filter(Boolean)) {
          const pattern = `%${query}%`;
          params.push(pattern, pattern, pattern);
        }
      }
    }
    const offset = (page - 1) * limit;
    const [rows] = await conn.query(
      `SELECT r.id, r.source_excel_row, r.sku1, r.sku2, r.harga, r.idproduk
       FROM sku_master_raw r ${where}
       ORDER BY ${sort} ${direction}, r.id ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    ) as any;
    const [[count]] = await conn.query(
      `SELECT COUNT(*) AS total FROM sku_master_raw r ${where}`,
      params,
    ) as any;

    return NextResponse.json({
      success: true,
      imports: importRows,
      selectedImport,
      data: rows,
      total: count.total,
      page,
      limit,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'SKU RAW query failed.' }, { status: 500 });
  } finally {
    await conn.end();
  }
}
