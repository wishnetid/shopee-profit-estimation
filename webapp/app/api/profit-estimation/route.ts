import { NextRequest, NextResponse } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { getConnection } from '../../../lib/db';
import { requireStoreId } from '../../../lib/store';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { parsePagination } = require('../../../lib/pagination.js') as {
  parsePagination: (page: string | null, limit: string | null) => { page: number; limit: number; error: string | null };
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildEstimationReport, validateDateRange } = require('../../../lib/profit-estimation.js') as {
  buildEstimationReport: (input: {
    orderRows: OrderRow[];
    skuRows: SkuRow[];
    adsRows: AdsRow[];
    exceptionOrderNumbers: string[];
    dateFrom: string | null;
    dateTo: string | null;
    page: number;
    limit: number;
  }) => unknown;
  validateDateRange: (dateFrom: string | null, dateTo: string | null) => { dateFrom: string | null; dateTo: string | null };
};

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type OrderRow = RowDataPacket & {
  no_pesanan: string | null;
  status_pesanan: string | null;
  alasan_pembatalan: string | null;
  status_pembatalan_pengembalian: string | null;
  total_pembayaran: string | number | null;
  waktu_pesanan_dibuat: string | null;
  nomor_referensi_sku: string | null;
  sku_induk: string | null;
  nama_produk: string | null;
  nama_variasi: string | null;
  jumlah: string | number | null;
  returned_quantity: string | number | null;
};

type SkuRow = RowDataPacket & {
  sku1: string | null;
  sku2: string | null;
  harga: string | number | null;
};

type AdsRow = RowDataPacket & {
  ads_report_import_id: number | null;
  transaction_date: string | null;
  sequence_number: string | number | null;
  description: string | null;
  jumlah_signed: string | number | null;
  note: string | null;
};

type ExceptionOrderRow = RowDataPacket & {
  no_pesanan: string | null;
};

type SkuImportRow = RowDataPacket & {
  id: number;
  source_file: string;
  imported_at: string;
};

