import { NextRequest, NextResponse } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { getConnection } from '../../../lib/db';
import { requireStoreId } from '../../../lib/store';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildProfitActualReport } = require('../../../lib/profit-actual.js') as { buildProfitActualReport: (input: { orderRows: RowDataPacket[]; skuRows: RowDataPacket[]; settlementRows: RowDataPacket[]; exceptionOrderNumbers: string[] }) => unknown };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const storeCheck = await requireStoreId(request.nextUrl.searchParams.get('storeId'));
  if (storeCheck.response) return storeCheck.response;
  const storeId = storeCheck.storeId as number;
  const from = request.nextUrl.searchParams.get('dateFrom') || '2026-08-01';
  const to = request.nextUrl.searchParams.get('dateTo') || '2026-08-31';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) return NextResponse.json({ error: 'Rentang tanggal tidak valid.' }, { status: 400 });
  const conn = await getConnection();
  try {
    const [skuRows] = await conn.query<RowDataPacket[]>('SELECT sku1,sku2,harga FROM sku_master_raw WHERE sku_report_import_id=(SELECT id FROM sku_report_imports ORDER BY imported_at DESC,id DESC LIMIT 1)');
    // Source timestamps are stored UTC; cohort dates are seller calendar WIB.
    // Use explicit UTC bounds rather than DATE(), whose result depends on server session timezone.
    const [orderRows] = await conn.query<RowDataPacket[]>('SELECT no_pesanan,status_pesanan,nomor_referensi_sku,sku_induk,jumlah,waktu_pesanan_selesai,DATE_FORMAT(DATE_ADD(waktu_pesanan_dibuat, INTERVAL 7 HOUR), \'%Y-%m-%d\') waktu_pesanan_dibuat FROM order_all WHERE store_id=? AND waktu_pesanan_dibuat >= DATE_SUB(CONCAT(?, \' 00:00:00\'), INTERVAL 7 HOUR) AND waktu_pesanan_dibuat < DATE_SUB(DATE_ADD(CONCAT(?, \' 00:00:00\'), INTERVAL 1 DAY), INTERVAL 7 HOUR)', [storeId, from, to]);
    const [settlementRows] = await conn.query<RowDataPacket[]>('SELECT p.no_pesanan,p.signed_total,DATE_FORMAT(p.tanggal_dana_dilepaskan, \'%Y-%m-%d\') tanggal_dana_dilepaskan FROM income_penghasilan_raw p JOIN income_report_imports i ON i.id=p.income_report_import_id WHERE i.store_id=? AND p.lihat_berdasarkan=\'Order\'', [storeId]);
    const [exceptionRows] = await conn.query<RowDataPacket[]>(`SELECT DISTINCT no_pesanan FROM (SELECT r.no_pesanan FROM order_cancellation_raw r JOIN order_cancellation_report_imports i ON i.id=r.order_cancellation_report_import_id WHERE i.store_id=? UNION SELECT r.no_pesanan FROM order_failed_delivery_raw r JOIN order_failed_delivery_report_imports i ON i.id=r.order_failed_delivery_report_import_id WHERE i.store_id=? UNION SELECT r.no_pesanan FROM order_return_refund_raw r JOIN order_return_refund_report_imports i ON i.id=r.order_return_refund_report_import_id WHERE i.store_id=?) x WHERE no_pesanan IS NOT NULL`, [storeId, storeId, storeId]);
    const [returnRows] = await conn.query<RowDataPacket[]>(`SELECT r.no_pesanan, 'return_refund' source_type, r.no_pengembalian source_reference, r.status_pembatalan_pengembalian source_status, r.alasan_pengembalian reason, r.jumlah_produk_dikembalikan quantity, r.total_pengembalian_dana amount, r.status_pengembalian_barang stock_status, i.source_file FROM order_return_refund_raw r JOIN order_return_refund_report_imports i ON i.id=r.order_return_refund_report_import_id WHERE i.store_id=?`, [storeId]);
    const [failedRows] = await conn.query<RowDataPacket[]>(`SELECT r.no_pesanan, 'failed_delivery' source_type, r.no_resi source_reference, r.status_klaim source_status, r.status_pengiriman_gagal reason, r.jumlah quantity, r.jumlah_kompensasi amount, NULL stock_status, i.source_file FROM order_failed_delivery_raw r JOIN order_failed_delivery_report_imports i ON i.id=r.order_failed_delivery_report_import_id WHERE i.store_id=?`, [storeId]);
    const [cancellationRows] = await conn.query<RowDataPacket[]>(`SELECT r.no_pesanan, 'cancellation' source_type, r.no_resi source_reference, r.status_pembatalan_pengembalian source_status, r.alasan_pembatalan reason, r.jumlah quantity, NULL amount, NULL stock_status, i.source_file FROM order_cancellation_raw r JOIN order_cancellation_report_imports i ON i.id=r.order_cancellation_report_import_id WHERE i.store_id=?`, [storeId]);
    const [adjustmentRows] = await conn.query<RowDataPacket[]>(`SELECT r.no_pesanan_terhubung no_pesanan, 'adjustment' source_type, NULL source_reference, NULL source_status, NULL reason, NULL quantity, r.biaya_penyesuaian amount, NULL stock_status, i.source_file FROM income_adjustments_raw r JOIN income_report_imports i ON i.id=r.income_report_import_id WHERE i.store_id=?`, [storeId]);
    const report = buildProfitActualReport({ orderRows, skuRows, settlementRows, exceptionOrderNumbers: exceptionRows.map((row) => String(row.no_pesanan || '')) }) as { orders: Array<{ no_pesanan: string }>; [key: string]: unknown };
    const cohort = new Set(report.orders.map((row) => row.no_pesanan));
    const exceptionDetails = [...returnRows, ...failedRows, ...cancellationRows, ...adjustmentRows]
      .filter((row) => cohort.has(String(row.no_pesanan || '').trim()))
      .map((row) => ({ noPesanan: String(row.no_pesanan || '').trim(), sourceType: row.source_type, sourceReference: row.source_reference || null, sourceStatus: row.source_status || null, reason: row.reason || null, quantity: row.quantity == null ? null : Number(row.quantity), amount: row.amount == null ? null : Number(row.amount), stockStatus: row.stock_status || null, sourceFile: row.source_file }));
    const [qcRows] = await conn.query<RowDataPacket[]>('SELECT no_pengembalian, qc_status, qc_note, DATE_FORMAT(updated_at, \'%Y-%m-%d %H:%i\') updated_at FROM return_qc_decisions WHERE store_id=?', [storeId]);
    const qcByReturn = new Map(qcRows.map((row) => [String(row.no_pengembalian), row]));
    const returnQcReview = exceptionDetails.filter((row) => row.sourceType === 'return_refund').map((row) => {
      const qc = qcByReturn.get(String(row.sourceReference || ''));
      return { ...row, qcStatus: qc?.qc_status || 'belum_dinilai', qcNote: qc?.qc_note || '', qcUpdatedAt: qc?.updated_at || null,
        reviewStatus: qc ? 'Keputusan QC internal tersimpan.' : 'Belum ada keputusan QC internal.',
        financialTreatment: 'Tidak dialokasikan ke Profit Aktual Normal.' };
    });
    return NextResponse.json({ success: true, storeId, dateRange: { dateFrom: from, dateTo: to }, ...report, exceptionDetails, returnQcReview });
  } catch (error) { console.error('Profit actual API error:', error); return NextResponse.json({ error: 'Gagal memuat Profit Aktual.' }, { status: 500 }); } finally { conn.release(); }
}
