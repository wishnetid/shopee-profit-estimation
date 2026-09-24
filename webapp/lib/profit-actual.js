const { buildSkuIndex, resolveItemHpp } = require('./profit-estimation.js');

function text(value) { const valueText = String(value ?? '').trim(); return valueText && valueText !== '-' ? valueText : null; }
function amount(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }

function buildProfitActualReport({ orderRows, skuRows, settlementRows, exceptionOrderNumbers }) {
  const skuIndex = buildSkuIndex(skuRows);
  const settlementByOrder = new Map(settlementRows.map((row) => [text(row.no_pesanan), row]));
  const exceptions = new Set(exceptionOrderNumbers.map((value) => text(value)?.toLowerCase()).filter(Boolean));
  const groups = new Map();
  for (const row of orderRows) {
    const key = text(row.no_pesanan); if (!key) continue;
    const group = groups.get(key) || { no_pesanan: key, rows: [] }; group.rows.push(row); groups.set(key, group);
  }
  const summary = { settledNormal: 0, pending: 0, exception: 0, cancelled: 0, settlement: 0, hpp: 0, profit: 0 };
  const orders = [...groups.values()].map((group) => {
    const first = group.rows[0]; const settlementRow = settlementByOrder.get(group.no_pesanan); const isException = exceptions.has(group.no_pesanan.toLowerCase());
    let totalHpp = 0; let hppIssue = false;
    for (const row of group.rows) { const mapped = resolveItemHpp(row, skuIndex); const quantity = amount(row.jumlah); if (mapped.kind !== 'resolved' || !Number.isInteger(quantity) || quantity <= 0) hppIssue = true; else totalHpp += mapped.price * quantity; }
    let bucket = 'settled_normal';
    if (!settlementRow) bucket = text(first.status_pesanan) === 'Batal' ? 'batal' : 'pending';
    else if (isException) bucket = 'exception'; else if (hppIssue) bucket = 'hpp_issue';
    const settlement = settlementRow ? amount(settlementRow.signed_total) : null;
    const profitActual = bucket === 'settled_normal' && settlement !== null ? settlement - totalHpp : null;
    if (bucket === 'settled_normal') { summary.settledNormal++; summary.settlement += settlement; summary.hpp += totalHpp; summary.profit += profitActual; } else if (bucket === 'pending') summary.pending++; else if (bucket === 'exception' || bucket === 'hpp_issue') summary.exception++; else summary.cancelled++;
    return { no_pesanan: group.no_pesanan, orderDate: String(first.waktu_pesanan_dibuat).slice(0, 10), statusPesanan: text(first.status_pesanan), itemCount: group.rows.length, totalHpp, settlement, releaseDate: settlementRow?.tanggal_dana_dilepaskan || null, profitActual, bucket };
  }).sort((a, b) => b.orderDate.localeCompare(a.orderDate) || b.no_pesanan.localeCompare(a.no_pesanan));
  return { summary, orders };
}
module.exports = { buildProfitActualReport };
