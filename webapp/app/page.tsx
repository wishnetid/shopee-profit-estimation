import Link from 'next/link';
import { Suspense } from 'react';

export default function HomePage() {
  return (
    <div className="max-w-6xl mx-auto pb-20 lg:pb-0">
      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2">
        Shopee Profit Estimation
      </h1>
      <p className="text-sm sm:text-base text-slate-600 mb-6 sm:mb-8">
        Dashboard untuk estimasi profit Shopee berdasarkan Order.all, Income, dan Master HPP
      </p>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6 mb-6 sm:mb-8">
        <StatCard
          title="Total Orders"
          value="—"
          subtitle="Belum ada data"
          color="blue"
        />
        <StatCard
          title="Total Net Payout"
          value="Rp —"
          subtitle="Dari Income"
          color="green"
        />
        <StatCard
          title="Total HPP"
          value="Rp —"
          subtitle="Dari Master"
          color="yellow"
        />
        <StatCard
          title="Total Profit"
          value="Rp —"
          subtitle="Net - HPP"
          color="purple"
        />
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow p-4 sm:p-6 mb-6 sm:mb-8">
        <h2 className="text-lg sm:text-xl font-semibold text-slate-900 mb-3 sm:mb-4">
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          <Link
            href="/upload"
            className="p-3 sm:p-4 border-2 border-slate-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
          >
            <div className="text-xl sm:text-2xl mb-1 sm:mb-2">📤</div>
            <h3 className="text-sm sm:text-base font-semibold text-slate-900 mb-1">Upload Reports</h3>
            <p className="text-xs sm:text-sm text-slate-600">
              Upload Order.all, Income, Master HPP
            </p>
          </Link>

          <Link
            href="/orders"
            className="p-3 sm:p-4 border-2 border-slate-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
          >
            <div className="text-xl sm:text-2xl mb-1 sm:mb-2">📦</div>
            <h3 className="text-sm sm:text-base font-semibold text-slate-900 mb-1">View Orders</h3>
            <p className="text-xs sm:text-sm text-slate-600">
              Lihat semua pesanan dengan detail
            </p>
          </Link>

          <Link
            href="/profit"
            className="p-3 sm:p-4 border-2 border-slate-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
          >
            <div className="text-xl sm:text-2xl mb-1 sm:mb-2">💰</div>
            <h3 className="text-sm sm:text-base font-semibold text-slate-900 mb-1">Profit Summary</h3>
            <p className="text-xs sm:text-sm text-slate-600">
              Analisa profit per order & summary
            </p>
          </Link>
        </div>
      </div>

      {/* System Info */}
      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <h2 className="text-lg sm:text-xl font-semibold text-slate-900 mb-3 sm:mb-4">
          System Information
        </h2>
        <Suspense fallback={<p className="text-sm text-slate-500">Checking...</p>}>
          <SystemStatus />
        </Suspense>
      </div>
    </div>
  );
}

function StatCard({ title, value, subtitle, color }: {
  title: string;
  value: string;
  subtitle: string;
  color: 'blue' | 'green' | 'yellow' | 'purple';
}) {
  const colorClasses = {
    blue: 'bg-blue-50 border-blue-200',
    green: 'bg-green-50 border-green-200',
    yellow: 'bg-yellow-50 border-yellow-200',
    purple: 'bg-purple-50 border-purple-200',
  };

  return (
    <div className={`bg-white border-2 rounded-lg p-3 sm:p-4 lg:p-6 ${colorClasses[color]}`}>
      <div className="text-[10px] sm:text-xs font-medium text-slate-600 mb-1">{title}</div>
      <div className="text-lg sm:text-xl lg:text-2xl font-bold text-slate-900 mb-1">{value}</div>
      <div className="text-[9px] sm:text-xs text-slate-500">{subtitle}</div>
    </div>
  );
}

async function SystemStatus() {
  try {
    const res = await fetch('http://localhost:3000/api/health', {
      cache: 'no-store',
    });
    const data = await res.json();

    if (data.status === 'ok') {
      return (
        <div className="flex items-center gap-2">
          <span className="text-green-500">●</span>
          <span className="text-slate-700">Database: Connected</span>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2">
        <span className="text-red-500">●</span>
        <span className="text-slate-700">Database: {data.message}</span>
      </div>
    );
  } catch (error) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-red-500">●</span>
        <span className="text-slate-700">Database: Connection failed</span>
      </div>
    );
  }
}
