'use client';

import { AlertTriangle, BarChart3 } from 'lucide-react';
import { useStore } from '@/components/StoreContext';

export default function ProfitPage() {
  const { activeStore } = useStore();

  return (
    <div className="p-4 lg:p-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-start gap-3">
          <div className="rounded-xl bg-purple-50 p-3 text-purple-700">
            <BarChart3 className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 lg:text-3xl">Profit Analysis</h1>
            <p className="mt-1 text-sm text-slate-600">
              Financial layer untuk {activeStore?.store_name || 'toko aktif'} belum tersedia (PROFIT_NOT_READY).
            </p>
          </div>
        </div>

        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 lg:p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
            <div className="text-sm text-amber-900">
              <h2 className="mb-2 font-semibold">Profit belum bisa dihitung dengan aman</h2>
              <p>
                Route Profit lama dinonaktifkan karena masih membaca tabel legacy dan belum memiliki scope toko.
                Tidak ada angka estimasi yang ditampilkan supaya hasil antar toko tidak tercampur.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-slate-200 bg-white p-4 lg:p-6">
            <h2 className="mb-3 text-base font-semibold text-slate-900">Fondasi yang masih diperlukan</h2>
            <ul className="space-y-2 text-sm text-slate-600">
              <li>• Analisa Balance Transaction dan biaya iklan.</li>
              <li>• Kontrak return, refund, failed delivery, dan cancellation.</li>
              <li>• Mapping HPP shared SKU ke item Order.all.</li>
              <li>• Aturan alokasi settlement Income Order ke Income SKU.</li>
              <li>• Pemisahan actual/confirmed profit dan estimation profit.</li>
            </ul>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 lg:p-6">
            <h2 className="mb-3 text-base font-semibold text-slate-900">Status saat ini</h2>
            <div className="space-y-3 text-sm">
              <StatusRow label="Order.all RAW" value="Aktif" tone="green" />
              <StatusRow label="Income RAW package" value="Aktif" tone="green" />
              <StatusRow label="Balance / iklan" value="Belum dianalisa" tone="amber" />
              <StatusRow label="HPP dan profit" value="Ditahan" tone="slate" />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function StatusRow({ label, value, tone }: { label: string; value: string; tone: 'green' | 'amber' | 'slate' }) {
  const colors = {
    green: 'bg-green-50 text-green-700',
    amber: 'bg-amber-50 text-amber-700',
    slate: 'bg-slate-100 text-slate-600',
  };

  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2 last:border-0 last:pb-0">
      <span className="text-slate-600">{label}</span>
      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${colors[tone]}`}>{value}</span>
    </div>
  );
}
