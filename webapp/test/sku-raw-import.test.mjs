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
