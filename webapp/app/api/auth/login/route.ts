import { NextRequest, NextResponse } from 'next/server';

const {
  DASHBOARD_SESSION_COOKIE,
  DASHBOARD_SESSION_TTL_SECONDS,
  createDashboardSessionToken,
  isSameOriginMutation,
  isValidDashboardCredentials,
// eslint-disable-next-line @typescript-eslint/no-require-imports
} = require('../../../../lib/dashboard-auth.js') as {
  DASHBOARD_SESSION_COOKIE: string;
  DASHBOARD_SESSION_TTL_SECONDS: number;
  createDashboardSessionToken: () => string;
  isSameOriginMutation: (origin: string | null, expectedOrigin: string) => boolean;
  isValidDashboardCredentials: (username: string, password: string) => boolean;
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

function safeNextPath(value: unknown, request: NextRequest) {
  if (typeof value !== 'string') return '/';
  const path = value.trim();
  if (
    path.length > MAX_REDIRECT_PATH_LENGTH
    || !path.startsWith('/')
    || path.startsWith('//')
    || path.includes('\\')
    || /[\u0000-\u001F\u007F]/.test(path)
  ) return '/';

  try {
    const target = new URL(path, request.nextUrl.origin);
    const normalizedPathname = normalizeRedirectPathname(target.pathname);
    if (
      target.origin !== request.nextUrl.origin
      || !normalizedPathname
      || normalizedPathname.startsWith('//')
      || isAuthPath(normalizedPathname)
    ) return '/';
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return '/';
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request.headers.get('origin'), request.nextUrl.origin)) {
    return NextResponse.json({ error: 'Cross-origin request rejected.' }, { status: 403 });
  }

  let body: { username?: unknown; password?: unknown; next?: unknown };
  try {
    const payload = await request.json() as unknown;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return NextResponse.json({ error: 'Data login tidak valid.' }, { status: 400 });
    }
    body = payload as { username?: unknown; password?: unknown; next?: unknown };
  } catch {
    return NextResponse.json({ error: 'Data login tidak valid.' }, { status: 400 });
  }

  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!isValidDashboardCredentials(username, password)) {
    return NextResponse.json({ error: 'Username atau password salah.' }, { status: 401 });
  }

  const sessionToken = createDashboardSessionToken();
  if (!sessionToken) {
    return NextResponse.json({ error: 'Konfigurasi sesi belum siap.' }, { status: 503 });
  }

  const response = NextResponse.json({ success: true, redirectTo: safeNextPath(body.next, request) });
  response.cookies.set({
    name: DASHBOARD_SESSION_COOKIE,
    value: sessionToken,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: DASHBOARD_SESSION_TTL_SECONDS,
    priority: 'high',
  });
  return response;
}