function messageFrom(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const storeCheck = await requireStoreId(sp.get('storeId'));
  if (storeCheck.response) return storeCheck.response;

  const pagination = parsePagination(sp.get('page'), sp.get('limit'));
  if (pagination.error) return NextResponse.json({ error: pagination.error }, { status: 400 });

  let dateRange: { dateFrom: string | null; dateTo: string | null };
  try {
    dateRange = validateDateRange(sp.get('dateFrom'), sp.get('dateTo'));
  } catch (error: unknown) {
    return NextResponse.json({ error: messageFrom(error, 'Rentang tanggal tidak valid.') }, { status: 400 });
  }

  // First select matching order headers, then fetch every item row belonging to
  // each selected order. Filtering item rows directly can silently omit a sibling
  // with missing/inconsistent timestamp and turn an unsafe order into an estimate.
  const scopedOrderFilters = ['scoped.store_id = ?'];
  const scopedOrderParams: Array<number | string> = [storeCheck.storeId as number];
  const adsFilters = ['i.store_id = ?'];
  const adsParams: Array<number | string> = [storeCheck.storeId as number];

  if (dateRange.dateFrom) {
    scopedOrderFilters.push('DATE(scoped.waktu_pesanan_dibuat) >= ?');
    scopedOrderParams.push(dateRange.dateFrom);
    adsFilters.push('r.transaction_date >= ?');
    adsParams.push(dateRange.dateFrom);
  }
  if (dateRange.dateTo) {
    scopedOrderFilters.push('DATE(scoped.waktu_pesanan_dibuat) <= ?');
    scopedOrderParams.push(dateRange.dateTo);
    adsFilters.push('r.transaction_date <= ?');
    adsParams.push(dateRange.dateTo);
  }

  const conn = await getConnection();
  try {
    const [[skuImport]] = await conn.query<SkuImportRow[]>(`
      SELECT id, source_file, DATE_FORMAT(imported_at, '%Y-%m-%d %H:%i:%s') AS imported_at
      FROM sku_report_imports
      ORDER BY imported_at DESC, id DESC
      LIMIT 1
    `);

    const skuRows = skuImport
      ? (await conn.query<SkuRow[]>(`
          SELECT sku1, sku2, harga
          FROM sku_master_raw
          WHERE sku_report_import_id = ?
          ORDER BY id ASC
        `, [skuImport.id]))[0]
      : [];

    const [orderRows] = await conn.query<OrderRow[]>(`
      SELECT
        o.no_pesanan,
        o.status_pesanan,
        o.alasan_pembatalan,
        o.status_pembatalan_pengembalian,
        o.total_pembayaran,
        DATE_FORMAT(o.waktu_pesanan_dibuat, '%Y-%m-%d %H:%i:%s') AS waktu_pesanan_dibuat,
        o.nomor_referensi_sku,
        o.sku_induk,
        o.nama_produk,
        o.nama_variasi,
        o.jumlah,
        o.returned_quantity
      FROM order_all o
      INNER JOIN (
        SELECT DISTINCT
          scoped.store_id,
          CASE
            WHEN NULLIF(TRIM(scoped.no_pesanan), '') IS NULL THEN CONCAT('row:', scoped.id)
            ELSE CONCAT('order:', TRIM(scoped.no_pesanan))
          END AS selected_order_key
        FROM order_all scoped
        WHERE ${scopedOrderFilters.join(' AND ')}
      ) scoped_orders
        ON scoped_orders.store_id = o.store_id
        AND scoped_orders.selected_order_key = CASE
          WHEN NULLIF(TRIM(o.no_pesanan), '') IS NULL THEN CONCAT('row:', o.id)
          ELSE CONCAT('order:', TRIM(o.no_pesanan))
        END
      WHERE o.store_id = ?
      ORDER BY o.waktu_pesanan_dibuat DESC, o.no_pesanan DESC, o.id DESC
    `, [...scopedOrderParams, storeCheck.storeId as number]);

    const [adsRows] = await conn.query<AdsRow[]>(`
      SELECT
        r.ads_report_import_id,
        DATE_FORMAT(r.transaction_date, '%Y-%m-%d') AS transaction_date,
        r.sequence_number,
        r.description,
        r.jumlah_signed,
        r.note
      FROM ads_transactions_raw r
      INNER JOIN ads_report_imports i ON i.id = r.ads_report_import_id
      WHERE ${adsFilters.join(' AND ')}
      ORDER BY r.transaction_date DESC, r.sequence_number DESC, r.id DESC
    `, adsParams);

    // Exception reports are independent RAW sources. A current Order.all snapshot
    // can be stale or have blank cancellation markers, so any matching exception
    // order is excluded rather than presented as a safe gross estimate.
    const [exceptionOrderRows] = await conn.query<ExceptionOrderRow[]>(`
      SELECT DISTINCT no_pesanan FROM (
        SELECT r.no_pesanan
        FROM order_cancellation_raw r
        INNER JOIN order_cancellation_report_imports i ON i.id = r.order_cancellation_report_import_id
        WHERE i.store_id = ? AND NULLIF(TRIM(r.no_pesanan), '') IS NOT NULL
        UNION
        SELECT r.no_pesanan
        FROM order_return_refund_raw r
        INNER JOIN order_return_refund_report_imports i ON i.id = r.order_return_refund_report_import_id
        WHERE i.store_id = ? AND NULLIF(TRIM(r.no_pesanan), '') IS NOT NULL
        UNION
        SELECT r.no_pesanan
        FROM order_failed_delivery_raw r
        INNER JOIN order_failed_delivery_report_imports i ON i.id = r.order_failed_delivery_report_import_id
        WHERE i.store_id = ? AND NULLIF(TRIM(r.no_pesanan), '') IS NOT NULL
      ) raw_exceptions
    `, [storeCheck.storeId as number, storeCheck.storeId as number, storeCheck.storeId as number]);

    const report = buildEstimationReport({
      orderRows,
      skuRows,
      adsRows,
      exceptionOrderNumbers: exceptionOrderRows.map((row) => row.no_pesanan || ''),
      dateFrom: dateRange.dateFrom,
      dateTo: dateRange.dateTo,
      page: pagination.page,
      limit: pagination.limit,
    });

    return NextResponse.json({
      success: true,
      storeId: storeCheck.storeId,
      skuImport: skuImport ? {
        id: skuImport.id,
        sourceFile: skuImport.source_file,
        importedAt: skuImport.imported_at,
      } : null,
      ...report as Record<string, unknown>,
    });
  } catch (error: unknown) {
    console.error('Profit estimation API error:', error);
    return NextResponse.json({ error: messageFrom(error, 'Gagal menghitung estimasi kotor.') }, { status: 500 });
  } finally {
    conn.release();
  }
}
