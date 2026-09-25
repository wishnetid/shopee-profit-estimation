'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { AlertTriangle, BarChart3, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { useStore } from '@/components/StoreContext';
import ProfitActualPanel from '@/components/ProfitActualPanel';
import SettlementBalanceReconciliationPanel from '@/components/SettlementBalanceReconciliationPanel';
import MyBalanceAnalysisPanel from '@/components/MyBalanceAnalysisPanel';

type EstimationStatus = 'estimable' | 'hpp_incomplete' | 'needs_review' | 'not_eligible';

type EstimationOrder = {
  no_pesanan: string | null;
  orderDate: string | null;
  statusPesanan: string | null;
  itemCount: number;
  sellerSubtotal: number | null;
  sellerVoucher: number | null;
  estimatedShopeeFees: number | null;
  estimatedSellerIncome: number | null;
  totalHpp: number | null;
  estimasiKotor: number | null;
  estimationStatus: EstimationStatus;
  reasons: string[];
};

type DailyRow = {
  date: string;
  estimatedOrderCount: number;
  hppIncompleteOrderCount: number;
  reviewOrderCount: number;
  estimatedStandardShopeeFees: number;
  estimatedSellerIncome: number;
  totalHpp: number;
  estimatedGrossBeforeFeeAds: number;
  adsSpend: number;
  estimatedAdsPpn: number;
  afterAds: number;
  afterAdsAndPpn: number;
};

type EstimationPayload = {
  success: true;
  storeId: number;
  availableStatuses: string[];
  selectedStatuses: string[];
  resiFilter: 'all' | 'with' | 'without';
  skuImport: { id: number; sourceFile: string; importedAt: string } | null;
  dateRange: { dateFrom: string | null; dateTo: string | null };
  summary: {
    totalOrderCount: number;
    eligibleOrderCount: number;
    estimatedOrderCount: number;
    hppIncompleteOrderCount: number;
    reviewOrderCount: number;
    excludedOrderCount: number;
    uniqueOrderCount: number;
    uniqueResiCount: number;
    totalPcs: number;
    totalHpp: number;
    estimatedGrossBeforeFeeAds: number;
    adsSpend: number;
    adsPpnRate: number;
    estimatedAdsPpn: number;
    afterAds: number;
    afterAdsAndPpn: number;
    adsDuplicateEventCount: number;
  };
  daily: DailyRow[];
  orders: { total: number; page: number; limit: number; data: EstimationOrder[] };
};

const STATUS_COPY: Record<EstimationStatus, string> = {
  estimable: 'Siap Diestimasi',
  hpp_incomplete: 'HPP Belum Lengkap',
  needs_review: 'Review — Ada Exception',
  not_eligible: 'Tidak Eligible',
};

function statusCopy(status: EstimationStatus, reasons: string[] = []) {
  if (status !== 'not_eligible') return STATUS_COPY[status];
  if (reasons.includes('STATUS_TIDAK_ELIGIBLE')) return 'Tidak Eligible — Status';
  if (reasons.some((reason) => reason.includes('CANCELLATION') || reason.includes('RETURN'))) return 'Tidak Eligible — Batal/Retur';
  return STATUS_COPY[status];
}

const DEFAULT_STATUS_OPTIONS = ['Perlu Dikirim', 'Sedang Dikirim', 'Telah Dikirim', 'Selesai', 'Batal'];

const REASON_COPY: Record<string, string> = {
  CANCELLATION_ATAU_RETURN_MARKER: 'Ada marker pembatalan/pengembalian',
  CANCELLATION_ATAU_RETURN_RAW: 'Tercatat pada RAW pembatalan/pengembalian/pengiriman gagal',
  RETURNED_QUANTITY_POSITIF: 'Ada quantity item yang dikembalikan',
  HPP_CONFLICT: 'HPP alias konflik',
  HPP_TIDAK_DITEMUKAN: 'HPP belum ditemukan',
  NO_PESANAN_TIDAK_VALID: 'No. pesanan tidak valid',
  QUANTITY_TIDAK_VALID: 'Quantity item tidak valid',
  STATUS_PESANAN_TIDAK_KONSISTEN: 'Status item tidak konsisten',
  STATUS_PESANAN_TIDAK_VALID: 'Status item belum lengkap',
  STATUS_TIDAK_ELIGIBLE: 'Status belum eligible',
  TANGGAL_PESANAN_TIDAK_KONSISTEN: 'Tanggal item tidak konsisten',
  TANGGAL_PESANAN_TIDAK_VALID: 'Tanggal pesanan tidak valid',
  SUBTOTAL_PESANAN_TIDAK_VALID: 'Subtotal pesanan belum valid',
  VOUCHER_PENJUAL_TIDAK_VALID: 'Voucher penjual belum valid',
};

