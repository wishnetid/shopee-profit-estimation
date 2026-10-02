import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildProfitActualReport } = require('./profit-actual.js') as {
  buildProfitActualReport: (input: {
    orderRows: RowDataPacket[];
    skuRows: RowDataPacket[];
    settlementRows: RowDataPacket[];
    settlementExistenceRows?: RowDataPacket[];
    exceptionOrderNumbers: string[];
    exceptionEvidenceRows?: Array<{ no_pesanan?: unknown; source_type?: unknown; source_reference?: unknown; source_status?: unknown; reason?: unknown; return_type?: unknown; stock_status?: unknown; amount?: unknown }>;
    balanceRows?: RowDataPacket[];
    returnQcByReference?: Record<string, string>;
  }) => { orders: Array<{ no_pesanan: string }>; summary: Record<string, unknown>; [key: string]: unknown };
};

export type ProfitActualData = {
  report: ReturnType<typeof buildProfitActualReport>;
  exceptionDetails: Array<Record<string, unknown>>;
  orderItems: Array<Record<string, unknown>>;
  skuAllocations: Array<Record<string, unknown>>;
  returnQcReview: Array<Record<string, unknown>>;
};

/**
 * Loads the approved RAW inputs for one Order.all cohort and sends them through
 * the single Profit Aktual classifier. It never mutates source data.
 */
