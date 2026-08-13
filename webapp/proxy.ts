import { NextRequest, NextResponse } from 'next/server';

const DASHBOARD_SESSION_COOKIE = 'shopee_profit_session';
const DASHBOARD_SESSION_TTL_SECONDS = 12 * 60 * 60;
const SESSION_TOKEN_VERSION = 'v1';
const encoder = new TextEncoder();

function sessionSecret() {
  return process.env.DASHBOARD_SESSION_SECRET || process.env.DASHBOARD_BASIC_AUTH_PASSWORD || '';
}

function toBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sign(payload: string, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return toBase64Url(new Uint8Array(signature));
}

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function isAuthorized(request: NextRequest) {
  const secret = sessionSecret();
  const token = request.cookies.get(DASHBOARD_SESSION_COOKIE)?.value;
  if (!secret || !token) return false;

  const [version, issuedAtRaw, expiresAtRaw, signature, ...extra] = token.split('.');
  const issuedAt = Number(issuedAtRaw);
  const expiresAt = Number(expiresAtRaw);
  const now = Math.floor(Date.now() / 1000);

  if (
    extra.length > 0
    || version !== SESSION_TOKEN_VERSION
    || !Number.isSafeInteger(issuedAt)
    || !Number.isSafeInteger(expiresAt)
    || issuedAt <= 0
    || expiresAt !== issuedAt + DASHBOARD_SESSION_TTL_SECONDS
    || issuedAt > now + 300
    || expiresAt <= now
    || !signature
  ) return false;

  const expectedSignature = await sign(`${version}.${issuedAt}.${expiresAt}`, secret);
  return safeEqual(signature, expectedSignature);
}

function isAuthRoute(pathname: string) {
  return pathname === '/login' || pathname.startsWith('/api/auth/');
}

function isBasicApiAuthorized(request: NextRequest) {
  const username = process.env.DASHBOARD_BASIC_AUTH_USER;
  const password = process.env.DASHBOARD_BASIC_AUTH_PASSWORD;
  const authorization = request.headers.get('authorization');
  if (!username || !password || !authorization?.startsWith('Basic ')) return false;

  try {
    const decoded = atob(authorization.slice(6));
    const separator = decoded.indexOf(':');
    if (separator < 0) return false;
    return safeEqual(decoded.slice(0, separator), username)
      && safeEqual(decoded.slice(separator + 1), password);
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (
    isAuthRoute(pathname)
    || await isAuthorized(request)
    || (pathname.startsWith('/api/') && isBasicApiAuthorized(request))
  ) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Sesi login diperlukan.' }, { status: 401 });
  }

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
};
