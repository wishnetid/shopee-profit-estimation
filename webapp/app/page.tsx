'use client';

import { useState, useEffect, useRef } from 'react';
import { ShoppingCart, DollarSign, Package, TrendingUp } from 'lucide-react';
import { useStore } from '@/components/StoreContext';

export default function HomePage() {
  const { storeId, activeStore } = useStore();
  const [stats, setStats] = useState({ orders: 0, income: 0, sku: 0 });
  const [loading, setLoading] = useState(true);
  const requestSequence = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const requestId = ++requestSequence.current;
      if (!storeId) {
        setStats({ orders: 0, income: 0, sku: 0 });
        setLoading(false);
        return;
      }
      const fetchStats = async () => {
        try {
          const [ordersRes, incomeRes, skuRes] = await Promise.all([
            fetch(`/api/orders?storeId=${storeId}&limit=1`),
            fetch(`/api/income?storeId=${storeId}&limit=1`),
            fetch('/api/sku?limit=1'),
          ]);
          const [orders, income, sku] = await Promise.all([
            ordersRes.json(),
            incomeRes.json(),
            skuRes.json(),
          ]);
          if (requestId !== requestSequence.current) return;
          setStats({
            orders: orders.total || 0,
            income: income.total || 0,
            sku: sku.total || 0,
          });
        } catch (e) {
          if (requestId === requestSequence.current) console.error('Failed to fetch stats:', e);
        } finally {
          if (requestId === requestSequence.current) setLoading(false);
        }
      };
      void fetchStats();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      requestSequence.current += 1;
    };
  }, [storeId]);

  return (
    <div className="p-4 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <section className="mb-6 overflow-hidden rounded-3xl border border-white/70 bg-white/75 p-5 shadow-xl shadow-violet-950/[0.06] backdrop-blur-xl lg:mb-8 lg:p-7">
          <div className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-violet-700">Workspace operasional</div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-950 lg:text-4xl">Shopee Profit Estimation</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600 lg:text-base">
            Toko <strong className="font-semibold text-slate-900">{activeStore?.store_name || 'aktif'}</strong> · kelola data Order.all, Income, dan Master SKU dalam satu workspace.
          </p>
        </section>

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
    blue: 'bg-violet-50 text-violet-700 ring-violet-100',
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    purple: 'bg-indigo-50 text-indigo-700 ring-indigo-100',
    yellow: 'bg-amber-50 text-amber-700 ring-amber-100',
  };

  return (
    <div className="rounded-2xl border border-white/80 bg-white/75 p-3.5 shadow-lg shadow-violet-950/[0.04] backdrop-blur-xl transition hover:-translate-y-0.5 hover:shadow-xl lg:p-5">
      <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl ring-1 ${colorClasses[color]}`}>
        {icon}
      </div>
      <div className="text-xs font-bold uppercase tracking-[0.11em] text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold tracking-tight text-slate-950 lg:text-3xl">{value}</div>
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
    blue: 'hover:border-violet-300 hover:bg-violet-50/70',
    green: 'hover:border-emerald-300 hover:bg-emerald-50/70',
    emerald: 'hover:border-teal-300 hover:bg-teal-50/70',
    purple: 'hover:border-indigo-300 hover:bg-indigo-50/70',
  };

  return (
    <a
      href={href}
      className={`group block rounded-2xl border border-white/80 bg-white/75 p-4 shadow-lg shadow-violet-950/[0.04] backdrop-blur-xl transition hover:-translate-y-0.5 hover:shadow-xl ${colorMap[color] || ''}`}
    >
      <div className="font-bold tracking-tight text-slate-900 transition group-hover:text-violet-800">{title}</div>
      <div className="mt-1 text-sm text-slate-500">{desc}</div>
    </a>
  );
}
