import { NextRequest, NextResponse } from 'next/server';
import { query } from '../../../../lib/db';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const jobId = searchParams.get('jobId');
    
    if (!jobId) {
      return NextResponse.json(
        { success: false, error: 'Missing jobId parameter' },
        { status: 400 }
      );
    }
    
    // Read from database
    const results = await query(
      'SELECT * FROM upload_jobs WHERE job_id = ? LIMIT 1',
      [jobId]
    );
    
    if (!results || (results as any[]).length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Job not found',
        status: 'error'
      }, { status: 404 });
    }
    
    const job = (results as any[])[0];
    
    // Parse JSON stats
    let stats = null;
    if (job.stats) {
      try {
        stats = typeof job.stats === 'string' ? JSON.parse(job.stats) : job.stats;
      } catch (e) {
        stats = null;
      }
    }
    
    return NextResponse.json({
      success: true,
      status: job.status,
      progress: job.progress,
      message: job.message,
      stage: job.stage,
      error: job.error,
      stats: stats
    });
    
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
