'use client';

export default function ProfitPage() {
  return (
    <div className="p-4 lg:p-8">
      <div className="max-w-6xl">
        <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 mb-1">
          Profit Analysis
        </h1>
        <p className="text-sm text-slate-600 mb-6">
          Analisa profit bersih per order: Net Payout - HPP
        </p>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-6">
          <SummaryCard title="Total Orders" value="—" icon="📦" color="blue" />
          <SummaryCard title="Net Payout" value="Rp —" icon="💵" color="green" />
          <SummaryCard title="Total HPP" value="Rp —" icon="📊" color="yellow" />
          <SummaryCard title="Profit" value="Rp —" subtitle="Margin: —%" icon="💰" color="purple" />
        </div>

        {/* Ad Cost */}
        <div className="bg-white rounded-lg border border-slate-200 p-4 lg:p-6 mb-6">
          <h2 className="text-base lg:text-lg font-semibold text-slate-900 mb-3">Biaya Iklan</h2>
          <div className="grid grid-cols-3 gap-3 lg:gap-4">
            <div>
              <p className="text-xs text-slate-500">Total Iklan</p>
              <p className="text-base lg:text-lg font-bold text-red-600">Rp —</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Per Order</p>
              <p className="text-base lg:text-lg font-bold text-slate-900">Rp —</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">After Ads</p>
              <p className="text-base lg:text-lg font-bold text-green-600">Rp —</p>
            </div>
          </div>
        </div>

        {/* Profit Table */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-slate-200">
            <h2 className="text-base lg:text-lg font-semibold text-slate-900">Profit per Order</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['No. Pesanan', 'Produk', 'Net Payout', 'HPP', 'Profit', 'Margin %'].map(h => (
                    <th key={h} className="px-3 lg:px-4 py-2.5 text-left text-xs font-semibold text-slate-700 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                    <div className="text-3xl mb-2">💰</div>
                    <p className="text-sm">Belum ada data profit</p>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Formula */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-2">📐 Formula</h3>
          <div className="text-xs text-slate-600 space-y-1">
            <p><strong>Net Payout</strong> = Harga Produk + Gratis Ongkir - Ongkir - Admin - Proses - XTRA - Lainnya</p>
            <p><strong>HPP</strong> = master.xlsx (sudah + packaging)</p>
            <p className="text-green-700 font-medium"><strong>Profit</strong> = Net Payout - HPP</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ title, value, subtitle, icon, color }: {
  title: string;
  value: string;
  subtitle?: string;
  icon: string;
  color: 'blue' | 'green' | 'yellow' | 'purple';
}) {
  const colorClasses = {
    blue: 'border-blue-200 bg-blue-50',
    green: 'border-green-200 bg-green-50',
    yellow: 'border-yellow-200 bg-yellow-50',
    purple: 'border-purple-200 bg-purple-50',
  };

  return (
    <div className={`bg-white border rounded-lg p-3 lg:p-4 ${colorClasses[color]}`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-lg">{icon}</span>
        <span className="text-[10px] lg:text-xs font-medium text-slate-500 uppercase">{title}</span>
      </div>
      <div className="text-base lg:text-xl font-bold text-slate-900">{value}</div>
      {subtitle && <div className="text-xs text-slate-500 mt-0.5">{subtitle}</div>}
    </div>
  );
}