export async function loadProfitActualData(
  conn: PoolConnection,
  storeId: number,
  from: string,
  to: string,
  releaseFrom = '',
  releaseTo = '',
): Promise<ProfitActualData> {
  const [skuRows] = await conn.query<RowDataPacket[]>('SELECT sku1,sku2,harga FROM sku_master_raw WHERE sku_report_import_id=(SELECT id FROM sku_report_imports ORDER BY imported_at DESC,id DESC LIMIT 1)');
  // Order.all preserves Seller Centre local timestamp text as DATETIME. Keep WIB calendar boundaries unchanged.
  const [orderRows] = await conn.query<RowDataPacket[]>(
    "SELECT no_pesanan,status_pesanan,alasan_pembatalan,no_resi,waktu_pengiriman_diatur,nomor_referensi_sku,sku_induk,nama_produk,nama_variasi,jumlah,returned_quantity,subtotal_pesanan,voucher_ditanggung_penjual,total_pembayaran,status_pembatalan_pengembalian,waktu_pesanan_selesai,DATE_FORMAT(waktu_pesanan_dibuat, '%Y-%m-%d') waktu_pesanan_dibuat FROM order_all WHERE store_id=? AND waktu_pesanan_dibuat >= CONCAT(?, ' 00:00:00') AND waktu_pesanan_dibuat < DATE_ADD(CONCAT(?, ' 00:00:00'), INTERVAL 1 DAY)",
    [storeId, from, to],
  );

  // RAW Income packages can overlap. Canonical settlement is the newest row for
  // an Order + release-date identity. Penghasilan / SKU stays audit-only.
  const settlementSql = `SELECT ranked.no_pesanan,ranked.signed_total,DATE_FORMAT(ranked.tanggal_dana_dilepaskan, '%Y-%m-%d') tanggal_dana_dilepaskan
    FROM (
      SELECT p.no_pesanan,p.signed_total,p.tanggal_dana_dilepaskan,
        ROW_NUMBER() OVER (PARTITION BY p.no_pesanan,p.tanggal_dana_dilepaskan ORDER BY i.imported_at DESC,i.id DESC,p.id DESC) canonical_rank
      FROM income_penghasilan_raw p
      JOIN income_report_imports i ON i.id=p.income_report_import_id
      WHERE i.store_id=? AND p.lihat_berdasarkan='Order'
    ) ranked WHERE ranked.canonical_rank=1`;
  const [settlementExistenceRows] = await conn.query<RowDataPacket[]>(settlementSql, [storeId]);
  const [skuAllocationRows] = await conn.query<RowDataPacket[]>(`SELECT ranked.no_pesanan,ranked.nama_produk,ranked.id_produk,ranked.signed_total,DATE_FORMAT(ranked.tanggal_dana_dilepaskan, '%Y-%m-%d') tanggal_dana_dilepaskan FROM (
    SELECT p.no_pesanan,p.nama_produk,p.id_produk,p.signed_total,p.tanggal_dana_dilepaskan,
      ROW_NUMBER() OVER (PARTITION BY p.no_pesanan,p.id_produk,p.tanggal_dana_dilepaskan ORDER BY i.imported_at DESC,i.id DESC,p.id DESC) canonical_rank
    FROM income_penghasilan_raw p JOIN income_report_imports i ON i.id=p.income_report_import_id
    WHERE i.store_id=? AND p.lihat_berdasarkan='Sku'
  ) ranked WHERE ranked.canonical_rank=1`, [storeId]);

  const releaseConditions: string[] = [];
  const releaseParams: string[] = [String(storeId)];
  if (releaseFrom) { releaseConditions.push("ranked.tanggal_dana_dilepaskan >= CONCAT(?, ' 00:00:00')"); releaseParams.push(releaseFrom); }
  if (releaseTo) { releaseConditions.push("ranked.tanggal_dana_dilepaskan < DATE_ADD(CONCAT(?, ' 00:00:00'), INTERVAL 1 DAY)"); releaseParams.push(releaseTo); }
  const [settlementRows] = await conn.query<RowDataPacket[]>(`${settlementSql}${releaseConditions.length ? ` AND ${releaseConditions.join(' AND ')}` : ''}`, releaseParams);

  // Exception reports are immutable snapshot families. Read the newest canonical
  // state per physical identity, never every overlapping package row.
  const [returnRows] = await conn.query<RowDataPacket[]>(`SELECT no_pesanan, 'return_refund' source_type, no_pengembalian source_reference, status_pembatalan_pengembalian source_status, tipe_pengembalian return_type, variasi return_variant, alasan_pengembalian reason, jumlah_produk_dikembalikan quantity, total_pengembalian_dana amount, status_pengembalian_barang stock_status, source_file FROM (SELECT r.*,i.source_file,ROW_NUMBER() OVER (PARTITION BY r.no_pengembalian,r.no_pesanan,COALESCE(r.kode_variasi,''),COALESCE(r.jumlah_produk_dikembalikan,0),COALESCE(r.tipe_pengembalian,'') ORDER BY i.imported_at DESC,i.id DESC,r.id DESC) canonical_rank FROM order_return_refund_raw r JOIN order_return_refund_report_imports i ON i.id=r.order_return_refund_report_import_id WHERE i.store_id=?) canonical WHERE canonical_rank=1`, [storeId]);
  const [failedRows] = await conn.query<RowDataPacket[]>(`SELECT no_pesanan, 'failed_delivery' source_type, no_resi source_reference, status_klaim source_status, status_pengiriman_gagal reason, jumlah quantity, jumlah_kompensasi amount, NULL stock_status, source_file FROM (SELECT r.*,i.source_file,ROW_NUMBER() OVER (PARTITION BY r.no_pesanan,COALESCE(r.nomor_referensi_sku,''),COALESCE(r.nama_variasi,''),COALESCE(r.jumlah,0),COALESCE(r.status_pengiriman_gagal,'' ) ORDER BY i.imported_at DESC,i.id DESC,r.id DESC) canonical_rank FROM order_failed_delivery_raw r JOIN order_failed_delivery_report_imports i ON i.id=r.order_failed_delivery_report_import_id WHERE i.store_id=?) canonical WHERE canonical_rank=1`, [storeId]);
  const [cancellationRows] = await conn.query<RowDataPacket[]>(`SELECT no_pesanan, 'cancellation' source_type, no_resi source_reference, status_pembatalan_pengembalian source_status, alasan_pembatalan reason, jumlah quantity, NULL amount, NULL stock_status, source_file FROM (SELECT r.*,i.source_file,ROW_NUMBER() OVER (PARTITION BY r.no_pesanan,COALESCE(r.nomor_referensi_sku,''),COALESCE(r.nama_variasi,''),COALESCE(r.jumlah,0),COALESCE(r.alasan_pembatalan,'' ) ORDER BY i.imported_at DESC,i.id DESC,r.id DESC) canonical_rank FROM order_cancellation_raw r JOIN order_cancellation_report_imports i ON i.id=r.order_cancellation_report_import_id WHERE i.store_id=?) canonical WHERE canonical_rank=1`, [storeId]);
  const exceptionRows = Array.from(new Set([...returnRows, ...failedRows, ...cancellationRows].map((row) => String(row.no_pesanan || '').trim()).filter(Boolean))).map((no_pesanan) => ({ no_pesanan }));
  const [adjustmentRows] = await conn.query<RowDataPacket[]>(`SELECT ranked.no_pesanan_terhubung no_pesanan, 'adjustment' source_type, NULL source_reference, ranked.source_status, ranked.reason, NULL quantity, ranked.biaya_penyesuaian amount, NULL stock_status, ranked.source_file FROM (
    SELECT r.no_pesanan_terhubung,r.tanggal_penyesuaian_dibuat,r.tanggal_dana_dilepaskan,r.biaya_penyesuaian,
      JSON_UNQUOTE(JSON_EXTRACT(r.raw_payload, '$.tipe_penyesuaian_deskripsi')) source_status,
      JSON_UNQUOTE(JSON_EXTRACT(r.raw_payload, '$.alasan_penyesuaian')) reason,i.source_file,
      ROW_NUMBER() OVER (PARTITION BY r.no_pesanan_terhubung,r.tanggal_penyesuaian_dibuat,r.tanggal_dana_dilepaskan,r.biaya_penyesuaian ORDER BY i.imported_at DESC,i.id DESC,r.id DESC) canonical_rank
    FROM income_adjustments_raw r JOIN income_report_imports i ON i.id=r.income_report_import_id WHERE i.store_id=?
  ) ranked WHERE ranked.canonical_rank=1`, [storeId]);

  const cohortOrderNumbers = Array.from(new Set(orderRows.map((row) => String(row.no_pesanan || '').trim()).filter(Boolean)));
  let balanceRows: RowDataPacket[] = [];
  if (cohortOrderNumbers.length) {
    const balanceMarks = cohortOrderNumbers.map(() => '?').join(',');
    const [rows] = await conn.query<RowDataPacket[]>(`SELECT no_pesanan,type_transaksi,jumlah_signed FROM (SELECT COALESCE(NULLIF(b.no_pesanan_direct,''),NULLIF(b.no_pesanan_extracted,'')) no_pesanan,b.type_transaksi,b.jumlah_signed,ROW_NUMBER() OVER (PARTITION BY b.transaction_at,b.type_transaksi,b.description,COALESCE(NULLIF(b.no_pesanan_direct,''),NULLIF(b.no_pesanan_extracted,'')),b.jenis_transaksi,b.jumlah_signed,b.status,b.saldo_akhir ORDER BY i.imported_at DESC,i.id DESC,b.id DESC) canonical_rank FROM balance_transactions_raw b JOIN balance_report_imports i ON i.id=b.balance_report_import_id WHERE i.store_id=? AND COALESCE(NULLIF(b.no_pesanan_direct,''),NULLIF(b.no_pesanan_extracted,'')) IN (${balanceMarks})) canonical WHERE canonical_rank=1`, [storeId, ...cohortOrderNumbers]);
    balanceRows = rows;
  }

  const [qcRows] = await conn.query<RowDataPacket[]>("SELECT no_pengembalian, qc_status, qc_note, DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i') updated_at FROM return_qc_decisions WHERE store_id=?", [storeId]);
  const qcByReturn = new Map(qcRows.map((row) => [String(row.no_pengembalian), row]));
  const exceptionEvidenceRows = [
    ...returnRows.map((row) => ({ no_pesanan: row.no_pesanan, source_type: 'return_refund', source_reference: row.source_reference, source_status: row.source_status, return_type: row.return_type, stock_status: row.stock_status })),
    ...failedRows.map((row) => ({ no_pesanan: row.no_pesanan, source_type: 'failed_delivery', source_status: row.source_status, reason: row.reason })),
    ...cancellationRows.map((row) => ({ no_pesanan: row.no_pesanan, source_type: 'cancellation', source_status: row.source_status, reason: row.reason })),
    ...adjustmentRows.map((row) => ({ no_pesanan: row.no_pesanan, source_type: 'adjustment', source_status: null, amount: row.amount })),
  ];
  const report = buildProfitActualReport({
    orderRows,
    skuRows,
    settlementRows,
    settlementExistenceRows,
    balanceRows,
    exceptionEvidenceRows,
    returnQcByReference: Object.fromEntries(Array.from(qcByReturn.entries()).map(([key, row]) => [key, String(row.qc_status)])),
    exceptionOrderNumbers: exceptionRows.map((row) => String(row.no_pesanan || '')),
  });
  const cohort = new Set(report.orders.map((row) => row.no_pesanan));
  const exceptionDetails = [...returnRows, ...failedRows, ...cancellationRows, ...adjustmentRows]
    .filter((row) => cohort.has(String(row.no_pesanan || '').trim()))
    .map((row) => ({ noPesanan: String(row.no_pesanan || '').trim(), sourceType: row.source_type, sourceReference: row.source_reference || null, sourceStatus: row.source_status || null, returnType: row.return_type || null, returnVariant: row.return_variant || null, reason: row.reason || null, quantity: row.quantity == null ? null : Number(row.quantity), amount: row.amount == null ? null : Number(row.amount), stockStatus: row.stock_status || null, sourceFile: row.source_file }));
  const orderItems = orderRows.map((row) => ({ noPesanan: String(row.no_pesanan || '').trim(), productName: row.nama_produk || null, skuReference: row.nomor_referensi_sku || null, variation: row.nama_variasi || null, quantity: Number(row.jumlah || 0), returnedQuantity: Number(row.returned_quantity || 0), returnStatus: row.status_pembatalan_pengembalian || null }));
  const skuAllocations = skuAllocationRows
    .filter((row) => cohort.has(String(row.no_pesanan || '').trim()))
    .map((row) => ({ noPesanan: String(row.no_pesanan || '').trim(), productName: row.nama_produk || null, productId: row.id_produk || null, amount: Number(row.signed_total || 0), releaseDate: row.tanggal_dana_dilepaskan || null }));
  const returnQcReview = exceptionDetails.filter((row) => row.sourceType === 'return_refund').map((row) => {
    const qc = qcByReturn.get(String(row.sourceReference || ''));
    return {
      ...row,
      qcStatus: qc?.qc_status || 'belum_dinilai',
      qcNote: qc?.qc_note || '',
      qcUpdatedAt: qc?.updated_at || null,
      reviewStatus: qc ? 'Keputusan QC internal tersimpan.' : 'Belum ada keputusan QC internal.',
      financialTreatment: 'Tidak dialokasikan ke Profit Aktual Normal.',
    };
  });
  return { report, exceptionDetails, orderItems, skuAllocations, returnQcReview };
}
