import { NextRequest, NextResponse } from 'next/server';
import { createConnection } from 'mysql2/promise';

async function getConnection() {
  return createConnection({
    host: process.env.DB_HOST || '103.136.19.30',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'supplie3_shopee_profit_estimation',
    password: process.env.DB_PASSWORD || 'Persib1933',
    database: process.env.DB_NAME || 'supplie3_shopee_profit_estimation',
  });
}

export async function GET(request: NextRequest) {
  const conn = await getConnection();
  
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const search = searchParams.get('search') || '';
    const sort = searchParams.get('sort') || 'tanggal_dana_dilepaskan';
    const direction = searchParams.get('direction') || 'desc';
    
    const offset = (page - 1) * limit;
    
    // Build WHERE clause for multi-query search
    let whereClause = '';
    const params: any[] = [];
    
    if (search) {
      const queries = search.split('||').map(q => q.trim()).filter(q => q);
      if (queries.length > 0) {
        const conditions = queries.map(() => {
          return `(
            no_pesanan LIKE ? OR
            username_pembeli LIKE ? OR
            metode_pembayaran_pembeli LIKE ?
          )`;
        }).join(' OR ');
        
        whereClause = `WHERE ${conditions}`;
        
        queries.forEach(q => {
          const searchTerm = `%${q}%`;
          params.push(searchTerm, searchTerm, searchTerm);
        });
      }
    }
    
    // Get data
    const [rows] = await conn.execute(
      `SELECT * FROM income_penghasilan ${whereClause} ORDER BY ${sort} ${direction} LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    
    // Get total count
    const [countResult] = await conn.execute(
      `SELECT COUNT(*) as total FROM income_penghasilan ${whereClause}`,
      params
    );
    
    const total = (countResult as any)[0].total;
    
    return NextResponse.json({
      success: true,
      data: rows,
      total,
      page,
      limit,
    });
    
  } catch (error: any) {
    console.error('Income API error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  } finally {
    await conn.end();
  }
}
