import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import XLSX from 'xlsx';

const require = createRequire(import.meta.url);
const fixtureDir = path.resolve(process.cwd(), '../data_sample/new_sample');
const balanceFixture = path.resolve(process.cwd(), '../data_sample/my_balance_transaction_report.shopee.20260707_20260806.xlsx');

function workbookFixture(name) {
  const filePath = path.join(fixtureDir, name);
  return {
    sourceFile: name,
    buffer: fs.readFileSync(filePath),
    workbook: XLSX.readFile(filePath, { raw: true, cellDates: true }),
  };
}

test('parseBalancePackage detects semantic header beneath metadata and reconciles summary with signed ledger rows', () => {
  const { parseBalancePackage, computeSha256 } = require('../lib/balance-raw-import.js');
  const sourceFile = path.basename(balanceFixture);
  const buffer = fs.readFileSync(balanceFixture);
  const parsed = parseBalancePackage(XLSX.readFile(balanceFixture, { raw: true, cellDates: true }), sourceFile, computeSha256(buffer));

  assert.equal(parsed.valid, true);
  assert.deepEqual(parsed.reportPeriod, { from: '2026-07-07', to: '2026-08-06' });
  assert.equal(parsed.summary.total_saldo_masuk, 78276073);
  assert.equal(parsed.summary.total_saldo_keluar, -87381160);
  assert.equal(parsed.reconciliation.status, 'matched');
  assert.equal(parsed.ledgerContinuity.status, 'matched');
  assert.ok(parsed.transactions.length > 0);
  const adjustment = parsed.transactions.find((row) => row.no_pesanan_extracted === '2607207G41W53E');
  assert.equal(adjustment.no_pesanan_direct, null);
  assert.equal(adjustment.jumlah_signed, -408);
  const direct = parsed.transactions.find((row) => row.no_pesanan_direct === '26080183P4NDAG');
  assert.equal(direct.no_pesanan_extracted, null);
});

test('parseBalancePackage fails closed when summary no longer matches signed rows', () => {
  const { parseBalancePackage } = require('../lib/balance-raw-import.js');
  const workbook = XLSX.readFile(balanceFixture, { raw: true, cellDates: true });
  const sheet = workbook.Sheets['Transaction Report'];
  sheet.E12 = { t: 'n', v: 1 };
  const parsed = parseBalancePackage(workbook, 'broken.xlsx', 'a'.repeat(64));
  assert.equal(parsed.valid, false);
  assert.equal(parsed.reconciliation.status, 'mismatched');
  assert.match(parsed.errors.join('\n'), /Saldo Masuk/);
});

test('parseExceptionPackage preserves item-level Cancellation, Failed Delivery claim fields, and Return/Refund signed fields', () => {
  const { parseExceptionPackage } = require('../lib/exception-raw-import.js');
  const cancellation = workbookFixture('Order.cancellation.20260707_20260807.xlsx');
  const failed = workbookFixture('Order.failed_delivery.20260707_20260807.xlsx');
  const returned = workbookFixture('Order.return_refund.20260707_20260807.xls');

  const cancelled = parseExceptionPackage(cancellation.workbook, cancellation.sourceFile, 'b'.repeat(64));
  assert.equal(cancelled.reportType, 'order_cancellation');
  assert.equal(cancelled.valid, true);
  assert.ok(cancelled.rows.length > new Set(cancelled.rows.map((row) => row.no_pesanan)).size);

  const failedDelivery = parseExceptionPackage(failed.workbook, failed.sourceFile, 'c'.repeat(64));
  assert.equal(failedDelivery.reportType, 'order_failed_delivery');
  assert.equal(failedDelivery.valid, true);
  assert.equal(failedDelivery.rows[0].status_pengiriman_gagal, 'Selesai Dikirim ke Penjual');
  assert.ok(Object.hasOwn(failedDelivery.rows[0].raw_payload, 'jumlah_kompensasi'));

  const returnRefund = parseExceptionPackage(returned.workbook, returned.sourceFile, 'd'.repeat(64));
  assert.equal(returnRefund.reportType, 'order_return_refund');
  assert.equal(returnRefund.valid, true);
  assert.ok(returnRefund.rows.length > new Set(returnRefund.rows.map((row) => row.no_pesanan)).size);
  const signed = returnRefund.rows.find((row) => row.no_pesanan === '2607060YHKT3W6');
  assert.equal(signed.pelepasan_dana_signed, -12478);
  assert.equal(signed.ongkos_kirim_pengiriman_signed, -6500);
});

