import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import cashCohortControl from '../lib/cash-cohort-control.js';

const { buildCashCohortControl } = cashCohortControl;

function actualSummary(overrides = {}) {
  return {
    financialFinalOutcome: 500000,
    pendingEstimatedProfit: 70000,
    pendingEstimatedProfitComplete: true,
    pending: 1,
    completedUnsettled: 0,
    unresolvedOrders: 0,
    ...overrides,
  };
}

test('cash cohort control subtracts gross My Balance top-up exactly once and never adds PPN again', () => {
  const result = buildCashCohortControl({
    monthStart: '2026-09-01',
    actualSummary: actualSummary(),
    balanceRows: [
      { type_transaksi: 'Pembayaran dengan Saldo Penjual', jumlah_signed: -111000, no_pesanan: null, order_created_date: null },
      { type_transaksi: 'Pembayaran dengan Saldo Penjual', jumlah_signed: -222000, no_pesanan: null, order_created_date: null },
      { type_transaksi: 'Penarikan Dana', jumlah_signed: -999999, no_pesanan: null, order_created_date: null },
    ],
  });

  assert.equal(result.financialFinalOutcome, 500000);
  assert.equal(result.grossAdsTopup, 333000);
  assert.equal(result.grossAdsTopupRows, 2);
  assert.equal(result.oldCohortOutflow, 0);
  assert.equal(result.cashReady, 167000);
  assert.equal(result.pendingEstimatedProfit, 70000);
  assert.equal(result.runningPotential, 237000);
  assert.match(result.finalityReasons.join(' '), /belum selesai/i);
});

test('cash cohort control subtracts only current-month order-linked negative events for orders created before cohort', () => {
  const result = buildCashCohortControl({
    monthStart: '2026-09-01',
    actualSummary: actualSummary({ pending: 0 }),
    balanceRows: [
      { type_transaksi: 'Pembayaran dengan Saldo Penjual', jumlah_signed: -111000, no_pesanan: null, order_created_date: null },
      { type_transaksi: 'Penghasilan dari Pesanan', jumlah_signed: -1500, no_pesanan: 'OLD-ORDER', order_created_date: '2026-08-31' },
      { type_transaksi: 'Penyesuaian', jumlah_signed: -250, no_pesanan: 'OLD-ORDER', order_created_date: '2026-08-31' },
      { type_transaksi: 'Penghasilan dari Pesanan', jumlah_signed: -900, no_pesanan: 'CURRENT-ORDER', order_created_date: '2026-09-01' },
      { type_transaksi: 'Penarikan Dana', jumlah_signed: -999999, no_pesanan: 'OLD-WITHDRAWAL', order_created_date: '2026-08-20' },
    ],
  });

  assert.equal(result.grossAdsTopup, 111000);
  assert.equal(result.oldCohortOutflow, 1750);
  assert.equal(result.oldCohortOutflowRows, 2);
  assert.deepEqual(result.oldCohortOutflowByType, [
    { type: 'Penghasilan dari Pesanan', rows: 1, amount: 1500 },
    { type: 'Penyesuaian', rows: 1, amount: 250 },
  ]);
  assert.equal(result.cashReady, 387250);
  assert.equal(result.runningPotential, 457250);
});

test('cash cohort control fails closed for linked negative events whose order-created date is unavailable', () => {
  const result = buildCashCohortControl({
    monthStart: '2026-09-01',
    actualSummary: actualSummary({ pending: 0, pendingEstimatedProfitComplete: false }),
    balanceRows: [
      { type_transaksi: 'Penyesuaian', jumlah_signed: -500, no_pesanan: 'UNMAPPED', order_created_date: null },
    ],
  });

  assert.equal(result.oldCohortOutflow, 0);
  assert.equal(result.unmappedLinkedOutflow, 500);
  assert.equal(result.cashReady, 500000);
  assert.equal(result.pendingEstimatedProfit, null);
  assert.equal(result.runningPotential, null);
  assert.match(result.finalityReasons.join(' '), /belum dapat dipetakan/i);
  assert.match(result.finalityReasons.join(' '), /belum lengkap/i);
});

test('cash cohort control route is read-only, store-scoped, and keeps the approved cash basis separate from Used Ads', () => {
  const route = fs.readFileSync(path.resolve(process.cwd(), 'app/api/cash-cohort-control/route.ts'), 'utf8');
  assert.match(route, /requireStoreId/);
  assert.match(route, /loadProfitActualData/);
  assert.match(route, /buildCashCohortControl/);
  const library = fs.readFileSync(path.resolve(process.cwd(), 'lib/cash-cohort-control.js'), 'utf8');
  assert.match(library, /Pembayaran dengan Saldo Penjual/);
  assert.match(route, /order_created_date/);
  assert.match(route, /b\.status='Transaksi Selesai'/);
  assert.match(route, /requiredSources = \['income', 'my_balance', 'cancellation', 'failed_delivery', 'return_refund'\]/);
  assert.match(route, /Used Ads is intentionally outside the cash-basis formula/);
  assert.doesNotMatch(route, /ads_report_imports/);
  assert.doesNotMatch(route, /INSERT INTO|UPDATE |DELETE FROM/);
  assert.doesNotMatch(route, /ads_transactions_raw/);
});
