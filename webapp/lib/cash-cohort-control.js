function text(value) {
  const result = String(value ?? '').trim();
  return result && result !== '-' ? result : null;
}

function amount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function positiveAmount(value) {
  return Math.abs(amount(value));
}

function addBreakdown(map, type, value) {
  const key = text(type) || 'Mutasi tanpa tipe';
  const current = map.get(key) || { type: key, rows: 0, amount: 0 };
  current.rows += 1;
  current.amount += positiveAmount(value);
  map.set(key, current);
}

/**
 * Builds the approved store-scoped monthly cash control from a completed
 * canonical My Balance month plus the runtime Profit Aktual summary.
 *
 * `grossAdsTopup` is intentionally the gross negative My Balance top-up.
 * It already includes PPN and is never combined with Used Ads deductions.
 */
function buildCashCohortControl({ actualSummary, balanceRows = [], monthStart }) {
  const financialFinalOutcome = amount(actualSummary?.financialFinalOutcome);
  const pendingEstimatedProfit = actualSummary?.pendingEstimatedProfitComplete
    ? amount(actualSummary.pendingEstimatedProfit)
    : null;

  let grossAdsTopup = 0;
  let grossAdsTopupRows = 0;
  let oldCohortOutflow = 0;
  let oldCohortOutflowRows = 0;
  let unmappedLinkedOutflow = 0;
  let unmappedLinkedOutflowRows = 0;
  const oldCohortOutflowByType = new Map();
  const unmappedLinkedOutflowByType = new Map();

  for (const row of balanceRows) {
    const signed = amount(row.jumlah_signed);
    const type = text(row.type_transaksi);
    const noPesanan = text(row.no_pesanan);
    const createdDate = text(row.order_created_date)?.slice(0, 10) || null;

    if (type === 'Pembayaran dengan Saldo Penjual' && signed < 0) {
      grossAdsTopup += Math.abs(signed);
      grossAdsTopupRows += 1;
      continue;
    }

    if (signed >= 0 || !noPesanan || type === 'Penarikan Dana') continue;

    if (!createdDate) {
      unmappedLinkedOutflow += Math.abs(signed);
      unmappedLinkedOutflowRows += 1;
      addBreakdown(unmappedLinkedOutflowByType, type, signed);
      continue;
    }

    if (createdDate < monthStart) {
      oldCohortOutflow += Math.abs(signed);
      oldCohortOutflowRows += 1;
      addBreakdown(oldCohortOutflowByType, type, signed);
    }
  }

  const cashReady = financialFinalOutcome - grossAdsTopup - oldCohortOutflow;
  const runningPotential = pendingEstimatedProfit === null ? null : cashReady + pendingEstimatedProfit;
  const finalityReasons = [];
  if (Number(actualSummary?.pending || 0) > 0) finalityReasons.push('Masih ada pesanan belum selesai.');
  if (Number(actualSummary?.completedUnsettled || 0) > 0) finalityReasons.push('Masih ada pesanan selesai yang belum memiliki settlement.');
  if (Number(actualSummary?.unresolvedOrders || 0) > 0) finalityReasons.push('Masih ada order yang belum aman diklasifikasikan secara finansial.');
  if (unmappedLinkedOutflowRows > 0) finalityReasons.push('Ada mutasi keluar order-linked yang belum dapat dipetakan ke tanggal order dibuat.');
  if (pendingEstimatedProfit === null) finalityReasons.push('Estimasi profit pending belum lengkap karena basis nilai atau HPP belum valid.');

  return {
    financialFinalOutcome,
    grossAdsTopup,
    grossAdsTopupRows,
    oldCohortOutflow,
    oldCohortOutflowRows,
    oldCohortOutflowByType: [...oldCohortOutflowByType.values()].sort((a, b) => b.amount - a.amount || a.type.localeCompare(b.type)),
    unmappedLinkedOutflow,
    unmappedLinkedOutflowRows,
    unmappedLinkedOutflowByType: [...unmappedLinkedOutflowByType.values()].sort((a, b) => b.amount - a.amount || a.type.localeCompare(b.type)),
    cashReady,
    pendingEstimatedProfit,
    runningPotential,
    status: finalityReasons.length ? 'running' : 'calculated',
    finalityReasons,
  };
}

module.exports = { buildCashCohortControl };
module.exports.default = module.exports;
