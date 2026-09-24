const mysql = require('mysql2/promise');
const sql = `CREATE TABLE IF NOT EXISTS return_qc_decisions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  store_id BIGINT UNSIGNED NOT NULL,
  no_pengembalian VARCHAR(128) NOT NULL,
  no_pesanan VARCHAR(128) NOT NULL,
  qc_status ENUM('belum_dinilai','restock_layak','rusak','hilang') NOT NULL DEFAULT 'belum_dinilai',
  qc_note TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id), UNIQUE KEY uk_return_qc_store_return (store_id,no_pengembalian), KEY idx_return_qc_store_order (store_id,no_pesanan)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
(async()=>{const apply=process.argv.includes('--confirm-ddl');const c=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});const [rows]=await c.query("SHOW TABLES LIKE 'return_qc_decisions'");if(!apply){console.log(JSON.stringify({dryRun:true,exists:rows.length>0,sql},null,2));await c.end();return}if(rows.length)throw new Error('Table already exists; inspect schema before any change.');await c.query(sql);const [columns]=await c.query('SHOW COLUMNS FROM return_qc_decisions');console.log(JSON.stringify({success:true,columns:columns.map(x=>x.Field)}));await c.end()})().catch(e=>{console.error(e.message);process.exit(1)});
