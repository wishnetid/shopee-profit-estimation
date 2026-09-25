'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Search, ChevronDown, ChevronUp } from 'lucide-react';

interface Column {
  key: string;
  label: string;
}

interface DataTableProps {
  columns: Column[];
  data: Record<string, unknown>[];
  totalRows: number;
  onPageChange: (page: number, limit: number, queries: string[]) => void;
  onSearch: (queries: string[]) => void;
  onSort: (column: string, direction: 'asc' | 'desc', queries: string[]) => void;
  boundedScroll?: boolean;
}

export default function DataTable({
  columns,
  data,
  totalRows,
  onPageChange,
  onSearch,
  onSort,
  boundedScroll = false,
}: DataTableProps) {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [searchText, setSearchText] = useState('');
  const [activeQueries, setActiveQueries] = useState<string[]>([]);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const totalPages = Math.ceil(totalRows / limit);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    onPageChange(newPage, limit, activeQueries);
  };

  const handleSearch = () => {
    const queries = [...new Set(searchText
      .split(/\r?\n|\|\|/)
      .map(q => q.trim())
      .filter(Boolean))].slice(0, 500);
    setActiveQueries(queries);
    setPage(1);
    onSearch(queries);
  };

  const clearSearch = () => {
    setSearchText('');
    setActiveQueries([]);
    setPage(1);
    onSearch([]);
  };

  const handleSort = (column: string) => {
    const newDirection =
      sortColumn === column && sortDirection === 'asc' ? 'desc' : 'asc';
    setSortColumn(column);
    setSortDirection(newDirection);
    onSort(column, newDirection, activeQueries);
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200">
      {/* Controls */}
      <div className="p-3 lg:p-4 border-b border-slate-200">
        <div className="flex flex-col gap-3">
          {/* Search */}
          <div className="flex-1">
            <label className="block text-xs lg:text-sm font-medium text-slate-700 mb-1.5">Cari / Bulk Search</label>
            <textarea value={searchText} onChange={(e) => setSearchText(e.target.value)} onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleSearch(); }} rows={3} placeholder="Satu baris satu ID: No. Pesanan, Resi, Pengembalian, SKU, produk…" className="block w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <div className="mt-2 flex flex-wrap items-center gap-2"><button onClick={handleSearch} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1.5"><Search className="w-4 h-4" /><span>Cari</span></button>{activeQueries.length > 0 && <button onClick={clearSearch} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">Reset</button>}<span className="text-xs text-slate-500">Paste hingga 500 baris · Ctrl/Cmd + Enter untuk cari</span></div>
            {activeQueries.length > 0 && <p className="mt-2 text-xs font-medium text-slate-600">{activeQueries.length} query aktif · {totalRows} baris cocok pada scope/filter aktif.</p>}
          </div>

          <div className="text-right text-xs text-slate-500">
            {data.length > 0 ? (page - 1) * limit + 1 : 0}–
            {Math.min(page * limit, totalRows)} / {totalRows}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className={boundedScroll ? 'max-h-[437px] overflow-auto' : 'overflow-x-auto'}>
        <table className="w-full min-w-[600px]">
          <thead className={boundedScroll ? 'sticky top-0 z-10 bg-slate-50 border-b border-slate-200' : 'bg-slate-50 border-b border-slate-200'}>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  onClick={() => handleSort(column.key)}
                  className="px-3 lg:px-4 py-2.5 text-left text-xs font-semibold text-slate-700 cursor-pointer hover:bg-slate-100 transition-colors whitespace-nowrap"
                >
                  <div className="flex items-center gap-1">
                    <span>{column.label}</span>
                    {sortColumn === column.key && (
                      sortDirection === 'asc'
                        ? <ChevronUp className="w-3 h-3" />
                        : <ChevronDown className="w-3 h-3" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-12 text-center text-slate-400"
                >
                  Tidak ada data
                </td>
              </tr>
            ) : (
              data.map((row, index) => (
                <tr
                  key={index}
                  className="hover:bg-slate-50 transition-colors"
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className="px-3 lg:px-4 py-2.5 text-xs lg:text-sm text-slate-700 whitespace-nowrap"
                    >
                      {row[column.key] !== null && row[column.key] !== undefined
                        ? String(row[column.key])
                        : '-'}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-3 lg:px-4 py-2.5 border-t border-slate-200 flex items-center justify-between">
          <button
            onClick={() => handlePageChange(page - 1)}
            disabled={page === 1}
            className="px-3 py-1.5 text-xs lg:text-sm border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Prev
          </button>

          <span className="text-xs text-slate-500">
            {page} / {totalPages}
          </span>

          <button
            onClick={() => handlePageChange(page + 1)}
            disabled={page === totalPages}
            className="px-3 py-1.5 text-xs lg:text-sm border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
          >
            Next
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
