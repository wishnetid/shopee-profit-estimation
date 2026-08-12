'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import DataTable from '@/components/DataTable';
import { useStore } from '@/components/StoreContext';

type Column = { key: string; label: string };
type Filter = { key: string; label: string };
type ImportRow = Record<string, unknown>;
type RawPayload = {
  storeId: number;
  packageCount: number;
  total: number;
  data: Record<string, unknown>[];
  imports?: ImportRow[];
};

type RawReportPageProps = {
  title: string;
  description: string;
  reportType: string;
  columns: Column[];
  filters?: Filter[];
  importHistory?: boolean;
  importHistoryColumns?: Column[];
};

const DEFAULT_IMPORT_COLUMNS: Column[] = [
  { key: 'id', label: 'Import ID' },
  { key: 'source_file', label: 'Source File' },
  { key: 'report_period_from', label: 'Periode Dari' },
  { key: 'report_period_to', label: 'Periode Sampai' },
  { key: 'source_sha256', label: 'SHA-256' },
  { key: 'imported_at', label: 'Di-import' },
];

export default function RawReportPage({
  title,
  description,
  reportType,
  columns,
  filters = [],
  importHistory = false,
  importHistoryColumns = DEFAULT_IMPORT_COLUMNS,
}: RawReportPageProps) {
  const { storeId, activeStore } = useStore();
  const [data, setData] = useState<RawPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [showImportHistory, setShowImportHistory] = useState(false);
  const filtersRef = useRef<Record<string, string>>({});
  const sequence = useRef(0);

  const load = useCallback(async (page = 1, limit = 50, search = '', sort = 'imported_at', direction = 'desc', nextFilters = filtersRef.current) => {
    const requestId = ++sequence.current;
    await Promise.resolve();
    if (!storeId) {
      if (requestId === sequence.current) {
        setData(null);
        setLoading(false);
      }
      return;
    }
    setLoading(true);
    setError('');
    setData(null);
    try {
      const params = new URLSearchParams({ storeId, reportType, page: String(page), limit: String(limit), sort, direction });
      if (search) params.set('search', search);
      Object.entries(nextFilters).forEach(([key, value]) => {
        if (value.trim()) params.set(key, value.trim());
      });
      const response = await fetch(`/api/raw?${params}`);
      const body = await response.json() as RawPayload & { error?: string };
      if (requestId !== sequence.current) return;
      if (!response.ok) throw new Error(body.error || 'Gagal memuat RAW report.');
      setData(body);
    } catch (caught: unknown) {
      if (requestId === sequence.current) setError(caught instanceof Error ? caught.message : 'Gagal memuat RAW report.');
    } finally {
      if (requestId === sequence.current) setLoading(false);
    }
  }, [reportType, storeId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => {
      window.clearTimeout(timer);
      sequence.current += 1;
    };
  }, [load]);

  const applyFilters = () => void load(1, 50, '', 'imported_at', 'desc', filterValues);
  const showTransactions = !importHistory || !showImportHistory;

  return (
    <div className="p-4 lg:p-8">
      <div className="mb-5">
        <h1 className="text-2xl lg:text-3xl font-bold text-slate-900">{title}</h1>
        <p className="text-sm text-slate-600 mt-1">{description} Toko aktif: {activeStore?.store_name || '—'}.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 text-sm text-slate-600">
        <b className="text-slate-800">{data?.packageCount || 0}</b> package RAW · <b className="text-slate-800">{data?.total || 0}</b> row. Nilai source tidak dihitung sebagai profit.
      </div>

      {importHistory && (
        <div className="mb-4 flex gap-2 border-b border-slate-200">
          <button onClick={() => setShowImportHistory(false)} className={`px-3 py-2 text-sm font-medium border-b-2 ${showTransactions ? 'border-purple-600 text-purple-700' : 'border-transparent text-slate-500'}`}>Transactions</button>
          <button onClick={() => setShowImportHistory(true)} className={`px-3 py-2 text-sm font-medium border-b-2 ${showImportHistory ? 'border-purple-600 text-purple-700' : 'border-transparent text-slate-500'}`}>Import History</button>
        </div>
      )}

      {showTransactions && filters.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {filters.map((filter) => (
            <label key={filter.key} className="text-xs font-medium text-slate-700">
              {filter.label}
              <input
                value={filterValues[filter.key] || ''}
                onChange={(event) => {
                  const next = { ...filterValues, [filter.key]: event.target.value };
                  filtersRef.current = next;
                  setFilterValues(next);
                }}
                onKeyDown={(event) => { if (event.key === 'Enter') applyFilters(); }}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
              />
            </label>
          ))}
          <div className="flex items-end">
            <button onClick={applyFilters} className="w-full rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-700">Terapkan Filter</button>
          </div>
        </div>
      )}

      {error && <div className="p-3 mb-4 text-sm rounded-lg bg-red-50 border border-red-200 text-red-700">{error}</div>}
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">Memuat RAW report...</div>
      ) : data && String(data.storeId) === storeId ? (
        showTransactions ? (
          <DataTable
            key={`${storeId}-${reportType}`}
            columns={columns}
            data={data.data || []}
            totalRows={data.total || 0}
            onPageChange={(page, limit) => void load(page, limit)}
            onSearch={(queries) => void load(1, 50, queries.join('||'))}
            onSort={(column, direction) => void load(1, 50, '', column, direction)}
          />
        ) : (
          <DataTable
            key={`${storeId}-${reportType}-imports`}
            columns={importHistoryColumns}
            data={data.imports || []}
            totalRows={data.imports?.length || 0}
            onPageChange={() => undefined}
            onSearch={() => undefined}
            onSort={() => undefined}
          />
        )
      ) : null}
    </div>
  );
}
