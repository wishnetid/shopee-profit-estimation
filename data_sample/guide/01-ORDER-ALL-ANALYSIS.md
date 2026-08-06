# Analisa Report: Order.all.20260601_20260630.xlsx

**File:** `Order.all.20260601_20260630.xlsx`  
**Analisa Date:** 2026-08-06  
**Period:** 2026-06-01 sampai 2026-06-30

---

## 📊 File Structure

- **Sheet Name:** `orders` (1 sheet only)
- **Total Columns:** **50 kolom**
- **Header Row:** Row 0 (first row)
- **Total Rows:** 1,108 orders (data)
- **Date Range:** 2026-06-01 01:08 sampai 2026-06-30 23:45

### 50 Column Names (lengkap):
1. No. Pesanan
2. Status Pesanan
3. Alasan Pembatalan
4. Status Pembatalan/ Pengembalian
5. No. Resi
6. Opsi Pengiriman
7. Antar ke counter/ pick-up
8. Pesanan Harus Dikirimkan Sebelum (Menghindari keterlambatan)
9. Waktu Pengiriman Diatur
10. Waktu Pesanan Dibuat
11. Waktu Pembayaran Dilakukan
12. Tipe Pesanan
13. Metode Pembayaran
14. SKU Induk
15. Nama Produk
16. Nomor Referensi SKU
17. Nama Variasi
18. Harga Awal
19. Harga Setelah Diskon
20. Jumlah
21. Returned quantity
22. Subtotal Pesanan
23. Total Diskon
24. Diskon Dari Penjual
25. Diskon Dari Shopee
26. Berat Produk
27. Jumlah Produk di Pesan
28. Total Berat
29. Voucher Ditanggung Penjual
30. Cashback Koin
31. Voucher Ditanggung Shopee
32. Paket Diskon
33. Paket Diskon (Diskon dari Shopee)
34. Paket Diskon (Diskon dari Penjual)
35. Potongan Koin Shopee
36. Diskon Kartu Kredit
37. Ongkos Kirim Dibayar oleh Pembeli
38. Estimasi Potongan Biaya Pengiriman
39. Ongkos Kirim Pengembalian Barang
40. Total Pembayaran
41. Perkiraan Ongkos Kirim
42. Catatan dari Pembeli
43. Catatan
44. Username (Pembeli)
45. Nama Penerima
46. No. Telepon
47. Alamat Pengiriman
48. Kota/Kabupaten
49. Provinsi
50. Waktu Pesanan Selesai

---

## 🏷️ Status Pesanan Breakdown

| Status Pesanan | Jumlah | Persentase |
|----------------|--------|------------|
| **Selesai**    | 890    | 80.3%      |
| **Batal**      | 218    | 19.7%      |
| **TOTAL**      | 1,108  | 100%       |

---

## ⚠️ Status Pembatalan/Pengembalian

| Status Pembatalan          | Jumlah | Note |
|----------------------------|--------|------|
| **(kosong/null)**          | 1,096  | Normal orders |
| **Permintaan Disetujui**   | 12     | Return/refund approved |
| **TOTAL**                  | 1,108  | |

### Crosstab: Status Pesanan vs Pembatalan

|                | (kosong) | Permintaan Disetujui | Total |
|----------------|----------|----------------------|-------|
| **Batal**      | 218      | 0                    | 218   |
| **Selesai**    | 878      | 12                   | 890   |
| **TOTAL**      | 1,096    | 12                   | 1,108 |

**Temuan Penting:**
- 12 orders **Status = Selesai** tapi ada **Status Pembatalan/Pengembalian = "Permintaan Disetujui"**
- Artinya: order selesai dikirim, tapi kemudian di-return/refund
- Orders ini punya `Total Pembayaran = 0` (kecuali 1 order pertama: Rp437,298)

---

## 🔑 Key Columns

### Identifier Columns:
1. **No. Pesanan** - Primary key, unique per order line
2. **No. Resi** - Shipping tracking number
3. **Username (Pembeli)** - Customer username

### Status Columns:
4. **Status Pesanan** - `Selesai`, `Batal`
5. **Alasan Pembatalan** - Reason text for cancelled orders
6. **Status Pembatalan/ Pengembalian** - `Permintaan Disetujui` atau kosong

