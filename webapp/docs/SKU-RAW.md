# SKU Master RAW

## Scope aktif

SKU Master disimpan sebagai paket RAW terpisah. Fase ini hanya menjaga provenance dan tampilan data source SKU. Tidak ada mapping HPP, join ke `Order.all`, alokasi biaya, atau kalkulasi profit pada layer ini.

## Kontrak workbook

Satu workbook SKU harus memiliki satu sheet dengan seluruh header berikut:

```text
SKU1
SKU2
Harga
IDPRODUK
```

Parser menyimpan setiap row sumber yang berisi data. Exact duplicate content antar-row tetap dipertahankan karena RAW identity tidak memakai nilai bisnis row. Header tambahan yang label tampilannya berulang disimpan dengan canonical key berurutan (`catatan__1`, `catatan__2`) agar payload tidak menimpa nilai sumber. Header wajib (`SKU1`, `SKU2`, `Harga`, `IDPRODUK`) yang muncul lebih dari sekali diblok sebelum import karena mapping normalisasi menjadi ambigu.

## Storage

```text
sku_report_imports
  Parent/provenance per workbook:
  source_file, source_sha256, sheet_name, headers, warnings, imported_at.

sku_master_raw
  Semua row dari sheet sumber.
  Identity RAW: (sku_report_import_id, source_excel_row).
  Field terindeks untuk pembacaan: sku1, sku2, harga, idproduk.
  raw_payload menyimpan nilai sumber lengkap.
```

## Import dan duplicate policy

1. File dengan SHA-256 sama adalah duplicate/no-op.
2. Workbook berbeda tetap disimpan sebagai paket RAW terpisah, walaupun isi bisnisnya overlap.
3. Parent package dan seluruh child row di-import dalam satu database transaction.
4. Gagal insert pada child row me-rollback seluruh package.
5. Tidak ada `INSERT IGNORE`, deduplication bisnis, update otomatis, atau penghapusan pada layer RAW.

## UI dan API

```text
/upload
  Auto-detect workbook SKU, preview SHA-256 dan row RAW, lalu import package.

/api/sku
  Membaca satu package SKU RAW terpilih, default package terbaru.

/sku
  Menampilkan package selector, row source, SKU1, SKU2, Harga RAW, dan IDPRODUK.
```

## Batas untuk fase berikutnya

`HPP-MAPPING-LOGIC.txt` adalah referensi diskusi, bukan kontrak kalkulasi aktif. Sebelum HPP dipakai, perlu analisa dan persetujuan terpisah untuk:

- prioritas `Nomor Referensi SKU` dan `SKU Induk` dari `Order.all`;
- prioritas alias `SKU1` dan `SKU2`;
- konflik mapping dan duplicate bisnis;
- grain item versus order;
- dampak return/refund serta settlement Income.
