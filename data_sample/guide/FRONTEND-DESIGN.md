# Front-End Design - Shopee Profit Estimation

**Date:** 2026-08-06  
**Version:** 2.0 - Fresh Redesign

---

## Overview

Simple, focused dashboard untuk **3 tabel report**:
1. Order All
2. Income Penghasilan  
3. SKU Master

---

## Design Spec

### Layout
- **Sidebar Navigation** (fixed left, 256px width)
- **Main Content Area** (flex-1, scrollable)
- **Light Theme** (sesuai preferensi user)

### 4 Menu
1. **Upload Manager** - Multiple file upload dengan auto-detection
2. **Order All** - Tabel order_all dengan full features
3. **Income** - Tabel income_penghasilan
4. **SKU Master** - Tabel master_products

---

## Features

### Upload Manager
✅ Multiple file upload (drag & drop + file picker)  
✅ Auto-detect report type by structure:
- Order.all: sheet "orders", 50 columns
- Income: sheet "Penghasilan", 52 columns, header row 2
- Master: sheet "Sheet1", 4 columns (SKU1, SKU2, Harga, IDPRODUK)

✅ Support format: .xlsx, .xls, .csv  
✅ Upload mode: **UPDATE** (append/merge data berkala)  
✅ Progress tracking per file  
✅ Status: idle, uploading, success, error

### Table Display (3 tabs)
✅ **Pagination:** 5, 50, 100 rows per page  
✅ **Universal Search:** search anything (No. Pesanan, nama produk, alamat, username, dll)  
✅ **Multi-line Search:** 1 baris = 1 query, multiple query = OR condition  
✅ **Sort:** Click column header, asc/desc toggle  
✅ **Responsive:** Mobile-friendly table overflow  
✅ **Stats:** "Showing X-Y of Z rows"

---

## Tech Stack

- **Framework:** Next.js 15 (App Router)
- **Styling:** Tailwind CSS v4
- **Database:** MySQL (cPanel remote @ 103.136.19.30)
- **File Parsing:** xlsx (SheetJS)
- **Icons:** lucide-react
- **Deployment:** Vercel

---

## File Structure

```
webapp/
├── app/
│   ├── layout.tsx          # Sidebar navigation
│   ├── page.tsx            # Home / Dashboard
│   ├── upload/
│   │   └── page.tsx        # Upload Manager
│   ├── orders/
│   │   └── page.tsx        # Order All table
│   ├── income/
│   │   └── page.tsx        # Income table
│   ├── sku/
│   │   └── page.tsx        # SKU Master table
│   └── api/
│       ├── upload/
│       │   └── route.ts    # Upload + Auto-detection
│       ├── orders/
│       │   └── route.ts    # Orders API (GET)
│       ├── income/
│       │   └── route.ts    # Income API (GET)
│       └── sku/
│           └── route.ts    # SKU API (GET)
├── components/
│   └── DataTable.tsx       # Reusable table component
└── package.json
```

---

## API Endpoints

### Upload
**POST /api/upload**
- Body: multipart/form-data (file)
- Response: `{ success, reportType, message, rowsImported }`

### Orders
**GET /api/orders?page=1&limit=50&search=query1||query2&sort=column&direction=asc**
- Response: `{ success, data[], total, page, limit }`

### Income
**GET /api/income?page=1&limit=50&search=query1||query2&sort=column&direction=asc**
- Response: `{ success, data[], total, page, limit }`

### SKU
**GET /api/sku?page=1&limit=50&search=query1||query2&sort=column&direction=asc**
- Response: `{ success, data[], total, page, limit }`

---

## Auto-Detection Logic

### Order.all
- Sheet name: `orders`
- Columns: 50+
- Key columns: No. Pesanan, Status Pesanan, Nama Produk, SKU

### Income Penghasilan
- Sheet name: `Penghasilan`
- Header row: 2 (0-indexed, skip row 1)
- Columns: 52+
- Filter: `Lihat berdasarkan = 'Order'` (skip 'Sku' rows)

### Master SKU
- Sheet name: `Sheet1`
- Columns: exactly 4 (SKU1, SKU2, Harga, IDPRODUK)

---

## Search Implementation

### Multi-Query Search
User input (textarea):
```
2607072CRRDA37
M-TAC Pendek
Jl. Cibaduyut
```

Backend parsing:
```javascript
const queries = search.split('||'); // OR condition
queries = ['2607072CRRDA37', 'M-TAC Pendek', 'Jl. Cibaduyut']
```

SQL WHERE clause:
```sql
WHERE (
  (no_pesanan LIKE '%2607072CRRDA37%' OR nama_produk LIKE '%2607072CRRDA37%' ...) OR
  (no_pesanan LIKE '%M-TAC Pendek%' OR nama_produk LIKE '%M-TAC Pendek%' ...) OR
  (no_pesanan LIKE '%Jl. Cibaduyut%' OR nama_produk LIKE '%Jl. Cibaduyut%' ...)
)
```

---

## Column Mapping

### Order All (8 columns displayed)
- No. Pesanan
- Status
- Produk
- SKU
- Qty
- Total
- Waktu Dibuat
- Pembeli

### Income (8 columns displayed)
- No. Pesanan
- Tgl Dana Dilepas
- Harga Produk
- Biaya Admin
- Biaya Proses
- Biaya XTRA
- Biaya Promo
- Pembeli

### SKU Master (6 columns displayed)
- ID
- SKU1
- SKU2
- HPP (Rp)
- ID Produk
- Created

---

## Design Decisions

### Why Light Theme?
User preference: "light theme (#f1f5f9 bg, white cards)"

### Why Multi-line Search?
User explicitly requested: "bisa melakukan multiple pencarian dengan pindah baris"

### Why Universal Search?
User wants: "Search by anything Bro, supaya gw bisa mencari apapun walaupun mencari alamat"

### Why 5/50/100 Pagination?
User: "ada pilihan mau menampilkan 5 row 50 row 100 row"

### Why UPDATE Mode (Not Replace)?
User: "DATA AKAN DI UPDATE BERKALA Bro, bukan calculation sementara"

---

## Environment Variables

Create `.env.local`:
```
DB_HOST=103.136.19.30
DB_PORT=3306
DB_USER=supplie3_shopee_profit_estimation
DB_PASSWORD=Persib1933
DB_NAME=supplie3_shopee_profit_estimation
```

---

## Next Steps

1. ✅ Database schema ready (v2)
2. ✅ Front-end design complete
3. ⏳ Test locally: `npm run dev`
4. ⏳ Deploy to Vercel
5. ⏳ Test upload flow dengan real data
6. ⏳ Test table display (pagination, search, sort)

---

## Status: ✅ FRONT-END READY FOR TESTING
