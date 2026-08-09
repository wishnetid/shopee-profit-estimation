import { NextResponse } from 'next/server';
import { getPool } from './db';

export function parseStoreId(value: string | null | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function storeExists(storeId: number): Promise<boolean> {
  const [rows] = await getPool().query<any[]>('SELECT id FROM stores WHERE id = ? LIMIT 1', [storeId]);
  return rows.length > 0;
}

export function missingStoreResponse() {
  return NextResponse.json({ error: 'storeId wajib diisi. Pilih toko aktif terlebih dahulu.' }, { status: 400 });
}

export function invalidStoreResponse() {
  return NextResponse.json({ error: 'Toko aktif tidak ditemukan. Muat ulang halaman lalu pilih toko.' }, { status: 404 });
}

export async function requireStoreId(value: string | null | undefined) {
  const storeId = parseStoreId(value);
  if (!storeId) return { response: missingStoreResponse(), storeId: null };
  if (!(await storeExists(storeId))) return { response: invalidStoreResponse(), storeId: null };
  return { response: null, storeId };
}
