import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const target = new URL('/api/raw', request.url);
  request.nextUrl.searchParams.forEach((value, key) => target.searchParams.set(key, value));
  target.searchParams.set('reportType', 'ads');
  return NextResponse.redirect(target, 307);
}
