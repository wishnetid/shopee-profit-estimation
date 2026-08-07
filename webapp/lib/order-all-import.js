const ORDER_ALL_HEADERS = [
  'No. Pesanan',
  'Status Pesanan',
  'Alasan Pembatalan',
  'Status Pembatalan/ Pengembalian',
  'No. Resi',
  'Opsi Pengiriman',
  'Antar ke counter/ pick-up',
  'Pesanan Harus Dikirimkan Sebelum (Menghindari keterlambatan)',
  'Waktu Pengiriman Diatur',
  'Waktu Pesanan Dibuat',
  'Waktu Pembayaran Dilakukan',
  'Tipe Pesanan',
  'Metode Pembayaran',
  'SKU Induk',
  'Nama Produk',
  'Nomor Referensi SKU',
  'Nama Variasi',
  'Harga Awal',
  'Harga Setelah Diskon',
  'Jumlah',
  'Returned quantity',
  'Subtotal Pesanan',
  'Total Diskon',
  'Diskon Dari Penjual',
  'Diskon Dari Shopee',
  'Berat Produk',
  'Jumlah Produk di Pesan',
  'Total Berat',
  'Voucher Ditanggung Penjual',
  'Cashback Koin',
  'Voucher Ditanggung Shopee',
  'Paket Diskon',
  'Paket Diskon (Diskon dari Shopee)',
  'Paket Diskon (Diskon dari Penjual)',
  'Potongan Koin Shopee',
  'Diskon Kartu Kredit',
  'Ongkos Kirim Dibayar oleh Pembeli',
  'Estimasi Potongan Biaya Pengiriman',
  'Ongkos Kirim Pengembalian Barang',
  'Total Pembayaran',
  'Perkiraan Ongkos Kirim',
  'Catatan dari Pembeli',
  'Catatan',
  'Username (Pembeli)',
  'Nama Penerima',
  'No. Telepon',
  'Alamat Pengiriman',
  'Kota/Kabupaten',
  'Provinsi',
  'Waktu Pesanan Selesai',
];

