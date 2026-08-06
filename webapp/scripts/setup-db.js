#!/usr/bin/env node

/**
 * Database Setup Script
 * Create tables & views on MySQL database
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: '.env.local' });

async function setupDatabase() {
  let connection;

  try {
    console.log('🔌 Connecting to database...');
    console.log(`   Host: ${process.env.DB_HOST}`);
    console.log(`   Database: ${process.env.DB_NAME}`);

    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      multipleStatements: true,
    });

    console.log('✓ Connected to database\n');

    // Read schema.sql
    const schemaPath = path.join(__dirname, '../database/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    // Split by statements (simple approach)
    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`📄 Executing ${statements.length} SQL statements...\n`);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      
      // Extract table/view name for logging
      let objectName = 'unknown';
      if (statement.includes('CREATE TABLE')) {
        const match = statement.match(/CREATE TABLE IF NOT EXISTS (\w+)/);
        if (match) objectName = `table: ${match[1]}`;
      } else if (statement.includes('CREATE OR REPLACE VIEW')) {
        const match = statement.match(/CREATE OR REPLACE VIEW (\w+)/);
        if (match) objectName = `view: ${match[1]}`;
      }

      try {
        await connection.execute(statement);
        console.log(`✓ Created ${objectName}`);
      } catch (err) {
        console.error(`✗ Failed to create ${objectName}:`, err.message);
      }
    }

    console.log('\n✅ Database setup complete!');

    // Test connection
    const [rows] = await connection.execute('SELECT 1 AS test');
    console.log('✓ Connection test passed');

    // Show tables
    const [tables] = await connection.execute('SHOW TABLES');
    console.log(`\n📊 Database has ${tables.length} tables/views:`);
    tables.forEach(row => {
      const tableName = Object.values(row)[0];
      console.log(`   - ${tableName}`);
    });

  } catch (error) {
    console.error('\n❌ Database setup failed:');
    console.error(error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n🔌 Connection closed');
    }
  }
}

// Run
setupDatabase();
