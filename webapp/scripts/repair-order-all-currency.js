#!/usr/bin/env node

/**
 * Repair Order.all monetary fields imported before IDR dot-thousands parsing was fixed.
 *
 * Default mode is read-only dry-run. Use --apply only after a verified DB backup exists.
 * Source priority is the report window end date embedded in each Order.all filename.
 *
 * The current physical identity includes Harga Setelah Diskon. A pre-identity
 * legacy row can contain a malformed stored price, so this tool permits a
 * three-field fallback only when exactly one source line and one DB line share
 * that legacy key. Promotion-split groups remain ambiguous and are never
 * repaired automatically.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const XLSX = require('xlsx');
const {
  getOrderAllCompositeKeyFromExcelRow,
  getOrderAllCompositeKeyFromStoredRow,
  parseIdr,
} = require('../lib/order-all-import.js');

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

function normalizeLegacyKeyPart(value) {
  const text = String(value ?? '').trim();
  return text === '' ? null : text;
}

function getLegacyOrderKey(parts) {
  const normalized = parts.map(normalizeLegacyKeyPart);
  return normalized.some((value) => value === null) ? null : normalized.join('||');
}

function getLegacyOrderKeyFromExcelRow(row) {
  return getLegacyOrderKey([
    row['No. Pesanan'],
    row['Nomor Referensi SKU'],
    row['Nama Variasi'],
  ]);
}

function getLegacyOrderKeyFromStoredRow(row) {
  return getLegacyOrderKey([
    row.no_pesanan,
    row.nomor_referensi_sku,
    row.nama_variasi,
  ]);
}

function keyOf(row) {
  return getOrderAllCompositeKeyFromExcelRow(row) || '(physical identity tidak valid)';
}

function parseInteger(value) {
  const parsed = parseIdr(value);
  return parsed === null ? null : Math.trunc(parsed);
}

function readLatestRawRows() {
  const files = fs.readdirSync(SAMPLE_DIR)
    .filter((file) => /^Order\.all\.\d{8}_\d{8}\.xlsx$/.test(file))
    .sort((left, right) => reportWindowEnd(left).localeCompare(reportWindowEnd(right)) || left.localeCompare(right));

  // Later snapshots replace the same physical line, while price-split lines
  // stay independent because their full identity differs.
  const rows = new Map();
  for (const file of files) {
    const workbook = XLSX.readFile(path.join(SAMPLE_DIR, file));
    const sheet = workbook.Sheets.orders;
    if (!sheet) throw new Error(`${file}: sheet orders not found`);

    for (const row of XLSX.utils.sheet_to_json(sheet, { defval: null })) {
      const key = getOrderAllCompositeKeyFromExcelRow(row);
      if (!key) throw new Error(`${file}: physical Order.all identity is incomplete`);
      rows.set(key, { file, row });
    }
  }

  return { files, rows };
}

function addToGroup(groups, key, value) {
  const existing = groups.get(key);
  if (existing) existing.push(value);
  else groups.set(key, [value]);
}

function matchSourceRowsToDbRows(sourceRows, dbRows) {
  const sourceByPhysicalKey = new Map();
  const sourceByLegacyKey = new Map();
  for (const source of sourceRows) {
    const physicalKey = getOrderAllCompositeKeyFromExcelRow(source.row);
    const legacyKey = getLegacyOrderKeyFromExcelRow(source.row);
    if (!physicalKey || !legacyKey) {
      throw new Error(`${source.file || 'source'}: physical Order.all identity is incomplete`);
    }
    if (sourceByPhysicalKey.has(physicalKey)) {
      throw new Error(`${source.file || 'source'}: duplicate physical Order.all identity`);
    }
    sourceByPhysicalKey.set(physicalKey, source);
    addToGroup(sourceByLegacyKey, legacyKey, source);
  }

  const dbByPhysicalKey = new Map();
  const dbByLegacyKey = new Map();
  for (const dbRow of dbRows) {
    const physicalKey = getOrderAllCompositeKeyFromStoredRow(dbRow);
    const legacyKey = getLegacyOrderKeyFromStoredRow(dbRow);
    if (!physicalKey || !legacyKey) {
      throw new Error(`Database row ${dbRow.id}: physical Order.all identity is incomplete`);
    }
    if (dbByPhysicalKey.has(physicalKey)) {
      throw new Error(`Database contains duplicate physical Order.all identity: ${physicalKey}`);
    }
    dbByPhysicalKey.set(physicalKey, dbRow);
    addToGroup(dbByLegacyKey, legacyKey, dbRow);
  }

  const matches = [];
  const missingInDb = [];
  const ambiguousLegacyIdentity = [];
  const matchedDbRows = new Set();

  for (const [physicalKey, source] of sourceByPhysicalKey) {
    const legacyKey = getLegacyOrderKeyFromExcelRow(source.row);
    let dbRow = dbByPhysicalKey.get(physicalKey);
    let matchMode = 'physical';

    if (!dbRow) {
      const sourceCandidates = sourceByLegacyKey.get(legacyKey) || [];
      const dbCandidates = dbByLegacyKey.get(legacyKey) || [];
      if (dbCandidates.length === 0) {
        missingInDb.push({ key: physicalKey, file: source.file });
        continue;
      }
      if (sourceCandidates.length !== 1 || dbCandidates.length !== 1) {
        ambiguousLegacyIdentity.push({
          legacyKey,
          sourcePhysicalKey: physicalKey,
          sourceCandidateCount: sourceCandidates.length,
          dbCandidateCount: dbCandidates.length,
        });
        continue;
      }
      [dbRow] = dbCandidates;
      matchMode = 'legacy_unambiguous_fallback';
    }

    if (matchedDbRows.has(dbRow)) {
      ambiguousLegacyIdentity.push({
        legacyKey,
        sourcePhysicalKey: physicalKey,
        sourceCandidateCount: (sourceByLegacyKey.get(legacyKey) || []).length,
        dbCandidateCount: (dbByLegacyKey.get(legacyKey) || []).length,
      });
      continue;
    }

    matchedDbRows.add(dbRow);
    matches.push({ source, dbRow, physicalKey, matchMode });
  }

  return {
    matches,
    missingInDb,
    ambiguousLegacyIdentity,
    unexpectedDbRows: dbRows.filter((row) => !matchedDbRows.has(row)),
  };
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

function buildRepairPlan(sourceRows, dbRows) {
  const matching = matchSourceRowsToDbRows(sourceRows, dbRows);
  const updates = [];
  for (const match of matching.matches) {
    const expected = valuesFor(match.source.row);
    if (differs(match.dbRow, expected)) {
      updates.push({
        id: match.dbRow.id,
        key: match.physicalKey,
        file: match.source.file,
        match_mode: match.matchMode,
        expected,
      });
    }
  }

  return {
    updates,
    matching,
    plan: {
      mode: APPLY ? 'apply' : 'dry-run',
      raw_latest_composite_rows: sourceRows.length,
      db_rows: dbRows.length,
      rows_requiring_currency_repair: updates.length,
      missing_in_db: matching.missingInDb.length,
      unexpected_db_rows: matching.unexpectedDbRows.length,
      ambiguous_legacy_identity: matching.ambiguousLegacyIdentity.length,
      plan_sha256: crypto.createHash('sha256').update(JSON.stringify(updates)).digest('hex'),
      sample_updates: updates.slice(0, 3),
      sample_ambiguous_legacy_identity: matching.ambiguousLegacyIdentity.slice(0, 3),
    },
  };
}

async function main() {
  const { files, rows } = readLatestRawRows();
  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;
  if (!DB_HOST || !DB_USER || !DB_PASSWORD || !DB_NAME) {
    throw new Error('Database configuration is incomplete.');
  }
  const db = await mysql.createConnection({
    host: DB_HOST,
    port: Number(DB_PORT || 3306),
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    dateStrings: true,
  });

  try {
    const [dbRows] = await db.query(`
      SELECT id, no_pesanan, nomor_referensi_sku, nama_variasi, harga_setelah_diskon,
        ${Object.values(NUMERIC_COLUMNS).join(', ')}
      FROM order_all
    `);
    const { updates, matching, plan } = buildRepairPlan([...rows.values()], dbRows);
    plan.source_files_in_priority_order = files;
    console.log(JSON.stringify(plan, null, 2));

    if (!APPLY) return;
    if (matching.missingInDb.length
      || matching.unexpectedDbRows.length
      || matching.ambiguousLegacyIdentity.length) {
      throw new Error('Refusing repair because raw/DB physical identity sets are incomplete or ambiguous');
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

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = {
  NUMERIC_COLUMNS,
  buildRepairPlan,
  getLegacyOrderKeyFromExcelRow,
  getLegacyOrderKeyFromStoredRow,
  matchSourceRowsToDbRows,
  readLatestRawRows,
};
