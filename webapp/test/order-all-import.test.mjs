import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

import orderAllImport from '../lib/order-all-import.js';

const {
  getOrderAllCompositeKeyFromExcelRow,
  parseIdr,
  parseSnapshotAt,
  resolveEffectiveSkuIdentity,
  resolveOrderSnapshot,
  validateOrderAllCompositeKeys,
  validateOrderAllHeaders,
  shouldAllowImport,
} = orderAllImport;

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

test('validateOrderAllCompositeKeys accepts repeated physical lines within one Shopee upload', () => {
  const row = {
    'No. Pesanan': 'ORDER-1',
    'Nomor Referensi SKU': 'SKU-1',
    'Nama Variasi': 'Hitam,XL',
    'Harga Setelah Diskon': '82.500',
  };
  const result = validateOrderAllCompositeKeys([row, { ...row }]);

  assert.equal(result.valid, true);
  assert.equal(result.missingCount, 0);
});

test('Order.all identity uses SKU Induk only when Nomor Referensi SKU is blank', () => {
  const fallbackOnly = {
    'No. Pesanan': 'ORDER-FALLBACK',
    'SKU Induk': 'MTAC PENDEK',
    'Nomor Referensi SKU': '',
    'Nama Variasi': 'Hitam,XL',
    'Harga Setelah Diskon': '82.500',
  };
  const referencePreferred = {
    ...fallbackOnly,
    'Nomor Referensi SKU': 'SKU-REFERENCE',
  };

  assert.equal(resolveEffectiveSkuIdentity({ nomorReferensiSku: '', skuInduk: 'MTAC PENDEK' }), 'MTAC PENDEK');
  assert.equal(resolveEffectiveSkuIdentity({ nomorReferensiSku: 'SKU-REFERENCE', skuInduk: 'MTAC PENDEK' }), 'SKU-REFERENCE');
  assert.equal(resolveEffectiveSkuIdentity({ nomorReferensiSku: '', skuInduk: '' }), null);
  assert.equal(validateOrderAllCompositeKeys([fallbackOnly]).valid, true);
  assert.match(getOrderAllCompositeKeyFromExcelRow(fallbackOnly), /MTAC PENDEK/);
  assert.match(getOrderAllCompositeKeyFromExcelRow(referencePreferred), /SKU-REFERENCE/);
});

test('Order.all local TACTICALIST and TACTICALUXE samples validate with SKU Induk fallback', () => {
  const base = path.resolve(process.cwd(), 'sampling_for_profit_aktual/new_sampling_26-09-2026');
  for (const store of ['tacticalist', 'tacticaluxe']) {
    for (const month of ['20260601_20260630', '20260701_20260731', '20260801_20260831', '20260901_20260927']) {
      const workbook = XLSX.readFile(path.join(base, store, `Order.all.${month}.xlsx`));
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets.orders, { defval: null });
      const result = validateOrderAllCompositeKeys(rows);
      assert.equal(result.valid, true, `${store}/${month}: ${result.missingSamples.join(', ')}`);
    }
  }
});

test('Order.all rejects a row when both SKU identity columns are blank', () => {
  const row = {
    'No. Pesanan': 'ORDER-MISSING-SKU',
    'SKU Induk': '',
    'Nomor Referensi SKU': '',
    'Nama Variasi': 'Hitam,XL',
    'Harga Setelah Diskon': '82.500',
  };
  const result = validateOrderAllCompositeKeys([row]);
  assert.equal(result.valid, false);
  assert.deepEqual(result.missingSamples, [2]);
});

test('parseSnapshotAt rejects impossible calendar timestamps', () => {
  assert.equal(parseSnapshotAt('2099-99-99 99:99:00'), null);
  assert.equal(parseSnapshotAt('2026-02-30 10:00:00'), null);
  assert.equal(parseSnapshotAt('2026-08-07 19:01:00'), '2026-08-07 19:01:00');
});

test('shouldAllowImport permits an update-only snapshot', () => {
  assert.equal(shouldAllowImport({ newRows: 0, changedRows: 3 }), true);
  assert.equal(shouldAllowImport({ newRows: 2, changedRows: 0 }), true);
  assert.equal(shouldAllowImport({ newRows: 0, changedRows: 0 }), false);
});

test('resolveOrderSnapshot preserves all populated fields from a stale lower-status snapshot', () => {
  const existing = {
    no_pesanan: 'ORDER-1',
    nomor_referensi_sku: 'SKU-1',
    nama_variasi: 'Hitam,XL',
    status_pesanan: 'Selesai',
    no_resi: 'SPXID123',
    waktu_pesanan_selesai: '2026-08-06 23:10:00',
    alamat_pengiriman: 'Jalan Lengkap No. 10, Bandung',
    total_pembayaran: 82500,
  };
  const staleIncoming = {
    ...existing,
    status_pesanan: 'Telah Dikirim',
    waktu_pesanan_selesai: null,
    alamat_pengiriman: '****** No. 10, Bandung',
    total_pembayaran: 80000,
  };

  const result = resolveOrderSnapshot(existing, staleIncoming, Object.keys(existing));

  assert.equal(result.staleSnapshot, true);
  assert.equal(result.row.status_pesanan, 'Selesai');
  assert.equal(result.row.no_resi, 'SPXID123');
  assert.equal(result.row.waktu_pesanan_selesai, '2026-08-06 23:10:00');
  assert.equal(result.row.alamat_pengiriman, 'Jalan Lengkap No. 10, Bandung');
  assert.equal(result.row.total_pembayaran, 82500);
  assert.deepEqual(
    result.protectedColumns.sort(),
    ['alamat_pengiriman', 'status_pesanan', 'total_pembayaran', 'waktu_pesanan_selesai'].sort(),
  );
});

