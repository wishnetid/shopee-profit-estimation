const crypto = require('node:crypto');
const XLSX = require('xlsx');

const AGGREGATE_SERVICE_FEE_BREAKDOWN_LABELS = new Set([
  'Biaya Layanan Promo XTRA',
  'Biaya Layanan Gratis Ongkir XTRA (Kategori F)',
  'Biaya Gratis Ongkir XTRA - Ukuran Biasa (Kategori F)',
]);

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeEmpty(value) {
  const text = normalizeText(value);
  return text === '' || text === '-' || /^n\/?a$/i.test(text) || text.toLowerCase() === 'null' ? null : value;
}

function parseSignedNumber(value) {
  const normalized = normalizeEmpty(value);
  if (normalized === null) return null;
  if (typeof normalized === 'number') return Number.isFinite(normalized) ? normalized : null;
  const text = String(normalized).trim().replace(/^Rp\s*/i, '').replace(/\s/g, '');
  if (!/^-?[\d.,]+$/.test(text)) return null;
  const negative = text.startsWith('-');
  const unsigned = negative ? text.slice(1) : text;
  const comma = unsigned.lastIndexOf(',');
  const dot = unsigned.lastIndexOf('.');
  let normalizedNumber;
  if (comma >= 0 && dot >= 0) {
    normalizedNumber = comma > dot ? unsigned.replace(/\./g, '').replace(',', '.') : unsigned.replace(/,/g, '');
  } else if (comma >= 0) {
    const tail = unsigned.length - comma - 1;
    normalizedNumber = tail > 0 && tail <= 2 ? unsigned.replace(',', '.') : unsigned.replace(/,/g, '');
  } else {
    const parts = unsigned.split('.');
    normalizedNumber = parts.length > 1 && parts.at(-1).length <= 2 ? unsigned.replace(/\.(?=.*\.)/g, '') : unsigned.replace(/\./g, '');
  }
  const number = Number(`${negative ? '-' : ''}${normalizedNumber}`);
  return Number.isFinite(number) ? number : null;
}

