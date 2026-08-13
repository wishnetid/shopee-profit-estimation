'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  CircleAlert,
  DollarSign,
  Megaphone,
  Package,
  Settings,
  ShoppingCart,
  Upload,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';
import { StoreProvider, StoreSwitcher } from '@/components/StoreContext';

export default function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === '/login') return <>{children}</>;

  return (
    <StoreProvider>
      <div className="flex h-screen bg-slate-50">
        <aside className="hidden w-64 flex-shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
          <div className="border-b border-slate-200 p-6">
            <h1 className="text-xl font-bold text-slate-900">Shopee Profit</h1>
            <p className="mt-1 text-sm text-slate-500">Estimation Dashboard</p>
          </div>
          <nav className="flex-1 space-y-1 p-4" aria-label="Navigasi utama">
            <NavLink href="/upload" icon={Upload}>Upload Manager</NavLink>
            <NavLink href="/orders" icon={ShoppingCart}>Order All</NavLink>
            <NavLink href="/income" icon={DollarSign}>Income</NavLink>
            <NavLink href="/sku" icon={Package}>SKU Master</NavLink>
            <NavLink href="/balance" icon={WalletCards}>Balance RAW</NavLink>
            <NavLink href="/exceptions" icon={CircleAlert}>Order Exceptions</NavLink>
            <NavLink href="/ads" icon={Megaphone}>Ads RAW</NavLink>
            <NavLink href="/profit" icon={BarChart3}>Profit & Estimasi</NavLink>
            <NavLink href="/settings" icon={Settings}>Settings</NavLink>
          </nav>
          <div className="border-t border-slate-200 p-4">
            <p className="text-xs text-slate-500">Database: cPanel MySQL</p>
          </div>
        </aside>

        <main className="flex-1 overflow-auto pb-20 lg:pb-0">
          <StoreSwitcher />
          {children}
        </main>

        <nav className="safe-area-pb fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white lg:hidden" aria-label="Navigasi mobile">
          <div className="flex items-center gap-1 overflow-x-auto px-1 py-1">
            <MobileNavLink href="/upload" icon={Upload} label="Upload" />
            <MobileNavLink href="/orders" icon={ShoppingCart} label="Orders" />
            <MobileNavLink href="/income" icon={DollarSign} label="Income" />
            <MobileNavLink href="/sku" icon={Package} label="SKU" />
            <MobileNavLink href="/balance" icon={WalletCards} label="Balance" />
            <MobileNavLink href="/exceptions" icon={CircleAlert} label="Exception" />
            <MobileNavLink href="/ads" icon={Megaphone} label="Ads" />
            <MobileNavLink href="/profit" icon={BarChart3} label="Estimasi" />
            <MobileNavLink href="/settings" icon={Settings} label="Setting" />
          </div>
        </nav>
      </div>
    </StoreProvider>
  );
}

function NavLink({ href, icon: Icon, children }: { href: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <Link href={href} className="group flex items-center gap-3 rounded-lg px-4 py-3 text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900">
      <Icon className="h-5 w-5 text-slate-400 group-hover:text-slate-600" />
      <span className="font-medium">{children}</span>
    </Link>
  );
}

function MobileNavLink({ href, icon: Icon, label }: { href: string; icon: LucideIcon; label: string }) {
  return (
    <Link href={href} className="flex min-w-[52px] flex-col items-center justify-center gap-0.5 px-2 py-1.5 text-slate-500 transition-colors active:text-purple-600">
      <Icon className="h-5 w-5" />
      <span className="text-[10px] font-medium">{label}</span>
    </Link>
  );
}
