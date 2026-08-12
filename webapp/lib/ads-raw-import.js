const { canonicalizeHeaders, detectHeaderRow, normalizeEmpty, parseSignedNumber } = require('./income-raw-import.js');

const REQUIRED_HEADERS = ['Urutan', 'Waktu', 'Deskripsi', 'Jumlah', 'Catatan'];

function parseCsv(text) {
  const rows = [];
  let row = []; let cell = ''; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; } else quoted = !quoted;
    } else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell); cell = ''; rows.push(row); row = [];
    } else cell += char;
  }
  row.push(cell);
  if (row.some((value) => String(value).trim() !== '') || text.length === 0 || !/[\r\n]$/.test(text)) rows.push(row);
  return rows;
}
function text(value) { return String(value ?? '').trim(); }
function parseSourceDate(value) {
  const match = text(value).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [day, month, year] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? `${match[3]}-${match[2]}-${match[1]}` : null;
}
function parseMetadataPeriod(value) {
  const [from, to] = text(value).split('--').map((part) => parseSourceDate(part.trim()));
  return { from: from || null, to: to || null };
}
function parseAdsPackage(buffer, sourceFile, sha256) {
  const rows = parseCsv(buffer.toString('utf8').replace(/^\uFEFF/, ''));
  const errors = []; const metadata = {};
  for (const row of rows) {
    const key = text(row[0]);
    if (key === 'Mata uang:') metadata.currency = text(row[1]) || null;
    if (key === 'Username:') metadata.seller_username = text(row[1]) || null;
    if (key === 'Tanggal:') metadata.report_period_source = text(row[1]) || null;
    if (key === 'ID Toko:') metadata.source_store_reference = text(row[1]) || null;
  }
  const headerRow = detectHeaderRow(rows, REQUIRED_HEADERS, Math.max(rows.length, 30));
  if (headerRow < 0) return { valid: false, sourceFile, sha256, reportPeriod: { from: null, to: null }, metadata, headers: [], rows: [], warnings: [], errors: ['Header Ads CSV tidak sesuai kontrak.'], sourceFormat: 'csv' };
  const headers = canonicalizeHeaders(rows[headerRow]);
  const records = rows.slice(headerRow + 1)
    .map((row, index) => ({ row, sourceCsvRow: headerRow + index + 2 }))
    .filter(({ row }) => row.some((value) => normalizeEmpty(value) !== null))
    .map(({ row, sourceCsvRow }) => {
      const field = (label) => { const item = headers.find((header) => header.label === label); return item ? normalizeEmpty(row[item.index]) : null; };
      const rawPayload = Object.fromEntries(headers.map((header) => [header.key, normalizeEmpty(row[header.index])]));
      return { source_csv_row: sourceCsvRow, sequence_number: parseSignedNumber(field('Urutan')), transaction_date: parseSourceDate(field('Waktu')), description: field('Deskripsi'), jumlah_signed: parseSignedNumber(field('Jumlah')), note: field('Catatan'), raw_payload: rawPayload };
    });
  if (!metadata.currency || !metadata.seller_username || !metadata.source_store_reference) errors.push('Metadata Ads CSV tidak lengkap.');
  if (records.some((row) => !row.transaction_date || row.jumlah_signed === null || !row.description)) errors.push('Ads CSV memiliki tanggal, nominal, atau deskripsi transaksi tidak valid.');
  const reportPeriod = parseMetadataPeriod(metadata.report_period_source);
  if (!reportPeriod.from || !reportPeriod.to) errors.push('Periode Ads CSV tidak valid.');
  return { valid: errors.length === 0, sourceFile, sha256, reportPeriod, metadata, headers, rows: records, warnings: [], errors, sourceFormat: 'csv' };
}
module.exports = { REQUIRED_HEADERS, parseAdsPackage, parseCsv, parseSourceDate };
