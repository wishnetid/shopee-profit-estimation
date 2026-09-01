import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import orderAllImport from '../lib/order-all-import.js';

const require = createRequire(import.meta.url);

const {
  assignOrderAllLineOrdinals,
  getOrderAllCompositeKeyFromStoredRow,
  validateOrderAllCompositeKeys,
} = orderAllImport;

test('Order.all accepts repeated source lines and assigns a stable ordinal per base identity', () => {
  const row = {
    'No. Pesanan': '2608137PTBR0W7',
    'Nomor Referensi SKU': 'M-TAC Panjang',
    'Nama Variasi': 'Hijau Army,XL',
    'Harga Setelah Diskon': '95.500',
  };
  const result = validateOrderAllCompositeKeys([row, { ...row }]);
  const lines = assignOrderAllLineOrdinals([row, { ...row }]);

  assert.equal(result.valid, true);
  assert.deepEqual(lines.map((line) => line.lineOrdinal), [1, 2]);
});

test('Order.all requires complete base identity fields', () => {
  const result = validateOrderAllCompositeKeys([{
    'No. Pesanan': '2608137PTBR0W7',
    'Nomor Referensi SKU': 'M-TAC Panjang',
    'Nama Variasi': 'Hijau Army,XL',
    'Harga Setelah Diskon': '-',
  }]);

  assert.equal(result.valid, false);
  assert.equal(result.missingCount, 1);
  assert.deepEqual(result.missingSamples, [2]);
});

test('Order.all uses one canonical identity for stored DECIMAL price and ordinal', () => {
  const storedKey = getOrderAllCompositeKeyFromStoredRow({
    no_pesanan: '2608137PTBR0W7',
    nomor_referensi_sku: 'M-TAC Panjang',
    nama_variasi: 'Hijau Army,XL',
    harga_setelah_diskon: '95500.00',
    line_ordinal: 2,
  });

  assert.match(storedKey, /95500\.00\|\|2$/);
});

test('line-ordinal migration removes legacy unique indexes that would collapse repeated source lines', () => {
  const migration = awaitableRequire('../scripts/migrate-order-all-line-ordinal.js');
  assert.deepEqual(migration.IDENTITY, [
    'store_id', 'no_pesanan', 'nomor_referensi_sku', 'nama_variasi', 'harga_setelah_diskon', 'line_ordinal',
  ]);
  assert.match(
    fs.readFileSync(path.resolve(process.cwd(), 'scripts/migrate-order-all-line-ordinal.js'), 'utf8'),
    /LEGACY_CONFLICTING_UNIQUE_INDEXES[\s\S]*uk_order_item_store[\s\S]*uk_order_item/,
  );
  assert.throws(() => migration.assertFinalIdentityState({
    lineOrdinal: { exists: true, isNullable: false, invalidRows: 0 },
    index: { exists: true, nonUnique: 0, columns: migration.IDENTITY },
    legacyConflictingUniqueIndexes: ['uk_order_item_store'],
  }), /legacy conflicting unique index/);
});

test('price identity migration exposes the five-column index and dual explicit apply guard', () => {
  const migration = awaitableRequire('../scripts/migrate-order-all-price-identity.js');
  assert.deepEqual(migration.ORDER_ALL_PRICE_IDENTITY, [
    'store_id',
    'no_pesanan',
    'nomor_referensi_sku',
    'nama_variasi',
    'harga_setelah_diskon',
  ]);
  assert.equal(migration.isApplyConfirmed(['--apply', '--confirm-ddl']), true);
  assert.equal(migration.isApplyConfirmed(['--apply']), false);
});

test('price identity migration refuses blank legacy identity components before replacing uniqueness', () => {
  const migration = awaitableRequire('../scripts/migrate-order-all-price-identity.js');
  assert.throws(() => migration.assertSafeToApply({
    hasDiscountedPriceColumn: true,
    nullDiscountedPriceCount: 0,
    duplicateFivePartKeyGroups: 0,
    priceIndex: { exists: false, columns: [], nonUnique: null },
    identityComponentMissingCounts: {
      noPesanan: 0,
      nomorReferensiSku: 1,
      namaVariasi: 0,
      hargaSetelahDiskon: 0,
    },
  }), /nomorReferensiSku/);
});

test('price identity migration plans and verifies NOT NULL identity columns', () => {
  const migration = awaitableRequire('../scripts/migrate-order-all-price-identity.js');
  const state = {
    hasDiscountedPriceColumn: true,
    nullDiscountedPriceCount: 0,
    duplicateFivePartKeyGroups: 0,
    priceIndex: { exists: false, columns: [], nonUnique: null },
    identityComponentMissingCounts: {
      storeId: 0,
      noPesanan: 0,
      nomorReferensiSku: 0,
      namaVariasi: 0,
      hargaSetelahDiskon: 0,
    },
    identityColumnStates: {
      store_id: { exists: true, isNullable: false },
      no_pesanan: { exists: true, isNullable: false },
      nomor_referensi_sku: { exists: true, isNullable: true },
      nama_variasi: { exists: true, isNullable: true },
      harga_setelah_diskon: { exists: true, isNullable: true },
    },
  };

  assert.deepEqual(migration.plannedNullabilityChanges(state), [
    'MODIFY COLUMN nomor_referensi_sku VARCHAR(100) NOT NULL',
    'MODIFY COLUMN nama_variasi VARCHAR(255) NOT NULL',
    'MODIFY COLUMN harga_setelah_diskon DECIMAL(15,2) NOT NULL',
  ]);
  assert.throws(() => migration.assertFinalIdentityState(state), /nomor_referensi_sku must be NOT NULL/);
});