test('parseAdsPackage handles UTF-8 CSV metadata, valid dates, signed values, and repeated events', () => {
  const { parseAdsPackage } = require('../lib/ads-raw-import.js');
  const csvPath = path.join(fixtureDir, 'tacticalized_adwords_bill_2026-08-12.csv');
  const buffer = fs.readFileSync(csvPath);
  const parsed = parseAdsPackage(buffer, path.basename(csvPath), 'e'.repeat(64));

  assert.equal(parsed.valid, true);
  assert.deepEqual(parsed.reportPeriod, { from: '2026-07-07', to: '2026-08-06' });
  assert.equal(parsed.metadata.currency, 'IDR');
  assert.equal(parsed.metadata.seller_username, 'tacticalized');
  assert.equal(parsed.rows.length, 178);
  assert.equal(parsed.rows.filter((row) => row.description === 'Isi Saldo').length, 147);
  assert.equal(parsed.rows.find((row) => row.description.startsWith('Deduction')).jumlah_signed, -290407);
});

test('detectRawExpansionReportType classifies structure without trusting filenames', () => {
  const { detectRawExpansionReportType } = require('../lib/raw-expansion-classifier.js');
  const failed = workbookFixture('Order.failed_delivery.20260707_20260807.xlsx');
  const cancellation = workbookFixture('Order.cancellation.20260707_20260807.xlsx');
  const returned = workbookFixture('Order.return_refund.20260707_20260807.xls');
  const orderAll = XLSX.readFile(path.resolve(process.cwd(), '../data_sample/sample_all_store/tacticalized/Order.all.20260501_20260531.xlsx'), { raw: true, cellDates: true });
  const balance = XLSX.readFile(balanceFixture, { raw: true, cellDates: true });

  assert.equal(detectRawExpansionReportType({ workbook: balance }), 'balance');
  assert.equal(detectRawExpansionReportType({ workbook: failed.workbook }), 'order_failed_delivery');
  assert.equal(detectRawExpansionReportType({ workbook: cancellation.workbook }), 'order_cancellation');
  assert.equal(detectRawExpansionReportType({ workbook: returned.workbook }), 'order_return_refund');
  assert.equal(detectRawExpansionReportType({ workbook: orderAll }), 'order_all');
  assert.equal(detectRawExpansionReportType({ csvBuffer: Buffer.from('Urutan,Waktu,Deskripsi,Jumlah,Catatan\n1,99/99/2026,X,1,-\n') }), 'ads_ledger');
});

test('classifier gives a specific failed-delivery marker precedence over an otherwise valid Order.all layout', () => {
  const { detectRawExpansionReportType } = require('../lib/raw-expansion-classifier.js');
  const source = XLSX.readFile(path.resolve(process.cwd(), '../data_sample/sample_all_store/tacticalized/Order.all.20260501_20260531.xlsx'), { raw: true, cellDates: true });
  const sourceRows = XLSX.utils.sheet_to_json(source.Sheets.orders, { header: 1, defval: null, raw: true });
  sourceRows[0] = [...sourceRows[0], 'Status pengiriman gagal', 'Jumlah Kompensasi'];
  sourceRows[1] = [...sourceRows[1], 'Gagal terkirim', 0];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(sourceRows), 'orders');

  assert.equal(detectRawExpansionReportType({ workbook }), 'order_failed_delivery');
});

test('parseExceptionPackage preserves physical Excel row identity after blank source rows', () => {
  const { parseExceptionPackage } = require('../lib/exception-raw-import.js');
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ['No. Pesanan', 'Status Pesanan', 'Alasan Pembatalan', 'Total Pembayaran'],
    ['260801ABCDEF12', 'Batal', 'Dibatalkan pembeli', 0],
    [],
    ['260802ABCDEF34', 'Batal', 'Dibatalkan pembeli', 0],
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, 'orders');
  const parsed = parseExceptionPackage(workbook, 'blank-row.xlsx', 'f'.repeat(64));
  assert.equal(parsed.valid, true);
  assert.deepEqual(parsed.rows.map((row) => row.source_excel_row), [2, 4]);
});

test('parseAdsPackage preserves physical CSV row identity after blank source rows', () => {
  const { parseAdsPackage } = require('../lib/ads-raw-import.js');
  const csv = Buffer.from([
    'Mata uang:,IDR',
    'Username:,tacticalized',
    'Tanggal:,01/08/2026 -- 02/08/2026',
    'ID Toko:,123',
    'Urutan,Waktu,Deskripsi,Jumlah,Catatan',
    '1,01/08/2026,Isi Saldo,100,',
    '',
    '2,02/08/2026,Deduction,-50,',
  ].join('\n'));
  const parsed = parseAdsPackage(csv, 'blank-row.csv', 'g'.repeat(64));
  assert.equal(parsed.valid, true);
  assert.deepEqual(parsed.rows.map((row) => row.source_csv_row), [6, 8]);
});

