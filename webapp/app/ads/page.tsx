import RawReportPage from '@/components/RawReportPage';

const columns = [
  { key: 'source_file', label: 'Report' }, { key: 'report_period_from', label: 'Periode Dari' },
  { key: 'source_csv_row', label: 'Source Row' }, { key: 'transaction_date', label: 'Tanggal' },
  { key: 'sequence_number', label: 'Urutan' }, { key: 'description', label: 'Deskripsi' },
  { key: 'jumlah_signed', label: 'Jumlah Signed' }, { key: 'note', label: 'Catatan' },
];

const importHistoryColumns = [
  { key: 'id', label: 'Import ID' }, { key: 'source_file', label: 'Source File' },
  { key: 'report_period_from', label: 'Periode Dari' }, { key: 'report_period_to', label: 'Periode Sampai' },
  { key: 'source_sha256', label: 'SHA-256' }, { key: 'currency', label: 'Mata Uang' },
  { key: 'seller_username', label: 'Username Penjual' }, { key: 'source_store_reference', label: 'Referensi Toko Source' },
  { key: 'imported_at', label: 'Di-import' },
];

export default function AdsPage() {
  return <RawReportPage title="Ads RAW" description="Ledger transaksi iklan source; top-up dan pemakaian belum dihitung sebagai biaya iklan final." reportType="ads" columns={columns} importHistory importHistoryColumns={importHistoryColumns} />;
}
