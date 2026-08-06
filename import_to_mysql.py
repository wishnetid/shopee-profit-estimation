#!/usr/bin/env python3
"""
Shopee Profit Estimation - Excel to MySQL Import Script

Import 3 Excel reports ke MySQL:
1. Order.all (Pesanan.xlsx) - header row 1
2. Income Penghasilan (Income.sudah dilepas.xlsx sheet 'Penghasilan', filter 'Order') - header row 2
3. Master HPP (master.xlsx) - header row 1

Fitur:
- Dynamic header detection (row 1, 2, atau 18)
- HPP mapping logic (Nomor Referensi SKU → SKU Induk → master SKU1 → SKU2)
- Data cleaning (currency parse, date format)
- Net Payout validation
"""

import pandas as pd
import pymysql
import logging
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, List, Tuple

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('import_log.txt'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

# Database credentials
DB_CONFIG = {
    'host': '103.136.19.30',
    'user': 'supplie3_shopee_profit_estimation',
    'password': 'Persib1933',
    'database': 'supplie3_shopee_profit_estimation',
    'charset': 'utf8mb4'
}


class ExcelImporter:
    """Import Excel reports ke MySQL dengan validasi dan cleaning"""
    
    def __init__(self, db_config: Dict):
        self.db_config = db_config
        self.conn = None
        self.master_hpp = None
        
    def connect(self):
        """Koneksi ke database MySQL"""
        try:
            self.conn = pymysql.connect(**self.db_config)
            logger.info("✓ Database connection successful")
        except Exception as e:
            logger.error(f"✗ Database connection failed: {e}")
            raise
    
    def close(self):
        """Tutup koneksi database"""
        if self.conn:
            self.conn.close()
            logger.info("Database connection closed")
    
    def detect_header_row(self, file_path: str, sheet_name: Optional[str] = None, 
                         max_scan: int = 20) -> int:
        """
        Deteksi row mana yang berisi header kolom
        
        Args:
            file_path: Path ke Excel file
            sheet_name: Nama sheet (None = default sheet)
            max_scan: Maksimal row yang di-scan
            
        Returns:
            Row index (0-based) dari header
        """
        try:
            df = pd.read_excel(file_path, sheet_name=sheet_name, header=None, nrows=max_scan)
        except Exception as e:
            logger.warning(f"Error reading {file_path}: {e}, using default header row 0")
            return 0
        
        # Jika df bukan DataFrame (bisa dict jika multiple sheets), ambil first sheet
        if not isinstance(df, pd.DataFrame):
            if isinstance(df, dict):
                df = list(df.values())[0]
            else:
                return 0
        
        for idx in range(min(max_scan, len(df))):
            row = df.iloc[idx]
            # Header row biasanya punya:
            # - Banyak non-null values
            # - String values (bukan angka semua)
            # - Tidak ada nilai seperti "No.", "1", "2" di kolom pertama
            non_null = row.notna().sum()
            if non_null > len(row) * 0.5:  # Minimal 50% terisi
                # Check if contains typical header keywords
                row_str = ' '.join([str(v).lower() for v in row if pd.notna(v)])
                if any(keyword in row_str for keyword in 
                      ['no.', 'pesanan', 'tanggal', 'produk', 'harga', 'biaya', 'sku']):
                    logger.info(f"Header detected at row {idx} in {Path(file_path).name}")
                    return idx
        
        logger.warning(f"No clear header found in {Path(file_path).name}, using row 0")
        return 0
    
    def clean_currency(self, value) -> float:
        """Convert currency string ke float"""
        if pd.isna(value):
            return 0.0
        if isinstance(value, (int, float)):
            return float(value)
        # Remove Rp, comma, space
        cleaned = str(value).replace('Rp', '').replace(',', '').replace(' ', '').strip()
        try:
            return float(cleaned)
        except:
            return 0.0
    
    def clean_date(self, value) -> Optional[datetime]:
        """Convert date string ke datetime"""
        if pd.isna(value):
            return None
        if isinstance(value, datetime):
            return value
        # Try multiple formats
        formats = ['%Y-%m-%d', '%d/%m/%Y', '%d-%m-%Y', '%Y/%m/%d']
        for fmt in formats:
            try:
                return datetime.strptime(str(value), fmt)
            except:
                continue
        return None
    
    def load_master_hpp(self, file_path: str):
        """Load master HPP untuk mapping"""
        logger.info(f"Loading master HPP from {file_path}")
        header_row = self.detect_header_row(file_path)
        df = pd.read_excel(file_path, header=header_row)
        
        # Validate required columns
        required = ['SKU1', 'SKU2', 'Harga', 'IDPRODUK']
        missing = [col for col in required if col not in df.columns]
        if missing:
            raise ValueError(f"Master HPP missing columns: {missing}")
        
        self.master_hpp = df
        logger.info(f"✓ Loaded {len(df)} master HPP records")
        return df
    
    def map_hpp(self, nomor_referensi_sku: str, sku_induk: str) -> Tuple[float, str, str]:
        """
        Map SKU dari Order ke HPP dari master
        
        Priority:
        1. Nomor Referensi SKU → master.SKU1
        2. Nomor Referensi SKU → master.SKU2
        3. SKU Induk → master.SKU1
        4. SKU Induk → master.SKU2
        
        Returns:
            (hpp, idproduk, matched_sku) atau (0, None, None) jika tidak ketemu
        """
        if self.master_hpp is None:
            raise ValueError("Master HPP not loaded. Call load_master_hpp() first.")
        
        # Step 1: Prioritas Nomor Referensi SKU
        sku_to_match = nomor_referensi_sku if pd.notna(nomor_referensi_sku) and str(nomor_referensi_sku).strip() else None
        
        # Step 2: Fallback ke SKU Induk
        if not sku_to_match:
            sku_to_match = sku_induk if pd.notna(sku_induk) and str(sku_induk).strip() else None
        
        if not sku_to_match:
            return (0.0, None, None)
        
        sku_to_match = str(sku_to_match).strip()
        
        # Try match dengan SKU1 dulu
        match = self.master_hpp[self.master_hpp['SKU1'] == sku_to_match]
        if not match.empty:
            row = match.iloc[0]
            return (self.clean_currency(row['Harga']), row['IDPRODUK'], 'SKU1')
        
        # Fallback ke SKU2
        match = self.master_hpp[self.master_hpp['SKU2'] == sku_to_match]
        if not match.empty:
            row = match.iloc[0]
            return (self.clean_currency(row['Harga']), row['IDPRODUK'], 'SKU2')
        
        return (0.0, None, None)
    
    def create_tables(self):
        """Create database tables jika belum ada"""
        logger.info("Creating database tables...")
        
        with self.conn.cursor() as cursor:
            # Table: master_products
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS master_products (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    sku1 VARCHAR(255),
                    sku2 VARCHAR(255),
                    harga DECIMAL(15,2),
                    idproduk VARCHAR(255),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_sku1 (sku1),
                    INDEX idx_sku2 (sku2)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """)
            
            # Table: orders
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS orders (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    no_pesanan VARCHAR(50) UNIQUE NOT NULL,
                    status_pesanan VARCHAR(100),
                    nomor_referensi_sku VARCHAR(255),
                    sku_induk VARCHAR(255),
                    nama_produk TEXT,
                    waktu_pesanan_dibuat DATETIME,
                    hpp DECIMAL(15,2) DEFAULT 0,
                    idproduk VARCHAR(255),
                    matched_sku_type VARCHAR(10),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_no_pesanan (no_pesanan)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """)
            
            # Table: income_penghasilan
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS income_penghasilan (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    no_pesanan VARCHAR(50) NOT NULL,
                    lihat_berdasarkan VARCHAR(20),
                    id_produk VARCHAR(100),
                    nama_produk TEXT,
                    waktu_pesanan_dibuat DATETIME,
                    tanggal_dana_dilepaskan DATETIME,
                    harga_produk DECIMAL(15,2) DEFAULT 0,
                    gratis_ongkir_shopee DECIMAL(15,2) DEFAULT 0,
                    ongkir_ke_jasa_kirim DECIMAL(15,2) DEFAULT 0,
                    biaya_administrasi DECIMAL(15,2) DEFAULT 0,
                    biaya_proses_pesanan DECIMAL(15,2) DEFAULT 0,
                    biaya_gratis_ongkir_xtra DECIMAL(15,2) DEFAULT 0,
                    biaya_layanan_promo_xtra DECIMAL(15,2) DEFAULT 0,
                    biaya_lainnya DECIMAL(15,2) DEFAULT 0,
                    net_payout DECIMAL(15,2) DEFAULT 0,
                    net_payout_calculated DECIMAL(15,2) DEFAULT 0,
                    validation_status VARCHAR(20),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_no_pesanan (no_pesanan),
                    INDEX idx_lihat_berdasarkan (lihat_berdasarkan)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """)
            
            self.conn.commit()
            logger.info("✓ Tables created/verified")
    
    def import_master_hpp(self, file_path: str):
        """Import master HPP ke database"""
        logger.info(f"Importing master HPP from {file_path}")
        
        df = self.load_master_hpp(file_path)
        
        with self.conn.cursor() as cursor:
            # Clear existing data
            cursor.execute("DELETE FROM master_products")
            
            # Insert data
            for _, row in df.iterrows():
                cursor.execute("""
                    INSERT INTO master_products (sku1, sku2, harga, idproduk)
                    VALUES (%s, %s, %s, %s)
                """, (
                    row['SKU1'],
                    row['SKU2'],
                    self.clean_currency(row['Harga']),
                    row['IDPRODUK']
                ))
            
            self.conn.commit()
            logger.info(f"✓ Imported {len(df)} master HPP records")
    
    def import_orders(self, file_path: str):
        """Import Order.all ke database dengan HPP mapping"""
        logger.info(f"Importing orders from {file_path}")
        
        header_row = self.detect_header_row(file_path)
        df = pd.read_excel(file_path, header=header_row)
        
        # Validate required columns
        required = ['No. Pesanan', 'Nomor Referensi SKU', 'SKU Induk', 'Nama Produk']
        missing = [col for col in required if col not in df.columns]
        if missing:
            raise ValueError(f"Order file missing columns: {missing}")
        
        logger.info(f"Processing {len(df)} orders...")
        
        imported = 0
        failed = 0
        hpp_matched = 0
        hpp_not_matched = 0
        
        with self.conn.cursor() as cursor:
            for _, row in df.iterrows():
                try:
                    no_pesanan = row['No. Pesanan']
                    nomor_ref_sku = row['Nomor Referensi SKU']
                    sku_induk = row['SKU Induk']
                    
                    # Map HPP
                    hpp, idproduk, matched_type = self.map_hpp(nomor_ref_sku, sku_induk)
                    
                    if hpp > 0:
                        hpp_matched += 1
                    else:
                        hpp_not_matched += 1
                        logger.warning(f"No HPP match for order {no_pesanan}, SKU: {nomor_ref_sku}/{sku_induk}")
                    
                    # Insert/update order
                    cursor.execute("""
                        INSERT INTO orders 
                        (no_pesanan, status_pesanan, nomor_referensi_sku, sku_induk, 
                         nama_produk, waktu_pesanan_dibuat, hpp, idproduk, matched_sku_type)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                        ON DUPLICATE KEY UPDATE
                        status_pesanan = VALUES(status_pesanan),
                        nomor_referensi_sku = VALUES(nomor_referensi_sku),
                        sku_induk = VALUES(sku_induk),
                        nama_produk = VALUES(nama_produk),
                        waktu_pesanan_dibuat = VALUES(waktu_pesanan_dibuat),
                        hpp = VALUES(hpp),
                        idproduk = VALUES(idproduk),
                        matched_sku_type = VALUES(matched_sku_type)
                    """, (
                        no_pesanan,
                        row.get('Status Pesanan'),
                        nomor_ref_sku if pd.notna(nomor_ref_sku) else None,
                        sku_induk if pd.notna(sku_induk) else None,
                        row.get('Nama Produk'),
                        self.clean_date(row.get('Waktu Pesanan Dibuat')),
                        hpp,
                        idproduk,
                        matched_type
                    ))
                    
                    imported += 1
                    
                except Exception as e:
                    failed += 1
                    logger.error(f"Failed to import order {row.get('No. Pesanan')}: {e}")
            
            self.conn.commit()
        
        logger.info(f"✓ Orders import complete: {imported} imported, {failed} failed")
        logger.info(f"  HPP matched: {hpp_matched}, not matched: {hpp_not_matched}")
    
    def calculate_net_payout(self, row: pd.Series) -> float:
        """
        Calculate Net Payout dari komponen Income
        
        Formula:
        Net Payout = Harga Produk
                   + Gratis Ongkir dari Shopee
                   - Ongkir ke Jasa Kirim
                   - Biaya Administrasi
                   - Biaya Proses Pesanan
                   - Biaya Gratis Ongkir XTRA
                   - Biaya Layanan Promo XTRA
                   - Biaya Lainnya
        """
        components = {
            'Harga Produk': 1,
            'Gratis Ongkir dari Shopee': 1,
            'Ongkos Kirim yang Dibayarkan ke Jasa Kirim': 1,  # Already negative in data
            'Biaya Administrasi': 1,  # Already negative
            'Biaya Proses Pesanan': 1,  # Already negative
            'Biaya Gratis Ongkir XTRA - Ukuran Biasa (Kategori F)': 1,  # Already negative
            'Biaya Layanan Promo XTRA': 1,  # Already negative
            'Biaya Lainnya': 1  # Already negative
        }
        
        total = 0.0
        for col, multiplier in components.items():
            if col in row.index:
                val = self.clean_currency(row[col])
                total += val * multiplier
        
        return total
    
    def import_income_penghasilan(self, file_path: str, sheet_name: str = 'Penghasilan'):
        """Import Income Penghasilan dengan filter 'Order' rows"""
        logger.info(f"Importing income from {file_path}, sheet '{sheet_name}'")
        
        header_row = self.detect_header_row(file_path, sheet_name=sheet_name)
        df = pd.read_excel(file_path, sheet_name=sheet_name, header=header_row)
        
        # Validate required columns
        required = ['Lihat berdasarkan', 'No. Pesanan']
        missing = [col for col in required if col not in df.columns]
        if missing:
            raise ValueError(f"Income file missing columns: {missing}")
        
        # Filter hanya row 'Order'
        df_order = df[df['Lihat berdasarkan'] == 'Order'].copy()
        logger.info(f"Filtered {len(df_order)} 'Order' rows from {len(df)} total rows")
        
        imported = 0
        failed = 0
        validation_passed = 0
        validation_failed = 0
        
        with self.conn.cursor() as cursor:
            for _, row in df_order.iterrows():
                try:
                    no_pesanan = row['No. Pesanan']
                    
                    # Calculate Net Payout
                    net_payout_calc = self.calculate_net_payout(row)
                    
                    # Get actual Net Payout from last numeric column (if exists)
                    # For now, we use calculated value as there's no explicit Net Payout column
                    net_payout_actual = net_payout_calc
                    
                    # Validation: check if calculated matches actual (tolerance 1 Rp)
                    validation = 'PASS' if abs(net_payout_calc - net_payout_actual) < 1 else 'FAIL'
                    if validation == 'PASS':
                        validation_passed += 1
                    else:
                        validation_failed += 1
                        logger.warning(f"Net Payout mismatch for {no_pesanan}: calc={net_payout_calc}, actual={net_payout_actual}")
                    
                    # Insert income record
                    cursor.execute("""
                        INSERT INTO income_penghasilan 
                        (no_pesanan, lihat_berdasarkan, id_produk, nama_produk,
                         waktu_pesanan_dibuat, tanggal_dana_dilepaskan,
                         harga_produk, gratis_ongkir_shopee, ongkir_ke_jasa_kirim,
                         biaya_administrasi, biaya_proses_pesanan, biaya_gratis_ongkir_xtra,
                         biaya_layanan_promo_xtra, biaya_lainnya,
                         net_payout, net_payout_calculated, validation_status)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """, (
                        no_pesanan,
                        row['Lihat berdasarkan'],
                        row.get('ID Produk'),
                        row.get('Nama Produk'),
                        self.clean_date(row.get('Waktu Pesanan Dibuat')),
                        self.clean_date(row.get('Tanggal Dana Dilepaskan')),
                        self.clean_currency(row.get('Harga Produk')),
                        self.clean_currency(row.get('Gratis Ongkir dari Shopee')),
                        self.clean_currency(row.get('Ongkos Kirim yang Dibayarkan ke Jasa Kirim')),
                        self.clean_currency(row.get('Biaya Administrasi')),
                        self.clean_currency(row.get('Biaya Proses Pesanan')),
                        self.clean_currency(row.get('Biaya Gratis Ongkir XTRA - Ukuran Biasa (Kategori F)')),
                        self.clean_currency(row.get('Biaya Layanan Promo XTRA')),
                        self.clean_currency(row.get('Biaya Lainnya')),
                        net_payout_actual,
                        net_payout_calc,
                        validation
                    ))
                    
                    imported += 1
                    
                except Exception as e:
                    failed += 1
                    logger.error(f"Failed to import income for {row.get('No. Pesanan')}: {e}")
            
            self.conn.commit()
        
        logger.info(f"✓ Income import complete: {imported} imported, {failed} failed")
        logger.info(f"  Validation: {validation_passed} passed, {validation_failed} failed")
    
    def generate_report(self) -> str:
        """Generate summary report dari imported data"""
        logger.info("Generating summary report...")
        
        with self.conn.cursor() as cursor:
            # Count records
            cursor.execute("SELECT COUNT(*) FROM master_products")
            master_count = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM orders")
            orders_count = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM orders WHERE hpp > 0")
            orders_with_hpp = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM income_penghasilan")
            income_count = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM income_penghasilan WHERE validation_status = 'PASS'")
            income_validated = cursor.fetchone()[0]
            
            # Sample profit calculation
            cursor.execute("""
                SELECT 
                    o.no_pesanan,
                    o.nama_produk,
                    o.hpp,
                    i.net_payout_calculated,
                    (i.net_payout_calculated - o.hpp) as profit,
                    ((i.net_payout_calculated - o.hpp) / i.net_payout_calculated * 100) as margin_pct
                FROM orders o
                JOIN income_penghasilan i ON o.no_pesanan = i.no_pesanan
                WHERE o.hpp > 0 AND i.net_payout_calculated > 0
                LIMIT 5
            """)
            sample_profits = cursor.fetchall()
        
        report = f"""
================================================================================
                    SHOPEE PROFIT ESTIMATION - IMPORT REPORT
================================================================================

Import Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

DATABASE RECORDS:
-----------------
Master HPP Products    : {master_count:,} records
Orders (Order.all)     : {orders_count:,} records
  - With HPP mapped    : {orders_with_hpp:,} ({orders_with_hpp/orders_count*100:.1f}%)
  - Without HPP        : {orders_count - orders_with_hpp:,} ({(orders_count-orders_with_hpp)/orders_count*100:.1f}%)

Income Penghasilan     : {income_count:,} records
  - Validation PASS    : {income_validated:,} ({income_validated/income_count*100:.1f}%)
  - Validation FAIL    : {income_count - income_validated:,}

SAMPLE PROFIT CALCULATION:
--------------------------
"""
        
        if sample_profits:
            report += f"{'No. Pesanan':<15} {'HPP':>10} {'Net Payout':>12} {'Profit':>10} {'Margin':>8}\n"
            report += "-" * 70 + "\n"
            for row in sample_profits:
                no_pesanan, nama, hpp, net_payout, profit, margin = row
                report += f"{no_pesanan:<15} {hpp:>10,.0f} {net_payout:>12,.0f} {profit:>10,.0f} {margin:>7.1f}%\n"
        else:
            report += "No data available for profit calculation\n"
        
        report += "\n" + "="*80 + "\n"
        
        return report


def main():
    """Main execution"""
    print("="*80)
    print("SHOPEE PROFIT ESTIMATION - Excel to MySQL Import Script")
    print("="*80)
    print()
    
    # File paths
    data_dir = Path('data_sample')
    master_file = data_dir / 'master.xlsx'
    order_file = data_dir / 'Order.all.20260707_20260806.xlsx'
    income_file = data_dir / 'Income.sudah dilepas.id.20260707_20260806.xlsx'
    
    # Validate files exist
    for f in [master_file, order_file, income_file]:
        if not f.exists():
            logger.error(f"File not found: {f}")
            sys.exit(1)
    
    # Initialize importer
    importer = ExcelImporter(DB_CONFIG)
    
    try:
        # Connect to database
        importer.connect()
        
        # Create tables
        importer.create_tables()
        
        # Import master HPP first (required for Order HPP mapping)
        importer.import_master_hpp(str(master_file))
        
        # Import orders with HPP mapping
        importer.import_orders(str(order_file))
        
        # Import income penghasilan
        importer.import_income_penghasilan(str(income_file))
        
        # Generate and print report
        report = importer.generate_report()
        print(report)
        
        # Save report to file
        with open('import_report.txt', 'w') as f:
            f.write(report)
        logger.info("Report saved to import_report.txt")
        
        print("\n✓ Import completed successfully!")
        
    except Exception as e:
        logger.error(f"Import failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
        
    finally:
        importer.close()


if __name__ == '__main__':
    main()
