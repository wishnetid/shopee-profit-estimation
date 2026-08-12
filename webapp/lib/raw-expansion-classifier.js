const XLSX = require('xlsx');
const { detectHeaderRow } = require('./income-raw-import.js');
const { REQUIRED_HEADERS: BALANCE_HEADERS } = require('./balance-raw-import.js');
const { TYPE_REQUIRED } = require('./exception-raw-import.js');
const { REQUIRED_HEADERS: ADS_HEADERS, parseCsv } = require('./ads-raw-import.js');
const { validateOrderAllHeaders } = require('./order-all-import.js');

function sheetRows(workbook, sheetName) {
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: null, raw: true });
}

function detectWorkbookType(workbook) {
  const sheets = workbook.SheetNames.map((sheetName) => ({ sheetName, rows: sheetRows(workbook, sheetName) }));
  for (const { rows } of sheets) {
    if (detectHeaderRow(rows, BALANCE_HEADERS, Math.max(rows.length, 30)) >= 0) return 'balance';
  }

  // Order.all is a strict full-header contract. It must win over Cancellation,
  // whose smaller header subset is contained in normal Order.all exports.
  for (const { sheetName, rows } of sheets) {
    if (sheetName.toLowerCase() === 'orders' && validateOrderAllHeaders(rows[0] || []).valid) return 'order_all';
  }

  for (const type of ['order_failed_delivery', 'order_return_refund', 'order_cancellation']) {
    const required = TYPE_REQUIRED[type];
    for (const { rows } of sheets) {
      if (detectHeaderRow(rows, required, Math.max(rows.length, 30)) >= 0) return type;
    }
  }
  return null;
}

function detectRawExpansionReportType({ workbook = null, csvBuffer = null } = {}) {
  if (workbook) return detectWorkbookType(workbook);
  if (csvBuffer) {
    const rows = parseCsv(csvBuffer.toString('utf8').replace(/^\uFEFF/, ''));
    return detectHeaderRow(rows, ADS_HEADERS, Math.max(rows.length, 30)) >= 0 ? 'ads_ledger' : null;
  }
  return null;
}

module.exports = { detectRawExpansionReportType, detectWorkbookType };
