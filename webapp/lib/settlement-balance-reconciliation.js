function text(value) { const normalized = String(value ?? '').trim(); return normalized && normalized !== '-' ? normalized : null; }
function amount(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }

function buildSettlementBalanceReconciliation({ orderRows, incomeRows, balanceRows, exceptionRows = [] }) {
  const orders = new Map();
  for (const row of orderRows) {
    const id = text(row.no_pesanan); if (!id) continue;
    const current = orders.get(id) || { noPesanan: id, orderDate: String(row.waktu_pesanan_dibuat || '').slice(0, 10), statusPesanan: text(row.status_pesanan), orderedPcs: 0, returnedPcs: 0 };
    current.orderedPcs += Math.max(0, amount(row.jumlah));
    current.returnedPcs += Math.max(0, amount(row.returned_quantity));
    orders.set(id, current);
  }
  const incomeByOrder = new Map();
  for (const row of incomeRows) {
    const id = text(row.no_pesanan); if (!orders.has(id)) continue;
    const current = incomeByOrder.get(id) || { settlement: 0, events: [] };
    const signedTotal = amount(row.signed_total);
    current.settlement += signedTotal;
    current.events.push({ at: row.tanggal_dana_dilepaskan || null, type: 'Income · Penghasilan / Order', direction: signedTotal >= 0 ? 'Masuk' : 'Keluar', amount: signedTotal, description: 'Penghasilan / Order', sourceFile: row.source_file || null, sourceRow: row.source_excel_row ?? null });
    incomeByOrder.set(id, current);
  }
  const balanceByOrder = new Map();
  for (const row of balanceRows) {
    const id = text(row.no_pesanan); if (!orders.has(id)) continue;
    const current = balanceByOrder.get(id) || [];
    current.push({ at: row.transaction_at || null, type: text(row.type_transaksi) || 'Mutasi Balance', direction: text(row.jenis_transaksi) || (amount(row.jumlah_signed) >= 0 ? 'Transaksi Masuk' : 'Transaksi Keluar'), amount: amount(row.jumlah_signed), description: text(row.description) || '—', status: text(row.status), balanceAfter: row.saldo_akhir == null ? null : amount(row.saldo_akhir), sourceFile: row.source_file || null, sourceRow: row.source_excel_row ?? null });
    balanceByOrder.set(id, current);
  }
  const exceptionByOrder = new Map();
  for (const row of exceptionRows) {
    const id = text(row.no_pesanan); if (!orders.has(id)) continue;
    const current = exceptionByOrder.get(id) || new Set(); current.add(String(row.source_type)); exceptionByOrder.set(id, current);
  }

  const summary = { cohortOrders: orders.size, incomeSettlement: 0, balanceOrderIncomeIn: 0, balanceOrderIncomeOut: 0, balanceAdjustmentIn: 0, balanceAdjustmentOut: 0, balanceNet: 0, matchNormal: 0, reversal: 0, adjustment: 0, exception: 0, partialReturnPending: 0, needsReconciliation: 0, noBalance: 0 };
  const rows = [...orders.values()].map((order) => {
    const income = incomeByOrder.get(order.noPesanan) || { settlement: 0, events: [] };
    const balanceEvents = balanceByOrder.get(order.noPesanan) || [];
    const exceptionTypes = [...(exceptionByOrder.get(order.noPesanan) || new Set())];
    const orderIncomeIn = balanceEvents.filter((event) => event.type === 'Penghasilan dari Pesanan' && event.amount > 0).reduce((sum, event) => sum + event.amount, 0);
    const orderIncomeOut = balanceEvents.filter((event) => event.type === 'Penghasilan dari Pesanan' && event.amount < 0).reduce((sum, event) => sum + event.amount, 0);
    const adjustmentIn = balanceEvents.filter((event) => event.type === 'Penyesuaian' && event.amount > 0).reduce((sum, event) => sum + event.amount, 0);
    const adjustmentOut = balanceEvents.filter((event) => event.type === 'Penyesuaian' && event.amount < 0).reduce((sum, event) => sum + event.amount, 0);
    const balanceNet = balanceEvents.reduce((sum, event) => sum + event.amount, 0);
    const partialReturn = order.returnedPcs > 0 && order.returnedPcs < order.orderedPcs;
    const hasBalanceNegative = orderIncomeOut < 0 || adjustmentOut < 0;
    const incomeBalanceMatches = income.settlement > 0 && orderIncomeIn === income.settlement && !hasBalanceNegative;
    let reconciliationStatus = 'Belum ada My Balance';
    if (partialReturn) reconciliationStatus = 'Retur parsial — menunggu alokasi';
    else if (exceptionTypes.length && hasBalanceNegative) reconciliationStatus = 'Ada exception + mutasi keluar';
    else if (orderIncomeOut < 0) reconciliationStatus = 'Ada pembalikan saldo';
    else if (adjustmentIn !== 0 || adjustmentOut !== 0) reconciliationStatus = 'Ada penyesuaian';
    else if (incomeBalanceMatches) reconciliationStatus = 'Match normal';
    else if (balanceEvents.length > 0 || income.settlement !== 0) reconciliationStatus = 'Perlu rekonsiliasi';
    if (reconciliationStatus === 'Match normal') summary.matchNormal++;
    else if (reconciliationStatus === 'Ada pembalikan saldo') summary.reversal++;
    else if (reconciliationStatus === 'Ada penyesuaian') summary.adjustment++;
    else if (reconciliationStatus === 'Retur parsial — menunggu alokasi') summary.partialReturnPending++;
    else if (reconciliationStatus === 'Ada exception + mutasi keluar') summary.exception++;
    else if (reconciliationStatus === 'Belum ada My Balance') summary.noBalance++;
    else summary.needsReconciliation++;
    summary.incomeSettlement += income.settlement;
    summary.balanceOrderIncomeIn += orderIncomeIn;
    summary.balanceOrderIncomeOut += orderIncomeOut;
    summary.balanceAdjustmentIn += adjustmentIn;
    summary.balanceAdjustmentOut += adjustmentOut;
    summary.balanceNet += balanceNet;
    return { ...order, nonReturnedPcs: order.orderedPcs - order.returnedPcs, incomeSettlement: income.settlement, balanceOrderIncomeIn: orderIncomeIn, balanceOrderIncomeOut: orderIncomeOut, balanceAdjustmentIn: adjustmentIn, balanceAdjustmentOut: adjustmentOut, balanceNet, incomeBalanceDifference: income.settlement - orderIncomeIn, exceptionTypes, reconciliationStatus, events: [...income.events, ...balanceEvents].sort((a, b) => String(a.at || '').localeCompare(String(b.at || ''))) };
  }).sort((a, b) => b.orderDate.localeCompare(a.orderDate) || b.noPesanan.localeCompare(a.noPesanan));
  return { summary, rows };
}

module.exports = { buildSettlementBalanceReconciliation };
