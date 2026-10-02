'use client';

import { useState } from 'react';

type Coverage = { coverageTo: string | null; importedAt: string | null; completeThroughMonth: boolean };
type Breakdown = { type: string; rows: number; amount: number };
type Data = {
  month: string;
  dateRange: { dateFrom: string; dateTo: string };
  financialFinalOutcome: number;
  grossAdsTopup: number;
  grossAdsTopupRows: number;
  oldCohortOutflow: number;
  oldCohortOutflowRows: number;
  oldCohortOutflowByType: Breakdown[];
  unmappedLinkedOutflow: number;
  unmappedLinkedOutflowRows: number;
  unmappedLinkedOutflowByType: Breakdown[];
  cashReady: number;
  pendingEstimatedProfit: number | null;
  runningPotential: number | null;
  status: 'running' | 'calculated';
  finalityReasons: string[];
  sourceCoverage: Record<string, Coverage>;
  formula: { cashReady: string; runningPotential: string; topupPpn: string };
};

const formatIdr = (value: number | null | undefined) => value === null || value === undefined
  ? '—'
  : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);

const coverageNames: Record<string, string> = {
  income: 'Income',
  my_balance: 'My Balance',
  cancellation: 'Cancellation',
  failed_delivery: 'Failed Delivery',
  return_refund: 'Return / Refund',
  ads: 'Ads Ledger',
};

function Card({ label, value, detail, tone = 'slate' }: { label: string; value: string; detail: string; tone?: 'slate' | 'emerald' | 'amber' | 'rose' | 'purple' }) {
  const colors = {
    slate: 'border-slate-200 bg-white text-slate-900',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-950',
    amber: 'border-amber-200 bg-amber-50 text-amber-950',
    rose: 'border-rose-200 bg-rose-50 text-rose-950',
    purple: 'border-purple-200 bg-purple-50 text-purple-950',
  };
  return <section className={`rounded-xl border p-4 ${colors[tone]}`}><p className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</p><p className="mt-2 text-xl font-bold tabular-nums sm:text-2xl">{value}</p><p className="mt-1 text-xs leading-5 opacity-80">{detail}</p></section>;
}