function formatIdr(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string | null | undefined) {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value || '—';
}

function reasonText(reasons: string[]) {
  return reasons.map((reason) => REASON_COPY[reason] || reason).join(' · ') || '—';
}

function StatusBadge({ status, reasons = [] }: { status: EstimationStatus; reasons?: string[] }) {
  const colors: Record<EstimationStatus, string> = {
    estimable: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    hpp_incomplete: 'bg-amber-50 text-amber-700 border-amber-200',
    needs_review: 'bg-orange-50 text-orange-700 border-orange-200',
    not_eligible: 'bg-slate-100 text-slate-600 border-slate-200',
  };
  return <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${colors[status]}`}>{statusCopy(status, reasons)}</span>;
}

function SummaryCard({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: 'purple' | 'rose' | 'indigo' | 'amber' | 'slate' }) {
  const colors = {
    purple: 'border-purple-200 bg-purple-50 text-purple-800',
    rose: 'border-rose-200 bg-rose-50 text-rose-800',
    indigo: 'border-indigo-200 bg-indigo-50 text-indigo-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    slate: 'border-slate-200 bg-slate-50 text-slate-800',
  };
  return <section className={`rounded-xl border p-4 ${colors[tone]}`}><p className="text-xs font-semibold uppercase tracking-wide opacity-75">{label}</p><p className="mt-2 text-xl font-bold tabular-nums lg:text-2xl">{value}</p><p className="mt-1 text-xs leading-5 opacity-80">{detail}</p></section>;
}

export default function ProfitPage() {
  const { storeId, activeStore } = useStore();
  return <ProfitEstimationContent key={storeId || 'no-store'} storeId={storeId} activeStoreName={activeStore?.store_name || 'toko aktif'} />;
}

function ProfitEstimationContent({ storeId, activeStoreName }: { storeId: string; activeStoreName: string }) {
  const [tab, setTab] = useState<'estimate' | 'orders' | 'returns' | 'reconciliation' | 'balanceAnalysis'>('orders');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [resiFilter, setResiFilter] = useState<'all' | 'with' | 'without'>('all');
  const [data, setData] = useState<EstimationPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [bulkSearch, setBulkSearch] = useState('');
  const requestSequence = useRef(0);

  const resetResult = useCallback(() => {
    requestSequence.current += 1;
    setData(null); setError(''); setPage(1); setLoading(false);
  }, []);

  const load = useCallback(async (nextPage = 1, nextLimit = limit, search = bulkSearch) => {
    if (!storeId) return;
    const requestId = ++requestSequence.current;
    setLoading(true); setError(''); setData(null);
    try {
      const params = new URLSearchParams({ storeId, page: String(nextPage), limit: String(nextLimit) });
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      selectedStatuses.forEach((status) => params.append('status', status));
      if (resiFilter !== 'all') params.set('resiFilter', resiFilter);
      if (search.trim()) params.set('search', search);
      const response = await fetch(`/api/profit-estimation?${params}`, { cache: 'no-store' });
      const body = await response.json() as EstimationPayload & { error?: string };
      if (requestId !== requestSequence.current) return;
      if (!response.ok) throw new Error(body.error || 'Gagal memuat estimasi kotor.');
      if (String(body.storeId) !== storeId) return;
      setData(body); setPage(nextPage); setLimit(nextLimit);
    } catch (caught: unknown) {
      if (requestId === requestSequence.current) setError(caught instanceof Error ? caught.message : 'Gagal memuat estimasi kotor.');
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, [bulkSearch, dateFrom, dateTo, limit, resiFilter, selectedStatuses, storeId]);

  const toggleStatus = (status: string) => {
    setSelectedStatuses((current) => current.includes(status)
      ? current.filter((value) => value !== status)
      : [...current, status]);
    resetResult();
  };

  const totalPages = useMemo(() => data ? Math.max(1, Math.ceil(data.orders.total / data.orders.limit)) : 1, [data]);
  const statusOptions = useMemo(() => [...new Set([...DEFAULT_STATUS_OPTIONS, ...(data?.availableStatuses || [])])], [data]);
  const updateDate = (target: 'from' | 'to', value: string) => {
    if (target === 'from') setDateFrom(value);
    else setDateTo(value);
    resetResult();
  };

  const hasPartialOrderFilter = selectedStatuses.length > 0 || resiFilter !== 'all' || bulkSearch.trim().length > 0;

  return (
    <div className="p-4 lg:p-8"><div className="mx-auto max-w-7xl">
      <div className="mb-6 flex items-start gap-3"><div className="rounded-xl bg-purple-50 p-3 text-purple-700"><BarChart3 className="h-6 w-6" /></div><div><h1 className="text-2xl font-bold text-slate-900 lg:text-3xl">Profit & Estimasi</h1><p className="mt-1 text-sm text-slate-600">Monitoring estimasi kotor seller, HPP, dan Ads untuk {activeStoreName}.</p></div></div>
      <div className="mb-5 flex flex-wrap gap-2 border-b border-slate-200">
        <button type="button" onClick={() => setTab('orders')} className={`border-b-2 px-3 py-2 text-sm font-semibold ${tab === 'orders' ? 'border-purple-600 text-purple-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>Profit Pesanan</button>
        <button type="button" onClick={() => setTab('estimate')} className={`border-b-2 px-3 py-2 text-sm font-semibold ${tab === 'estimate' ? 'border-purple-600 text-purple-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>Forecast Profit & Used Ads</button>
        <button type="button" onClick={() => setTab('returns')} className={`border-b-2 px-3 py-2 text-sm font-semibold ${tab === 'returns' ? 'border-purple-600 text-purple-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>Retur & Refund</button>
        <button type="button" onClick={() => setTab('reconciliation')} className={`border-b-2 px-3 py-2 text-sm font-semibold ${tab === 'reconciliation' ? 'border-purple-600 text-purple-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>Rekonsiliasi My Balance</button>
        <button type="button" onClick={() => setTab('balanceAnalysis')} className={`border-b-2 px-3 py-2 text-sm font-semibold ${tab === 'balanceAnalysis' ? 'border-purple-600 text-purple-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>My Balance Analisis</button>
      </div>
      {tab === 'orders' ? <ProfitActualPanel storeId={storeId} view="orders" /> : tab === 'returns' ? <ProfitActualPanel storeId={storeId} view="returns" /> : tab === 'reconciliation' ? <SettlementBalanceReconciliationPanel storeId={storeId} /> : tab === 'balanceAnalysis' ? <MyBalanceAnalysisPanel storeId={storeId} /> : <>
        <section className="mb-5 rounded-xl border border-purple-200 bg-purple-50 p-4 lg:p-5"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-purple-700" /><div className="text-sm leading-6 text-purple-950"><h2 className="font-semibold">Forecast Profit Pesanan &amp; Used Ads</h2><p>Forecast order memakai Subtotal seller, voucher seller, potongan standar Shopee, dan HPP. Used Ads Cost memakai deduction Product Ad dari Ads RAW canonical pada tanggal sama. Ini alat kontrol ekonomi harian, bukan Profit Aktual atau dana cair. Top-up wallet dipantau terpisah pada cashflow/My Balance.</p></div></div></section>
        <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4 lg:p-5"><div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <label className="text-sm font-medium text-slate-700">Dari tanggal <span className="font-normal text-slate-400">(opsional)</span><input type="date" value={dateFrom} onChange={(event) => updateDate('from', event.target.value)} className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-100" /></label>
          <label className="text-sm font-medium text-slate-700">Sampai tanggal <span className="font-normal text-slate-400">(opsional)</span><input type="date" value={dateTo} onChange={(event) => updateDate('to', event.target.value)} className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-100" /></label>
          <div className="flex gap-2"><button type="button" onClick={() => void load(1, limit)} disabled={!storeId || loading} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />{loading ? 'Memuat…' : 'Muat Estimasi'}</button><button type="button" onClick={resetResult} disabled={!data && !error && !loading} className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">Reset</button></div>
        </div>
        <fieldset className="mt-4 border-t border-slate-100 pt-4"><div className="flex flex-wrap items-center justify-between gap-2"><legend className="text-sm font-medium text-slate-700">Status Shopee <span className="font-normal text-slate-400">(opsional, bisa pilih lebih dari satu)</span></legend><button type="button" onClick={() => { setSelectedStatuses([]); resetResult(); }} disabled={selectedStatuses.length === 0} className="text-xs font-semibold text-purple-700 hover:text-purple-800 disabled:cursor-not-allowed disabled:text-slate-400">Semua Status</button></div><div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">{statusOptions.map((status) => <label key={status} className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={selectedStatuses.includes(status)} onChange={() => toggleStatus(status)} className="h-4 w-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500" />{status}</label>)}</div></fieldset>
        <fieldset className="mt-4 border-t border-slate-100 pt-4"><label className="text-sm font-medium text-slate-700">Cari / Bulk Search<textarea value={bulkSearch} onChange={(event) => { setBulkSearch(event.target.value); resetResult(); }} rows={3} placeholder="Satu baris satu No. Pesanan, Resi, SKU, produk, atau status…" className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label><p className="mt-1 text-xs text-slate-500">Maksimal 500 baris. Pencarian mengikuti filter di atas dan diterapkan saat Muat Estimasi.</p></fieldset>
        <fieldset className="mt-4 border-t border-slate-100 pt-4"><legend className="text-sm font-medium text-slate-700">No. Resi <span className="font-normal text-slate-400">(opsional)</span></legend><div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">{([{ value: 'all', label: 'Semua Pesanan' }, { value: 'with', label: 'Hanya yang memiliki No. Resi' }, { value: 'without', label: 'Hanya yang belum memiliki No. Resi' }] as const).map((option) => <label key={option.value} className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700"><input type="radio" name="resi-filter" value={option.value} checked={resiFilter === option.value} onChange={() => { setResiFilter(option.value); resetResult(); }} className="h-4 w-4 border-slate-300 text-purple-600 focus:ring-purple-500" />{option.label}</label>)}</div></fieldset>
        <p className="mt-3 text-xs leading-5 text-slate-500">Filter berlaku untuk kalkulasi dan tabel order. Ads Spend serta PPN tetap biaya agregat toko pada tanggal yang sama.</p></section>
        {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
        {!data && !loading && !error && <section className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">Tentukan rentang bila diperlukan, lalu tekan <b>Muat Estimasi</b>.</section>}
        {loading && <section className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Menghitung Estimasi Kotor dan Ads Spend…</section>}
        {data && !loading && <>
          <section className="mb-5"><div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold text-slate-800">Forecast Order Terfilter</h2><span className="text-xs text-slate-500">Order.all + potongan standar + HPP</span></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <SummaryCard label="No. Pesanan (Unik)" value={data.summary.uniqueOrderCount.toLocaleString('id-ID')} detail="Order unik dalam scope filter" tone="slate" />
            <SummaryCard label="No. Resi (Unik)" value={data.summary.uniqueResiCount.toLocaleString('id-ID')} detail="Resi terisi unik dalam scope filter" tone="slate" />
            <SummaryCard label="Total Pcs (SKU)" value={data.summary.totalPcs.toLocaleString('id-ID')} detail="Total quantity SKU valid dalam scope filter" tone="slate" />
            <SummaryCard label="Forecast Profit Sebelum Ads" value={formatIdr(data.summary.estimatedGrossBeforeFeeAds)} detail={`${data.summary.estimatedOrderCount} order dengan basis dan HPP lengkap`} tone="purple" />
            <SummaryCard label="Total HPP" value={formatIdr(data.summary.totalHpp)} detail={`${data.summary.estimatedOrderCount} order siap diestimasi`} tone="slate" />
            <SummaryCard label="Perlu Tindak Lanjut" value={String(data.summary.hppIncompleteOrderCount + data.summary.reviewOrderCount)} detail={`${data.summary.hppIncompleteOrderCount} HPP belum lengkap · ${data.summary.reviewOrderCount} review`} tone="slate" />
          </div></section>
          <section className="mb-5"><div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold text-slate-800">Used Ads Cost Toko</h2><span className="text-xs text-slate-500">Aggregate toko per tanggal</span></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Used Ads Cost" value={formatIdr(data.summary.adsSpend)} detail="Deduction for Product Ad negatif canonical" tone="rose" />
            <SummaryCard label="Setelah Used Ads Cost" value={formatIdr(data.summary.afterAds)} detail="Forecast profit dikurangi Used Ads Cost" tone="indigo" />
            <SummaryCard label="Estimasi PPN Ads (11%)" value={formatIdr(data.summary.estimatedAdsPpn)} detail="Simulasi tambahan, bukan pajak RAW" tone="amber" />
            <SummaryCard label="Setelah Used Ads + Estimasi PPN" value={formatIdr(data.summary.afterAdsAndPpn)} detail="Indikator toko, bukan Profit Aktual" tone="indigo" />
          </div></section>
          {hasPartialOrderFilter && <section className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"><b>Filter order parsial aktif.</b> Used Ads Cost tetap total toko pada tanggal sama dan belum dialokasikan ke status, resi, SKU, atau hasil Bulk Search. Indikator setelah Ads bukan profit bersih subset order.</section>}
          <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600"><div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><span>Scope: <b className="text-slate-800">{data.dateRange.dateFrom ? formatDate(data.dateRange.dateFrom) : 'semua tanggal'}</b>{data.dateRange.dateTo && <> s.d. <b className="text-slate-800">{formatDate(data.dateRange.dateTo)}</b></>}</span><span>{data.summary.excludedOrderCount} order tidak eligible · {data.summary.adsDuplicateEventCount} event Ads overlap dilewati</span></div>{data.skuImport ? <p className="mt-2 text-xs text-slate-500">HPP memakai Master SKU import terbaru: {data.skuImport.sourceFile} · {formatDate(data.skuImport.importedAt)}.</p> : <p className="mt-2 text-xs font-medium text-amber-700">Master SKU belum tersedia. Semua order yang memerlukan HPP akan ditandai HPP Belum Lengkap.</p>}</div>
          <section className="mb-5 overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="border-b border-slate-200 px-4 py-4 lg:px-5"><h2 className="font-semibold text-slate-900">Ringkasan Harian</h2><p className="mt-1 text-sm text-slate-500">Total estimasi hanya dari Pesanan Siap Diestimasi. Ads dan PPN tetap biaya agregat harian toko.</p></div><div className="max-h-[548px] overflow-auto"><table className="w-full min-w-[1460px] text-sm"><caption className="sr-only">Ringkasan harian. Tampil maksimal sekitar 9 baris; gunakan scroll vertikal untuk baris lain.</caption><thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600"><tr><th className="px-4 py-3">Tanggal</th><th className="px-4 py-3 text-right">Pesanan Siap Diestimasi</th><th className="px-4 py-3 text-right">HPP Belum Lengkap</th><th className="px-4 py-3 text-right">Review</th><th className="px-4 py-3 text-right">Total Potongan Standar</th><th className="px-4 py-3 text-right">Total Penghasilan Seller</th><th className="px-4 py-3 text-right">Total HPP</th><th className="px-4 py-3 text-right">Estimasi Kotor</th><th className="px-4 py-3 text-right">Ads Spend</th><th className="px-4 py-3 text-right">Estimasi PPN (11%)</th><th className="px-4 py-3 text-right">Sisa Setelah Ads & PPN</th></tr></thead><tbody className="divide-y divide-slate-100 text-slate-700">{data.daily.length === 0 ? <tr><td colSpan={11} className="px-4 py-10 text-center text-slate-400">Tidak ada data dalam rentang ini.</td></tr> : data.daily.map((row) => <tr key={row.date} className="hover:bg-slate-50"><td className="px-4 py-3 font-medium">{formatDate(row.date)}</td><td className="px-4 py-3 text-right tabular-nums">{row.estimatedOrderCount}</td><td className="px-4 py-3 text-right tabular-nums text-amber-700">{row.hppIncompleteOrderCount}</td><td className="px-4 py-3 text-right tabular-nums text-orange-700">{row.reviewOrderCount}</td><td className="px-4 py-3 text-right font-medium tabular-nums text-rose-700">{formatIdr(row.estimatedStandardShopeeFees)}</td><td className="px-4 py-3 text-right font-medium tabular-nums">{formatIdr(row.estimatedSellerIncome)}</td><td className="px-4 py-3 text-right font-medium tabular-nums">{formatIdr(row.totalHpp)}</td><td className="px-4 py-3 text-right font-medium tabular-nums text-purple-700">{formatIdr(row.estimatedGrossBeforeFeeAds)}</td><td className="px-4 py-3 text-right font-medium tabular-nums text-rose-700">{formatIdr(row.adsSpend)}</td><td className="px-4 py-3 text-right font-medium tabular-nums text-amber-700">{formatIdr(row.estimatedAdsPpn)}</td><td className="px-4 py-3 text-right font-semibold tabular-nums text-indigo-700">{formatIdr(row.afterAdsAndPpn)}</td></tr>)}</tbody></table></div></section>
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 lg:flex-row lg:items-center lg:justify-between lg:px-5"><div><h2 className="font-semibold text-slate-900">Estimasi Per Order</h2><p className="mt-1 text-sm text-slate-500">Subtotal seller dan voucher seller dibaca dari Order.all; potongan standar dihitung otomatis.</p></div><label className="text-xs font-semibold text-slate-600">Baris per halaman<select value={limit} onChange={(event) => void load(1, Number(event.target.value))} className="ml-2 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm font-normal text-slate-800">{[10, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}</select></label></div><div className="max-h-[548px] overflow-auto"><table className="w-full min-w-[1300px] text-sm"><caption className="sr-only">Forecast per order. Tampil maksimal sekitar 9 baris; gunakan scroll vertikal untuk baris lain.</caption><thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600"><tr><th className="px-4 py-3">Tanggal</th><th className="px-4 py-3">No. Pesanan</th><th className="px-4 py-3">Status Shopee</th><th className="px-4 py-3">Status Estimasi</th><th className="px-4 py-3 text-right">Subtotal Seller</th><th className="px-4 py-3 text-right">Voucher Seller</th><th className="px-4 py-3 text-right">Potongan Standar</th><th className="px-4 py-3 text-right">Penghasilan Seller</th><th className="px-4 py-3 text-right">HPP</th><th className="px-4 py-3 text-right">Estimasi Kotor</th><th className="px-4 py-3">Catatan</th></tr></thead><tbody className="divide-y divide-slate-100 text-slate-700">{data.orders.data.length === 0 ? <tr><td colSpan={11} className="px-4 py-10 text-center text-slate-400">Tidak ada order pada rentang ini.</td></tr> : data.orders.data.map((order) => <tr key={order.no_pesanan || `${order.orderDate}-${order.itemCount}`} className="align-top hover:bg-slate-50"><td className="whitespace-nowrap px-4 py-3">{formatDate(order.orderDate)}</td><td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">{order.no_pesanan || '—'}</td><td className="px-4 py-3">{order.statusPesanan || '—'}</td><td className="px-4 py-3"><StatusBadge status={order.estimationStatus} reasons={order.reasons} /></td><td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatIdr(order.sellerSubtotal)}</td><td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-rose-700">{formatIdr(order.sellerVoucher)}</td><td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-rose-700">{formatIdr(order.estimatedShopeeFees)}</td><td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatIdr(order.estimatedSellerIncome)}</td><td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatIdr(order.totalHpp)}</td><td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-purple-700">{formatIdr(order.estimasiKotor)}</td><td className="min-w-64 px-4 py-3 text-xs leading-5 text-slate-500">{reasonText(order.reasons)}</td></tr>)}</tbody></table></div>{totalPages > 1 && <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3"><button type="button" disabled={page <= 1 || loading} onClick={() => void load(page - 1, limit)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="h-4 w-4" /> Sebelumnya</button><span className="text-xs text-slate-500">Halaman {page} dari {totalPages} · {data.orders.total} order</span><button type="button" disabled={page >= totalPages || loading} onClick={() => void load(page + 1, limit)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Berikutnya <ChevronRight className="h-4 w-4" /></button></div>}</section>
        </>}
      </>}
    </div></div>
  );
}
