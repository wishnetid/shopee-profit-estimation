'use client';

import { useState, useEffect } from 'react';
import DataTable from '@/components/DataTable';

const SKU_COLUMNS = [
  { key: 'sku1', label: 'SKU1' },
  { key: 'sku2', label: 'SKU2' },
  { key: 'harga', label: 'HPP (Rp)' },
  { key: 'idproduk', label: 'ID Produk' },
];

export default function SKUPage() {
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
      const response = await fetch(`/api/sku?${params}`);
      const result = await response.json();
      if (result.success) {
        setData(result.data);
        setTotalRows(result.total);
      }
    } catch (error) {
      console.error('Failed to fetch SKU:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  return (
    <div className="p-4 lg:p-8">
      <div className="mb-4 lg:mb-6">
        <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 mb-1">SKU Master</h1>
        <p className="text-sm text-slate-600">Master SKU untuk mapping HPP pada profit calculation</p>
      </div>
      {loading && data.length === 0 ? (
        <div className="bg-white rounded-lg border border-slate-200 p-12 text-center">
          <div className="text-slate-400 text-sm">Loading...</div>
        </div>
      ) : (
        <DataTable
          columns={SKU_COLUMNS}
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
