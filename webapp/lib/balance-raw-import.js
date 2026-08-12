const { computeSha256, canonicalizeHeaders, detectHeaderRow, normalizeEmpty, parseSignedNumber } = require('./income-raw-import.js');

const REQUIRED_HEADERS = [
  'Tanggal Transaksi', 'Tipe Transaksi', 'Deskripsi', 'No. Pesanan',
  'Jenis Transaksi', 'Jumlah', 'Status', 'Saldo Akhir',
];
const ORDER_ID_PATTERN = /(?<![A-Z0-9])(\d{6}[A-Z0-9]{8})(?![A-Z0-9])/;

function text(value) {
  return String(value ?? '').trim();
}

function toIsoDate(value) {
  const source = text(value);
  if (!source) return null;
  const match = source.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? `${match[1]}-${match[2]}-${match[3]}`
    : null;
}

function getByLabel(headers, row, label) {
  const header = headers.find((field) => field.label === label);
  return header ? normalizeEmpty(row[header.index]) : null;
}

function payload(headers, row) {
  return Object.fromEntries(headers.map((field) => [field.key, normalizeEmpty(row[field.index])]));
}

function metadataValue(rows, label) {
  for (const row of rows) {
    if (text(row[0]) === label) return normalizeEmpty(row[1]);
  }
  return null;
}

function summaryValue(rows, label) {
  for (const row of rows) {
    if (text(row[0]) !== label) continue;
    // Balance Summary stores the signed monetary total under the "$" label,
    // while the last numeric value is the transaction count.
    return parseSignedNumber(row[4]);
  }
  return null;
}

function summaryCount(rows, label) {
  for (const row of rows) {
    if (text(row[0]) !== label) continue;
    const candidate = row.at(6);
    return Number.isSafeInteger(Number(candidate)) ? Number(candidate) : null;
  }
  return null;
}

function parseBalancePackage(workbook, sourceFile, sha256) {
  const errors = [];
  const warnings = [];
  const sheetName = workbook.SheetNames.find((name) => text(name).toLowerCase() === 'transaction report');
  if (!sheetName) {
    return { valid: false, sourceFile, sha256, reportPeriod: { from: null, to: null }, summary: {}, reconciliation: { status: 'mismatched' }, ledgerContinuity: { status: 'mismatched' }, headers: [], transactions: [], warnings, errors: ['Sheet Transaction Report tidak ditemukan.'] };
  }
  const XLSX = require('xlsx');
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: null, raw: true });
  const headerRow = detectHeaderRow(rows, REQUIRED_HEADERS, Math.max(rows.length, 30));
  if (headerRow < 0) {
    return { valid: false, sourceFile, sha256, reportPeriod: { from: null, to: null }, summary: {}, reconciliation: { status: 'mismatched' }, ledgerContinuity: { status: 'mismatched' }, headers: [], transactions: [], warnings, errors: ['Header Transaction Report tidak sesuai kontrak.'] };
  }
  const headers = canonicalizeHeaders(rows[headerRow]);
  const transactions = rows.slice(headerRow + 1)
    .map((row, index) => ({ row, sourceExcelRow: headerRow + index + 2 }))
    .filter(({ row }) => row.some((value) => normalizeEmpty(value) !== null))
    .map(({ row, sourceExcelRow }) => {
      const directRaw = getByLabel(headers, row, 'No. Pesanan');
      const noPesananDirect = directRaw == null ? null : text(directRaw) === '-' ? null : text(directRaw);
      const description = getByLabel(headers, row, 'Deskripsi');
      const extracted = noPesananDirect ? null : text(description).match(ORDER_ID_PATTERN)?.[1] ?? null;
      return {
        source_excel_row: sourceExcelRow,
        transaction_at: normalizeEmpty(getByLabel(headers, row, 'Tanggal Transaksi')),
        type_transaksi: normalizeEmpty(getByLabel(headers, row, 'Tipe Transaksi')),
        description: normalizeEmpty(description),
        no_pesanan_direct: noPesananDirect,
        no_pesanan_extracted: extracted,
        jenis_transaksi: normalizeEmpty(getByLabel(headers, row, 'Jenis Transaksi')),
        jumlah_signed: parseSignedNumber(getByLabel(headers, row, 'Jumlah')),
        status: normalizeEmpty(getByLabel(headers, row, 'Status')),
        saldo_akhir: parseSignedNumber(getByLabel(headers, row, 'Saldo Akhir')),
        raw_payload: payload(headers, row),
      };
    });
  if (!transactions.length) errors.push('Transaction Report tidak memiliki baris transaksi.');
  if (transactions.some((row) => row.jumlah_signed === null || row.saldo_akhir === null)) errors.push('Transaction Report memiliki nominal atau saldo akhir yang tidak dapat diparse.');

  const positiveTotal = transactions.reduce((sum, row) => sum + (row.jumlah_signed > 0 ? row.jumlah_signed : 0), 0);
  const negativeTotal = transactions.reduce((sum, row) => sum + (row.jumlah_signed < 0 ? row.jumlah_signed : 0), 0);
  const summary = {
    seller_username: metadataValue(rows, 'Username (Penjual)'),
    total_saldo_masuk: summaryValue(rows, 'Total Saldo Masuk'),
    total_saldo_keluar: summaryValue(rows, 'Total Saldo Keluar'),
    jumlah_transaksi_masuk: summaryCount(rows, 'Total Saldo Masuk'),
    jumlah_transaksi_keluar: summaryCount(rows, 'Total Saldo Keluar'),
  };
  const reportPeriod = { from: toIsoDate(metadataValue(rows, 'Dari')), to: toIsoDate(metadataValue(rows, 'Ke')) };
  if (!reportPeriod.from || !reportPeriod.to) errors.push('Metadata periode Balance tidak valid.');
  const reconciliation = {
    positiveTotal,
    negativeTotal,
    status: summary.total_saldo_masuk === positiveTotal && summary.total_saldo_keluar === negativeTotal ? 'matched' : 'mismatched',
  };
  if (reconciliation.status !== 'matched') errors.push('Ringkasan Total Saldo Masuk/Keluar tidak cocok dengan transaksi signed.');

  let continuityMismatch = 0;
  for (let index = 0; index < transactions.length - 1; index += 1) {
    const newer = transactions[index];
    const older = transactions[index + 1];
    if (newer.saldo_akhir === null || newer.jumlah_signed === null || older.saldo_akhir === null) continue;
    if (newer.saldo_akhir - newer.jumlah_signed !== older.saldo_akhir) continuityMismatch += 1;
  }
  const ledgerContinuity = { checkedPairs: Math.max(transactions.length - 1, 0), mismatchCount: continuityMismatch, status: continuityMismatch === 0 ? 'matched' : 'mismatched' };
  if (ledgerContinuity.status !== 'matched') errors.push('Ledger continuity Balance tidak cocok.');

  return { valid: errors.length === 0, sourceFile, sha256, reportPeriod, summary, reconciliation, ledgerContinuity, headers, transactions, warnings, errors, sheetName };
}

module.exports = { REQUIRED_HEADERS, ORDER_ID_PATTERN, computeSha256, parseBalancePackage, toIsoDate };
