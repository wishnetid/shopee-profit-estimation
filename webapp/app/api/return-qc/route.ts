import { NextRequest, NextResponse } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { getConnection } from '../../../lib/db';
import { requireStoreId } from '../../../lib/store';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { isMutationAuthorized, isSameOriginMutation } = require('../../../lib/dashboard-auth.js') as { isMutationAuthorized: (authorization:string|null,cookie:string|null)=>boolean; isSameOriginMutation:(origin:string|null,expected:string)=>boolean };

const allowed = new Set(['belum_dinilai', 'restock_layak', 'rusak', 'hilang']);
type ReturnDecision = { noPengembalian: string; noPesanan: string };
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function validDecision(value: unknown): ReturnDecision | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const noPengembalian = String(row.noPengembalian ?? '').trim();
  const noPesanan = String(row.noPesanan ?? '').trim();
  return noPengembalian && noPesanan ? { noPengembalian, noPesanan } : null;
}

export async function POST(request: NextRequest) {
  if (!isMutationAuthorized(request.headers.get('authorization'), request.headers.get('cookie'))) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (!request.headers.get('authorization') && !isSameOriginMutation(request.headers.get('origin'), request.nextUrl.origin)) return NextResponse.json({ error: 'Cross-origin request rejected.' }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Malformed JSON.' }, { status: 400 });
  const payload = body as Record<string, unknown>;
  const store = await requireStoreId(String(payload.storeId ?? ''));
  if (store.response) return store.response;
  const status = String(payload.qcStatus ?? '');
  const note = typeof payload.qcNote === 'string' ? payload.qcNote.trim() : '';
  const rawReturns: ReturnDecision[] = Array.isArray(payload.returns)
    ? (payload.returns as unknown[]).map(validDecision).filter((row): row is ReturnDecision => Boolean(row))
    : [validDecision(body)].filter((row): row is ReturnDecision => Boolean(row));
  const seen = new Set<string>();
  const unique = rawReturns.filter((row) => { const key = `${row.noPengembalian}\u0000${row.noPesanan}`; if (seen.has(key)) return false; seen.add(key); return true; });
  if (!allowed.has(status) || !unique.length || unique.length > 500 || note.length > 2000 || (unique.length > 1 && !note)) return NextResponse.json({ error: 'Data QC bulk tidak valid. Catatan wajib untuk keputusan bulk.' }, { status: 400 });
  const conn = await getConnection();
  try {
    const marks = unique.map(() => '(?,?)').join(',');
    const params = unique.flatMap((row) => [row.noPengembalian, row.noPesanan]);
    const [source] = await conn.query<Array<RowDataPacket & { no_pengembalian: string; no_pesanan: string }>>(
      `SELECT DISTINCT r.no_pengembalian,r.no_pesanan FROM order_return_refund_raw r JOIN order_return_refund_report_imports i ON i.id=r.order_return_refund_report_import_id WHERE i.store_id=? AND (r.no_pengembalian,r.no_pesanan) IN (${marks})`,
      [store.storeId, ...params],
    );
    if (source.length !== unique.length) return NextResponse.json({ error: 'Sebagian Return tidak ditemukan pada RAW toko aktif.' }, { status: 404 });
    await conn.beginTransaction();
    try {
      await conn.query(
        `INSERT INTO return_qc_decisions (store_id,no_pengembalian,no_pesanan,qc_status,qc_note) VALUES ${unique.map(() => '(?,?,?,?,?)').join(',')} ON DUPLICATE KEY UPDATE no_pesanan=VALUES(no_pesanan),qc_status=VALUES(qc_status),qc_note=VALUES(qc_note)`,
        unique.flatMap((row) => [store.storeId, row.noPengembalian, row.noPesanan, status, note || null]),
      );
      await conn.commit();
    } catch (error) { await conn.rollback(); throw error; }
    return NextResponse.json({ success: true, updated: unique.length, qcStatus: status });
  } catch (error) { console.error('Return QC mutation error:', error); return NextResponse.json({ error: 'Gagal menyimpan QC.' }, { status: 500 }); } finally { conn.release(); }
}
