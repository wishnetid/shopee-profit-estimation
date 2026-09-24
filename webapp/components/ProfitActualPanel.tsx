'use client';

import { Fragment, useState, type ReactNode } from 'react';

type QcStatus = 'belum_dinilai' | 'restock_layak' | 'rusak' | 'hilang';
type Item = { noPesanan: string; sourceType: string; sourceReference: string | null; sourceStatus: string | null; returnType?: string | null; returnVariant?: string | null; reason: string | null; quantity: number | null; amount: number | null; stockStatus: string | null; sourceFile: string; qcStatus?: QcStatus; qcNote?: string };
type Order = { no_pesanan: string; orderDate: string; statusPesanan: string | null; settlement: number | null; totalHpp: number; profitActual: number | null; releaseDate: string | null; bucket: string };
type OrderItem = { noPesanan: string; productName: string | null; skuReference: string | null; variation: string | null; quantity: number; returnedQuantity: number; returnStatus: string | null };
type View = 'actual' | 'completed_unsettled' | 'exception' | 'returns';
type Data = {
  dateRange: { dateFrom: string; dateTo: string; releaseDateFrom?: string; releaseDateTo?: string };
  summary: { settledNormal: number; completedUnsettled: number; settlementOutsideReleaseRange: number; pending: number; exception: number; cancelled: number; settlement: number; settlementExcluded: number; hpp: number; profit: number };
  orders: Order[]; exceptionDetails: Item[]; orderItems: OrderItem[]; returnQcReview: Item[];
};

const idr = (value: number | null) => value === null ? '—' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);
const qcLabels: Record<QcStatus, string> = { belum_dinilai: 'Belum dinilai', restock_layak: 'Restock layak', rusak: 'Rusak', hilang: 'Hilang' };

