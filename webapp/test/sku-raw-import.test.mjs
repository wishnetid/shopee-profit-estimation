import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';

import skuRawImport from '../lib/sku-raw-import.js';
import skuRawDb from '../lib/sku-raw-db.js';

const { parseSkuRawPackage } = skuRawImport;
const { buildSkuPreview, importSkuRawPackage } = skuRawDb;
const projectRoot = path.resolve(import.meta.dirname, '../..');
const dataSample = (name) => path.join(projectRoot, 'data_sample', name);

function readWorkbook(name) {
  return XLSX.read(fs.readFileSync(dataSample(name)), { type: 'buffer', raw: true });
}

test('parseSkuRawPackage preserves every real master.xlsx row including exact duplicate content', () => {
  const parsed = parseSkuRawPackage(
    readWorkbook('master.xlsx'),
    'master.xlsx',
    'sha-sku-test',
  );

  assert.equal(parsed.valid, true);
  assert.equal(parsed.sheetName, 'Sheet1');
  assert.equal(parsed.rows.length, 32);
  assert.equal(new Set(parsed.rows.map((row) => row.source_excel_row)).size, 32);
  assert.equal(new Set(parsed.rows.map((row) => JSON.stringify(row.raw_payload))).size, 29);
  assert.deepEqual(parsed.headers, ['SKU1', 'SKU2', 'Harga', 'IDPRODUK']);
});

test('parseSkuRawPackage preserves physical extra columns with repeated display labels', () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['SKU1', 'SKU2', 'Harga', 'IDPRODUK', 'Catatan', 'Catatan'],
    ['SKU-1', 'SKU-ALIAS', '52.500', 'PROD-1', 'catatan awal', 'catatan akhir'],
  ]), 'Sheet1');

  const parsed = parseSkuRawPackage(workbook, 'repeated-extra-header.xlsx', 'sha-extra');

  assert.equal(parsed.valid, true);
  assert.deepEqual(parsed.rows[0].raw_payload, {
    sku1: 'SKU-1',
    sku2: 'SKU-ALIAS',
    harga: '52.500',
    idproduk: 'PROD-1',
    catatan__1: 'catatan awal',
    catatan__2: 'catatan akhir',
  });
});

test('parseSkuRawPackage blocks ambiguous duplicate required headers before import', () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['SKU1', 'SKU1', 'SKU2', 'Harga', 'IDPRODUK'],
    ['SKU-utama', 'SKU-lain', 'SKU-alias', 50000, 'PROD-1'],
  ]), 'Sheet1');

  const parsed = parseSkuRawPackage(workbook, 'duplicate-required-header.xlsx', 'sha-bad-header');

  assert.equal(parsed.valid, false);
  assert.equal(parsed.rows.length, 0);
  assert.ok(parsed.errors.some((error) => error.includes('SKU1') && error.includes('tepat satu kali')));
});

test('buildSkuPreview exposes canonical preview keys and source values', () => {
  const parsed = parseSkuRawPackage(readWorkbook('master.xlsx'), 'master.xlsx', 'sha-sku-preview');
  const preview = buildSkuPreview(parsed, null);

  assert.deepEqual(preview.previewColumns, [
    { key: 'source_excel_row', label: 'Row Excel' },
    { key: 'sku1', label: 'SKU1' },
    { key: 'sku2', label: 'SKU2' },
    { key: 'harga', label: 'Harga' },
    { key: 'idproduk', label: 'IDPRODUK' },
  ]);
  assert.equal(preview.previewRows[0].source_excel_row, parsed.rows[0].source_excel_row);
  assert.equal(preview.previewRows[0].sku1, parsed.rows[0].sku1);
  assert.equal(preview.previewRows[0].harga, parsed.rows[0].harga);
});

