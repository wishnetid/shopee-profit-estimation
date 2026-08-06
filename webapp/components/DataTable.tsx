'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Search, ChevronDown, ChevronUp } from 'lucide-react';

interface Column {
  key: string;
  label: string;
}

interface DataTableProps {
  columns: Column[];
  data: any[];
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
      <div className="p-4 border-b border-slate-200">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Search */}
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Search (multi-line untuk multiple query)
            </label>
            <textarea
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Ketik kata kunci pencarian...&#10;Baris baru = query baru"
              rows={3}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleSearch}
              className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <Search className="w-4 h-4" />
              Search
            </button>
          </div>

          {/* Rows per page */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Rows per page
            </label>
            <div className="flex gap-2">
              {[5, 50, 100].map((size) => (
                <button
                  key={size}
                  onClick={() => handleLimitChange(size)}
                  className={`px-4 py-2 rounded-lg border transition-colors ${
                    limit === size
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-4 text-sm text-slate-600">
          Showing {data.length > 0 ? (page - 1) * limit + 1 : 0} -{' '}
          {Math.min(page * limit, totalRows)} of {totalRows} rows
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  onClick={() => handleSort(column.key)}
                  className="px-4 py-3 text-left text-sm font-semibold text-slate-700 cursor-pointer hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span>{column.label}</span>
                    {sortColumn === column.key && (
                      <>
                        {sortDirection === 'asc' ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-8 text-center text-slate-500"
                >
                  No data found
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
                      className="px-4 py-3 text-sm text-slate-700"
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
        <div className="p-4 border-t border-slate-200 flex items-center justify-between">
          <button
            onClick={() => handlePageChange(page - 1)}
            disabled={page === 1}
            className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>

          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600">
              Page {page} of {totalPages}
            </span>
          </div>

          <button
            onClick={() => handlePageChange(page + 1)}
            disabled={page === totalPages}
            className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
