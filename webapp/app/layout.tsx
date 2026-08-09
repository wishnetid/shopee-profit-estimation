import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';
import { Upload, ShoppingCart, DollarSign, Package, BarChart3, Settings } from 'lucide-react';
import { StoreProvider, StoreSwitcher } from '@/components/StoreContext';

export const metadata: Metadata = {
  title: 'Shopee Profit Estimation',
  description: 'Dashboard untuk estimasi profit Shopee',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className="antialiased">
        <StoreProvider>
        <div className="flex h-screen bg-slate-50">
          {/* Desktop Sidebar */}
          <aside className="hidden lg:flex lg:flex-col w-64 bg-white border-r border-slate-200 flex-shrink-0">
            <div className="p-6 border-b border-slate-200">
              <h1 className="text-xl font-bold text-slate-900">
                Shopee Profit
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                Estimation Dashboard
              </p>
            </div>
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
              <NavLink href="/profit" icon={BarChart3}>
                Profit
              </NavLink>
              <NavLink href="/settings" icon={Settings}>
                Settings
              </NavLink>
            </nav>
            <div className="p-4 border-t border-slate-200">
              <p className="text-xs text-slate-500">
                Database: cPanel MySQL
              </p>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 overflow-auto pb-20 lg:pb-0">
            <StoreSwitcher />
            {children}
          </main>

          {/* Mobile Bottom Nav */}
          <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-50 safe-area-pb">
            <div className="flex justify-around items-center px-1 py-1">
              <MobileNavLink href="/upload" icon={Upload} label="Upload" />
              <MobileNavLink href="/orders" icon={ShoppingCart} label="Orders" />
              <MobileNavLink href="/income" icon={DollarSign} label="Income" />
              <MobileNavLink href="/sku" icon={Package} label="SKU" />
              <MobileNavLink href="/profit" icon={BarChart3} label="Profit" />
              <MobileNavLink href="/settings" icon={Settings} label="Setting" />
            </div>
          </nav>
        </div>
        </StoreProvider>
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

function MobileNavLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: any;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 text-slate-500 active:text-blue-600 transition-colors min-w-[52px]"
    >
      <Icon className="w-5 h-5" />
      <span className="text-[10px] font-medium">{label}</span>
    </Link>
  );
}
