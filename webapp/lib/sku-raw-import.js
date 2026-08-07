const { parseSignedNumber } = require('./income-raw-import.js');

const REQUIRED_HEADERS = ['SKU1', 'SKU2', 'Harga', 'IDPRODUK'];

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeEmpty(value) {
  const text = normalizeText(value);
  return text === '' || text === '-' || /^n\/?a$/i.test(text) || text.toLowerCase() === 'null' ? null : value;
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
      rows: [],
      warnings: [],
      errors: ['Sheet SKU tidak memiliki header wajib: SKU1, SKU2, Harga, IDPRODUK.'],
    };
  }

  const headers = found.rows[0].map((header) => normalizeText(header));
  const indexes = Object.fromEntries(REQUIRED_HEADERS.map((header) => [header, headers.indexOf(header)]));
  const rows = [];
  const warnings = [];

  found.rows.slice(1).forEach((sourceRow, offset) => {
    if (!hasRowData(sourceRow)) return;
    const rawPayload = Object.fromEntries(headers.map((header, index) => [header, normalizeEmpty(sourceRow[index])]));
    const hargaInput = normalizeEmpty(sourceRow[indexes.Harga]);
    const harga = hargaInput === null ? null : parseSignedNumber(hargaInput);
    if (hargaInput !== null && harga === null) warnings.push(`Harga tidak dapat diparse pada row Excel ${offset + 2}.`);
    rows.push({
      source_excel_row: offset + 2,
      sku1: normalizeEmpty(sourceRow[indexes.SKU1]),
      sku2: normalizeEmpty(sourceRow[indexes.SKU2]),
      harga,
      idproduk: normalizeEmpty(sourceRow[indexes.IDPRODUK]),
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
    rows,
    warnings,
    errors,
  };
}

module.exports = {
  REQUIRED_HEADERS,
  parseSkuRawPackage,
};
