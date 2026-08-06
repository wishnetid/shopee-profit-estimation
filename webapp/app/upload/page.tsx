export default function UploadPage() {
  return (
    <div className="max-w-4xl">
      <h1 className="text-3xl font-bold text-slate-900 mb-2">
        Upload Reports
      </h1>
      <p className="text-slate-600 mb-8">
        Upload 3 file Excel: Order.all, Income (Penghasilan), dan Master HPP
      </p>

      {/* Upload Cards */}
      <div className="space-y-6">
        {/* Order.all Upload */}
        <UploadCard
          title="1. Order.all"
          description="File Order.all dari Shopee Seller Center"
          acceptedFormats=".xlsx, .xls"
          status="pending"
        />

        {/* Income Upload */}
        <UploadCard
          title="2. Income (Penghasilan)"
          description="File Income 'sudah dilepas' - Sheet: Penghasilan"
          acceptedFormats=".xlsx, .xls"
          status="pending"
        />

        {/* Master HPP Upload */}
        <UploadCard
          title="3. Master HPP"
          description="Master SKU dengan HPP (sudah + packaging)"
          acceptedFormats=".xlsx, .xls"
          status="pending"
        />
      </div>

      {/* Upload All Button */}
      <div className="mt-8 p-6 bg-white rounded-lg shadow">
        <button
          disabled
          className="w-full py-3 px-6 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
        >
          Process All Reports (Coming Soon)
        </button>
        <p className="text-sm text-slate-500 mt-2 text-center">
          Excel upload parser will be implemented next
        </p>
      </div>

      {/* Instructions */}
      <div className="mt-8 bg-blue-50 border-2 border-blue-200 rounded-lg p-6">
        <h3 className="font-semibold text-blue-900 mb-2">📋 Upload Instructions</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Order.all: Pastikan kolom "No. Pesanan", "Nomor Referensi SKU", "SKU Induk" ada</li>
          <li>• Income: Gunakan sheet "Penghasilan", filter "Lihat berdasarkan = Order"</li>
          <li>• Master HPP: Pastikan kolom "SKU1", "SKU2", "Harga", "IDPRODUK" ada</li>
          <li>• Header bisa di row 1, 2, atau lebih (auto-detect)</li>
        </ul>
      </div>
    </div>
  );
}

function UploadCard({ title, description, acceptedFormats, status }: {
  title: string;
  description: string;
  acceptedFormats: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
}) {
  const statusColors = {
    pending: 'border-slate-200',
    uploading: 'border-blue-500 bg-blue-50',
    success: 'border-green-500 bg-green-50',
    error: 'border-red-500 bg-red-50',
  };

  return (
    <div className={`bg-white border-2 rounded-lg p-6 ${statusColors[status]}`}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-semibold text-slate-900 mb-1">{title}</h3>
          <p className="text-sm text-slate-600">{description}</p>
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors cursor-pointer">
        <div className="text-4xl mb-2">📄</div>
        <p className="text-sm font-medium text-slate-700 mb-1">
          Click to upload or drag and drop
        </p>
        <p className="text-xs text-slate-500">
          {acceptedFormats}
        </p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const badges = {
    pending: { text: 'Pending', color: 'bg-slate-100 text-slate-700' },
    uploading: { text: 'Uploading...', color: 'bg-blue-100 text-blue-700' },
    success: { text: 'Success', color: 'bg-green-100 text-green-700' },
    error: { text: 'Error', color: 'bg-red-100 text-red-700' },
  };

  const badge = badges[status as keyof typeof badges];

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-medium ${badge.color}`}>
      {badge.text}
    </span>
  );
}
