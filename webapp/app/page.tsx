export default function HomePage() {
  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">
          Shopee Profit Estimation
        </h1>
        <p className="text-slate-600 mb-8">
          Upload dan kelola data Order.all, Income, dan Master SKU untuk estimasi profit
        </p>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <StatCard
            label="Total Orders"
            value="—"
            description="Belum ada data"
            color="blue"
          />
          <StatCard
            label="Income Records"
            value="—"
            description="Belum ada data"
            color="green"
          />
          <StatCard
            label="SKU Master"
            value="—"
            description="Belum ada data"
            color="purple"
          />
        </div>

        {/* Instructions */}
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-xl font-semibold text-slate-900 mb-4">
            Cara Menggunakan
          </h2>
          <ol className="space-y-3 text-slate-700">
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-semibold">
                1
              </span>
              <span>
                <strong>Upload Manager:</strong> Upload file Order.all, Income, atau Master SKU (.xlsx, .xls, .csv)
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-semibold">
                2
              </span>
              <span>
                <strong>Order All:</strong> Lihat semua order dengan filter, search, dan sort
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-semibold">
                3
              </span>
              <span>
                <strong>Income:</strong> Lihat data income dengan net payout calculation
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-semibold">
                4
              </span>
              <span>
                <strong>SKU Master:</strong> Lihat master HPP untuk mapping profit
              </span>
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  description,
  color,
}: {
  label: string;
  value: string;
  description: string;
  color: 'blue' | 'green' | 'purple';
}) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600 border-blue-200',
    green: 'bg-green-50 text-green-600 border-green-200',
    purple: 'bg-purple-50 text-purple-600 border-purple-200',
  };

  return (
    <div className={`rounded-lg border p-6 ${colorClasses[color]}`}>
      <div className="text-sm font-medium opacity-80 mb-1">{label}</div>
      <div className="text-3xl font-bold mb-1">{value}</div>
      <div className="text-sm opacity-70">{description}</div>
    </div>
  );
}
