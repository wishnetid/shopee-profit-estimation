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
      const selectedFiles = Array.from(e.target.files);
      addFiles(selectedFiles);
    }
  };

  const addFiles = (newFiles: File[]) => {
    const validFiles = newFiles.filter(file => {
      const ext = file.name.toLowerCase().split('.').pop();
      return ['xlsx', 'xls', 'csv'].includes(ext || '');
    });

    const fileUploads: FileUpload[] = validFiles.map(file => ({
      file,
      status: 'idle',
    }));

    setFiles(prev => [...prev, ...fileUploads]);
  };

  const uploadFile = async (index: number) => {
    const fileUpload = files[index];
    
    // Update status to uploading
    setFiles(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], status: 'uploading' };
      return updated;
    });

    try {
      const formData = new FormData();
      formData.append('file', fileUpload.file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (response.ok) {
        setFiles(prev => {
          const updated = [...prev];
          updated[index] = {
            ...updated[index],
            status: 'success',
            message: result.message,
            detectedType: result.reportType,
          };
          return updated;
        });
      } else {
        throw new Error(result.error || 'Upload failed');
      }
    } catch (error: any) {
      setFiles(prev => {
        const updated = [...prev];
        updated[index] = {
          ...updated[index],
          status: 'error',
          message: error.message,
        };
        return updated;
      });
    }
  };

  const uploadAll = async () => {
    for (let i = 0; i < files.length; i++) {
      if (files[i].status === 'idle') {
        await uploadFile(i);
      }
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const clearAll = () => {
    setFiles([]);
  };

  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">
          Upload Manager
        </h1>
        <p className="text-slate-600 mb-8">
          Upload file Order.all, Income, atau Master SKU. Format support: .xlsx, .xls, .csv
        </p>

        {/* Drop Zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`
            border-2 border-dashed rounded-lg p-12 text-center transition-colors
            ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-white'}
          `}
        >
          <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">
            Drag & Drop File di sini
          </h3>
          <p className="text-slate-600 mb-4">
            atau klik tombol di bawah untuk pilih file
          </p>
          <label className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer transition-colors">
            <input
              type="file"
              multiple
              accept=".xlsx,.xls,.csv"
              onChange={handleFileSelect}
              className="hidden"
            />
            Pilih File
          </label>
          <p className="text-sm text-slate-500 mt-4">
            Support: .xlsx, .xls, .csv • Multiple file upload
          </p>
        </div>

        {/* File List */}
        {files.length > 0 && (
          <div className="mt-8 bg-white rounded-lg border border-slate-200">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-slate-900">
                File Queue ({files.length})
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={uploadAll}
                  disabled={files.every(f => f.status !== 'idle')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
                >
                  Upload All
                </button>
                <button
                  onClick={clearAll}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Clear All
                </button>
              </div>
            </div>

            <div className="divide-y divide-slate-200">
              {files.map((fileUpload, index) => (
                <div key={index} className="p-4 flex items-center gap-4">
                  <FileSpreadsheet className="w-8 h-8 text-blue-500 flex-shrink-0" />
                  
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-900 truncate">
                      {fileUpload.file.name}
                    </div>
                    <div className="text-sm text-slate-500">
                      {(fileUpload.file.size / 1024).toFixed(1)} KB
                      {fileUpload.detectedType && (
                        <span className="ml-2 text-blue-600">
                          • Detected: {fileUpload.detectedType}
                        </span>
                      )}
                    </div>
                    {fileUpload.message && (
                      <div className={`text-sm mt-1 ${
                        fileUpload.status === 'error' ? 'text-red-600' : 'text-green-600'
                      }`}>
                        {fileUpload.message}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {fileUpload.status === 'idle' && (
                      <button
                        onClick={() => uploadFile(index)}
                        className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        Upload
                      </button>
                    )}
                    {fileUpload.status === 'uploading' && (
                      <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                    )}
                    {fileUpload.status === 'success' && (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    )}
                    {fileUpload.status === 'error' && (
                      <XCircle className="w-5 h-5 text-red-600" />
                    )}
                    <button
                      onClick={() => removeFile(index)}
                      className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Info */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 mb-2">
            Auto-Detection Report Type
          </h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• <strong>Order.all:</strong> Sheet name = "orders", 50 columns</li>
            <li>• <strong>Income:</strong> Sheet name = "Penghasilan", 52 columns</li>
            <li>• <strong>Master SKU:</strong> Sheet name = "Sheet1", 4 columns (SKU1, SKU2, Harga, IDPRODUK)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
