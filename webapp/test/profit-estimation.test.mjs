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
    subtotal_pesanan: '200000.00',
    voucher_ditanggung_penjual: '0.00',
    waktu_pesanan_dibuat: '2026-08-10 09:00:00',
    nomor_referensi_sku: 'SKU-PRIMARY',
    sku_induk: null,
    nama_produk: 'Produk Contoh',
    nama_variasi: 'Hitam,M',
    jumlah: 1,
    returned_quantity: 0,
    ...overrides,
  };
}

function skuRow(overrides = {}) {
  return { sku1: 'SKU-PRIMARY', sku2: null, harga: '40000.00', ...overrides };
}

test('buildEstimationReport derives gross estimation from seller subtotal, seller voucher, standard Shopee fees, and item HPP without settlement', () => {
  const report = buildEstimationReport({
    orderRows: [
      orderRow({ no_pesanan: 'SELLER-ESTIMATE-1', subtotal_pesanan: '672000.00', voucher_ditanggung_penjual: '250.00', nomor_referensi_sku: 'SKU-SELLER-ESTIMATE', jumlah: 7 }),
      orderRow({ no_pesanan: 'SELLER-ESTIMATE-1', subtotal_pesanan: '1152000.00', voucher_ditanggung_penjual: '0.00', nomor_referensi_sku: 'SKU-SELLER-ESTIMATE', nama_variasi: 'Hitam,M', jumlah: 12 }),
      orderRow({ no_pesanan: 'SELLER-ESTIMATE-1', subtotal_pesanan: '192000.00', voucher_ditanggung_penjual: '0.00', nomor_referensi_sku: 'SKU-SELLER-ESTIMATE', nama_variasi: 'Hitam,XXL', jumlah: 2 }),
      orderRow({ no_pesanan: 'SELLER-ESTIMATE-1', subtotal_pesanan: '288000.00', voucher_ditanggung_penjual: '0.00', nomor_referensi_sku: 'SKU-SELLER-ESTIMATE', nama_variasi: 'Hitam,XL', jumlah: 3 }),
    ],
    skuRows: [skuRow({ sku1: 'SKU-SELLER-ESTIMATE', harga: '62500.00' })],
  });

  const order = report.orders.data[0];
  assert.equal(order.estimationStatus, ESTIMATION_STATUS.ESTIMABLE);
  assert.equal(order.sellerSubtotal, 2304000);
  assert.equal(order.sellerVoucher, 250);
  assert.deepEqual(order.standardFees, {
    administration: 190059,
    orderProcessing: 1250,
    freeShippingXtra: 115188,
    promoXtra: 103669,
    premium: 11519,
  });
  assert.equal(order.estimatedShopeeFees, 421685);
  assert.equal(order.estimatedSellerIncome, 1882065);
  assert.equal(order.totalHpp, 1500000);
  assert.equal(order.estimasiKotor, 382065);
  assert.equal(report.summary.estimatedGrossBeforeFeeAds, 382065);
});

test('buildEstimationReport counts every item subtotal once but never needs Income settlement or a historical cohort', () => {
  const report = buildEstimationReport({
    orderRows: [
      orderRow({ no_pesanan: 'MULTI-ITEM', subtotal_pesanan: '80000.00', jumlah: 2 }),
      orderRow({ no_pesanan: 'MULTI-ITEM', subtotal_pesanan: '20000.00', nama_variasi: 'Hijau,L', jumlah: 1 }),
    ],
    skuRows: [skuRow({ harga: '10000.00' })],
  });

  const order = report.orders.data[0];
  assert.equal(order.sellerSubtotal, 100000);
  assert.equal(order.totalHpp, 30000);
  assert.equal(order.estimatedSellerIncome, 80500);
  assert.equal(order.estimasiKotor, 50500);
  assert.equal(order.estimationStatus, ESTIMATION_STATUS.ESTIMABLE);
});

