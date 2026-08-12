import { NextRequest, NextResponse } from 'next/server';

const SECTIONS: Record<string, string> = {
  cancellation: 'cancellation',
  failed_delivery: 'failed_delivery',
  return_refund: 'return_refund',
};

export async function GET(request: NextRequest) {
  const section = request.nextUrl.searchParams.get('section') || '';
  const reportType = SECTIONS[section];
  if (!reportType) return NextResponse.json({ error: 'Invalid exception section.' }, { status: 400 });
  const target = new URL('/api/raw', request.url);
  request.nextUrl.searchParams.forEach((value, key) => target.searchParams.set(key, value));
  target.searchParams.set('reportType', reportType);
  return NextResponse.redirect(target, 307);
}
