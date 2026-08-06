'use client';

import { useState } from 'react';

type FileStatus = 'pending' | 'selected' | 'uploading' | 'success' | 'error';

interface FileState {
  file: File | null;
  status: FileStatus;
}

export default function UploadPage() {
  const [orderFile, setOrderFile] = useState<FileState>({ file: null, status: 'pending' });
  const [incomeFile, setIncomeFile] = useState<FileState>({ file: null, status: 'pending' });
  const [masterFile, setMasterFile] = useState<FileState>({ file: null, status: 'pending' });
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<string>('');

  const handleFileChange = (
    type: 'order' | 'income' | 'master',
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      const setState = type === 'order' ? setOrderFile : type === 'income' ? setIncomeFile : setMasterFile;
      setState({ file, status: 'selected' });
    }
  };

  const handleUpload = async () => {
    if (!orderFile.file || !incomeFile.file || !masterFile.file) {
      setUploadResult('❌ Harap upload ketiga file terlebih dahulu');
      return;
    }

    setIsUploading(true);
    setUploadResult('');
    setOrderFile(prev => ({ ...prev, status: 'uploading' }));
    setIncomeFile(prev => ({ ...prev, status: 'uploading' }));
    setMasterFile(prev => ({ ...prev, status: 'uploading' }));

    try {
      const formData = new FormData();
      formData.append('orderFile', orderFile.file);
      formData.append('incomeFile', incomeFile.file);
      formData.append('masterFile', masterFile.file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        setOrderFile(prev => ({ ...prev, status: 'success' }));
        setIncomeFile(prev => ({ ...prev, status: 'success' }));
        setMasterFile(prev => ({ ...prev, status: 'success' }));
        setUploadResult(`✅ ${data.message}`);
      } else {
        throw new Error(data.error || 'Upload failed');
      }
    } catch (error: any) {
      setOrderFile(prev => ({ ...prev, status: 'error' }));
      setIncomeFile(prev => ({ ...prev, status: 'error' }));
      setMasterFile(prev => ({ ...prev, status: 'error' }));
      setUploadResult(`❌ Error: ${error.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const canUpload = orderFile.file && incomeFile.file && masterFile.file && !isUploading;

  return (
    <div className="max-w-4xl mx-auto pb-24 lg:pb-0">
      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2">
        Upload Reports
      </h1>
      <p className="text-sm sm:text-base text-slate-600 mb-6 sm:mb-8">
        Upload 3 file Excel: Order.all, Income (Penghasilan), dan Master HPP
      </p>

      {/* Upload Cards */}
      <div className="space-y-6">
        {/* Order.all Upload */}
        <UploadCard
          title="1. Order.all"
          description="File Order.all dari Shopee Seller Center"
          acceptedFormats=".xlsx, .xls"
          status={orderFile.status}
          fileName={orderFile.file?.name}
          onChange={(e) => handleFileChange('order', e)}
        />

        {/* Income Upload */}
        <UploadCard
          title="2. Income (Penghasilan)"
          description="File Income 'sudah dilepas' - Sheet: Penghasilan"
          acceptedFormats=".xlsx, .xls"
          status={incomeFile.status}
          fileName={incomeFile.file?.name}
          onChange={(e) => handleFileChange('income', e)}
        />

        {/* Master HPP Upload */}
        <UploadCard
          title="3. Master HPP"
          description="Master SKU dengan HPP (sudah + packaging)"
          acceptedFormats=".xlsx, .xls"
          status={masterFile.status}
          fileName={masterFile.file?.name}
          onChange={(e) => handleFileChange('master', e)}
        />
      </div>

      {/* Upload Result */}
      {uploadResult && (
        <div className={`mt-6 p-4 rounded-lg ${
          uploadResult.startsWith('✅') 
            ? 'bg-green-50 text-green-800 border border-green-200' 
            : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {uploadResult}
        </div>
      )}

      {/* Upload All Button */}
      <div className="mt-8 p-6 bg-white rounded-lg shadow">
        <button
          disabled={!canUpload}
          onClick={handleUpload}
          className="w-full py-3 px-6 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
        >
          {isUploading ? 'Processing...' : 'Process All Reports'}
        </button>
        {!canUpload && !isUploading && (
          <p className="text-sm text-slate-500 mt-2 text-center">
            Upload ketiga file terlebih dahulu
          </p>
        )}
      </div>

      {/* Instructions */}
      <div className="mt-8 bg-slate-50 border-2 border-slate-200 rounded-lg p-6">
        <div className="flex items-start gap-3">
          <span className="text-2xl">📋</span>
          <div>
            <h3 className="font-semibold text-slate-900 mb-2">Upload Instructions</h3>
            <ul className="text-sm text-slate-700 space-y-2">
              <li>• Order.all: Pastikan kolom "No. Pesanan", "Nomor Referensi SKU", "SKU Induk" ada</li>
              <li>• Income: Gunakan sheet "Penghasilan", filter "Lihat berdasarkan = Order"</li>
              <li>• Master HPP: Pastikan kolom "SKU1", "SKU2", "Harga", "IDPRODUK" ada</li>
              <li>• Header bisa di row 1, 2, atau lebih (auto-detect)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function UploadCard({
  title,
  description,
  acceptedFormats,
  status,
  fileName,
  onChange,
}: {
  title: string;
  description: string;
  acceptedFormats: string;
  status: FileStatus;
  fileName?: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const statusColors = {
    pending: 'bg-slate-100 text-slate-600',
    selected: 'bg-blue-100 text-blue-700',
    uploading: 'bg-yellow-100 text-yellow-700',
    success: 'bg-green-100 text-green-700',
    error: 'bg-red-100 text-red-700',
  };

  const statusText = {
    pending: 'Pending',
    selected: 'Selected',
    uploading: 'Uploading...',
    success: 'Success',
    error: 'Error',
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-slate-900">{title}</h3>
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[status]}`}>
          {statusText[status]}
        </span>
      </div>
      <p className="text-sm text-slate-600 mb-4">{description}</p>

      <label className="block">
        <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors cursor-pointer">
          <input
            type="file"
            accept={acceptedFormats}
            onChange={onChange}
            className="hidden"
            disabled={status === 'uploading'}
          />
          <div className="text-4xl mb-2">📄</div>
          {fileName ? (
            <p className="text-sm font-medium text-blue-600">{fileName}</p>
          ) : (
            <>
              <p className="text-sm text-slate-700 mb-1">
                Click to upload or drag and drop
              </p>
              <p className="text-xs text-slate-500">{acceptedFormats}</p>
            </>
          )}
        </div>
      </label>
    </div>
  );
}
