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
  Store,
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
      <div className="flex h-screen bg-transparent">
        <aside className="hidden w-64 flex-shrink-0 flex-col border-r border-white/10 bg-slate-950 text-white shadow-2xl shadow-violet-950/10 lg:flex">
          <div className="border-b border-white/10 p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 shadow-lg shadow-violet-950/40"><Store className="h-5 w-5" /></span>
              <div><h1 className="text-base font-bold tracking-tight">Shopee Profit</h1><p className="mt-0.5 text-xs text-slate-400">Estimation Dashboard</p></div>
            </div>
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
          <div className="border-t border-white/10 p-4">
            <p className="text-xs text-slate-400">Database: cPanel MySQL</p>
          </div>
        </aside>

        <main className="flex-1 overflow-auto pb-20 lg:pb-0">
          <StoreSwitcher />
          {children}
        </main>

        <nav className="safe-area-pb fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-slate-950/95 shadow-2xl shadow-violet-950/20 backdrop-blur-xl lg:hidden" aria-label="Navigasi mobile">
          <div className="flex items-center gap-1 overflow-x-auto px-1 py-1">
            <MobileNavLink href="/upload" icon={Upload} label="Upload" active={pathname === '/upload'} />
            <MobileNavLink href="/orders" icon={ShoppingCart} label="Orders" active={pathname === '/orders'} />
            <MobileNavLink href="/income" icon={DollarSign} label="Income" active={pathname === '/income'} />
            <MobileNavLink href="/sku" icon={Package} label="SKU" active={pathname === '/sku'} />
            <MobileNavLink href="/balance" icon={WalletCards} label="Balance" active={pathname === '/balance'} />
            <MobileNavLink href="/exceptions" icon={CircleAlert} label="Exception" active={pathname === '/exceptions'} />
            <MobileNavLink href="/ads" icon={Megaphone} label="Ads" active={pathname === '/ads'} />
            <MobileNavLink href="/profit" icon={BarChart3} label="Estimasi" active={pathname === '/profit'} />
            <MobileNavLink href="/settings" icon={Settings} label="Setting" active={pathname === '/settings'} />
          </div>
        </nav>
      </div>
    </StoreProvider>
  );
}

function NavLink({ href, icon: Icon, children }: { href: string; icon: LucideIcon; children: React.ReactNode }) {
  const active = usePathname() === href;
  return (
    <Link href={href} className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${active ? 'bg-white/12 text-white shadow-sm' : 'text-slate-400 hover:bg-white/7 hover:text-white'}`}>
      <Icon className={`h-4.5 w-4.5 ${active ? 'text-violet-300' : 'text-slate-500 group-hover:text-violet-300'}`} />
      <span className="font-semibold">{children}</span>
    </Link>
  );
}

function MobileNavLink({ href, icon: Icon, label, active }: { href: string; icon: LucideIcon; label: string; active: boolean }) {
  return (
    <Link href={href} className={`flex min-w-[52px] flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1.5 transition ${active ? 'bg-white/12 text-violet-200' : 'text-slate-400 active:text-violet-200'}`}>
      <Icon className="h-5 w-5" />
      <span className="text-[10px] font-semibold">{label}</span>
    </Link>
  );
}
