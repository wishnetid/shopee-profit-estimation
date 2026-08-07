# Shopee Profit Estimation — File Structure
# Updated: 2026-08-07

shopee_profit_estimation/
├── .git/
├── .gitignore
├── .venv/                          # Python venv (pymysql, openpyxl, etc)
├── FILE-STRUCTURE.md               # ← this file
│
├── data_sample/                    # Excel files + guide
│   ├── Order.all.20260707_20260806.xlsx
│   ├── Order.all.20260701_20260731.xlsx
│   ├── Order.all.20260601_20260630.xlsx
│   ├── Order.all.20260801_20260806.xlsx
│   ├── Order.cancellation.20260707_20260807.xlsx
│   ├── Order.failed_delivery.20260707_20260807.xlsx
│   ├── Order.return_refund.20260707_20260807.xls
│   ├── Income.sudah dilepas.id.20260707_20260806.xlsx
│   ├── my_balance_transaction_report.shopee.20260707_20260806.xlsx
│   ├── master.xlsx
│   ├── tacticalized_adwords_bill_2026-08-06.csv
│   ├── 2607072CRRDA37 - Data Sample Pesanan Selesai.jpg
│   └── guide/
│       ├── 01-ORDER-ALL-ANALYSIS.md
│       ├── DATABASE-TEST-RESULT.md
│       ├── FRONTEND-DESIGN.md
│       ├── HPP-MAPPING-LOGIC.txt
│       ├── Income.txt
│       ├── master.txt
│       ├── Order.all.txt
│       └── SCHEMA-REFERENCE.md
│
└── webapp/                         # Next.js 15 app
    ├── .vercel/
    ├── AGENTS.md
    ├── CLAUDE.md
    ├── README.md
    ├── next.config.ts
    ├── next-env.d.ts
    ├── package.json
    ├── package-lock.json
    ├── tsconfig.json
    │
    ├── app/
    │   ├── globals.css
    │   ├── layout.tsx              # Root layout + Sidebar
    │   ├── page.tsx                # Homepage (dashboard)
    │   ├── upload/page.tsx         # Upload reports
    │   ├── orders/page.tsx         # Order list
    │   ├── income/page.tsx         # Income list
    │   ├── sku/page.tsx            # SKU master list
    │   ├── profit/page.tsx         # Profit analysis
    │   └── api/
    │       ├── health/route.ts     # GET /api/health
    │       ├── orders/route.ts     # GET /api/orders
    │       ├── income/route.ts     # GET /api/income
    │       ├── sku/route.ts        # GET /api/sku
    │       ├── upload/route.ts     # POST /api/upload (Excel → MySQL)
    │       ├── upload/status/route.ts  # GET /api/upload/status
    │       ├── profit-calculation/route.ts       # GET /api/profit-calculation
    │       └── profit-calculation/summary/route.ts # GET /api/profit-calculation/summary
    │
    ├── components/
    │   ├── DataTable.tsx           # Reusable table (search, sort, paginate)
    │   └── Sidebar.tsx             # Sidebar navigation (unused, layout.tsx has inline)
    │
    ├── database/
    │   └── schema.sql              # DB schema definition
    │
    └── lib/
        ├── db.ts                   # MySQL connection pool (mysql2/promise)
        └── types.ts                # TypeScript type definitions
