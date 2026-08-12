const SECTION_CONFIG = {
  balance: {
    table: 'balance_transactions_raw', parent: 'balance_report_imports', foreignKey: 'balance_report_import_id',
    select: ['r.id', 'r.balance_report_import_id', 'i.source_file', 'i.report_period_from', 'i.report_period_to', 'i.imported_at', 'r.source_excel_row', 'r.transaction_at', 'r.type_transaksi', 'r.description', 'r.no_pesanan_direct', 'r.no_pesanan_extracted', 'r.jenis_transaksi', 'r.jumlah_signed', 'r.status', 'r.saldo_akhir'],
    search: ['r.type_transaksi', 'r.description', 'r.no_pesanan_direct', 'r.no_pesanan_extracted', 'r.jenis_transaksi', 'r.status', 'i.source_file'],
    filters: { type: 'r.type_transaksi', kind: 'r.jenis_transaksi', status: 'r.status' },
    sort: { transaction_at: 'r.transaction_at', source_file: 'i.source_file', jumlah_signed: 'r.jumlah_signed', source_excel_row: 'r.source_excel_row', imported_at: 'i.imported_at' },
  },
  cancellation: {
    table: 'order_cancellation_raw', parent: 'order_cancellation_report_imports', foreignKey: 'order_cancellation_report_import_id',
    select: ['r.id', 'r.order_cancellation_report_import_id', 'i.source_file', 'i.report_period_from', 'i.report_period_to', 'i.imported_at', 'r.source_excel_row', 'r.no_pesanan', 'r.status_pesanan', 'r.alasan_pembatalan', 'r.no_resi', 'r.nomor_referensi_sku', 'r.nama_variasi', 'r.jumlah', 'r.subtotal_pesanan', 'r.total_pembayaran', 'r.waktu_pesanan_dibuat', 'r.waktu_pesanan_selesai'],
    search: ['r.no_pesanan', 'r.alasan_pembatalan', 'r.no_resi', 'r.nomor_referensi_sku', 'r.nama_variasi', 'r.status_pesanan', 'i.source_file'],
    filters: {}, sort: { no_pesanan: 'r.no_pesanan', source_file: 'i.source_file', waktu_pesanan_dibuat: 'r.waktu_pesanan_dibuat', source_excel_row: 'r.source_excel_row', imported_at: 'i.imported_at' },
  },
  failed_delivery: {
    table: 'order_failed_delivery_raw', parent: 'order_failed_delivery_report_imports', foreignKey: 'order_failed_delivery_report_import_id',
    select: ['r.id', 'r.order_failed_delivery_report_import_id', 'i.source_file', 'i.report_period_from', 'i.report_period_to', 'i.imported_at', 'r.source_excel_row', 'r.no_pesanan', 'r.status_pengiriman_gagal', 'r.no_resi', 'r.nomor_referensi_sku', 'r.nama_variasi', 'r.jumlah', 'r.total_pembayaran', 'r.status_klaim', 'r.jumlah_kompensasi'],
    search: ['r.no_pesanan', 'r.status_pengiriman_gagal', 'r.no_resi', 'r.nomor_referensi_sku', 'r.nama_variasi', 'r.status_klaim', 'i.source_file'],
    filters: {}, sort: { no_pesanan: 'r.no_pesanan', source_file: 'i.source_file', jumlah_kompensasi: 'r.jumlah_kompensasi', source_excel_row: 'r.source_excel_row', imported_at: 'i.imported_at' },
  },
  return_refund: {
    table: 'order_return_refund_raw', parent: 'order_return_refund_report_imports', foreignKey: 'order_return_refund_report_import_id',
    select: ['r.id', 'r.order_return_refund_report_import_id', 'i.source_file', 'i.report_period_from', 'i.report_period_to', 'i.imported_at', 'r.source_excel_row', 'r.no_pengembalian', 'r.no_pesanan', 'r.variasi', 'r.status_pembatalan_pengembalian', 'r.tipe_pengembalian', 'r.total_pengembalian_dana', 'r.pelepasan_dana_signed', 'r.ongkos_kirim_pengiriman_signed', 'r.ongkos_kirim_pengembalian_signed'],
    search: ['r.no_pengembalian', 'r.no_pesanan', 'r.variasi', 'r.status_pembatalan_pengembalian', 'r.tipe_pengembalian', 'r.alasan_pengembalian', 'i.source_file'],
    filters: {}, sort: { no_pesanan: 'r.no_pesanan', source_file: 'i.source_file', total_pengembalian_dana: 'r.total_pengembalian_dana', pelepasan_dana_signed: 'r.pelepasan_dana_signed', source_excel_row: 'r.source_excel_row', imported_at: 'i.imported_at' },
  },
  ads: {
    table: 'ads_transactions_raw', parent: 'ads_report_imports', foreignKey: 'ads_report_import_id',
    select: ['r.id', 'r.ads_report_import_id', 'i.source_file', 'i.report_period_from', 'i.report_period_to', 'i.imported_at', 'r.source_csv_row', 'r.sequence_number', 'r.transaction_date', 'r.description', 'r.jumlah_signed', 'r.note'],
    search: ['r.description', 'r.note', 'i.source_file'], filters: { description: 'r.description' },
    sort: { transaction_date: 'r.transaction_date', source_file: 'i.source_file', jumlah_signed: 'r.jumlah_signed', source_csv_row: 'r.source_csv_row', imported_at: 'i.imported_at' },
  },
};
const MAX_SEARCH_LENGTH = 500;
const MAX_SEARCH_TERMS = 10;
const MAX_SEARCH_TERM_LENGTH = 100;

function buildRawExpansionQueryPlan({ section, storeId, search = '', sort = 'imported_at', direction = 'desc', ...filterValues } = {}) {
  const config = SECTION_CONFIG[section];
  if (!config) throw new Error('Invalid RAW expansion section.');
  if (!Number.isSafeInteger(Number(storeId)) || Number(storeId) <= 0) throw new Error('storeId is invalid.');
  const sortColumn = config.sort[sort]; if (!sortColumn) throw new Error('Invalid RAW expansion sort.');
  const normalizedDirection = String(direction).toLowerCase(); if (!['asc', 'desc'].includes(normalizedDirection)) throw new Error('Invalid RAW expansion direction.');
  const searchText = String(search);
  if (searchText.length > MAX_SEARCH_LENGTH) throw new Error('RAW search terlalu panjang.');
  const terms = searchText.split(/\r?\n|\|\|/).map((term) => term.trim()).filter(Boolean);
  if (terms.length > MAX_SEARCH_TERMS || terms.some((term) => term.length > MAX_SEARCH_TERM_LENGTH)) throw new Error('RAW search memiliki terlalu banyak atau terlalu panjang istilah.');
  const filters = ['i.store_id = ?']; const params = [Number(storeId)];
  for (const [key, column] of Object.entries(config.filters)) { const value = String(filterValues[key] ?? '').trim(); if (value) { filters.push(`${column} = ?`); params.push(value); } }
  if (terms.length) { filters.push(`(${terms.map(() => `(${config.search.map((column) => `${column} LIKE ?`).join(' OR ')})`).join(' OR ')})`); for (const term of terms) params.push(...config.search.map(() => `%${term}%`)); }
  return { table: config.table, fromSql: `${config.table} r INNER JOIN ${config.parent} i ON i.id = r.${config.foreignKey}`, selectSql: config.select.join(', '), whereSql: `WHERE ${filters.join(' AND ')}`, params, orderSql: `${sortColumn} ${normalizedDirection.toUpperCase()}` };
}
module.exports = { SECTION_CONFIG, buildRawExpansionQueryPlan };
