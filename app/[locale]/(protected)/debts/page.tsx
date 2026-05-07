'use client';

import { useEffect, useState, useCallback } from 'react';
import { Search, ChevronLeft, ChevronRight, MessageSquare, AlertCircle } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { Skeleton } from '@/components/ui/skeleton';
import api from '@/lib/axios';
import { cn, formatCurrency } from '@/lib/utils';
import { PaginatedResponse } from '@/types';

interface Debt {
  id: string;
  student: { id: string; first_name: string; last_name: string };
  student_phone: string;
  group_name?: string | null;
  amount: number;
  due_date: string;
  status: 'unpaid' | 'partial' | 'overdue' | 'paid';
}

const STATUS_STYLES: Record<string, string> = {
  unpaid: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  partial: 'bg-orange-50 text-orange-700 border-orange-200',
  overdue: 'bg-red-50 text-red-700 border-red-200',
  paid: 'bg-green-50 text-green-700 border-green-200',
};
const STATUS_LABELS: Record<string, string> = {
  unpaid: 'To\'lanmagan', partial: 'Qisman', overdue: 'Muddati o\'tgan', paid: 'To\'langan',
};

const PAGE_SIZE = 20;

export default function DebtsPage() {
  const [debts, setDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('unpaid,overdue');
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const fetchDebts = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const params: Record<string, string | number> = { page };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const { data } = await api.get<PaginatedResponse<Debt> & { total_amount?: number }>(
        '/api/v1/debts/', { params }
      );
      setDebts(data.results);
      setCount(data.count);
      setTotalAmount(data.total_amount ?? data.results.reduce((s, d) => s + d.amount, 0));
    } catch {
      setError(true);
      toast.error('Ma\'lumotlarni yuklashda xatolik');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => { fetchDebts(); }, [fetchDebts]);
  useEffect(() => { setPage(1); }, [search, statusFilter]);

  async function handleSendSms(id: string) {
    setSendingId(id);
    try {
      await api.post(`/api/v1/debts/${id}/send-sms/`);
      toast.success('SMS yuborildi');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'SMS yuborishda xatolik');
    } finally {
      setSendingId(null);
    }
  }

  const totalPages = Math.ceil(count / PAGE_SIZE);

  return (
    <div className="space-y-5">
      <Toaster position="top-right" />
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Qarzdorlar</h1>
      </div>

      {/* Total debt alert */}
      {!loading && totalAmount > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-700">Jami qarz: {formatCurrency(totalAmount)}</p>
            <p className="text-xs text-red-500">{count} ta qarzdor</p>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Qidirish..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700">
          <option value="unpaid,overdue">Faol qarzlar</option>
          <option value="">Barchasi</option>
          <option value="unpaid">To'lanmagan</option>
          <option value="overdue">Muddati o'tgan</option>
          <option value="partial">Qisman</option>
          <option value="paid">To'langan</option>
        </select>
      </div>

      <div className="bg-white rounded border border-gray-200 shadow-sm overflow-hidden">
        {error ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500">
            <p className="mb-3 text-sm">Xatolik yuz berdi</p>
            <button onClick={fetchDebts} className="text-sm text-blue-600 underline">Qayta urinish</button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {['O\'quvchi', 'Telefon', 'Guruh', 'Summa', 'Muddati', 'Holat', 'Amallar'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading
                ? Array(6).fill(0).map((_, i) => (
                  <tr key={i}>{Array(7).fill(0).map((_, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                  ))}</tr>
                ))
                : debts.length === 0
                  ? <tr><td colSpan={7} className="px-4 py-16 text-center text-gray-400">Natija topilmadi</td></tr>
                  : debts.map((d) => (
                    <tr key={d.id} className={cn('hover:bg-gray-50 transition-colors', d.status === 'overdue' && 'bg-red-50/30')}>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {d.student.first_name} {d.student.last_name}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{d.student_phone}</td>
                      <td className="px-4 py-3 text-gray-600">{d.group_name || '—'}</td>
                      <td className="px-4 py-3 font-semibold text-red-600">{formatCurrency(d.amount)}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {new Date(d.due_date).toLocaleDateString('uz-UZ')}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex items-center px-2 py-0.5 text-xs font-medium border rounded', STATUS_STYLES[d.status])}>
                          {STATUS_LABELS[d.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {d.status !== 'paid' && (
                          <button onClick={() => handleSendSms(d.id)} disabled={sendingId === d.id}
                            className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50">
                            <MessageSquare className="w-3.5 h-3.5" />
                            {sendingId === d.id ? '...' : 'SMS yuborish'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        )}
      </div>

      {!loading && count > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>Sahifa {page} / {totalPages}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
              className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
              <ChevronLeft className="w-3.5 h-3.5" /> Oldingi
            </button>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
              Keyingi <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
