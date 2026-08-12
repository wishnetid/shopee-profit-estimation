'use client';

import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, XCircle, Loader2, Eye, ArrowLeft, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';

const directoryInputProps = { webkitdirectory: '' } as unknown as InputHTMLAttributes<HTMLInputElement>;
import { useStore } from '@/components/StoreContext';
const { createBulkQueue, eligibleQueueItems, requeueFailedItems, summarizeQueue } = require('@/lib/bulk-upload-queue.js') as {
  createBulkQueue: (files: File[]) => BulkQueueItem[];
  eligibleQueueItems: (queue: BulkQueueItem[]) => BulkQueueItem[];
  requeueFailedItems: (queue: BulkQueueItem[]) => BulkQueueItem[];
  summarizeQueue: (queue: BulkQueueItem[]) => BulkQueueSummary;
};

type Step = 'select' | 'preview' | 'bulk' | 'done';

interface DiffChange {
  column: string;
  dbColumn: string;
  from: string;
  to: string;
  protected?: boolean;
}

interface UpdatedRow {
  no_pesanan: string;
  sku: string;
  variasi: string;
  changes: DiffChange[];
  regressions: { type: string; column: string; from: string; to: string; message: string }[];
}

interface PreviewColumn {
  key: string;
  label: string;
}

interface PreviewData {
  fileName: string;
  fileSize: number;
  reportType: string;
  totalRows: number;
  newRows: number;
  existingRows: number;
  unchangedRows: number;
  regressionCount: number;
  safeUpdateRows: number;
  protectedFieldCount: number;
  staleSnapshotCount: number;
  sourceSnapshotAt: string | null;
  updatedRows: UpdatedRow[];
  headers: string[];
  previewColumns: PreviewColumn[];
  previewRows: Record<string, any>[];
  sheetName: string;
  canImport?: boolean;
  duplicateHash?: boolean;
  sha256?: string;
  reportPeriod?: { from: string | null; to: string | null };
  reconciliation?: { status: string; summaryTotal: number | null; orderSignedTotal: number | null; difference: number | null };
  sections?: Record<string, { status: string; rows: number }>;
  previewTicket?: string | null;
}

interface ImportResult {
  message: string;
  rowsImported: number;
  rowsUpdated: number;
  rowsGuarded: number;
  protectedFields: number;
  errors: number;
}

type BulkPreview = {
  reportType: string;
  totalRows: number;
  canImport: boolean;
  duplicateHash: boolean;
  previewTicket: string | null;
  sha256: string | null;
  reportPeriod?: { from: string | null; to: string | null };
  reconciliation?: { status: string } | null;
  ledgerContinuity?: { status: string } | null;
};

type BulkQueueItem = {
  id: string;
  file: File;
  selected: boolean;
  status: 'pending' | 'checking' | 'ready' | 'duplicate' | 'invalid' | 'rejected' | 'importing' | 'imported' | 'failed';
  reportType: string | null;
  preview: BulkPreview | null;
  error: string | null;
  result: ImportResult | null;
};

type BulkQueueSummary = Record<'total' | 'pending' | 'checking' | 'ready' | 'duplicate' | 'invalid' | 'rejected' | 'importing' | 'imported' | 'failed' | 'selected' | 'selectedRows', number>;

