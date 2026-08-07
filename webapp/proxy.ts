import { NextRequest, NextResponse } from 'next/server';

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function isAuthorized(request: NextRequest) {
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

export function proxy(request: NextRequest) {
  if (String(process.env.DASHBOARD_AUTH_ENABLED ?? 'true').trim().toLowerCase() === 'false') {
    return NextResponse.next();
  }
  if (isAuthorized(request)) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: 'Authentication required.' },
      { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="Shopee Profit Estimation"' } },
    );
  }

  return new NextResponse('Authentication required.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Shopee Profit Estimation"' },
  });
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
};
