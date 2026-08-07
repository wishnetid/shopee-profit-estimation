import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';

import incomeRawImport from '../lib/income-raw-import.js';

const {
  canonicalizeHeaders,
  detectHeaderRow,
  parseIncomePackage,
} = incomeRawImport;
import incomeRawDb from '../lib/income-raw-db.js';

const { buildIncomePreview, importIncomePackage } = incomeRawDb;

const projectRoot = path.resolve(import.meta.dirname, '../..');
const dataSample = (name) => path.join(projectRoot, 'data_sample', name);

function readWorkbook(name) {
  return XLSX.read(fs.readFileSync(dataSample(name)), { type: 'buffer', raw: true });
}

test('detectHeaderRow finds Penghasilan real header by required labels anywhere in a multi-row header', () => {
  const workbook = readWorkbook('Income.sudah dilepas.id.20260701_20260731.xlsx');
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets.Penghasilan, { header: 1, defval: null });

  assert.equal(detectHeaderRow(rows, ['No. Pesanan', 'Lihat berdasarkan']), 2);
});

test('canonicalizeHeaders preserves both repeated Gratis Ongkir XTRA source columns', () => {
  const result = canonicalizeHeaders([
    'No. Pesanan',
    'Biaya Gratis Ongkir XTRA - Ukuran Biasa (Kategori F)',
    'Biaya Gratis Ongkir XTRA - Ukuran Biasa (Kategori F)',
  ]);

  assert.deepEqual(result.map((field) => field.key), [
    'no_pesanan',
    'biaya_gratis_ongkir_xtra_ukuran_biasa_kategori_f__1',
    'biaya_gratis_ongkir_xtra_ukuran_biasa_kategori_f__2',
  ]);
});

test('parseIncomePackage preserves Order and Sku rows, signed values, and duplicate headers from a real workbook', () => {
  const parsed = parseIncomePackage(
    readWorkbook('Income.sudah dilepas.id.20260701_20260731.xlsx'),
    'Income.sudah dilepas.id.20260701_20260731.xlsx',
    'sha-test',
  );

  assert.equal(parsed.valid, true);
  assert.equal(parsed.sections.penghasilan.orderRows.length > 0, true);
  assert.equal(parsed.sections.penghasilan.skuRows.length > 0, true);

  const screenshotOrder = parsed.sections.penghasilan.orderRows.find((row) => row.no_pesanan === '2607072CRRDA37');
  assert.ok(screenshotOrder);
  assert.equal(screenshotOrder.signed_total, 66193);
  assert.equal(screenshotOrder.raw_payload.biaya_gratis_ongkir_xtra_ukuran_biasa_kategori_f__1, -4125);
  assert.equal(screenshotOrder.raw_payload.biaya_gratis_ongkir_xtra_ukuran_biasa_kategori_f__2, 0);
});

test('parseIncomePackage reconciles Summary Total Pendapatan against Penghasilan Order signed totals', () => {
  const parsed = parseIncomePackage(
    readWorkbook('Income.sudah dilepas.id.20260701_20260731.xlsx'),
    'Income.sudah dilepas.id.20260701_20260731.xlsx',
    'sha-test',
  );

  assert.equal(parsed.reconciliation.status, 'matched');
  assert.equal(parsed.reconciliation.summaryTotal, parsed.reconciliation.orderSignedTotal);
});

test('parseIncomePackage reconciles the legacy June layout without double-counting XTRA breakdowns', () => {
  const parsed = parseIncomePackage(
    readWorkbook('Income.sudah dilepas.id.20260601_20260630.xlsx'),
    'Income.sudah dilepas.id.20260601_20260630.xlsx',
    'sha-june',
  );

  assert.equal(parsed.valid, true);
  assert.equal(parsed.reconciliation.status, 'matched');
  assert.equal(parsed.reconciliation.summaryTotal, parsed.reconciliation.orderSignedTotal);
});

