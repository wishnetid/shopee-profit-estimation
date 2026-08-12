import test from 'node:test';
import assert from 'node:assert/strict';

import profitEstimation from '../lib/profit-estimation.js';

const {
  ESTIMATION_STATUS,
  aggregateAdsSpend,
  buildEstimationReport,
  validateDateRange,
} = profitEstimation;

function orderRow(overrides = {}) {
  return {
    no_pesanan: 'ORDER-1',
    status_pesanan: 'Perlu Dikirim',
    alasan_pembatalan: null,
    status_pembatalan_pengembalian: null,
    total_pembayaran: '200000.00',
    waktu_pesanan_dibuat: '2026-08-10 09:00:00',
    nomor_referensi_sku: 'SKU-PRIMARY',
    sku_induk: null,
    nama_produk: 'Produk Contoh',
    nama_variasi: 'Hitam,M',
    jumlah: 1,
    ...overrides,
  };
}

function skuRow(overrides = {}) {
  return {
    sku1: 'SKU-PRIMARY',
    sku2: null,
    harga: '40000.00',
    ...overrides,
  };
}

test('buildEstimationReport counts an order-level payment once and multiplies each item HPP by quantity', () => {
  const report = buildEstimationReport({
    orderRows: [
      orderRow({ nomor_referensi_sku: 'SKU-JAKET', jumlah: 2 }),
      orderRow({ nomor_referensi_sku: 'UNKNOWN', sku_induk: 'SKU-CELANA-ALIAS', nama_variasi: 'Hitam,L', jumlah: 1 }),
    ],
    skuRows: [
      skuRow({ sku1: 'SKU-JAKET', harga: '40000.00' }),
      skuRow({ sku1: 'SKU-CELANA', sku2: 'SKU-CELANA-ALIAS', harga: '20000.00' }),
    ],
    adsRows: [
      { transaction_date: '2026-08-10', sequence_number: 1, description: 'Deduction for Product Ad (Auto Bidding - GMV Max)', jumlah_signed: '-10000.00', note: '' },
      { transaction_date: '2026-08-10', sequence_number: 2, description: 'Isi Saldo', jumlah_signed: '50000.00', note: '' },
      { transaction_date: '2026-08-10', sequence_number: 3, description: 'ROAS Protection Free Ads Credit Rebate', jumlah_signed: '500.00', note: '' },
      { transaction_date: '2026-08-10', sequence_number: 4, description: 'Deduction for Product Ad (Auto Bidding - GMV Max)', jumlah_signed: '99.00', note: '' },
    ],
    dateFrom: '2026-08-10',
    dateTo: '2026-08-10',
    page: 1,
    limit: 50,
  });

  assert.equal(report.orders.total, 1);
  assert.equal(report.orders.data[0].estimationStatus, ESTIMATION_STATUS.ESTIMABLE);
  assert.equal(report.orders.data[0].totalPembayaran, 200000);
  assert.equal(report.orders.data[0].totalHpp, 100000);
  assert.equal(report.orders.data[0].estimasiKotor, 100000);
  assert.deepEqual(report.summary, {
    totalOrderCount: 1,
    eligibleOrderCount: 1,
    estimatedOrderCount: 1,
    hppIncompleteOrderCount: 0,
    reviewOrderCount: 0,
    excludedOrderCount: 0,
    estimatedGrossBeforeFeeAds: 100000,
    adsSpend: 10000,
    afterAds: 90000,
    adsDuplicateEventCount: 0,
  });
  assert.deepEqual(report.daily, [{
    date: '2026-08-10',
    estimatedOrderCount: 1,
    hppIncompleteOrderCount: 0,
    reviewOrderCount: 0,
    estimatedGrossBeforeFeeAds: 100000,
    adsSpend: 10000,
    afterAds: 90000,
  }]);
});

