export default function ProfitPage() {
  return (
    <div className="max-w-7xl">
      <h1 className="text-3xl font-bold text-slate-900 mb-2">
        Profit Analysis
      </h1>
      <p className="text-slate-600 mb-8">
        Analisa profit bersih per order dengan formula: Net Payout - HPP
      </p>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <SummaryCard
          title="Total Orders"
          value="—"
          icon="📦"
          color="blue"
        />
        <SummaryCard
          title="Total Net Payout"
          value="Rp —"
          icon="💵"
          color="green"
        />
        <SummaryCard
          title="Total HPP"
          value="Rp —"
          icon="📊"
          color="yellow"
        />
        <SummaryCard
          title="Total Profit"
          value="Rp —"
          subtitle="Margin: —%"
          icon="💰"
          color="purple"
        />
      </div>

      {/* Ad Cost Section */}
      <div className="bg-white rounded-lg shadow p-6 mb-8">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">
          Biaya Iklan (AdWords)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <p className="text-sm text-slate-600 mb-1">Total Biaya Iklan</p>
            <p className="text-2xl font-bold text-red-600">Rp —</p>
          </div>
          <div>
            <p className="text-sm text-slate-600 mb-1">Biaya per Order</p>
            <p className="text-2xl font-bold text-slate-900">Rp —</p>
          </div>
          <div>
            <p className="text-sm text-slate-600 mb-1">Profit After Ads</p>
            <p className="text-2xl font-bold text-green-600">Rp —</p>
          </div>
        </div>
      </div>

      {/* Profit Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">
            Profit per Order
          </h2>
        </div>
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                No. Pesanan
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                Produk
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-slate-700 uppercase tracking-wider">
                Net Payout
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-slate-700 uppercase tracking-wider">
                HPP
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-slate-700 uppercase tracking-wider">
                Profit
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-slate-700 uppercase tracking-wider">
                Margin %
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            <tr>
              <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                <div className="text-4xl mb-2">💰</div>
                <p>Belum ada data profit</p>
                <p className="text-sm mt-1">Upload Order.all, Income, dan Master HPP untuk mulai</p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Formula Info */}
      <div className="mt-8 bg-slate-50 border-2 border-slate-200 rounded-lg p-6">
        <h3 className="font-semibold text-slate-900 mb-2">📐 Formula Profit</h3>
        <div className="text-sm text-slate-700 space-y-2">
          <p><strong>Net Payout</strong> = Harga Produk + Gratis Ongkir dari Shopee - Ongkir ke Jasa Kirim - Biaya Admin - Biaya Proses - Biaya Promo XTRA - Biaya Lainnya</p>
          <p><strong>HPP</strong> = Dari master.xlsx (sudah termasuk packaging)</p>
          <p className="text-green-700 font-medium"><strong>Profit Bersih</strong> = Net Payout - HPP</p>
          <p><strong>Margin</strong> = (Profit / Net Payout) × 100%</p>
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
    <div className={`bg-white border-2 rounded-lg p-6 ${colorClasses[color]}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-2xl">{icon}</span>
        <span className="text-xs font-medium text-slate-500 uppercase">{title}</span>
      </div>
      <div className="text-2xl font-bold text-slate-900 mb-1">{value}</div>
      {subtitle && (
        <div className="text-sm text-slate-600">{subtitle}</div>
      )}
    </div>
  );
}