function parseIdr(value) {
  if (value === undefined || value === null) return null;
  const raw = String(value).trim();
  if (raw === '' || raw === '-' || raw.toLowerCase() === 'n/a' || raw.toLowerCase() === 'null') return null;

  const normalized = raw.replace(/\s/g, '');
  if (!/^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(normalized) && !/^-?\d+(,\d+)?$/.test(normalized)) {
    return null;
  }

  const number = Number(normalized.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(number) ? number : null;
}

function validateOrderAllHeaders(headers) {
  const normalized = headers.filter(Boolean).map((header) => String(header).trim());
  const missing = ORDER_ALL_HEADERS.filter((header) => !normalized.includes(header));
  const unexpected = normalized.filter((header) => !ORDER_ALL_HEADERS.includes(header));

  return {
    valid: normalized.length === ORDER_ALL_HEADERS.length && missing.length === 0 && unexpected.length === 0,
    missing,
    unexpected,
  };
}

const STATUS_ORDER = {
  'Belum Bayar': 0,
  'Perlu Dikirim': 1,
  'Sedang Dikirim': 2,
  'Telah Dikirim': 3,
  'Selesai': 4,
  'Batal': 4,
};

function normalizeEmpty(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text === '' || text === '-' || text.toLowerCase() === 'n/a' || text.toLowerCase() === 'null'
    ? null
    : text;
}

function isMasked(value) {
  return typeof value === 'string' && /\*{3,}/.test(value);
}

function getStatusRank(value) {
  const status = normalizeEmpty(value);
  return status ? STATUS_ORDER[status] : undefined;
}

function isStatusRegression(existingStatus, incomingStatus) {
  const oldRank = getStatusRank(existingStatus);
  const newRank = getStatusRank(incomingStatus);
  return oldRank !== undefined && newRank !== undefined && newRank < oldRank;
}

function isStatusAdvance(existingStatus, incomingStatus) {
  const oldRank = getStatusRank(existingStatus);
  const newRank = getStatusRank(incomingStatus);
  return oldRank !== undefined && newRank !== undefined && newRank > oldRank;
}

function parseSnapshotAt(value) {
  const text = normalizeEmpty(value);
  if (!text) return null;
  const match = text.replace('T', ' ').match(
    /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (!match) return null;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText = '00'] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const timestamp = new Date(Date.UTC(year, month - 1, day, hour, minute, second));

  if (timestamp.getUTCFullYear() !== year
    || timestamp.getUTCMonth() !== month - 1
    || timestamp.getUTCDate() !== day
    || timestamp.getUTCHours() !== hour
    || timestamp.getUTCMinutes() !== minute
    || timestamp.getUTCSeconds() !== second) return null;

  return `${yearText}-${monthText}-${dayText} ${hourText}:${minuteText}:${secondText}`;
}

function validateOrderAllCompositeKeys(rows) {
  const seen = new Set();
  const duplicates = [];
  const missing = [];

  rows.forEach((row, index) => {
    const keyParts = [
      normalizeEmpty(row['No. Pesanan']),
      normalizeEmpty(row['Nomor Referensi SKU']),
      normalizeEmpty(row['Nama Variasi']),
    ];
    if (keyParts.some((value) => value === null)) {
      missing.push(index + 2);
      return;
    }

    const key = keyParts.join('||');
    if (seen.has(key)) duplicates.push({ row: index + 2, key });
    else seen.add(key);
  });

  return {
    valid: duplicates.length === 0 && missing.length === 0,
    duplicateCount: duplicates.length,
    missingCount: missing.length,
    duplicateSamples: duplicates.slice(0, 5),
    missingSamples: missing.slice(0, 5),
  };
}

function isOlderOrEqualSnapshot(existingSnapshotAt, incomingSnapshotAt) {
  const existing = parseSnapshotAt(existingSnapshotAt);
  const incoming = parseSnapshotAt(incomingSnapshotAt);
  return Boolean(existing && incoming && incoming <= existing);
}

function isQualityDowngrade(existingValue, incomingValue) {
  const existing = normalizeEmpty(existingValue);
  const incoming = normalizeEmpty(incomingValue);
  if (existing === null) return false;
  if (incoming === null) return true;
  return !isMasked(existingValue) && isMasked(incomingValue);
}

const ORDER_DECIMAL_COLUMNS = new Set([
  'harga_awal', 'harga_setelah_diskon', 'subtotal_pesanan', 'total_diskon',
  'diskon_dari_penjual', 'diskon_dari_shopee', 'voucher_ditanggung_penjual',
  'cashback_koin', 'voucher_ditanggung_shopee', 'paket_diskon_shopee',
  'paket_diskon_penjual', 'potongan_koin_shopee', 'diskon_kartu_kredit',
  'ongkos_kirim_dibayar_pembeli', 'estimasi_potongan_biaya_pengiriman',
  'ongkos_kirim_pengembalian_barang', 'total_pembayaran', 'perkiraan_ongkos_kirim',
]);
const ORDER_DATETIME_COLUMNS = new Set([
  'pesanan_harus_dikirim_sebelum', 'waktu_pengiriman_diatur',
  'waktu_pesanan_dibuat', 'waktu_pembayaran_dilakukan', 'waktu_pesanan_selesai',
]);

function valuesDiffer(column, left, right) {
  const normalizedLeft = normalizeEmpty(left);
  const normalizedRight = normalizeEmpty(right);
  if (normalizedLeft === null || normalizedRight === null) return normalizedLeft !== normalizedRight;

  if (ORDER_DECIMAL_COLUMNS.has(column)) return Number(normalizedLeft) !== Number(normalizedRight);
  if (ORDER_DATETIME_COLUMNS.has(column)) return normalizedLeft.slice(0, 16) !== normalizedRight.slice(0, 16);
  return normalizedLeft !== normalizedRight;
}

/**
 * Resolve one overlapping Order.all item into the safest current-state row.
 *
 * A supplied Shopee export timestamp is authoritative for snapshot ordering.
 * If that metadata does not yet exist on an old row, status progression is the
 * conservative fallback. A lower-status snapshot is never allowed to mutate
 * any field. Equal/newer snapshots may update fields, but cannot replace a
 * populated value with blank data or with Shopee's masked (`******`) variant.
 */
function resolveOrderSnapshot(existingRow, incomingRow, columns, {
  existingSnapshotAt = existingRow.source_snapshot_at,
  incomingSnapshotAt = incomingRow.source_snapshot_at,
} = {}) {
  const existingSnapshot = parseSnapshotAt(existingSnapshotAt);
  const incomingSnapshot = parseSnapshotAt(incomingSnapshotAt);
  const staleBySnapshotAt = isOlderOrEqualSnapshot(existingSnapshotAt, incomingSnapshotAt);
  const staleByStatus = !existingSnapshot && !incomingSnapshot && isStatusRegression(
    existingRow.status_pesanan,
    incomingRow.status_pesanan,
  );
  const staleSnapshot = staleBySnapshotAt || staleByStatus;
  const incomingProvenFresher = Boolean(
    (existingSnapshot && incomingSnapshot && incomingSnapshot > existingSnapshot)
    || isStatusAdvance(existingRow.status_pesanan, incomingRow.status_pesanan),
  );
  const row = { ...incomingRow };
  const protectedColumns = [];

  for (const column of columns) {
    const existingValue = existingRow[column];
    const incomingValue = incomingRow[column];
    const conflictingPopulatedValue = normalizeEmpty(existingValue) !== null
      && valuesDiffer(column, existingValue, incomingValue);

    if (staleSnapshot) {
      if (conflictingPopulatedValue) protectedColumns.push(column);
      row[column] = existingValue;
      continue;
    }

    // Status is monotonic even if a user supplies a newer export timestamp:
    // Shopee may correct other fields later, but a completed order must not
    // become shipped again in the current-state RAW row.
    const statusRegression = column === 'status_pesanan'
      && isStatusRegression(existingRow.status_pesanan, incomingRow.status_pesanan);

    // The Order.all export does not carry a trustworthy export timestamp. When
    // status is unchanged, two populated but different values are ambiguous:
    // preserve the current DB value until we can prove the incoming snapshot is
    // newer. This prevents an old overlap report from silently rewriting RAW.
    if (statusRegression
      || isQualityDowngrade(existingValue, incomingValue)
      || (conflictingPopulatedValue && !incomingProvenFresher)) {
      if (conflictingPopulatedValue) protectedColumns.push(column);
      row[column] = existingValue;
    }
  }

  return {
    row,
    protectedColumns,
    staleSnapshot,
    staleBySnapshotAt,
    staleByStatus,
    incomingProvenFresher,
  };
}

function shouldAllowImport({ newRows, changedRows }) {
  return newRows > 0 || changedRows > 0;
}

module.exports = {
  ORDER_ALL_HEADERS,
  parseIdr,
  parseSnapshotAt,
  resolveOrderSnapshot,
  shouldAllowImport,
  validateOrderAllCompositeKeys,
  validateOrderAllHeaders,
};