test('buildSkuPreview keeps duplicate and blank source headers addressable', () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['SKU1', 'SKU2', 'Harga', 'IDPRODUK', 'Catatan', 'Catatan', '', ''],
    ['SKU-1', 'SKU-ALIAS', 52500, 'PROD-1', 'awal', 'akhir', 'blank awal', 'blank akhir'],
  ]), 'Sheet1');

  const parsed = parseSkuRawPackage(workbook, 'duplicate-extra-header.xlsx', 'sha-extra-preview');
  const preview = buildSkuPreview(parsed, null);
  const keys = preview.previewColumns.map((column) => column.key);

  assert.equal(new Set(keys).size, keys.length);
  assert.deepEqual(preview.previewColumns.slice(-4), [
    { key: 'catatan__1', label: 'Catatan' },
    { key: 'catatan__2', label: 'Catatan' },
    { key: 'kolom__1', label: '' },
    { key: 'kolom__2', label: '' },
  ]);
  assert.equal(preview.previewRows[0].catatan__1, 'awal');
  assert.equal(preview.previewRows[0].catatan__2, 'akhir');
  assert.equal(preview.previewRows[0].kolom__1, 'blank awal');
  assert.equal(preview.previewRows[0].kolom__2, 'blank akhir');
});

test('buildSkuPreview isolates source headers that collide with preview metadata keys', () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['SKU1', 'SKU2', 'Harga', 'IDPRODUK', 'source_excel_row'],
    ['SKU-1', 'SKU-ALIAS', 52500, 'PROD-1', 'source value'],
  ]), 'Sheet1');

  const parsed = parseSkuRawPackage(workbook, 'metadata-collision.xlsx', 'sha-metadata-collision');
  const preview = buildSkuPreview(parsed, null);
  const keys = preview.previewColumns.map((column) => column.key);

  assert.equal(new Set(keys).size, keys.length);
  assert.deepEqual(preview.previewColumns.at(-1), {
    key: 'source_excel_row__1',
    label: 'source_excel_row',
  });
  assert.equal(preview.previewRows[0].source_excel_row, 2);
  assert.equal(preview.previewRows[0].source_excel_row__1, 'source value');
});

test('buildSkuPreview marks exact SHA-256 as duplicate no-op and leaves different file importable', () => {
  const parsed = parseSkuRawPackage(readWorkbook('master.xlsx'), 'master.xlsx', 'sha-sku-test');

  const duplicate = buildSkuPreview(parsed, { id: 9, source_sha256: 'sha-sku-test' });
  assert.equal(duplicate.duplicateHash, true);
  assert.equal(duplicate.canImport, false);
  assert.equal(duplicate.newRows, 0);
  assert.equal(duplicate.unchangedRows, 32);

  const fresh = buildSkuPreview({ ...parsed, sha256: 'sha-sku-new' }, null);
  assert.equal(fresh.duplicateHash, false);
  assert.equal(fresh.canImport, true);
  assert.equal(fresh.newRows, 32);
});

test('importSkuRawPackage rolls back parent and all rows when one RAW batch fails', async () => {
  const calls = [];
  const conn = {
    async beginTransaction() { calls.push('begin'); },
    async rollback() { calls.push('rollback'); },
    async commit() { calls.push('commit'); },
    async query(sql) {
      calls.push(sql.split(/\s+/).slice(0, 3).join(' '));
      if (sql.includes('SELECT id, source_file')) return [[]];
      if (sql.includes('INSERT INTO sku_report_imports')) return [{ insertId: 10 }];
      if (sql.includes('INSERT INTO sku_master_raw')) throw new Error('forced SKU child failure');
      return [{ affectedRows: 0 }];
    },
  };
  const parsed = parseSkuRawPackage(readWorkbook('master.xlsx'), 'master.xlsx', 'sha-sku-rollback');

  await assert.rejects(() => importSkuRawPackage(conn, parsed), /forced SKU child failure/);
  assert.deepEqual(calls.filter((call) => ['begin', 'commit', 'rollback'].includes(call)), ['begin', 'rollback']);
});
