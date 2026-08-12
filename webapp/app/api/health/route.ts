/**
 * Health Check API
 * Test database connection
 */

import { NextResponse } from 'next/server';
import { testConnection } from '@/lib/db';

export async function GET() {
  try {
    const dbConnected = await testConnection();
    
    if (!dbConnected) {
      return NextResponse.json(
        { 
          status: 'error',
          message: 'Database connection failed',
          timestamp: new Date().toISOString()
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      status: 'ok',
      message: 'API and database are healthy',
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
