'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Sidebar() {
  const pathname = usePathname();

  const navigation = [
    { name: 'Dashboard', href: '/', icon: '🏠' },
    { name: 'Upload Reports', href: '/upload', icon: '📤' },
    { name: 'Orders', href: '/orders', icon: '📦' },
    { name: 'Profit Analysis', href: '/profit', icon: '💰' },
  ];

  return (
    <aside className="w-64 bg-white border-r border-slate-200 p-6">
      <div className="mb-8">
        <h1 className="text-xl font-bold text-slate-900">Shopee</h1>
        <p className="text-sm text-slate-500">Profit Estimation</p>
      </div>

      <nav className="space-y-2">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                flex items-center gap-3 px-4 py-3 rounded-lg transition-colors
                ${isActive 
                  ? 'bg-blue-50 text-blue-700 font-medium' 
                  : 'text-slate-700 hover:bg-slate-50'
                }
              `}
            >
              <span className="text-xl">{item.icon}</span>
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto pt-8 border-t border-slate-200">
        <div className="text-xs text-slate-500">
          <p>Database: MySQL (cPanel)</p>
          <p>Deploy: Vercel</p>
        </div>
      </div>
    </aside>
  );
}
