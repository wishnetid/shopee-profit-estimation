import { NextRequest, NextResponse } from 'next/server';
import { readFile, access } from 'fs/promises';
import { constants } from 'fs';
import path from 'path';

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
    
    // Read progress file
    const progressFile = path.join('/tmp', `upload_${jobId}.json`);
    
    try {
      await access(progressFile, constants.F_OK);
      const data = await readFile(progressFile, 'utf-8');
      const progress = JSON.parse(data);
      
      return NextResponse.json({
        success: true,
        ...progress
      });
    } catch (err) {
      return NextResponse.json({
        success: false,
        error: 'Job not found',
        status: 'error'
      }, { status: 404 });
    }
    
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