export default function CashCohortControlPanel({ storeId }: { storeId: string }) {
  const [month, setMonth] = useState('2026-09');
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    if (!storeId || !month) return;
    setLoading(true); setError(''); setData(null);
    try {
      const response = await fetch(`/api/cash-cohort-control?${new URLSearchParams({ storeId, month })}`, { cache: 'no-store' });
      const body = await response.json() as Data & { error?: string };
      if (!response.ok) throw new Error(body.error || 'Gagal memuat Kontrol Kas Cohort.');
      setData(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal memuat Kontrol Kas Cohort.');
    } finally {
      setLoading(false);
    }
  };

  return <>
    <section className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-950"><b>Kontrol Kas Cohort Bulanan.</b><p className="mt-1">Cash basis berdasarkan cohort Waktu Pesanan Dibuat. Top-up My Balance sudah gross termasuk PPN; Used Ads tidak dikurangkan lagi di sini.</p></section>
    <section className="mb-5 rounded-xl border bg-white p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-end"><label className="text-sm font-medium text-slate-700">Bulan cohort order dibuat<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="mt-1 block w-full rounded border border-slate-300 p-2 sm:w-56" /></label><button type="button" onClick={() => void load()} disabled={!storeId || !month || loading} className="rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{loading ? 'Memuat…' : 'Muat Kontrol Kas'}</button></div></section>
    {error && <section className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</section>}
    {!data && !loading && !error && <section className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">Pilih bulan cohort lalu tekan <b>Muat Kontrol Kas</b>.</section>}
    {loading && <section className="rounded-xl border bg-white p-10 text-center text-sm text-slate-500">Membaca cohort final, My Balance canonical, dan coverage RAW…</section>}
    {data && !loading && <div>
      <section className={`mb-5 rounded-xl border p-4 text-sm ${data.status === 'running' ? 'border-amber-200 bg-amber-50 text-amber-950' : 'border-emerald-200 bg-emerald-50 text-emerald-950'}`}><b>{data.status === 'running' ? 'Status: Running control' : 'Status: Terhitung'}</b><p className="mt-1">Cohort: {data.dateRange.dateFrom} s.d. {data.dateRange.dateTo} berdasarkan Waktu Pesanan Dibuat.</p>{data.finalityReasons.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5">{data.finalityReasons.map((reason, index) => <li key={`${reason}-${index}`}>{reason}</li>)}</ul>}</section>
      <section className="mb-5"><div className="mb-2 flex flex-wrap items-baseline justify-between gap-2"><h2 className="font-semibold text-slate-900">Cash Siap Tarik</h2><span className="text-xs text-slate-500">Per toko · cash basis cohort</span></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Card label="Hasil Finansial Final" value={formatIdr(data.financialFinalOutcome)} detail="Profit Aktual final + return final/kompensasi final" tone="purple" /><Card label="Gross Top-up Ads + PPN" value={`− ${formatIdr(data.grossAdsTopup)}`} detail={`${data.grossAdsTopupRows} mutasi Pembayaran dengan Saldo Penjual; PPN sudah termasuk`} tone="rose" /><Card label="Outflow Cohort Lama" value={`− ${formatIdr(data.oldCohortOutflow)}`} detail={`${data.oldCohortOutflowRows} mutasi order-linked untuk order sebelum bulan cohort`} tone="rose" /><Card label="Cash Siap Tarik" value={formatIdr(data.cashReady)} detail="Belum termasuk estimasi order yang belum selesai" tone="emerald" /></div></section>
      <section className="mb-5 grid gap-3 sm:grid-cols-2"><Card label="Estimasi Belum Cair" value={formatIdr(data.pendingEstimatedProfit)} detail="Estimasi profit order belum selesai; bukan cash tersedia" tone="amber" /><Card label="Running Potential" value={formatIdr(data.runningPotential)} detail="Cash siap tarik + estimasi belum cair" tone="emerald" /></section>
      <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700"><h2 className="font-semibold text-slate-900">Rumus yang dipakai</h2><dl className="mt-3 space-y-2 text-xs leading-5"><div><dt className="font-semibold">Cash siap tarik</dt><dd>{data.formula.cashReady}</dd></div><div><dt className="font-semibold">Running potential</dt><dd>{data.formula.runningPotential}</dd></div><div><dt className="font-semibold">PPN top-up</dt><dd>{data.formula.topupPpn}</dd></div></dl></section>
      {(data.oldCohortOutflowByType.length > 0 || data.unmappedLinkedOutflowRows > 0) && <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4"><h2 className="font-semibold text-slate-900">Audit Outflow Order-Linked</h2><div className="mt-3 grid gap-3 sm:grid-cols-2">{data.oldCohortOutflowByType.length > 0 && <div><p className="text-xs font-semibold text-slate-600">Cohort lama yang dikurangkan</p><ul className="mt-2 space-y-1 text-sm">{data.oldCohortOutflowByType.map((item) => <li key={item.type} className="flex justify-between gap-3"><span>{item.type} · {item.rows} mutasi</span><b className="tabular-nums">{formatIdr(item.amount)}</b></li>)}</ul></div>}{data.unmappedLinkedOutflowRows > 0 && <div className="rounded border border-amber-200 bg-amber-50 p-3 text-amber-950"><p className="text-xs font-semibold">Tidak dikurangkan — perlu audit mapping</p><p className="mt-1 text-sm font-bold">{formatIdr(data.unmappedLinkedOutflow)} · {data.unmappedLinkedOutflowRows} mutasi</p><p className="mt-1 text-xs">Mutasi tetap terlihat agar angka cash tidak menyembunyikan risiko link order yang belum terbukti.</p></div>}</div></section>}
      <section className="mb-5 overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="border-b border-slate-200 p-4"><h2 className="font-semibold text-slate-900">Coverage Source RAW</h2><p className="mt-1 text-xs text-slate-500">Closing final hanya aman bila coverage source relevan mencapai akhir bulan dan tidak ada bucket unresolved.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-600"><tr><th className="p-3">Source</th><th className="p-3">Coverage sampai</th><th className="p-3">Import terakhir</th><th className="p-3">Status bulan</th></tr></thead><tbody>{Object.entries(data.sourceCoverage).map(([key, value]) => <tr className="border-t" key={key}><td className="p-3 font-medium">{coverageNames[key] || key}</td><td className="p-3">{value.coverageTo || '—'}</td><td className="p-3">{value.importedAt || '—'}</td><td className="p-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${value.completeThroughMonth ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>{value.completeThroughMonth ? 'Mencapai akhir bulan' : 'Belum mencapai akhir bulan'}</span></td></tr>)}</tbody></table></div></section>
    </div>}
  </>;
}
