'use client';

import { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, XCircle, Loader2, Eye, ArrowLeft, AlertTriangle } from 'lucide-react';

type Step = 'select' | 'preview' | 'done';

interface PreviewData {
  fileName: string;
  fileSize: number;
  reportType: string;
  totalRows: number;
  newRows: number;
  existingRows: number;
  headers: string[];
  previewColumns: string[];
  previewRows: Record<string, any>[];
  sheetName: string;
}

interface ImportResult {
  message: string;
  rowsImported: number;
  rowsUpdated: number;
  errors: number;
}

export default function UploadPage() {
  const [step, setStep] = useState<Step>('select');
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [checking, setChecking] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) pickFile(files[0]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      pickFile(e.target.files[0]);
    }
  };

  const pickFile = async (file: File) => {
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
    formData.append('action', 'preview');

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Gagal memproses file');
        setStep('select');
        setChecking(false);
        return;
      }
      setPreview({
        fileName: file.name,
        fileSize: file.size,
        reportType: data.reportType,
        totalRows: data.totalRows,
        newRows: data.newRows,
        existingRows: data.existingRows,
        headers: data.headers,
        previewColumns: data.previewColumns,
        previewRows: data.previewRows,
        sheetName: data.sheetName,
      });
    } catch (err: any) {
      setError(err.message);
      setStep('select');
    }
    setChecking(false);
  };

  const handleImport = async () => {
    if (!selectedFile || !preview || preview.newRows === 0) return;
    setImporting(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('action', 'import');

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Import gagal');
        setImporting(false);
        return;
      }
      setResult({
        message: data.message,
        rowsImported: data.rowsImported,
        rowsUpdated: data.rowsUpdated,
        errors: data.errors,
      });
      setStep('done');
    } catch (err: any) {
      setError(err.message);
    }
    setImporting(false);
  };

  const reset = () => {
    setStep('select');
    setPreview(null);
    setResult(null);
    setError(null);
    setSelectedFile(null);
    setChecking(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const formatSize = (bytes: number) =>
    bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;

  // ── SELECT STEP ──
  if (step === 'select') {
    return (
      <div className="p-4 lg:p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 mb-1">Upload Manager</h1>
          <p className="text-sm text-slate-600 mb-6">Upload file Order.all, Income, atau Master SKU</p>

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
              Pilih File
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
            </ul>
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
          {preview && !checking && (
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

                {/* DB Comparison Stats */}
                <div className="mt-3 grid grid-cols-3 gap-3">
                  <div className={`p-2 rounded-lg text-center ${preview.newRows > 0 ? 'bg-green-50 border border-green-200' : 'bg-slate-50 border border-slate-200'}`}>
                    <div className={`text-xl font-bold ${preview.newRows > 0 ? 'text-green-600' : 'text-slate-400'}`}>{preview.newRows.toLocaleString()}</div>
                    <div className="text-xs text-slate-500">Baru</div>
                  </div>
                  <div className={`p-2 rounded-lg text-center ${preview.existingRows > 0 ? 'bg-amber-50 border border-amber-200' : 'bg-slate-50 border border-slate-200'}`}>
                    <div className={`text-xl font-bold ${preview.existingRows > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{preview.existingRows.toLocaleString()}</div>
                    <div className="text-xs text-slate-500">Sudah ada</div>
                  </div>
                  <div className="p-2 rounded-lg text-center bg-slate-50 border border-slate-200">
                    <div className="text-xl font-bold text-slate-600">{preview.totalRows.toLocaleString()}</div>
                    <div className="text-xs text-slate-500">Total</div>
                  </div>
                </div>
              </div>

              {/* All duplicates warning */}
              {preview.newRows === 0 && preview.existingRows > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-semibold text-amber-800">Semua data sudah ada di database</div>
                    <div className="text-xs text-amber-700 mt-0.5">Tidak ada data baru untuk di-import. File ini sudah pernah di-upload sebelumnya.</div>
                  </div>
                </div>
              )}

              {/* Partial duplicates info */}
              {preview.newRows > 0 && preview.existingRows > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-xs text-blue-700">
                  {preview.existingRows} baris sudah ada dan akan di-update, {preview.newRows} baris baru akan di-insert.
                </div>
              )}

              {/* Preview Table */}
              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden mb-4">
                <div className="p-3 border-b border-slate-200">
                  <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                    <Eye className="w-4 h-4" /> Sample Data (10 baris pertama)
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50">
                        {preview.previewColumns.map(col => (
                          <th key={col} className="px-3 py-2 text-left font-semibold text-slate-600 whitespace-nowrap border-b border-slate-200">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.previewRows.map((row, i) => (
                        <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                          {preview.previewColumns.map(col => (
                            <td key={col} className="px-3 py-2 text-slate-700 whitespace-nowrap max-w-[200px] truncate">
                              {row[col] != null ? String(row[col]) : <span className="text-slate-300">—</span>}
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
                  {preview.headers.map(h => (
                    <span key={h} className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded">{h}</span>
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
                  disabled={importing || preview.newRows === 0}
                  className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                    preview.newRows === 0
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                      : 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed'
                  }`}
                >
                  {importing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Importing...
                    </>
                  ) : preview.newRows === 0 ? (
                    'Tidak ada data baru'
                  ) : (
                    <>
                      Import {preview.newRows.toLocaleString()} baris baru
                      {preview.existingRows > 0 && ` (+ ${preview.existingRows} update)`}
                    </>
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
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-green-600">{result.rowsImported.toLocaleString()}</div>
                <div className="text-xs text-slate-500">Baru</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-600">{result.rowsUpdated.toLocaleString()}</div>
                <div className="text-xs text-slate-500">Di-update</div>
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