test('buildEstimationReport excludes Order.all and independent exception-source cancellation or return markers and never treats absent HPP as zero', () => {
  const report = buildEstimationReport({
    orderRows: [
      orderRow({ no_pesanan: 'ORDER-CANCEL', alasan_pembatalan: 'Dibatalkan oleh pembeli' }),
      orderRow({ no_pesanan: 'ORDER-RETURN', status_pembatalan_pengembalian: 'Dana Dikembalikan ke Pembeli' }),
      orderRow({ no_pesanan: 'ORDER-RAW-EXCEPTION' }),
      orderRow({ no_pesanan: 'ORDER-RETURNED-QUANTITY', returned_quantity: 1 }),
      orderRow({ no_pesanan: 'ORDER-NO-HPP', nomor_referensi_sku: 'SKU-TIDAK-ADA' }),
    ],
    exceptionOrderNumbers: ['ORDER-RAW-EXCEPTION'],
    skuRows: [skuRow()],
    adsRows: [],
    dateFrom: '2026-08-10',
    dateTo: '2026-08-10',
    page: 1,
    limit: 50,
  });

  const byOrder = Object.fromEntries(report.orders.data.map((row) => [row.no_pesanan, row]));
  assert.equal(byOrder['ORDER-CANCEL'].estimationStatus, ESTIMATION_STATUS.NOT_ELIGIBLE);
  assert.equal(byOrder['ORDER-RETURN'].estimationStatus, ESTIMATION_STATUS.NOT_ELIGIBLE);
  assert.equal(byOrder['ORDER-RAW-EXCEPTION'].estimationStatus, ESTIMATION_STATUS.NOT_ELIGIBLE);
  assert.ok(byOrder['ORDER-RAW-EXCEPTION'].reasons.includes('CANCELLATION_ATAU_RETURN_RAW'));
  assert.equal(byOrder['ORDER-RETURNED-QUANTITY'].estimationStatus, ESTIMATION_STATUS.NOT_ELIGIBLE);
  assert.ok(byOrder['ORDER-RETURNED-QUANTITY'].reasons.includes('RETURNED_QUANTITY_POSITIF'));
  assert.equal(byOrder['ORDER-NO-HPP'].estimationStatus, ESTIMATION_STATUS.HPP_INCOMPLETE);
  assert.equal(byOrder['ORDER-NO-HPP'].estimasiKotor, null);
  assert.equal(report.summary.estimatedGrossBeforeFeeAds, 0);
  assert.equal(report.summary.hppIncompleteOrderCount, 1);
  assert.equal(report.summary.excludedOrderCount, 4);
});

test('buildEstimationReport marks a missing item status as needs review instead of accepting other eligible item rows', () => {
  const report = buildEstimationReport({
    orderRows: [
      orderRow({ no_pesanan: 'ORDER-STATUS-MISSING', nomor_referensi_sku: 'SKU-PRIMARY', status_pesanan: 'Perlu Dikirim' }),
      orderRow({ no_pesanan: 'ORDER-STATUS-MISSING', nomor_referensi_sku: 'SKU-PRIMARY', nama_variasi: 'Hijau,L', status_pesanan: null }),
    ],
    skuRows: [skuRow()],
    adsRows: [],
    page: 1,
    limit: 50,
  });

  assert.equal(report.orders.data[0].estimationStatus, ESTIMATION_STATUS.NEEDS_REVIEW);
  assert.ok(report.orders.data[0].reasons.includes('STATUS_PESANAN_TIDAK_VALID'));
  assert.equal(report.summary.estimatedOrderCount, 0);
});

