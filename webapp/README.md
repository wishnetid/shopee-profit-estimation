# Shopee Profit Estimation - Web App

Dashboard Next.js untuk estimasi profit Shopee dengan MySQL remote (cPanel) dan deployment ke Vercel.

## Tech Stack

- **Framework:** Next.js 15+ (App Router)
- **Database:** MySQL (cPanel remote)
- **ORM:** mysql2/promise dengan connection pooling
- **Styling:** Tailwind CSS
- **Deployment:** Vercel
- **TypeScript:** Yes

## Project Structure

```
webapp/
├── app/
│   ├── api/
│   │   ├── health/route.ts          # Health check & DB test
│   │   ├── orders/route.ts          # Orders CRUD
│   │   └── profit-calculation/
│   │       ├── route.ts             # Profit per order
│   │       └── summary/route.ts     # Profit summary
│   ├── upload/page.tsx              # Upload reports page
│   ├── orders/page.tsx              # View orders page
│   ├── profit/page.tsx              # Profit analysis page
│   ├── layout.tsx                   # Root layout dengan Sidebar
│   └── page.tsx                     # Homepage (dashboard)
├── components/
│   └── Sidebar.tsx                  # Navigation sidebar
├── lib/
│   ├── db.ts                        # MySQL connection pool (serverless-friendly)
│   └── types.ts                     # TypeScript type definitions
├── database/
│   └── schema.sql                   # Database schema SQL
├── .env.local                       # Local environment variables (DB credentials)
└── .env.example                     # Example env template
```

## Database Connection

Connection pooling optimized untuk Vercel serverless:

```typescript
// lib/db.ts
export function getPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      
      // Serverless-friendly config
      connectionLimit: 5,          // Vercel limit
      waitForConnections: true,
      idleTimeout: 60000,
      enableKeepAlive: true,
    });
  }
  return pool;
}
```

## Environment Variables

```bash
# .env.local
DB_HOST=103.136.19.30
DB_PORT=3306
DB_USER=supplie3_shopee_profit_estimation
DB_PASSWORD=Persib1933
DB_NAME=supplie3_shopee_profit_estimation

NEXT_PUBLIC_API_URL=http://localhost:3000
```

## API Routes

### 1. Health Check
```
GET /api/health
```
Test database connection.

### 2. Orders
```
GET /api/orders?page=1&limit=50&status=Selesai&search=2607072
```
List orders dengan pagination & filters.

### 3. Profit Calculation
```
GET /api/profit-calculation?page=1&limit=50&search=M-TAC
```
Calculate profit per order (Net Payout - HPP).

### 4. Profit Summary
```
GET /api/profit-calculation/summary?start_date=2026-07-01&end_date=2026-07-31
```
Aggregate statistics: total orders, net payout, HPP, profit, margin, ad cost.

## Pages

### 1. Homepage (`/`)
- Quick stats cards
- Quick actions (Upload, Orders, Profit)
- System status (DB connection)

### 2. Upload Reports (`/upload`)
- Upload Order.all Excel
- Upload Income (Penghasilan) Excel
- Upload Master HPP Excel
- Instructions & status cards

### 3. Orders (`/orders`)
- List all orders
- Filters: search, status, date
- Pagination

### 4. Profit Analysis (`/profit`)
- Summary cards (total orders, net payout, HPP, profit)
- Ad cost section
- Profit per order table
- Formula info

## Database Schema

See `database/schema.sql` for complete schema.

**Core Tables:**
1. `orders` - Order.all data
2. `income_penghasilan` - Income "Penghasilan" sheet data
3. `balance_transactions` - Balance report data
4. `master_products` - Master SKU dengan HPP

**View:**
- `profit_calculation` - Calculated profit per order

## HPP Mapping Logic

Priority mapping untuk get HPP:

1. Ambil `nomor_referensi_sku` dari orders (prioritas 1)
2. Jika kosong → ambil `sku_induk` (fallback)
3. Match dengan `master_products.sku1` (prioritas 1)
4. Jika tidak match → coba `master_products.sku2` (fallback)
5. Ambil `harga` sebagai HPP (sudah + packaging)

```sql
COALESCE(o.nomor_referensi_sku, o.sku_induk) = m.sku1
OR COALESCE(o.nomor_referensi_sku, o.sku_induk) = m.sku2
```

## Profit Formula

```
Net Payout = Harga Produk
           + Gratis Ongkir dari Shopee
           - Ongkir ke Jasa Kirim
           - Biaya Administrasi
           - Biaya Proses Pesanan
           - Biaya Gratis Ongkir XTRA
           - Biaya Layanan Promo XTRA
           - Biaya Lainnya

Profit Bersih = Net Payout - HPP

Margin % = (Profit / Net Payout) × 100
```

## Development

```bash
# Install dependencies
npm install

# Setup database
# Run schema.sql on MySQL database

# Run dev server
npm run dev

# Open http://localhost:3000
```

## Deployment (Vercel)

1. Push code ke GitHub
2. Import project di Vercel
3. Set environment variables di Vercel dashboard:
   - `DB_HOST`
   - `DB_PORT`
   - `DB_USER`
   - `DB_PASSWORD`
   - `DB_NAME`
4. Deploy

## Next Steps

- [ ] Implement Excel upload parser
- [ ] Implement bulk import untuk Orders, Income, Master
- [ ] Add date range filter
- [ ] Add export to CSV/Excel
- [ ] Add charts (profit trend, margin distribution)
- [ ] Add SKU tidak ketemu di master (missing HPP report)

## Notes

- Connection pool singleton pattern untuk avoid multiple connections di serverless
- `connectionLimit: 5` sesuai Vercel limit
- Header row auto-detect (bisa di row 1, 2, 18, etc.)
- Excel parser belum implemented (security concern dengan `xlsx` package)
- Theme: Light (#f1f5f9 bg, white cards)
