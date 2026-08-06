# Import Script - Panduan Penggunaan

Script Python untuk import 3 Excel reports Shopee ke MySQL database.

## Fitur

✓ **Dynamic Header Detection** - Auto-detect header di row 1, 2, atau 18  
✓ **HPP Mapping Logic** - Nomor Referensi SKU → SKU Induk → master SKU1 → SKU2  
✓ **Data Cleaning** - Currency parsing, date formatting  
✓ **Net Payout Validation** - Verify calculated vs actual  
✓ **Error Handling** - Comprehensive logging & error recovery  
✓ **Import Report** - Summary statistics & profit calculation  

## Prerequisites

```bash
# 1. Virtual environment sudah aktif
source .venv/bin/activate

# 2. Install dependencies
pip install -r requirements.txt
```

## File Structure

```
shopee_profit_estimation/
├── import_to_mysql.py          # Main import script
├── requirements.txt            # Python dependencies
├── data_sample/
│   ├── master.xlsx            # Master HPP (SKU → Harga)
│   ├── Order.all.*.xlsx       # Order reports
│   └── Income.sudah dilepas.*.xlsx  # Income reports
├── import_log.txt             # Execution log (generated)
└── import_report.txt          # Summary report (generated)
```

## Cara Pakai

### 1. Persiapan Data

Pastikan 3 file Excel tersedia di folder `data_sample/`:

- **master.xlsx** - Master HPP reference
  - Kolom: SKU1, SKU2, Harga, IDPRODUK
  - Header di row 1

- **Order.all.YYYYMMDD_YYYYMMDD.xlsx** - Order report
  - Kolom: No. Pesanan, Nomor Referensi SKU, SKU Induk, Nama Produk, dll
  - Header di row 1

- **Income.sudah dilepas.YYYYMMDD_YYYYMMDD.xlsx** - Income report
  - Sheet: 'Penghasilan'
  - Kolom: Lihat berdasarkan, No. Pesanan, Harga Produk, Biaya-biaya, dll
  - Header di row 2 (row 0-1 adalah header section)

### 2. Execute Import

```bash
# Dari root project directory
python3 import_to_mysql.py
```

Script akan:
1. Connect ke database MySQL
2. Create/verify tables (master_products, orders, income_penghasilan)
3. Import master HPP (32 records)
4. Import orders dengan HPP mapping (1000+ records)
5. Import income penghasilan dengan filter 'Order' (600+ records)
6. Generate summary report

### 3. Monitor Progress

Terminal output akan menunjukkan:
- Connection status
- Record counts per table
- HPP mapping success rate
- Validation results
- Errors/warnings (if any)

### 4. Check Results

**Console Output:**
```
================================================================================
                    SHOPEE PROFIT ESTIMATION - IMPORT REPORT
================================================================================

DATABASE RECORDS:
-----------------
Master HPP Products    : 32 records
Orders (Order.all)     : 810 records
  - With HPP mapped    : 810 (100.0%)
  - Without HPP        : 0 (0.0%)

Income Penghasilan     : 679 records
  - Validation PASS    : 679 (100.0%)
  - Validation FAIL    : 0

SAMPLE PROFIT CALCULATION:
--------------------------
No. Pesanan            HPP   Net Payout     Profit   Margin
----------------------------------------------------------------------
260802A1K3DD0Y      62,500       77,320     14,820    19.2%
26080183P4NDAG      52,500       66,375     13,875    20.9%
...
```

**Log Files:**
- `import_log.txt` - Detailed execution log
- `import_report.txt` - Summary report

## Database Schema

### Table: master_products
```sql
CREATE TABLE master_products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sku1 VARCHAR(255),           -- Primary SKU
    sku2 VARCHAR(255),           -- Alternative SKU
    harga DECIMAL(15,2),         -- HPP (sudah + packaging)
    idproduk VARCHAR(255),       -- Universal product ID
    created_at TIMESTAMP,
    INDEX idx_sku1 (sku1),
    INDEX idx_sku2 (sku2)
)
```