test('buildRawPreview exposes preview keys that exist directly on preview rows', () => {
  const { buildRawPreview } = require('../lib/raw-expansion-db.js');
  const parsed = {
    valid: true,
    sourceFile: 'ads.csv',
    sha256: 'h'.repeat(64),
    reportPeriod: { from: '2026-08-01', to: '2026-08-02' },
    headers: [],
    warnings: [],
    metadata: {},
    rows: [{ source_csv_row: 7, sequence_number: 1, transaction_date: '2026-08-01', description: 'Deduction', jumlah_signed: -50, note: null, raw_payload: { urutan: 1 } }],
  };
  const preview = buildRawPreview(parsed, 'ads_ledger', null);
  assert.ok(preview.previewColumns.every((column) => Object.hasOwn(preview.previewRows[0], column.key)));
  assert.equal(preview.previewRows[0].jumlah_signed, -50);
});

test('preview ticket is store, hash, report-type bound and expires', () => {
  const { createPreviewTicket, verifyPreviewTicket } = require('../lib/upload-preview-ticket.js');
  const secret = 'test-secret';
  const ticket = createPreviewTicket({ storeId: 7, sha256: 'a'.repeat(64), reportType: 'ads_ledger', now: 1_000 }, secret, 60);
  assert.deepEqual(verifyPreviewTicket(ticket, { storeId: 7, sha256: 'a'.repeat(64), reportType: 'ads_ledger', now: 1_030 }, secret), { valid: true, error: null });
  assert.equal(verifyPreviewTicket(ticket, { storeId: 8, sha256: 'a'.repeat(64), reportType: 'ads_ledger', now: 1_030 }, secret).valid, false);
  assert.equal(verifyPreviewTicket(ticket, { storeId: 7, sha256: 'b'.repeat(64), reportType: 'ads_ledger', now: 1_030 }, secret).valid, false);
  assert.equal(verifyPreviewTicket(ticket, { storeId: 7, sha256: 'a'.repeat(64), reportType: 'ads_ledger', now: 1_061 }, secret).valid, false);
});

test('importRawPackage rolls back parent and children when a child insert fails', async () => {
  const { parseAdsPackage } = require('../lib/ads-raw-import.js');
  const { importRawPackage } = require('../lib/raw-expansion-db.js');
  const csvPath = path.join(fixtureDir, 'tacticalized_adwords_bill_2026-08-12.csv');
  const parsed = parseAdsPackage(fs.readFileSync(csvPath), 'ads.csv', 'f'.repeat(64));
  const calls = [];
  const conn = {
    async beginTransaction() { calls.push('begin'); },
    async rollback() { calls.push('rollback'); },
    async commit() { calls.push('commit'); },
    async query(sql) {
      calls.push(sql);
      if (sql.startsWith('SELECT id')) return [[]];
      if (sql.startsWith('INSERT INTO ads_report_imports')) return [{ insertId: 91 }];
      throw new Error('child insert exploded');
    },
  };
  await assert.rejects(importRawPackage(conn, parsed, 'ads_ledger', 1), /child insert exploded/);
  assert.deepEqual(calls.slice(0, 2), ['begin', calls[1]]);
  assert.ok(calls.includes('rollback'));
  assert.ok(!calls.includes('commit'));
});

test('RAW duplicate lookup is a same-store no-op and permits the same hash in another store', async () => {
  const { findExistingRawImport } = require('../lib/raw-expansion-db.js');
  const calls = [];
  const conn = {
    async query(sql, params) {
      calls.push({ sql, params });
      return [params[0] === 7 ? [{ id: 41, source_file: 'same.csv' }] : []];
    },
  };
  const hash = 'a'.repeat(64);
  assert.equal((await findExistingRawImport(conn, 'ads_ledger', 7, hash)).id, 41);
  assert.equal(await findExistingRawImport(conn, 'ads_ledger', 8, hash), null);
  assert.deepEqual(calls.map((call) => call.params), [[7, hash], [8, hash]]);
});

test('RAW pages render documented Balance and Ads import history, while exceptions remain transaction tabs only', () => {
  const rawPage = fs.readFileSync(path.resolve(process.cwd(), 'components/RawReportPage.tsx'), 'utf8');
  const balance = fs.readFileSync(path.resolve(process.cwd(), 'app/balance/page.tsx'), 'utf8');
  const ads = fs.readFileSync(path.resolve(process.cwd(), 'app/ads/page.tsx'), 'utf8');
  const exceptions = fs.readFileSync(path.resolve(process.cwd(), 'app/exceptions/page.tsx'), 'utf8');
  assert.match(rawPage, /Import History/);
  assert.match(rawPage, /imports/);
  assert.match(balance, /importHistory/);
  assert.match(ads, /importHistory/);
  assert.doesNotMatch(exceptions, /importHistory/);
});

