import { NextRequest, NextResponse } from 'next/server';
import { createConnection, type RowDataPacket } from 'mysql2/promise';
import { requireStoreId } from '../../../lib/store';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { parsePagination } = require('../../../lib/pagination.js') as {
  parsePagination: (page: string | null, limit: string | null) => { page: number; limit: number; error: string | null };
};

const DATE_FILTER_COLUMNS = ['pesanan_harus_dikirim_sebelum', 'waktu_pengiriman_diatur', 'waktu_pesanan_dibuat', 'waktu_pembayaran_dilakukan', 'waktu_pesanan_selesai'] as const;
const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

function nextCalendarDay(value: string) {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!CALENDAR_DATE.test(value) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return null;
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10);
}

const SORT_COLUMNS: Record<string, string> = {
  no_pesanan: 'no_pesanan', status_pesanan: 'status_pesanan', alasan_pembatalan: 'alasan_pembatalan', status_pembatalan_pengembalian: 'status_pembatalan_pengembalian', no_resi: 'no_resi', opsi_pengiriman: 'opsi_pengiriman', antar_ke_counter: 'antar_ke_counter', pesanan_harus_dikirim_sebelum: 'pesanan_harus_dikirim_sebelum', waktu_pengiriman_diatur: 'waktu_pengiriman_diatur', waktu_pesanan_dibuat: 'waktu_pesanan_dibuat', waktu_pembayaran_dilakukan: 'waktu_pembayaran_dilakukan', tipe_pesanan: 'tipe_pesanan', metode_pembayaran: 'metode_pembayaran', sku_induk: 'sku_induk', nama_produk: 'nama_produk', nomor_referensi_sku: 'nomor_referensi_sku', nama_variasi: 'nama_variasi', harga_awal: 'harga_awal', harga_setelah_diskon: 'harga_setelah_diskon', jumlah: 'jumlah', returned_quantity: 'returned_quantity', subtotal_pesanan: 'subtotal_pesanan', total_diskon: 'total_diskon', diskon_dari_penjual: 'diskon_dari_penjual', diskon_dari_shopee: 'diskon_dari_shopee', berat_produk: 'berat_produk', jumlah_produk_di_pesan: 'jumlah_produk_di_pesan', total_berat: 'total_berat', voucher_ditanggung_penjual: 'voucher_ditanggung_penjual', cashback_koin: 'cashback_koin', voucher_ditanggung_shopee: 'voucher_ditanggung_shopee', paket_diskon: 'paket_diskon', paket_diskon_shopee: 'paket_diskon_shopee', paket_diskon_penjual: 'paket_diskon_penjual', potongan_koin_shopee: 'potongan_koin_shopee', diskon_kartu_kredit: 'diskon_kartu_kredit', ongkos_kirim_dibayar_pembeli: 'ongkos_kirim_dibayar_pembeli', estimasi_potongan_biaya_pengiriman: 'estimasi_potongan_biaya_pengiriman', ongkos_kirim_pengembalian_barang: 'ongkos_kirim_pengembalian_barang', total_pembayaran: 'total_pembayaran', perkiraan_ongkos_kirim: 'perkiraan_ongkos_kirim', catatan_dari_pembeli: 'catatan_dari_pembeli', catatan: 'catatan', username_pembeli: 'username_pembeli', nama_penerima: 'nama_penerima', no_telepon: 'no_telepon', alamat_pengiriman: 'alamat_pengiriman', kota_kabupaten: 'kota_kabupaten', provinsi: 'provinsi', waktu_pesanan_selesai: 'waktu_pesanan_selesai',
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
        const conditions = queries.map(() => `(no_pesanan LIKE ? OR nama_produk LIKE ? OR nomor_referensi_sku LIKE ? OR sku_induk LIKE ? OR username_pembeli LIKE ? OR status_pesanan LIKE ?)`).join(' OR ');
        whereClause += ` AND (${conditions})`;
        for (const query of queries) { const term = `%${query}%`; params.push(term, term, term, term, term, term); }
      }
    }
    for (const column of DATE_FILTER_COLUMNS) {
      const from = sp.get(`${column}From`); const to = sp.get(`${column}To`);
      // Order.all timestamps preserve the Seller Centre's local calendar values.
      if (from) { const valid = nextCalendarDay(from); if (!valid) return NextResponse.json({ error: `Tanggal awal ${column} tidak valid.` }, { status: 400 }); whereClause += ` AND ${column} >= CONCAT(?, ' 00:00:00')`; params.push(from); }
      if (to) { const next = nextCalendarDay(to); if (!next) return NextResponse.json({ error: `Tanggal akhir ${column} tidak valid.` }, { status: 400 }); whereClause += ` AND ${column} < CONCAT(?, ' 00:00:00')`; params.push(next); }
      if (from && to && from > to) return NextResponse.json({ error: `Rentang tanggal ${column} tidak valid.` }, { status: 400 });
    }
    if (sp.get('completedOnly') === 'true') whereClause += ' AND waktu_pesanan_selesai IS NOT NULL';

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
