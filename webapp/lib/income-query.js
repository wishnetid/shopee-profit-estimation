const SECTION_CONFIG = {
  penghasilan: {
    table: 'income_penghasilan_raw',
    searchColumns: ['r.no_pesanan', 'r.id_produk', 'r.nama_produk', 'r.lihat_berdasarkan', 'i.source_file'],
    sortColumns: {
      source_file: 'i.source_file',
      report_period_from: 'i.report_period_from',
      imported_at: 'i.imported_at',
      no_pesanan: 'r.no_pesanan',
      signed_total: 'r.signed_total',
      source_excel_row: 'r.source_excel_row',
    },
    selectColumns: [
      'r.id',
      'r.income_report_import_id',
      'i.source_file',
      'i.report_period_from',
      'i.report_period_to',
      'i.imported_at',
      'r.source_excel_row',
      'r.lihat_berdasarkan',
      'r.no_pesanan',
      'r.id_produk',
      'r.nama_produk',
      'r.waktu_pesanan_dibuat',
      'r.tanggal_dana_dilepaskan',
      'r.signed_total',
    ],
  },
  adjustment: {
    table: 'income_adjustments_raw',
    searchColumns: ['r.no_pesanan_terhubung', 'r.raw_payload', 'i.source_file'],
    sortColumns: {
      source_file: 'i.source_file',
      report_period_from: 'i.report_period_from',
      imported_at: 'i.imported_at',
      no_pesanan: 'r.no_pesanan_terhubung',
      biaya_penyesuaian: 'r.biaya_penyesuaian',
      source_excel_row: 'r.source_excel_row',
    },
    selectColumns: [
      'r.id',
      'r.income_report_import_id',
      'i.source_file',
      'i.report_period_from',
      'i.report_period_to',
      'i.imported_at',
      'r.source_excel_row',
      'r.no_pesanan_terhubung',
      'r.tanggal_penyesuaian_dibuat',
      'r.tanggal_dana_dilepaskan',
      'r.biaya_penyesuaian',
    ],
  },
  shipping: {
    table: 'income_shipping_fee_discrepancies_raw',
    searchColumns: ['r.no_pesanan', 'r.discrepancy_reason', 'i.source_file'],
    sortColumns: {
      source_file: 'i.source_file',
      report_period_from: 'i.report_period_from',
      imported_at: 'i.imported_at',
      no_pesanan: 'r.no_pesanan',
      discrepancy_reason: 'r.discrepancy_reason',
      source_excel_row: 'r.source_excel_row',
    },
    selectColumns: [
      'r.id',
      'r.income_report_import_id',
      'i.source_file',
      'i.report_period_from',
      'i.report_period_to',
      'i.imported_at',
      'r.source_excel_row',
      'r.no_pesanan',
      'r.estimasi_ongkos_kirim',
      'r.ongkos_kirim_dibayarkan_jasa_kirim',
      'r.discrepancy_reason',
    ],
  },
};

const VALID_VIEWS = new Set(['Order', 'Sku']);

function normalizeSearchTerms(value) {
  return String(value ?? '')
    .split(/\r?\n|\|\|/)
    .map((term) => term.trim())
    .filter(Boolean);
}

function buildIncomeQueryPlan({ section = 'penghasilan', view = 'Order', search = '', sort = 'report_period_from', direction = 'desc' } = {}) {
  const config = SECTION_CONFIG[section];
  if (!config) throw new Error('Invalid Income section.');
  if (section === 'penghasilan' && !VALID_VIEWS.has(view)) throw new Error('Invalid Income view.');

  const sortColumn = config.sortColumns[sort];
  if (!sortColumn) throw new Error('Invalid Income sort.');
  const safeDirection = String(direction).toLowerCase() === 'asc'
    ? 'ASC'
    : String(direction).toLowerCase() === 'desc'
      ? 'DESC'
      : null;
  if (!safeDirection) throw new Error('Invalid Income direction.');

  const filters = [];
  const params = [];
  if (section === 'penghasilan') {
    filters.push('r.lihat_berdasarkan = ?');
    params.push(view);
  }

  const terms = normalizeSearchTerms(search);
  if (terms.length) {
    filters.push(`(${terms.map(() => `(${config.searchColumns.map((column) => `${column} LIKE ?`).join(' OR ')})`).join(' OR ')})`);
    for (const term of terms) params.push(...config.searchColumns.map(() => `%${term}%`));
  }

  return {
    table: config.table,
    selectSql: config.selectColumns.join(', '),
    whereSql: filters.length ? `WHERE ${filters.join(' AND ')}` : '',
    params,
    orderSql: `${sortColumn} ${safeDirection}`,
  };
}

module.exports = { buildIncomeQueryPlan };
module.exports.default = { buildIncomeQueryPlan };
