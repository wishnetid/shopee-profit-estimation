# NEXTAGENTS — Shopee Profit Estimation

> Baca file ini lalu `README.md` penuh. Project saat ini hanya menangani `Order.all` sebagai database RAW current-state berkala. Jangan mengerjakan Income, Balance, HPP, return/refund, atau profit sebelum analisa report dan diskusi dengan user.

## Status handoff — 2026-08-08

### Production

```text
URL: https://webapp-umber-five.vercel.app
Repository: wishnetid/shopee-profit-estimation
Branch: master
Commit: 8006c1fe7317aaf743b6bdf6d5ee75b2a0d01af9
Deployment: Ready
```

### Scope yang sudah selesai

`Order.all` sekarang adalah RAW current-state per item dengan key:

```text
(no_pesanan, nomor_referensi_sku, nama_variasi)
```

- Snapshot overlap di-merge, bukan di-append sebagai row baru.
- Snapshot lama tidak boleh overwrite state/field terbaru.
- Status tidak boleh mundur.
- Nilai terisi tidak boleh turun menjadi kosong atau `******`.
- `source_snapshot_at` dan `source_snapshot_file` menjadi provenance per item.
- Workbook ditolak sebelum preview/import jika header tidak tepat, composite key kosong, atau composite key duplicate dalam workbook.
- Timestamp snapshot memakai validasi kalender strict dan disimpan sortable sebagai `YYYY-MM-DD HH:mm:ss`.
- Import memakai DB transaction.

### Security yang sudah live

- `webapp/proxy.ts` melindungi seluruh page dan `/api/*` memakai Basic Auth environment-only.
- `POST /api/upload` dan `POST /api/settings/database` melakukan Basic Auth lagi di route serta menolak cross-origin POST.
- Upload hanya menerima Excel `.xlsx`/`.xls` dalam batas ukuran server-side.
- Runtime DB connection memakai environment-only; fallback credential hardcoded sudah dihapus dari source aktif.
- `webapp/scripts/migrate-order-all-snapshot-metadata.js` adalah migration idempotent tracked. Default hanya dry-run.

### Bukti verifikasi

```text
Archive/order_all-security-hardening-production-20260808-000813.json
SHA-256: 593134df4284e4475eed89a1aef75d83d70678a3e04f56b801b3654fc75da174
```

Bukti ini tidak melakukan mutasi DB dan mencatat:

- unauthenticated upload: `401`;
- unauthenticated Settings POST: `401`;
- unauthenticated/wrong-auth page: `401`;
- authenticated health: `200`, database connected;
- authenticated raw `Order.all` preview: `200`;
- duplicate composite key: `400`;
- invalid calendar timestamp: `400`;
- cross-origin upload: `403`.

Local gate terakhir:

```text
npm test: 18 pass, 0 fail
npm run build: pass
migration dry-run: no missing metadata columns
```

Backup code sebelum hardening:

```text
Archive/code-backups/20260807-234738-order-all-security-hardening/
```

## Remaining security work

Credential DB lama pernah tersimpan di riwayat repository sebelum hardening. Runtime aktif sudah tidak memakai fallback itu, tetapi password DB tetap perlu **dirotasi melalui cPanel**, lalu nilai baru dipasang di:

```text
webapp/.env.local
Vercel Production Environment Variables
```

Jangan menaruh password di source, Git, README, terminal output, atau chat. Setelah rotasi, test endpoint authenticated dan `/api/health` lagi.

## Rules wajib

```text
Report → Analisa struktur → Diskusi → Coding → Test → Deploy → Endpoint test nyata
```

- Jangan truncate/clear database tanpa backup timestamp tervalidasi dan persetujuan eksplisit user.
- Jangan menganggap `webapp/database/schema.sql`, `webapp/scripts/setup-db.js`, table `orders`, atau profit routes sebagai source of truth untuk RAW `Order.all`.
- Gunakan DDL live read-only sebelum migration:

```bash
cd /home/yogaimawan/Dokumentasi/shopee_profit_estimation/webapp
```

```bash
set -a
. ./.env.local
set +a
node scripts/migrate-order-all-snapshot-metadata.js
```

- Jangan langsung mengolah report selain `Order.all`.

## Quality gates sebelum perubahan Order.all

```bash
cd /home/yogaimawan/Dokumentasi/shopee_profit_estimation/webapp
```

```bash
npm test
```

```bash
npm run build
```

```bash
cd /home/yogaimawan/Dokumentasi/shopee_profit_estimation
```

```bash
git diff --check
```

Untuk perubahan import, test endpoint production harus mencakup request tanpa auth, auth valid, duplicate key, timestamp invalid, cross-origin, serta preview raw valid. Jangan menjalankan import mutasi terhadap DB tanpa persetujuan eksplisit.

## Langkah berikutnya yang direkomendasikan

1. Rotasi password DB lewat cPanel dan update `.env.local` + Vercel Production Environment Variables.
2. Verifikasi ulang health dan raw preview setelah rotasi.
3. Jika user ingin report berikutnya, mulai dari **Income** dengan workflow Report → Analisa → Diskusi → Coding.
