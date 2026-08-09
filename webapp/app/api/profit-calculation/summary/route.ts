import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Profit remains disabled until Balance, HPP, return/refund, and allocation
 * contracts are analyzed against the active RAW tables.
 */
export async function GET(_request: NextRequest) {
  return NextResponse.json(
    {
      success: false,
      code: 'PROFIT_NOT_READY',
      error: 'Profit belum tersedia. Kontrak financial RAW belum disetujui.',
    },
    { status: 503 },
  );
}
