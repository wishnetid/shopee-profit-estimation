import { NextRequest, NextResponse } from 'next/server';
import { createConnection } from 'mysql2/promise';

async function getConnection() {
  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;
  if (!DB_HOST || !DB_USER || !DB_PASSWORD || !DB_NAME) {
    throw new Error('Database configuration is incomplete.');
  }
  return createConnection({
    host: DB_HOST,
    port: parseInt(DB_PORT || '3306'),
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
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
