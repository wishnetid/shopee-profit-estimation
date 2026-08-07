function buildSkuPreview(parsed, existingImport) {
  const duplicateHash = Boolean(existingImport);
  return {
    valid: parsed.valid,
    canImport: parsed.valid && !duplicateHash,
    duplicateHash,
    existingImportId: existingImport?.id ?? null,
    totalRows: parsed.rows.length,
    newRows: duplicateHash ? 0 : parsed.rows.length,
    existingRows: 0,
    unchangedRows: duplicateHash ? parsed.rows.length : 0,
    safeUpdateRows: 0,
    protectedFieldCount: 0,
    staleSnapshotCount: 0,
    regressionCount: 0,
    updatedRows: [],
    sourceFile: parsed.sourceFile,
    sha256: parsed.sha256,
    sheetName: parsed.sheetName,
    headers: parsed.headers,
    previewColumns: parsed.headers,
    previewRows: parsed.rows.slice(0, 10),
    warnings: parsed.warnings,
    errors: parsed.errors,
  };
}

async function findExistingSkuImport(conn, sha256) {
  const [rows] = await conn.query(
    'SELECT id, source_file, source_sha256, imported_at FROM sku_report_imports WHERE source_sha256 = ? LIMIT 1',
    [sha256],
  );
  return rows[0] || null;
}

async function importSkuRawPackage(conn, parsed) {
  if (!parsed.valid) throw new Error('SKU RAW package belum valid dan tidak boleh di-import.');
  await conn.beginTransaction();
  try {
    const existing = await findExistingSkuImport(conn, parsed.sha256);
    if (existing) {
      await conn.rollback();
      return { duplicate: true, importId: existing.id, inserted: 0 };
    }

    const [parent] = await conn.query(
      `INSERT INTO sku_report_imports (source_file, source_sha256, sheet_name, headers_payload, warnings_payload)
       VALUES (?, ?, ?, ?, ?)`,
      [
        parsed.sourceFile,
        parsed.sha256,
        parsed.sheetName,
        JSON.stringify(parsed.headers),
        JSON.stringify(parsed.warnings),
      ],
    );
    const importId = parent.insertId;
    const rows = parsed.rows.map((row) => [
      importId,
      row.source_excel_row,
      row.sku1 == null ? null : String(row.sku1),
      row.sku2 == null ? null : String(row.sku2),
      row.harga,
      row.idproduk == null ? null : String(row.idproduk),
      JSON.stringify(row.raw_payload),
    ]);
    let inserted = 0;
    if (rows.length) {
      const columns = ['sku_report_import_id', 'source_excel_row', 'sku1', 'sku2', 'harga', 'idproduk', 'raw_payload'];
      const placeholders = rows.map(() => `(${columns.map(() => '?').join(',')})`).join(',');
      const [result] = await conn.query(
        `INSERT INTO sku_master_raw (${columns.join(',')}) VALUES ${placeholders}`,
        rows.flat(),
      );
      inserted = result.affectedRows || 0;
    }
    await conn.commit();
    return { duplicate: false, importId, inserted };
  } catch (error) {
    await conn.rollback();
    throw error;
  }
}

module.exports = {
  buildSkuPreview,
  findExistingSkuImport,
  importSkuRawPackage,
};