### Product Columns:
7. **Nama Produk** - Product name
8. **Nomor Referensi SKU** - **SKU reference (SELALU ADA)**
9. **SKU Induk** - Parent SKU (**SELALU NULL di report ini**)
10. **Nama Variasi** - Variant (e.g., "Abu Tua,L", "Hitam,XXL")

### Price Columns:
11. **Harga Awal** - Original price
12. **Harga Setelah Diskon** - Price after discount
13. **Jumlah** - Quantity
14. **Total Diskon** - Total discount
15. **Diskon Dari Penjual** - Seller discount
16. **Diskon Dari Shopee** - Shopee discount
17. **Total Pembayaran** - **Final payment amount**

### Shipping Columns:
18. **Opsi Pengiriman** - Shipping method
19. **Ongkos Kirim Dibayar oleh Pembeli** - Shipping paid by customer
20. **Estimasi Potongan Biaya Pengiriman** - Estimated shipping subsidy
21. **Perkiraan Ongkos Kirim** - Estimated shipping cost

### Date Columns:
22. **Waktu Pesanan Dibuat** - Order created time
23. **Waktu Pembayaran Dilakukan** - Payment time
24. **Waktu Pesanan Selesai** - Order completed time

---

## 🔍 SKU Temuan

**PENTING:**

- **Nomor Referensi SKU:** 1,108 filled (100%)
- **SKU Induk:** 0 filled (0% - **SELALU NULL**)

**Kesimpulan:**
- Di report ini, **TIDAK ADA** kolom `SKU Induk` yang terisi
- Untuk mapping HPP, cukup pakai **`Nomor Referensi SKU`** saja
- Format SKU: 
  - `M-TAC Pendek`
  - `W-TAC Pendek`
  - `M-TAC Panjang`
  - `BLACKHAWK Panjang`
  - dll.

---

## 💰 Total Pembayaran Patterns

- **Order Selesai normal:** `Total Pembayaran > 0`
- **Order Batal:** `Total Pembayaran = 0`
- **Order Selesai + Return/Refund:** `Total Pembayaran = 0` (mayoritas)
  - Kecuali 1 case: `260604764U2Y2D` = Rp437,298 (mungkin partial refund?)

---

## 📋 Sample Orders

### 1. Order Normal (Selesai)
```
No. Pesanan: 260601UMV6ME0T
Status: Selesai
Nama Produk: Kemeja Tactical Pria Lengan Pendek M-TAC RIPSTOP Baju Kerja Lapangan
Nomor Referensi SKU: M-TAC Pendek
Harga Setelah Diskon: Rp82,500
Total Pembayaran: Rp84,000
Status Pembatalan: (kosong)
```

### 2. Order Batal
```
No. Pesanan: 260601V45KTR96
Status: Batal
Alasan: Dibatalkan oleh Pembeli. Alasan: Lainnya/ berubah pikiran
Total Pembayaran: Rp0
```

### 3. Order Selesai + Return Approved
```
No. Pesanan: 260607F50WXR9W
Status: Selesai
Status Pembatalan: Permintaan Disetujui
Total Pembayaran: Rp0
```

---

## ❓ Pertanyaan untuk User

1. **Untuk estimasi profit, order mana yang mau dihitung?**
   - Hanya `Status Pesanan = Selesai` + `Status Pembatalan/Pengembalian = kosong`?
   - Atau semua `Selesai` termasuk yang di-return?

2. **`Total Pembayaran` vs `Harga Setelah Diskon`:**
   - Mana yang dipakai untuk hitung revenue?
   - `Total Pembayaran` sudah include ongkir, voucher, dll?

3. **SKU Induk selalu null - normal?**
   - Atau di report periode lain ada isinya?

4. **12 orders dengan return approved:**
   - Ini exclude dari profit calculation?
   - Atau ada laporan khusus untuk track return cost?

---

## 🎯 Next Steps

Setelah diskusi dengan user, lanjut analisa:
- [ ] Income/Penghasilan report
- [ ] Master HPP
- [ ] Balance report (ads cost)
- [ ] Define profit calculation formula
