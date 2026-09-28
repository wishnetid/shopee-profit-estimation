function text(value) { return String(value ?? '').trim(); }
function number(value) { return value == null || value === '' ? '' : String(Number(value)); }
function key(parts) { return parts.map(text).join('\u001f'); }

const DEFINITIONS = {
  order_cancellation: {
    identity: (row) => key([row.no_pesanan, row.nomor_referensi_sku, row.nama_variasi, number(row.jumlah), row.alasan_pembatalan]),
    state: (row) => key([row.status_pesanan, row.status_pembatalan_pengembalian, row.no_resi, number(row.subtotal_pesanan), number(row.total_pembayaran), row.waktu_pesanan_dibuat, row.waktu_pesanan_selesai]),
  },
  order_failed_delivery: {
    identity: (row) => key([row.no_pesanan, row.nomor_referensi_sku, row.nama_variasi, number(row.jumlah), row.status_pengiriman_gagal]),
    state: (row) => key([row.status_pesanan, row.status_pembatalan_pengembalian, row.no_resi, row.status_klaim, row.tanggal_klaim_diajukan, row.tanggal_klaim_disetujui, row.tanggal_klaim_dicairkan, row.tanggal_klaim_ditolak, number(row.jumlah_kompensasi), number(row.subtotal_pesanan), number(row.total_pembayaran), row.waktu_pesanan_dibuat, row.waktu_pesanan_selesai]),
  },
  order_return_refund: {
    identity: (row) => key([row.no_pengembalian, row.no_pesanan, row.kode_variasi, number(row.jumlah_produk_dikembalikan), row.tipe_pengembalian]),
    state: (row) => key([row.waktu_pesanan_dibuat, row.variasi, row.status_pembatalan_pengembalian, row.solusi_pengembalian, row.alasan_pengembalian, number(row.total_pengembalian_dana), row.waktu_pengembalian_dana_selesai, row.status_pengembalian_barang, number(row.pelepasan_dana_signed), number(row.ongkos_kirim_pengiriman_signed), number(row.ongkos_kirim_pengembalian_signed), number(row.jumlah_kompensasi_signed)]),
  },
};

function canonicalKeys(reportType, row) {
  const definition = DEFINITIONS[reportType];
  if (!definition) throw new Error('Unsupported exception report type.');
  return { identityKey: definition.identity(row), stateKey: definition.state(row) };
}

function classifyExceptionRows(reportType, incomingRows, existingRows) {
  const currentByIdentity = new Map();
  for (const row of existingRows) {
    const keys = canonicalKeys(reportType, row);
    const current = currentByIdentity.get(keys.identityKey);
    const rank = [String(row.imported_at || ''), Number(row.import_id || 0), Number(row.id || 0)];
    if (!current || rank.join('\u001f') > current.rank.join('\u001f')) currentByIdentity.set(keys.identityKey, { ...keys, rank, row });
  }
  const incomingSeen = new Map();
  const classifications = incomingRows.map((row) => {
    const keys = canonicalKeys(reportType, row);
    const duplicateInPackage = incomingSeen.has(`${keys.identityKey}\u001e${keys.stateKey}`);
    incomingSeen.set(`${keys.identityKey}\u001e${keys.stateKey}`, true);
    const existing = currentByIdentity.get(keys.identityKey);
    const kind = duplicateInPackage ? 'overlap' : !existing ? 'new' : existing.stateKey === keys.stateKey ? 'overlap' : 'update';
    return { row, ...keys, kind };
  });
  const count = (kind) => classifications.filter((item) => item.kind === kind).length;
  return { classifications, rawRows: incomingRows.length, canonicalNewRows: count('new'), correctionRows: count('update'), overlapRows: count('overlap') };
}

module.exports = { canonicalKeys, classifyExceptionRows };