test('RAW upload and read routes preserve the documented HTTP safety contract', () => {
  const upload = fs.readFileSync(path.resolve(process.cwd(), 'app/api/upload/route.ts'), 'utf8');
  const raw = fs.readFileSync(path.resolve(process.cwd(), 'app/api/raw/route.ts'), 'utf8');
  const balance = fs.readFileSync(path.resolve(process.cwd(), 'app/api/balance/route.ts'), 'utf8');
  const exceptions = fs.readFileSync(path.resolve(process.cwd(), 'app/api/exceptions/route.ts'), 'utf8');
  const ads = fs.readFileSync(path.resolve(process.cwd(), 'app/api/ads/route.ts'), 'utf8');
  assert.match(upload, /isMutationAuthorized/);
  assert.match(upload, /isSameOriginMutation/);
  assert.match(upload, /action !== 'preview' && action !== 'import'/);
  assert.match(upload, /if \(action === 'preview'\)/);
  assert.match(upload, /verifyPreviewTicket/);
  assert.match(upload, /if \(!ticketCheck\.valid\) return NextResponse\.json\(\{ error: ticketCheck\.error \}, \{ status: 400 \}\)/);
  assert.match(raw, /requireStoreId/);
  assert.match(raw, /parsePagination/);
  assert.match(raw, /parseReportType/);
  assert.match(raw, /buildRawExpansionQueryPlan/);
  assert.match(raw, /WHERE store_id = \?/);
  assert.match(balance, /reportType', 'balance'/);
  assert.match(exceptions, /Invalid exception section/);
  assert.match(ads, /reportType', 'ads'/);
});

test('RAW migration dry-run stays read-only and apply does not falsely promise transactional DDL rollback', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'scripts/migrate-raw-expansion.js'), 'utf8');
  assert.match(source, /const apply = process\.argv\.includes\('--apply'\)/);
  assert.match(source, /process\.argv\.includes\('--confirm-ddl'\)/);
  assert.doesNotMatch(source, /await conn\.beginTransaction\(\);\s*try \{ for \(const ddl/m);
  assert.match(source, /DDL MySQL dapat implicit commit/);
});

test('RAW migration indexes every documented audit field', () => {
  const { CHILDREN } = require('../scripts/migrate-raw-expansion.js');
  const required = {
    balance_transactions_raw: ['transaction_at', 'type_transaksi', 'description', 'no_pesanan_direct', 'no_pesanan_extracted', 'jenis_transaksi', 'jumlah_signed', 'status', 'saldo_akhir'],
    order_cancellation_raw: ['no_pesanan', 'status_pesanan', 'alasan_pembatalan', 'status_pembatalan_pengembalian', 'no_resi', 'nomor_referensi_sku', 'nama_variasi', 'jumlah', 'subtotal_pesanan', 'total_pembayaran', 'waktu_pesanan_dibuat', 'waktu_pesanan_selesai'],
    order_failed_delivery_raw: ['no_pesanan', 'status_pesanan', 'status_pembatalan_pengembalian', 'status_pengiriman_gagal', 'no_resi', 'nomor_referensi_sku', 'nama_variasi', 'jumlah', 'subtotal_pesanan', 'total_pembayaran', 'waktu_pesanan_dibuat', 'waktu_pesanan_selesai', 'status_klaim', 'tanggal_klaim_diajukan', 'tanggal_klaim_disetujui', 'tanggal_klaim_dicairkan', 'tanggal_klaim_ditolak', 'jumlah_kompensasi'],
    order_return_refund_raw: ['no_pengembalian', 'no_pesanan', 'waktu_pesanan_dibuat', 'kode_variasi', 'variasi', 'status_pembatalan_pengembalian', 'tipe_pengembalian', 'jumlah_produk_dikembalikan', 'solusi_pengembalian', 'alasan_pengembalian', 'total_pengembalian_dana', 'waktu_pengembalian_dana_selesai', 'status_pengembalian_barang', 'pelepasan_dana_signed', 'ongkos_kirim_pengiriman_signed', 'ongkos_kirim_pengembalian_signed', 'jumlah_kompensasi_signed'],
    ads_transactions_raw: ['sequence_number', 'transaction_date', 'description', 'jumlah_signed', 'note'],
  };
  for (const [table, fields] of Object.entries(required)) {
    for (const field of fields) assert.match(CHILDREN[table], new RegExp(`KEY idx_[a-z_]+ \\(${field.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}(?:\\(|,|\\))`));
  }
});
