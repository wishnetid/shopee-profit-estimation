const XLSX = require('xlsx');
const { canonicalizeHeaders, detectHeaderRow, normalizeEmpty, parseSignedNumber } = require('./income-raw-import.js');
const { toIsoDate } = require('./balance-raw-import.js');

const TYPE_REQUIRED = {
  order_failed_delivery: ['No. Pesanan', 'Status pengiriman gagal', 'Jumlah Kompensasi'],
  order_return_refund: ['No. Pengembalian', 'No. Pesanan', 'Status Pembatalan/ Pengembalian', 'Tipe Pengembalian', 'Total Pengembalian Dana', 'Pelepasan Dana'],
  order_cancellation: ['No. Pesanan', 'Status Pesanan', 'Alasan Pembatalan', 'Total Pembayaran'],
};

function text(value) { return String(value ?? '').trim(); }
function payload(headers, row) { return Object.fromEntries(headers.map((field) => [field.key, normalizeEmpty(row[field.index])])); }
function byLabel(headers, row, label) {
  const field = headers.find((header) => header.label === label);
  return field ? normalizeEmpty(row[field.index]) : null;
}
function detectType(rows) {
  for (const [type, required] of Object.entries(TYPE_REQUIRED)) {
    if (detectHeaderRow(rows, required, Math.max(rows.length, 30)) >= 0) return type;
  }
  return null;
}
function mapRow(type, headers, row, sourceExcelRow) {
  const rawPayload = payload(headers, row);
  const base = {
    source_excel_row: sourceExcelRow,
    no_pesanan: text(byLabel(headers, row, 'No. Pesanan')) || null,
    status_pesanan: byLabel(headers, row, 'Status Pesanan'),
    no_resi: byLabel(headers, row, 'No. Resi'),
    nomor_referensi_sku: byLabel(headers, row, 'Nomor Referensi SKU'),
    nama_variasi: byLabel(headers, row, 'Nama Variasi'),
    jumlah: parseSignedNumber(byLabel(headers, row, 'Jumlah')),
    subtotal_pesanan: parseSignedNumber(byLabel(headers, row, 'Subtotal Pesanan')),
    total_pembayaran: parseSignedNumber(byLabel(headers, row, 'Total Pembayaran')),
    waktu_pesanan_dibuat: byLabel(headers, row, 'Waktu Pesanan Dibuat'),
    waktu_pesanan_selesai: byLabel(headers, row, 'Waktu Pesanan Selesai'),
    raw_payload: rawPayload,
  };
  if (type === 'order_cancellation') return { ...base, alasan_pembatalan: byLabel(headers, row, 'Alasan Pembatalan'), status_pembatalan_pengembalian: byLabel(headers, row, 'Status Pembatalan/ Pengembalian') };
  if (type === 'order_failed_delivery') return {
    ...base,
    status_pembatalan_pengembalian: byLabel(headers, row, 'Status Pembatalan/ Pengembalian'),
    status_pengiriman_gagal: byLabel(headers, row, 'Status pengiriman gagal'),
    status_klaim: byLabel(headers, row, 'Status Klaim'),
    tanggal_klaim_diajukan: byLabel(headers, row, 'Tanggal Klaim Diajukan'),
    tanggal_klaim_disetujui: byLabel(headers, row, 'Tanggal Klaim Disetujui'),
    tanggal_klaim_dicairkan: byLabel(headers, row, 'Tanggal Klaim Dicairkan'),
    tanggal_klaim_ditolak: byLabel(headers, row, 'Tanggal Klaim Ditolak'),
    jumlah_kompensasi: parseSignedNumber(byLabel(headers, row, 'Jumlah Kompensasi')),
  };
  return {
    source_excel_row: sourceExcelRow,
    no_pengembalian: byLabel(headers, row, 'No. Pengembalian'),
    no_pesanan: text(byLabel(headers, row, 'No. Pesanan')) || null,
    waktu_pesanan_dibuat: byLabel(headers, row, 'Tanggal Pesanan Dibuat'),
    kode_variasi: byLabel(headers, row, 'Kode Variasi'),
    variasi: byLabel(headers, row, 'Variasi'),
    status_pembatalan_pengembalian: byLabel(headers, row, 'Status Pembatalan/ Pengembalian'),
    tipe_pengembalian: byLabel(headers, row, 'Tipe Pengembalian'),
    jumlah_produk_dikembalikan: parseSignedNumber(byLabel(headers, row, 'Jumlah Produk Dikembalikan')),
    solusi_pengembalian: byLabel(headers, row, 'Solusi Pengembalian Barang/Dana'),
    alasan_pengembalian: byLabel(headers, row, 'Alasan Pengembalian'),
    total_pengembalian_dana: parseSignedNumber(byLabel(headers, row, 'Total Pengembalian Dana')),
    waktu_pengembalian_dana_selesai: byLabel(headers, row, 'Waktu Pengembalian Dana Selesai'),
    status_pengembalian_barang: byLabel(headers, row, 'Status Pengembalian Barang'),
    pelepasan_dana_signed: parseSignedNumber(byLabel(headers, row, 'Pelepasan Dana')),
    ongkos_kirim_pengiriman_signed: parseSignedNumber(byLabel(headers, row, 'Ongkos Kirim Pengiriman')),
    ongkos_kirim_pengembalian_signed: parseSignedNumber(byLabel(headers, row, 'Ongkos Kirim Pengembalian')),
    jumlah_kompensasi_signed: parseSignedNumber(byLabel(headers, row, 'Jumlah Kompensasi')),
    raw_payload: rawPayload,
  };
}
function parseExceptionPackage(workbook, sourceFile, sha256) {
  const errors = [];
  let selected = null;
  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: null, raw: true });
    const reportType = detectType(rows);
    if (reportType) { selected = { sheetName, rows, reportType }; break; }
  }
  if (!selected) return { valid: false, sourceFile, sha256, reportType: null, reportPeriod: { from: null, to: null }, headers: [], rows: [], warnings: [], errors: ['Struktur report exception tidak dikenali.'] };
  const headerRow = detectHeaderRow(selected.rows, TYPE_REQUIRED[selected.reportType], Math.max(selected.rows.length, 30));
  const headers = canonicalizeHeaders(selected.rows[headerRow]);
  const rows = selected.rows.slice(headerRow + 1)
    .map((row, index) => ({ row, sourceExcelRow: headerRow + index + 2 }))
    .filter(({ row }) => row.some((value) => normalizeEmpty(value) !== null))
    .map(({ row, sourceExcelRow }) => mapRow(selected.reportType, headers, row, sourceExcelRow));
  if (!rows.length) errors.push('Report exception tidak memiliki row data.');
  if (rows.some((row) => !row.no_pesanan)) errors.push('Report exception memiliki No. Pesanan kosong.');
  const dates = rows.flatMap((row) => [row.waktu_pesanan_dibuat, row.waktu_pesanan_selesai, row.waktu_pengembalian_dana_selesai].map(toIsoDate).filter(Boolean)).sort();
  return { valid: errors.length === 0, sourceFile, sha256, reportType: selected.reportType, reportPeriod: { from: dates[0] ?? null, to: dates.at(-1) ?? null }, headers, rows, warnings: [], errors, sheetName: selected.sheetName };
}
module.exports = { TYPE_REQUIRED, detectType, parseExceptionPackage };
