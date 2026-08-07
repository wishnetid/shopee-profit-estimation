#!/usr/bin/env node

/**
 * Repair Order.all monetary fields imported before IDR dot-thousands parsing was fixed.
 *
 * Default mode is read-only dry-run. Use --apply only after a verified DB backup exists.
 * Source priority is the report window end date embedded in each Order.all filename.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const XLSX = require('xlsx');
const { parseIdr } = require('../lib/order-all-import.js');

const APPLY = process.argv.includes('--apply');
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const SAMPLE_DIR = path.join(PROJECT_ROOT, 'data_sample');

const NUMERIC_COLUMNS = {
  'Harga Awal': 'harga_awal',
  'Harga Setelah Diskon': 'harga_setelah_diskon',
  Jumlah: 'jumlah',
  'Returned quantity': 'returned_quantity',
  'Subtotal Pesanan': 'subtotal_pesanan',
  'Total Diskon': 'total_diskon',
  'Diskon Dari Penjual': 'diskon_dari_penjual',
  'Diskon Dari Shopee': 'diskon_dari_shopee',
  'Jumlah Produk di Pesan': 'jumlah_produk_di_pesan',
  'Voucher Ditanggung Penjual': 'voucher_ditanggung_penjual',
  'Cashback Koin': 'cashback_koin',
  'Voucher Ditanggung Shopee': 'voucher_ditanggung_shopee',
  'Paket Diskon (Diskon dari Shopee)': 'paket_diskon_shopee',
  'Paket Diskon (Diskon dari Penjual)': 'paket_diskon_penjual',
  'Potongan Koin Shopee': 'potongan_koin_shopee',
  'Diskon Kartu Kredit': 'diskon_kartu_kredit',
  'Ongkos Kirim Dibayar oleh Pembeli': 'ongkos_kirim_dibayar_pembeli',
  'Estimasi Potongan Biaya Pengiriman': 'estimasi_potongan_biaya_pengiriman',
  'Ongkos Kirim Pengembalian Barang': 'ongkos_kirim_pengembalian_barang',
  'Total Pembayaran': 'total_pembayaran',
  'Perkiraan Ongkos Kirim': 'perkiraan_ongkos_kirim',
};

function reportWindowEnd(fileName) {
  const match = fileName.match(/^Order\.all\.\d{8}_(\d{8})\.xlsx$/);
  if (!match) throw new Error(`Unexpected Order.all filename: ${fileName}`);
  return match[1];
}

function keyOf(row) {
  return [row['No. Pesanan'], row['Nomor Referensi SKU'], row['Nama Variasi']]
    .map((value) => String(value ?? '').trim())
    .join('||');
}

function parseInteger(value) {
  const parsed = parseIdr(value);
  return parsed === null ? null : Math.trunc(parsed);
}

function readLatestRawRows() {
  const files = fs.readdirSync(SAMPLE_DIR)
    .filter((file) => /^Order\.all\.\d{8}_\d{8}\.xlsx$/.test(file))
    .sort((left, right) => reportWindowEnd(left).localeCompare(reportWindowEnd(right)) || left.localeCompare(right));

  const rows = new Map();
  for (const file of files) {
    const workbook = XLSX.readFile(path.join(SAMPLE_DIR, file));
    const sheet = workbook.Sheets.orders;
    if (!sheet) throw new Error(`${file}: sheet orders not found`);

    for (const row of XLSX.utils.sheet_to_json(sheet, { defval: null })) {
      const keyParts = [row['No. Pesanan'], row['Nomor Referensi SKU'], row['Nama Variasi']]
        .map((value) => String(value ?? '').trim());
      if (keyParts.some((value) => value === '')) throw new Error(`${file}: empty composite key`);
      rows.set(keyParts.join('||'), { file, row });
    }
  }

  return { files, rows };
}

function valuesFor(row) {
  const values = {};
  for (const [excelColumn, dbColumn] of Object.entries(NUMERIC_COLUMNS)) {
    values[dbColumn] = ['jumlah', 'returned_quantity', 'jumlah_produk_di_pesan'].includes(dbColumn)
      ? parseInteger(row[excelColumn])
      : parseIdr(row[excelColumn]);
    if (values[dbColumn] === null) throw new Error(`Cannot parse ${excelColumn} for ${keyOf(row)}`);
  }
  return values;
}

function differs(dbRow, expected) {
  return Object.entries(expected).some(([column, value]) => Number(dbRow[column]) !== value);
}

async function main() {
  const { files, rows } = readLatestRawRows();
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || '103.136.19.30',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'supplie3_shopee_profit_estimation',
    password: process.env.DB_PASSWORD || 'Persib1933',
    database: process.env.DB_NAME || 'supplie3_shopee_profit_estimation',
    dateStrings: true,
  });

  try {
    const [dbRows] = await db.query(`
      SELECT id, no_pesanan, nomor_referensi_sku, nama_variasi,
        ${Object.values(NUMERIC_COLUMNS).join(', ')}
      FROM order_all
    `);
    const dbByKey = new Map(dbRows.map((row) => [
      [row.no_pesanan, row.nomor_referensi_sku, row.nama_variasi].map((value) => String(value ?? '').trim()).join('||'),
      row,
    ]));

    const updates = [];
    const missingInDb = [];
    for (const [key, source] of rows) {
      const current = dbByKey.get(key);
      if (!current) {
        missingInDb.push({ key, file: source.file });
        continue;
      }
      const expected = valuesFor(source.row);
      if (differs(current, expected)) updates.push({ id: current.id, key, file: source.file, expected });
    }

    const unexpectedDbRows = [...dbByKey.keys()].filter((key) => !rows.has(key));
    const plan = {
      mode: APPLY ? 'apply' : 'dry-run',
      source_files_in_priority_order: files,
      raw_latest_composite_rows: rows.size,
      db_rows: dbRows.length,
      rows_requiring_currency_repair: updates.length,
      missing_in_db: missingInDb.length,
      unexpected_db_rows: unexpectedDbRows.length,
      plan_sha256: crypto.createHash('sha256').update(JSON.stringify(updates)).digest('hex'),
      sample_updates: updates.slice(0, 3),
    };
    console.log(JSON.stringify(plan, null, 2));

    if (!APPLY) return;
    if (missingInDb.length || unexpectedDbRows.length) {
      throw new Error('Refusing repair because raw/DB composite key sets differ');
    }

    const updateColumns = Object.values(NUMERIC_COLUMNS);
    const assignment = updateColumns.map((column) => `${column} = ?`).join(', ');
    await db.beginTransaction();
    try {
      for (const update of updates) {
        await db.execute(
          `UPDATE order_all SET ${assignment} WHERE id = ?`,
          [...updateColumns.map((column) => update.expected[column]), update.id],
        );
      }
      await db.commit();
    } catch (error) {
      await db.rollback();
      throw error;
    }

    console.log(JSON.stringify({ applied: true, repaired_rows: updates.length }));
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
