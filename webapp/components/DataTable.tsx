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
  onPageChange: (page: number, limit: number) => void;
  onSearch: (queries: string[]) => void;
  onSort: (column: string, direction: 'asc' | 'desc') => void;
}

export default function DataTable({
  columns,
  data,
  totalRows,
  onPageChange,
  onSearch,
  onSort,
}: DataTableProps) {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [searchText, setSearchText] = useState('');
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const totalPages = Math.ceil(totalRows / limit);

  const handleLimitChange = (newLimit: number) => {
    setLimit(newLimit);
    setPage(1);
    onPageChange(1, newLimit);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    onPageChange(newPage, limit);
  };

  const handleSearch = () => {
    const queries = searchText
      .split('\n')
      .map(q => q.trim())
      .filter(q => q.length > 0);
    onSearch(queries);
  };

  const handleSort = (column: string) => {
    const newDirection =
      sortColumn === column && sortDirection === 'asc' ? 'desc' : 'asc';
    setSortColumn(column);
    setSortDirection(newDirection);
    onSort(column, newDirection);
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200">
      {/* Controls */}
      <div className="p-3 lg:p-4 border-b border-slate-200">
        <div className="flex flex-col gap-3">
          {/* Search */}
          <div className="flex-1">
            <label className="block text-xs lg:text-sm font-medium text-slate-700 mb-1.5">
              Search
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Cari no pesanan, produk..."
                className="flex-1 min-w-0 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleSearch}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1.5 flex-shrink-0"
              >
                <Search className="w-4 h-4" />
                <span className="hidden sm:inline">Search</span>
              </button>
            </div>
          </div>

          {/* Bottom row: rows per page + stats */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500">Rows:</span>
              {[10, 50, 100].map((size) => (
                <button
                  key={size}
                  onClick={() => handleLimitChange(size)}
                  className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                    limit === size
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
            <div className="text-xs text-slate-500">
              {data.length > 0 ? (page - 1) * limit + 1 : 0}–
              {Math.min(page * limit, totalRows)} / {totalRows}
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead className="bg-slate-50 border-b border-slate-200">
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
