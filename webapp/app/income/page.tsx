'use client';

import { useEffect, useState } from 'react';

type Section = 'penghasilan' | 'adjustment' | 'shipping';
type View = 'Order' | 'Sku';

const tabs: { key: Section; label: string }[] = [
  { key: 'penghasilan', label: 'Penghasilan' },
  { key: 'adjustment', label: 'Penyesuaian' },
  { key: 'shipping', label: 'Selisih Ongkir' },
];

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export default function IncomePage() {
  const [section, setSection] = useState<Section>('penghasilan');
  const [view, setView] = useState<View>('Order');
  const [importId, setImportId] = useState<string>('');
  const [payload, setPayload] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async (nextSection = section, nextView = view, nextImportId = importId) => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ section: nextSection, view: nextView, limit: '50' });
      if (nextImportId) params.set('importId', nextImportId);
      const res = await fetch(`/api/income?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal memuat Income RAW.');
      setPayload(data);
      if (data.selectedImport && !nextImportId) setImportId(String(data.selectedImport.id));
    } catch (err: any) { setError(err.message || 'Gagal memuat Income RAW.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);
  const rows = payload?.data || [];
  const columns = rows.length ? Object.keys(rows[0]).filter((key) => !['id', 'income_report_import_id', 'raw_payload'].includes(key)) : [];

  const selectSection = (next: Section) => { setSection(next); load(next, view, importId); };
  const selectView = (next: View) => { setView(next); load(section, next, importId); };
  const selectImport = (next: string) => { setImportId(next); load(section, view, next); };

  return (
    <div className="p-4 lg:p-8">
      <div className="mb-5">
        <h1 className="text-2xl lg:text-3xl font-bold text-slate-900">Income RAW</h1>
        <p className="text-sm text-slate-600 mt-1">Paket report berkala. Nilai disimpan bertanda asli, tanpa kalkulasi profit.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Report yang ditampilkan</label>
        <select value={importId} onChange={(event) => selectImport(event.target.value)} className="w-full max-w-2xl border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">Report terbaru</option>
          {(payload?.imports || []).map((item: any) => <option key={item.id} value={item.id}>{item.source_file} · {item.report_period_from} s/d {item.report_period_to}</option>)}
        </select>
      </div>

      {payload?.selectedImport && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div className="bg-white border border-slate-200 rounded-xl p-3"><div className="text-xs text-slate-500">Total yang Dilepas</div><div className="font-bold text-slate-900">Rp {Number(payload.selectedImport.summary_total_yang_dilepas || 0).toLocaleString('id-ID')}</div></div>
          <div className="bg-white border border-slate-200 rounded-xl p-3"><div className="text-xs text-slate-500">Rekonsiliasi Order</div><div className={`font-bold ${payload.selectedImport.reconciliation_status === 'matched' ? 'text-emerald-600' : 'text-red-600'}`}>{payload.selectedImport.reconciliation_status === 'matched' ? 'Cocok' : 'Tidak cocok'}</div></div>
          <div className="bg-white border border-slate-200 rounded-xl p-3"><div className="text-xs text-slate-500">SHA-256</div><div className="font-mono text-xs text-slate-700 truncate">{payload.selectedImport.source_sha256}</div></div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-b border-slate-200 mb-3">
        {tabs.map((tab) => <button key={tab.key} onClick={() => selectSection(tab.key)} className={`px-3 py-2 text-sm font-medium border-b-2 ${section === tab.key ? 'border-purple-600 text-purple-700' : 'border-transparent text-slate-500'}`}>{tab.label}</button>)}
        <button className="px-3 py-2 text-sm font-medium border-b-2 border-transparent text-slate-500">Riwayat Import</button>
      </div>
      {section === 'penghasilan' && <div className="flex gap-2 mb-4"><button onClick={() => selectView('Order')} className={`px-3 py-1.5 rounded-lg text-sm ${view === 'Order' ? 'bg-purple-600 text-white' : 'border border-purple-300 text-purple-700 bg-white'}`}>Per Pesanan</button><button onClick={() => selectView('Sku')} className={`px-3 py-1.5 rounded-lg text-sm ${view === 'Sku' ? 'bg-purple-600 text-white' : 'border border-purple-300 text-purple-700 bg-white'}`}>Per SKU</button></div>}

      {error && <div className="p-3 mb-4 text-sm rounded-lg bg-red-50 border border-red-200 text-red-700">{error}</div>}
      {loading ? <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">Memuat Income RAW...</div> : !payload?.selectedImport ? <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">Belum ada paket Income RAW yang di-import. Upload lalu preview report Income terlebih dahulu.</div> : <div className="bg-white border border-slate-200 rounded-xl overflow-auto"><div className="p-3 border-b text-sm text-slate-600">{payload.total || 0} row RAW pada section ini</div><table className="min-w-full text-xs"><thead className="bg-slate-50"><tr>{columns.map((column) => <th key={column} className="text-left whitespace-nowrap px-3 py-2 font-semibold text-slate-600 border-b">{column}</th>)}</tr></thead><tbody>{rows.map((row: any) => <tr key={row.id} className="border-b border-slate-100">{columns.map((column) => <td key={column} className="px-3 py-2 whitespace-nowrap text-slate-700">{displayValue(row[column])}</td>)}</tr>)}</tbody></table></div>}
    </div>
  );
}
