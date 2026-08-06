'use client';

import { useState } from 'react';
import { Upload, FileText, CheckCircle, XCircle, Loader2 } from 'lucide-react';

interface FileStatus {
  file: File | null;
  status: 'idle' | 'uploading' | 'success' | 'error';
  progress?: number;
  message?: string;
}

interface UploadProgress {
  status: 'processing' | 'completed' | 'error';
  progress: number;
  message: string;
  stage?: string;
  error?: string;
  stats?: {
    ordersProcessed?: number;
    ordersTotal?: number;
    incomeProcessed?: number;
    incomeTotal?: number;
    masterProcessed?: number;
    masterTotal?: number;
  };
}

export default function UploadPage() {
  const [orderFile, setOrderFile] = useState<FileStatus>({ file: null, status: 'idle' });
  const [incomeFile, setIncomeFile] = useState<FileStatus>({ file: null, status: 'idle' });
  const [masterFile, setMasterFile] = useState<FileStatus>({ file: null, status: 'idle' });
  const [jobId, setJobId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);

  const handleFileSelect = (type: 'order' | 'income' | 'master', file: File) => {
    const status: FileStatus = { file, status: 'idle' };
    
    switch(type) {
      case 'order':
        setOrderFile(status);
        break;
      case 'income':
        setIncomeFile(status);
        break;
      case 'master':
        setMasterFile(status);
        break;
    }
  };

  const pollProgress = async (jobId: string) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/upload/status?jobId=${jobId}`);
        const data = await res.json();
        
        if (data.success) {
          setUploadProgress(data);
          
          if (data.status === 'completed') {
            clearInterval(interval);
            setOrderFile(prev => ({ ...prev, status: 'success' }));
            setIncomeFile(prev => ({ ...prev, status: 'success' }));
            setMasterFile(prev => ({ ...prev, status: 'success' }));
          } else if (data.status === 'error') {
            clearInterval(interval);
            setOrderFile(prev => ({ ...prev, status: 'error', message: data.error }));
            setIncomeFile(prev => ({ ...prev, status: 'error' }));
            setMasterFile(prev => ({ ...prev, status: 'error' }));
          }
        }
      } catch (err) {
        console.error('Poll error:', err);
      }
    }, 1000); // Poll setiap 1 detik

    // Timeout setelah 5 menit
    setTimeout(() => clearInterval(interval), 300000);
  };

  const handleUpload = async () => {
    if (!orderFile.file || !incomeFile.file || !masterFile.file) {
      alert('Please select all 3 files');
      return;
    }

    setOrderFile(prev => ({ ...prev, status: 'uploading' }));
    setIncomeFile(prev => ({ ...prev, status: 'uploading' }));
    setMasterFile(prev => ({ ...prev, status: 'uploading' }));
    setUploadProgress({ status: 'processing', progress: 0, message: 'Starting upload...' });

    try {
      const formData = new FormData();
      formData.append('orderFile', orderFile.file);
      formData.append('incomeFile', incomeFile.file);
      formData.append('masterFile', masterFile.file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (result.success && result.jobId) {
        setJobId(result.jobId);
        pollProgress(result.jobId);
      } else {
        throw new Error(result.error || 'Upload failed');
      }
    } catch (error: any) {
      setOrderFile(prev => ({ ...prev, status: 'error', message: error.message }));
      setIncomeFile(prev => ({ ...prev, status: 'error' }));
      setMasterFile(prev => ({ ...prev, status: 'error' }));
      setUploadProgress({ status: 'error', progress: 0, message: error.message, error: error.message });
    }
  };

  const FileUploadBox = ({ 
    title, 
    description, 
    fileStatus, 
    onFileSelect 
  }: { 
    title: string; 
    description: string; 
    fileStatus: FileStatus; 
    onFileSelect: (file: File) => void;
  }) => {
    const getStatusBadge = () => {
      switch(fileStatus.status) {
        case 'uploading':
          return <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-sm">Uploading...</span>;
        case 'success':
          return <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm flex items-center gap-1"><CheckCircle size={16} /> Success</span>;
        case 'error':
          return <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm flex items-center gap-1"><XCircle size={16} /> Error</span>;
        default:
          return null;
      }
    };

    return (
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
            <p className="text-sm text-gray-500 mt-1">{description}</p>
          </div>
          {getStatusBadge()}
        </div>

        <div 
          className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 hover:bg-blue-50 transition-colors cursor-pointer"
          onClick={() => document.getElementById(`file-${title}`)?.click()}
        >
          {fileStatus.file ? (
            <div className="flex flex-col items-center gap-2">
              <FileText size={48} className="text-blue-500" />
              <p className="text-sm font-medium text-gray-700">{fileStatus.file.name}</p>
              <p className="text-xs text-gray-500">{(fileStatus.file.size / 1024).toFixed(2)} KB</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload size={48} className="text-gray-400" />
              <p className="text-sm text-gray-600">Click to select file</p>
            </div>
          )}
          <input
            id={`file-${title}`}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFileSelect(file);
            }}
          />
        </div>

        {fileStatus.message && (
          <p className="mt-3 text-sm text-red-600">{fileStatus.message}</p>
        )}
      </div>
    );
  };

  const canUpload = orderFile.file && incomeFile.file && masterFile.file && 
                     orderFile.status !== 'uploading';

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold text-gray-800 mb-2">Upload Reports</h1>
      <p className="text-gray-600 mb-8">Upload 3 file Excel: Order.all, Income (Penghasilan), dan Master HPP</p>

      <FileUploadBox
        title="1. Order.all"
        description="File Order.all dari Shopee Seller Center"
        fileStatus={orderFile}
        onFileSelect={(file) => handleFileSelect('order', file)}
      />

      <FileUploadBox
        title="2. Income (Penghasilan)"
        description="File Income 'sudah dilepas' - Sheet: Penghasilan"
        fileStatus={incomeFile}
        onFileSelect={(file) => handleFileSelect('income', file)}
      />

      <FileUploadBox
        title="3. Master HPP"
        description="File master.xlsx berisi SKU1, SKU2, Harga, IDPRODUK"
        fileStatus={masterFile}
        onFileSelect={(file) => handleFileSelect('master', file)}
      />

      {uploadProgress && (
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Upload Progress</h3>
          
          <div className="mb-4">
            <div className="flex justify-between text-sm text-gray-600 mb-2">
              <span>{uploadProgress.message}</span>
              <span>{uploadProgress.progress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div 
                className="bg-blue-500 h-3 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress.progress}%` }}
              />
            </div>
          </div>

          {uploadProgress.stats && (
            <div className="grid grid-cols-3 gap-4 text-sm">
              {uploadProgress.stats.ordersTotal && (
                <div>
                  <p className="text-gray-500">Orders</p>
                  <p className="font-semibold">{uploadProgress.stats.ordersProcessed || 0} / {uploadProgress.stats.ordersTotal}</p>
                </div>
              )}
              {uploadProgress.stats.incomeTotal && (
                <div>
                  <p className="text-gray-500">Income</p>
                  <p className="font-semibold">{uploadProgress.stats.incomeProcessed || 0} / {uploadProgress.stats.incomeTotal}</p>
                </div>
              )}
              {uploadProgress.stats.masterTotal && (
                <div>
                  <p className="text-gray-500">Master</p>
                  <p className="font-semibold">{uploadProgress.stats.masterProcessed || 0} / {uploadProgress.stats.masterTotal}</p>
                </div>
              )}
            </div>
          )}

          {uploadProgress.status === 'error' && uploadProgress.error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">{uploadProgress.error}</p>
            </div>
          )}
        </div>
      )}

      <button
        onClick={handleUpload}
        disabled={!canUpload}
        className={`w-full py-3 px-6 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 ${
          canUpload
            ? 'bg-blue-500 text-white hover:bg-blue-600'
            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
        }`}
      >
        {orderFile.status === 'uploading' ? (
          <>
            <Loader2 size={20} className="animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <Upload size={20} />
            Upload & Process
          </>
        )}
      </button>
    </div>
  );
}
