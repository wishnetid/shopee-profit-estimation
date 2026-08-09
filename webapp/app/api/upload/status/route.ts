import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * The active upload flow is synchronous preview/import and does not create
 * upload_jobs records. Keep the old route explicit so stale clients cannot
 * mistake a missing background job for an active upload.
 */
export async function GET() {
  return NextResponse.json(
    {
      success: false,
      code: 'UPLOAD_STATUS_RETIRED',
      error: 'Upload status polling is retired. Use the direct preview/import response.',
    },
    { status: 410 },
  );
}