function canonicalBase(value) {
  return normalizeText(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'kolom';
}

function canonicalizeHeaders(headers) {
  const totals = new Map();
  headers.forEach((label) => {
    const base = canonicalBase(label);
    totals.set(base, (totals.get(base) || 0) + 1);
  });
  const seen = new Map();
  return headers.map((label, index) => {
    const display = normalizeText(label);
    const base = canonicalBase(display);
    const occurrence = (seen.get(base) || 0) + 1;
    seen.set(base, occurrence);
    return { index, label: display, key: totals.get(base) > 1 ? `${base}__${occurrence}` : base };
  });
}

function detectHeaderRow(rows, requiredLabels, maxRows = 25) {
  const required = new Set(requiredLabels.map(normalizeText));
  for (let index = 0; index < Math.min(rows.length, maxRows); index += 1) {
    const labels = new Set((rows[index] || []).map(normalizeText));
    if ([...required].every((label) => labels.has(label))) return index;
  }
  return -1;
}

function hasRowData(row) {
  return row.some((value) => normalizeEmpty(value) !== null);
}

function rowPayload(headers, row) {
  const payload = {};
  headers.forEach((field, index) => { payload[field.key] = normalizeEmpty(row[index]); });
  return payload;
}

function getByDisplay(headers, row, display) {
  const index = headers.findIndex((field) => field.label === display);
  return index < 0 ? null : normalizeEmpty(row[index]);
}

function readSummary(rows) {
  const labels = {};
  for (const row of rows) {
    const first = normalizeText(row[0]);
    if (first === 'Dari') labels.period_from = normalizeEmpty(row[1]);
    if (first === 'ke') labels.period_to = normalizeEmpty(row[1]);
    if (first.includes('1. Total Pendapatan')) {
      const amounts = row.map(parseSignedNumber).filter((value) => value !== null);
      labels.total_pendapatan = amounts.at(-1) ?? null;
    }
    if (first.includes('3. Total yang Dilepas')) {
      const amounts = row.map(parseSignedNumber).filter((value) => value !== null);
      labels.total_yang_dilepas = amounts.at(-1) ?? null;
    }
  }
  return labels;
}

function parsePenghasilan(rows, errors) {
  const headerRow = detectHeaderRow(rows, ['No. Pesanan', 'Lihat berdasarkan']);
  if (headerRow < 0) {
    errors.push('Sheet Penghasilan tidak memiliki header No. Pesanan dan Lihat berdasarkan yang dikenali.');
    return { status: 'blocked', headerRow: null, headers: [], orderRows: [], skuRows: [] };
  }
  const rawHeaders = rows[headerRow];
  const headers = canonicalizeHeaders(rawHeaders);
  const sourceRows = rows.slice(headerRow + 1).filter(hasRowData);
  const orderRows = [];
  const skuRows = [];
  const unexpectedViews = new Set();

  sourceRows.forEach((row, rowOffset) => {
    const view = normalizeText(getByDisplay(headers, row, 'Lihat berdasarkan'));
    const noPesanan = normalizeEmpty(getByDisplay(headers, row, 'No. Pesanan'));
    if (!view && !noPesanan) return;
    if (!['Order', 'Sku'].includes(view)) {
      unexpectedViews.add(view || '(kosong)');
      return;
    }
    const payload = rowPayload(headers, row);
    let signedTotal = 0;
    const start = headers.findIndex((field) => field.label === 'Harga Produk');
    const end = headers.findIndex((field) => field.label === 'PPh 22');
    const usesAggregateServiceFee = headers.some((field) => field.label === 'Biaya Layanan');
    // Seller settlement components are the semantic range Harga Produk through PPh 22.
    // Older exports expose Biaya Layanan as an aggregate while also displaying its
    // XTRA/Premium breakdowns; adding both would double-count the same fee.
    for (let index = Math.max(0, start); index <= end && index < row.length; index += 1) {
      const label = headers[index].label;
      if (usesAggregateServiceFee && AGGREGATE_SERVICE_FEE_BREAKDOWN_LABELS.has(label)) continue;
      const amount = parseSignedNumber(row[index]);
      if (amount !== null) signedTotal += amount;
    }
    const normalized = {
      source_excel_row: headerRow + rowOffset + 2,
      lihat_berdasarkan: view,
      no_pesanan: noPesanan == null ? null : String(noPesanan),
      id_produk: normalizeEmpty(getByDisplay(headers, row, 'ID Produk')),
      nama_produk: normalizeEmpty(getByDisplay(headers, row, 'Nama Produk')),
      waktu_pesanan_dibuat: normalizeEmpty(getByDisplay(headers, row, 'Waktu Pesanan Dibuat')),
      tanggal_dana_dilepaskan: normalizeEmpty(getByDisplay(headers, row, 'Tanggal Dana Dilepaskan')),
      signed_total: signedTotal,
      raw_payload: payload,
    };
    if (view === 'Order') orderRows.push(normalized);
    else skuRows.push(normalized);
  });
  if (unexpectedViews.size) errors.push(`Nilai Lihat berdasarkan tidak dikenali: ${[...unexpectedViews].join(', ')}.`);
  return { status: errors.length ? 'blocked' : 'ready', headerRow, headers, orderRows, skuRows };
}

function parseOptionalSheet(rows, requiredLabels, sectionName, errors) {
  const headerRow = detectHeaderRow(rows, requiredLabels);
  if (headerRow < 0) {
    errors.push(`Sheet ${sectionName} ada tetapi header wajib berubah atau tidak dikenali.`);
    return { status: 'blocked', headerRow: null, headers: [], rows: [] };
  }
  const headers = canonicalizeHeaders(rows[headerRow]);
  const dataRows = rows.slice(headerRow + 1).filter(hasRowData).map((row, offset) => ({
    source_excel_row: headerRow + offset + 2,
    raw_payload: rowPayload(headers, row),
  }));
  return { status: 'ready', headerRow, headers, rows: dataRows };
}

function computeSha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function parseIncomePackage(workbook, sourceFile, sha256) {
  const sheetToRows = workbook.__sheetToRows || ((sheet) => XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true }));
  const errors = [];
  const warnings = [];
  const required = ['Summary', 'Penghasilan'];
  required.forEach((name) => { if (!workbook.SheetNames.includes(name)) errors.push(`Sheet wajib ${name} tidak ditemukan.`); });
  const unknownSheets = workbook.SheetNames.filter((name) => !['Summary', 'Adjustment', 'Shipping Fee Discrepancy', 'Seller Fee', 'Penghasilan'].includes(name));
  unknownSheets.forEach((name) => warnings.push(`Sheet baru belum dikenali: ${name}.`));

  const summaryRows = workbook.Sheets.Summary ? sheetToRows(workbook.Sheets.Summary) : [];
  const summary = readSummary(summaryRows);
  if (!summary.period_from || !summary.period_to || summary.total_yang_dilepas === null || summary.total_yang_dilepas === undefined) {
    errors.push('Summary tidak memiliki periode atau Total yang Dilepas yang dapat direkonsiliasi.');
  }

  const penghasilanRows = workbook.Sheets.Penghasilan ? sheetToRows(workbook.Sheets.Penghasilan) : [];
  const penghasilan = parsePenghasilan(penghasilanRows, errors);
  if (!penghasilan.orderRows.length || !penghasilan.skuRows.length) errors.push('Penghasilan wajib memuat kedua view Order dan Sku.');

  const adjustment = workbook.Sheets.Adjustment
    ? parseOptionalSheet(sheetToRows(workbook.Sheets.Adjustment), ['No.', 'Tanggal Penyesuaian Dibuat'], 'Adjustment', errors)
    : { status: 'absent', headerRow: null, headers: [], rows: [] };
  if (adjustment.status === 'absent') warnings.push('Adjustment tidak tersedia pada paket report ini.');

  const shippingFeeDiscrepancy = workbook.Sheets['Shipping Fee Discrepancy']
    ? parseOptionalSheet(sheetToRows(workbook.Sheets['Shipping Fee Discrepancy']), ['No. Pesanan', 'Discrepancy reason'], 'Shipping Fee Discrepancy', errors)
    : { status: 'absent', headerRow: null, headers: [], rows: [] };
  if (shippingFeeDiscrepancy.status === 'absent') warnings.push('Shipping Fee Discrepancy tidak tersedia pada paket report ini.');

  const orderSignedTotal = penghasilan.orderRows.reduce((sum, row) => sum + row.signed_total, 0);
  const summaryTotal = summary.total_yang_dilepas ?? null;
  const reconciliation = {
    summaryTotal,
    orderSignedTotal,
    difference: summaryTotal === null ? null : orderSignedTotal - summaryTotal,
    status: summaryTotal !== null && orderSignedTotal === summaryTotal ? 'matched' : 'mismatched',
  };
  if (reconciliation.status !== 'matched') errors.push('Summary Total yang Dilepas tidak cocok dengan total signed Penghasilan view Order.');

  return {
    valid: errors.length === 0,
    sourceFile,
    sha256,
    reportPeriod: { from: summary.period_from ?? null, to: summary.period_to ?? null },
    summary,
    reconciliation,
    sections: { penghasilan, adjustment, shippingFeeDiscrepancy },
    warnings,
    errors,
  };
}

module.exports = {
  canonicalizeHeaders,
  computeSha256,
  detectHeaderRow,
  normalizeEmpty,
  parseIncomePackage,
  parseSignedNumber,
};
