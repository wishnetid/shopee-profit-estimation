import RawReportPage from '@/components/RawReportPage';

const columns = [
  { key: 'source_file', label: 'Report' }, { key: 'report_period_from', label: 'Periode Dari' },
  { key: 'source_excel_row', label: 'Source Row' }, { key: 'transaction_at', label: 'Tanggal Transaksi' },
  { key: 'type_transaksi', label: 'Tipe' }, { key: 'description', label: 'Deskripsi' },
  { key: 'no_pesanan_direct', label: 'No. Pesanan Direct' }, { key: 'no_pesanan_extracted', label: 'No. Pesanan Extracted' },
  { key: 'jenis_transaksi', label: 'Jenis' }, { key: 'jumlah_signed', label: 'Jumlah Signed' }, { key: 'saldo_akhir', label: 'Saldo Akhir' },
];

const importHistoryColumns = [
  { key: 'id', label: 'Import ID' }, { key: 'source_file', label: 'Source File' },
  { key: 'report_period_from', label: 'Periode Dari' }, { key: 'report_period_to', label: 'Periode Sampai' },
  { key: 'source_sha256', label: 'SHA-256' }, { key: 'summary_total_saldo_masuk', label: 'Saldo Masuk Source' },
  { key: 'summary_total_saldo_keluar', label: 'Saldo Keluar Source' }, { key: 'reconciliation_status', label: 'Rekonsiliasi' },
  { key: 'ledger_continuity_status', label: 'Ledger Continuity' }, { key: 'imported_at', label: 'Di-import' },
];

export default function BalancePage() {
  return <RawReportPage title="Balance RAW" description="Ledger mutasi saldo source dengan provenance package." reportType="balance" columns={columns} filters={[{ key: 'type', label: 'Tipe Transaksi' }, { key: 'kind', label: 'Jenis Transaksi' }, { key: 'status', label: 'Status' }]} importHistory importHistoryColumns={importHistoryColumns} />;
}
