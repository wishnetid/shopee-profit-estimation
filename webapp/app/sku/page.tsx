'use client';

import { useEffect, useState } from 'react';
import DataTable from '@/components/DataTable';

const SKU_COLUMNS = [
  { key: 'source_excel_row', label: 'Row Excel' },
  { key: 'sku1', label: 'SKU1' },
  { key: 'sku2', label: 'SKU2' },
  { key: 'harga', label: 'Harga RAW (Rp)' },
  { key: 'idproduk', label: 'IDPRODUK' },
];

export default function SKUPage() {
  const [payload, setPayload] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [importId, setImportId] = useState('');

  const load = async (
    page = 1,
    limit = 50,
    search: string[] = [],
    sortColumn?: string,
    sortDirection?: 'asc' | 'desc',
    nextImportId = importId,
  ) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (nextImportId) params.set('importId', nextImportId);
      if (search.length) params.set('search', search.join('||'));
      if (sortColumn && sortDirection) {
        params.set('sort', sortColumn);
        params.set('direction', sortDirection);
      }
      const response = await fetch(`/api/sku?${params}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Gagal memuat SKU RAW.');
      setPayload(result);
      if (result.selectedImport && !nextImportId) setImportId(String(result.selectedImport.id));
    } catch (err: any) {
      setError(err.message || 'Gagal memuat SKU RAW.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const selectImport = (nextImportId: string) => {
    setImportId(nextImportId);
    load(1, 50, [], undefined, undefined, nextImportId);
  };

  const selected = payload?.selectedImport;
  const rows = payload?.data || [];

  return (
    <div className="p-4 lg:p-8">
      <div className="mb-4 lg:mb-6">
        <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 mb-1">SKU Master RAW</h1>
        <p className="text-sm text-slate-600">Paket master SKU disimpan apa adanya. Mapping HPP dan kalkulasi profit belum diterapkan.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Paket SKU yang ditampilkan</label>
        <select value={importId} onChange={(event) => selectImport(event.target.value)} className="w-full max-w-2xl border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">Paket terbaru</option>
          {(payload?.imports || []).map((item: any) => (
            <option key={item.id} value={item.id}>{item.source_file} · {item.sheet_name}</option>
          ))}
        </select>
      </div>

      {selected && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div className="bg-white border border-slate-200 rounded-xl p-3"><div className="text-xs text-slate-500">Row RAW</div><div className="font-bold text-slate-900">{payload.total?.toLocaleString('id-ID') || 0}</div></div>
          <div className="bg-white border border-slate-200 rounded-xl p-3"><div className="text-xs text-slate-500">Sheet sumber</div><div className="font-bold text-slate-900 truncate">{selected.sheet_name}</div></div>
          <div className="bg-white border border-slate-200 rounded-xl p-3"><div className="text-xs text-slate-500">SHA-256</div><div className="font-mono text-xs text-slate-700 truncate">{selected.source_sha256}</div></div>
        </div>
      )}

      {error && <div className="p-3 mb-4 text-sm rounded-lg bg-red-50 border border-red-200 text-red-700">{error}</div>}
      {loading && !payload ? (
        <div className="bg-white rounded-lg border border-slate-200 p-12 text-center text-slate-400 text-sm">Memuat SKU RAW...</div>
      ) : !selected ? (
        <div className="bg-white rounded-lg border border-slate-200 p-12 text-center text-slate-500 text-sm">Belum ada paket SKU RAW. Upload <code>master.xlsx</code> melalui Upload Manager terlebih dahulu.</div>
      ) : (
        <DataTable
          columns={SKU_COLUMNS}
          data={rows}
          totalRows={payload.total || 0}
          onPageChange={(page, limit) => load(page, limit)}
          onSearch={(queries) => load(1, 50, queries)}
          onSort={(column, direction) => load(1, 50, [], column, direction)}
        />
      )}
    </div>
  );
}
