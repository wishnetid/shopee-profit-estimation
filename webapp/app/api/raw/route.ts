import { NextRequest, NextResponse } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { getConnection } from '../../../lib/db';
import { requireStoreId } from '../../../lib/store';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { parsePagination } = require('../../../lib/pagination.js') as {
  parsePagination: (page: string | null, limit: string | null) => { page: number; limit: number; error: string | null };
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildRawExpansionQueryPlan } = require('../../../lib/raw-expansion-query.js') as {
  buildRawExpansionQueryPlan: (options: Record<string, unknown>) => RawQueryPlan;
};

type RawReportType = 'balance' | 'cancellation' | 'failed_delivery' | 'return_refund' | 'ads';
type RawQueryPlan = {
  table: string;
  fromSql: string;
  selectSql: string;
  whereSql: string;
  params: unknown[];
  orderSql: string;
};
type RawImportRow = RowDataPacket & Record<string, unknown>;
type RawDataRow = RowDataPacket & Record<string, unknown>;
type CountRow = RowDataPacket & { total: number | string };

const PARENTS: Record<RawReportType, string> = {
  balance: 'balance_report_imports',
  cancellation: 'order_cancellation_report_imports',
  failed_delivery: 'order_failed_delivery_report_imports',
  return_refund: 'order_return_refund_report_imports',
  ads: 'ads_report_imports',
};

function parseReportType(value: string | null): RawReportType | null {
  if (value === 'balance' || value === 'cancellation' || value === 'failed_delivery' || value === 'return_refund' || value === 'ads') return value;
  return null;
}

function messageFrom(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const storeCheck = await requireStoreId(sp.get('storeId'));
  if (storeCheck.response) return storeCheck.response;
  const reportType = parseReportType(sp.get('reportType'));
  if (!reportType) return NextResponse.json({ error: 'Invalid RAW report type.' }, { status: 400 });
  const pagination = parsePagination(sp.get('page'), sp.get('limit'));
  if (pagination.error) return NextResponse.json({ error: pagination.error }, { status: 400 });
  const sort = sp.get('sort') || 'imported_at';
  const direction = sp.get('direction') || 'desc';

  let plan: RawQueryPlan;
  try {
    plan = buildRawExpansionQueryPlan({
      section: reportType,
      storeId: storeCheck.storeId,
      search: sp.get('search') || '',
      sort,
      direction,
      type: sp.get('type') || '',
      kind: sp.get('kind') || '',
      status: sp.get('status') || '',
      description: sp.get('description') || '',
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: messageFrom(error, 'Invalid RAW query.') }, { status: 400 });
  }

  const conn = await getConnection();
  try {
    const parent = PARENTS[reportType];
    const importsSql = `SELECT id, store_id, source_file, source_sha256, report_period_from, report_period_to, metadata_payload, warnings_payload, imported_at${reportType === 'balance' ? ', summary_total_saldo_masuk, summary_total_saldo_keluar, reconciliation_status, ledger_continuity_status' : ''}${reportType === 'ads' ? ', currency, seller_username, source_store_reference' : ''} FROM ${parent} WHERE store_id = ? ORDER BY imported_at DESC, id DESC`;
    const [imports] = await conn.query<RawImportRow[]>(importsSql, [storeCheck.storeId]);
    const offset = (pagination.page - 1) * pagination.limit;
    const [data] = await conn.query<RawDataRow[]>(`SELECT ${plan.selectSql} FROM ${plan.fromSql} ${plan.whereSql} ORDER BY ${plan.orderSql}, r.id DESC LIMIT ? OFFSET ?`, [...plan.params, pagination.limit, offset]);
    const [[count]] = await conn.query<CountRow[]>(`SELECT COUNT(*) AS total FROM ${plan.fromSql} ${plan.whereSql}`, plan.params);
    return NextResponse.json({ success: true, storeId: storeCheck.storeId, reportType, imports, packageCount: imports.length, data, total: Number(count.total || 0), page: pagination.page, limit: pagination.limit, sort, direction });
  } catch (error: unknown) {
    return NextResponse.json({ error: messageFrom(error, 'RAW query failed.') }, { status: 500 });
  } finally {
    conn.release();
  }
}
