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

// Auto-detect report type
function detectReportType(workbook: XLSX.WorkBook): string | null {
  const sheetNames = workbook.SheetNames;
  
  // Check for Order.all pattern
  if (sheetNames.includes('orders')) {
    const sheet = workbook.Sheets['orders'];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
    if (data.length > 0 && data[0].length >= 50) {
      return 'order_all';
    }
  }
  
  // Check for Income pattern
  if (sheetNames.includes('Penghasilan')) {
    const sheet = workbook.Sheets['Penghasilan'];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
    // Header at row 2 (0-indexed), so check row 2
    if (data.length > 2 && data[2].length >= 50) {
      return 'income';
    }
  }
  
  // Check for Master SKU pattern
  if (sheetNames.includes('Sheet1')) {
    const sheet = workbook.Sheets['Sheet1'];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
    if (data.length > 0 && data[0].length === 4) {
      const headers = data[0];
      if (headers.includes('SKU1') && headers.includes('SKU2') && headers.includes('Harga')) {
        return 'master';
      }
    }
  }
  
  return null;
}

// Import Order.all
async function importOrderAll(workbook: XLSX.WorkBook, conn: Connection) {
  const sheet = workbook.Sheets['orders'];
  const data = XLSX.utils.sheet_to_json(sheet) as any[];
  
  let inserted = 0;
  
  for (const row of data) {
    await conn.execute(
      `INSERT INTO order_all (
        no_pesanan, status_pesanan, alasan_pembatalan,
        status_pembatalan_pengembalian, no_resi,
        nama_produk, nomor_referensi_sku, sku_induk, nama_variasi,
        harga_awal, harga_setelah_diskon, jumlah, subtotal_pesanan,
        total_diskon, diskon_dari_penjual, diskon_dari_shopee,
        opsi_pengiriman, ongkos_kirim_dibayar_pembeli,
        perkiraan_ongkos_kirim, total_pembayaran,
        waktu_pesanan_dibuat, waktu_pembayaran_dilakukan,
        waktu_pesanan_selesai, username_pembeli, metode_pembayaran
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row['No. Pesanan'] || null,
        row['Status Pesanan'] || null,
        row['Alasan Pembatalan'] || null,
        row['Status Pembatalan/ Pengembalian'] || null,
        row['No. Resi'] || null,
        row['Nama Produk'] || null,
        row['Nomor Referensi SKU'] || null,
        row['SKU Induk'] || null,
        row['Nama Variasi'] || null,
        row['Harga Awal'] || null,
        row['Harga Setelah Diskon'] || null,
        row['Jumlah'] || null,
        row['Subtotal Pesanan'] || null,
        row['Total Diskon'] || null,
        row['Diskon Dari Penjual'] || null,
        row['Diskon Dari Shopee'] || null,
        row['Opsi Pengiriman'] || null,
        row['Ongkos Kirim Dibayar oleh Pembeli'] || null,
        row['Perkiraan Ongkos Kirim'] || null,
        row['Total Pembayaran'] || null,
        row['Waktu Pesanan Dibuat'] || null,
        row['Waktu Pembayaran Dilakukan'] || null,
        row['Waktu Pesanan Selesai'] || null,
        row['Username (Pembeli)'] || null,
        row['Metode Pembayaran'] || null,
      ]
    );
    inserted++;
  }
  
  return inserted;
}

// Import Income
async function importIncome(workbook: XLSX.WorkBook, conn: Connection) {
  const sheet = workbook.Sheets['Penghasilan'];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 2 }) as any[][];
  
  // Get headers from row 2 (0-indexed)
  const headers = data[0];
  const rows = data.slice(1);
  
  let inserted = 0;
  
  for (const row of rows) {
    const rowData: any = {};
    headers.forEach((header: string, index: number) => {
      rowData[header] = row[index];
    });
    
    // Only import "Order" rows
    if (rowData['Lihat berdasarkan'] !== 'Order') {
      continue;
    }
    
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
        rowData['No. Pesanan'] || null,
        rowData['Lihat berdasarkan'] || null,
        rowData['Waktu Pesanan Dibuat'] || null,
        rowData['Tanggal Dana Dilepaskan'] || null,
        rowData['Harga Produk'] || 0,
        rowData['Ongkir Dibayar Pembeli'] || 0,
        rowData['Ongkos Kirim yang Dibayarkan ke Jasa Kirim'] || 0,
        rowData['Gratis Ongkir dari Shopee'] || 0,
        rowData['Biaya Administrasi'] || 0,
        rowData['Biaya Proses Pesanan'] || 0,
        rowData['Biaya Gratis Ongkir XTRA - Ukuran Biasa (Kategori F)'] || 0,
        rowData['Biaya Layanan Promo XTRA'] || 0,
        rowData['Biaya Lainnya'] || 0,
        rowData['Jumlah Dibayar Pembeli'] || 0,
        rowData['Metode pembayaran pembeli'] || null,
        rowData['Username (Pembeli)'] || null,
      ]
    );
    inserted++;
  }
  
  return inserted;
}

// Import Master
async function importMaster(workbook: XLSX.WorkBook, conn: Connection) {
  const sheet = workbook.Sheets['Sheet1'];
  const data = XLSX.utils.sheet_to_json(sheet) as any[];
  
  let inserted = 0;
  
  for (const row of data) {
    await conn.execute(
      `INSERT INTO master_products (sku1, sku2, harga, idproduk)
       VALUES (?, ?, ?, ?)`,
      [
        row['SKU1'] || null,
        row['SKU2'] || null,
        row['Harga'] || 0,
        row['IDPRODUK'] || null,
      ]
    );
    inserted++;
  }
  
  return inserted;
}

export async function POST(request: NextRequest) {
  let conn: Connection | null = null;
  
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file uploaded' },
        { status: 400 }
      );
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
    let inserted = 0;
    let reportName = '';
    
    switch (reportType) {
      case 'order_all':
        inserted = await importOrderAll(workbook, conn);
        reportName = 'Order.all';
        break;
      case 'income':
        inserted = await importIncome(workbook, conn);
        reportName = 'Income Penghasilan';
        break;
      case 'master':
        inserted = await importMaster(workbook, conn);
        reportName = 'Master SKU';
        break;
    }
    
    return NextResponse.json({
      success: true,
      reportType: reportName,
      message: `${inserted} rows imported to ${reportName}`,
      rowsImported: inserted,
    });
    
  } catch (error: any) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: error.message || 'Upload failed' },
      { status: 500 }
    );
  } finally {
    if (conn) {
      await conn.end();
    }
  }
}
