'use client';

import { FormEvent, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Eye,
  EyeOff,
  Lock,
  Package,
  ShieldCheck,
  Sparkles,
  Store,
} from 'lucide-react';

const LOCAL_ORIGIN = 'https://dashboard.local';
const MAX_REDIRECT_PATH_LENGTH = 2048;
const MAX_REDIRECT_DECODE_STEPS = 6;

function normalizeRedirectPathname(value: string) {
  let candidate = value;
  for (let step = 0; step <= MAX_REDIRECT_DECODE_STEPS; step += 1) {
    if (candidate.includes('\\') || /[\u0000-\u001F\u007F]/.test(candidate)) return null;
    if (!candidate.includes('%')) return candidate;

    try {
      const decoded = decodeURIComponent(candidate);
      if (decoded === candidate) return null;
      candidate = decoded;
    } catch {
      return null;
    }
  }

  return null;
}

function isAuthPath(pathname: string) {
  return pathname === '/login'
    || pathname.startsWith('/login/')
    || pathname === '/api/auth'
    || pathname.startsWith('/api/auth/');
}

function safeNextPath(value: string) {
  const next = value.trim();
  if (
    next.length > MAX_REDIRECT_PATH_LENGTH
    || !next.startsWith('/')
    || next.startsWith('//')
    || next.includes('\\')
    || /[\u0000-\u001F\u007F]/.test(next)
  ) return '/';

  try {
    const target = new URL(next, LOCAL_ORIGIN);
    const normalizedPathname = normalizeRedirectPathname(target.pathname);
    if (
      target.origin !== LOCAL_ORIGIN
      || !normalizedPathname
      || normalizedPathname.startsWith('//')
      || isAuthPath(normalizedPathname)
    ) return '/';
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return '/';
  }
}

export default function LoginForm({ requestedNext }: { requestedNext: string }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const next = safeNextPath(requestedNext);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password, next }),
      });
      const payload = await response.json() as { error?: string; redirectTo?: string };
      if (!response.ok) throw new Error(payload.error || 'Login gagal. Coba lagi.');
      window.location.assign(safeNextPath(payload.redirectTo || next));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Login gagal. Coba lagi.');
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-slate-950 p-4 sm:p-6 lg:p-8">
      <div className="relative mx-auto grid min-h-[calc(100vh-2rem)] max-w-7xl overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900 shadow-2xl shadow-slate-950/50 lg:min-h-[calc(100vh-4rem)] lg:grid-cols-[1.12fr_0.88fr]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(168,85,247,0.25),transparent_28%),radial-gradient(circle_at_80%_75%,rgba(59,130,246,0.17),transparent_26%)]" />

        <section className="relative hidden flex-col justify-between border-r border-white/10 p-10 text-white lg:flex xl:p-14">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold tracking-wide text-violet-100 backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" />
              OPERASIONAL SHOPEE
            </div>
            <div className="mt-10 flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-400 to-indigo-500 shadow-lg shadow-violet-950/40">
                <Store className="h-6 w-6" />
              </span>
              <div>
                <p className="text-xl font-bold tracking-tight">Shopee Profit</p>
                <p className="text-sm text-slate-300">Estimation Dashboard</p>
              </div>
            </div>

            <h1 className="mt-16 max-w-lg text-4xl font-semibold leading-tight tracking-tight xl:text-5xl">
              Satu workspace untuk data dan estimasi profit toko lo.
            </h1>
            <p className="mt-5 max-w-md text-base leading-7 text-slate-300">
              Kelola report Order.all, Income, Master SKU, dan analisa estimasi dalam satu dashboard yang rapi.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <InfoCard icon={BarChart3} label="Analisa" value="Profit & Estimasi" />
            <InfoCard icon={Package} label="Data source" value="Report Shopee" />
          </div>
        </section>

        <section className="relative flex min-h-[calc(100vh-2rem)] items-center justify-center bg-white px-5 py-10 sm:px-10 lg:min-h-0 lg:px-14 xl:px-20">
          <div className="w-full max-w-md">
            <div className="mb-10 lg:hidden">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-200">
                  <Store className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-bold tracking-tight text-slate-900">Shopee Profit</p>
                  <p className="text-xs text-slate-500">Estimation Dashboard</p>
                </div>
              </div>
            </div>

            <div className="mb-8">
              <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 text-violet-700 ring-1 ring-violet-100">
                <Lock className="h-5 w-5" />
              </span>
              <h2 className="text-3xl font-bold tracking-tight text-slate-900">Masuk ke Shopee Profit</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">Gunakan akun dashboard untuk melanjutkan ke workspace operasional lo.</p>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">Username</span>
                <input
                  required
                  autoFocus
                  value={username}
                  onChange={event => setUsername(event.target.value)}
                  autoComplete="username"
                  placeholder="Masukkan username"
                  className="min-h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">Password</span>
                <span className="relative block">
                  <input
                    required
                    value={password}
                    onChange={event => setPassword(event.target.value)}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Masukkan password"
                    className="min-h-12 w-full rounded-xl border border-slate-200 bg-white py-3 pl-4 pr-12 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(value => !value)}
                    aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                    className="absolute inset-y-0 right-0 flex min-h-12 w-12 items-center justify-center rounded-r-xl text-slate-400 transition hover:text-violet-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-violet-300"
                  >
                    {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                  </button>
                </span>
              </label>

              {error && (
                <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm font-medium text-rose-700">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="group flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 text-sm font-bold text-white shadow-lg shadow-violet-200 transition hover:from-violet-700 hover:to-indigo-700 focus:outline-none focus:ring-4 focus:ring-violet-200 disabled:cursor-wait disabled:opacity-70"
              >
                {submitting ? 'Memverifikasi…' : 'Masuk ke Dashboard'}
                {!submitting && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
              </button>
            </form>

            <div className="mt-8 flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-3 text-xs leading-5 text-slate-500">
              <ShieldCheck className="mt-0.5 h-4 w-4 flex-none text-emerald-600" />
              <p>Sesi dilindungi dan tersimpan aman di browser ini. Akses berakhir otomatis setelah 12 jam.</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function InfoCard({ icon: Icon, label, value }: { icon: typeof BarChart3; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-4 backdrop-blur">
      <Icon className="h-5 w-5 text-violet-200" />
      <p className="mt-5 text-xs font-medium uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}
