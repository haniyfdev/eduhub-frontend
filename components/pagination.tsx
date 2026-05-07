'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  page: number;
  pageSize: number;
  count: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (ps: number) => void;
}

export function Pagination({ page, pageSize, count, onPageChange, onPageSizeChange }: Props) {
  if (count === 0) return null;
  const totalPages = Math.ceil(count / pageSize);
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, count);

  function getPageNums(): (number | '...')[] {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | '...')[] = [1];
    if (page > 3) pages.push('...');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push('...');
    if (totalPages > 1) pages.push(totalPages);
    return pages;
  }

  return (
    <div className="flex items-center justify-between text-sm text-gray-600 flex-wrap gap-3">
      <div className="flex items-center gap-3">
        <span>{start}–{end} / {count} ta natija</span>
        <select
          value={pageSize}
          onChange={(e) => { onPageSizeChange(Number(e.target.value)); onPageChange(1); }}
          className="px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none"
        >
          {[10, 25, 50, 100].map((s) => <option key={s} value={s}>{s} ta</option>)}
        </select>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          className="flex items-center gap-1 px-2.5 py-1.5 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-xs"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Oldingi
        </button>
        {getPageNums().map((p, i) =>
          p === '...' ? (
            <span key={`d${i}`} className="px-2 text-gray-400 text-xs">...</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p as number)}
              className={`px-2.5 py-1.5 border rounded text-xs ${
                p === page
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-gray-300 hover:bg-gray-50'
              }`}
            >
              {p}
            </button>
          )
        )}
        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages || totalPages === 0}
          className="flex items-center gap-1 px-2.5 py-1.5 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-xs"
        >
          Keyingi <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