test('parseIncomePackage marks optional Adjustment and Shipping Fee Discrepancy as absent instead of silently dropping them', () => {
  const parsed = parseIncomePackage(
    readWorkbook('Income.sudah dilepas.id.20260801_20260808.xlsx'),
    'Income.sudah dilepas.id.20260801_20260808.xlsx',
    'sha-test',
  );

  assert.equal(parsed.valid, true);
  assert.equal(parsed.sections.adjustment.status, 'absent');
  assert.equal(parsed.sections.shippingFeeDiscrepancy.status, 'absent');
  assert.ok(parsed.warnings.some((warning) => warning.includes('Adjustment')));
  assert.ok(parsed.warnings.some((warning) => warning.includes('Shipping Fee Discrepancy')));
});

test('buildIncomePreview marks an exact previously-imported SHA-256 as duplicate no-op', () => {
  const parsed = parseIncomePackage(
    readWorkbook('Income.sudah dilepas.id.20260701_20260731.xlsx'),
    'Income.sudah dilepas.id.20260701_20260731.xlsx',
    'sha-duplicate',
  );

  const preview = buildIncomePreview(parsed, { id: 77, source_sha256: 'sha-duplicate' });

  assert.equal(preview.duplicateHash, true);
  assert.equal(preview.canImport, false);
  assert.equal(preview.existingImportId, 77);
});

test('buildIncomePreview keeps a different overlapping report importable as an isolated RAW package', () => {
  const parsed = parseIncomePackage(
    readWorkbook('Income.sudah dilepas.id.20260701_20260731.xlsx'),
    'Income.sudah dilepas.id.20260701_20260731.xlsx',
    'sha-new',
  );

  const preview = buildIncomePreview(parsed, null);

  assert.equal(preview.duplicateHash, false);
  assert.equal(preview.canImport, true);
  assert.equal(preview.newRows, preview.sections.penghasilanOrder.rows + preview.sections.penghasilanSku.rows + preview.sections.adjustment.rows + preview.sections.shippingFeeDiscrepancy.rows);
  assert.equal(preview.existingRows, 0);
  assert.equal(preview.unchangedRows, 0);
  assert.equal(preview.sections.penghasilanOrder.rows > 0, true);
  assert.equal(preview.sections.penghasilanSku.rows > 0, true);
});

test('importIncomePackage rolls back the entire package when a RAW child insert fails', async () => {
  const calls = [];
  const conn = {
    async beginTransaction() { calls.push('begin'); },
    async rollback() { calls.push('rollback'); },
    async commit() { calls.push('commit'); },
    async query(sql) {
      calls.push(sql.split(/\s+/).slice(0, 3).join(' '));
      if (sql.includes('SELECT id, source_file')) return [[]];
      if (sql.includes('INSERT INTO income_report_imports')) return [{ insertId: 99 }];
      if (sql.includes('INSERT INTO income_penghasilan_raw')) throw new Error('forced child failure');
      return [{ affectedRows: 0 }];
    },
  };
  const parsed = parseIncomePackage(
    readWorkbook('Income.sudah dilepas.id.20260801_20260808.xlsx'),
    'Income.sudah dilepas.id.20260801_20260808.xlsx',
    'sha-rollback',
  );

  await assert.rejects(() => importIncomePackage(conn, parsed), /forced child failure/);
  assert.deepEqual(calls.filter((call) => ['begin', 'commit', 'rollback'].includes(call)), ['begin', 'rollback']);
});

test('parseIncomePackage blocks missing required Penghasilan sheet', () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Laporan Penghasilan']]), 'Summary');

  const parsed = parseIncomePackage(workbook, 'missing-penghasilan.xlsx', 'sha-test');

  assert.equal(parsed.valid, false);
  assert.ok(parsed.errors.some((error) => error.includes('Penghasilan')));
});

test('parseIncomePackage blocks an unknown Penghasilan view before import', () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Dari', '2026-08-01'],
    ['ke', '2026-08-08'],
    ['1. Total Pendapatan', null, null, 100],
  ]), 'Summary');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['No.', 'Lihat berdasarkan', 'No. Pesanan', 'Harga Produk'],
    [1, 'Unknown', 'ORDER-1', 100],
  ]), 'Penghasilan');

  const parsed = parseIncomePackage(workbook, 'bad-view.xlsx', 'sha-test');

  assert.equal(parsed.valid, false);
  assert.ok(parsed.errors.some((error) => error.includes('Lihat berdasarkan')));
});
