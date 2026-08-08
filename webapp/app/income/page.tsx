'use client';

import { useEffect, useState } from 'react';
import DataTable from '@/components/DataTable';

type Section = 'penghasilan' | 'adjustment' | 'shipping';
type View = 'Order' | 'Sku';

const tabs: { key: Section; label: string }[] = [
  { key: 'penghasilan', label: 'Penghasilan' },
  { key: 'adjustment', label: 'Penyesuaian' },
  { key: 'shipping', label: 'Selisih Ongkir' },
];

const COLUMNS = {
  penghasilan: [
    { key: 'source_file', label: 'Report' },
    { key: 'report_period_from', label: 'Periode Dari' },
    { key: 'report_period_to', label: 'Periode Sampai' },
    { key: 'lihat_berdasarkan', label: 'View' },
    { key: 'no_pesanan', label: 'No. Pesanan' },
    { key: 'id_produk', label: 'ID Produk' },
    { key: 'nama_produk', label: 'Produk' },
    { key: 'waktu_pesanan_dibuat', label: 'Waktu Pesanan' },
    { key: 'tanggal_dana_dilepaskan', label: 'Dana Dilepas' },
    { key: 'signed_total', label: 'Signed Total' },
    { key: 'income_report_import_id', label: 'Import ID' },
    { key: 'source_excel_row', label: 'Source Row' },
  ],
  adjustment: [
    { key: 'source_file', label: 'Report' },
    { key: 'report_period_from', label: 'Periode Dari' },
    { key: 'report_period_to', label: 'Periode Sampai' },
    { key: 'no_pesanan_terhubung', label: 'No. Pesanan' },
    { key: 'tanggal_penyesuaian_dibuat', label: 'Tanggal Dibuat' },
    { key: 'tanggal_dana_dilepaskan', label: 'Dana Dilepas' },
    { key: 'biaya_penyesuaian', label: 'Biaya Penyesuaian' },
    { key: 'income_report_import_id', label: 'Import ID' },
    { key: 'source_excel_row', label: 'Source Row' },
  ],
  shipping: [
    { key: 'source_file', label: 'Report' },
    { key: 'report_period_from', label: 'Periode Dari' },
    { key: 'report_period_to', label: 'Periode Sampai' },
    { key: 'no_pesanan', label: 'No. Pesanan' },
    { key: 'estimasi_ongkos_kirim', label: 'Estimasi Ongkir' },
    { key: 'ongkos_kirim_dibayarkan_jasa_kirim', label: 'Dibayar Jasa Kirim' },
    { key: 'discrepancy_reason', label: 'Alasan Selisih' },
    { key: 'income_report_import_id', label: 'Import ID' },
    { key: 'source_excel_row', label: 'Source Row' },
  ],
} as const;

const SORT_MAP: Record<string, string> = {
  source_file: 'source_file',
  report_period_from: 'report_period_from',
  imported_at: 'imported_at',
  no_pesanan: 'no_pesanan',
  signed_total: 'signed_total',
  source_excel_row: 'source_excel_row',
};

export default function IncomePage() {
  const [section, setSection] = useState<Section>('penghasilan');
  const [view, setView] = useState<View>('Order');
  const [payload, setPayload] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async (
    nextSection = section,
    nextView = view,
    page = 1,
    limit = 50,
    search = '',
    sort = 'report_period_from',
    direction: 'asc' | 'desc' = 'desc',
  ) => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ section: nextSection, view: nextView, page: String(page), limit: String(limit), sort, direction });
      if (search) params.set('search', search);
      const res = await fetch(`/api/income?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal memuat Income RAW.');
      setPayload(data);
    } catch (err: any) { setError(err.message || 'Gagal memuat Income RAW.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);
  const rows = payload?.data || [];
  const columns = COLUMNS[section];

  const selectSection = (next: Section) => { setSection(next); load(next, view); };
  const selectView = (next: View) => { setView(next); load(section, next); };

  return (
    <div className="p-4 lg:p-8">
      <div className="mb-5">
        <h1 className="text-2xl lg:text-3xl font-bold text-slate-900">Income RAW</h1>
        <p className="text-sm text-slate-600 mt-1">Paket report berkala. Nilai disimpan bertanda asli, tanpa kalkulasi profit.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-800">Semua report Income</div>
            <div className="text-xs text-slate-500">Data lintas package. Periode dan file report ditampilkan di setiap row untuk audit overlap.</div>
          </div>
          <div className="text-right text-xs text-slate-500">
            <div><span className="font-semibold text-slate-800">{payload?.packageCount || 0}</span> package</div>
            <div><span className="font-semibold text-slate-800">{payload?.total || 0}</span> row pada view ini</div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 mb-3">
        {tabs.map((tab) => <button key={tab.key} onClick={() => selectSection(tab.key)} className={`px-3 py-2 text-sm font-medium border-b-2 ${section === tab.key ? 'border-purple-600 text-purple-700' : 'border-transparent text-slate-500'}`}>{tab.label}</button>)}
        <button className="px-3 py-2 text-sm font-medium border-b-2 border-transparent text-slate-500">Riwayat Import</button>
      </div>
      {section === 'penghasilan' && <div className="flex gap-2 mb-4"><button onClick={() => selectView('Order')} className={`px-3 py-1.5 rounded-lg text-sm ${view === 'Order' ? 'bg-purple-600 text-white' : 'border border-purple-300 text-purple-700 bg-white'}`}>Per Pesanan</button><button onClick={() => selectView('Sku')} className={`px-3 py-1.5 rounded-lg text-sm ${view === 'Sku' ? 'bg-purple-600 text-white' : 'border border-purple-300 text-purple-700 bg-white'}`}>Per SKU</button></div>}

      {error && <div className="p-3 mb-4 text-sm rounded-lg bg-red-50 border border-red-200 text-red-700">{error}</div>}
      {loading && !payload ? <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">Memuat Income RAW...</div> : (
        <DataTable
          key={`${section}-${view}`}
          columns={columns as unknown as { key: string; label: string }[]}
          data={rows}
          totalRows={payload?.total || 0}
          onPageChange={(page, limit) => load(section, view, page, limit)}
          onSearch={(queries) => load(section, view, 1, 50, queries.join('||'))}
          onSort={(column, direction) => load(section, view, 1, 50, '', SORT_MAP[column] || 'report_period_from', direction)}
        />
      )}
    </div>
  );
}
