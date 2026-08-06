# Analysis: No. Pesanan 2607072CRRDA37

**Status:** ✓ Pesanan Selesai (Dana sudah dilepas ke penjual)  
**Tanggal Analysis:** 2026-08-06

---

## Timeline Pesanan

- **07/07/2026 07:13** → Pesanan dibuat
- **16/07/2026 17:14** → Barang sampai (diterima oleh MUHAMMAD SOFYAN RIZKI)
- **18/07/2026 21:41** → Pesanan selesai + Dana dilepas ke penjual

---

## Detail Produk

- **Nama Produk:** Kemeja Tactical Pria Lengan Pendek M-TAC RIPSTOP Baju Kerja Lapangan
- **Variasi:** Hijau Army, M
- **SKU:** M-TAC Pendek
- **Quantity:** 1
- **Harga Setelah Diskon:** Rp82.500
- **Subtotal:** Rp82.500
- **No. Resi:** SPXID060226326907
- **Jasa Kirim:** Hemat Kargo / SPX Hemat

---

## Breakdown Finansial Penjual

### Pendapatan Kotor
```
Subtotal Produk:                     Rp82.500
```

### Potongan Biaya
```
Biaya Platform:                      -Rp8.056
  - Administrasi:                    -Rp6.806
  - Proses Pesanan:                  -Rp1.250

Biaya Gratis Ongkir XTRA:            -Rp4.125

Biaya Layanan:                       -Rp3.713

Biaya Lainnya (Premi):               -Rp413

Ongkir ke Jasa Kirim:                -Rp18.000
Potongan Ongkir dari Shopee:         +Rp18.000
                                     ─────────
Net Ongkir:                          Rp0
```

### Total Penghasilan Penjual
```
Rp66.193
```

---

## Cross-Validation dari 3 File Report

### 1. ORDER.ALL (orders sheet, Row 3)

| Field | Value |
|-------|-------|
| No. Pesanan | 2607072CRRDA37 |
| Status Pesanan | Selesai ✓ |
| No. Resi | SPXID060226326907 ✓ |
| Waktu Pesanan Dibuat | 2026-07-07 07:13 ✓ |
| Waktu Pesanan Selesai | 2026-07-18 21:41 ✓ |
| Nama Produk | Kemeja Tactical Pria Lengan Pendek M-TAC RIPSTOP Baju Kerja Lapangan ✓ |
| Nomor Referensi SKU | M-TAC Pendek ✓ |
| Nama Variasi | Hijau Army,M ✓ |
| Harga Setelah Diskon | 82.500 ✓ |
| Jumlah | 1 ✓ |
| Subtotal Pesanan | 82.500 ✓ |
| Total Diskon | 8.925 ✓ |
| Ongkos Kirim Dibayar oleh Pembeli | 0 ✓ |
| Total Pembayaran | 63.089 ✓ |
| Perkiraan Ongkos Kirim | 18.000 ✓ |

### 2. BALANCE REPORT (Transaction Report, Row 535)

| Field | Value |
|-------|-------|
| Tanggal Transaksi | 2026-07-18 21:41:47 ✓ |
| Tipe Transaksi | Penghasilan dari Pesanan ✓ |
| Deskripsi | Penghasilan dari Pesanan #2607072CRRDA37 ✓ |
| No. Pesanan | 2607072CRRDA37 ✓ |
| Jenis Transaksi | Transaksi Masuk ✓ |
| **Jumlah** | **66.193** ✓✓✓ |
| Status | Transaksi Selesai ✓ |
| Saldo Akhir | 2.313.505 |

### 3. INCOME - SELLER FEE (Seller Fee sheet, Row 254)

| Field | Value |
|-------|-------|
| No. | 252 |
| No. Pesanan | 2607072CRRDA37 ✓ |
| **Biaya Platform** | **-8.056** ✓✓✓ |
| **Biaya Gratis Ongkir XTRA** | **-4.125** ✓✓✓ |
| **Biaya Layanan** | **-3.713** ✓✓✓ |
| Biaya Promosi | 0 |
| **Biaya Lainnya** | **-413** ✓✓✓ |

---

## Verification Formula

**Dari Screenshot:**
```
Penghasilan Penjual = Rp66.193
```

**Dari Excel (manual calculation):**
```
Subtotal Pesanan                     82.500
Biaya Platform                       -8.056
Biaya Gratis Ongkir XTRA             -4.125
Biaya Layanan                        -3.713
Biaya Lainnya                        -413
Ongkir ke Jasa Kirim                 -18.000
Potongan Ongkir dari Shopee          +18.000
                                     ───────
TOTAL                                66.193 ✓✓✓
```

**✓✓✓ SEMUA DATA MATCH 100%!**

---

## Key Findings

