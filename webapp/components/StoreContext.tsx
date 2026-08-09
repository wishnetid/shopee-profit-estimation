'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

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

export function StoreSwitcher() {
  const { stores, storeId, activeStore, loading, error, setStoreId, refreshStores } = useStore();
  const [open, setOpen] = useState(false);
  const [storeName, setStoreName] = useState('');
  const [storeSlug, setStoreSlug] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

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
      setOpen(false);
      setMessage('Toko berhasil ditambahkan.');
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Gagal membuat toko.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:px-8">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="active-store" className="text-xs font-semibold uppercase tracking-wide text-slate-500">Toko aktif</label>
        <select
          id="active-store"
          value={storeId}
          disabled={loading || stores.length === 0}
          onChange={event => setStoreId(event.target.value)}
          className="min-w-[210px] rounded-lg border border-purple-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          {!stores.length && <option value="">{loading ? 'Memuat toko…' : 'Belum ada toko'}</option>}
          {stores.map(store => <option key={store.id} value={store.id}>{store.store_name} · {store.order_count.toLocaleString('id-ID')} order</option>)}
        </select>
        {activeStore && <span className="text-xs text-slate-500">Income: {activeStore.income_package_count} package · semua upload baru masuk ke toko ini</span>}
        <button type="button" onClick={() => setOpen(value => !value)} className="rounded-lg border border-purple-300 px-3 py-2 text-xs font-semibold text-purple-700 hover:bg-purple-50">+ Tambah toko</button>
      </div>
      {error && <div className="mt-2 text-xs text-red-600">{error}</div>}
      {message && <div className="mt-2 text-xs text-emerald-600">{message}</div>}
      {open && <form onSubmit={createStore} className="mt-3 flex flex-wrap items-end gap-2 rounded-lg bg-purple-50 p-3">
        <label className="text-xs text-slate-600">Nama toko<input required maxLength={160} value={storeName} onChange={event => setStoreName(event.target.value)} placeholder="TACTICALITY" className="mt-1 block rounded border border-slate-300 bg-white px-2 py-1.5 text-sm" /></label>
        <label className="text-xs text-slate-600">Slug<input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={80} value={storeSlug} onChange={event => setStoreSlug(event.target.value.toLowerCase())} placeholder="tacticality" className="mt-1 block rounded border border-slate-300 bg-white px-2 py-1.5 text-sm" /></label>
        <button disabled={saving} className="rounded bg-purple-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{saving ? 'Menyimpan…' : 'Simpan toko'}</button>
      </form>}
    </div>
  );
}
