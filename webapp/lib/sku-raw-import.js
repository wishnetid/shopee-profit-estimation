const { parseSignedNumber } = require('./income-raw-import.js');

const REQUIRED_HEADERS = ['SKU1', 'SKU2', 'Harga', 'IDPRODUK'];
const RESERVED_PREVIEW_KEYS = new Set(['source_excel_row']);

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeEmpty(value) {
  const text = normalizeText(value);
  return text === '' || text === '-' || /^n\/?a$/i.test(text) || text.toLowerCase() === 'null' ? null : value;
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
    return {
      index,
      label: display,
      key: RESERVED_PREVIEW_KEYS.has(base) || totals.get(base) > 1 ? `${base}__${occurrence}` : base,
    };
  });
}

function hasRowData(row) {
  return row.some((value) => normalizeEmpty(value) !== null);
}

function findSkuSheet(workbook) {
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const rows = workbook.__sheetToRows
      ? workbook.__sheetToRows(sheet)
      : require('xlsx').utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
    const headers = new Set((rows[0] || []).map(normalizeText));
    if (REQUIRED_HEADERS.every((header) => headers.has(header))) return { name, rows };
  }
  return null;
}

function parseSkuRawPackage(workbook, sourceFile, sha256) {
  const errors = [];
  const found = findSkuSheet(workbook);
  if (!found) {
    return {
      valid: false,
      sourceFile,
      sha256,
      sheetName: null,
      headers: [],
      headerFields: [],
      rows: [],
      warnings: [],
      errors: ['Sheet SKU tidak memiliki header wajib: SKU1, SKU2, Harga, IDPRODUK.'],
    };
  }

  const headerFields = canonicalizeHeaders(found.rows[0]);
  const headers = headerFields.map((field) => field.label);
  const requiredFields = {};
  for (const header of REQUIRED_HEADERS) {
    const matches = headerFields.filter((field) => field.label === header);
    if (matches.length !== 1) errors.push(`Header wajib ${header} harus muncul tepat satu kali.`);
    else requiredFields[header] = matches[0];
  }
  if (errors.length) {
    return { valid: false, sourceFile, sha256, sheetName: found.name, headers, headerFields, rows: [], warnings: [], errors };
  }

  const rows = [];
  const warnings = [];
  found.rows.slice(1).forEach((sourceRow, offset) => {
    if (!hasRowData(sourceRow)) return;
    const rawPayload = Object.fromEntries(headerFields.map((field) => [field.key, normalizeEmpty(sourceRow[field.index])]));
    const hargaInput = normalizeEmpty(sourceRow[requiredFields.Harga.index]);
    const harga = hargaInput === null ? null : parseSignedNumber(hargaInput);
    if (hargaInput !== null && harga === null) warnings.push(`Harga tidak dapat diparse pada row Excel ${offset + 2}.`);
    rows.push({
      source_excel_row: offset + 2,
      sku1: normalizeEmpty(sourceRow[requiredFields.SKU1.index]),
      sku2: normalizeEmpty(sourceRow[requiredFields.SKU2.index]),
      harga,
      idproduk: normalizeEmpty(sourceRow[requiredFields.IDPRODUK.index]),
      raw_payload: rawPayload,
    });
  });

  if (!rows.length) errors.push('Sheet SKU tidak memiliki row data.');
  return {
    valid: errors.length === 0,
    sourceFile,
    sha256,
    sheetName: found.name,
    headers,
    headerFields,
    rows,
    warnings,
    errors,
  };
}

module.exports = {
  REQUIRED_HEADERS,
  canonicalizeHeaders,
  parseSkuRawPackage,
};