export default function ProfitActualPanel({ storeId, view }: { storeId: string; view: View }) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState('2026-08-01');
  const [dateTo, setDateTo] = useState('2026-08-31');
  const [releaseDateFrom, setReleaseDateFrom] = useState('');
  const [releaseDateTo, setReleaseDateTo] = useState('');
  const clear = () => setData(null);

  const load = async () => {
    if (!dateFrom || !dateTo || dateFrom > dateTo) { setError('Rentang Waktu Pesanan Dibuat tidak valid.'); return; }
    if ((releaseDateFrom && !/^\d{4}-\d{2}-\d{2}$/.test(releaseDateFrom)) || (releaseDateTo && !/^\d{4}-\d{2}-\d{2}$/.test(releaseDateTo)) || (releaseDateFrom && releaseDateTo && releaseDateFrom > releaseDateTo)) { setError('Rentang Tanggal Dana Dilepaskan tidak valid.'); return; }
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ storeId, dateFrom, dateTo });
      if (releaseDateFrom) params.set('releaseDateFrom', releaseDateFrom);
      if (releaseDateTo) params.set('releaseDateTo', releaseDateTo);
      const response = await fetch(`/api/profit-calculation?${params}`, { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw Error(body.error);
      setData(body);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Gagal memuat data.'); } finally { setLoading(false); }
  };

  const save = async (row: Item, status: QcStatus, note: string) => {
    if (!row.sourceReference) return;
    setSaving(row.sourceReference);
    try {
      const response = await fetch('/api/return-qc', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ storeId, noPengembalian: row.sourceReference, noPesanan: row.noPesanan, qcStatus: status, qcNote: note }) });
      const body = await response.json();
      if (!response.ok) throw Error(body.error);
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Gagal simpan QC.'); } finally { setSaving(null); }
  };

  const config: Record<View, { title: string; description: string }> = {
    actual: { title: 'Profit Aktual', description: 'Hanya pesanan selesai dengan settlement Penghasilan / Order dan HPP valid. Settlement yang terkena exception dipisahkan.' },
    completed_unsettled: { title: 'Selesai Belum Cair', description: 'Pesanan selesai di Order.all, tetapi settlement Penghasilan / Order belum ditemukan. Tidak dihitung sebagai Profit Aktual.' },
    exception: { title: 'Settlement Dikecualikan', description: 'Settlement cair yang belum boleh masuk Profit Aktual normal karena retur/refund, failed delivery, pembatalan, atau HPP perlu review.' },
    returns: { title: 'Retur & Refund', description: 'Return/refund, failed delivery, cancellation, adjustment, dan QC operasional. Tidak mengubah Profit Aktual normal.' },
  };
  const { title, description } = config[view];

  return <>
    <section className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"><b>{title}.</b><p className="mt-1">{description}</p></section>
    <section className="mb-5 overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="grid gap-px bg-slate-200 lg:grid-cols-2">
        <fieldset className="bg-white p-4 sm:p-5"><legend className="sr-only">Cohort Pesanan</legend>
          <p className="text-sm font-semibold text-slate-900">Cohort Pesanan</p>
          <p className="mt-1 text-xs text-slate-500">Berdasarkan Waktu Pesanan Dibuat.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <DateInput label="Dari tanggal pesanan dibuat" value={dateFrom} onChange={(value) => { setDateFrom(value); clear(); }} />
            <DateInput label="Sampai tanggal pesanan dibuat" value={dateTo} onChange={(value) => { setDateTo(value); clear(); }} />
          </div>
        </fieldset>
        <fieldset className="bg-white p-4 sm:p-5"><legend className="sr-only">Filter Settlement</legend>
          <p className="text-sm font-semibold text-slate-900">Filter Settlement <span className="font-normal text-slate-500">— opsional</span></p>
          <p className="mt-1 text-xs text-slate-500">Berdasarkan Tanggal Dana Dilepaskan. Hasil menjadi irisan dengan cohort pesanan.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <DateInput label="Dari tanggal dana dilepas" value={releaseDateFrom} onChange={(value) => { setReleaseDateFrom(value); clear(); }} />
            <DateInput label="Sampai tanggal dana dilepas" value={releaseDateTo} onChange={(value) => { setReleaseDateTo(value); clear(); }} />
          </div>
        </fieldset>
      </div>
      <div className="flex justify-end border-t border-slate-200 bg-slate-50 px-4 py-3 sm:px-5">
        <button onClick={() => void load()} disabled={!storeId || loading} className="w-full rounded-lg bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">{loading ? 'Memuat…' : `Muat ${title}`}</button>
      </div>
    </section>
    {error && <p className="mb-4 text-sm text-red-700">{error}</p>}
    {data && <Scope dateRange={data.dateRange} />}
    {data && (view === 'actual' ? <Actual data={data} /> : view === 'completed_unsettled' ? <CompletedUnsettled data={data} /> : view === 'exception' ? <Excluded data={data} /> : <Returns data={data} saving={saving} save={save} />)}
  </>;
}

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="text-sm font-medium text-slate-700">{label}<input type="date" value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 block w-full rounded border border-slate-300 p-2" /></label>; }
function Scope({ dateRange }: { dateRange: Data['dateRange'] }) { const filtered = Boolean(dateRange.releaseDateFrom || dateRange.releaseDateTo); return <p className="mb-4 text-sm text-slate-600">Cohort pesanan dibuat: <b>{dateRange.dateFrom}</b> s.d. <b>{dateRange.dateTo}</b>{filtered && <> · Settlement dilepas: <b>{dateRange.releaseDateFrom || 'semua sebelum'}</b> s.d. <b>{dateRange.releaseDateTo || 'semua sesudah'}</b> · <b>Mode: irisan cohort order + cash release</b></>}</p>; }