test('upload route uses the shared price-aware Order.all identity for preview lookup and batch import', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'app/api/upload/route.ts'), 'utf8');
  assert.match(source, /ORDER_ALL_IDENTITY_COLUMNS,/);
  assert.match(source, /ORDER_ALL_DB_IDENTITY_COLUMN_SET/);
  assert.match(source, /getOrderAllCompositeKeyFromStoredRow/);
  assert.match(source, /getOrderAllIdentityValues/);
  assert.match(source, /ORDER_ALL_IDENTITY_COLUMNS,\s*\[\.\.\.ORDER_COLS, 'line_ordinal', 'source_snapshot_at', 'source_snapshot_file'\]/);
});

test('multi-store migration does not reintroduce the legacy three-part Order.all unique key', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'scripts/migrate-multi-store.js'), 'utf8');
  assert.match(source, /uk_order_item_store_price/);
  assert.match(source, /harga_setelah_diskon/);
  assert.match(source, /DROP INDEX uk_order_item_store/);
  assert.doesNotMatch(source, /ADD UNIQUE KEY uk_order_item_store \(store_id, no_pesanan, nomor_referensi_sku, nama_variasi\)/);
});

test('currency repair keeps promotion-split source and DB lines separate by physical identity', () => {
  const repair = awaitableRequire('../scripts/repair-order-all-currency.js');
  const sourceRows = [
    { file: 'source.xlsx', row: { 'No. Pesanan': 'ORDER-1', 'Nomor Referensi SKU': 'SKU-1', 'Nama Variasi': 'Hitam,XL', 'Harga Setelah Diskon': '82.500' } },
    { file: 'source.xlsx', row: { 'No. Pesanan': 'ORDER-1', 'Nomor Referensi SKU': 'SKU-1', 'Nama Variasi': 'Hitam,XL', 'Harga Setelah Diskon': '83.000' } },
  ];
  const dbRows = [
    { id: 1, no_pesanan: 'ORDER-1', nomor_referensi_sku: 'SKU-1', nama_variasi: 'Hitam,XL', harga_setelah_diskon: '82500.00' },
    { id: 2, no_pesanan: 'ORDER-1', nomor_referensi_sku: 'SKU-1', nama_variasi: 'Hitam,XL', harga_setelah_diskon: '83000.00' },
  ];
  const result = repair.matchSourceRowsToDbRows(sourceRows, dbRows);

  assert.deepEqual(result.matches.map((match) => match.matchMode), ['physical', 'physical']);
  assert.equal(result.missingInDb.length, 0);
  assert.equal(result.ambiguousLegacyIdentity.length, 0);
  assert.equal(result.unexpectedDbRows.length, 0);
});

test('currency repair permits legacy fallback only when that three-field group has one source and one DB line', () => {
  const repair = awaitableRequire('../scripts/repair-order-all-currency.js');
  const sourceRows = [
    { file: 'source.xlsx', row: { 'No. Pesanan': 'ORDER-1', 'Nomor Referensi SKU': 'SKU-1', 'Nama Variasi': 'Hitam,XL', 'Harga Setelah Diskon': '82.500' } },
  ];
  const dbRows = [
    { id: 1, no_pesanan: 'ORDER-1', nomor_referensi_sku: 'SKU-1', nama_variasi: 'Hitam,XL', harga_setelah_diskon: '82.50' },
  ];
  const result = repair.matchSourceRowsToDbRows(sourceRows, dbRows);

  assert.deepEqual(result.matches.map((match) => match.matchMode), ['legacy_unambiguous_fallback']);
  assert.equal(result.ambiguousLegacyIdentity.length, 0);
});

test('currency repair refuses an ambiguous legacy fallback for promotion-split source lines', () => {
  const repair = awaitableRequire('../scripts/repair-order-all-currency.js');
  const sourceRows = [
    { file: 'source.xlsx', row: { 'No. Pesanan': 'ORDER-1', 'Nomor Referensi SKU': 'SKU-1', 'Nama Variasi': 'Hitam,XL', 'Harga Setelah Diskon': '82.500' } },
    { file: 'source.xlsx', row: { 'No. Pesanan': 'ORDER-1', 'Nomor Referensi SKU': 'SKU-1', 'Nama Variasi': 'Hitam,XL', 'Harga Setelah Diskon': '83.000' } },
  ];
  const dbRows = [
    { id: 1, no_pesanan: 'ORDER-1', nomor_referensi_sku: 'SKU-1', nama_variasi: 'Hitam,XL', harga_setelah_diskon: '82.50' },
  ];
  const result = repair.matchSourceRowsToDbRows(sourceRows, dbRows);

  assert.equal(result.matches.length, 0);
  assert.equal(result.ambiguousLegacyIdentity.length, 2);
});

function awaitableRequire(modulePath) {
  // This is deliberately ordinary require: the migration module must be import-safe
  // so its CLI does not execute while tests inspect its explicit safety contract.
  // eslint-disable-next-line global-require, import/no-dynamic-require
  return require(modulePath);
}
