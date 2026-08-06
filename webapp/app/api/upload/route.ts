import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { query } from '../../../lib/db';
import crypto from 'crypto';

interface UploadResponse {
  success: boolean;
  message: string;
  jobId?: string;
  error?: string;
}

interface ProgressStatus {
  status: 'processing' | 'completed' | 'error';
  progress: number;
  message: string;
  stage?: string;
  error?: string;
  stats?: {
    ordersProcessed?: number;
    ordersTotal?: number;
    incomeProcessed?: number;
    incomeTotal?: number;
    masterProcessed?: number;
    masterTotal?: number;
  };
}

// Helper: Update progress in database
async function updateProgress(jobId: string, progress: ProgressStatus) {
  const statsJson = progress.stats ? JSON.stringify(progress.stats) : null;
  
  await query(
    `INSERT INTO upload_jobs (job_id, status, progress, message, stage, error, stats)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       status = VALUES(status),
       progress = VALUES(progress),
       message = VALUES(message),
       stage = VALUES(stage),
       error = VALUES(error),
       stats = VALUES(stats)`,
    [jobId, progress.status, progress.progress, progress.message, progress.stage || null, progress.error || null, statsJson]
  );
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
    
    if (nonNullCount > 3 && stringCount / nonNullCount > 0.7) {
      return row;
    }
  }
  
  return 0;
}

// Helper: Parse currency
function parseCurrency(value: any): number {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  
  const str = String(value).replace(/[Rp\s,.]/g, '');
  return parseFloat(str) || 0;
}

