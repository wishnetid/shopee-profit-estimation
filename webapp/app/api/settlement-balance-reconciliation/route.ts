import { NextRequest, NextResponse } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { getConnection } from '../../../lib/db';
import { requireStoreId } from '../../../lib/store';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildSettlementBalanceReconciliation } = require('../../../lib/settlement-balance-reconciliation.js') as { buildSettlementBalanceReconciliation: (input: { orderRows: RowDataPacket[]; incomeRows: RowDataPacket[]; balanceRows: RowDataPacket[]; exceptionRows: RowDataPacket[] }) => { summary: Record<string, number>; rows: Record<string, unknown>[] } };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

export async function GET(request: NextRequest) {
  const storeCheck = await requireStoreId(request.nextUrl.searchParams.get('storeId'));
  if (storeCheck.response) return storeCheck.response;
  const storeId = storeCheck.storeId as number;
  const dateFrom = request.nextUrl.searchParams.get('dateFrom') || '2026-08-01';
  const dateTo = request.nextUrl.searchParams.get('dateTo') || '2026-08-31';
  if (!isDate(dateFrom) || !isDate(dateTo) || dateFrom > dateTo) return NextResponse.json({ error: 'Rentang Waktu Pesanan Dibuat tidak valid.' }, { status: 400 });

  const conn = await getConnection();
  try {
    // Order.all persists the Seller Centre local calendar. Keep the indexed half-open range unchanged.
    const [orderRows] = await conn.query<RowDataPacket[]>(`SELECT no_pesanan,status_pesanan,DATE_FORMAT(waktu_pesanan_dibuat, '%Y-%m-%d') waktu_pesanan_dibuat,jumlah,returned_quantity FROM order_all WHERE store_id=? AND waktu_pesanan_dibuat >= CONCAT(?, ' 00:00:00') AND waktu_pesanan_dibuat < DATE_ADD(CONCAT(?, ' 00:00:00'), INTERVAL 1 DAY)`, [storeId, dateFrom, dateTo]);
    const cohortIds = Array.from(new Set(orderRows.map((row) => String(row.no_pesanan || '').trim()).filter(Boolean)));
    if (!cohortIds.length) return NextResponse.json({ success: true, storeId, dateRange: { dateFrom, dateTo }, summary: { cohortOrders: 0, incomeSettlement: 0, balanceOrderIncomeIn: 0, balanceOrderIncomeOut: 0, balanceAdjustmentIn: 0, balanceAdjustmentOut: 0, balanceNet: 0, matchNormal: 0, reversal: 0, adjustment: 0, exception: 0, partialReturnPending: 0, needsReconciliation: 0, noBalance: 0 }, rows: [] });
    const marks = cohortIds.map(() => '?').join(',');
    const [incomeRows] = await conn.query<RowDataPacket[]>(`SELECT p.no_pesanan,p.signed_total,DATE_FORMAT(p.tanggal_dana_dilepaskan, '%Y-%m-%d') tanggal_dana_dilepaskan,i.source_file,p.source_excel_row FROM income_penghasilan_raw p JOIN income_report_imports i ON i.id=p.income_report_import_id WHERE i.store_id=? AND p.lihat_berdasarkan='Order' AND p.no_pesanan IN (${marks})`, [storeId, ...cohortIds]);
    const [balanceRows] = await conn.query<RowDataPacket[]>(`SELECT no_pesanan,transaction_at,type_transaksi,jenis_transaksi,jumlah_signed,description,status,saldo_akhir,source_file,source_excel_row FROM (SELECT COALESCE(NULLIF(b.no_pesanan_direct,''),NULLIF(b.no_pesanan_extracted,'')) no_pesanan,DATE_FORMAT(b.transaction_at, '%Y-%m-%d %H:%i:%s') transaction_at,b.type_transaksi,b.jenis_transaksi,b.jumlah_signed,b.description,b.status,b.saldo_akhir,i.source_file,b.source_excel_row,ROW_NUMBER() OVER (PARTITION BY b.transaction_at,b.type_transaksi,b.description,COALESCE(NULLIF(b.no_pesanan_direct,''),NULLIF(b.no_pesanan_extracted,'')),b.jenis_transaksi,b.jumlah_signed,b.status,b.saldo_akhir ORDER BY i.imported_at DESC,i.id DESC,b.id DESC) canonical_rank FROM balance_transactions_raw b JOIN balance_report_imports i ON i.id=b.balance_report_import_id WHERE i.store_id=? AND COALESCE(NULLIF(b.no_pesanan_direct,''),NULLIF(b.no_pesanan_extracted,'')) IN (${marks})) canonical WHERE canonical_rank=1`, [storeId, ...cohortIds]);
    const [exceptionRows] = await conn.query<RowDataPacket[]>(`SELECT no_pesanan,source_type FROM (SELECT r.no_pesanan,'return_refund' source_type FROM order_return_refund_raw r JOIN order_return_refund_report_imports i ON i.id=r.order_return_refund_report_import_id WHERE i.store_id=? UNION ALL SELECT r.no_pesanan,'failed_delivery' FROM order_failed_delivery_raw r JOIN order_failed_delivery_report_imports i ON i.id=r.order_failed_delivery_report_import_id WHERE i.store_id=? UNION ALL SELECT r.no_pesanan,'cancellation' FROM order_cancellation_raw r JOIN order_cancellation_report_imports i ON i.id=r.order_cancellation_report_import_id WHERE i.store_id=?) x WHERE no_pesanan IN (${marks})`, [storeId, storeId, storeId, ...cohortIds]);
    const report = buildSettlementBalanceReconciliation({ orderRows, incomeRows, balanceRows, exceptionRows });
    return NextResponse.json({ success: true, storeId, dateRange: { dateFrom, dateTo }, ...report });
  } catch (error) {
    console.error('Settlement balance reconciliation API error:', error);
    return NextResponse.json({ error: 'Gagal memuat rekonsiliasi settlement dan My Balance.' }, { status: 500 });
  } finally { conn.release(); }
}