test('buildEstimationReport keeps HPP mapping and invalid seller basis fail-closed', () => {
  const report = buildEstimationReport({
    orderRows: [
      orderRow({ no_pesanan: 'MISSING-HPP', nomor_referensi_sku: 'UNKNOWN' }),
      orderRow({ no_pesanan: 'MISSING-SUBTOTAL', subtotal_pesanan: null }),
    ],
    skuRows: [skuRow()],
  });

  const byOrder = Object.fromEntries(report.orders.data.map((row) => [row.no_pesanan, row]));
  assert.equal(byOrder['MISSING-HPP'].estimationStatus, ESTIMATION_STATUS.HPP_INCOMPLETE);
  assert.equal(byOrder['MISSING-HPP'].estimasiKotor, null);
  assert.equal(byOrder['MISSING-SUBTOTAL'].estimationStatus, ESTIMATION_STATUS.NEEDS_REVIEW);
  assert.equal(byOrder['MISSING-SUBTOTAL'].estimasiKotor, null);
});

test('buildEstimationReport excludes cancellation, return, failed-delivery, and returned quantity from totals', () => {
  const report = buildEstimationReport({
    orderRows: [
      orderRow({ no_pesanan: 'CANCEL', alasan_pembatalan: 'Dibatalkan' }),
      orderRow({ no_pesanan: 'RETURN', returned_quantity: 1 }),
      orderRow({ no_pesanan: 'RAW-EXCEPTION' }),
    ],
    skuRows: [skuRow()],
    exceptionOrderNumbers: ['RAW-EXCEPTION'],
  });

  assert.equal(report.summary.estimatedOrderCount, 0);
  assert.equal(report.summary.excludedOrderCount, 3);
  assert.ok(report.orders.data.every((order) => order.estimationStatus === ESTIMATION_STATUS.NOT_ELIGIBLE));
});

test('buildEstimationReport keeps Ads and daily-rounded PPN as a separate daily aggregate', () => {
  const report = buildEstimationReport({
    orderRows: [orderRow({ no_pesanan: 'ADS-ORDER', subtotal_pesanan: '100000.00' })],
    skuRows: [skuRow({ harga: '10000.00' })],
    adsRows: [
      { ads_report_import_id: 1, transaction_date: '2026-08-10', sequence_number: 1, description: 'Deduction for Product Ad', jumlah_signed: '-10000.00', note: '' },
      { ads_report_import_id: 1, transaction_date: '2026-08-10', sequence_number: 2, description: 'Isi Saldo', jumlah_signed: '10000.00', note: '' },
    ],
  });

  assert.equal(report.summary.estimatedGrossBeforeFeeAds, 70500);
  assert.equal(report.summary.adsSpend, 10000);
  assert.equal(report.summary.estimatedAdsPpn, 1100);
  assert.equal(report.summary.afterAdsAndPpn, 59400);
  assert.equal(report.daily[0].afterAdsAndPpn, 59400);
});

test('aggregateAdsSpend only counts negative Product Ad deductions and deduplicates sequenced overlap across packages', () => {
  const result = aggregateAdsSpend([
    { ads_report_import_id: 1, transaction_date: '2026-08-10', sequence_number: 17, description: 'Deduction for Product Ad', jumlah_signed: '-12500.00', note: 'Campaign A' },
    { ads_report_import_id: 2, transaction_date: '2026-08-10', sequence_number: 17, description: 'Deduction for Product Ad', jumlah_signed: '-12500.00', note: 'Campaign A' },
    { ads_report_import_id: 1, transaction_date: '2026-08-10', sequence_number: 19, description: 'Isi Saldo', jumlah_signed: '100000.00', note: '' },
  ]);
  assert.equal(result.total, 12500);
  assert.equal(result.duplicateEventCount, 1);
});

test('validateDateRange rejects impossible and reverse calendar ranges before querying', () => {
  assert.deepEqual(validateDateRange(null, null), { dateFrom: null, dateTo: null });
  assert.throws(() => validateDateRange('2026-02-30', null), /dateFrom/);
  assert.throws(() => validateDateRange('2026-08-11', '2026-08-10'), /dateFrom/);
});
