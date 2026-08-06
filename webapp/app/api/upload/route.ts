import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { query } from '../../../lib/db';

// Disable body parsing, we'll handle multipart manually
export const config = {
  api: {
    bodyParser: false,
  },
};

interface UploadResponse {
  success: boolean;
  message: string;
  data?: {
    ordersCount: number;
    incomeCount: number;
    masterCount: number;
  };
  error?: string;
}

// Helper: Detect header row
function detectHeaderRow(sheet: XLSX.WorkSheet, maxScan: number = 20): number {
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  
  for (let row = 0; row < Math.min(maxScan, range.e.r + 1); row++) {
    let nonNullCount = 0;
    let stringCount = 0;
    
    for (let col = 0; col <= Math.min(10, range.e.c); col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = sheet[cellAddress];
      
      if (cell && cell.v !== null && cell.v !== undefined && cell.v !== '') {
        nonNullCount++;
        if (typeof cell.v === 'string') {
          stringCount++;
        }
      }
    }
    
    // Header row criteria: >50% non-null, >70% strings
    if (nonNullCount > 3 && stringCount / nonNullCount > 0.7) {
      return row;
    }
  }
  
  return 0; // Fallback
}

// Helper: Parse currency string
function parseCurrency(value: any): number {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  
  const cleaned = String(value)
    .replace(/[^\d.-]/g, '')
    .replace(/\.(?=.*\.)/g, ''); // Keep only last dot
  
  return parseFloat(cleaned) || 0;
}

// Helper: Clean string
function cleanString(value: any): string {
  if (!value) return '';
  return String(value).trim();
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    
    const orderFile = formData.get('orderFile') as File | null;
    const incomeFile = formData.get('incomeFile') as File | null;
    const masterFile = formData.get('masterFile') as File | null;
    
    if (!orderFile || !incomeFile || !masterFile) {
      return NextResponse.json(
        { 
          success: false, 
          message: 'Missing required files',
          error: 'All 3 files (Order.all, Income, Master HPP) are required'
        } as UploadResponse,
        { status: 400 }
      );
    }
    
    // Read files
    const orderBuffer = Buffer.from(await orderFile.arrayBuffer());
    const incomeBuffer = Buffer.from(await incomeFile.arrayBuffer());
    const masterBuffer = Buffer.from(await masterFile.arrayBuffer());
    
    // Parse Excel files
    const orderWorkbook = XLSX.read(orderBuffer, { type: 'buffer' });
    const incomeWorkbook = XLSX.read(incomeBuffer, { type: 'buffer' });
    const masterWorkbook = XLSX.read(masterBuffer, { type: 'buffer' });
    
    // Get sheets
    const orderSheet = orderWorkbook.Sheets[orderWorkbook.SheetNames[0]];
    const incomeSheet = incomeWorkbook.Sheets['Penghasilan'] || incomeWorkbook.Sheets[incomeWorkbook.SheetNames[0]];
    const masterSheet = masterWorkbook.Sheets[masterWorkbook.SheetNames[0]];
    
    // Detect headers
    const orderHeaderRow = detectHeaderRow(orderSheet);
    const incomeHeaderRow = detectHeaderRow(incomeSheet);
    const masterHeaderRow = detectHeaderRow(masterSheet);
    
    // Parse to JSON
    const orderData = XLSX.utils.sheet_to_json(orderSheet, { 
      header: 1,
      range: orderHeaderRow,
      defval: ''
    });
    
    const incomeData = XLSX.utils.sheet_to_json(incomeSheet, { 
      header: 1,
      range: incomeHeaderRow,
      defval: ''
    });
    
    const masterData = XLSX.utils.sheet_to_json(masterSheet, { 
      header: 1,
      range: masterHeaderRow,
      defval: ''
    });
    
    // Get headers (first row after detection)
    const orderHeaders = orderData[0] as string[];
    const incomeHeaders = incomeData[0] as string[];
    const masterHeaders = masterData[0] as string[];
    
    // Convert to objects
    const orders = orderData.slice(1).map((row: any) => {
      const obj: any = {};
      orderHeaders.forEach((header, idx) => {
        obj[header] = row[idx];
      });
      return obj;
    });
    
    const incomes = incomeData.slice(1).map((row: any) => {
      const obj: any = {};
      incomeHeaders.forEach((header, idx) => {
        obj[header] = row[idx];
      });
      return obj;
    });
    
    const masters = masterData.slice(1).map((row: any) => {
      const obj: any = {};
      masterHeaders.forEach((header, idx) => {
        obj[header] = row[idx];
      });
      return obj;
    });
    
    // Filter incomes: only "Order" rows
    const filteredIncomes = incomes.filter((row: any) => 
      cleanString(row['Lihat berdasarkan']).toLowerCase() === 'order'
    );
    
    // Clear existing data
    await query('DELETE FROM income');
    await query('DELETE FROM orders');
    await query('DELETE FROM master_products');
    
    // Insert master HPP first
    let masterCount = 0;
    for (const row of masters) {
      const sku1 = cleanString(row['SKU1']);
      const sku2 = cleanString(row['SKU2']);
      const harga = parseCurrency(row['Harga']);
      const idproduk = cleanString(row['IDPRODUK']);
      
      if (!sku1 && !sku2) continue;
      
      await query(
        `INSERT INTO master_products (sku1, sku2, hpp, idproduk, created_at) 
         VALUES (?, ?, ?, ?, NOW())`,
        [sku1, sku2, harga, idproduk]
      );
      masterCount++;
    }
    
    // Insert orders
    let ordersCount = 0;
    const orderMap = new Map();
    
    for (const row of orders) {
      const noPesanan = cleanString(row['No. Pesanan']);
      
      if (!noPesanan || orderMap.has(noPesanan)) continue;
      orderMap.set(noPesanan, true);
      
      const waktuPesananDibuat = row['Waktu Pesanan Dibuat'] || null;
      const statusPesanan = cleanString(row['Status Pesanan']);
      const namaProduk = cleanString(row['Nama Produk']);
      const nomorReferensiSku = cleanString(row['Nomor Referensi SKU']);
      const skuInduk = cleanString(row['SKU Induk']);
      const jumlah = parseInt(row['Jumlah']) || 0;
      
      await query(
        `INSERT INTO orders (
          no_pesanan, waktu_pesanan_dibuat, status_pesanan, nama_produk,
          nomor_referensi_sku, sku_induk, jumlah, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [noPesanan, waktuPesananDibuat, statusPesanan, namaProduk, 
         nomorReferensiSku, skuInduk, jumlah]
      );
      ordersCount++;
    }
    
    // Insert income
    let incomeCount = 0;
    for (const row of filteredIncomes) {
      const noPesanan = cleanString(row['No. Pesanan']);
      const jumlah = parseCurrency(row['Jumlah']);
      
      if (!noPesanan) continue;
      
      await query(
        `INSERT INTO income (no_pesanan, jumlah, created_at) 
         VALUES (?, ?, NOW())`,
        [noPesanan, jumlah]
      );
      incomeCount++;
    }
    
    return NextResponse.json({
      success: true,
      message: `Import berhasil! ${ordersCount} orders, ${incomeCount} income records, ${masterCount} master products`,
      data: {
        ordersCount,
        incomeCount,
        masterCount
      }
    } as UploadResponse);
    
  } catch (error: any) {
    console.error('Upload error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Upload failed',
        error: error.message || 'Unknown error'
      } as UploadResponse,
      { status: 500 }
    );
  }
}
