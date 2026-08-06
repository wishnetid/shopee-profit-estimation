'use client';

import { useState, useEffect } from 'react';
import DataTable from '@/components/DataTable';

const INCOME_COLUMNS = [
  { key: 'no_pesanan', label: 'No. Pesanan' },
  { key: 'tanggal_dana_dilepaskan', label: 'Tgl Dana Dilepas' },
  { key: 'harga_produk', label: 'Harga Produk' },
  { key: 'biaya_administrasi', label: 'Biaya Admin' },
  { key: 'biaya_proses_pesanan', label: 'Biaya Proses' },
  { key: 'biaya_gratis_ongkir_xtra', label: 'Biaya XTRA' },
  { key: 'biaya_layanan_promo_xtra', label: 'Biaya Promo' },
  { key: 'username_pembeli', label: 'Pembeli' },
];

export default function IncomePage() {
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
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });

      if (search.length > 0) {
        params.append('search', search.join('||'));
      }

      if (sortColumn && sortDirection) {
        params.append('sort', sortColumn);
        params.append('direction', sortDirection);
      }

      const response = await fetch(`/api/income?${params}`);
      const result = await response.json();

      if (result.success) {
        setData(result.data);
        setTotalRows(result.total);
      }
    } catch (error) {
      console.error('Failed to fetch income:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Income Penghasilan</h1>
        <p className="text-slate-600">
          Data Income dengan breakdown fee dan net payout
        </p>
      </div>

      {loading && data.length === 0 ? (
        <div className="bg-white rounded-lg border border-slate-200 p-12 text-center">
          <div className="text-slate-500">Loading data...</div>
        </div>
      ) : (
        <DataTable
          columns={INCOME_COLUMNS}
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
