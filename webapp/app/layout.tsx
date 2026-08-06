import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';
import { Upload, ShoppingCart, DollarSign, Package } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Shopee Profit Estimation',
  description: 'Dashboard untuk estimasi profit Shopee',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className="antialiased">
        <div className="flex h-screen bg-slate-50">
          {/* Sidebar */}
          <aside className="w-64 bg-white border-r border-slate-200 flex flex-col">
            {/* Logo/Title */}
            <div className="p-6 border-b border-slate-200">
              <h1 className="text-xl font-bold text-slate-900">
                Shopee Profit
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                Estimation Dashboard
              </p>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-4 space-y-1">
              <NavLink href="/upload" icon={Upload}>
                Upload Manager
              </NavLink>
              <NavLink href="/orders" icon={ShoppingCart}>
                Order All
              </NavLink>
              <NavLink href="/income" icon={DollarSign}>
                Income
              </NavLink>
              <NavLink href="/sku" icon={Package}>
                SKU Master
              </NavLink>
            </nav>

            {/* Footer */}
            <div className="p-4 border-t border-slate-200">
              <p className="text-xs text-slate-500">
                Database: cPanel MySQL
              </p>
              <p className="text-xs text-slate-400 mt-1">
                v2.0 • 2026-08-06
              </p>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}

function NavLink({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: any;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-4 py-3 text-slate-700 rounded-lg hover:bg-slate-100 hover:text-slate-900 transition-colors group"
    >
      <Icon className="w-5 h-5 text-slate-400 group-hover:text-slate-600" />
      <span className="font-medium">{children}</span>
    </Link>
  );
}
