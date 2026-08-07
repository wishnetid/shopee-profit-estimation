import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseIdr,
  validateOrderAllHeaders,
  shouldAllowImport,
} from '../lib/order-all-import.js';

test('parseIdr parses Shopee dot-thousands currency without losing three zeroes', () => {
  assert.equal(parseIdr('82.500'), 82500);
  assert.equal(parseIdr('1.234.567'), 1234567);
  assert.equal(parseIdr('0'), 0);
});

test('parseIdr accepts decimal comma and rejects malformed currency', () => {
  assert.equal(parseIdr('1.234,50'), 1234.5);
  assert.equal(parseIdr('-8.000'), -8000);
  assert.equal(parseIdr('-'), null);
  assert.equal(parseIdr('not-a-number'), null);
});

test('validateOrderAllHeaders accepts the exact expected Shopee Order.all export schema', () => {
  const headers = [
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

  assert.deepEqual(validateOrderAllHeaders(headers), { valid: true, missing: [], unexpected: [] });
});

test('validateOrderAllHeaders rejects a changed export schema before import', () => {
  const result = validateOrderAllHeaders(['No. Pesanan', 'Nama Produk']);

  assert.equal(result.valid, false);
  assert.ok(result.missing.includes('Status Pesanan'));
});

test('shouldAllowImport permits an update-only snapshot', () => {
  assert.equal(shouldAllowImport({ newRows: 0, changedRows: 3 }), true);
  assert.equal(shouldAllowImport({ newRows: 2, changedRows: 0 }), true);
  assert.equal(shouldAllowImport({ newRows: 0, changedRows: 0 }), false);
});
