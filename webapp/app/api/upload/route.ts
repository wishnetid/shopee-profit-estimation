import { NextRequest, NextResponse } from 'next/server';
import { createConnection, Connection } from 'mysql2/promise';
import * as XLSX from 'xlsx';

// Database connection
async function getConnection() {
  return createConnection({
    host: process.env.DB_HOST || '103.136.19.30',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'supplie3_shopee_profit_estimation',
    password: process.env.DB_PASSWORD || 'Persib1933',
    database: process.env.DB_NAME || 'supplie3_shopee_profit_estimation',
  });
}

// Sanitize value: convert invalid datetime/empty to null
function sanitize(val: any): any {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  if (s === '' || s === '-' || s === 'N/A' || s === 'n/a' || s === 'null') return null;
  return val;
}

// Sanitize datetime specifically
function sanitizeDatetime(val: any): any {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  if (s === '' || s === '-' || s === 'N/A' || s === 'n/a' || s === 'null') return null;
  // If it's a valid date string, return it
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s;
  // If it's an Excel serial number, convert
  if (typeof val === 'number' && val > 40000 && val < 50000) {
    const date = new Date((val - 25569) * 86400 * 1000);
    return date.toISOString().slice(0, 19).replace('T', ' ');
  }
  return null;
}

// Sanitize decimal/number
function sanitizeDecimal(val: any): any {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  if (s === '' || s === '-' || s === 'N/A') return null;
  // Remove "gr", "kg", etc.
  const cleaned = s.replace(/[a-zA-Z\s]/g, '').replace(/,/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// Auto-detect report type
function detectReportType(workbook: XLSX.WorkBook): string | null {
  const sheetNames = workbook.SheetNames;

  // Check for Order.all pattern — sheet named 'orders' with 50 columns
  for (const name of sheetNames) {
    if (name.toLowerCase() === 'orders') {
      const sheet = workbook.Sheets[name];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
      if (data.length > 0 && data[0].length >= 40) {
        return 'order_all';
      }
    }
  }

  // Check for Income pattern — sheet named 'Penghasilan'
  for (const name of sheetNames) {
    if (name.toLowerCase().includes('penghasilan')) {
      return 'income';
    }
  }

  // Check for Master SKU pattern — has SKU1, SKU2, Harga, IDPRODUK
  for (const name of sheetNames) {
    const sheet = workbook.Sheets[name];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
    if (data.length > 0) {
      const headers = data[0].map((h: any) => String(h || '').toLowerCase());
      if (headers.includes('sku1') && headers.includes('harga')) {
        return 'master';
      }
    }
  }

  return null;
}

// Import Order.all — maps all 50 columns
async function importOrderAll(workbook: XLSX.WorkBook, conn: Connection) {
  // Find the sheet named 'orders' (case-insensitive)
  let sheetName = workbook.SheetNames.find(n => n.toLowerCase() === 'orders');
  if (!sheetName) sheetName = workbook.SheetNames[0];

  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet) as any[];

  let inserted = 0;
  let errors = 0;

  for (const row of data) {
    try {
      await conn.execute(
        `INSERT INTO order_all (
          no_pesanan, status_pesanan, alasan_pembatalan,
          status_pembatalan_pengembalian, no_resi,
          opsi_pengiriman, antar_ke_counter,
          pesanan_harus_dikirim_sebelum, waktu_pengiriman_diatur,
          waktu_pesanan_dibuat, waktu_pembayaran_dilakukan,
          tipe_pesanan, metode_pembayaran,
          sku_induk, nama_produk, nomor_referensi_sku, nama_variasi,
          harga_awal, harga_setelah_diskon, jumlah, returned_quantity,
          subtotal_pesanan, total_diskon,
          diskon_dari_penjual, diskon_dari_shopee,
          berat_produk, jumlah_produk_di_pesan, total_berat,
          voucher_ditanggung_penjual, cashback_koin,
          voucher_ditanggung_shopee, paket_diskon,
          paket_diskon_shopee, paket_diskon_penjual,
          potongan_koin_shopee, diskon_kartu_kredit,
          ongkos_kirim_dibayar_pembeli,
          estimasi_potongan_biaya_pengiriman,
          ongkos_kirim_pengembalian_barang,
          total_pembayaran, perkiraan_ongkos_kirim,
          catatan_dari_pembeli, catatan,
          username_pembeli, nama_penerima, no_telepon,
          alamat_pengiriman, kota_kabupaten, provinsi,
          waktu_pesanan_selesai
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          sanitize(row['No. Pesanan']),
          sanitize(row['Status Pesanan']),
          sanitize(row['Alasan Pembatalan']),
          sanitize(row['Status Pembatalan/ Pengembalian']),
          sanitize(row['No. Resi']),
          sanitize(row['Opsi Pengiriman']),
          sanitize(row['Antar ke counter/ pick-up']),
          sanitizeDatetime(row['Pesanan Harus Dikirimkan Sebelum (Menghindari keterlambatan)']),
          sanitizeDatetime(row['Waktu Pengiriman Diatur']),
          sanitizeDatetime(row['Waktu Pesanan Dibuat']),
          sanitizeDatetime(row['Waktu Pembayaran Dilakukan']),
          sanitize(row['Tipe Pesanan']),
          sanitize(row['Metode Pembayaran']),
          sanitize(row['SKU Induk']),
          sanitize(row['Nama Produk']),
          sanitize(row['Nomor Referensi SKU']),
          sanitize(row['Nama Variasi']),
          sanitizeDecimal(row['Harga Awal']),
          sanitizeDecimal(row['Harga Setelah Diskon']),
          sanitize(row['Jumlah']),
          sanitize(row['Returned quantity']),
          sanitizeDecimal(row['Subtotal Pesanan']),
          sanitizeDecimal(row['Total Diskon']),
          sanitizeDecimal(row['Diskon Dari Penjual']),
          sanitizeDecimal(row['Diskon Dari Shopee']),
          sanitize(row['Berat Produk']),
          sanitize(row['Jumlah Produk di Pesan']),
          sanitize(row['Total Berat']),
          sanitizeDecimal(row['Voucher Ditanggung Penjual']),
          sanitizeDecimal(row['Cashback Koin']),
          sanitizeDecimal(row['Voucher Ditanggung Shopee']),
          sanitize(row['Paket Diskon']),
          sanitizeDecimal(row['Paket Diskon (Diskon dari Shopee)']),
          sanitizeDecimal(row['Paket Diskon (Diskon dari Penjual)']),
          sanitizeDecimal(row['Potongan Koin Shopee']),
          sanitizeDecimal(row['Diskon Kartu Kredit']),
          sanitizeDecimal(row['Ongkos Kirim Dibayar oleh Pembeli']),
          sanitizeDecimal(row['Estimasi Potongan Biaya Pengiriman']),
          sanitizeDecimal(row['Ongkos Kirim Pengembalian Barang']),
          sanitizeDecimal(row['Total Pembayaran']),
          sanitizeDecimal(row['Perkiraan Ongkos Kirim']),
          sanitize(row['Catatan dari Pembeli']),
          sanitize(row['Catatan']),
          sanitize(row['Username (Pembeli)']),
          sanitize(row['Nama Penerima']),
          sanitize(row['No. Telepon']),
          sanitize(row['Alamat Pengiriman']),
          sanitize(row['Kota/Kabupaten']),
          sanitize(row['Provinsi']),
          sanitizeDatetime(row['Waktu Pesanan Selesai']),
        ]
      );
      inserted++;
    } catch (err: any) {
      errors++;
      if (errors <= 3) console.error(`Order import error row ${inserted}:`, err.message);
    }
  }

  return { inserted, errors };
}

// Import Income
async function importIncome(workbook: XLSX.WorkBook, conn: Connection) {
  // Find sheet containing 'penghasilan'
  let sheetName = workbook.SheetNames.find(n => n.toLowerCase().includes('penghasilan'));
  if (!sheetName) sheetName = workbook.SheetNames[0];

  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

  // Find header row (contains 'No. Pesanan')
  let headerIdx = -1;
  for (let i = 0; i < Math.min(data.length, 10); i++) {
    if (data[i] && String(data[i][0] || '').includes('No. Pesanan')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return { inserted: 0, errors: 0, reason: 'Header row not found' };

  const headers = data[headerIdx];
  const rows = data.slice(headerIdx + 1);

  let inserted = 0;
  let errors = 0;

  for (const row of rows) {
    const rowData: any = {};
    headers.forEach((header: string, index: number) => {
      if (header) rowData[String(header).trim()] = row[index];
    });

    // Only import "Order" rows
    if (String(rowData['Lihat berdasarkan'] || '').trim() !== 'Order') continue;

    try {
      await conn.execute(
        `INSERT INTO income_penghasilan (
          no_pesanan, lihat_berdasarkan,
          waktu_pesanan_dibuat, tanggal_dana_dilepaskan,
          harga_produk, ongkir_dibayar_pembeli,
          ongkos_kirim_ke_jasa_kirim, gratis_ongkir_dari_shopee,
          biaya_administrasi, biaya_proses_pesanan,
          biaya_gratis_ongkir_xtra, biaya_layanan_promo_xtra,
          biaya_lainnya, jumlah_dibayar_pembeli,
          metode_pembayaran_pembeli, username_pembeli
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
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
        ]
      );
      inserted++;
    } catch (err: any) {
      errors++;
      if (errors <= 3) console.error(`Income import error:`, err.message);
    }
  }

  return { inserted, errors };
}

// Import Master
async function importMaster(workbook: XLSX.WorkBook, conn: Connection) {
  // Find first sheet with SKU1 column
  let sheetName = workbook.SheetNames[0];
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
    if (data.length > 0) {
      const headers = data[0].map((h: any) => String(h || '').toLowerCase());
      if (headers.includes('sku1') || headers.includes('harga')) {
        sheetName = name;
        break;
      }
    }
  }

  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet) as any[];

  let inserted = 0;

  for (const row of data) {
    try {
      await conn.execute(
        `INSERT INTO master_products (sku1, sku2, harga, idproduk)
         VALUES (?, ?, ?, ?)`,
        [
          sanitize(row['SKU1']),
          sanitize(row['SKU2']),
          sanitizeDecimal(row['Harga']),
          sanitize(row['IDPRODUK']),
        ]
      );
      inserted++;
    } catch (err: any) {
      // Skip duplicates silently
    }
  }

  return inserted;
}

export async function POST(request: NextRequest) {
  let conn: Connection | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    // Read file
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    // Auto-detect report type
    const reportType = detectReportType(workbook);

    if (!reportType) {
      return NextResponse.json(
        { error: 'Cannot detect report type. File format tidak sesuai.' },
        { status: 400 }
      );
    }

    // Connect to database
    conn = await getConnection();

    // Import based on type
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
        const inserted = await importMaster(workbook, conn);
        result = { inserted, errors: 0 };
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
    return NextResponse.json(
      { error: error.message || 'Upload failed' },
      { status: 500 }
    );
  } finally {
    if (conn) await conn.end();
  }
}
