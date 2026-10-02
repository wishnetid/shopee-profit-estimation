import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '../../../lib/db';
import { requireStoreId } from '../../../lib/store';
import { loadProfitActualData } from '../../../lib/profit-actual-data';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const storeCheck = await requireStoreId(request.nextUrl.searchParams.get('storeId'));
  if (storeCheck.response) return storeCheck.response;
  const storeId = storeCheck.storeId as number;
  const from = request.nextUrl.searchParams.get('dateFrom') || '2026-08-01';
  const to = request.nextUrl.searchParams.get('dateTo') || '2026-08-31';
  const releaseFrom = request.nextUrl.searchParams.get('releaseDateFrom') || '';
  const releaseTo = request.nextUrl.searchParams.get('releaseDateTo') || '';
  const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (!isDate(from) || !isDate(to) || from > to) return NextResponse.json({ error: 'Rentang Waktu Pesanan Dibuat tidak valid.' }, { status: 400 });
  if ((releaseFrom && !isDate(releaseFrom)) || (releaseTo && !isDate(releaseTo)) || (releaseFrom && releaseTo && releaseFrom > releaseTo)) return NextResponse.json({ error: 'Rentang Tanggal Dana Dilepaskan tidak valid.' }, { status: 400 });

  const conn = await getConnection();
  try {
    const data = await loadProfitActualData(conn, storeId, from, to, releaseFrom, releaseTo);
    return NextResponse.json({
      success: true,
      storeId,
      dateRange: { dateFrom: from, dateTo: to, releaseDateFrom: releaseFrom || null, releaseDateTo: releaseTo || null },
      ...data.report,
      exceptionDetails: data.exceptionDetails,
      orderItems: data.orderItems,
      skuAllocations: data.skuAllocations,
      returnQcReview: data.returnQcReview,
    });
  } catch (error) {
    console.error('Profit actual API error:', error);
    return NextResponse.json({ error: 'Gagal memuat Profit Aktual.' }, { status: 500 });
  } finally {
    conn.release();
  }
}