### Table: orders
```sql
CREATE TABLE orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    no_pesanan VARCHAR(50) UNIQUE NOT NULL,
    status_pesanan VARCHAR(100),
    nomor_referensi_sku VARCHAR(255),
    sku_induk VARCHAR(255),
    nama_produk TEXT,
    waktu_pesanan_dibuat DATETIME,
    hpp DECIMAL(15,2),           -- Mapped dari master
    idproduk VARCHAR(255),       -- Mapped dari master
    matched_sku_type VARCHAR(10), -- 'SKU1' atau 'SKU2'
    created_at TIMESTAMP,
    INDEX idx_no_pesanan (no_pesanan)
)
```

### Table: income_penghasilan
```sql
CREATE TABLE income_penghasilan (
    id INT AUTO_INCREMENT PRIMARY KEY,
    no_pesanan VARCHAR(50) NOT NULL,
    lihat_berdasarkan VARCHAR(20),  -- 'Order' or 'Sku'
    id_produk VARCHAR(100),
    nama_produk TEXT,
    waktu_pesanan_dibuat DATETIME,
    tanggal_dana_dilepaskan DATETIME,
    harga_produk DECIMAL(15,2),
    gratis_ongkir_shopee DECIMAL(15,2),
    ongkir_ke_jasa_kirim DECIMAL(15,2),
    biaya_administrasi DECIMAL(15,2),
    biaya_proses_pesanan DECIMAL(15,2),
    biaya_gratis_ongkir_xtra DECIMAL(15,2),
    biaya_layanan_promo_xtra DECIMAL(15,2),
    biaya_lainnya DECIMAL(15,2),
    net_payout DECIMAL(15,2),           -- Actual value
    net_payout_calculated DECIMAL(15,2), -- Calculated value
    validation_status VARCHAR(20),       -- 'PASS' or 'FAIL'
    created_at TIMESTAMP,
    INDEX idx_no_pesanan (no_pesanan),
    INDEX idx_lihat_berdasarkan (lihat_berdasarkan)
)
```

## HPP Mapping Logic

**Priority Order:**

1. **Order.Nomor_Referensi_SKU** (jika ada) → match dengan **master.SKU1**
2. Jika tidak match → match dengan **master.SKU2**
3. Jika **Nomor_Referensi_SKU** kosong → gunakan **Order.SKU_Induk**
4. **SKU_Induk** → match dengan **master.SKU1**
5. Jika tidak match → match dengan **master.SKU2**

**Result:**
- HPP matched: 100% (1023/1023 orders)
- SKU1 matches: 99.1% (803 orders)
- SKU2 matches: 0.9% (7 orders)

**Example (Order 2607072CRRDA37):**
```
Order.Nomor_Referensi_SKU: "M-TAC Pendek"
  ↓
master.SKU1: "M-TAC Pendek" ✓ MATCH
  ↓
master.Harga: Rp52,500 (HPP)
master.IDPRODUK: "M-TAC Pendek"
```

## Net Payout Calculation

**Formula:**
```
Net Payout = Harga Produk
           + Gratis Ongkir dari Shopee
           - Ongkir ke Jasa Kirim
           - Biaya Administrasi
           - Biaya Proses Pesanan
           - Biaya Gratis Ongkir XTRA
           - Biaya Layanan Promo XTRA
           - Biaya Lainnya
```

**Validation:**
- Script calculates Net Payout dari komponen-komponen
- Compare dengan actual value (jika ada di Excel)
- Tolerance: ±1 Rp

**Result:**
- Validation PASS: 100% (679/679 records)

## Profit Calculation

**Formula:**
```sql
SELECT 
    o.no_pesanan,
    o.nama_produk,
    o.hpp,
    i.net_payout_calculated as net_payout,
    (i.net_payout_calculated - o.hpp) as profit,
    ((i.net_payout_calculated - o.hpp) / i.net_payout_calculated * 100) as margin_pct
FROM orders o
JOIN income_penghasilan i ON o.no_pesanan = i.no_pesanan
WHERE o.hpp > 0 AND i.net_payout_calculated > 0
```

