import { NextRequest, NextResponse } from 'next/server';
import { createConnection, Connection } from 'mysql2/promise';
import * as XLSX from 'xlsx';

// Shared with node:test regression tests. The raw Shopee export uses IDR dot-thousands strings.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  parseIdr,
  parseSnapshotAt,
  resolveOrderSnapshot,
  validateOrderAllCompositeKeys,
  validateOrderAllHeaders,
} = require('../../../lib/order-all-import.js') as {
  parseIdr: (value: unknown) => number | null;
  parseSnapshotAt: (value: unknown) => string | null;
  resolveOrderSnapshot: (
    existingRow: Record<string, unknown>,
    incomingRow: Record<string, unknown>,
    columns: string[],
    options?: { existingSnapshotAt?: unknown; incomingSnapshotAt?: unknown },
  ) => {
    row: Record<string, unknown>;
    protectedColumns: string[];
    staleSnapshot: boolean;
    staleBySnapshotAt: boolean;
    staleByStatus: boolean;
    incomingProvenFresher: boolean;
  };
  validateOrderAllCompositeKeys: (rows: Record<string, unknown>[]) => {
    valid: boolean;
    duplicateCount: number;
    missingCount: number;
    duplicateSamples: Array<{ row: number; key: string }>;
    missingSamples: number[];
  };
  validateOrderAllHeaders: (headers: unknown[]) => { valid: boolean; missing: string[]; unexpected: string[] };
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  isDashboardAuthEnabled,
  isSameOriginMutation,
  isValidBasicAuthorization,
  validateUploadFile,
} = require('../../../lib/dashboard-auth.js') as {
  isDashboardAuthEnabled: (env?: NodeJS.ProcessEnv) => boolean;
  isSameOriginMutation: (origin: string | null, expectedOrigin: string) => boolean;
  isValidBasicAuthorization: (authorization: string | null, username: string | undefined, password: string | undefined) => boolean;
  validateUploadFile: (file: { name: string; size: number; type: string } | null) => { valid: boolean; error: string | null };
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  computeSha256,
  parseIncomePackage,
} = require('../../../lib/income-raw-import.js') as {
  computeSha256: (buffer: Buffer) => string;
  parseIncomePackage: (workbook: XLSX.WorkBook, sourceFile: string, sha256: string) => any;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  buildIncomePreview,
  findExistingIncomeImport,
  importIncomePackage,
} = require('../../../lib/income-raw-db.js') as {
  buildIncomePreview: (parsed: any, existingImport: any) => any;
  findExistingIncomeImport: (conn: Connection, sha256: string) => Promise<any>;
  importIncomePackage: (conn: Connection, parsed: any) => Promise<any>;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  parseSkuRawPackage,
} = require('../../../lib/sku-raw-import.js') as {
  parseSkuRawPackage: (workbook: XLSX.WorkBook, sourceFile: string, sha256: string) => any;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  buildSkuPreview,
  findExistingSkuImport,
  importSkuRawPackage,
} = require('../../../lib/sku-raw-db.js') as {
  buildSkuPreview: (parsed: any, existingImport: any) => any;
  findExistingSkuImport: (conn: Connection, sha256: string) => Promise<any>;
  importSkuRawPackage: (conn: Connection, parsed: any) => Promise<any>;
};

const BATCH_SIZE = 100;

async function getConnection() {
  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;
  if (!DB_HOST || !DB_USER || !DB_PASSWORD || !DB_NAME) {
    throw new Error('Database environment variables are incomplete');
  }
  return createConnection({
    host: DB_HOST,
    port: parseInt(DB_PORT || '3306'),
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    dateStrings: true,
  });
}

function sanitize(val: any): any {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  if (s === '' || s === '-' || s === 'N/A' || s === 'n/a' || s === 'null') return null;
  return val;
}

function sanitizeDatetime(val: any): any {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  if (s === '' || s === '-' || s === 'N/A' || s === 'n/a' || s === 'null') return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s;
  if (typeof val === 'number' && val > 40000 && val < 50000) {
    const date = new Date((val - 25569) * 86400 * 1000);
    return date.toISOString().slice(0, 19).replace('T', ' ');
  }
  return null;
}

function sanitizeDecimal(val: unknown): number | null {
  return parseIdr(val);
}

function sameImportValue(incoming: unknown, stored: unknown): boolean {
  const normalizeEmpty = (value: unknown): string | null => {
    if (value === undefined || value === null) return null;
    const text = String(value).trim();
    return text === '' || text === '-' || text.toLowerCase() === 'n/a' || text.toLowerCase() === 'null' ? null : text;
  };

  const incomingText = normalizeEmpty(incoming);
  const storedText = normalizeEmpty(stored);
  if (incomingText === null || storedText === null) return incomingText === storedText;

  if (typeof incoming === 'number') return Number(stored) === incoming;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(incomingText)) return storedText.slice(0, 16) === incomingText;
  return incomingText === storedText;
}

