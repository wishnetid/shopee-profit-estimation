/**
 * MySQL Connection Pool - Vercel Serverless Compatible
 * 
 * Uses mysql2/promise with connection pooling optimized for serverless environments.
 * Connection pool is created once and reused across invocations.
 */

import mysql from 'mysql2/promise';

// Global pool reference (survives across serverless invocations)
let pool: mysql.Pool | null = null;

/**
 * Get or create MySQL connection pool
 * Singleton pattern untuk avoid multiple pool creation di serverless
 */
export function getPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      
      // Serverless-friendly pool config
      waitForConnections: true,
      connectionLimit: 5, // Vercel limit: max 5 concurrent connections per function
      queueLimit: 0,
      maxIdle: 5,
      idleTimeout: 60000, // 60s
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
      
      // Timezone & charset
      timezone: '+07:00', // WIB
      charset: 'utf8mb4',
    });

    console.log('✓ MySQL pool created');
  }

  return pool;
}

/**
 * Execute query dengan automatic pool management
 */
export async function query<T = any>(
  sql: string,
  params?: any[]
): Promise<T> {
  const pool = getPool();
  const [rows] = await pool.execute(sql, params);
  return rows as T;
}

/**
 * Get single connection dari pool (untuk transactions)
 */
export async function getConnection() {
  const pool = getPool();
  return await pool.getConnection();
}

/**
 * Close pool (untuk cleanup di development)
 */
export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('✓ MySQL pool closed');
  }
}

/**
 * Test database connection
 */
export async function testConnection(): Promise<boolean> {
  try {
    const result = await query<any>('SELECT 1 AS test');
    return result && result[0]?.test === 1;
  } catch (error) {
    console.error('Database connection test failed:', error);
    return false;
  }
}
