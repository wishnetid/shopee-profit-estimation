'use client';

import { useState, useEffect } from 'react';
import DataTable from '@/components/DataTable';

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
  const [data, setData] = useState([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchData = async (
    page: number = 1,
    limit: number = 50,
    search: string[] = [],
    sortColumn?: string,
    sortDirection?: 'asc' | 'desc'
  ) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search.length > 0) params.append('search', search.join('||'));
      if (sortColumn && sortDirection) {
        params.append('sort', sortColumn);
        params.append('direction', sortDirection);
      }
      const response = await fetch(`/api/orders?${params}`);
      const result = await response.json();
      if (result.success) {
        setData(result.data);
        setTotalRows(result.total);
      }
    } catch (error) {
      console.error('Failed to fetch orders:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  return (
    <div className="p-4 lg:p-8">
      <div className="mb-4 lg:mb-6">
        <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 mb-1">Order All</h1>
        <p className="text-sm text-slate-600">Data Order.all dengan filter, search, dan sort</p>
      </div>
      {loading && data.length === 0 ? (
        <div className="bg-white rounded-lg border border-slate-200 p-12 text-center">
          <div className="text-slate-400 text-sm">Loading...</div>
        </div>
      ) : (
        <DataTable
          columns={ORDER_COLUMNS}
          data={data}
          totalRows={totalRows}
          onPageChange={(page, limit) => fetchData(page, limit)}
          onSearch={(queries) => fetchData(1, 50, queries)}
          onSort={(column, direction) => fetchData(1, 50, [], column, direction)}
        />
      )}
    </div>
  );
}
