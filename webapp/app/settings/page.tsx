'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Database, Trash2, AlertTriangle, RefreshCw, CheckCircle } from 'lucide-react';
import { useStore } from '@/components/StoreContext';

interface TableInfo {
  name: string;
  rows: number;
  scope: 'store' | 'shared';
}

export default function SettingsPage() {
  const { storeId, activeStore, loading: storeLoading } = useStore();
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [confirmedStoreId, setConfirmedStoreId] = useState<string | null>(null);
  const [loadedStoreId, setLoadedStoreId] = useState<string | null>(null);
  const requestSequence = useRef(0);

  const fetchTables = useCallback(async () => {
    if (!storeId) {
      setTables([]);
      setLoading(false);
      return;
    }

    const requestId = ++requestSequence.current;
    setLoading(true);
    try {
      const res = await fetch(`/api/settings/database?storeId=${encodeURIComponent(storeId)}`, { cache: 'no-store' });
      const data = await res.json();
      if (requestId !== requestSequence.current) return;
      if (!res.ok || !data.success) throw new Error(data.error || 'Gagal memuat data database.');
      setTables(data.tables || []);
      setLoadedStoreId(storeId);
    } catch (cause) {
      if (requestId === requestSequence.current) setMessage({ type: 'error', text: cause instanceof Error ? cause.message : 'Gagal memuat data database.' });
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setConfirmedStoreId(null);
      void fetchTables();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      requestSequence.current += 1;
    };
  }, [fetchTables]);

  const clearStore = async () => {
    if (!confirmedStoreId || confirmedStoreId !== storeId) return;
    const targetStoreId = confirmedStoreId;
    const operationStoreId = targetStoreId;
    setClearing(true);
    setMessage(null);
    try {
      const res = await fetch('/api/settings/database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear_store', storeId: operationStoreId, confirmation: true }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Clear data toko gagal.');
      setMessage({ type: 'success', text: data.message });
      setConfirmedStoreId(null);
      if (storeId === targetStoreId) await fetchTables();
    } catch (cause) {
      setMessage({ type: 'error', text: cause instanceof Error ? cause.message : 'Clear data toko gagal.' });
    } finally {
      setClearing(false);
    }
  };

  const storeTables = tables.filter(table => table.scope === 'store');
  const sharedTables = tables.filter(table => table.scope === 'shared');
  const totalRows = tables.reduce((sum, table) => sum + table.rows, 0);
  const storeRows = storeTables.reduce((sum, table) => sum + table.rows, 0);
  const isCurrentStoreData = loadedStoreId === storeId;

  return (
    <div className="p-4 lg:p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-1 text-2xl font-bold text-slate-900 lg:text-3xl">Settings</h1>
        <p className="mb-6 text-sm text-slate-600">Database management berdasarkan toko aktif</p>

        {message && (
          <div className={`mb-4 flex items-center gap-2 rounded-lg border p-3 text-sm ${
            message.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}>
            {message.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {message.text}
          </div>
        )}

        <div className="mb-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 p-4">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-slate-500" />
              <div>
                <h2 className="text-base font-semibold text-slate-900">Database Management</h2>
                <p className="text-xs text-slate-500">
                  Toko aktif: <strong>{activeStore?.store_name || 'Belum dipilih'}</strong>
                </p>
              </div>
            </div>
            <button
              onClick={() => void fetchTables()}
              disabled={loading || storeLoading || !storeId}
              className="flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {loading || storeLoading ? (
            <div className="p-8 text-center text-sm text-slate-400">Memuat data toko...</div>
          ) : message?.type === 'error' ? null : !isCurrentStoreData ? (
            <div className="p-8 text-center text-sm text-slate-400">Memuat data toko...</div>
          ) : !storeId ? (
            <div className="p-8 text-center text-sm text-slate-400">Pilih toko aktif terlebih dahulu.</div>
          ) : (
            <>
              <div className="divide-y divide-slate-100">
                {tables.map(table => (
                  <div key={table.name} className="flex items-center justify-between gap-3 p-3 lg:p-4">
                    <div className="min-w-0">
                      <div className="font-mono text-sm font-medium text-slate-900">{table.name}</div>
                      <div className="text-xs text-slate-500">
                        {table.rows.toLocaleString('id-ID')} rows · {table.scope === 'store' ? 'data toko aktif' : 'master shared'}
                      </div>
                    </div>
                    <span className={`flex-shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${
                      table.scope === 'store' ? 'bg-purple-50 text-purple-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {table.scope === 'store' ? 'Store-scoped' : 'Shared'}
                    </span>
                  </div>
                ))}
              </div>

              <div className="border-t border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
                  <span>
                    Total: <strong>{tables.length}</strong> tables · <strong>{totalRows.toLocaleString('id-ID')}</strong> rows
                  </span>
                  <span>
                    Data toko: <strong>{storeRows.toLocaleString('id-ID')}</strong> rows
                  </span>
                </div>

                {confirmedStoreId === storeId ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                    <span className="text-xs text-red-600">
                      Hapus semua data operasional <strong>{activeStore?.store_name}</strong>? Master SKU shared tetap aman.
                    </span>
                    <button
                      onClick={() => void clearStore()}
                      disabled={clearing}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-xs text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {clearing ? 'Menghapus...' : 'Ya, Hapus Data Toko'}
                    </button>
                    <button
                      onClick={() => setConfirmedStoreId(null)}
                      disabled={clearing}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-white disabled:opacity-50"
                    >
                      Batal
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmedStoreId(storeId)}
                    disabled={storeRows === 0 || clearing || storeLoading || !storeId}
                    className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Trash2 className="h-4 w-4" />
                    Clear Data Toko Aktif
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 lg:p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
            <div>
              <p className="mb-1 font-semibold">Batas clear data</p>
              <p>
                Tombol clear hanya menghapus Order.all dan package Income milik toko aktif. Master SKU shared tidak ikut dihapus.
                {sharedTables.length > 0 ? ` ${sharedTables.length} tabel shared tetap dipertahankan.` : ''}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