export default function UploadPage() {
  const { storeId, activeStore } = useStore();
  const [step, setStep] = useState<Step>('select');
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewStoreId, setPreviewStoreId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [checking, setChecking] = useState(false);
  const [showDiff, setShowDiff] = useState(true);
  const [sourceSnapshotAt, setSourceSnapshotAt] = useState('');
  const [bulkQueue, setBulkQueue] = useState<BulkQueueItem[]>([]);
  const [bulkStoreId, setBulkStoreId] = useState<string | null>(null);
  const [bulkRunning, setBulkRunning] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bulkFileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const previewRequestRef = useRef(0);
  const importRequestRef = useRef(0);
  const bulkRequestRef = useRef(0);

  useEffect(() => {
    previewRequestRef.current += 1;
    importRequestRef.current += 1;
    const timer = window.setTimeout(() => {
      setStep('select');
      setPreview(null);
      setPreviewStoreId(null);
      setImporting(false);
      setResult(null);
      setError(null);
      setSelectedFile(null);
      setChecking(false);
      setShowDiff(true);
      setSourceSnapshotAt('');
      setBulkQueue([]);
      setBulkStoreId(null);
      setBulkRunning(false);
      bulkRequestRef.current += 1;
      if (fileRef.current) fileRef.current.value = '';
      if (bulkFileRef.current) bulkFileRef.current.value = '';
      if (folderRef.current) folderRef.current.value = '';
    }, 0);
    return () => window.clearTimeout(timer);
  }, [storeId]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 1) void queueFiles(files);
    else if (files.length === 1) void pickFile(files[0]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) void pickFile(e.target.files[0]);
  };

  const updateBulkItem = (id: string, patch: Partial<BulkQueueItem>) => {
    setBulkQueue((queue) => queue.map((item) => item.id === id ? { ...item, ...patch } : item));
  };

  const queueFiles = async (files: File[]) => {
    if (!storeId) { setError('Pilih toko aktif terlebih dahulu.'); return; }
    if (!files.length) return;
    const selectedStoreId = storeId;
    const requestId = ++bulkRequestRef.current;
    const queue = createBulkQueue(files);
    setBulkQueue(queue);
    setBulkStoreId(selectedStoreId);
    setBulkRunning(true);
    setError(null);
    setStep('bulk');

    for (const item of queue) {
      if (item.status === 'rejected') continue;
      if (requestId !== bulkRequestRef.current || selectedStoreId !== storeId) return;
      updateBulkItem(item.id, { status: 'checking', error: null });
      const formData = new FormData();
      formData.append('file', item.file);
      formData.append('storeId', selectedStoreId);
      formData.append('action', 'preview');
      formData.append('source_snapshot_at', sourceSnapshotAt);
      formData.append('source_snapshot_file', item.file.name);
      try {
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (requestId !== bulkRequestRef.current || selectedStoreId !== storeId) return;
        if (!res.ok) {
          updateBulkItem(item.id, { status: 'invalid', error: data.error || 'Preview gagal.' });
          continue;
        }
        const preview: BulkPreview = {
          reportType: data.reportType,
          totalRows: data.totalRows ?? Object.values(data.sections || {}).reduce((sum: number, section: any) => sum + (section.rows || 0), 0),
          canImport: Boolean(data.canImport),
          duplicateHash: Boolean(data.duplicateHash),
          previewTicket: data.previewTicket || null,
          sha256: data.sha256 || null,
          reportPeriod: data.reportPeriod,
          reconciliation: data.reconciliation || null,
          ledgerContinuity: data.ledgerContinuity || null,
        };
        const duplicate = preview.duplicateHash || !preview.canImport;
        updateBulkItem(item.id, {
          status: duplicate ? 'duplicate' : 'ready',
          selected: !duplicate,
          reportType: preview.reportType,
          preview,
          error: duplicate ? 'File identik atau tidak memiliki perubahan aman untuk di-import.' : null,
        });
      } catch (err: any) {
        if (requestId !== bulkRequestRef.current || selectedStoreId !== storeId) return;
        updateBulkItem(item.id, { status: 'invalid', error: err.message || 'Preview gagal.' });
      }
    }
    if (requestId === bulkRequestRef.current && selectedStoreId === storeId) setBulkRunning(false);
  };

  const handleBulkSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files?.length) void queueFiles(Array.from(event.target.files));
    event.target.value = '';
  };

  const toggleBulkItem = (id: string) => {
    setBulkQueue((queue) => queue.map((item) => item.id === id && item.status === 'ready' ? { ...item, selected: !item.selected } : item));
  };

  const retryBulkFailed = () => {
    if (bulkRunning) return;
    setBulkQueue((queue) => requeueFailedItems(queue));
    setError(null);
  };

  const handleBulkImport = async () => {
    if (!bulkStoreId || bulkStoreId !== storeId) {
      setError('Toko aktif berubah. Jalankan Bulk Preview ulang.');
      return;
    }
    const items = eligibleQueueItems(bulkQueue);
    if (!items.length) return;
    const requestId = ++bulkRequestRef.current;
    setBulkRunning(true);
    setError(null);
    for (const item of items) {
      if (requestId !== bulkRequestRef.current || bulkStoreId !== storeId) return;
      updateBulkItem(item.id, { status: 'importing', error: null });
      const formData = new FormData();
      formData.append('file', item.file);
      formData.append('storeId', bulkStoreId);
      formData.append('action', 'import');
      formData.append('source_snapshot_at', sourceSnapshotAt);
      formData.append('source_snapshot_file', item.file.name);
      if (item.preview?.previewTicket) formData.append('preview_ticket', item.preview.previewTicket);
      try {
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (requestId !== bulkRequestRef.current || bulkStoreId !== storeId) return;
        if (!res.ok) {
          updateBulkItem(item.id, { status: 'failed', error: data.error || 'Import gagal.' });
          continue;
        }
        updateBulkItem(item.id, {
          status: 'imported',
          selected: false,
          result: {
            message: data.message,
            rowsImported: data.rowsImported || 0,
            rowsUpdated: data.rowsUpdated || 0,
            rowsGuarded: data.rowsGuarded || 0,
            protectedFields: data.protectedFields || 0,
            errors: data.errors || 0,
          },
        });
      } catch (err: any) {
        if (requestId !== bulkRequestRef.current || bulkStoreId !== storeId) return;
        updateBulkItem(item.id, { status: 'failed', error: err.message || 'Import gagal.' });
      }
    }
    if (requestId === bulkRequestRef.current && bulkStoreId === storeId) setBulkRunning(false);
  };

  const pickFile = async (file: File) => {
    if (!storeId) { setError('Pilih toko aktif terlebih dahulu.'); return; }
    const selectedStoreId = storeId;
    const requestId = ++previewRequestRef.current;
    const ext = file.name.toLowerCase().split('.').pop();
    if (!['xlsx', 'xls', 'csv'].includes(ext || '')) {
      setError('Format file tidak didukung. Gunakan .xlsx, .xls, atau .csv');
      return;
    }
    setSelectedFile(file);
    setError(null);
    setStep('preview');
    setChecking(true);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('storeId', selectedStoreId);
    formData.append('action', 'preview');
    formData.append('source_snapshot_at', sourceSnapshotAt);
    formData.append('source_snapshot_file', file.name);

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (requestId !== previewRequestRef.current || selectedStoreId !== storeId) return;
      if (!res.ok) {
        setError(data.error || 'Gagal memproses file');
        setStep('select');
        setChecking(false);
        return;
      }
      setPreviewStoreId(selectedStoreId);
      setPreview({
        fileName: file.name,
        fileSize: file.size,
        reportType: data.reportType,
        totalRows: data.totalRows ?? Object.values(data.sections || {}).reduce((sum: number, item: any) => sum + (item.rows || 0), 0),
        newRows: data.newRows ?? 0,
        existingRows: data.existingRows ?? 0,
        unchangedRows: data.unchangedRows ?? 0,
        regressionCount: data.regressionCount || 0,
        safeUpdateRows: data.safeUpdateRows || 0,
        protectedFieldCount: data.protectedFieldCount || 0,
        staleSnapshotCount: data.staleSnapshotCount || 0,
        sourceSnapshotAt: data.sourceSnapshotAt || null,
        updatedRows: data.updatedRows || [],
        headers: (data.headers || []).map((header: any) => typeof header === 'string' ? header : header.label),
        previewColumns: (data.previewColumns || ['no_pesanan', 'lihat_berdasarkan', 'signed_total']).map((column: any) => (
          typeof column === 'string' ? { key: column, label: column } : column
        )),
        previewRows: data.previewRows || [],
        sheetName: data.sheetName || data.sourceFormat || 'Source package',
        canImport: data.canImport,
        duplicateHash: data.duplicateHash,
        sha256: data.sha256,
        reportPeriod: data.reportPeriod,
        reconciliation: data.reconciliation,
        sections: data.sections,
        previewTicket: data.previewTicket || null,
      });
    } catch (err: any) {
      if (requestId === previewRequestRef.current && selectedStoreId === storeId) {
        setError(err.message);
        setStep('select');
      }
    }
    if (requestId === previewRequestRef.current && selectedStoreId === storeId) setChecking(false);
  };

  const changeCount = preview?.safeUpdateRows || 0;
  const canImport = !!preview && (preview.canImport ?? (preview.newRows > 0 || changeCount > 0));
  const isIncomePreview = preview?.reportType === 'Income Penghasilan';
  const previewReportLabel = preview?.reportType || 'RAW package';

  const handleImport = async () => {
    if (!selectedFile || !preview || !canImport || !previewStoreId) return;
    if (previewStoreId !== storeId) {
      setError('Toko aktif berubah. Preview dibatalkan; pilih file lagi untuk toko aktif.');
      setStep('select');
      setPreview(null);
      setPreviewStoreId(null);
      setSelectedFile(null);
      return;
    }
    const targetStoreId = previewStoreId;
    const requestId = ++importRequestRef.current;
    setImporting(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('storeId', previewStoreId);
    formData.append('action', 'import');
    formData.append('source_snapshot_at', sourceSnapshotAt);
    formData.append('source_snapshot_file', selectedFile.name);
    if (preview.previewTicket) formData.append('preview_ticket', preview.previewTicket);

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (requestId !== importRequestRef.current || targetStoreId !== storeId) return;
      if (!res.ok) {
        setError(data.error || 'Import gagal');
        return;
      }
      setResult({
        message: data.message,
        rowsImported: data.rowsImported,
        rowsUpdated: data.rowsUpdated,
        rowsGuarded: data.rowsGuarded || 0,
        protectedFields: data.protectedFields || 0,
        errors: data.errors,
      });
      setStep('done');
    } catch (err: any) {
      if (requestId === importRequestRef.current && targetStoreId === storeId) setError(err.message);
    }
    if (requestId === importRequestRef.current && targetStoreId === storeId) setImporting(false);
  };

  const reset = () => {
    previewRequestRef.current += 1;
    importRequestRef.current += 1;
    bulkRequestRef.current += 1;
    setStep('select');
    setPreview(null);
    setPreviewStoreId(null);
    setResult(null);
    setError(null);
    setSelectedFile(null);
    setChecking(false);
    setImporting(false);
    setSourceSnapshotAt('');
    setBulkQueue([]);
    setBulkStoreId(null);
    setBulkRunning(false);
    if (fileRef.current) fileRef.current.value = '';
    if (bulkFileRef.current) bulkFileRef.current.value = '';
    if (folderRef.current) folderRef.current.value = '';
  };

  const formatSize = (bytes: number) =>
    bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
  const bulkSummary = summarizeQueue(bulkQueue);
  const bulkEligible = eligibleQueueItems(bulkQueue);
  const bulkStatusLabel: Record<BulkQueueItem['status'], string> = {
    pending: 'Menunggu', checking: 'Preview', ready: 'Siap', duplicate: 'Duplikat', invalid: 'Invalid', rejected: 'Ditolak', importing: 'Import', imported: 'Berhasil', failed: 'Gagal',
  };
  const bulkStatusClass: Record<BulkQueueItem['status'], string> = {
    pending: 'bg-slate-100 text-slate-600', checking: 'bg-blue-100 text-blue-700', ready: 'bg-emerald-100 text-emerald-700', duplicate: 'bg-amber-100 text-amber-700', invalid: 'bg-red-100 text-red-700', rejected: 'bg-red-100 text-red-700', importing: 'bg-blue-100 text-blue-700', imported: 'bg-emerald-100 text-emerald-700', failed: 'bg-red-100 text-red-700',
  };

  // ── SELECT STEP ──
  if (step === 'select') {
    return (
      <div className="p-4 lg:p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 mb-1">Upload Manager</h1>
          <p className="text-sm text-slate-600 mb-6">Preview lalu import Order.all, Income, Balance, Cancellation, Failed Delivery, Return/Refund, Ads CSV untuk toko {activeStore?.store_name || 'aktif'}. Master SKU tetap shared.</p>

          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-4">
            <label htmlFor="source-snapshot-at" className="block text-sm font-semibold text-amber-900 mb-1">
              Waktu snapshot/export <span className="text-red-600">*</span>
            </label>
            <input
              id="source-snapshot-at"
              type="datetime-local"
              value={sourceSnapshotAt}
              onChange={(e) => { setSourceSnapshotAt(e.target.value); setError(null); }}
              className="w-full max-w-sm px-3 py-2 border border-amber-300 rounded-lg bg-white text-sm text-slate-900"
            />
            <p className="mt-1.5 text-xs text-amber-800">
              Wajib untuk <strong>Order.all</strong>. Isi waktu saat report diexport/diunduh dari Shopee, bukan waktu order dibuat. Dipakai untuk menahan snapshot lama agar tidak menimpa snapshot lebih baru.
            </p>
          </div>

          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-8 lg:p-12 text-center transition-colors ${
              isDragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-white'
            }`}
          >
            <Upload className="w-10 h-10 text-slate-400 mx-auto mb-3" />
            <h3 className="text-base lg:text-lg font-semibold text-slate-900 mb-1">Drag & Drop File</h3>
            <p className="text-sm text-slate-500 mb-3">atau pilih file</p>
            <label className="inline-block px-5 py-2.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 cursor-pointer transition-colors">
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileSelect} className="hidden" />
              Pilih 1 File
            </label>
          </div>

          <div className="mt-4 grid gap-3 rounded-lg border border-violet-200 bg-violet-50 p-4 lg:grid-cols-[1fr_auto_auto] lg:items-center">
            <div>
              <h3 className="text-sm font-semibold text-violet-950">Bulk Preview Queue</h3>
              <p className="mt-1 text-xs text-violet-800">Pilih banyak file atau satu folder. Sistem menjalankan preview satu per satu tanpa write, lalu lo pilih package yang di-import.</p>
            </div>
            <label className="cursor-pointer rounded-lg border border-violet-300 bg-white px-4 py-2 text-center text-sm font-semibold text-violet-700 hover:bg-violet-100">
              <input ref={bulkFileRef} type="file" accept=".xlsx,.xls,.csv" multiple onChange={handleBulkSelect} className="hidden" />
              Pilih Banyak File
            </label>
            <label className="cursor-pointer rounded-lg bg-violet-700 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-violet-800">
              <input ref={folderRef} type="file" accept=".xlsx,.xls,.csv" multiple {...directoryInputProps} onChange={handleBulkSelect} className="hidden" />
              Pilih Folder
            </label>
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
          )}

          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-3 lg:p-4">
            <h3 className="text-sm font-semibold text-blue-900 mb-1.5">Auto-Detection</h3>
            <ul className="text-xs text-blue-800 space-y-0.5">
              <li>• <strong>Order.all:</strong> Sheet &quot;orders&quot;, 50+ kolom</li>
              <li>• <strong>Income:</strong> Sheet &quot;Penghasilan&quot;</li>
              <li>• <strong>Master SKU:</strong> Kolom SKU1 + Harga</li>
              <li>• <strong>Balance / Exceptions:</strong> Header transaksi atau exception Shopee</li>
              <li>• <strong>Ads RAW:</strong> CSV Urutan + Waktu + Deskripsi + Jumlah</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'bulk') {
    return (
      <div className="p-4 lg:p-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-4 flex items-center gap-3">
            <button onClick={reset} disabled={bulkRunning} className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-40">
              <ArrowLeft className="h-5 w-5 text-slate-600" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-900 lg:text-2xl">Bulk Queue</h1>
              <p className="text-sm text-slate-500">Preview berurutan. Tidak ada file yang di-import sebelum tombol Import Selected.</p>
            </div>
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-white p-3"><div className="text-xl font-bold text-slate-900">{bulkSummary.total}</div><div className="text-xs text-slate-500">File dipilih</div></div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3"><div className="text-xl font-bold text-emerald-700">{bulkSummary.ready}</div><div className="text-xs text-emerald-800">Siap dipilih</div></div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3"><div className="text-xl font-bold text-amber-700">{bulkSummary.duplicate}</div><div className="text-xs text-amber-800">Duplikat/no-op</div></div>
            <div className="rounded-lg border border-red-200 bg-red-50 p-3"><div className="text-xl font-bold text-red-700">{bulkSummary.invalid + bulkSummary.rejected + bulkSummary.failed}</div><div className="text-xs text-red-800">Perlu perhatian</div></div>
          </div>

          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <b>Order.all:</b> waktu snapshot/export di atas diterapkan pada semua Order.all dalam queue. Untuk snapshot historis dengan waktu export berbeda, jangan import sekaligus; preview dan import Order.all per snapshot agar guard freshness tetap benar.
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="w-10 px-3 py-3">Pilih</th>
                    <th className="px-3 py-3">File</th>
                    <th className="px-3 py-3">Report</th>
                    <th className="px-3 py-3">Periode isi file</th>
                    <th className="px-3 py-3 text-right">Rows</th>
                    <th className="px-3 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {bulkQueue.map((item) => (
                    <tr key={item.id} className="border-t border-slate-100 align-top">
                      <td className="px-3 py-3">
                        <input aria-label={`Pilih ${item.file.name}`} type="checkbox" checked={item.selected} disabled={item.status !== 'ready' || bulkRunning} onChange={() => toggleBulkItem(item.id)} />
                      </td>
                      <td className="max-w-[290px] px-3 py-3"><div className="truncate font-medium text-slate-800" title={item.file.name}>{item.file.name}</div><div className="mt-0.5 text-slate-400">{formatSize(item.file.size)}</div></td>
                      <td className="px-3 py-3 text-slate-700">{item.reportType || '—'}</td>
                      <td className="px-3 py-3 text-slate-700">{item.preview?.reportPeriod ? `${item.preview.reportPeriod.from || '—'} s/d ${item.preview.reportPeriod.to || '—'}` : '—'}</td>
                      <td className="px-3 py-3 text-right text-slate-700">{item.preview?.totalRows?.toLocaleString() || '—'}</td>
                      <td className="px-3 py-3"><span className={`rounded-full px-2 py-1 font-semibold ${bulkStatusClass[item.status]}`}>{bulkStatusLabel[item.status]}</span>{item.error && <div className="mt-1 max-w-xs text-red-600">{item.error}</div>}{item.preview?.reconciliation && <div className="mt-1 text-emerald-700">Rekonsiliasi: {item.preview.reconciliation.status}</div>}{item.preview?.ledgerContinuity && <div className="mt-1 text-emerald-700">Ledger: {item.preview.ledgerContinuity.status}</div>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button onClick={reset} disabled={bulkRunning} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40">Batal</button>
            {bulkSummary.failed > 0 && (
              <button onClick={retryBulkFailed} disabled={bulkRunning} className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-40">
                Retry Gagal ({bulkSummary.failed})
              </button>
            )}
            <button onClick={handleBulkImport} disabled={bulkRunning || bulkEligible.length === 0 || bulkStoreId !== storeId} className="rounded-lg bg-violet-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-violet-300">
              {bulkRunning ? 'Memproses...' : `Import Selected (${bulkEligible.length} file / ${bulkSummary.selectedRows.toLocaleString()} row)`}
            </button>
            <span className="text-xs text-slate-500">Import dijalankan satu per satu. Gagal satu file tidak membatalkan package lain. Retry hanya mengulang file gagal yang preview-nya masih valid.</span>
          </div>
        </div>
      </div>
    );
  }

  // ── PREVIEW STEP ──
  if (step === 'preview') {
    return (
      <div className="p-4 lg:p-8">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            <button onClick={reset} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            <div>
              <h1 className="text-xl lg:text-2xl font-bold text-slate-900">Preview Data</h1>
              <p className="text-sm text-slate-500">Review sebelum import ke database</p>
            </div>
          </div>

          {/* Loading state */}
          {checking && (
            <div className="bg-white border border-slate-200 rounded-lg p-8 text-center">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
              <p className="text-sm text-slate-600">Mengecek data di database...</p>
            </div>
          )}

          {/* File Info + DB Status */}
          {preview && previewStoreId === storeId && !checking && (
            <>
              <div className="bg-white border border-slate-200 rounded-lg p-4 mb-4">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="w-8 h-8 text-blue-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-900 truncate">{preview.fileName}</div>
                    <div className="text-xs text-slate-500">{formatSize(preview.fileSize)} • Sheet: {preview.sheetName}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-lg font-bold text-blue-600">{preview.totalRows.toLocaleString()}</div>
                    <div className="text-xs text-slate-500">rows di file</div>
                  </div>
                </div>

                {/* DB Comparison Stats — 4 categories */}
                <div className="mt-3 grid grid-cols-4 gap-2">
                  <div className={`p-2 rounded-lg text-center ${preview.newRows > 0 ? 'bg-green-50 border border-green-200' : 'bg-slate-50 border border-slate-200'}`}>
                    <div className={`text-xl font-bold ${preview.newRows > 0 ? 'text-green-600' : 'text-slate-400'}`}>{preview.newRows.toLocaleString()}</div>
                    <div className="text-xs text-slate-500">Baru</div>
                  </div>
                  <div className={`p-2 rounded-lg text-center ${preview.safeUpdateRows > 0 ? 'bg-amber-50 border border-amber-200' : 'bg-slate-50 border border-slate-200'}`}>
                    <div className={`text-xl font-bold ${preview.safeUpdateRows > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{preview.safeUpdateRows.toLocaleString()}</div>
                    <div className="text-xs text-slate-500">Update Aman</div>
                  </div>
                  <div className={`p-2 rounded-lg text-center ${preview.unchangedRows > 0 ? 'bg-slate-100 border border-slate-200' : 'bg-slate-50 border border-slate-200'}`}>
                    <div className={`text-xl font-bold ${preview.unchangedRows > 0 ? 'text-slate-500' : 'text-slate-400'}`}>{preview.unchangedRows.toLocaleString()}</div>
                    <div className="text-xs text-slate-500">Duplikat</div>
                  </div>
                  <div className="p-2 rounded-lg text-center bg-blue-50 border border-blue-200">
                    <div className="text-xl font-bold text-blue-600">{preview.totalRows.toLocaleString()}</div>
                    <div className="text-xs text-slate-500">Total</div>
                  </div>
                </div>

                {preview.sections && (
                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <h3 className="text-sm font-semibold text-slate-800">{previewReportLabel}</h3>
                      {isIncomePreview && (
                        <span className={`text-xs font-semibold ${preview.reconciliation?.status === 'matched' ? 'text-emerald-600' : 'text-red-600'}`}>
                          Rekonsiliasi {preview.reconciliation?.status === 'matched' ? 'cocok' : 'bermasalah'}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                      {Object.entries(preview.sections).map(([name, value]) => (
                        <div key={name} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                          <div className="text-slate-500">{name}</div>
                          <div className="font-semibold text-slate-800">{value.rows.toLocaleString()} row · {value.status}</div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 text-xs text-slate-600">
                      Periode: <b>{preview.reportPeriod?.from || '—'} s/d {preview.reportPeriod?.to || '—'}</b>
                      {preview.reconciliation && <> · Total yang dilepas: <b>{preview.reconciliation.summaryTotal?.toLocaleString('id-ID') || '—'}</b></>}
                    </div>
                    {preview.sha256 && <div className="mt-1 font-mono text-[10px] text-slate-400 break-all">SHA-256: {preview.sha256}</div>}
                  </div>
                )}
              </div>

              {/* Info banner */}
              {preview.newRows === 0 && preview.safeUpdateRows === 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-semibold text-amber-800">Tidak ada perubahan aman untuk di-import</div>
                    <div className="text-xs text-amber-700 mt-0.5">Data identik atau perbedaan yang terdeteksi berasal dari snapshot lama / nilai yang lebih kosong, sehingga DB dipertahankan.</div>
                  </div>
                </div>
              )}

              {preview.newRows > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 text-xs text-green-700">
                  {preview.newRows} baris baru akan di-insert.
                  {preview.safeUpdateRows > 0 && ` ${preview.safeUpdateRows} baris akan di-update aman.`}
                  {preview.unchangedRows > 0 && ` ${preview.unchangedRows} baris tetap.`}
                </div>
              )}

              {preview.newRows === 0 && preview.safeUpdateRows > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-xs text-amber-700">
                  {preview.safeUpdateRows} baris akan di-update aman. {preview.unchangedRows} baris tetap.
                </div>
              )}

              {/* Regression warning */}
              {preview.regressionCount > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-red-700">
                    <span className="font-semibold">{preview.regressionCount} baris dilindungi</span> — snapshot lama, nilai kosong, atau nilai tersamarkan tidak akan menimpa DB. {preview.protectedFieldCount} field dipertahankan.
                    <ul className="mt-1 list-disc list-inside space-y-0.5">
                      {preview.updatedRows.filter(r => r.regressions.length > 0).slice(0, 5).map((r, i) => (
                        <li key={i}>
                          <span className="font-mono">{r.no_pesanan}</span> — {r.regressions.map(reg => reg.message).join(', ')}
                        </li>
                      ))}
                      {preview.regressionCount > 5 && <li>... dan {preview.regressionCount - 5} lainnya</li>}
                    </ul>
                  </div>
                </div>
              )}

              {/* ── DIFF TABLE: Rows yang berubah ── */}
              {preview.updatedRows.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-lg overflow-hidden mb-4">
                  <button
                    onClick={() => setShowDiff(!showDiff)}
                    className="w-full p-3 border-b border-slate-200 flex items-center justify-between hover:bg-slate-50 transition-colors"
                  >
                    <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                      <span className="text-amber-500">●</span>
                      Perubahan yang terdeteksi ({preview.updatedRows.length} baris)
                    </h3>
                    {showDiff ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </button>
                  {showDiff && (
                    <div className="max-h-[400px] overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-slate-50 z-10">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold text-slate-600 border-b border-slate-200">No. Pesanan</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-600 border-b border-slate-200">SKU</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-600 border-b border-slate-200">Variasi</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-600 border-b border-slate-200">Perubahan</th>
                          </tr>
                        </thead>
                        <tbody>
                          {preview.updatedRows.map((row, i) => (
                            <tr key={i} className={`border-b border-slate-100 ${row.regressions.length > 0 ? 'bg-red-50/50' : 'hover:bg-amber-50/30'}`}>
                              <td className="px-3 py-2 font-mono text-slate-900 whitespace-nowrap">{row.no_pesanan}</td>
                              <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{row.sku}</td>
                              <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{row.variasi}</td>
                              <td className="px-3 py-2">
                                <div className="flex flex-wrap gap-1.5">
                                  {row.changes.map((ch, j) => {
                                    const isBlocked = row.regressions.some(r => r.column === ch.column);
                                    return (
                                      <span key={j} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded ${isBlocked ? 'bg-red-100 border border-red-200' : 'bg-slate-100'}`}>
                                        <span className="font-medium text-slate-600">{ch.column}:</span>
                                        <span className="text-red-500 line-through">{ch.from}</span>
                                        <span className="text-slate-400">→</span>
                                        <span className={`font-medium ${isBlocked ? 'text-red-400 line-through' : 'text-green-600'}`}>{ch.to}</span>
                                        {isBlocked && <span className="text-[10px] font-bold text-red-500 ml-0.5">BLOCKED</span>}
                                      </span>
                                    );
                                  })}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Preview Table — all rows */}
              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden mb-4">
                <div className="p-3 border-b border-slate-200">
                  <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                    <Eye className="w-4 h-4" /> Data Preview ({preview.previewRows.length} row)
                  </h3>
                </div>
                <div className="max-h-[400px] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-slate-50 z-10">
                      <tr>
                        {preview.previewColumns.map((column, columnIndex) => (
                          <th key={`${column.key}-${columnIndex}`} className="px-3 py-2 text-left font-semibold text-slate-600 whitespace-nowrap border-b border-slate-200">
                            {column.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.previewRows.map((row, i) => (
                        <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                          {preview.previewColumns.map((column, columnIndex) => (
                            <td key={`${column.key}-${columnIndex}`} className="px-3 py-2 text-slate-700 whitespace-nowrap max-w-[200px] truncate">
                              {row[column.key] != null ? String(row[column.key]) : <span className="text-slate-300">—</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Column List */}
              <details className="bg-white border border-slate-200 rounded-lg mb-4">
                <summary className="p-3 cursor-pointer text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  Semua Kolom ({preview.headers.length})
                </summary>
                <div className="px-3 pb-3 flex flex-wrap gap-1.5">
                  {preview.headers.map((header, index) => (
                    <span key={`${header}-${index}`} className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded">{header}</span>
                  ))}
                </div>
              </details>

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button onClick={reset} className="px-4 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors text-sm font-medium">
                  Batal
                </button>
                <button
                  onClick={handleImport}
                  disabled={importing || !canImport}
                  className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                    !canImport
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                      : 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed'
                  }`}
                >
                  {importing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Importing...
                    </>
                  ) : !canImport ? (
                    'Tidak ada perubahan'
                  ) : (
                    preview.sections ? (
                      `Import ${previewReportLabel}`
                    ) : (
                      <>
                        {preview.newRows > 0 ? `Import ${preview.newRows.toLocaleString()} baris baru` : 'Update snapshot'}
                        {changeCount > 0 && ` (+ ${changeCount.toLocaleString()} update)`}
                      </>
                    )
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── DONE STEP ──
  if (step === 'done' && result) {
    return (
      <div className="p-4 lg:p-8">
        <div className="max-w-lg mx-auto text-center">
          <div className="mb-4">
            {result.errors > 0 ? (
              <XCircle className="w-16 h-16 text-amber-500 mx-auto" />
            ) : (
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
            )}
          </div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-900 mb-2">Import Selesai</h1>
          <p className="text-sm text-slate-600 mb-6">{result.message}</p>

          <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
            <div className="grid grid-cols-4 gap-3 text-center">
              <div>
                <div className="text-2xl font-bold text-green-600">{result.rowsImported.toLocaleString()}</div>
                <div className="text-xs text-slate-500">Baru</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-600">{result.rowsUpdated.toLocaleString()}</div>
                <div className="text-xs text-slate-500">Di-update</div>
              </div>
              <div>
                <div className={`text-2xl font-bold ${result.rowsGuarded > 0 ? 'text-red-500' : 'text-slate-300'}`}>{result.rowsGuarded.toLocaleString()}</div>
                <div className="text-xs text-slate-500">Blocked</div>
              </div>
              <div>
                <div className={`text-2xl font-bold ${result.errors > 0 ? 'text-red-600' : 'text-slate-300'}`}>{result.errors}</div>
                <div className="text-xs text-slate-500">Errors</div>
              </div>
            </div>
          </div>

          <button onClick={reset} className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
            Upload Lagi
          </button>
        </div>
      </div>
    );
  }

  return null;
}
