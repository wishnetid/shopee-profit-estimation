/**
 * Profit Summary API
 * GET /api/profit-calculation/summary - Aggregate profit statistics
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { ProfitSummary } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    
    // Aggregate query
    let sql = `
      SELECT 
        COUNT(DISTINCT o.no_pesanan) as total_orders,
        SUM(i.net_payout) as total_net_payout,
        SUM(m.harga) as total_hpp,
        SUM(i.net_payout - m.harga) as total_profit,
        AVG((i.net_payout - m.harga) / i.net_payout * 100) as average_margin_pct
      FROM orders o
      LEFT JOIN income_penghasilan i ON o.no_pesanan = i.no_pesanan
      LEFT JOIN master_products m ON (
        COALESCE(o.nomor_referensi_sku, o.sku_induk) = m.sku1
        OR COALESCE(o.nomor_referensi_sku, o.sku_induk) = m.sku2
      )
      WHERE i.net_payout IS NOT NULL AND m.harga IS NOT NULL
    `;
    
    const params: any[] = [];
    
    if (startDate) {
      sql += ' AND o.waktu_pesanan_dibuat >= ?';
      params.push(startDate);
    }
    
    if (endDate) {
      sql += ' AND o.waktu_pesanan_dibuat <= ?';
      params.push(endDate);
    }
    
    const [summary] = await query<ProfitSummary[]>(sql, params);
    
    // Get ad cost dari balance_transactions (optional)
    let adCostSql = `
      SELECT SUM(ABS(jumlah)) as total_ad_cost
      FROM balance_transactions
      WHERE tipe_transaksi = 'Pembayaran dengan Saldo Penjual'
      AND deskripsi LIKE '%Isi Ulang Saldo Iklan%'
    `;
    
    const adCostParams: any[] = [];
    
    if (startDate) {
      adCostSql += ' AND waktu_selesai >= ?';
      adCostParams.push(startDate);
    }
    
    if (endDate) {
      adCostSql += ' AND waktu_selesai <= ?';
      adCostParams.push(endDate);
    }
    
    const [{ total_ad_cost }] = await query<any[]>(adCostSql, adCostParams);
    
    // Calculate profit after ads
    const profitAfterAds = summary.total_profit - (total_ad_cost || 0);
    
    return NextResponse.json({
      success: true,
      data: {
        ...summary,
        total_ad_cost: total_ad_cost || 0,
        profit_after_ads: profitAfterAds
      }
    });
  } catch (error: any) {
    console.error('Profit summary API error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
