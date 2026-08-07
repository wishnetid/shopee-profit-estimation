'use client';

import { useState, useEffect } from 'react';
import { Database, Trash2, AlertTriangle, RefreshCw, CheckCircle } from 'lucide-react';

interface TableInfo {
  name: string;
  rows: number;
}

export default function SettingsPage() {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const fetchTables = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings/database');
      const data = await res.json();
      if (data.success) setTables(data.tables);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTables(); }, []);

  const clearTable = async (tableName: string) => {
    setClearing(tableName);
    setMessage(null);
    try {
      const res = await fetch('/api/settings/database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear_table', table: tableName }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: data.message });
        fetchTables();
      } else {
        setMessage({ type: 'error', text: data.error });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setClearing(null);
      setConfirmClear(null);
    }
  };

  const clearAll = async () => {
    setClearing('all');
    setMessage(null);
    try {
      const res = await fetch('/api/settings/database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear_all' }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: data.message });
        fetchTables();
      } else {
        setMessage({ type: 'error', text: data.error });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setClearing(null);
      setConfirmClearAll(false);
    }
  };

  const totalRows = tables.reduce((sum, t) => sum + t.rows, 0);

  return (
    <div className="p-4 lg:p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 mb-1">Settings</h1>
        <p className="text-sm text-slate-600 mb-6">Database management dan konfigurasi</p>

        {/* Message */}
        {message && (
          <div className={`mb-4 p-3 rounded-lg text-sm flex items-center gap-2 ${
            message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {message.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {message.text}
          </div>
        )}

        {/* Database Management */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden mb-6">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-slate-500" />
              <h2 className="text-base font-semibold text-slate-900">Database Management</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchTables}
                disabled={loading}
                className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50 flex items-center gap-1"
              >
                <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>

          {/* Table List */}
          <div className="divide-y divide-slate-100">
            {loading ? (
              <div className="p-8 text-center text-slate-400 text-sm">Loading...</div>
            ) : tables.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">No tables found</div>
            ) : (
              tables.map((t) => (
                <div key={t.name} className="p-3 lg:p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 font-mono">{t.name}</div>
                    <div className="text-xs text-slate-500">{t.rows.toLocaleString()} rows</div>
                  </div>
                  <div className="flex-shrink-0">
                    {confirmClear === t.name ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-red-600">Hapus?</span>
                        <button
                          onClick={() => clearTable(t.name)}
                          disabled={clearing === t.name}
                          className="px-2.5 py-1 text-xs bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                        >
                          {clearing === t.name ? '...' : 'Ya'}
                        </button>
                        <button
                          onClick={() => setConfirmClear(null)}
                          className="px-2.5 py-1 text-xs border border-slate-300 rounded-md text-slate-600 hover:bg-slate-50"
                        >
                          Batal
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmClear(t.name)}
                        disabled={t.rows === 0}
                        className="px-3 py-1.5 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" />
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Total + Clear All */}
          {!loading && tables.length > 0 && (
            <div className="p-4 border-t border-slate-200 bg-slate-50">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-slate-600">
                  Total: <strong>{tables.length}</strong> tables, <strong>{totalRows.toLocaleString()}</strong> rows
                </span>
              </div>
              {confirmClearAll ? (
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <span className="text-xs text-red-600">Semua data akan dihapus permanen!</span>
                  <button
                    onClick={clearAll}
                    disabled={clearing === 'all'}
                    className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                  >
                    {clearing === 'all' ? 'Deleting...' : 'Ya, Hapus Semua'}
                  </button>
                  <button
                    onClick={() => setConfirmClearAll(false)}
                    className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg text-slate-600 hover:bg-white"
                  >
                    Batal
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmClearAll(true)}
                  className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Clear All Tables
                </button>
              )}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 lg:p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-amber-800">
              <p className="font-semibold mb-1">Peringatan</p>
              <p>Clear database akan menghapus SEMUA data secara permanen. Upload ulang file Excel setelah clear untuk mengisi data baru.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