function orderValuesToRow(values: unknown[]): Record<string, unknown> {
  return Object.fromEntries(ORDER_COLS.map((column, index) => [column, values[index]]));
}

function shouldWriteSnapshotProvenance(
  existingRow: Record<string, unknown>,
  incomingSnapshotAt: string,
  resolution: { staleSnapshot: boolean; protectedColumns: string[]; incomingProvenFresher: boolean },
): boolean {
  if (resolution.staleSnapshot) return false;
  const existingSnapshotAt = existingRow.source_snapshot_at == null
    ? null
    : String(existingRow.source_snapshot_at).slice(0, 19);

  // Existing legacy rows have no timestamp proof. A cleanly matching upload
  // is allowed to establish provenance, so the operator can seed the current
  // known snapshot once. Any stale/conflicting/downgraded field already made
  // `protectedColumns` non-empty and therefore cannot establish provenance.
  if (!existingSnapshotAt) {
    return resolution.protectedColumns.length === 0;
  }
  return incomingSnapshotAt > existingSnapshotAt;
}

function detectReportType(workbook: XLSX.WorkBook): string | null {
  for (const name of workbook.SheetNames) {
    if (name.toLowerCase() === 'orders') {
      const sheet = workbook.Sheets[name];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];
      if (data.length > 0 && validateOrderAllHeaders(data[0] || []).valid) return 'order_all';
    }
  }
  for (const name of workbook.SheetNames) {
    if (name.toLowerCase().includes('penghasilan')) return 'income';
  }
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
    if (data.length > 0) {
      const headers = data[0].map((h: any) => String(h || '').toLowerCase());
      if (headers.includes('sku1') && headers.includes('harga')) return 'master';
    }
  }
  return null;
}

function normalizeSourceSnapshotAt(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string') return null;
  // Preserve the operator-entered Shopee export clock for ordering. The shared
  // parser validates actual calendar values, not only a regex-shaped string.
  return parseSnapshotAt(value.trim().replace('T', ' '));
}

function validateOrderAllWorkbook(workbook: XLSX.WorkBook) {
  const sheetName = workbook.SheetNames.find((name) => name.toLowerCase() === 'orders');
  if (!sheetName) return { valid: false, error: 'Sheet orders tidak ditemukan.' };

  const sheet = workbook.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as unknown[][];
  const headerValidation = validateOrderAllHeaders(rawData[0] || []);
  if (!headerValidation.valid) {
    return { valid: false, error: 'Header Order.all tidak sesuai kontrak export Shopee.' };
  }

  const headers = (rawData[0] || []).map((value) => String(value || '').trim());
  const rows = rawData.slice(1)
    .filter((row) => row.some((value) => value !== null && String(value).trim() !== ''))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index]])));
  const keyValidation = validateOrderAllCompositeKeys(rows);
  if (!keyValidation.valid) {
    if (keyValidation.duplicateCount > 0) {
      return {
        valid: false,
        error: `Order.all ditolak: ditemukan duplicate composite key dalam workbook (contoh row Excel: ${keyValidation.duplicateSamples.map((sample) => sample.row).join(', ')}).`,
      };
    }
    return {
      valid: false,
      error: `Order.all ditolak: composite key wajib lengkap (contoh row Excel: ${keyValidation.missingSamples.join(', ')}).`,
    };
  }

  return { valid: true, error: null };
}

function getReportName(type: string): string {
  switch (type) {
    case 'order_all': return 'Order.all';
    case 'income': return 'Income Penghasilan';
    case 'master': return 'SKU Master RAW';
    default: return type;
  }
}

// ─── PREVIEW ───────────────────────────────────────────

// Status progression order — higher = more advanced
const STATUS_ORDER: Record<string, number> = {
  'Belum Bayar': 0,
  'Perlu Dikirim': 1,
  'Sedang Dikirim': 2,
  'Telah Dikirim': 3,
  'Selesai': 4,
  'Batal': 4, // terminal state
};

function isRegression(oldStatus: string | null, newStatus: string | null): boolean {
  if (!oldStatus || !newStatus) return false;
  const oldRank = STATUS_ORDER[oldStatus];
  const newRank = STATUS_ORDER[newStatus];
  if (oldRank === undefined || newRank === undefined) return false;
  return oldRank > newRank;
}

function isResiRegression(oldResi: any, newResi: any): boolean {
  const oldStr = oldResi != null ? String(oldResi).trim() : '';
  const newStr = newResi != null ? String(newResi).trim() : '';
  // Regression: had resi but now null/empty
  return oldStr !== '' && newStr === '';
}

// Extract composite keys from Excel for order_all
function extractOrderKeys(workbook: XLSX.WorkBook): string[][] {
  let sheetName = workbook.SheetNames.find(n => n.toLowerCase() === 'orders');
  if (!sheetName) sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet) as any[];
  return data.map(r => [
    sanitize(r['No. Pesanan']),
    sanitize(r['Nomor Referensi SKU']),
    sanitize(r['Nama Variasi']),
  ]).filter(k => k[0] && k[1] && k[2]);
}

