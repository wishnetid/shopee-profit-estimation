'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Plus, Store as StoreIcon, X } from 'lucide-react';

export type Store = {
  id: number;
  store_name: string;
  store_slug: string;
  username: string;
  display_name: string;
  order_count: number;
  income_package_count: number;
};

type StoreContextValue = {
  stores: Store[];
  storeId: string;
  activeStore: Store | null;
  loading: boolean;
  error: string;
  setStoreId: (id: string) => void;
  refreshStores: () => Promise<void>;
};

const StoreContext = createContext<StoreContextValue | null>(null);
const STORAGE_KEY = 'shopee-profit-active-store-id';

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreIdState] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refreshSequence = useRef(0);

  const refreshStores = useCallback(async () => {
    const requestId = ++refreshSequence.current;
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/stores', { cache: 'no-store' });
      const payload = await response.json();
      if (requestId !== refreshSequence.current) return;
      if (!response.ok) throw new Error(payload.error || 'Gagal memuat daftar toko.');
      const nextStores = (payload.stores || []) as Store[];
      setStores(nextStores);
      setStoreIdState(current => {
        const stored = window.localStorage.getItem(STORAGE_KEY) || current;
        const valid = nextStores.some(store => String(store.id) === stored);
        const next = valid ? stored : nextStores[0] ? String(nextStores[0].id) : '';
        if (next) window.localStorage.setItem(STORAGE_KEY, next);
        return next;
      });
    } catch (cause) {
      if (requestId === refreshSequence.current) setError(cause instanceof Error ? cause.message : 'Gagal memuat daftar toko.');
    } finally {
      if (requestId === refreshSequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refreshStores(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshStores]);

  const setStoreId = (id: string) => {
    setStoreIdState(id);
    if (id) window.localStorage.setItem(STORAGE_KEY, id);
  };

  const activeStore = useMemo(
    () => stores.find(store => String(store.id) === storeId) || null,
    [stores, storeId],
  );

  return (
    <StoreContext.Provider value={{ stores, storeId, activeStore, loading, error, setStoreId, refreshStores }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) throw new Error('useStore must be used inside StoreProvider.');
  return context;
}

function storeMeta(store: Store) {
  return `${store.order_count.toLocaleString('id-ID')} order · ${store.income_package_count} Income package`;
}

export function StoreSwitcher() {
  const { stores, storeId, activeStore, loading, error, setStoreId, refreshStores } = useStore();
  const [open, setOpen] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [storeName, setStoreName] = useState('');
  const [storeSlug, setStoreSlug] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);

  const closePopover = useCallback(() => {
    setOpen(false);
    setShowCreateForm(false);
  }, []);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) closePopover();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePopover();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [closePopover]);

  const chooseStore = (store: Store) => {
    setStoreId(String(store.id));
    setMessage('');
    closePopover();
  };

  const createStore = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!storeName.trim() || !storeSlug.trim()) return;
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/stores', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          storeName: storeName.trim(),
          storeSlug: storeSlug.trim().toLowerCase(),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Gagal membuat toko.');
      await refreshStores();
      setStoreId(String(payload.storeId));
      setStoreName('');
      setStoreSlug('');
      closePopover();
      setMessage('Toko berhasil ditambahkan dan dijadikan workspace aktif.');
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Gagal membuat toko.');
    } finally {
      setSaving(false);
    }
  };

  const workspaceName = activeStore?.store_name || (loading ? 'Memuat workspace…' : 'Belum ada toko');
  const workspaceMeta = activeStore ? storeMeta(activeStore) : 'Pilih toko untuk memulai';

  return (
    <header className="sticky top-0 z-30 border-b border-white/70 bg-white/75 px-4 py-3 shadow-sm shadow-violet-950/[0.03] backdrop-blur-xl lg:px-8">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <div ref={popoverRef} className="relative min-w-0">
          <button
            type="button"
            aria-label="Pilih workspace toko"
            aria-haspopup="dialog"
            aria-expanded={open}
            disabled={loading}
            onClick={() => { setMessage(''); setOpen(value => !value); }}
            className="group flex min-h-11 max-w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-left shadow-sm transition hover:border-purple-300 hover:bg-purple-50/40 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-purple-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-gradient-to-br from-purple-600 to-indigo-600 text-white shadow-sm">
              <StoreIcon className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Workspace aktif</span>
              <span className="block truncate text-sm font-bold text-slate-900">{workspaceName}</span>
              <span className="block truncate text-[11px] text-slate-500">{workspaceMeta}</span>
            </span>
            <ChevronDown className={`h-4 w-4 flex-none text-slate-400 transition-transform ${open ? 'rotate-180 text-purple-600' : 'group-hover:text-purple-600'}`} />
          </button>

          {open && (
            <div role="dialog" aria-label="Daftar workspace toko" className="absolute left-0 top-[calc(100%+0.6rem)] z-50 w-[min(25rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10">
              <div className="flex items-start justify-between border-b border-slate-100 px-4 py-3.5">
                <div>
                  <p className="text-sm font-bold text-slate-900">Pilih workspace toko</p>
                  <p className="mt-0.5 text-xs text-slate-500">Semua halaman dan upload mengikuti toko aktif.</p>
                </div>
                <button type="button" onClick={closePopover} aria-label="Tutup pemilih workspace" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>
              </div>

              {!showCreateForm ? <>
                <div className="max-h-72 overflow-y-auto p-2">
                  {stores.map(store => {
                    const selected = String(store.id) === storeId;
                    return <button key={store.id} type="button" onClick={() => chooseStore(store)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${selected ? 'bg-purple-50 text-purple-950' : 'hover:bg-slate-50'}`}>
                      <span className={`flex h-9 w-9 flex-none items-center justify-center rounded-lg ${selected ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-500'}`}><StoreIcon className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{store.store_name}</span><span className="mt-0.5 block truncate text-xs text-slate-500">{storeMeta(store)}</span></span>
                      {selected && <Check className="h-4 w-4 flex-none text-purple-600" />}
                    </button>;
                  })}
                </div>
                <div className="border-t border-slate-100 p-2">
                  <button type="button" onClick={() => setShowCreateForm(true)} className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-purple-300 px-3 text-sm font-bold text-purple-700 transition hover:border-purple-500 hover:bg-purple-50"><Plus className="h-4 w-4" /> Tambah toko baru</button>
                </div>
              </> : <form onSubmit={createStore} className="space-y-3 p-4">
                <div className="flex items-center justify-between"><div><p className="text-sm font-bold text-slate-900">Tambah toko baru</p><p className="text-xs text-slate-500">Akan langsung menjadi workspace aktif.</p></div><button type="button" onClick={() => setShowCreateForm(false)} className="text-xs font-semibold text-purple-700 hover:text-purple-900">Kembali</button></div>
                <label className="block text-xs font-semibold text-slate-700">Nama toko<input required maxLength={160} autoFocus value={storeName} onChange={event => setStoreName(event.target.value)} placeholder="TACTICALITY" className="mt-1.5 block min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-purple-500 focus:ring-2 focus:ring-purple-100" /></label>
                <label className="block text-xs font-semibold text-slate-700">Slug toko<input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={80} value={storeSlug} onChange={event => setStoreSlug(event.target.value.toLowerCase())} placeholder="tacticality" className="mt-1.5 block min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-purple-500 focus:ring-2 focus:ring-purple-100" /></label>
                <div className="flex justify-end gap-2 pt-1"><button type="button" onClick={() => setShowCreateForm(false)} className="min-h-10 rounded-lg px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100">Batal</button><button disabled={saving} className="min-h-10 rounded-lg bg-purple-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Menyimpan…' : 'Simpan toko'}</button></div>
              </form>}
            </div>
          )}
        </div>
        <div className="hidden text-right sm:block"><p className="text-xs font-semibold text-slate-700">Shopee Profit Estimation</p><p className="mt-0.5 text-[11px] text-slate-500">Workspace data operasional</p></div>
      </div>
      {(error || message) && <div className={`mt-2 text-xs ${error ? 'text-red-600' : 'text-emerald-700'}`}>{error || message}</div>}
    </header>
  );
}
