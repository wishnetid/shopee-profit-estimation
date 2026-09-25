import { NextRequest, NextResponse } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { getConnection } from '@/lib/db';
import { requireStoreId } from '@/lib/store';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildMyBalanceAnalysis } = require('@/lib/my-balance-analysis.js') as { buildMyBalanceAnalysis: (input: { balanceRows: RowDataPacket[]; adsRows: RowDataPacket[]; dateFrom?: string | null; dateTo?: string | null }) => unknown };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const storeCheck = await requireStoreId(request.nextUrl.searchParams.get('storeId'));
  if (storeCheck.response) return storeCheck.response;
  const storeId = storeCheck.storeId as number;
  const dateFrom = request.nextUrl.searchParams.get('dateFrom') || null;
  const dateTo = request.nextUrl.searchParams.get('dateTo') || null;
  try {
    const connection = await getConnection();
    try {
      const [balanceRows] = await connection.query<RowDataPacket[]>(`
        SELECT transaction_at,type_transaksi,jenis_transaksi,status,description,no_pesanan_direct,no_pesanan_extracted,jumlah_signed,saldo_akhir,source_excel_row,source_file
        FROM (
          SELECT DATE_FORMAT(b.transaction_at, '%Y-%m-%d %H:%i:%s') transaction_at,b.type_transaksi,b.jenis_transaksi,b.status,b.description,b.no_pesanan_direct,b.no_pesanan_extracted,b.jumlah_signed,b.saldo_akhir,b.source_excel_row,i.source_file,
            ROW_NUMBER() OVER (PARTITION BY b.transaction_at,b.type_transaksi,b.description,COALESCE(NULLIF(b.no_pesanan_direct,''),NULLIF(b.no_pesanan_extracted,'')),b.jenis_transaksi,b.jumlah_signed,b.status,b.saldo_akhir ORDER BY i.imported_at DESC,i.id DESC,b.id DESC) canonical_rank
          FROM balance_transactions_raw b INNER JOIN balance_report_imports i ON i.id=b.balance_report_import_id
          WHERE i.store_id=? AND b.status='Transaksi Selesai'
        ) canonical WHERE canonical_rank=1
      `, [storeId]);
      const [adsRows] = await connection.query<RowDataPacket[]>(`
        SELECT a.ads_report_import_id,a.sequence_number,DATE_FORMAT(a.transaction_date, '%Y-%m-%d') transaction_date,a.description,a.jumlah_signed,a.note
        FROM ads_transactions_raw a
        INNER JOIN ads_report_imports i ON i.id=a.ads_report_import_id
        WHERE i.store_id=?
      `, [storeId]);
      const report = buildMyBalanceAnalysis({ balanceRows, adsRows, dateFrom, dateTo }) as Record<string, unknown>;
      return NextResponse.json({ success: true, storeId, ...report });
    } finally { connection.release(); }
  } catch (error) {
    const message = error instanceof Error && /dateFrom|dateTo/.test(error.message) ? 'Rentang tanggal tidak valid.' : 'Gagal memuat My Balance Analisis.';
    console.error('My Balance analysis API error:', error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
