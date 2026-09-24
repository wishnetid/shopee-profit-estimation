const { parseCalendarDate, validateDateRange } = require('./profit-estimation.js');

function text(value) { const result = String(value ?? '').trim(); return result && result !== '-' ? result : null; }
function number(value) { const result = Number(value); return Number.isFinite(result) ? result : 0; }
function orderNumber(row) { return text(row.no_pesanan_direct) || text(row.no_pesanan_extracted); }
function balanceCategory(row) {
  const type = text(row.type_transaksi);
  const linked = Boolean(orderNumber(row));
  if (type === 'Penghasilan dari Pesanan') return linked ? 'order_income' : 'unclassified';
  if (type === 'Penyesuaian') return linked ? 'order_adjustment' : 'store_adjustment';
  if (type === 'Pembayaran dengan Saldo Penjual') return 'ads_wallet_topup';
  if (type === 'Penarikan Dana') return 'withdrawal';
  return 'unclassified';
}
const CATEGORY = Object.freeze({
  order_income: { label: 'Pendapatan Order', scope: 'Order-linked', detail: 'Penghasilan dari Pesanan masuk atau pembalikan keluar; Profit Pesanan memakai Income / Order sebagai sumber settlement.' },
  order_adjustment: { label: 'Koreksi Order', scope: 'Order-linked', detail: 'Penyesuaian atau kompensasi yang punya No. Pesanan; audit cashflow sampai policy finansial disetujui.' },
  ads_wallet_topup: { label: 'Saldo Iklan/Koin', scope: 'Store-level', detail: 'Transfer My Balance ke saldo Iklan/Koin; bukan Ads Spend aktual.' },
  ads_actual: { label: 'Biaya Ads Aktual', scope: 'Store/day', detail: 'Deduction Ads dari Ads RAW; tidak dialokasikan ke order atau SKU.' },
  store_adjustment: { label: 'Pajak / Koreksi Store', scope: 'Store-level', detail: 'Penyesuaian tanpa No. Pesanan, misalnya pengembalian PPh 22.' },
  withdrawal: { label: 'Penarikan Dana', scope: 'Store-level', detail: 'Transfer saldo ke rekening; bukan biaya atau profit.' },
  unclassified: { label: 'Belum Terkategori', scope: 'Perlu Audit', detail: 'Tipe atau link tidak cukup untuk klasifikasi aman.' },
});

function adsCategory(description) {
  const value = text(description) || '';
  if (/^Deduction for Product Ad\b/i.test(value)) return 'GMV Max';
  if (/^Pengurangan untuk Iklan Toko\b/i.test(value)) return 'Iklan Toko Manual';
  return null;
}
function inRange(date, range) { return Boolean(date) && (!range.dateFrom || date >= range.dateFrom) && (!range.dateTo || date <= range.dateTo); }

function isWalletCredit(description, signed) {
  return signed > 0 && /^Isi Saldo\b/i.test(text(description) || '');
}

