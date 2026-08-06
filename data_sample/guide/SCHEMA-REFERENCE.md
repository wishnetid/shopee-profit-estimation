# Database Schema v2 - SQL Reference
==================

**Version:** 2.0  
**Date:** 2026-08-06  
**Purpose:** Core profit calculation schema for 3 reports

---

## Quick Reference

### Database Info
```
Host: 103.136.19.30
Port: 3306
Database: supplie3_shopee_profit_estimation
User: supplie3_shopee_profit_estimation
Password: Persib1933
```

### Table Summary

| Table | Purpose | Rows (Test) | Key Features |
|-------|---------|-------------|--------------|
| master_products | HPP reference | 32 | SKU1/SKU2 flexible matching |
| order_all | Order details | 1,108 | Multi-item orders (no UNIQUE) |
| income_penghasilan | Fee breakdown | 679 | Orphan records allowed (no FK) |
| profit_calculation | Calculated profit | 0 | Per-item profit |

---

## Table: master_products

### Columns
```sql
id                INT AUTO_INCREMENT PRIMARY KEY
sku1              VARCHAR(100) NOT NULL
sku2              VARCHAR(100) NULL
harga             DECIMAL(15,2) NOT NULL
idproduk          VARCHAR(100) NOT NULL
created_at        TIMESTAMP
updated_at        TIMESTAMP
```

### Indexes
- idx_sku1 (sku1)
- idx_sku2 (sku2)
- idx_idproduk (idproduk)

### Usage
HPP lookup dengan priority: order.nomor_referensi_sku → order.sku_induk → master.sku1 → master.sku2

---

## Table: order_all

### Columns (25 core columns)
```sql
id                              INT AUTO_INCREMENT PRIMARY KEY
no_pesanan                      VARCHAR(50) NOT NULL (NOT UNIQUE)
status_pesanan                  VARCHAR(50)
alasan_pembatalan               TEXT
status_pembatalan_pengembalian  VARCHAR(100)
no_resi                         VARCHAR(100)
nama_produk                     TEXT
nomor_referensi_sku             VARCHAR(100)
sku_induk                       VARCHAR(100)
nama_variasi                    VARCHAR(255)
harga_awal                      DECIMAL(15,2)
harga_setelah_diskon            DECIMAL(15,2)
jumlah                          INT
subtotal_pesanan                DECIMAL(15,2)
total_diskon                    DECIMAL(15,2)
diskon_dari_penjual             DECIMAL(15,2)
diskon_dari_shopee              DECIMAL(15,2)
opsi_pengiriman                 VARCHAR(100)
ongkos_kirim_dibayar_pembeli    DECIMAL(15,2)
perkiraan_ongkos_kirim          DECIMAL(15,2)
total_pembayaran                DECIMAL(15,2)
waktu_pesanan_dibuat            DATETIME
waktu_pembayaran_dilakukan      DATETIME
waktu_pesanan_selesai           DATETIME
username_pembeli                VARCHAR(100)
metode_pembayaran               VARCHAR(100)
```

### Indexes
- idx_no_pesanan (no_pesanan)
- idx_status (status_pesanan)
- idx_nomor_referensi_sku (nomor_referensi_sku)
- idx_sku_induk (sku_induk)

### Critical Design Decision
**NO UNIQUE constraint on no_pesanan** because:
- Multi-item orders = 1 No. Pesanan with MULTIPLE rows
- Example: Order 260610QCJS4F4M has 5 items = 5 rows

---

## Table: income_penghasilan

### Columns
```sql
id                          INT AUTO_INCREMENT PRIMARY KEY
no_pesanan                  VARCHAR(50) NOT NULL (NO FK)
lihat_berdasarkan           VARCHAR(20) NOT NULL
waktu_pesanan_dibuat        DATE
tanggal_dana_dilepaskan     DATE
harga_produk                DECIMAL(15,2) DEFAULT 0
ongkir_dibayar_pembeli      DECIMAL(15,2) DEFAULT 0
ongkos_kirim_ke_jasa_kirim  DECIMAL(15,2) DEFAULT 0
gratis_ongkir_dari_shopee   DECIMAL(15,2) DEFAULT 0
biaya_administrasi          DECIMAL(15,2) DEFAULT 0
biaya_proses_pesanan        DECIMAL(15,2) DEFAULT 0
biaya_gratis_ongkir_xtra    DECIMAL(15,2) DEFAULT 0
biaya_layanan_promo_xtra    DECIMAL(15,2) DEFAULT 0
biaya_lainnya               DECIMAL(15,2) DEFAULT 0
jumlah_dibayar_pembeli      DECIMAL(15,2) DEFAULT 0
metode_pembayaran_pembeli   VARCHAR(100)
username_pembeli            VARCHAR(100)
```