1. **No. Pesanan adalah PRIMARY KEY** yang menghubungkan 3 file report:
   - Order.all → Detail produk & timeline
   - Balance Report → Net payout langsung
   - Income (Seller Fee) → Breakdown biaya detail

2. **Balance Report langsung kasih Net Payout** (Rp66.193)
   - Tidak perlu kalkulasi manual
   - Angka sudah final setelah semua potongan

3. **Seller Fee kasih breakdown biaya** yang match 100% dengan screenshot:
   - Biaya Platform: -Rp8.056
   - Biaya Gratis Ongkir XTRA: -Rp4.125
   - Biaya Layanan: -Rp3.713
   - Biaya Lainnya (Premi): -Rp413

4. **Order.all kasih detail produk lengkap**:
   - SKU, variasi, harga, qty
   - Timeline pesanan
   - No. Resi untuk tracking

5. **Formula Profit Bersih:**
   ```
   Profit = Balance.Jumlah - HPP - Biaya Packaging
   Profit = 66.193 - HPP - Biaya Packaging
   ```

---

## Data Source Mapping

| Data Yang Dibutuhkan | File Excel | Sheet | Column/Field |
|----------------------|------------|-------|--------------|
| No. Pesanan | Order.all | orders | Col 1 |
| Status Pesanan | Order.all | orders | Col 2 |
| No. Resi | Order.all | orders | Col 5 |
| Nama Produk | Order.all | orders | Col 15 |
| SKU | Order.all | orders | Col 16 |
| Variasi | Order.all | orders | Col 17 |
| Harga Setelah Diskon | Order.all | orders | Col 19 |
| Quantity | Order.all | orders | Col 20 |
| Subtotal Pesanan | Order.all | orders | Col 22 |
| Waktu Dibuat | Order.all | orders | Col 10 |
| Waktu Selesai | Order.all | orders | Col 50 |
| **Net Payout (Penghasilan)** | **Balance Report** | **Transaction Report** | **Col 6 (Jumlah)** |
| Tanggal Dana Dilepas | Balance Report | Transaction Report | Col 1 |
| Biaya Platform | Income | Seller Fee | Col 3 |
| Biaya Gratis Ongkir XTRA | Income | Seller Fee | Col 4 |
| Biaya Layanan | Income | Seller Fee | Col 5 |
| Biaya Lainnya | Income | Seller Fee | Col 7 |

---

## Database Schema Recommendation

### Table: `orders`

```sql
CREATE TABLE orders (
  id INT PRIMARY KEY AUTO_INCREMENT,
  no_pesanan VARCHAR(50) UNIQUE NOT NULL,
  status_pesanan VARCHAR(50),
  no_resi VARCHAR(100),
  nama_produk TEXT,
  sku VARCHAR(100),
  variasi VARCHAR(255),
  harga_setelah_diskon DECIMAL(15,2),
  quantity INT,
  subtotal_pesanan DECIMAL(15,2),
  waktu_dibuat DATETIME,
  waktu_selesai DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### Table: `balance_transactions`

```sql
CREATE TABLE balance_transactions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  no_pesanan VARCHAR(50),
  tanggal_transaksi DATETIME,
  tipe_transaksi VARCHAR(100),
  deskripsi TEXT,
  jenis_transaksi VARCHAR(50),
  jumlah DECIMAL(15,2),
  status VARCHAR(50),
  saldo_akhir DECIMAL(15,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (no_pesanan) REFERENCES orders(no_pesanan)
);
```

### Table: `seller_fees`

```sql
CREATE TABLE seller_fees (
  id INT PRIMARY KEY AUTO_INCREMENT,
  no_pesanan VARCHAR(50),
  biaya_platform DECIMAL(15,2),
  biaya_gratis_ongkir_xtra DECIMAL(15,2),
  biaya_layanan DECIMAL(15,2),
  biaya_promosi DECIMAL(15,2),
  biaya_lainnya DECIMAL(15,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (no_pesanan) REFERENCES orders(no_pesanan)
);
```

### Table: `profit_calculation`

```sql
CREATE TABLE profit_calculation (
  id INT PRIMARY KEY AUTO_INCREMENT,
  no_pesanan VARCHAR(50),
  net_payout DECIMAL(15,2),
  hpp DECIMAL(15,2),
  biaya_packaging DECIMAL(15,2),
  profit_bersih DECIMAL(15,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (no_pesanan) REFERENCES orders(no_pesanan)
);
```

---

## Next Steps

1. ✓ Identifikasi struktur data dari 3 file report
2. ✓ Cross-validation data dengan screenshot
3. ✓ Mapping field Excel → Database schema
4. [ ] Analisa file Income → Sheet "Penghasilan" (1528 rows x 1000 cols)
5. [ ] Design database schema final
6. [ ] Build import script Excel → MySQL
7. [ ] Build Next.js dashboard UI
8. [ ] Deploy ke Vercel