test('buildEstimationReport marks a partially missing order date or payment as needs review instead of using the remaining item value', () => {
  const report = buildEstimationReport({
    orderRows: [
      orderRow({ no_pesanan: 'ORDER-DATE-PARTIAL', nomor_referensi_sku: 'SKU-PRIMARY', waktu_pesanan_dibuat: '2026-08-10 09:00:00' }),
      orderRow({ no_pesanan: 'ORDER-DATE-PARTIAL', nomor_referensi_sku: 'SKU-PRIMARY', nama_variasi: 'Hijau,L', waktu_pesanan_dibuat: null }),
      orderRow({ no_pesanan: 'ORDER-PAYMENT-PARTIAL', nomor_referensi_sku: 'SKU-PRIMARY', total_pembayaran: '200000.00' }),
      orderRow({ no_pesanan: 'ORDER-PAYMENT-PARTIAL', nomor_referensi_sku: 'SKU-PRIMARY', nama_variasi: 'Hijau,L', total_pembayaran: null }),
    ],
    skuRows: [skuRow()],
    adsRows: [],
    page: 1,
    limit: 50,
  });

  const byOrder = Object.fromEntries(report.orders.data.map((row) => [row.no_pesanan, row]));
  assert.equal(byOrder['ORDER-DATE-PARTIAL'].estimationStatus, ESTIMATION_STATUS.NEEDS_REVIEW);
  assert.equal(byOrder['ORDER-DATE-PARTIAL'].orderDate, null);
  assert.ok(byOrder['ORDER-DATE-PARTIAL'].reasons.includes('TANGGAL_PESANAN_TIDAK_VALID'));
  assert.equal(byOrder['ORDER-PAYMENT-PARTIAL'].estimationStatus, ESTIMATION_STATUS.NEEDS_REVIEW);
  assert.equal(byOrder['ORDER-PAYMENT-PARTIAL'].totalPembayaran, null);
  assert.ok(byOrder['ORDER-PAYMENT-PARTIAL'].reasons.includes('TOTAL_PEMBAYARAN_TIDAK_VALID'));
  assert.equal(report.summary.estimatedOrderCount, 0);
});

test('buildEstimationReport marks conflicting HPP aliases and inconsistent order-level values as needs review', () => {
  const report = buildEstimationReport({
    orderRows: [
      orderRow({ no_pesanan: 'ORDER-HPP-CONFLICT', nomor_referensi_sku: 'SKU-CONFLICT' }),
      orderRow({ no_pesanan: 'ORDER-TOTAL-CONFLICT', nomor_referensi_sku: 'SKU-PRIMARY', total_pembayaran: '100000.00' }),
      orderRow({ no_pesanan: 'ORDER-TOTAL-CONFLICT', nomor_referensi_sku: 'SKU-PRIMARY', nama_variasi: 'Hijau,L', total_pembayaran: '110000.00' }),
      orderRow({ no_pesanan: 'ORDER-DATE-CONFLICT', nomor_referensi_sku: 'SKU-PRIMARY', waktu_pesanan_dibuat: '2026-08-10 09:00:00' }),
      orderRow({ no_pesanan: 'ORDER-DATE-CONFLICT', nomor_referensi_sku: 'SKU-PRIMARY', nama_variasi: 'Abu,L', waktu_pesanan_dibuat: '2026-08-11 09:00:00' }),
    ],
    skuRows: [
      skuRow({ sku1: 'SKU-CONFLICT', harga: '40000.00' }),
      skuRow({ sku1: 'SKU-CONFLICT', harga: '45000.00' }),
      skuRow({ sku1: 'SKU-PRIMARY', harga: '40000.00' }),
    ],
    adsRows: [],
    page: 1,
    limit: 50,
  });

  const byOrder = Object.fromEntries(report.orders.data.map((row) => [row.no_pesanan, row]));
  assert.equal(byOrder['ORDER-HPP-CONFLICT'].estimationStatus, ESTIMATION_STATUS.NEEDS_REVIEW);
  assert.ok(byOrder['ORDER-HPP-CONFLICT'].reasons.includes('HPP_CONFLICT'));
  assert.equal(byOrder['ORDER-TOTAL-CONFLICT'].estimationStatus, ESTIMATION_STATUS.NEEDS_REVIEW);
  assert.ok(byOrder['ORDER-TOTAL-CONFLICT'].reasons.includes('TOTAL_PEMBAYARAN_TIDAK_KONSISTEN'));
  assert.equal(byOrder['ORDER-DATE-CONFLICT'].estimationStatus, ESTIMATION_STATUS.NEEDS_REVIEW);
  assert.ok(byOrder['ORDER-DATE-CONFLICT'].reasons.includes('TANGGAL_PESANAN_TIDAK_KONSISTEN'));
  assert.equal(report.summary.reviewOrderCount, 3);
  assert.equal(report.summary.estimatedOrderCount, 0);
});