### Indexes
- idx_no_pesanan (no_pesanan)
- idx_lihat_berdasarkan (lihat_berdasarkan)
- idx_tanggal_dilepaskan (tanggal_dana_dilepaskan)

### Critical Design Decision
**NO FOREIGN KEY to order_all** because:
- Report periods sering tidak sync
- Income Juli-Agustus, Order Juni = 654 orphan records
- FK constraint akan BLOCK import

### Filter Logic
**ONLY import rows WHERE lihat_berdasarkan = 'Order'**
- Skip rows with lihat_berdasarkan = 'Sku' (item detail, redundant)

---

## Table: profit_calculation

### Columns
```sql
id                 INT AUTO_INCREMENT PRIMARY KEY
no_pesanan         VARCHAR(50) NOT NULL
order_item_id      INT NULL (FK optional)
sku_matched        VARCHAR(100)
hpp                DECIMAL(15,2)
idproduk           VARCHAR(100)
net_payout         DECIMAL(15,2)
profit             DECIMAL(15,2)
margin_percent     DECIMAL(5,2)
profit_status      VARCHAR(20)
created_at         TIMESTAMP
updated_at         TIMESTAMP
```

### Indexes
- idx_no_pesanan (no_pesanan)
- idx_order_item_id (order_item_id)
- idx_profit (profit)

### Calculation Logic
```
Net Payout = SUM(all income fee columns) / item_count_per_order
HPP = master.harga (matched via SKU)
Profit = Net Payout - HPP
Margin % = (Profit / Net Payout) * 100
```

---

## Stored Procedure: calculate_profit_per_item()

### Purpose
Calculate profit for each order item

### Logic
1. For each row in order_all
2. Match SKU: nomor_referensi_sku OR sku_induk → master.sku1 OR sku2
3. Get HPP from master.harga
4. Get Net Payout from income_penghasilan (divided by item count)
5. Calculate: Profit = Net Payout - HPP
6. Insert into profit_calculation

### Usage
```sql
CALL calculate_profit_per_item();
```

---

## Common Queries

### Get all orders with profit
```sql
SELECT 
    o.no_pesanan,
    o.nama_produk,
    p.hpp,
    p.net_payout,
    p.profit,
    p.margin_percent
FROM order_all o
JOIN profit_calculation p ON o.id = p.order_item_id
ORDER BY p.profit DESC;
```

### Get multi-item orders
```sql
SELECT 
    no_pesanan, 
    COUNT(*) as item_count
FROM order_all
GROUP BY no_pesanan
HAVING COUNT(*) > 1
ORDER BY item_count DESC;
```

### Get orphan income records
```sql
SELECT COUNT(DISTINCT i.no_pesanan)
FROM income_penghasilan i
LEFT JOIN order_all o ON i.no_pesanan = o.no_pesanan
WHERE o.no_pesanan IS NULL;
```

### Validate net payout
```sql
SELECT 
    no_pesanan,
    (harga_produk 
     + gratis_ongkir_dari_shopee
     + ongkos_kirim_ke_jasa_kirim
     + biaya_administrasi
     + biaya_proses_pesanan
     + biaya_gratis_ongkir_xtra
     + biaya_layanan_promo_xtra
     + biaya_lainnya) AS net_payout
FROM income_penghasilan
WHERE no_pesanan = '2607072CRRDA37';
```

---

## Import Order

1. master_products (no dependencies)
2. order_all (no dependencies)
3. income_penghasilan (no FK, can import anytime)
4. Run calculate_profit_per_item() after all data imported

---

## Schema File Location

`/home/yogaimawan/Dokumentasi/shopee_profit_estimation/schema.sql`