// Check which keys exist in DB, return full rows for overlap comparison
async function fetchExistingRows(conn: Connection, keys: string[][], table: string, keyCols: string[], selectCols: string[]): Promise<Map<string, any>> {
  const existing = new Map<string, any>();
  if (keys.length === 0) return existing;

  for (let i = 0; i < keys.length; i += 200) {
    const batch = keys.slice(i, i + 200);
    const placeholders = batch.map(() => `(${keyCols.map(() => '?').join(',')})`).join(',');
    const flatParams = batch.flat();
    const [rows] = await conn.query(
      `SELECT ${selectCols.join(',')} FROM ${table} WHERE (${keyCols.join(',')}) IN (${placeholders})`,
      flatParams
    ) as any[];
    for (const row of rows) {
      const key = keyCols.map(c => row[c]).join('||');
      existing.set(key, row);
    }
  }
  return existing;
}

async function previewOrderAll(
  workbook: XLSX.WorkBook,
  conn: Connection,
  sourceSnapshotAt: string,
  sourceSnapshotFile: string,
) {
  let sheetName = workbook.SheetNames.find(n => n.toLowerCase() === 'orders');
  if (!sheetName) sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

  if (rawData.length === 0) return null;

  const headers = rawData[0] as string[];
  const rows = rawData.slice(1);
  const headerMap: Record<string, number> = {};
  headers.forEach((header, index) => { if (header) headerMap[String(header).trim()] = index; });

  const previewCols = ['No. Pesanan', 'Status Pesanan', 'Nomor Referensi SKU', 'Nama Variasi', 'Jumlah', 'Harga Setelah Diskon', 'Total Pembayaran', 'Waktu Pesanan Dibuat'];
  const previewHeaders = previewCols.filter(c => headers.includes(c));
  const previewRows = rows.map(row => {
    const obj: Record<string, any> = {};
    headers.forEach((h, i) => { if (h) obj[String(h).trim()] = row[i]; });
    const mapped: Record<string, any> = {};
    previewHeaders.forEach(h => { mapped[h] = obj[h] ?? null; });
    return mapped;
  });

  const allKeys = extractOrderKeys(workbook);
  const dbRows = await fetchExistingRows(
    conn,
    allKeys,
    'order_all',
    ['no_pesanan', 'nomor_referensi_sku', 'nama_variasi'],
    [...ORDER_COLS, 'source_snapshot_at', 'source_snapshot_file'],
  );

  let newCount = 0;
  let existingCount = 0;
  let safeUpdateCount = 0;
  let protectedFieldCount = 0;
  let staleSnapshotCount = 0;
  const updatedRows: any[] = [];

  for (const rawDataRow of rows) {
    const excelRow: Record<string, unknown> = {};
    headers.forEach((header, index) => { if (header) excelRow[String(header).trim()] = rawDataRow[index]; });
    const importedValues = extractOrderRow(excelRow);
    const importedRow = orderValuesToRow(importedValues);
    const keyParts = [
      String(importedRow.no_pesanan || '').trim(),
      String(importedRow.nomor_referensi_sku || '').trim(),
      String(importedRow.nama_variasi || '').trim(),
    ];
    const dbRow = dbRows.get(keyParts.join('||'));

    if (!dbRow) {
      newCount++;
      continue;
    }

    existingCount++;
    const resolution = resolveOrderSnapshot(dbRow, importedRow, ORDER_COLS, {
      existingSnapshotAt: dbRow.source_snapshot_at,
      incomingSnapshotAt: sourceSnapshotAt,
    });
    const changes: any[] = [];
    const protectedColumns = new Set(resolution.protectedColumns);

    ORDER_COLS.forEach((dbCol) => {
      if (sameImportValue(importedRow[dbCol], dbRow[dbCol])) return;
      const isProtected = protectedColumns.has(dbCol);
      changes.push({
        column: dbCol,
        dbColumn: dbCol,
        from: dbRow[dbCol] == null || String(dbRow[dbCol]).trim() === '' ? '(kosong)' : String(dbRow[dbCol]),
        to: importedRow[dbCol] == null || String(importedRow[dbCol]).trim() === '' ? '(kosong)' : String(importedRow[dbCol]),
        protected: isProtected,
      });
    });

    const effectiveChanged = ORDER_COLS.some((dbCol) => !sameImportValue(resolution.row[dbCol], dbRow[dbCol]));
    const writesProvenance = shouldWriteSnapshotProvenance(dbRow, sourceSnapshotAt, resolution);
    if (effectiveChanged || writesProvenance) safeUpdateCount++;
    protectedFieldCount += resolution.protectedColumns.length;
    if (resolution.staleSnapshot) staleSnapshotCount++;

    if (changes.length > 0) {
      updatedRows.push({
        no_pesanan: keyParts[0],
        sku: keyParts[1],
        variasi: keyParts[2],
        changes,
        regressions: changes.filter(change => change.protected).map(change => ({
          type: resolution.staleSnapshot ? 'stale_snapshot' : 'quality_downgrade',
          column: change.column,
          from: change.from,
          to: change.to,
          message: resolution.staleSnapshot
            ? `Snapshot lama ditahan: ${change.from} → ${change.to}`
            : `Nilai kosong/tersamarkan ditahan: ${change.from} → ${change.to}`,
        })),
        safeUpdate: effectiveChanged || writesProvenance,
      });
    }
  }

  return {
    headers: headers.filter(Boolean).map(String),
    totalRows: rows.length,
    newRows: newCount,
    existingRows: existingCount,
    updatedRows,
    safeUpdateRows: safeUpdateCount,
    protectedFieldCount,
    staleSnapshotCount,
    regressionCount: updatedRows.filter(row => row.regressions.length > 0).length,
    unchangedRows: existingCount - safeUpdateCount,
    previewColumns: previewHeaders,
    previewRows,
    sheetName,
    sourceSnapshotAt,
    sourceSnapshotFile,
  };
}

