const { parseSignedNumber } = require('./income-raw-import.js');

function getPayload(payload, ...keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) return payload[key];
  }
  return null;
}

function toDate(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null;
}

function buildIncomePreview(parsed, existingImport) {
  const duplicateHash = Boolean(existingImport);
  const sections = {
    penghasilanOrder: { status: parsed.sections.penghasilan.status, rows: parsed.sections.penghasilan.orderRows.length },
    penghasilanSku: { status: parsed.sections.penghasilan.status, rows: parsed.sections.penghasilan.skuRows.length },
    adjustment: { status: parsed.sections.adjustment.status, rows: parsed.sections.adjustment.rows.length },
    shippingFeeDiscrepancy: { status: parsed.sections.shippingFeeDiscrepancy.status, rows: parsed.sections.shippingFeeDiscrepancy.rows.length },
  };
  const totalRows = Object.values(sections).reduce((sum, section) => sum + section.rows, 0);
  return {
    valid: parsed.valid,
    canImport: parsed.valid && !duplicateHash,
    duplicateHash,
    existingImportId: existingImport?.id ?? null,
    totalRows,
    newRows: duplicateHash ? 0 : totalRows,
    existingRows: 0,
    unchangedRows: duplicateHash ? totalRows : 0,
    safeUpdateRows: 0,
    protectedFieldCount: 0,
    staleSnapshotCount: 0,
    regressionCount: 0,
    updatedRows: [],
    sourceFile: parsed.sourceFile,
    sha256: parsed.sha256,
    reportPeriod: parsed.reportPeriod,
    summary: parsed.summary,
    reconciliation: parsed.reconciliation,
    sections,
    warnings: parsed.warnings,
    errors: parsed.errors,
    headers: parsed.sections.penghasilan.headers.map((header) => ({ key: header.key, label: header.label })),
    previewRows: parsed.sections.penghasilan.orderRows.slice(0, 10),
  };
}

async function findExistingIncomeImport(conn, sha256) {
  const [rows] = await conn.query(
    'SELECT id, source_file, source_sha256, imported_at FROM income_report_imports WHERE source_sha256 = ? LIMIT 1',
    [sha256],
  );
  return rows[0] || null;
}

async function insertRows(conn, table, columns, rows) {
  if (!rows.length) return 0;
  const placeholders = rows.map(() => `(${columns.map(() => '?').join(',')})`).join(',');
  const [result] = await conn.query(
    `INSERT INTO ${table} (${columns.join(',')}) VALUES ${placeholders}`,
    rows.flat(),
  );
  return result.affectedRows || 0;
}

async function importIncomePackage(conn, parsed) {
  if (!parsed.valid) throw new Error('Income package belum valid dan tidak boleh di-import.');
  await conn.beginTransaction();
  try {
    const existing = await findExistingIncomeImport(conn, parsed.sha256);
    if (existing) {
      await conn.rollback();
      return { duplicate: true, importId: existing.id, inserted: { penghasilan: 0, adjustment: 0, shippingFeeDiscrepancy: 0 } };
    }
    const [parent] = await conn.query(
      `INSERT INTO income_report_imports
       (source_file, source_sha256, report_period_from, report_period_to, summary_payload, summary_total_yang_dilepas, reconciliation_order_signed_total, reconciliation_difference, reconciliation_status, warnings_payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        parsed.sourceFile,
        parsed.sha256,
        toDate(parsed.reportPeriod.from),
        toDate(parsed.reportPeriod.to),
        JSON.stringify(parsed.summary),
        parsed.reconciliation.summaryTotal,
        parsed.reconciliation.orderSignedTotal,
        parsed.reconciliation.difference,
        parsed.reconciliation.status,
        JSON.stringify(parsed.warnings),
      ],
    );
    const importId = parent.insertId;
    const penghasilanRows = [...parsed.sections.penghasilan.orderRows, ...parsed.sections.penghasilan.skuRows];
    const penghasilan = await insertRows(conn, 'income_penghasilan_raw', [
      'income_report_import_id', 'source_excel_row', 'lihat_berdasarkan', 'no_pesanan', 'id_produk', 'nama_produk', 'waktu_pesanan_dibuat', 'tanggal_dana_dilepaskan', 'signed_total', 'raw_payload',
    ], penghasilanRows.map((row) => [
      importId, row.source_excel_row, row.lihat_berdasarkan, row.no_pesanan, row.id_produk, row.nama_produk,
      toDate(row.waktu_pesanan_dibuat), toDate(row.tanggal_dana_dilepaskan), row.signed_total, JSON.stringify(row.raw_payload),
    ]));
    const adjustment = await insertRows(conn, 'income_adjustments_raw', [
      'income_report_import_id', 'source_excel_row', 'no_pesanan_terhubung', 'tanggal_penyesuaian_dibuat', 'tanggal_dana_dilepaskan', 'biaya_penyesuaian', 'raw_payload',
    ], parsed.sections.adjustment.rows.map((row) => {
      const p = row.raw_payload;
      return [
        importId, row.source_excel_row, getPayload(p, 'no_pesanan_terhubung'),
        toDate(getPayload(p, 'tanggal_penyesuaian_dibuat')),
        toDate(getPayload(p, 'tanggal_dana_dilepaskan')),
        parseSignedNumber(getPayload(p, 'biaya_penyesuaian')),
        JSON.stringify(p),
      ];
    }));
    const shippingFeeDiscrepancy = await insertRows(conn, 'income_shipping_fee_discrepancies_raw', [
      'income_report_import_id', 'source_excel_row', 'no_pesanan', 'estimasi_ongkos_kirim', 'ongkos_kirim_dibayarkan_jasa_kirim', 'discrepancy_reason', 'raw_payload',
    ], parsed.sections.shippingFeeDiscrepancy.rows.map((row) => {
      const p = row.raw_payload;
      return [
        importId, row.source_excel_row, getPayload(p, 'no_pesanan'),
        parseSignedNumber(getPayload(p, 'estimasi_ongkos_kirim')),
        parseSignedNumber(getPayload(p, 'ongkos_kirim_yang_dibayarkan_ke_jasa_kirim')),
        getPayload(p, 'discrepancy_reason'), JSON.stringify(p),
      ];
    }));
    await conn.commit();
    return { duplicate: false, importId, inserted: { penghasilan, adjustment, shippingFeeDiscrepancy } };
  } catch (error) {
    await conn.rollback();
    throw error;
  }
}

module.exports = { buildIncomePreview, findExistingIncomeImport, importIncomePackage };
