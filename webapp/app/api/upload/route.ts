import { NextRequest, NextResponse } from 'next/server';
import { createConnection, Connection } from 'mysql2/promise';
import * as XLSX from 'xlsx';

const BATCH_SIZE = 100;

async function getConnection() {
  return createConnection({
    host: process.env.DB_HOST || '103.136.19.30',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'supplie3_shopee_profit_estimation',
    password: process.env.DB_PASSWORD || 'Persib1933',
    database: process.env.DB_NAME || 'supplie3_shopee_profit_estimation',
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

function sanitizeDecimal(val: any): any {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  if (s === '' || s === '-' || s === 'N/A') return null;
  const cleaned = s.replace(/[a-zA-Z\s]/g, '').replace(/,/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function detectReportType(workbook: XLSX.WorkBook): string | null {
  for (const name of workbook.SheetNames) {
    if (name.toLowerCase() === 'orders') {
      const sheet = workbook.Sheets[name];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
      if (data.length > 0 && data[0].length >= 40) return 'order_all';
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

function getReportName(type: string): string {
  switch (type) {
    case 'order_all': return 'Order.all';
    case 'income': return 'Income Penghasilan';
    case 'master': return 'Master SKU';
    default: return type;
  }
}

// ─── PREVIEW ───────────────────────────────────────────

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

async function previewOrderAll(workbook: XLSX.WorkBook, conn: Connection) {
  let sheetName = workbook.SheetNames.find(n => n.toLowerCase() === 'orders');
  if (!sheetName) sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

  if (rawData.length === 0) return null;

  const headers = rawData[0] as string[];
  const rows = rawData.slice(1);

  // Preview: first 10 rows, only key columns
  const previewCols = ['No. Pesanan', 'Status Pesanan', 'Nomor Referensi SKU', 'Nama Variasi', 'Jumlah', 'Harga Setelah Diskon', 'Total Pembayaran', 'Waktu Pesanan Dibuat'];
  const previewHeaders = previewCols.filter(c => headers.includes(c));
  const previewRows = rows.slice(0, 10).map(row => {
    const obj: Record<string, any> = {};
    headers.forEach((h, i) => { if (h) obj[String(h).trim()] = row[i]; });
    const mapped: Record<string, any> = {};
    previewHeaders.forEach(h => { mapped[h] = obj[h] ?? null; });
    return mapped;
  });

  // Check against DB — fetch full rows for diff comparison
  const allKeys = extractOrderKeys(workbook);
  const highlightCols = ['no_resi', 'status_pesanan', 'alasan_pembatalan', 'status_pembatalan_pengembalian'];
  const dbRows = await fetchExistingRows(conn, allKeys, 'order_all', ['no_pesanan', 'nomor_referensi_sku', 'nama_variasi'], ['no_pesanan', 'nomor_referensi_sku', 'nama_variasi', ...highlightCols]);

  // Excel column → DB column mapping for highlight fields
  const excelToDb: Record<string, string> = {
    'No. Resi': 'no_resi',
    'Status Pesanan': 'status_pesanan',
    'Alasan Pembatalan': 'alasan_pembatalan',
    'Status Pembatalan/ Pengembalian': 'status_pembatalan_pengembalian',
  };

  let newCount = 0;
  let existingCount = 0;
  const updatedRows: any[] = [];

  for (const k of allKeys) {
    const key = k.join('||');
    const dbRow = dbRows.get(key);
    if (dbRow) {
      existingCount++;
      // Find this row in rawData to compare
      const headerMap: Record<string, number> = {};
      headers.forEach((h, i) => { if (h) headerMap[String(h).trim()] = i; });

      const rawDataRow = rows.find(r => {
        return String(r[headerMap['No. Pesanan']] || '').trim() === k[0]
          && String(r[headerMap['Nomor Referensi SKU']] || '').trim() === k[1]
          && String(r[headerMap['Nama Variasi']] || '').trim() === k[2];
      });

      if (rawDataRow) {
        const changes: any[] = [];
        for (const excelCol of Object.keys(excelToDb)) {
          const dbCol = excelToDb[excelCol];
          const idx = headerMap[excelCol];
          if (idx === undefined) continue;
          const newVal = rawDataRow[idx];
          const oldVal = dbRow[dbCol];
          const newStr = newVal != null ? String(newVal).trim() : null;
          const oldStr = oldVal != null ? String(oldVal) : null;
          if (newStr !== oldStr) {
            changes.push({
              column: excelCol,
              dbColumn: dbCol,
              from: oldStr || '(kosong)',
              to: newStr || '(kosong)',
            });
          }
        }
        if (changes.length > 0) {
          updatedRows.push({
            no_pesanan: k[0],
            sku: k[1],
            variasi: k[2],
            changes,
          });
        }
      }
    } else {
      newCount++;
    }
  }

  return {
    headers: headers.filter(Boolean).map(String),
    totalRows: rows.length,
    newRows: newCount,
    existingRows: existingCount,
    updatedRows,
    previewColumns: previewHeaders,
    previewRows,
    sheetName,
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

async function previewMaster(workbook: XLSX.WorkBook, conn: Connection) {
  let sheetName = workbook.SheetNames[0];
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
    if (data.length > 0) {
      const h = data[0].map((x: any) => String(x || '').toLowerCase());
      if (h.includes('sku1') || h.includes('harga')) { sheetName = name; break; }
    }
  }
  const sheet = workbook.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

  if (rawData.length === 0) return null;
  const headers = rawData[0].filter(Boolean).map(String);
  const rows = rawData.slice(1);

  // Check master by sku1
  const allKeys = rows.map(r => {
    const obj: any = {};
    headers.forEach((h, i) => { obj[h] = r[i]; });
    return [sanitize(obj['SKU1'])];
  }).filter(k => k[0]);

  const dbRows = await fetchExistingRows(conn, allKeys, 'master_products', ['sku1'], ['sku1']);
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
    previewColumns: headers.slice(0, 8),
    previewRows: rows.slice(0, 10).map(row => {
      const obj: Record<string, any> = {};
      headers.forEach((h, i) => { obj[h] = row[i]; });
      return obj;
    }),
    sheetName,
  };
}

async function handlePreview(workbook: XLSX.WorkBook, reportType: string, conn: Connection) {
  switch (reportType) {
    case 'order_all': return previewOrderAll(workbook, conn);
    case 'income': return previewIncome(workbook, conn);
    case 'master': return previewMaster(workbook, conn);
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

async function importOrderAll(workbook: XLSX.WorkBook, conn: Connection) {
  let sheetName = workbook.SheetNames.find(n => n.toLowerCase() === 'orders');
  if (!sheetName) sheetName = workbook.SheetNames[0];

  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet) as any[];

  const placeholders = ORDER_COLS.map(() => '?').join(',');
  const cols = ORDER_COLS.join(',');
  let newInserted = 0;
  let updatedCount = 0;
  let errors = 0;

  for (let i = 0; i < data.length; i += BATCH_SIZE) {
    const batch = data.slice(i, i + BATCH_SIZE);
    const values: any[][] = [];
    for (const row of batch) {
      try {
        values.push(extractOrderRow(row));
      } catch { errors++; }
    }
    if (values.length === 0) continue;

    try {
      const valuePlaceholders = values.map(() => `(${placeholders})`).join(',');
      const flatParams = values.flat();
      const [result] = await conn.query(
        `INSERT INTO order_all (${cols}) VALUES ${valuePlaceholders}
         ON DUPLICATE KEY UPDATE
           status_pesanan=VALUES(status_pesanan),
           alasan_pembatalan=VALUES(alasan_pembatalan),
           status_pembatalan_pengembalian=VALUES(status_pembatalan_pengembalian),
           no_resi=VALUES(no_resi),
           opsi_pengiriman=VALUES(opsi_pengiriman),
           antar_ke_counter=VALUES(antar_ke_counter),
           pesanan_harus_dikirim_sebelum=VALUES(pesanan_harus_dikirim_sebelum),
           waktu_pengiriman_diatur=VALUES(waktu_pengiriman_diatur),
           waktu_pesanan_dibuat=VALUES(waktu_pesanan_dibuat),
           waktu_pembayaran_dilakukan=VALUES(waktu_pembayaran_dilakukan),
           tipe_pesanan=VALUES(tipe_pesanan),
           metode_pembayaran=VALUES(metode_pembayaran),
           sku_induk=VALUES(sku_induk),
           harga_awal=VALUES(harga_awal),
           harga_setelah_diskon=VALUES(harga_setelah_diskon),
           jumlah=VALUES(jumlah),
           returned_quantity=VALUES(returned_quantity),
           subtotal_pesanan=VALUES(subtotal_pesanan),
           total_diskon=VALUES(total_diskon),
           diskon_dari_penjual=VALUES(diskon_dari_penjual),
           diskon_dari_shopee=VALUES(diskon_dari_shopee),
           berat_produk=VALUES(berat_produk),
           jumlah_produk_di_pesan=VALUES(jumlah_produk_di_pesan),
           total_berat=VALUES(total_berat),
           voucher_ditanggung_penjual=VALUES(voucher_ditanggung_penjual),
           cashback_koin=VALUES(cashback_koin),
           voucher_ditanggung_shopee=VALUES(voucher_ditanggung_shopee),
           paket_diskon=VALUES(paket_diskon),
           paket_diskon_shopee=VALUES(paket_diskon_shopee),
           paket_diskon_penjual=VALUES(paket_diskon_penjual),
           potongan_koin_shopee=VALUES(potongan_koin_shopee),
           diskon_kartu_kredit=VALUES(diskon_kartu_kredit),
           ongkos_kirim_dibayar_pembeli=VALUES(ongkos_kirim_dibayar_pembeli),
           estimasi_potongan_biaya_pengiriman=VALUES(estimasi_potongan_biaya_pengiriman),
           ongkos_kirim_pengembalian_barang=VALUES(ongkos_kirim_pengembalian_barang),
           total_pembayaran=VALUES(total_pembayaran),
           perkiraan_ongkos_kirim=VALUES(perkiraan_ongkos_kirim),
           catatan_dari_pembeli=VALUES(catatan_dari_pembeli),
           catatan=VALUES(catatan),
           username_pembeli=VALUES(username_pembeli),
           nama_penerima=VALUES(nama_penerima),
           no_telepon=VALUES(no_telepon),
           alamat_pengiriman=VALUES(alamat_pengiriman),
           kota_kabupaten=VALUES(kota_kabupaten),
           provinsi=VALUES(provinsi),
           waktu_pesanan_selesai=VALUES(waktu_pesanan_selesai)`,
        flatParams
      ) as any;
      const newRows = result.affectedRows - (result.changedRows || 0);
      const updatedRows = result.changedRows || 0;
      newInserted += newRows;
      updatedCount += updatedRows;
      console.log(`Batch ${i}: affectedRows=${result.affectedRows}, new=${newRows}, updated=${updatedRows}`);
    } catch (err: any) {
      errors++;
      console.error(`Order batch error at row ${i}:`, err.message);
    }
  }

  await conn.commit();
  return { inserted: newInserted, updated: updatedCount, errors };
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

async function importMaster(workbook: XLSX.WorkBook, conn: Connection) {
  let sheetName = workbook.SheetNames[0];
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
    if (data.length > 0) {
      const headers = data[0].map((h: any) => String(h || '').toLowerCase());
      if (headers.includes('sku1') || headers.includes('harga')) { sheetName = name; break; }
    }
  }

  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet) as any[];
  let inserted = 0;
  let batch: any[][] = [];

  for (const row of data) {
    batch.push([
      sanitize(row['SKU1']),
      sanitize(row['SKU2']),
      sanitizeDecimal(row['Harga']),
      sanitize(row['IDPRODUK']),
    ]);
    if (batch.length >= BATCH_SIZE) {
      try {
        const [res] = await conn.query(
          `INSERT IGNORE INTO master_products (sku1,sku2,harga,idproduk) VALUES ${batch.map(() => '(?,?,?,?)').join(',')}`,
          batch.flat()
        ) as any;
        inserted += res.affectedRows || 0;
      } catch { /* skip */ }
      batch = [];
    }
  }
  if (batch.length > 0) {
    try {
      const [res] = await conn.query(
        `INSERT IGNORE INTO master_products (sku1,sku2,harga,idproduk) VALUES ${batch.map(() => '(?,?,?,?)').join(',')}`,
        batch.flat()
      ) as any;
      inserted += res.affectedRows || 0;
    } catch { /* skip */ }
  }

  await conn.commit();
  return inserted;
}

// ─── HANDLER ───────────────────────────────────────────

export async function POST(request: NextRequest) {
  let conn: Connection | null = null;
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const action = formData.get('action') as string || 'preview';

    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const reportType = detectReportType(workbook);
    if (!reportType) return NextResponse.json({ error: 'Cannot detect report type.' }, { status: 400 });

    const reportName = getReportName(reportType);

    // ── PREVIEW ──
    if (action === 'preview') {
      conn = await getConnection();
      const preview = await handlePreview(workbook, reportType, conn);
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
        result = await importOrderAll(workbook, conn);
        break;
      case 'income':
        result = await importIncome(workbook, conn);
        break;
      case 'master':
        result = { inserted: await importMaster(workbook, conn), errors: 0 };
        break;
    }

    let message = '';
    if (result.inserted > 0 && result.updated > 0) {
      message = `${result.inserted} baru, ${result.updated} di-update ke ${reportName}`;
    } else if (result.inserted > 0) {
      message = `${result.inserted} rows imported to ${reportName}`;
    } else if (result.updated > 0) {
      message = `${result.updated} rows di-update di ${reportName} (tidak ada data baru)`;
    } else {
      message = `0 rows imported to ${reportName}`;
    }
    if (result.errors) message += ` (${result.errors} errors)`;

    return NextResponse.json({
      success: true,
      action: 'import',
      reportType: reportName,
      message,
      rowsImported: result.inserted,
      rowsUpdated: result.updated || 0,
      errors: result.errors || 0,
    });
  } catch (error: any) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: error.message || 'Upload failed' }, { status: 500 });
  } finally {
    if (conn) await conn.end();
  }
}
