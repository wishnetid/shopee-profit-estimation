/**
 * Orders API
 * GET /api/orders - List orders with pagination & filters
 * POST /api/orders - Bulk import orders from Excel (Order.all)
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { Order } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    
    const offset = (page - 1) * limit;
    
    // Build query dengan filters
    let sql = 'SELECT * FROM orders WHERE 1=1';
    const params: any[] = [];
    
    if (status) {
      sql += ' AND status_pesanan = ?';
      params.push(status);
    }
    
    if (search) {
      sql += ' AND (no_pesanan LIKE ? OR nama_produk LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    
    sql += ' ORDER BY waktu_pesanan_dibuat DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const orders = await query<Order[]>(sql, params);
    
    // Count total untuk pagination
    let countSql = 'SELECT COUNT(*) as total FROM orders WHERE 1=1';
    const countParams: any[] = [];
    
    if (status) {
      countSql += ' AND status_pesanan = ?';
      countParams.push(status);
    }
    
    if (search) {
      countSql += ' AND (no_pesanan LIKE ? OR nama_produk LIKE ?)';
      countParams.push(`%${search}%`, `%${search}%`);
    }
    
    const [{ total }] = await query<any[]>(countSql, countParams);
    
    return NextResponse.json({
      success: true,
      data: orders,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit)
      }
    });
  } catch (error: any) {
    console.error('Orders API error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // TODO: Implement Excel upload & parsing
    // 1. Parse Excel file (Order.all)
    // 2. Validate columns
    // 3. Bulk insert ke database
    // 4. Return import summary
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Not implemented yet. Upload Excel parsing will be added.' 
      },
      { status: 501 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
