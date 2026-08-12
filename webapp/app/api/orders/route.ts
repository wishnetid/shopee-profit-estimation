import { NextRequest, NextResponse } from 'next/server';
import { createConnection, type RowDataPacket } from 'mysql2/promise';
import { requireStoreId } from '../../../lib/store';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { parsePagination } = require('../../../lib/pagination.js') as {
  parsePagination: (page: string | null, limit: string | null) => { page: number; limit: number; error: string | null };
};

const SORT_COLUMNS: Record<string, string> = {
  no_pesanan: 'no_pesanan',
  status_pesanan: 'status_pesanan',
  nama_produk: 'nama_produk',
  nomor_referensi_sku: 'nomor_referensi_sku',
  jumlah: 'jumlah',
  total_pembayaran: 'total_pembayaran',
  waktu_pesanan_dibuat: 'waktu_pesanan_dibuat',
  username_pembeli: 'username_pembeli',
};

async function getConnection() {
  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;
  if (!DB_HOST || !DB_USER || !DB_PASSWORD || !DB_NAME) throw new Error('Database configuration is incomplete.');
  return createConnection({
    host: DB_HOST,
    port: parseInt(DB_PORT || '3306'),
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    dateStrings: true,
  });
}

export async function GET(request: NextRequest) {
  const storeCheck = await requireStoreId(request.nextUrl.searchParams.get('storeId'));
  if (storeCheck.response) return storeCheck.response;
  const storeId = storeCheck.storeId as number;
  const conn = await getConnection();

  try {
    const sp = request.nextUrl.searchParams;
    const pagination = parsePagination(sp.get('page'), sp.get('limit'));
    if (pagination.error) return NextResponse.json({ error: pagination.error }, { status: 400 });
    const { page, limit } = pagination;
    const search = sp.get('search') || '';
    const sort = SORT_COLUMNS[sp.get('sort') || 'waktu_pesanan_dibuat'] || SORT_COLUMNS.waktu_pesanan_dibuat;
    const direction = sp.get('direction') === 'asc' ? 'ASC' : 'DESC';
    const offset = (page - 1) * limit;
    const params: Array<string | number> = [storeId];
    let whereClause = 'WHERE store_id = ?';

    if (search) {
      const queries = search.split('||').map(q => q.trim()).filter(Boolean);
      if (queries.length > 0) {
        const conditions = queries.map(() => `(
          no_pesanan LIKE ? OR nama_produk LIKE ? OR nomor_referensi_sku LIKE ? OR
          sku_induk LIKE ? OR username_pembeli LIKE ? OR status_pesanan LIKE ?
        )`).join(' OR ');
        whereClause += ` AND (${conditions})`;
        for (const query of queries) {
          const term = `%${query}%`;
          params.push(term, term, term, term, term, term);
        }
      }
    }

    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT * FROM order_all ${whereClause} ORDER BY ${sort} ${direction} LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    const [countResult] = await conn.execute<Array<RowDataPacket & { total: number }>>(
      `SELECT COUNT(*) AS total FROM order_all ${whereClause}`,
      params,
    );
    const total = Number(countResult[0].total || 0);

    return NextResponse.json({ success: true, storeId, data: rows, total, page, limit });
  } catch (error: unknown) {
    console.error('Orders API error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Orders query failed.' }, { status: 500 });
  } finally {
    await conn.end();
  }
}