async function previewIncome(workbook: XLSX.WorkBook, conn: Connection) {
  let sheetName = workbook.SheetNames.find(n => n.toLowerCase().includes('penghasilan'));
  if (!sheetName) sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

  let headerIdx = -1;
  for (let i = 0; i < Math.min(rawData.length, 10); i++) {
    if (rawData[i] && String(rawData[i][0] || '').includes('No. Pesanan')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return null;

  const headers = rawData[headerIdx].filter(Boolean).map(String);
  const rows = rawData.slice(headerIdx + 1);

  const previewCols = ['No. Pesanan', 'Lihat berdasarkan', 'Harga Produk', 'Jumlah Dibayar Pembeli', 'Waktu Pesanan Dibuat', 'Tanggal Dana Dilepaskan'];
  const previewHeaders = previewCols.filter(c => headers.includes(c));
  const previewRows = rows.slice(0, 10).map(row => {
    const obj: Record<string, any> = {};
    headers.forEach((h, i) => { if (h) obj[h] = row[i]; });
    const mapped: Record<string, any> = {};
    previewHeaders.forEach(h => { mapped[h] = obj[h] ?? null; });
    return mapped;
  });

  // Check income by no_pesanan (single key)
  const allKeys = rows.map(r => {
    const obj: any = {};
    headers.forEach((h, i) => { if (h) obj[h] = r[i]; });
    return [sanitize(obj['No. Pesanan'])];
  }).filter(k => k[0]);

  const dbRows = await fetchExistingRows(conn, allKeys, 'income_penghasilan', ['no_pesanan'], ['no_pesanan']);
  let newCount = 0;
  let existingCount = 0;
  for (const k of allKeys) {
    if (dbRows.has(k[0])) existingCount++;
    else newCount++;
  }

  return {
    headers,
    totalRows: rows.length,
    newRows: newCount,
    existingRows: existingCount,
    previewColumns: previewHeaders,
    previewRows,
    sheetName,
  };
}

async function handlePreview(
  workbook: XLSX.WorkBook,
  reportType: string,
  conn: Connection,
  sourceSnapshotAt: string | null,
  sourceSnapshotFile: string,
) {
  switch (reportType) {
    case 'order_all':
      if (!sourceSnapshotAt) throw new Error('Waktu snapshot wajib diisi untuk Order.all');
      return previewOrderAll(workbook, conn, sourceSnapshotAt, sourceSnapshotFile);
    case 'income': return previewIncome(workbook, conn);
    default: return null;
  }
}

// ─── IMPORT ────────────────────────────────────────────

const ORDER_COLS = [
  'no_pesanan','status_pesanan','alasan_pembatalan',
  'status_pembatalan_pengembalian','no_resi','opsi_pengiriman','antar_ke_counter',
  'pesanan_harus_dikirim_sebelum','waktu_pengiriman_diatur',
  'waktu_pesanan_dibuat','waktu_pembayaran_dilakukan',
  'tipe_pesanan','metode_pembayaran',
  'sku_induk','nama_produk','nomor_referensi_sku','nama_variasi',
  'harga_awal','harga_setelah_diskon','jumlah','returned_quantity',
  'subtotal_pesanan','total_diskon',
  'diskon_dari_penjual','diskon_dari_shopee',
  'berat_produk','jumlah_produk_di_pesan','total_berat',
  'voucher_ditanggung_penjual','cashback_koin',
  'voucher_ditanggung_shopee','paket_diskon',
  'paket_diskon_shopee','paket_diskon_penjual',
  'potongan_koin_shopee','diskon_kartu_kredit',
  'ongkos_kirim_dibayar_pembeli',
  'estimasi_potongan_biaya_pengiriman',
  'ongkos_kirim_pengembalian_barang',
  'total_pembayaran','perkiraan_ongkos_kirim',
  'catatan_dari_pembeli','catatan',
  'username_pembeli','nama_penerima','no_telepon',
  'alamat_pengiriman','kota_kabupaten','provinsi',
  'waktu_pesanan_selesai'
];

const ORDER_FIELDS_MAP: Record<string, (row: any) => any> = {
  'no_pesanan': r => sanitize(r['No. Pesanan']),
  'status_pesanan': r => sanitize(r['Status Pesanan']),
  'alasan_pembatalan': r => sanitize(r['Alasan Pembatalan']),
  'status_pembatalan_pengembalian': r => sanitize(r['Status Pembatalan/ Pengembalian']),
  'no_resi': r => sanitize(r['No. Resi']),
  'opsi_pengiriman': r => sanitize(r['Opsi Pengiriman']),
  'antar_ke_counter': r => sanitize(r['Antar ke counter/ pick-up']),
  'pesanan_harus_dikirim_sebelum': r => sanitizeDatetime(r['Pesanan Harus Dikirimkan Sebelum (Menghindari keterlambatan)']),
  'waktu_pengiriman_diatur': r => sanitizeDatetime(r['Waktu Pengiriman Diatur']),
  'waktu_pesanan_dibuat': r => sanitizeDatetime(r['Waktu Pesanan Dibuat']),
  'waktu_pembayaran_dilakukan': r => sanitizeDatetime(r['Waktu Pembayaran Dilakukan']),
  'tipe_pesanan': r => sanitize(r['Tipe Pesanan']),
  'metode_pembayaran': r => sanitize(r['Metode Pembayaran']),
  'sku_induk': r => sanitize(r['SKU Induk']),
  'nama_produk': r => sanitize(r['Nama Produk']),
  'nomor_referensi_sku': r => sanitize(r['Nomor Referensi SKU']),
  'nama_variasi': r => sanitize(r['Nama Variasi']),
  'harga_awal': r => sanitizeDecimal(r['Harga Awal']),
  'harga_setelah_diskon': r => sanitizeDecimal(r['Harga Setelah Diskon']),
  'jumlah': r => sanitize(r['Jumlah']),
  'returned_quantity': r => sanitize(r['Returned quantity']),
  'subtotal_pesanan': r => sanitizeDecimal(r['Subtotal Pesanan']),
  'total_diskon': r => sanitizeDecimal(r['Total Diskon']),
  'diskon_dari_penjual': r => sanitizeDecimal(r['Diskon Dari Penjual']),
  'diskon_dari_shopee': r => sanitizeDecimal(r['Diskon Dari Shopee']),
  'berat_produk': r => sanitize(r['Berat Produk']),
  'jumlah_produk_di_pesan': r => sanitize(r['Jumlah Produk di Pesan']),
  'total_berat': r => sanitize(r['Total Berat']),
  'voucher_ditanggung_penjual': r => sanitizeDecimal(r['Voucher Ditanggung Penjual']),
  'cashback_koin': r => sanitizeDecimal(r['Cashback Koin']),
  'voucher_ditanggung_shopee': r => sanitizeDecimal(r['Voucher Ditanggung Shopee']),
  'paket_diskon': r => sanitize(r['Paket Diskon']),
  'paket_diskon_shopee': r => sanitizeDecimal(r['Paket Diskon (Diskon dari Shopee)']),
  'paket_diskon_penjual': r => sanitizeDecimal(r['Paket Diskon (Diskon dari Penjual)']),
  'potongan_koin_shopee': r => sanitizeDecimal(r['Potongan Koin Shopee']),
  'diskon_kartu_kredit': r => sanitizeDecimal(r['Diskon Kartu Kredit']),
  'ongkos_kirim_dibayar_pembeli': r => sanitizeDecimal(r['Ongkos Kirim Dibayar oleh Pembeli']),
  'estimasi_potongan_biaya_pengiriman': r => sanitizeDecimal(r['Estimasi Potongan Biaya Pengiriman']),
  'ongkos_kirim_pengembalian_barang': r => sanitizeDecimal(r['Ongkos Kirim Pengembalian Barang']),
  'total_pembayaran': r => sanitizeDecimal(r['Total Pembayaran']),
  'perkiraan_ongkos_kirim': r => sanitizeDecimal(r['Perkiraan Ongkos Kirim']),
  'catatan_dari_pembeli': r => sanitize(r['Catatan dari Pembeli']),
  'catatan': r => sanitize(r['Catatan']),
  'username_pembeli': r => sanitize(r['Username (Pembeli)']),
  'nama_penerima': r => sanitize(r['Nama Penerima']),
  'no_telepon': r => sanitize(r['No. Telepon']),
  'alamat_pengiriman': r => sanitize(r['Alamat Pengiriman']),
  'kota_kabupaten': r => sanitize(r['Kota/Kabupaten']),
  'provinsi': r => sanitize(r['Provinsi']),
  'waktu_pesanan_selesai': r => sanitizeDatetime(r['Waktu Pesanan Selesai']),
};

function extractOrderRow(row: any): any[] {
  return ORDER_COLS.map(c => ORDER_FIELDS_MAP[c](row));
}

async function importOrderAll(
  workbook: XLSX.WorkBook,
  conn: Connection,
  sourceSnapshotAt: string,
  sourceSnapshotFile: string,
) {
  let sheetName = workbook.SheetNames.find(n => n.toLowerCase() === 'orders');
  if (!sheetName) sheetName = workbook.SheetNames[0];

  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet) as any[];
  const insertCols = [...ORDER_COLS, 'source_snapshot_at', 'source_snapshot_file'];
  const placeholders = insertCols.map(() => '?').join(',');
  const cols = insertCols.join(',');
  const updateAssignments = insertCols
    .filter(column => !['no_pesanan', 'nomor_referensi_sku', 'nama_variasi'].includes(column))
    .map(column => `${column}=VALUES(${column})`)
    .join(',\n           ');
  let newInserted = 0;
  let updatedCount = 0;
  let guardedRows = 0;
  let protectedFields = 0;
  let errors = 0;

  const keyIdx = [
    ORDER_COLS.indexOf('no_pesanan'),
    ORDER_COLS.indexOf('nomor_referensi_sku'),
    ORDER_COLS.indexOf('nama_variasi'),
  ];

  // An import is one snapshot. Never leave the DB half-updated when a later batch fails.
  await conn.beginTransaction();
  try {
    for (let i = 0; i < data.length; i += BATCH_SIZE) {
      const rawBatch = data.slice(i, i + BATCH_SIZE);
      const incoming = rawBatch.map((row, rowOffset) => {
        const values = extractOrderRow(row);
        if (values[keyIdx[0]] == null || values[keyIdx[1]] == null || values[keyIdx[2]] == null) {
          throw new Error(`Order.all row ${i + rowOffset + 2} tidak valid: No. Pesanan, Nomor Referensi SKU, dan Nama Variasi wajib terisi`);
        }
        return { values, row: orderValuesToRow(values) };
      });
      if (incoming.length === 0) continue;

      const batchKeys = incoming.map(item => [
        item.values[keyIdx[0]], item.values[keyIdx[1]], item.values[keyIdx[2]],
      ]);
      const existingRows = await fetchExistingRows(
        conn,
        batchKeys,
        'order_all',
        ['no_pesanan', 'nomor_referensi_sku', 'nama_variasi'],
        [...ORDER_COLS, 'source_snapshot_at', 'source_snapshot_file'],
      );

      const valuesToWrite: unknown[][] = [];
      for (const item of incoming) {
        const key = [item.values[keyIdx[0]], item.values[keyIdx[1]], item.values[keyIdx[2]]].join('||');
        const existing = existingRows.get(key);

        if (!existing) {
          valuesToWrite.push([...item.values, sourceSnapshotAt, sourceSnapshotFile]);
          newInserted++;
          continue;
        }

        const resolution = resolveOrderSnapshot(existing, item.row, ORDER_COLS, {
          existingSnapshotAt: existing.source_snapshot_at,
          incomingSnapshotAt: sourceSnapshotAt,
        });
        const effectiveChanged = ORDER_COLS.some(column => !sameImportValue(resolution.row[column], existing[column]));
        const writesProvenance = shouldWriteSnapshotProvenance(existing, sourceSnapshotAt, resolution);
        if (resolution.protectedColumns.length > 0) {
          guardedRows++;
          protectedFields += resolution.protectedColumns.length;
        }

        if (!effectiveChanged && !writesProvenance) continue;

        const resolvedValues = ORDER_COLS.map(column => resolution.row[column]);
        const snapshotAt = writesProvenance
          ? sourceSnapshotAt
          : existing.source_snapshot_at;
        const snapshotFile = writesProvenance
          ? sourceSnapshotFile
          : existing.source_snapshot_file;
        valuesToWrite.push([...resolvedValues, snapshotAt, snapshotFile]);
        updatedCount++;
      }

      if (valuesToWrite.length === 0) continue;
      try {
        const valuePlaceholders = valuesToWrite.map(() => `(${placeholders})`).join(',');
        await conn.query(
          `INSERT INTO order_all (${cols}) VALUES ${valuePlaceholders}
           ON DUPLICATE KEY UPDATE
           ${updateAssignments}`,
          valuesToWrite.flat(),
        );
      } catch (error: any) {
        throw new Error(`Order.all batch starting at row ${i + 2} failed: ${error.message}`);
      }
    }

    await conn.commit();
    return {
      inserted: newInserted,
      updated: updatedCount,
      guarded: guardedRows,
      protectedFields,
      errors,
    };
  } catch (error) {
    await conn.rollback();
    throw error;
  }
}

const INCOME_COLS = [
  'no_pesanan','lihat_berdasarkan',
  'waktu_pesanan_dibuat','tanggal_dana_dilepaskan',
  'harga_produk','ongkir_dibayar_pembeli',
  'ongkos_kirim_ke_jasa_kirim','gratis_ongkir_dari_shopee',
  'biaya_administrasi','biaya_proses_pesanan',
  'biaya_gratis_ongkir_xtra','biaya_layanan_promo_xtra',
  'biaya_lainnya','jumlah_dibayar_pembeli',
  'metode_pembayaran_pembeli','username_pembeli'
];

async function importIncome(workbook: XLSX.WorkBook, conn: Connection) {
  let sheetName = workbook.SheetNames.find(n => n.toLowerCase().includes('penghasilan'));
  if (!sheetName) sheetName = workbook.SheetNames[0];

  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

  let headerIdx = -1;
  for (let i = 0; i < Math.min(data.length, 10); i++) {
    if (data[i] && String(data[i][0] || '').includes('No. Pesanan')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return { inserted: 0, errors: 0 };

  const headers = data[headerIdx];
  const rows = data.slice(headerIdx + 1);

  const placeholders = INCOME_COLS.map(() => '?').join(',');
  const cols = INCOME_COLS.join(',');
  let inserted = 0;
  let errors = 0;
  let batch: any[][] = [];

  for (const row of rows) {
    const rowData: any = {};
    headers.forEach((h: string, idx: number) => {
      if (h) rowData[String(h).trim()] = row[idx];
    });
    if (String(rowData['Lihat berdasarkan'] || '').trim() !== 'Order') continue;

    batch.push([
      sanitize(rowData['No. Pesanan']),
      sanitize(rowData['Lihat berdasarkan']),
      sanitizeDatetime(rowData['Waktu Pesanan Dibuat']),
      sanitizeDatetime(rowData['Tanggal Dana Dilepaskan']),
      sanitizeDecimal(rowData['Harga Produk']),
      sanitizeDecimal(rowData['Ongkir Dibayar Pembeli']),
      sanitizeDecimal(rowData['Ongkos Kirim yang Dibayarkan ke Jasa Kirim']),
      sanitizeDecimal(rowData['Gratis Ongkir dari Shopee']),
      sanitizeDecimal(rowData['Biaya Administrasi']),
      sanitizeDecimal(rowData['Biaya Proses Pesanan']),
      sanitizeDecimal(rowData['Biaya Gratis Ongkir XTRA - Ukuran Biasa (Kategori F)']),
      sanitizeDecimal(rowData['Biaya Layanan Promo XTRA']),
      sanitizeDecimal(rowData['Biaya Lainnya']),
      sanitizeDecimal(rowData['Jumlah Dibayar Pembeli']),
      sanitize(rowData['Metode pembayaran pembeli']),
      sanitize(rowData['Username (Pembeli)']),
    ]);

    if (batch.length >= BATCH_SIZE) {
      try {
        const vp = batch.map(() => `(${placeholders})`).join(',');
        const [res] = await conn.query(`INSERT INTO income_penghasilan (${cols}) VALUES ${vp}`, batch.flat()) as any;
        inserted += res.affectedRows || 0;
      } catch { errors++; }
      batch = [];
    }
  }

  if (batch.length > 0) {
    try {
      const vp = batch.map(() => `(${placeholders})`).join(',');
      const [res] = await conn.query(`INSERT INTO income_penghasilan (${cols}) VALUES ${vp}`, batch.flat()) as any;
      inserted += res.affectedRows || 0;
    } catch { errors++; }
  }

  await conn.commit();
  return { inserted, errors };
}

// ─── HANDLER ───────────────────────────────────────────

function unauthorizedResponse() {
  return NextResponse.json(
    { error: 'Authentication required.' },
    { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="Shopee Profit Estimation"' } },
  );
}

export async function POST(request: NextRequest) {
  let conn: Connection | null = null;
  try {
    const { DASHBOARD_BASIC_AUTH_USER, DASHBOARD_BASIC_AUTH_PASSWORD } = process.env;
    if (isDashboardAuthEnabled()) {
      if (!DASHBOARD_BASIC_AUTH_USER || !DASHBOARD_BASIC_AUTH_PASSWORD) {
        return NextResponse.json({ error: 'Dashboard authentication is not configured.' }, { status: 503 });
      }
      if (!isValidBasicAuthorization(
        request.headers.get('authorization'),
        DASHBOARD_BASIC_AUTH_USER,
        DASHBOARD_BASIC_AUTH_PASSWORD,
      )) return unauthorizedResponse();
    }
    if (!isSameOriginMutation(request.headers.get('origin'), request.nextUrl.origin)) {
      return NextResponse.json({ error: 'Cross-origin request rejected.' }, { status: 403 });
    }

    const formData = await request.formData();
    const fileEntry = formData.get('file');
    const action = formData.get('action') as string || 'preview';
    if (!(fileEntry instanceof File)) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

    const file = fileEntry;
    const fileValidation = validateUploadFile(file);
    if (!fileValidation.valid) return NextResponse.json({ error: fileValidation.error }, { status: 400 });

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const reportType = detectReportType(workbook);
    if (!reportType) return NextResponse.json({ error: 'Cannot detect report type.' }, { status: 400 });
    if (action !== 'preview' && action !== 'import') {
      return NextResponse.json({ error: 'Invalid upload action.' }, { status: 400 });
    }
    if (reportType === 'order_all') {
      const workbookValidation = validateOrderAllWorkbook(workbook);
      if (!workbookValidation.valid) {
        return NextResponse.json({ error: workbookValidation.error }, { status: 400 });
      }
    }

    const reportName = getReportName(reportType);
    const sourceSnapshotAt = normalizeSourceSnapshotAt(formData.get('source_snapshot_at'));
    const sourceSnapshotFile = typeof formData.get('source_snapshot_file') === 'string'
      ? String(formData.get('source_snapshot_file')).slice(0, 255)
      : file.name.slice(0, 255);

    if (reportType === 'order_all' && !sourceSnapshotAt) {
      return NextResponse.json({
        error: 'Order.all wajib memiliki waktu snapshot/export. Isi waktu saat report diexport sebelum preview atau import.',
      }, { status: 400 });
    }

    // ── PREVIEW ──
    if (action === 'preview') {
      conn = await getConnection();
      if (reportType === 'income') {
        const parsed = parseIncomePackage(workbook, sourceSnapshotFile, computeSha256(Buffer.from(buffer)));
        const existingImport = await findExistingIncomeImport(conn, parsed.sha256);
        const preview = buildIncomePreview(parsed, existingImport);
        if (!preview.valid) return NextResponse.json({ error: 'Income package ditolak.', ...preview }, { status: 400 });
        return NextResponse.json({ success: true, action: 'preview', reportType: reportName, ...preview });
      }
      if (reportType === 'master') {
        const parsed = parseSkuRawPackage(workbook, sourceSnapshotFile, computeSha256(Buffer.from(buffer)));
        const existingImport = await findExistingSkuImport(conn, parsed.sha256);
        const preview = buildSkuPreview(parsed, existingImport);
        if (!preview.valid) return NextResponse.json({ error: 'SKU RAW package ditolak.', ...preview }, { status: 400 });
        return NextResponse.json({ success: true, action: 'preview', reportType: reportName, ...preview });
      }
      const preview = await handlePreview(workbook, reportType, conn, sourceSnapshotAt, sourceSnapshotFile);
      if (!preview) return NextResponse.json({ error: 'Cannot parse file for preview.' }, { status: 400 });
      return NextResponse.json({
        success: true,
        action: 'preview',
        reportType: reportName,
        ...preview,
      });
    }

    // ── IMPORT ──
    conn = await getConnection();
    let result: any;

    switch (reportType) {
      case 'order_all':
        result = await importOrderAll(workbook, conn, sourceSnapshotAt!, sourceSnapshotFile);
        break;
      case 'income':
        result = await importIncomePackage(
          conn,
          parseIncomePackage(workbook, sourceSnapshotFile, computeSha256(Buffer.from(buffer))),
        );
        break;
      case 'master':
        result = await importSkuRawPackage(
          conn,
          parseSkuRawPackage(workbook, sourceSnapshotFile, computeSha256(Buffer.from(buffer))),
        );
        break;
    }

    let message = '';
    if (reportType === 'income') {
      if (result.duplicate) {
        message = 'File Income identik sudah pernah di-import. Tidak ada row RAW baru.';
      } else {
        message = `Income RAW package #${result.importId} di-import: ${result.inserted.penghasilan} Penghasilan, ${result.inserted.adjustment} Adjustment, ${result.inserted.shippingFeeDiscrepancy} Selisih Ongkir.`;
      }
    } else if (reportType === 'master') {
      message = result.duplicate
        ? 'File SKU identik sudah pernah di-import. Tidak ada row RAW baru.'
        : `SKU RAW package #${result.importId} di-import: ${result.inserted} row.`;
    } else if (result.inserted > 0 && result.updated > 0) {
      message = `${result.inserted} baru, ${result.updated} di-update ke ${reportName}`;
    } else if (result.inserted > 0) {
      message = `${result.inserted} rows imported to ${reportName}`;
    } else if (result.updated > 0) {
      message = `${result.updated} rows di-update di ${reportName} (tidak ada data baru)`;
    } else {
      message = `0 rows imported to ${reportName}`;
    }
    if (result.guarded) message += ` (${result.guarded} snapshot/field stale di-block)`;
    if (result.protectedFields) message += ` (${result.protectedFields} field dipertahankan)`;
    if (result.errors) message += ` (${result.errors} errors)`;

    return NextResponse.json({
      success: true,
      action: 'import',
      reportType: reportName,
      message,
      rowsImported: reportType === 'income'
        ? result.inserted.penghasilan + result.inserted.adjustment + result.inserted.shippingFeeDiscrepancy
        : result.inserted,
      rowsUpdated: result.updated || 0,
      rowsGuarded: result.guarded || 0,
      protectedFields: result.protectedFields || 0,
      sourceSnapshotAt: sourceSnapshotAt,
      errors: result.errors || 0,
      incomeImportId: reportType === 'income' ? result.importId : undefined,
    });
  } catch (error: any) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: error.message || 'Upload failed' }, { status: 500 });
  } finally {
    if (conn) await conn.end();
  }
}
