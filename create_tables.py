#!/usr/bin/env python3
"""
Create database tables from schema.sql
"""
import pymysql
import sys

DB_CONFIG = {
    'host': '103.136.19.30',
    'user': 'supplie3_shopee_profit_estimation',
    'password': 'Persib1933',
    'database': 'supplie3_shopee_profit_estimation',
    'charset': 'utf8mb4'
}

def execute_schema():
    try:
        # Read schema file
        with open('schema.sql', 'r', encoding='utf-8') as f:
            schema = f.read()
        
        # Split by delimiter changes and statements
        statements = []
        current = []
        in_procedure = False
        
        for line in schema.split('\n'):
            line = line.strip()
            
            # Skip comments and empty lines
            if not line or line.startswith('--'):
                continue
            
            # Handle delimiter
            if line.startswith('DELIMITER'):
                if '$$' in line:
                    in_procedure = True
                else:
                    in_procedure = False
                continue
            
            current.append(line)
            
            # End of statement
            if in_procedure:
                if line.endswith('$$'):
                    statements.append(' '.join(current))
                    current = []
            else:
                if line.endswith(';'):
                    statements.append(' '.join(current))
                    current = []
        
        # Connect to database
        print("Connecting to database...")
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        print(f"Executing {len(statements)} statements...")
        
        for i, stmt in enumerate(statements, 1):
            stmt = stmt.strip()
            if not stmt:
                continue
            
            # Clean up statement
            stmt = stmt.replace('$$', ';')
            
            try:
                cursor.execute(stmt)
                print(f"✓ Statement {i}/{len(statements)}")
            except pymysql.Error as e:
                # Ignore "already exists" errors
                if 'already exists' in str(e) or 'Duplicate key name' in str(e):
                    print(f"⊙ Statement {i}/{len(statements)} (already exists)")
                else:
                    print(f"✗ Statement {i}/{len(statements)}: {e}")
        
        conn.commit()
        cursor.close()
        conn.close()
        
        print("\n✅ Schema executed successfully!")
        return True
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        return False

if __name__ == '__main__':
    success = execute_schema()
    sys.exit(0 if success else 1)