function buildMyBalanceAnalysis({ balanceRows = [], adsRows = [], dateFrom = null, dateTo = null } = {}) {
  const dateRange = validateDateRange(dateFrom, dateTo);
  const categories = Object.fromEntries(Object.entries(CATEGORY).map(([key, meta]) => [key, { key, ...meta, rows: 0, linkedOrders: 0, incoming: 0, outgoing: 0, net: 0 }]));
  const preparedRows = [];
  const linkedOrdersByCategory = new Map(Object.keys(CATEGORY).map((key) => [key, new Set()]));
  for (const row of balanceRows) {
    const transactionDate = text(row.transaction_at)?.slice(0, 10);
    if (!inRange(transactionDate, dateRange)) continue;
    const category = balanceCategory(row); const signed = number(row.jumlah_signed); const linkedOrder = orderNumber(row);
    const bucket = categories[category]; bucket.rows++; bucket.net += signed;
    if (signed > 0) bucket.incoming += signed; if (signed < 0) bucket.outgoing += signed;
    if (linkedOrder) linkedOrdersByCategory.get(category).add(linkedOrder);
    preparedRows.push({ transactionAt: row.transaction_at, transactionDate, category, categoryLabel: CATEGORY[category].label, type: text(row.type_transaksi), kind: text(row.jenis_transaksi), status: text(row.status), signed, description: text(row.description), noPesanan: linkedOrder, balanceAfter: row.saldo_akhir == null ? null : number(row.saldo_akhir), sourceFile: text(row.source_file), sourceRow: row.source_excel_row == null ? null : Number(row.source_excel_row) });
  }
  for (const key of Object.keys(categories)) categories[key].linkedOrders = linkedOrdersByCategory.get(key).size;
  const adsByDate = new Map(); const adsTotals = { total: 0, gmvMax: 0, manual: 0, rows: 0, duplicateRows: 0, unclassifiedNegativeRows: 0, walletCredit: 0, walletCreditRows: 0 }; const adsFingerprints = new Map();
  for (const row of adsRows) {
    const date = parseCalendarDate(row.transaction_date); const signed = number(row.jumlah_signed); const channel = adsCategory(row.description);
    if (!date || !inRange(date, dateRange)) continue;
    if (isWalletCredit(row.description, signed)) { adsTotals.walletCredit += signed; adsTotals.walletCreditRows++; continue; }
    if (signed >= 0) continue;
    if (!channel) { adsTotals.unclassifiedNegativeRows++; continue; }
    const packageId = text(row.ads_report_import_id); const sequence = text(row.sequence_number);
    if (packageId && sequence) {
      const fingerprint = [date, sequence, String(row.description || '').toLowerCase(), signed.toFixed(2), text(row.note) || ''].join('\u001f');
      const seenPackages = adsFingerprints.get(fingerprint) || new Set();
      if (seenPackages.size && !seenPackages.has(packageId)) { seenPackages.add(packageId); adsFingerprints.set(fingerprint, seenPackages); adsTotals.duplicateRows++; continue; }
      seenPackages.add(packageId); adsFingerprints.set(fingerprint, seenPackages);
    }
    const spend = Math.abs(signed); adsTotals.total += spend; adsTotals.rows++;
    if (channel === 'GMV Max') adsTotals.gmvMax += spend; else adsTotals.manual += spend;
    const day = adsByDate.get(date) || { date, gmvMax: 0, manual: 0, total: 0 };
    if (channel === 'GMV Max') day.gmvMax += spend; else day.manual += spend; day.total += spend; adsByDate.set(date, day);
  }
  categories.ads_actual.rows = adsTotals.rows; categories.ads_actual.outgoing = -adsTotals.total; categories.ads_actual.net = -adsTotals.total;
  const walletGrossTopup = Math.abs(categories.ads_wallet_topup.outgoing);
  const walletCredit = adsTotals.walletCredit;
  const adsWallet = {
    grossTopup: walletGrossTopup,
    walletCredit,
    walletCreditRows: adsTotals.walletCreditRows,
    ppnTopup: walletGrossTopup - walletCredit,
    actualSpend: adsTotals.total,
    walletMovement: walletCredit - adsTotals.total,
    topupRows: categories.ads_wallet_topup.rows,
  };
  const totals = preparedRows.reduce((sum, row) => ({ incoming: sum.incoming + (row.signed > 0 ? row.signed : 0), outgoing: sum.outgoing + (row.signed < 0 ? row.signed : 0), net: sum.net + row.signed, rows: sum.rows + 1 }), { incoming: 0, outgoing: 0, net: 0, rows: 0 });
  return { dateRange, totals, categories: Object.values(categories), ads: { ...adsTotals, daily: [...adsByDate.values()].sort((a, b) => b.date.localeCompare(a.date)) }, adsWallet, rows: preparedRows.sort((a, b) => String(b.transactionAt || '').localeCompare(String(a.transactionAt || ''))) };
}
module.exports = { CATEGORY, balanceCategory, buildMyBalanceAnalysis };
module.exports.default = module.exports;
