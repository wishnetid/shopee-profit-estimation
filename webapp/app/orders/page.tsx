'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import DataTable from '@/components/DataTable';
import { useStore } from '@/components/StoreContext';

const ORDER_COLUMNS = [
  { key: 'no_pesanan', label: 'No. Pesanan' },
  { key: 'status_pesanan', label: 'Status' },
  { key: 'nama_produk', label: 'Produk' },
  { key: 'nomor_referensi_sku', label: 'SKU' },
  { key: 'jumlah', label: 'Qty' },
  { key: 'total_pembayaran', label: 'Total' },
  { key: 'waktu_pesanan_dibuat', label: 'Waktu' },
  { key: 'username_pembeli', label: 'Pembeli' },
];

export default function OrdersPage() {
  const { storeId, activeStore, loading: storeLoading } = useStore();
  const [data, setData] = useState<any[]>([]);
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
          onPageChange={(page, limit) => void fetchData(page, limit)}
          onSearch={(queries) => void fetchData(1, 50, queries)}
          onSort={(column, direction) => void fetchData(1, 50, [], column, direction)}
        />
      )}
    </div>
  );
}
