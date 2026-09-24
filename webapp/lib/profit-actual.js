const { buildSkuIndex, resolveItemHpp } = require('./profit-estimation.js');

function text(value) { const valueText = String(value ?? '').trim(); return valueText && valueText !== '-' ? valueText : null; }
function amount(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }

function buildProfitActualReport({ orderRows, skuRows, settlementRows, settlementExistenceRows = settlementRows, exceptionOrderNumbers, balanceRows = [] }) {
  const skuIndex = buildSkuIndex(skuRows);
  const balanceByOrder = new Map();
  for (const row of balanceRows) {
    const key = text(row.no_pesanan); if (!key) continue;
    const current = balanceByOrder.get(key) || { net: 0, incomingOrderIncome: 0, outgoing: 0, events: [] };
    const signed = amount(row.jumlah_signed); current.net += signed;
    if (signed > 0 && text(row.type_transaksi) === 'Penghasilan dari Pesanan') current.incomingOrderIncome += signed;
    if (signed < 0) current.outgoing += signed;
    current.events.push(row); balanceByOrder.set(key, current);
  }
  const settlementByOrder = new Map(settlementRows.map((row) => [text(row.no_pesanan), row]));
  const settlementExistsByOrder = new Map(settlementExistenceRows.map((row) => [text(row.no_pesanan), row]));
  const exceptions = new Set(exceptionOrderNumbers.map((value) => text(value)?.toLowerCase()).filter(Boolean));
  const groups = new Map();
  for (const row of orderRows) {
    const key = text(row.no_pesanan); if (!key) continue;
    const group = groups.get(key) || { no_pesanan: key, rows: [] }; group.rows.push(row); groups.set(key, group);
  }
  const summary = { cohortOrders: 0, cohortPcs: 0, settledNormal: 0, settledNormalLoss: 0, completedUnsettled: 0, settlementOutsideReleaseRange: 0, pending: 0, exception: 0, partialReturnProvisional: 0, partialReturnSettlement: 0, partialReturnHpp: 0, partialReturnProfit: 0, cancelled: 0, settlement: 0, settlementExcluded: 0, hpp: 0, profit: 0 };
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
    const balance = balanceByOrder.get(group.no_pesanan) || { net: 0, incomingOrderIncome: 0, outgoing: 0, events: [] };
    let bucket = 'settled_normal';
    if (!settlementRow) bucket = text(first.status_pesanan) === 'Batal' ? 'batal' : settlementExistsRow ? 'settlement_outside_release_range' : first.waktu_pesanan_selesai ? 'completed_unsettled' : 'pending';
    else if (isException && hasPartialReturnedItems && !nonReturnedHppIssue && balance.incomingOrderIncome === amount(settlementRow.signed_total) && balance.outgoing === 0) bucket = 'partial_return_provisional';
    else if (isException) bucket = 'exception'; else if (hppIssue) bucket = 'hpp_issue';
    const settlement = settlementRow ? amount(settlementRow.signed_total) : null;
    const profitActual = bucket === 'settled_normal' && settlement !== null ? settlement - totalHpp : null;
    const provisionalProfit = bucket === 'partial_return_provisional' && settlement !== null ? settlement - nonReturnedHpp : null;
    if (bucket === 'settled_normal') { summary.settledNormal++; if (profitActual < 0) summary.settledNormalLoss++; summary.settlement += settlement; summary.hpp += totalHpp; summary.profit += profitActual; }
    else if (bucket === 'partial_return_provisional') { summary.partialReturnProvisional++; summary.partialReturnSettlement += settlement || 0; summary.partialReturnHpp += nonReturnedHpp; summary.partialReturnProfit += provisionalProfit || 0; }
    else if (bucket === 'completed_unsettled') summary.completedUnsettled++; else if (bucket === 'settlement_outside_release_range') summary.settlementOutsideReleaseRange++; else if (bucket === 'pending') summary.pending++; else if (bucket === 'exception' || bucket === 'hpp_issue') { summary.exception++; summary.settlementExcluded += settlement || 0; } else summary.cancelled++;
    return { no_pesanan: group.no_pesanan, orderDate: String(first.waktu_pesanan_dibuat).slice(0, 10), statusPesanan: text(first.status_pesanan), itemCount: group.rows.length, orderedPcs, returnedPcs, nonReturnedPcs: orderedPcs - returnedPcs, totalHpp, nonReturnedHpp, settlement, releaseDate: settlementRow?.tanggal_dana_dilepaskan || null, balanceOutgoing: balance.outgoing, balanceNet: balance.net, profitActual, provisionalProfit, bucket };
  }).sort((a, b) => b.orderDate.localeCompare(a.orderDate) || b.no_pesanan.localeCompare(a.no_pesanan));
  return { summary, orders };
}
module.exports = { buildProfitActualReport };