function Actual({ data }: { data: Data }) { return <><div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6"><Card label="Profit Aktual" value={idr(data.summary.profit)} detail={`${data.summary.settledNormal} pesanan normal`} /><Card label="Settlement Normal" value={idr(data.summary.settlement)} detail="Penghasilan / Order" /><Card label="Total HPP" value={idr(data.summary.hpp)} detail="HPP valid" /><Card label="Settlement Dikecualikan" value={idr(data.summary.settlementExcluded)} detail={`${data.summary.exception} pesanan · lihat tab audit`} /><Card label="Selesai Belum Cair" value={String(data.summary.completedUnsettled)} detail="Lihat tab audit terpisah" /><Card label="Cair di Luar Filter" value={String(data.summary.settlementOutsideReleaseRange)} detail="Ada settlement, tetapi di luar rentang dana dilepas" /></div><Table title="Profit Pesanan Selesai" scrollable headers={['Tanggal Dibuat', 'No. Pesanan', 'Dana Dilepas', 'Settlement', 'HPP', 'Profit Aktual']} rows={data.orders.filter((row) => row.bucket === 'settled_normal').map((row) => [row.orderDate, row.no_pesanan, row.releaseDate || '—', idr(row.settlement), idr(row.totalHpp), idr(row.profitActual)])} /></>; }
function CompletedUnsettled({ data }: { data: Data }) { const rows = data.orders.filter((row) => row.bucket === 'completed_unsettled'); return <><Card label="Selesai Belum Cair" value={String(rows.length)} detail="Selesai di Order.all, settlement Income belum ada" /><Table title="Pesanan Selesai Belum Cair" headers={['Tanggal Dibuat', 'No. Pesanan', 'Status Order', 'HPP', 'Settlement']} rows={rows.map((row) => [row.orderDate, row.no_pesanan, row.statusPesanan || '—', idr(row.totalHpp), idr(row.settlement)])} /></>; }

function Excluded({ data }: { data: Data }) {
  const rows = data.orders.filter((row) => row.bucket === 'exception' || row.bucket === 'hpp_issue'); const [open, setOpen] = useState<string | null>(null);
  const details = (id: string) => data.exceptionDetails.filter((row) => row.noPesanan === id).map((row) => { const reviewed = data.returnQcReview.find((entry) => entry.sourceReference === row.sourceReference); return { ...row, qcStatus: reviewed?.qcStatus, qcNote: reviewed?.qcNote }; });
  return <><div className="mb-5 grid gap-3 sm:grid-cols-2"><Card label="Settlement Dikecualikan" value={idr(data.summary.settlementExcluded)} detail={`${rows.length} pesanan tidak dihitung Profit Aktual normal`} /><Card label="Aturan saat ini" value="Audit dulu" detail="Belum ada alokasi refund/HPP otomatis" /></div><section className="overflow-hidden rounded-xl border bg-white"><div className="border-b p-4"><b>Settlement Dikecualikan</b><p className="mt-1 text-xs text-slate-500">Buka detail untuk melihat alasan, item terdampak, dan QC.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[950px] text-sm"><thead className="bg-slate-50"><tr>{['Tanggal', 'No. Pesanan', 'Settlement', 'Penyebab', 'Barang Terdampak', 'QC', 'Aksi'].map((label) => <th key={label} className="p-3 text-left">{label}</th>)}</tr></thead><tbody>{rows.map((order) => { const exceptionDetails = details(order.no_pesanan); const returned = data.orderItems.filter((item) => item.noPesanan === order.no_pesanan && item.returnedQuantity > 0); const hasReturn = exceptionDetails.some((item) => item.sourceType === 'return_refund'); return <Fragment key={order.no_pesanan}><tr className="border-t align-top"><td className="p-3">{order.orderDate}</td><td className="p-3 font-medium">{order.no_pesanan}</td><td className="p-3">{idr(order.settlement)}</td><td className="p-3">{hasReturn ? 'Retur/refund' : exceptionDetails.map((item) => item.sourceType).join(', ') || 'HPP perlu review'}</td><td className="p-3">{hasReturn ? `${returned.reduce((sum, item) => sum + item.returnedQuantity, 0)} pcs diretur` : '—'}</td><td className="p-3">{hasReturn ? (exceptionDetails.find((item) => item.qcStatus)?.qcStatus ? qcLabels[exceptionDetails.find((item) => item.qcStatus)!.qcStatus as QcStatus] : 'Belum dinilai') : '—'}</td><td className="p-3"><button type="button" onClick={() => setOpen(open === order.no_pesanan ? null : order.no_pesanan)} className="rounded border border-purple-300 px-3 py-1.5 text-xs font-semibold text-purple-700">{open === order.no_pesanan ? 'Tutup' : 'Lihat detail'}</button></td></tr>{open === order.no_pesanan && <tr className="border-t bg-slate-50"><td colSpan={7} className="p-4"><ExceptionDetail order={order} details={exceptionDetails} items={data.orderItems.filter((item) => item.noPesanan === order.no_pesanan)} /></td></tr>}</Fragment>; })}</tbody></table></div></section></>;
}

function ExceptionDetail({ order, details, items }: { order: Order; details: Item[]; items: OrderItem[] }) { return <div className="grid gap-4 lg:grid-cols-2"><div><b>Ringkasan settlement</b><dl className="mt-2 grid grid-cols-2 gap-2 text-sm"><dt>Status order</dt><dd>{order.statusPesanan || '—'}</dd><dt>Settlement dilepas</dt><dd>{idr(order.settlement)} {order.releaseDate ? `· ${order.releaseDate}` : ''}</dd><dt>Perlakuan</dt><dd>Dikecualikan sementara dari Profit Aktual normal</dd></dl></div><div><b>Bukti exception</b>{details.map((item, index) => <div key={`${item.sourceReference}-${index}`} className="mt-2 rounded border bg-white p-3 text-sm"><p><b>{item.sourceType === 'return_refund' ? 'Retur/refund' : 'Exception'}:</b> {item.sourceStatus || item.reason || '—'}</p><p>No. referensi: {item.sourceReference || '—'} · Qty: {item.quantity ?? '—'} · Nilai refund: {idr(item.amount)}</p><p>QC internal: {item.qcStatus ? qcLabels[item.qcStatus] : 'Belum dinilai'}</p></div>)}</div><div className="lg:col-span-2"><b>Item order</b><div className="mt-2 overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="bg-white"><tr>{['Produk / SKU', 'Variasi', 'Qty order', 'Qty retur', 'Status retur'].map((label) => <th key={label} className="p-2 text-left">{label}</th>)}</tr></thead><tbody>{items.map((item, index) => <tr key={index} className="border-t"><td className="p-2">{item.productName || item.skuReference || '—'}</td><td className="p-2">{item.variation || '—'}</td><td className="p-2">{item.quantity}</td><td className="p-2">{item.returnedQuantity}</td><td className="p-2">{item.returnStatus || (item.returnedQuantity > 0 ? 'Diretur' : 'Tidak terdampak')}</td></tr>)}</tbody></table></div></div></div>; }
function Returns({ data, saving, save }: { data: Data; saving: string | null; save: (row: Item, status: QcStatus, note: string) => Promise<void> }) { return <><section className="mb-5 overflow-hidden rounded-xl border border-amber-200 bg-white"><div className="border-b border-amber-200 bg-amber-50 p-4"><b>Return QC Internal</b><p className="mt-1 text-sm text-slate-600">Keputusan QC audit-only, belum ada dampak finansial otomatis.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[1150px] text-sm"><thead><tr>{['Order', 'No. Pengembalian', 'Qty', 'Alasan', 'QC', 'Catatan', 'Aksi'].map((label) => <th key={label} className="p-3 text-left">{label}</th>)}</tr></thead><tbody>{data.returnQcReview.map((row) => <QcRow key={row.sourceReference} row={row} saving={saving === row.sourceReference} save={save} />)}</tbody></table></div></section><Table title="Exception & Rekonsiliasi" headers={['Order', 'Jenis', 'Referensi', 'Status', 'Alasan', 'Qty', 'Nilai', 'Source RAW']} rows={data.exceptionDetails.map((row) => [row.noPesanan, row.sourceType, row.sourceReference || '—', row.sourceStatus || '—', row.reason || '—', row.quantity ?? '—', idr(row.amount), row.sourceFile])} /></>; }
function QcRow({ row, saving, save }: { row: Item; saving: boolean; save: (row: Item, status: QcStatus, note: string) => Promise<void> }) { const [status, setStatus] = useState<QcStatus>(row.qcStatus || 'belum_dinilai'); const [note, setNote] = useState(row.qcNote || ''); return <tr className="border-t"><td className="p-3">{row.noPesanan}</td><td className="p-3">{row.sourceReference}</td><td className="p-3">{row.quantity ?? '—'}</td><td className="p-3">{row.reason || '—'}</td><td className="p-3"><select value={status} onChange={(event) => setStatus(event.target.value as QcStatus)} className="rounded border p-2">{Object.entries(qcLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td><td className="p-3"><input value={note} maxLength={2000} onChange={(event) => setNote(event.target.value)} className="w-60 rounded border p-2" /></td><td className="p-3"><button disabled={saving} onClick={() => void save(row, status, note)} className="rounded bg-slate-800 px-3 py-2 text-white disabled:opacity-50">{saving ? 'Menyimpan…' : 'Simpan'}</button></td></tr>; }
function Card({ label, value, detail }: { label: string; value: string; detail: string }) { return <section className="rounded-xl border bg-white p-4"><p className="text-xs font-semibold uppercase text-slate-500">{label}</p><p className="mt-2 text-xl font-bold">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></section>; }
function Table({ title, headers, rows, scrollable = false }: { title: string; headers: string[]; rows: ReactNode[][]; scrollable?: boolean }) { return <section className="mt-5 overflow-hidden rounded-xl border bg-white"><div className="border-b p-4"><b>{title}</b>{scrollable && <p className="mt-1 text-xs text-slate-500">Menampilkan area 9 baris; scroll vertikal untuk baris lainnya.</p>}</div><div className={scrollable ? 'max-h-[437px] overflow-auto' : 'overflow-x-auto'}><table className="w-full min-w-[800px] text-sm"><thead className={scrollable ? 'sticky top-0 z-10 bg-slate-50' : 'bg-slate-50'}><tr>{headers.map((header) => <th key={header} className="p-3 text-left">{header}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={index} className="border-t">{row.map((cell, cellIndex) => <td key={cellIndex} className="p-3">{cell}</td>)}</tr>) : <tr><td className="p-6" colSpan={headers.length}>Tidak ada data.</td></tr>}</tbody></table></div></section>; }
