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

function shouldAllowImport({ newRows, changedRows }) {
  return newRows > 0 || changedRows > 0;
}

module.exports = {
  ORDER_ALL_HEADERS,
  parseIdr,
  shouldAllowImport,
  validateOrderAllHeaders,
};