// Background processing function
async function processUpload(jobId: string, orderBuffer: Buffer, incomeBuffer: Buffer, masterBuffer: Buffer) {
  try {
    await updateProgress(jobId, {
      status: 'processing',
      progress: 5,
      message: 'Parsing Excel files...',
      stage: 'parsing'
    });

    // Parse workbooks
    const orderWorkbook = XLSX.read(orderBuffer, { type: 'buffer' });
    const incomeWorkbook = XLSX.read(incomeBuffer, { type: 'buffer' });
    const masterWorkbook = XLSX.read(masterBuffer, { type: 'buffer' });

    const orderSheet = orderWorkbook.Sheets[orderWorkbook.SheetNames[0]];
    const incomeSheet = incomeWorkbook.Sheets['Penghasilan'] || incomeWorkbook.Sheets[incomeWorkbook.SheetNames[0]];
    const masterSheet = masterWorkbook.Sheets[masterWorkbook.SheetNames[0]];

    await updateProgress(jobId, {
      status: 'processing',
      progress: 10,
      message: 'Detecting headers...',
      stage: 'headers'
    });

    // Detect headers
    const orderHeaderRow = detectHeaderRow(orderSheet);
    const masterHeaderRow = detectHeaderRow(masterSheet);

    // Parse to JSON
    const orderData = XLSX.utils.sheet_to_json(orderSheet, {
      header: 1,
      range: orderHeaderRow,
      defval: ''
    });

    // Income header ALWAYS at row 2
    const incomeData = XLSX.utils.sheet_to_json(incomeSheet, {
      header: 1,
      range: 2,
      defval: ''
    });

    const masterData = XLSX.utils.sheet_to_json(masterSheet, {
      header: 1,
      range: masterHeaderRow,
      defval: ''
    });

    if (orderData.length < 2 || incomeData.length < 2 || masterData.length < 2) {
      throw new Error('Invalid file format: Not enough data rows');
    }

    const orderHeaders = orderData[0] as string[];
    const orderRows = orderData.slice(1) as any[][];
    const incomeHeaders = incomeData[0] as string[];
    const incomeRows = incomeData.slice(1) as any[][];
    const masterHeaders = masterData[0] as string[];
    const masterRows = masterData.slice(1) as any[][];

    await updateProgress(jobId, {
      status: 'processing',
      progress: 15,
      message: 'Filtering valid orders...',
      stage: 'filtering',
      stats: {
        ordersTotal: orderRows.length,
        ordersProcessed: 0
      }
    });

    // Map to objects
    const orders = orderRows.map(row => {
      const obj: any = {};
      orderHeaders.forEach((header, idx) => {
        obj[header] = row[idx];
      });
      return obj;
    });

    // Filter valid orders for estimasi profit
    const validOrders = orders.filter(row => {
      const status = row['Status Pesanan'];
      const statusPembatalan = (row['Status Pembatalan/ Pengembalian'] || '').toString().trim();
      const alasanPembatalan = (row['Alasan Pembatalan'] || '').toString().trim();

      const validStatus = ['Selesai', 'Sedang Dikirim', 'Telah Dikirim', 'Perlu Dikirim'];

      return validStatus.includes(status) && statusPembatalan === '' && alasanPembatalan === '';
    });

    await updateProgress(jobId, {
      status: 'processing',
      progress: 20,
      message: `Filtered ${validOrders.length} valid orders from ${orderRows.length} total`,
      stage: 'clearing',
      stats: {
        ordersTotal: validOrders.length,
        ordersProcessed: 0
      }
    });

    // Clear existing data
    await query('DELETE FROM master_products');
    await query('DELETE FROM income_penghasilan');
    await query('DELETE FROM orders');

    await updateProgress(jobId, {
      status: 'processing',
      progress: 25,
      message: 'Importing master products...',
      stage: 'master',
      stats: {
        masterTotal: masterRows.length,
        masterProcessed: 0
      }
    });

    // Insert master products
    for (let i = 0; i < masterRows.length; i++) {
      const row = masterRows[i];
      const obj: any = {};
      masterHeaders.forEach((header, idx) => {
        obj[header] = row[idx];
      });

      const sku1 = obj['SKU1'] || '';
      const sku2 = obj['SKU2'] || '';
      const harga = parseCurrency(obj['Harga']);
      const idproduk = obj['IDPRODUK'] || '';

      if (sku1 || sku2) {
        await query(
          'INSERT INTO master_products (sku1, sku2, harga, idproduk) VALUES (?, ?, ?, ?)',
          [sku1, sku2, harga, idproduk]
        );
      }

      if ((i + 1) % 10 === 0) {
        await updateProgress(jobId, {
          status: 'processing',
          progress: 25 + Math.floor((i / masterRows.length) * 15),
          message: `Importing master products... ${i + 1}/${masterRows.length}`,
          stage: 'master',
          stats: {
            masterTotal: masterRows.length,
            masterProcessed: i + 1
          }
        });
      }
    }

    await updateProgress(jobId, {
      status: 'processing',
      progress: 40,
      message: 'Importing orders...',
      stage: 'orders',
      stats: {
        ordersTotal: validOrders.length,
        ordersProcessed: 0
      }
    });

    // Insert orders with HPP matching
    const masterProducts = await query('SELECT * FROM master_products');
    const masterMap = new Map();
    (masterProducts as any[]).forEach(m => {
      if (m.sku1) masterMap.set(m.sku1.toLowerCase(), m);
      if (m.sku2) masterMap.set(m.sku2.toLowerCase(), m);
    });

    for (let i = 0; i < validOrders.length; i++) {
      const row = validOrders[i];

      const noPesanan = row['No. Pesanan'] || '';
      const waktuPesananDibuat = row['Waktu Pesanan Dibuat'] || null;
      const statusPesanan = row['Status Pesanan'] || '';
      const opsiPengiriman = row['Opsi Pengiriman'] || '';
      const antarKeCounter = row['Antar ke Counter/ Pick-up'] || '';
      const nomorResi = row['Nomor Resi'] || '';
      const skuInduk = row['SKU Induk'] || '';
      const nomorReferensiSku = row['Nomor Referensi SKU'] || '';
      const namaProduk = row['Nama Produk'] || '';
      const variasiProduk = row['Variasi Produk'] || '';
      const hargaAwal = parseCurrency(row['Harga Awal']);
      const hargaSetelahDiskon = parseCurrency(row['Harga setelah Diskon']);
      const jumlahPengembalianDana = parseCurrency(row['Jumlah Pengembalian Dana ke Pembeli']);
      const diskonProduk = parseCurrency(row['Diskon Produk dari Shopee']);

      // HPP Matching
      const skuForMatching = (nomorReferensiSku || skuInduk).toLowerCase();
      const master = masterMap.get(skuForMatching);
      const hpp = master ? master.harga : 0;

      await query(
        `INSERT INTO orders (
          no_pesanan, waktu_pesanan_dibuat, status_pesanan, opsi_pengiriman,
          antar_ke_counter_pick_up, nomor_resi, sku_induk, nomor_referensi_sku,
          nama_produk, variasi_produk, harga_awal, harga_setelah_diskon,
          jumlah_pengembalian_dana_ke_pembeli, diskon_produk_dari_shopee, hpp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          noPesanan, waktuPesananDibuat, statusPesanan, opsiPengiriman,
          antarKeCounter, nomorResi, skuInduk, nomorReferensiSku,
          namaProduk, variasiProduk, hargaAwal, hargaSetelahDiskon,
          jumlahPengembalianDana, diskonProduk, hpp
        ]
      );

      if ((i + 1) % 50 === 0 || i === validOrders.length - 1) {
        await updateProgress(jobId, {
          status: 'processing',
          progress: 40 + Math.floor((i / validOrders.length) * 40),
          message: `Importing orders... ${i + 1}/${validOrders.length}`,
          stage: 'orders',
          stats: {
            ordersTotal: validOrders.length,
            ordersProcessed: i + 1
          }
        });
      }
    }

    await updateProgress(jobId, {
      status: 'processing',
      progress: 80,
      message: 'Importing income data...',
      stage: 'income',
      stats: {
        incomeTotal: incomeRows.length,
        incomeProcessed: 0
      }
    });

    // Map income to objects
    const incomeObjects = incomeRows.map(row => {
      const obj: any = {};
      incomeHeaders.forEach((header, idx) => {
        obj[header] = row[idx];
      });
      return obj;
    });

    // Filter: Lihat berdasarkan = "Order"
    const validIncome = incomeObjects.filter(row => {
      const lihatBerdasarkan = (row['Lihat berdasarkan'] || '').toString().trim();
      return lihatBerdasarkan === 'Order';
    });

    // Insert income
    for (let i = 0; i < validIncome.length; i++) {
      const row = validIncome[i];

      const noPesanan = row['No. Pesanan'] || '';
      const lihatBerdasarkan = row['Lihat berdasarkan'] || '';
      const idProduk = row['ID Produk'] || '';
      const namaProduk = row['Nama Produk'] || '';
      const waktuPesananDibuat = row['Waktu Pesanan Dibuat'] || null;
      const tanggalDanaDilepaskan = row['Tanggal Dana Dilepaskan'] || null;
      const hargaProduk = parseCurrency(row['Harga Produk']);
      const gratisOngkirShopee = parseCurrency(row['Gratis Ongkir dari Shopee']);
      const ongkirKeJasaKirim = parseCurrency(row['Ongkos Kirim yang Dibayarkan ke Jasa Kirim']);
      const biayaAdministrasi = parseCurrency(row['Biaya Administrasi']);
      const biayaProsesPesanan = parseCurrency(row['Biaya Proses Pesanan']);
      const biayaGratisOngkirXtra = parseCurrency(row['Biaya Gratis Ongkir XTRA - Ukuran Biasa (Kategori F)']) + parseCurrency(row['Biaya Gratis Ongkir XTRA - Ukuran Biasa (Kategori F).1']);
      const biayaLayananPromoXtra = parseCurrency(row['Biaya Layanan Promo XTRA']);
      const biayaLainnya = parseCurrency(row['Biaya Lainnya']);

      const netPayout = hargaProduk + gratisOngkirShopee - ongkirKeJasaKirim - biayaAdministrasi - biayaProsesPesanan - biayaGratisOngkirXtra - biayaLayananPromoXtra - biayaLainnya;

      await query(
        `INSERT INTO income_penghasilan (
          no_pesanan, lihat_berdasarkan, id_produk, nama_produk,
          waktu_pesanan_dibuat, tanggal_dana_dilepaskan, harga_produk,
          gratis_ongkir_shopee, ongkir_ke_jasa_kirim, biaya_administrasi,
          biaya_proses_pesanan, biaya_gratis_ongkir_xtra, biaya_layanan_promo_xtra,
          biaya_lainnya, net_payout
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          noPesanan, lihatBerdasarkan, idProduk, namaProduk,
          waktuPesananDibuat, tanggalDanaDilepaskan, hargaProduk,
          gratisOngkirShopee, ongkirKeJasaKirim, biayaAdministrasi,
          biayaProsesPesanan, biayaGratisOngkirXtra, biayaLayananPromoXtra,
          biayaLainnya, netPayout
        ]
      );

      if ((i + 1) % 50 === 0 || i === validIncome.length - 1) {
        await updateProgress(jobId, {
          status: 'processing',
          progress: 80 + Math.floor((i / validIncome.length) * 15),
          message: `Importing income... ${i + 1}/${validIncome.length}`,
          stage: 'income',
          stats: {
            incomeTotal: validIncome.length,
            incomeProcessed: i + 1
          }
        });
      }
    }

    await updateProgress(jobId, {
      status: 'completed',
      progress: 100,
      message: 'Upload completed successfully!',
      stats: {
        ordersTotal: validOrders.length,
        ordersProcessed: validOrders.length,
        incomeTotal: validIncome.length,
        incomeProcessed: validIncome.length,
        masterTotal: masterRows.length,
        masterProcessed: masterRows.length
      }
    });

  } catch (error: any) {
    await updateProgress(jobId, {
      status: 'error',
      progress: 0,
      message: 'Upload failed',
      error: error.message
    });
  }
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

    // Generate job ID
    const jobId = crypto.randomBytes(16).toString('hex');

    // Read file buffers
    const orderBuffer = Buffer.from(await orderFile.arrayBuffer());
    const incomeBuffer = Buffer.from(await incomeFile.arrayBuffer());
    const masterBuffer = Buffer.from(await masterFile.arrayBuffer());

    // Initialize progress
    await updateProgress(jobId, {
      status: 'processing',
      progress: 0,
      message: 'Upload started...',
      stage: 'init'
    });

    // Start background processing (non-blocking)
    processUpload(jobId, orderBuffer, incomeBuffer, masterBuffer).catch(err => {
      console.error('Background processing error:', err);
    });

    // Return immediately with job ID
    return NextResponse.json({
      success: true,
      message: 'Upload started',
      jobId
    } as UploadResponse);

  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        message: 'Upload failed',
        error: error.message
      } as UploadResponse,
      { status: 500 }
    );
  }
}
