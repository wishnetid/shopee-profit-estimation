'use client';

import { useState } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, XCircle, Loader2 } from 'lucide-react';

type UploadStatus = 'idle' | 'uploading' | 'success' | 'error';

interface FileUpload {
  file: File;
  status: UploadStatus;
  message?: string;
  detectedType?: string;
}

export default function UploadPage() {
  const [files, setFiles] = useState<FileUpload[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    addFiles(droppedFiles);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(Array.from(e.target.files));
    }
  };

  const addFiles = (newFiles: File[]) => {
    const validFiles = newFiles.filter(file => {
      const ext = file.name.toLowerCase().split('.').pop();
      return ['xlsx', 'xls', 'csv'].includes(ext || '');
    });
    setFiles(prev => [...prev, ...validFiles.map(file => ({ file, status: 'idle' as UploadStatus }))]);
  };

  const uploadFile = async (index: number) => {
    const fileUpload = files[index];
    setFiles(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], status: 'uploading' };
      return updated;
    });

    try {
      const formData = new FormData();
      formData.append('file', fileUpload.file);
      const response = await fetch('/api/upload', { method: 'POST', body: formData });
      const result = await response.json();

      setFiles(prev => {
        const updated = [...prev];
        updated[index] = {
          ...updated[index],
          status: response.ok ? 'success' : 'error',
          message: response.ok ? result.message : (result.error || 'Upload failed'),
          detectedType: result.reportType,
        };
        return updated;
      });
    } catch (error: any) {
      setFiles(prev => {
        const updated = [...prev];
        updated[index] = { ...updated[index], status: 'error', message: error.message };
        return updated;
      });
    }
  };

  const uploadAll = async () => {
    for (let i = 0; i < files.length; i++) {
      if (files[i].status === 'idle') await uploadFile(i);
    }
  };

  return (
    <div className="p-4 lg:p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 mb-1">
          Upload Manager
        </h1>
        <p className="text-sm text-slate-600 mb-6">
          Upload file Order.all, Income, atau Master SKU (.xlsx, .xls, .csv)
        </p>

        {/* Drop Zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-lg p-8 lg:p-12 text-center transition-colors ${
            isDragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-white'
          }`}
        >
          <Upload className="w-10 h-10 text-slate-400 mx-auto mb-3" />
          <h3 className="text-base lg:text-lg font-semibold text-slate-900 mb-1">
            Drag & Drop File
          </h3>
          <p className="text-sm text-slate-500 mb-3">atau pilih file</p>
          <label className="inline-block px-5 py-2.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 cursor-pointer transition-colors">
            <input type="file" multiple accept=".xlsx,.xls,.csv" onChange={handleFileSelect} className="hidden" />
            Pilih File
          </label>
        </div>

        {/* File Queue */}
        {files.length > 0 && (
          <div className="mt-6 bg-white rounded-lg border border-slate-200">
            <div className="p-3 lg:p-4 border-b border-slate-200 flex justify-between items-center">
              <h2 className="text-sm lg:text-base font-semibold text-slate-900">
                File Queue ({files.length})
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={uploadAll}
                  disabled={files.every(f => f.status !== 'idle')}
                  className="px-3 py-1.5 text-xs lg:text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
                >
                  Upload All
                </button>
                <button
                  onClick={() => setFiles([])}
                  className="px-3 py-1.5 text-xs lg:text-sm border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {files.map((fileUpload, index) => (
                <div key={index} className="p-3 lg:p-4 flex items-center gap-3">
                  <FileSpreadsheet className="w-7 h-7 text-blue-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">
                      {fileUpload.file.name}
                    </div>
                    <div className="text-xs text-slate-500">
                      {(fileUpload.file.size / 1024).toFixed(1)} KB
                      {fileUpload.detectedType && (
                        <span className="ml-1.5 text-blue-600">• {fileUpload.detectedType}</span>
                      )}
                    </div>
                    {fileUpload.message && (
                      <div className={`text-xs mt-0.5 ${
                        fileUpload.status === 'error' ? 'text-red-600' :
                        fileUpload.message.includes('di-update') && !fileUpload.message.includes('baru') ? 'text-amber-600' :
                        'text-green-600'
                      }`}>
                        {fileUpload.message}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {fileUpload.status === 'idle' && (
                      <button onClick={() => uploadFile(index)} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg">
                        Upload
                      </button>
                    )}
                    {fileUpload.status === 'uploading' && <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />}
                    {fileUpload.status === 'success' && <CheckCircle className="w-4 h-4 text-green-600" />}
                    {fileUpload.status === 'error' && <XCircle className="w-4 h-4 text-red-600" />}
                    <button
                      onClick={() => setFiles(prev => prev.filter((_, i) => i !== index))}
                      className="px-2 py-1 text-xs text-slate-400 hover:text-slate-700"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Info */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-3 lg:p-4">
          <h3 className="text-sm font-semibold text-blue-900 mb-1.5">Auto-Detection</h3>
          <ul className="text-xs text-blue-800 space-y-0.5">
            <li>• <strong>Order.all:</strong> Sheet "orders", 50+ kolom</li>
            <li>• <strong>Income:</strong> Sheet "Penghasilan", 50+ kolom</li>
            <li>• <strong>Master SKU:</strong> Sheet "Sheet1", 4 kolom</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