**Statistics (dari import actual):**
- Total Orders with Profit: 522
- Average Profit: Rp65,223
- Min Profit: Rp-34,715 (return/refund case)
- Max Profit: Rp3,596,875
- Average Margin: 30.3%

## Data Completeness

**Expected Mismatches:**

Ada orders tanpa income data karena:
- Order cancelled before dana dilepas
- Failed delivery (dana tidak pernah dilepas)
- Return/refund before dana dilepas

Ada income tanpa order data karena:
- Income report filter berbeda dengan Order report period
- Adjustment entries (bukan pesanan normal)

**Current Stats:**
- Orders without Income: 287 (35%)
- Income without Orders: 156 (23%)

**Note:** Ini normal behavior. Not all orders reach "dana dilepas" stage.

## Troubleshooting

### Error: Database Connection Failed

**Solusi:**
- Check network connectivity ke 103.136.19.30
- Verify credentials di script (DB_CONFIG)
- Test manual connection:
  ```bash
  mysql -h 103.136.19.30 -u supplie3_shopee_profit_estimation -p
  ```

### Error: File Not Found

**Solusi:**
- Pastikan file Excel ada di folder `data_sample/`
- Check filename pattern di script (line 548-551)
- Update variable jika pakai file berbeda

### Error: Column Missing

**Solusi:**
- Check header detection dengan:
  ```python
  importer = ExcelImporter(DB_CONFIG)
  header_row = importer.detect_header_row('data_sample/yourfile.xlsx')
  print(f"Header at row: {header_row}")
  ```
- Jika header di row lain, script auto-detect harusnya handle

### Warning: HPP Not Matched

**Solusi:**
- Check SKU value di Order.all:
  ```sql
  SELECT nomor_referensi_sku, sku_induk 
  FROM orders 
  WHERE hpp = 0 
  LIMIT 10
  ```
- Check apakah SKU ada di master.xlsx
- Tambah entry baru di master.xlsx jika perlu

## Advanced Usage

### Custom File Paths

Edit `main()` function di script:

```python
# File paths
data_dir = Path('data_sample')
master_file = data_dir / 'master.xlsx'
order_file = data_dir / 'Order.all.20260707_20260806.xlsx'  # ← ganti ini
income_file = data_dir / 'Income.sudah dilepas.id.20260707_20260806.xlsx'  # ← dan ini
```

### Incremental Import

Script sudah support `ON DUPLICATE KEY UPDATE` untuk orders table:
- Jika `no_pesanan` sudah ada → update
- Jika baru → insert

Income table tidak ada UNIQUE constraint, jadi:
- **Recommendation:** Truncate income_penghasilan sebelum re-import:
  ```sql
  TRUNCATE TABLE income_penghasilan;
  ```

### Custom Database Credentials

Edit `DB_CONFIG` di script:

```python
DB_CONFIG = {
    'host': 'your_host',
    'user': 'your_user',
    'password': 'your_password',
    'database': 'your_database',
    'charset': 'utf8mb4'
}
```

## Performance

**Import Time (tested):**
- Master HPP (32 records): ~0.7s
- Orders (1023 records): ~18s
- Income (679 records): ~13s
- **Total: ~32 seconds**

**Optimizations:**
- Bulk insert available tapi tidak diimplementasi (trade-off: error handling)
- Index pada no_pesanan untuk fast JOIN
- Connection pooling tidak perlu (single-threaded script)

## Security Notes

⚠️ **CRITICAL:**
- Database password hardcoded di script (OK untuk internal tool)
- Jika deploy production: use environment variables
  ```python
  import os
  DB_CONFIG = {
      'host': os.getenv('DB_HOST'),
      'user': os.getenv('DB_USER'),
      'password': os.getenv('DB_PASSWORD'),
      ...
  }
  ```

## Next Steps

Setelah data ter-import:

1. **Build Dashboard** - Next.js app untuk visualisasi profit
2. **Add More Reports** - Failed delivery, return/refund analysis
3. **Automate Import** - Cron job untuk regular import
4. **Add Validation** - Cross-check dengan Balance Report

---

**Script Version:** 1.0  
**Last Updated:** 2026-08-06  
**Author:** Hermes Agent (Nous Research)
