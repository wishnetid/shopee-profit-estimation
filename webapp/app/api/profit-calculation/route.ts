/**
 * Profit Calculation API
 * GET /api/profit-calculation - Calculate profit per order
 * GET /api/profit-calculation/summary - Get profit summary statistics
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { ProfitCalculation, ProfitSummary } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const search = searchParams.get('search');
    
    const offset = (page - 1) * limit;
    
    // SQL JOIN untuk calculate profit
    // Formula: profit = income.net_payout - master.harga (HPP)
    let sql = `
      SELECT 
        o.no_pesanan,
        o.nama_produk,
        o.jumlah,
        o.status_pesanan,
        o.waktu_pesanan_dibuat,
        i.net_payout,
        m.harga as hpp,
        (i.net_payout - m.harga) as profit,
        ((i.net_payout - m.harga) / i.net_payout * 100) as margin_pct
      FROM orders o
      LEFT JOIN income_penghasilan i ON o.no_pesanan = i.no_pesanan
      LEFT JOIN master_products m ON (
        COALESCE(o.nomor_referensi_sku, o.sku_induk) = m.sku1
        OR COALESCE(o.nomor_referensi_sku, o.sku_induk) = m.sku2
      )
      WHERE 1=1
    `;
    
    const params: any[] = [];
    
    if (search) {
      sql += ' AND (o.no_pesanan LIKE ? OR o.nama_produk LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    
    sql += ' ORDER BY o.waktu_pesanan_dibuat DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const results = await query<ProfitCalculation[]>(sql, params);
    
    // Count total
    let countSql = `
      SELECT COUNT(*) as total
      FROM orders o
      LEFT JOIN income_penghasilan i ON o.no_pesanan = i.no_pesanan
      LEFT JOIN master_products m ON (
        COALESCE(o.nomor_referensi_sku, o.sku_induk) = m.sku1
        OR COALESCE(o.nomor_referensi_sku, o.sku_induk) = m.sku2
      )
      WHERE 1=1
    `;
    
    const countParams: any[] = [];
    
    if (search) {
      countSql += ' AND (o.no_pesanan LIKE ? OR o.nama_produk LIKE ?)';
      countParams.push(`%${search}%`, `%${search}%`);
    }
    
    const [{ total }] = await query<any[]>(countSql, countParams);
    
    return NextResponse.json({
      success: true,
      data: results,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit)
      }
    });
  } catch (error: any) {
    console.error('Profit calculation API error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