test('resolveOrderSnapshot preserves populated fields when equal-status incoming snapshot is blank or masked', () => {
  const existing = {
    status_pesanan: 'Selesai',
    no_resi: 'SPXID123',
    waktu_pesanan_selesai: '2026-08-06 23:10:00',
    alamat_pengiriman: 'Jalan Lengkap No. 10, Bandung',
  };
  const incoming = {
    status_pesanan: 'Selesai',
    no_resi: '',
    waktu_pesanan_selesai: null,
    alamat_pengiriman: '****** No. 10, Bandung',
  };

  const result = resolveOrderSnapshot(existing, incoming, Object.keys(existing));

  assert.equal(result.staleSnapshot, false);
  assert.deepEqual(result.row, existing);
  assert.deepEqual(
    result.protectedColumns.sort(),
    ['alamat_pengiriman', 'no_resi', 'waktu_pesanan_selesai'].sort(),
  );
});

test('resolveOrderSnapshot treats DB decimal and timestamp formats as equal values', () => {
  const existing = {
    status_pesanan: 'Selesai',
    total_pembayaran: '82500.00',
    waktu_pesanan_selesai: '2026-08-07 11:33:00',
  };
  const incoming = {
    status_pesanan: 'Selesai',
    total_pembayaran: 82500,
    waktu_pesanan_selesai: '2026-08-07 11:33',
  };

  const result = resolveOrderSnapshot(existing, incoming, Object.keys(existing));

  assert.deepEqual(result.protectedColumns, []);
});

test('resolveOrderSnapshot protects conflicting equal-status values until a newer snapshot timestamp proves freshness', () => {
  const existing = {
    status_pesanan: 'Selesai',
    alamat_pengiriman: 'Alamat sebelumnya, Bandung',
    total_pembayaran: 82500,
  };
  const incoming = {
    status_pesanan: 'Selesai',
    alamat_pengiriman: 'Alamat konflik, Bandung',
    total_pembayaran: 80000,
  };

  const result = resolveOrderSnapshot(existing, incoming, Object.keys(existing));

  assert.equal(result.staleSnapshot, false);
  assert.deepEqual(result.row, existing);
  assert.deepEqual(result.protectedColumns.sort(), ['alamat_pengiriman', 'total_pembayaran'].sort());
});

test('resolveOrderSnapshot blocks a timestamp-older snapshot even when status is unchanged and fields are populated', () => {
  const existing = {
    status_pesanan: 'Selesai',
    alamat_pengiriman: 'Alamat terbaru lengkap, Bandung',
    total_pembayaran: 82500,
    source_snapshot_at: '2026-08-07 19:01:00',
  };
  const incoming = {
    status_pesanan: 'Selesai',
    alamat_pengiriman: 'Alamat lama lengkap, Bandung',
    total_pembayaran: 80000,
    source_snapshot_at: '2026-08-06 12:58:00',
  };

  const result = resolveOrderSnapshot(existing, incoming, Object.keys(existing));

  assert.equal(result.staleSnapshot, true);
  assert.equal(result.staleBySnapshotAt, true);
  assert.deepEqual(result.row, existing);
});

test('resolveOrderSnapshot never lets a status move backward even when incoming snapshot time is newer', () => {
  const existing = {
    status_pesanan: 'Selesai',
    alamat_pengiriman: 'Alamat lama, Bandung',
    source_snapshot_at: '2026-08-07 19:01:00',
  };
  const incoming = {
    status_pesanan: 'Telah Dikirim',
    alamat_pengiriman: 'Alamat terkoreksi, Bandung',
    source_snapshot_at: '2026-08-08 09:00:00',
  };

  const result = resolveOrderSnapshot(existing, incoming, Object.keys(existing));

  assert.equal(result.staleSnapshot, false);
  assert.equal(result.row.status_pesanan, 'Selesai');
  assert.equal(result.row.alamat_pengiriman, 'Alamat terkoreksi, Bandung');
  assert.ok(result.protectedColumns.includes('status_pesanan'));
});

test('resolveOrderSnapshot accepts a forward snapshot with new populated values', () => {
  const existing = {
    status_pesanan: 'Telah Dikirim',
    no_resi: 'SPXID123',
    waktu_pesanan_selesai: null,
    alamat_pengiriman: 'Jalan Lama No. 10, Bandung',
    total_pembayaran: 80000,
  };
  const incoming = {
    status_pesanan: 'Selesai',
    no_resi: 'SPXID123',
    waktu_pesanan_selesai: '2026-08-07 11:33:00',
    alamat_pengiriman: 'Jalan Baru No. 12, Bandung',
    total_pembayaran: 82500,
  };

  const result = resolveOrderSnapshot(existing, incoming, Object.keys(existing));

  assert.equal(result.staleSnapshot, false);
  assert.deepEqual(result.row, incoming);
  assert.deepEqual(result.protectedColumns, []);
});
