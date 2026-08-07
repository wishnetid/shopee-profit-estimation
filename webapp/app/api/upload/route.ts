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
  let inserted = 0;
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
        `INSERT IGNORE INTO order_all (${cols}) VALUES ${valuePlaceholders}`,
        flatParams
      ) as any;
      console.log(`Batch ${i}: affectedRows=${result.affectedRows}, inserted=${values.length}`);
      inserted += result.affectedRows || 0;
    } catch (err: any) {
      errors++;
      console.error(`Order batch error at row ${i}:`, err.message);
    }
  }

  await conn.commit();
  return { inserted, errors };
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

export async function POST(request: NextRequest) {
  let conn: Connection | null = null;
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const reportType = detectReportType(workbook);
    if (!reportType) return NextResponse.json({ error: 'Cannot detect report type.' }, { status: 400 });

    conn = await getConnection();
    let result: any;
    let reportName = '';

    switch (reportType) {
      case 'order_all':
        result = await importOrderAll(workbook, conn);
        reportName = 'Order.all';
        break;
      case 'income':
        result = await importIncome(workbook, conn);
        reportName = 'Income Penghasilan';
        break;
      case 'master':
        result = { inserted: await importMaster(workbook, conn), errors: 0 };
        reportName = 'Master SKU';
        break;
    }

    return NextResponse.json({
      success: true,
      reportType: reportName,
      message: `${result.inserted} rows imported to ${reportName}${result.errors ? ` (${result.errors} errors)` : ''}`,
      rowsImported: result.inserted,
      errors: result.errors || 0,
    });
  } catch (error: any) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: error.message || 'Upload failed' }, { status: 500 });
  } finally {
    if (conn) await conn.end();
  }
}
