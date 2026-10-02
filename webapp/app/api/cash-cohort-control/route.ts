import { NextRequest, NextResponse } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { getConnection } from '../../../lib/db';
import { requireStoreId } from '../../../lib/store';
import { loadProfitActualData } from '../../../lib/profit-actual-data';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildCashCohortControl } = require('../../../lib/cash-cohort-control.js') as {
  buildCashCohortControl: (input: { actualSummary: Record<string, unknown>; balanceRows: RowDataPacket[]; monthStart: string }) => Record<string, unknown>;
};

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type CoverageRow = RowDataPacket & { source: string; coverage_to: string | null; imported_at: string | null };

function monthRange(value: string | null) {
  if (!value || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return null;
  const [year, month] = value.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { month: value, from: `${value}-01`, to: `${value}-${String(lastDay).padStart(2, '0')}` };
}

export async function GET(request: NextRequest) {
  const storeCheck = await requireStoreId(request.nextUrl.searchParams.get('storeId'));
  if (storeCheck.response) return storeCheck.response;
  const range = monthRange(request.nextUrl.searchParams.get('month'));
  if (!range) return NextResponse.json({ error: 'Bulan wajib format YYYY-MM.' }, { status: 400 });
  const storeId = storeCheck.storeId as number;

  const conn = await getConnection();
  try {
    const actual = await loadProfitActualData(conn, storeId, range.from, range.to);
    // Canonical My Balance rows for the calendar month. The old-order join is
    // intentionally distinct at order grain so physical Order.all item rows
    // cannot duplicate a single wallet event.
    const [balanceRows] = await conn.query<RowDataPacket[]>(`
      SELECT
        DATE_FORMAT(canonical.transaction_at, '%Y-%m-%d %H:%i:%s') transaction_at,
        canonical.type_transaksi,
        canonical.jumlah_signed,
        canonical.no_pesanan,
        old_orders.order_created_date
      FROM (
        SELECT
          b.transaction_at,b.type_transaksi,b.jumlah_signed,
          COALESCE(NULLIF(b.no_pesanan_direct,''),NULLIF(b.no_pesanan_extracted,'')) no_pesanan,
          ROW_NUMBER() OVER (
            PARTITION BY b.transaction_at,b.type_transaksi,b.description,
              COALESCE(NULLIF(b.no_pesanan_direct,''),NULLIF(b.no_pesanan_extracted,'')),
              b.jenis_transaksi,b.jumlah_signed,b.status,b.saldo_akhir
            ORDER BY i.imported_at DESC,i.id DESC,b.id DESC
          ) canonical_rank
        FROM balance_transactions_raw b
        INNER JOIN balance_report_imports i ON i.id=b.balance_report_import_id
        WHERE i.store_id=?
          AND b.status='Transaksi Selesai'
          AND b.transaction_at >= CONCAT(?, ' 00:00:00')
          AND b.transaction_at < DATE_ADD(CONCAT(?, ' 00:00:00'), INTERVAL 1 DAY)
      ) canonical
      LEFT JOIN (
        SELECT no_pesanan,DATE_FORMAT(MIN(waktu_pesanan_dibuat), '%Y-%m-%d') order_created_date
        FROM order_all
        WHERE store_id=? AND NULLIF(TRIM(no_pesanan),'') IS NOT NULL
        GROUP BY no_pesanan
      ) old_orders ON old_orders.no_pesanan=canonical.no_pesanan
      WHERE canonical.canonical_rank=1
      ORDER BY canonical.transaction_at ASC
    `, [storeId, range.from, range.to, storeId]);

    const [coverageRows] = await conn.query<CoverageRow[]>(`
      SELECT source,DATE_FORMAT(MAX(report_period_to), '%Y-%m-%d') coverage_to,DATE_FORMAT(MAX(imported_at), '%Y-%m-%d %H:%i:%s') imported_at
      FROM (
        SELECT 'income' source,report_period_to,imported_at FROM income_report_imports WHERE store_id=?
        UNION ALL SELECT 'my_balance',report_period_to,imported_at FROM balance_report_imports WHERE store_id=?
        UNION ALL SELECT 'cancellation',report_period_to,imported_at FROM order_cancellation_report_imports WHERE store_id=?
        UNION ALL SELECT 'failed_delivery',report_period_to,imported_at FROM order_failed_delivery_report_imports WHERE store_id=?
        UNION ALL SELECT 'return_refund',report_period_to,imported_at FROM order_return_refund_report_imports WHERE store_id=?
      ) packages
      GROUP BY source
    `, [storeId, storeId, storeId, storeId, storeId]);
    // Used Ads is intentionally outside the cash-basis formula. It belongs to
    // the separate daily economics control, so Ads coverage cannot turn this
    // monthly cash-control result into running/closed.
    const requiredSources = ['income', 'my_balance', 'cancellation', 'failed_delivery', 'return_refund'];
    const coverage: Record<string, { coverageTo: string | null; importedAt: string | null; completeThroughMonth: boolean }> = Object.fromEntries(
      requiredSources.map((source) => [source, { coverageTo: null, importedAt: null, completeThroughMonth: false }]),
    );
    for (const row of coverageRows) {
      coverage[row.source] = {
        coverageTo: row.coverage_to,
        importedAt: row.imported_at,
        completeThroughMonth: Boolean(row.coverage_to && row.coverage_to >= range.to),
      };
    }
    const control = buildCashCohortControl({ actualSummary: actual.report.summary, balanceRows, monthStart: range.from }) as { finalityReasons: string[]; status: string; [key: string]: unknown };
    const missingCoverage = Object.entries(coverage)
      .filter(([, source]) => !(source as { completeThroughMonth: boolean }).completeThroughMonth)
      .map(([source, item]) => {
        const coverageTo = (item as { coverageTo: string | null }).coverageTo;
        return coverageTo ? `Coverage ${source} berakhir ${coverageTo}.` : `Coverage ${source} belum tersedia.`;
      });
    const finalityReasons = [...control.finalityReasons, ...missingCoverage];

    return NextResponse.json({
      success: true,
      storeId,
      month: range.month,
      dateRange: { dateFrom: range.from, dateTo: range.to },
      formula: {
        cashReady: 'Hasil Finansial Final − Gross Top-up Ads+PPN − Outflow order-linked cohort lama',
        runningPotential: 'Cash Siap Tarik + Estimasi Profit Belum Selesai',
        topupPpn: 'Gross top-up sudah termasuk PPN; tidak ditambah lagi.',
      },
      sourceCoverage: coverage,
      ...control,
      status: finalityReasons.length ? 'running' : 'calculated',
      finalityReasons,
    });
  } catch (error) {
    console.error('Cash cohort control API error:', error);
    return NextResponse.json({ error: 'Gagal memuat Kontrol Kas Cohort.' }, { status: 500 });
  } finally {
    conn.release();
  }
}
