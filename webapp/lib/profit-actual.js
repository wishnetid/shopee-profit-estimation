const { buildSkuIndex, resolveItemHpp } = require('./profit-estimation.js');

function text(value) { const valueText = String(value ?? '').trim(); return valueText && valueText !== '-' ? valueText : null; }
function amount(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function outgoingReason(events) {
  const reasons = [...new Set(events.filter((row) => amount(row.jumlah_signed) < 0).map((row) => text(row.description) || text(row.type_transaksi) || 'Mutasi keluar'))];
  return reasons.length > 2 ? `${reasons.slice(0, 2).join(' · ')} + ${reasons.length - 2} lainnya` : reasons.join(' · ');
}

function buildProfitActualReport({ orderRows, skuRows, settlementRows, settlementExistenceRows = settlementRows, exceptionOrderNumbers, exceptionEvidenceRows = [], balanceRows = [] }) {
  const skuIndex = buildSkuIndex(skuRows);
  const balanceByOrder = new Map();
  for (const row of balanceRows) {
    const key = text(row.no_pesanan); if (!key) continue;
    const current = balanceByOrder.get(key) || { net: 0, incomingOrderIncome: 0, incomingAdjustment: 0, outgoing: 0, orderIncomeOutgoing: 0, adjustmentOutgoing: 0, otherOutgoing: 0, events: [] };
    const signed = amount(row.jumlah_signed); const type = text(row.type_transaksi); current.net += signed;
    if (signed > 0 && type === 'Penghasilan dari Pesanan') current.incomingOrderIncome += signed;
    if (signed > 0 && type === 'Penyesuaian') current.incomingAdjustment += signed;
    if (signed < 0) { current.outgoing += signed; if (type === 'Penghasilan dari Pesanan') current.orderIncomeOutgoing += signed; else if (type === 'Penyesuaian') current.adjustmentOutgoing += signed; else current.otherOutgoing += signed; }
    current.events.push(row); balanceByOrder.set(key, current);
  }
  const settlementByOrder = new Map(settlementRows.map((row) => [text(row.no_pesanan), row]));
  const settlementExistsByOrder = new Map(settlementExistenceRows.map((row) => [text(row.no_pesanan), row]));
  const exceptions = new Set(exceptionOrderNumbers.map((value) => text(value)?.toLowerCase()).filter(Boolean));
  const exceptionEvidenceByOrder = new Map();
  for (const row of exceptionEvidenceRows) {
    const key = text(row.no_pesanan); if (!key) continue;
    const current = exceptionEvidenceByOrder.get(key) || []; current.push(row); exceptionEvidenceByOrder.set(key, current);
  }
  const groups = new Map();
  for (const row of orderRows) {
    const key = text(row.no_pesanan); if (!key) continue;
    const group = groups.get(key) || { no_pesanan: key, rows: [] }; group.rows.push(row); groups.set(key, group);
  }
  const summary = { cohortOrders: 0, cohortPcs: 0, settledNormal: 0, settledNormalPcs: 0, settledNormalLoss: 0, completedUnsettled: 0, completedUnsettledPcs: 0, settlementOutsideReleaseRange: 0, settlementOutsideReleaseRangePcs: 0, pending: 0, pendingPcs: 0, exception: 0, exceptionPcs: 0, fullReturnCashFinalNegative: 0, fullReturnCashFinalNegativePcs: 0, fullReturnCashFinalNegativeOutcome: 0, fullReturnCashFinalPositive: 0, fullReturnCashFinalPositivePcs: 0, fullReturnCashFinalPositiveOutcome: 0, partialReturnProvisional: 0, partialReturnOrderedPcs: 0, partialReturnNonReturnedPcs: 0, partialReturnReturnedPcs: 0, partialReturnSettlement: 0, partialReturnHpp: 0, partialReturnProfit: 0, cancelled: 0, cancelledPcs: 0, settlement: 0, settlementExcluded: 0, hpp: 0, profit: 0, settlementRecorded: 0, cashCoveredOrders: 0, cashCoveredPcs: 0, hppApplied: 0, profitComputable: 0, unresolvedOrders: 0, unresolvedPcs: 0, balanceOutgoingOrders: 0, balanceOutgoingTotal: 0, balanceOrderIncomeOutgoing: 0, balanceAdjustmentOutgoing: 0, balanceOtherOutgoing: 0 };
  const orders = [...groups.values()].map((group) => {
    const first = group.rows[0]; const settlementRow = settlementByOrder.get(group.no_pesanan); const settlementExistsRow = settlementExistsByOrder.get(group.no_pesanan); const isException = exceptions.has(group.no_pesanan.toLowerCase());
    summary.cohortOrders++;
    summary.cohortPcs += group.rows.reduce((total, row) => total + Math.max(0, amount(row.jumlah)), 0);
    let totalHpp = 0; let nonReturnedHpp = 0; let hppIssue = false; let nonReturnedHppIssue = false;
    for (const row of group.rows) {
      const mapped = resolveItemHpp(row, skuIndex); const quantity = amount(row.jumlah); const returnedQuantity = Math.min(Math.max(0, amount(row.returned_quantity)), Math.max(0, quantity)); const nonReturnedQuantity = quantity - returnedQuantity;
      if (mapped.kind !== 'resolved' || !Number.isInteger(quantity) || quantity <= 0) { hppIssue = true; if (nonReturnedQuantity > 0) nonReturnedHppIssue = true; }
      else { totalHpp += mapped.price * quantity; nonReturnedHpp += mapped.price * nonReturnedQuantity; }
    }
    const orderedPcs = group.rows.reduce((total, row) => total + Math.max(0, amount(row.jumlah)), 0);
    const returnedPcs = group.rows.reduce((total, row) => total + Math.max(0, amount(row.returned_quantity)), 0);
    const hasPartialReturnedItems = returnedPcs > 0 && returnedPcs < orderedPcs;
    const balance = balanceByOrder.get(group.no_pesanan) || { net: 0, incomingOrderIncome: 0, incomingAdjustment: 0, outgoing: 0, orderIncomeOutgoing: 0, adjustmentOutgoing: 0, otherOutgoing: 0, events: [] };
    const settlement = settlementRow ? amount(settlementRow.signed_total) : null;
    const exceptionEvidence = exceptionEvidenceByOrder.get(group.no_pesanan) || [];
    const onlyCompletedFullReturns = exceptionEvidence.length > 0 && exceptionEvidence.every((row) => text(row.source_type) === 'return_refund'
      && text(row.source_status) === 'Dana Dikembalikan ke Pembeli'
      && text(row.return_type) === 'Seluruh Pesanan'
      && text(row.stock_status) === 'Pengiriman pengembalian barang selesai');
    const fullReturnCashFinalNegative = isException && settlement !== null && settlement < 0
      && balance.orderIncomeOutgoing === settlement
      && balance.incomingOrderIncome === 0
      && balance.outgoing === settlement
      && balance.net === settlement
      && onlyCompletedFullReturns;
    const returnCancelledCashMatched = isException
      && settlement !== null && settlement > 0
      && returnedPcs === 0 && !hppIssue
      && balance.incomingOrderIncome === settlement && balance.outgoing === 0 && balance.net === settlement
      && exceptionEvidence.length > 0
      && exceptionEvidence.every((row) => text(row.source_type) === 'return_refund' && text(row.source_status) === 'Pengembalian Barang/Dana Dibatalkan');
    const hasRejectedReturnAppeal = exceptionEvidence.some((row) => text(row.source_type) === 'return_refund'
      && text(row.source_status) === 'Banding Ditolak'
      && text(row.stock_status) === 'Pengiriman pengembalian barang gagal');
    const returnEvidenceOnly = exceptionEvidence.filter((row) => text(row.source_type) === 'return_refund');
    const recognisedReturnStatuses = returnEvidenceOnly.length > 0 && returnEvidenceOnly.every((row) => ['Pengembalian Barang/Dana Dibatalkan', 'Banding Ditolak'].includes(text(row.source_status)));
    const adjustmentEvidence = exceptionEvidence.filter((row) => text(row.source_type) === 'adjustment');
    const fullReturnCashFinalPositive = isException && settlement !== null && settlement < 0
      && orderedPcs > 0 && returnedPcs === orderedPcs
      && balance.orderIncomeOutgoing === settlement && balance.incomingOrderIncome === 0
      && balance.outgoing === settlement && balance.incomingAdjustment > 0
      && balance.net === settlement + balance.incomingAdjustment && balance.net > 0
      && hasRejectedReturnAppeal && recognisedReturnStatuses
      && adjustmentEvidence.length > 0 && adjustmentEvidence.every((row) => amount(row.amount) > 0)
      && adjustmentEvidence.reduce((total, row) => total + amount(row.amount), 0) === balance.incomingAdjustment
      && exceptionEvidence.every((row) => ['return_refund', 'adjustment'].includes(text(row.source_type)));
    let bucket = 'settled_normal';
    if (!settlementRow) bucket = text(first.status_pesanan) === 'Batal' ? 'batal' : settlementExistsRow ? 'settlement_outside_release_range' : first.waktu_pesanan_selesai ? 'completed_unsettled' : 'pending';
    else if (fullReturnCashFinalNegative) bucket = 'full_return_cash_final_negative';
    else if (fullReturnCashFinalPositive) bucket = 'full_return_cash_final_positive';
    else if (returnCancelledCashMatched) bucket = 'settled_normal';
    else if (isException && returnedPcs > 0 && exceptionEvidence.length > 0 && exceptionEvidence.every((row) => text(row.source_type) === 'return_refund' && text(row.source_status) === 'Pengembalian Barang/Dana Dibatalkan')) bucket = 'exception';
    else if (isException && hasPartialReturnedItems && !nonReturnedHppIssue && balance.incomingOrderIncome === amount(settlementRow.signed_total) && balance.outgoing === 0) bucket = 'partial_return_provisional';
    else if (isException) bucket = 'exception'; else if (hppIssue) bucket = 'hpp_issue';
    const exceptionSubstatus = returnCancelledCashMatched ? 'return_cancelled_cash_matched' : null;
    const profitActual = bucket === 'settled_normal' && settlement !== null ? settlement - totalHpp : null;
    const provisionalProfit = bucket === 'partial_return_provisional' && settlement !== null ? settlement - nonReturnedHpp : null;
    if (balance.outgoing < 0) { summary.balanceOutgoingOrders++; summary.balanceOutgoingTotal += balance.outgoing; summary.balanceOrderIncomeOutgoing += balance.orderIncomeOutgoing; summary.balanceAdjustmentOutgoing += balance.adjustmentOutgoing; summary.balanceOtherOutgoing += balance.otherOutgoing; }
    if (bucket === 'settled_normal') { summary.settledNormal++; summary.settledNormalPcs += orderedPcs; if (profitActual < 0) summary.settledNormalLoss++; summary.settlement += settlement; summary.hpp += totalHpp; summary.profit += profitActual; }
    else if (bucket === 'partial_return_provisional') { summary.partialReturnProvisional++; summary.partialReturnOrderedPcs += orderedPcs; summary.partialReturnNonReturnedPcs += orderedPcs - returnedPcs; summary.partialReturnReturnedPcs += returnedPcs; summary.partialReturnSettlement += settlement || 0; summary.partialReturnHpp += nonReturnedHpp; summary.partialReturnProfit += provisionalProfit || 0; }
    else if (bucket === 'full_return_cash_final_negative') { summary.fullReturnCashFinalNegative++; summary.fullReturnCashFinalNegativePcs += orderedPcs; summary.fullReturnCashFinalNegativeOutcome += settlement || 0; }
    else if (bucket === 'full_return_cash_final_positive') { summary.fullReturnCashFinalPositive++; summary.fullReturnCashFinalPositivePcs += orderedPcs; summary.fullReturnCashFinalPositiveOutcome += balance.net; }
    else if (bucket === 'completed_unsettled') { summary.completedUnsettled++; summary.completedUnsettledPcs += orderedPcs; } else if (bucket === 'settlement_outside_release_range') { summary.settlementOutsideReleaseRange++; summary.settlementOutsideReleaseRangePcs += orderedPcs; } else if (bucket === 'pending') { summary.pending++; summary.pendingPcs += orderedPcs; } else if (bucket === 'exception' || bucket === 'hpp_issue') { summary.exception++; summary.exceptionPcs += orderedPcs; summary.settlementExcluded += settlement || 0; } else { summary.cancelled++; summary.cancelledPcs += orderedPcs; }
    return { no_pesanan: group.no_pesanan, orderDate: String(first.waktu_pesanan_dibuat).slice(0, 10), statusPesanan: text(first.status_pesanan), itemCount: group.rows.length, orderedPcs, returnedPcs, nonReturnedPcs: orderedPcs - returnedPcs, totalHpp, nonReturnedHpp, settlement, releaseDate: settlementRow?.tanggal_dana_dilepaskan || null, balanceOutgoing: balance.outgoing, balanceOrderIncomeOutgoing: balance.orderIncomeOutgoing, balanceAdjustmentOutgoing: balance.adjustmentOutgoing, balanceOtherOutgoing: balance.otherOutgoing, balanceOutgoingReason: outgoingReason(balance.events), balanceNet: balance.net, balanceIncomingAdjustment: balance.incomingAdjustment, exceptionSubstatus, exceptionSubstatusEvidence: { settlementPositive: settlement !== null && settlement > 0, balanceIncomeMatches: settlement !== null && balance.incomingOrderIncome === settlement, noBalanceOutgoing: balance.outgoing === 0, evidenceCount: exceptionEvidence.length, evidence: exceptionEvidence.map((row) => ({ sourceType: text(row.source_type), sourceStatus: text(row.source_status) })), onlyCancelledReturns: exceptionEvidence.length > 0 && exceptionEvidence.every((row) => text(row.source_type) === 'return_refund' && text(row.source_status) === 'Pengembalian Barang/Dana Dibatalkan') }, profitActual, provisionalProfit, bucket };
  }).sort((a, b) => b.orderDate.localeCompare(a.orderDate) || b.no_pesanan.localeCompare(a.no_pesanan));
  const computable = orders.filter((order) => order.bucket === 'settled_normal' || order.bucket === 'partial_return_provisional');
  summary.cashCoveredOrders = computable.length;
  summary.cashCoveredPcs = computable.reduce((total, order) => total + (order.bucket === 'partial_return_provisional' ? order.nonReturnedPcs : order.orderedPcs), 0);
  summary.unresolvedPcs = orders.filter((order) => !['settled_normal', 'partial_return_provisional', 'full_return_cash_final_negative', 'full_return_cash_final_positive', 'batal'].includes(order.bucket)).reduce((total, order) => total + order.orderedPcs, 0);
  summary.settlementRecorded = computable.reduce((total, order) => total + (order.settlement || 0), 0);
  summary.hppApplied = computable.reduce((total, order) => total + (order.bucket === 'partial_return_provisional' ? order.nonReturnedHpp : order.totalHpp), 0);
  summary.profitComputable = computable.reduce((total, order) => total + (order.bucket === 'partial_return_provisional' ? (order.provisionalProfit || 0) : (order.profitActual || 0)), 0);
  summary.unresolvedOrders = orders.filter((order) => !['settled_normal', 'partial_return_provisional', 'full_return_cash_final_negative', 'full_return_cash_final_positive', 'batal'].includes(order.bucket)).length;
  return { summary, orders };
}
module.exports = { buildProfitActualReport };
