'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { AlertTriangle, BarChart3, ChevronLeft, ChevronRight, LockKeyhole, RefreshCw } from 'lucide-react';
import { useStore } from '@/components/StoreContext';

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
  estimatedGrossBeforeFeeAds: number;
  adsSpend: number;
  estimatedAdsPpn: number;
  afterAds: number;
  afterAdsAndPpn: number;
};

type EstimationPayload = {
  success: true;
  storeId: number;
  skuImport: { id: number; sourceFile: string; importedAt: string } | null;
  dateRange: { dateFrom: string | null; dateTo: string | null };
  summary: {
    totalOrderCount: number;
    eligibleOrderCount: number;
    estimatedOrderCount: number;
    hppIncompleteOrderCount: number;
    reviewOrderCount: number;
    excludedOrderCount: number;
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
  needs_review: 'Perlu Review',
  not_eligible: 'Tidak Eligible',
};

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

function StatusBadge({ status }: { status: EstimationStatus }) {
  const colors: Record<EstimationStatus, string> = {
    estimable: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    hpp_incomplete: 'bg-amber-50 text-amber-700 border-amber-200',
    needs_review: 'bg-orange-50 text-orange-700 border-orange-200',
    not_eligible: 'bg-slate-100 text-slate-600 border-slate-200',
  };
  return <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${colors[status]}`}>{STATUS_COPY[status]}</span>;
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
  const [tab, setTab] = useState<'estimate' | 'actual'>('estimate');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [data, setData] = useState<EstimationPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const requestSequence = useRef(0);

  const resetResult = useCallback(() => {
    requestSequence.current += 1;
    setData(null); setError(''); setPage(1); setLoading(false);
  }, []);

  const load = useCallback(async (nextPage = 1, nextLimit = limit) => {
    if (!storeId) return;
    const requestId = ++requestSequence.current;
    setLoading(true); setError(''); setData(null);
    try {
      const params = new URLSearchParams({ storeId, page: String(nextPage), limit: String(nextLimit) });
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
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
  }, [dateFrom, dateTo, limit, storeId]);

  const totalPages = useMemo(() => data ? Math.max(1, Math.ceil(data.orders.total / data.orders.limit)) : 1, [data]);
  const updateDate = (target: 'from' | 'to', value: string) => { target === 'from' ? setDateFrom(value) : setDateTo(value); resetResult(); };

  return (
    <div className="p-4 lg:p-8"><div className="mx-auto max-w-7xl">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3"><div className="rounded-xl bg-purple-50 p-3 text-purple-700"><BarChart3 className="h-6 w-6" /></div><div><h1 className="text-2xl font-bold text-slate-900 lg:text-3xl">Profit & Estimasi</h1><p className="mt-1 text-sm text-slate-600">Monitoring estimasi kotor seller, HPP, dan Ads untuk {activeStoreName}.</p></div></div>
        <span className="inline-flex w-fit rounded-full border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-semibold text-purple-700">Toko aktif: {activeStoreName}</span>
      </div>
      <div className="mb-5 flex gap-2 border-b border-slate-200">
        <button type="button" onClick={() => setTab('estimate')} className={`border-b-2 px-3 py-2 text-sm font-semibold ${tab === 'estimate' ? 'border-purple-600 text-purple-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>Estimasi Kotor</button>
        <button type="button" onClick={() => setTab('actual')} className={`border-b-2 px-3 py-2 text-sm font-semibold ${tab === 'actual' ? 'border-purple-600 text-purple-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>Profit Aktual</button>
      </div>
      {tab === 'actual' ? <section className="rounded-xl border border-slate-200 bg-white p-5 lg:p-6"><div className="flex items-start gap-3"><div className="rounded-lg bg-slate-100 p-2 text-slate-600"><LockKeyhole className="h-5 w-5" /></div><div><h2 className="font-semibold text-slate-900">Profit Aktual — Belum Tersedia</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Fase ini menunggu kontrak settlement `Penghasilan / Order`, return/refund, QC stok, serta biaya eksternal. Estimasi Kotor bukan pengganti angka profit aktual.</p></div></div></section> : <>
        <section className="mb-5 rounded-xl border border-purple-200 bg-purple-50 p-4 lg:p-5"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-purple-700" /><div className="text-sm leading-6 text-purple-950"><h2 className="font-semibold">Estimasi Kotor Setelah HPP</h2><p>Basis memakai Subtotal Pesanan seller, dikurangi voucher seller, potongan standar Shopee, lalu HPP item. Tidak menunggu Income, settlement, atau cohort historis. Komisi program khusus seperti AMS belum masuk estimasi standar.</p></div></div></section>
        <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4 lg:p-5"><div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <label className="text-sm font-medium text-slate-700">Dari tanggal <span className="font-normal text-slate-400">(opsional)</span><input type="date" value={dateFrom} onChange={(event) => updateDate('from', event.target.value)} className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-100" /></label>
          <label className="text-sm font-medium text-slate-700">Sampai tanggal <span className="font-normal text-slate-400">(opsional)</span><input type="date" value={dateTo} onChange={(event) => updateDate('to', event.target.value)} className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-100" /></label>
          <div className="flex gap-2"><button type="button" onClick={() => void load(1, limit)} disabled={!storeId || loading} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />{loading ? 'Memuat…' : 'Muat Estimasi'}</button><button type="button" onClick={resetResult} disabled={!data && !error && !loading} className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">Reset</button></div>
        </div><p className="mt-3 text-xs leading-5 text-slate-500">Tidak ada pengecekan otomatis. Rentang kosong membaca seluruh data aktif toko.</p></section>
        {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
        {!data && !loading && !error && <section className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">Tentukan rentang bila diperlukan, lalu tekan <b>Muat Estimasi</b>.</section>}
        {loading && <section className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Menghitung Estimasi Kotor dan Ads Spend…</section>}
        {data && !loading && <>
          <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <SummaryCard label="Estimasi Kotor Setelah HPP" value={formatIdr(data.summary.estimatedGrossBeforeFeeAds)} detail={`${data.summary.estimatedOrderCount} order dengan basis dan HPP lengkap`} tone="purple" />
            <SummaryCard label="Ads Spend" value={formatIdr(data.summary.adsSpend)} detail="Deduction for Product Ad negatif" tone="rose" />
            <SummaryCard label="Estimasi PPN Iklan (11%)" value={formatIdr(data.summary.estimatedAdsPpn)} detail="Alokasi harian, bukan pajak RAW" tone="amber" />
            <SummaryCard label="Sisa Setelah Ads & PPN" value={formatIdr(data.summary.afterAdsAndPpn)} detail="Estimasi Kotor dikurangi biaya agregat Ads" tone="indigo" />
            <SummaryCard label="Perlu Tindak Lanjut" value={String(data.summary.hppIncompleteOrderCount + data.summary.reviewOrderCount)} detail={`${data.summary.hppIncompleteOrderCount} HPP belum lengkap · ${data.summary.reviewOrderCount} review`} tone="slate" />
          </div>
          <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600"><div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><span>Scope: <b className="text-slate-800">{data.dateRange.dateFrom ? formatDate(data.dateRange.dateFrom) : 'semua tanggal'}</b>{data.dateRange.dateTo && <> s.d. <b className="text-slate-800">{formatDate(data.dateRange.dateTo)}</b></>}</span><span>{data.summary.excludedOrderCount} order tidak eligible · {data.summary.adsDuplicateEventCount} event Ads overlap dilewati</span></div>{data.skuImport ? <p className="mt-2 text-xs text-slate-500">HPP memakai Master SKU import terbaru: {data.skuImport.sourceFile} · {formatDate(data.skuImport.importedAt)}.</p> : <p className="mt-2 text-xs font-medium text-amber-700">Master SKU belum tersedia. Semua order yang memerlukan HPP akan ditandai HPP Belum Lengkap.</p>}</div>
          <section className="mb-5 overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="border-b border-slate-200 px-4 py-4 lg:px-5"><h2 className="font-semibold text-slate-900">Ringkasan Harian</h2><p className="mt-1 text-sm text-slate-500">Estimasi kotor menggunakan formula standar sebelum settlement. Ads dan PPN tetap biaya agregat harian toko.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[1060px] text-sm"><thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600"><tr><th className="px-4 py-3">Tanggal</th><th className="px-4 py-3 text-right">Order Estimasi</th><th className="px-4 py-3 text-right">HPP Belum Lengkap</th><th className="px-4 py-3 text-right">Review</th><th className="px-4 py-3 text-right">Estimasi Kotor</th><th className="px-4 py-3 text-right">Ads Spend</th><th className="px-4 py-3 text-right">Estimasi PPN (11%)</th><th className="px-4 py-3 text-right">Sisa Setelah Ads & PPN</th></tr></thead><tbody className="divide-y divide-slate-100 text-slate-700">{data.daily.length === 0 ? <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">Tidak ada data dalam rentang ini.</td></tr> : data.daily.map((row) => <tr key={row.date} className="hover:bg-slate-50"><td className="px-4 py-3 font-medium">{formatDate(row.date)}</td><td className="px-4 py-3 text-right tabular-nums">{row.estimatedOrderCount}</td><td className="px-4 py-3 text-right tabular-nums text-amber-700">{row.hppIncompleteOrderCount}</td><td className="px-4 py-3 text-right tabular-nums text-orange-700">{row.reviewOrderCount}</td><td className="px-4 py-3 text-right font-medium tabular-nums">{formatIdr(row.estimatedGrossBeforeFeeAds)}</td><td className="px-4 py-3 text-right font-medium tabular-nums text-rose-700">{formatIdr(row.adsSpend)}</td><td className="px-4 py-3 text-right font-medium tabular-nums text-amber-700">{formatIdr(row.estimatedAdsPpn)}</td><td className="px-4 py-3 text-right font-semibold tabular-nums text-indigo-700">{formatIdr(row.afterAdsAndPpn)}</td></tr>)}</tbody></table></div></section>
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 lg:flex-row lg:items-center lg:justify-between lg:px-5"><div><h2 className="font-semibold text-slate-900">Estimasi Per Order</h2><p className="mt-1 text-sm text-slate-500">Subtotal seller dan voucher seller dibaca dari Order.all; potongan standar dihitung otomatis.</p></div><label className="text-xs font-semibold text-slate-600">Baris per halaman<select value={limit} onChange={(event) => void load(1, Number(event.target.value))} className="ml-2 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm font-normal text-slate-800">{[10, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}</select></label></div><div className="overflow-x-auto"><table className="w-full min-w-[1300px] text-sm"><thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600"><tr><th className="px-4 py-3">Tanggal</th><th className="px-4 py-3">No. Pesanan</th><th className="px-4 py-3">Status Shopee</th><th className="px-4 py-3">Status Estimasi</th><th className="px-4 py-3 text-right">Subtotal Seller</th><th className="px-4 py-3 text-right">Voucher Seller</th><th className="px-4 py-3 text-right">Potongan Standar</th><th className="px-4 py-3 text-right">Penghasilan Seller</th><th className="px-4 py-3 text-right">HPP</th><th className="px-4 py-3 text-right">Estimasi Kotor</th><th className="px-4 py-3">Catatan</th></tr></thead><tbody className="divide-y divide-slate-100 text-slate-700">{data.orders.data.length === 0 ? <tr><td colSpan={11} className="px-4 py-10 text-center text-slate-400">Tidak ada order pada rentang ini.</td></tr> : data.orders.data.map((order) => <tr key={order.no_pesanan || `${order.orderDate}-${order.itemCount}`} className="align-top hover:bg-slate-50"><td className="whitespace-nowrap px-4 py-3">{formatDate(order.orderDate)}</td><td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">{order.no_pesanan || '—'}</td><td className="px-4 py-3">{order.statusPesanan || '—'}</td><td className="px-4 py-3"><StatusBadge status={order.estimationStatus} /></td><td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatIdr(order.sellerSubtotal)}</td><td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-rose-700">{formatIdr(order.sellerVoucher)}</td><td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-rose-700">{formatIdr(order.estimatedShopeeFees)}</td><td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatIdr(order.estimatedSellerIncome)}</td><td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatIdr(order.totalHpp)}</td><td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-purple-700">{formatIdr(order.estimasiKotor)}</td><td className="min-w-64 px-4 py-3 text-xs leading-5 text-slate-500">{reasonText(order.reasons)}</td></tr>)}</tbody></table></div>{totalPages > 1 && <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3"><button type="button" disabled={page <= 1 || loading} onClick={() => void load(page - 1, limit)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="h-4 w-4" /> Sebelumnya</button><span className="text-xs text-slate-500">Halaman {page} dari {totalPages} · {data.orders.total} order</span><button type="button" disabled={page >= totalPages || loading} onClick={() => void load(page + 1, limit)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Berikutnya <ChevronRight className="h-4 w-4" /></button></div>}</section>
        </>}
      </>}
    </div></div>
  );
}