test('buildEstimationReport treats different HPP values for the same alias across SKU1 and SKU2 as a conflict', () => {
  const report = buildEstimationReport({
    orderRows: [orderRow({ no_pesanan: 'ORDER-CROSS-COLUMN-HPP', nomor_referensi_sku: 'SKU-CROSS-COLUMN' })],
    skuRows: [
      skuRow({ sku1: 'SKU-CROSS-COLUMN', sku2: null, harga: '40000.00' }),
      skuRow({ sku1: null, sku2: 'SKU-CROSS-COLUMN', harga: '45000.00' }),
    ],
    adsRows: [],
    page: 1,
    limit: 50,
  });

  assert.equal(report.orders.data[0].estimationStatus, ESTIMATION_STATUS.NEEDS_REVIEW);
  assert.ok(report.orders.data[0].reasons.includes('HPP_CONFLICT'));
  assert.equal(report.summary.estimatedGrossBeforeFeeAds, 0);
});

test('aggregateAdsSpend only counts negative Product Ad deductions and deduplicates exact sequenced events across packages only', () => {
  const result = aggregateAdsSpend([
    { ads_report_import_id: 1, transaction_date: '2026-08-10', sequence_number: 17, description: 'Deduction for Product Ad (Auto Bidding - GMV Max)', jumlah_signed: '-12500.00', note: 'Campaign A' },
    { ads_report_import_id: 2, transaction_date: '2026-08-10', sequence_number: 17, description: 'Deduction for Product Ad (Auto Bidding - GMV Max)', jumlah_signed: '-12500.00', note: 'Campaign A' },
    { ads_report_import_id: 1, transaction_date: '2026-08-10', sequence_number: null, description: 'Deduction for Product Ad (Auto Bidding - GMV Max)', jumlah_signed: '-3000.00', note: 'Tanpa nomor event' },
    { ads_report_import_id: 2, transaction_date: '2026-08-10', sequence_number: null, description: 'Deduction for Product Ad (Auto Bidding - GMV Max)', jumlah_signed: '-3000.00', note: 'Tanpa nomor event' },
    { ads_report_import_id: 1, transaction_date: '2026-08-10', sequence_number: 22, description: 'Deduction for Product Ad (Auto Bidding - GMV Max)', jumlah_signed: '-1000.00', note: 'Dua source rows sah' },
    { ads_report_import_id: 1, transaction_date: '2026-08-10', sequence_number: 22, description: 'Deduction for Product Ad (Auto Bidding - GMV Max)', jumlah_signed: '-1000.00', note: 'Dua source rows sah' },
    { ads_report_import_id: 1, transaction_date: '2026-08-10', sequence_number: 19, description: 'Isi Saldo', jumlah_signed: '100000.00', note: '' },
  ]);

  assert.equal(result.total, 20500);
  assert.equal(result.duplicateEventCount, 1);
  assert.equal(result.byDate.get('2026-08-10'), 20500);
});

test('validateDateRange rejects impossible and reverse calendar ranges before querying', () => {
  assert.deepEqual(validateDateRange(null, null), { dateFrom: null, dateTo: null });
  assert.deepEqual(validateDateRange('2026-08-01', '2026-08-10'), { dateFrom: '2026-08-01', dateTo: '2026-08-10' });
  assert.throws(() => validateDateRange('2026-02-30', null), /dateFrom/);
  assert.throws(() => validateDateRange('2026-08-11', '2026-08-10'), /dateFrom/);
});

test('buildEstimationReport paginates per-order output without changing totals or daily aggregates', () => {
  const report = buildEstimationReport({
    orderRows: [
      orderRow({ no_pesanan: 'ORDER-1', waktu_pesanan_dibuat: '2026-08-10 08:00:00' }),
      orderRow({ no_pesanan: 'ORDER-2', waktu_pesanan_dibuat: '2026-08-11 08:00:00' }),
      orderRow({ no_pesanan: 'ORDER-3', waktu_pesanan_dibuat: '2026-08-12 08:00:00' }),
    ],
    skuRows: [skuRow()],
    adsRows: [],
    page: 2,
    limit: 2,
  });

  assert.equal(report.orders.total, 3);
  assert.equal(report.orders.data.length, 1);
  assert.equal(report.orders.data[0].no_pesanan, 'ORDER-1');
  assert.equal(report.summary.estimatedOrderCount, 3);
  assert.equal(report.daily.length, 3);
});
