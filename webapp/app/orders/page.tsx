export default function OrdersPage() {
  return (
    <div className="max-w-7xl">
      <h1 className="text-3xl font-bold text-slate-900 mb-2">
        Orders
      </h1>
      <p className="text-slate-600 mb-8">
        Daftar semua pesanan dari Order.all dengan detail lengkap
      </p>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Search
            </label>
            <input
              type="text"
              placeholder="No. Pesanan atau Nama Produk"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Status Pesanan
            </label>
            <select className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Semua Status</option>
              <option value="Selesai">Selesai</option>
              <option value="Dibatalkan">Dibatalkan</option>
              <option value="Pengembalian/Pengembalian Dana">Return/Refund</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Tanggal
            </label>
            <input
              type="date"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                No. Pesanan
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                Produk
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                SKU
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                Jumlah
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                Waktu
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            <tr>
              <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                <div className="text-4xl mb-2">📦</div>
                <p>Belum ada data orders</p>
                <p className="text-sm mt-1">Upload Order.all untuk mulai</p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Pagination Placeholder */}
      <div className="mt-6 flex items-center justify-between">
        <p className="text-sm text-slate-600">
          Showing 0 of 0 orders
        </p>
        <div className="flex gap-2">
          <button className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50" disabled>
            Previous
          </button>
          <button className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50" disabled>
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
