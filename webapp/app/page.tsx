'use client';

import { useState, useEffect } from 'react';
import DataTable from '@/components/DataTable';
import { ShoppingCart, DollarSign, Package, TrendingUp } from 'lucide-react';

export default function HomePage() {
  const [stats, setStats] = useState({ orders: 0, income: 0, sku: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [ordersRes, incomeRes, skuRes] = await Promise.all([
          fetch('/api/orders?limit=1'),
          fetch('/api/income?limit=1'),
          fetch('/api/sku?limit=1'),
        ]);
        const [orders, income, sku] = await Promise.all([
          ordersRes.json(),
          incomeRes.json(),
          skuRes.json(),
        ]);
        setStats({
          orders: orders.total || 0,
          income: income.total || 0,
          sku: sku.total || 0,
        });
      } catch (e) {
        console.error('Failed to fetch stats:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  return (
    <div className="p-4 lg:p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 mb-2">
          Shopee Profit Estimation
        </h1>
        <p className="text-sm lg:text-base text-slate-600 mb-6 lg:mb-8">
          Upload dan kelola data Order.all, Income, dan Master SKU
        </p>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-6 mb-6 lg:mb-8">
          <StatCard
            label="Orders"
            value={loading ? '—' : String(stats.orders)}
            icon={<ShoppingCart className="w-5 h-5" />}
            color="blue"
          />
          <StatCard
            label="Income"
            value={loading ? '—' : String(stats.income)}
            icon={<DollarSign className="w-5 h-5" />}
            color="green"
          />
          <StatCard
            label="SKU Master"
            value={loading ? '—' : String(stats.sku)}
            icon={<Package className="w-5 h-5" />}
            color="purple"
          />
          <StatCard
            label="Profit"
            value="—"
            icon={<TrendingUp className="w-5 h-5" />}
            color="yellow"
          />
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3 lg:gap-4 mb-6 lg:mb-8">
          <ActionCard href="/upload" title="Upload Report" desc="Order.all, Income, Master" color="blue" />
          <ActionCard href="/orders" title="Order All" desc="Lihat semua order" color="green" />
          <ActionCard href="/income" title="Income" desc="Net payout breakdown" color="emerald" />
          <ActionCard href="/sku" title="SKU Master RAW" desc="Data source SKU" color="purple" />
        </div>

        {/* Instructions */}
        <div className="bg-white rounded-lg border border-slate-200 p-4 lg:p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-3">
            Cara Menggunakan
          </h2>
          <ol className="space-y-2 text-sm lg:text-base text-slate-700">
            <li className="flex gap-2">
              <span className="flex-shrink-0 w-5 h-5 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-semibold">1</span>
              <span><strong>Upload</strong> file Order.all, Income, atau Master SKU</span>
            </li>
            <li className="flex gap-2">
              <span className="flex-shrink-0 w-5 h-5 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-semibold">2</span>
              <span><strong>Lihat data</strong> di Orders, Income, atau SKU Master</span>
            </li>
            <li className="flex gap-2">
              <span className="flex-shrink-0 w-5 h-5 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-semibold">3</span>
              <span><strong>Analisa profit</strong> di halaman Profit</span>
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color }: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: 'blue' | 'green' | 'purple' | 'yellow';
}) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600 border-blue-200',
    green: 'bg-green-50 text-green-600 border-green-200',
    purple: 'bg-purple-50 text-purple-600 border-purple-200',
    yellow: 'bg-yellow-50 text-yellow-600 border-yellow-200',
  };

  return (
    <div className={`rounded-lg border p-3 lg:p-4 ${colorClasses[color]}`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs font-medium opacity-80">{label}</span>
      </div>
      <div className="text-xl lg:text-2xl font-bold">{value}</div>
    </div>
  );
}

function ActionCard({ href, title, desc, color }: {
  href: string;
  title: string;
  desc: string;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    blue: 'border-blue-200 hover:border-blue-400 hover:bg-blue-50',
    green: 'border-green-200 hover:border-green-400 hover:bg-green-50',
    emerald: 'border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50',
    purple: 'border-purple-200 hover:border-purple-400 hover:bg-purple-50',
  };

  return (
    <a
      href={href}
      className={`block bg-white rounded-lg border p-4 transition-colors ${colorMap[color] || ''}`}
    >
      <div className="font-semibold text-slate-900">{title}</div>
      <div className="text-sm text-slate-500 mt-1">{desc}</div>
    </a>
  );
}
