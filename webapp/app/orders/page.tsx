'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import DataTable from '@/components/DataTable';
import { useStore } from '@/components/StoreContext';

// Seluruh kolom bisnis dari export Order.all. Metadata internal DB tidak ditampilkan.
const ORDER_COLUMNS = [
  ['no_pesanan','No. Pesanan'],['status_pesanan','Status Pesanan'],['alasan_pembatalan','Alasan Pembatalan'],['status_pembatalan_pengembalian','Status Pembatalan/Pengembalian'],['no_resi','No. Resi'],['opsi_pengiriman','Opsi Pengiriman'],['antar_ke_counter','Antar ke counter/pick-up'],['pesanan_harus_dikirim_sebelum','Pesanan Harus Dikirimkan Sebelum'],['waktu_pengiriman_diatur','Waktu Pengiriman Diatur'],['waktu_pesanan_dibuat','Waktu Pesanan Dibuat'],['waktu_pembayaran_dilakukan','Waktu Pembayaran Dilakukan'],['tipe_pesanan','Tipe Pesanan'],['metode_pembayaran','Metode Pembayaran'],['sku_induk','SKU Induk'],['nama_produk','Nama Produk'],['nomor_referensi_sku','Nomor Referensi SKU'],['nama_variasi','Nama Variasi'],['harga_awal','Harga Awal'],['harga_setelah_diskon','Harga Setelah Diskon'],['jumlah','Jumlah'],['returned_quantity','Returned quantity'],['subtotal_pesanan','Subtotal Pesanan'],['total_diskon','Total Diskon'],['diskon_dari_penjual','Diskon Dari Penjual'],['diskon_dari_shopee','Diskon Dari Shopee'],['berat_produk','Berat Produk'],['jumlah_produk_di_pesan','Jumlah Produk di Pesan'],['total_berat','Total Berat'],['voucher_ditanggung_penjual','Voucher Ditanggung Penjual'],['cashback_koin','Cashback Koin'],['voucher_ditanggung_shopee','Voucher Ditanggung Shopee'],['paket_diskon','Paket Diskon'],['paket_diskon_shopee','Paket Diskon (Diskon dari Shopee)'],['paket_diskon_penjual','Paket Diskon (Diskon dari Penjual)'],['potongan_koin_shopee','Potongan Koin Shopee'],['diskon_kartu_kredit','Diskon Kartu Kredit'],['ongkos_kirim_dibayar_pembeli','Ongkos Kirim Dibayar oleh Pembeli'],['estimasi_potongan_biaya_pengiriman','Estimasi Potongan Biaya Pengiriman'],['ongkos_kirim_pengembalian_barang','Ongkos Kirim Pengembalian Barang'],['total_pembayaran','Total Pembayaran'],['perkiraan_ongkos_kirim','Perkiraan Ongkos Kirim'],['catatan_dari_pembeli','Catatan dari Pembeli'],['catatan','Catatan'],['username_pembeli','Username (Pembeli)'],['nama_penerima','Nama Penerima'],['no_telepon','No. Telepon'],['alamat_pengiriman','Alamat Pengiriman'],['kota_kabupaten','Kota/Kabupaten'],['provinsi','Provinsi'],['waktu_pesanan_selesai','Waktu Pesanan Selesai'],
].map(([key,label]) => ({ key, label }));

export default function OrdersPage() {
  const { storeId, activeStore, loading: storeLoading } = useStore();
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadedStoreId, setLoadedStoreId] = useState<string | null>(null);
  const requestSequence = useRef(0);

  const fetchData = useCallback(async (
    page = 1,
    limit = 50,
    search: string[] = [],
    sortColumn?: string,
    sortDirection?: 'asc' | 'desc',
  ) => {
    const requestId = ++requestSequence.current;
    if (!storeId) { setData([]); setTotalRows(0); setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ storeId, page: String(page), limit: String(limit) });
      if (search.length > 0) params.append('search', search.join('||'));
      if (sortColumn && sortDirection) { params.append('sort', sortColumn); params.append('direction', sortDirection); }
      const response = await fetch(`/api/orders?${params}`, { cache: 'no-store' });
      const result = await response.json();
      if (requestId !== requestSequence.current) return;
      if (!response.ok) throw new Error(result.error || 'Gagal memuat Order.all.');
      setData(result.data || []); setTotalRows(Number(result.total || 0)); setLoadedStoreId(storeId);
    } catch (cause) {
      if (requestId === requestSequence.current) setError(cause instanceof Error ? cause.message : 'Gagal memuat Order.all.');
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setData([]);
      setTotalRows(0);
      setError('');
      void fetchData();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      requestSequence.current += 1;
    };
  }, [fetchData]);

  const isCurrentStoreData = loadedStoreId === storeId;

  return (
    <div className="p-4 lg:p-8">
      <div className="mb-4 lg:mb-6">
        <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 mb-1">Order All</h1>
        <p className="text-sm text-slate-600">Data Order.all toko {activeStore?.store_name || 'aktif'} dengan filter, search, dan sort.</p>
      </div>
      {storeLoading || loading ? <div className="bg-white rounded-lg border border-slate-200 p-12 text-center text-slate-400 text-sm">Memuat data toko…</div> : error ? <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">{error}</div> : !isCurrentStoreData ? <div className="bg-white rounded-lg border border-slate-200 p-12 text-center text-slate-400 text-sm">Memuat data toko…</div> : (
        <DataTable
          key={storeId}
          columns={ORDER_COLUMNS}
          data={data}
          totalRows={totalRows}
          boundedScroll
          onPageChange={(page, limit) => void fetchData(page, limit)}
          onSearch={(queries) => void fetchData(1, 50, queries)}
          onSort={(column, direction) => void fetchData(1, 50, [], column, direction)}
        />
      )}
    </div>
  );
}
