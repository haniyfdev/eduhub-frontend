'use client';

import { useEffect, useState, useCallback } from 'react';
import { Search, Send } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Pagination } from '@/components/pagination';
import api from '@/lib/axios';
import { cn, formatCurrency, formatDMY } from '@/lib/utils';
import { PaginatedResponse } from '@/types';

interface Payment {
  id: string;
  student_name: string;
  student_phone?: string;
  course_name: string;
  group_display?: string;
  amount: number;
  payment_type: 'cash' | 'card' | 'transfer';
  note: string;
  paid_at: string;
}

const TYPE_LABELS: Record<string, string> = {
  cash: 'Naqd', card: 'Karta', transfer: "O'tkazma",
};
const TYPE_STYLES: Record<string, string> = {
  cash:     'bg-green-50 text-green-700 border-green-200',
  card:     'bg-blue-50 text-blue-700 border-blue-200',
  transfer: 'bg-orange-50 text-orange-700 border-orange-200',
};

const PAGE_SIZE = 20;

export default function PaymentsPage() {
  const [payments, setPayments]     = useState<Payment[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(false);
  const [search, setSearch]         = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage]             = useState(1);
  const [count, setCount]           = useState(0);

  // SMS
  const [smsSelected, setSmsSelected]       = useState<Set<string>>(new Set());
  const [sendingSms, setSendingSms]         = useState(false);
  const [showSmsConfirm, setShowSmsConfirm] = useState(false);

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const params: Record<string, string | number> = { page, page_size: PAGE_SIZE };
      if (search)     params.search       = search;
      if (typeFilter) params.payment_type = typeFilter;
      const { data } = await api.get<PaginatedResponse<Payment>>('/api/v1/payments/', { params });
      setPayments(data.results ?? []);
      setCount(data.count ?? 0);
    } catch {
      setError(true);
      toast.error("Ma'lumotlarni yuklashda xatolik");
    } finally {
      setLoading(false);
    }
  }, [page, search, typeFilter]);

  useEffect(() => { fetchPayments(); }, [fetchPayments]);
  useEffect(() => { setPage(1); }, [search, typeFilter]);

  function toggleSms(id: string) {
    setSmsSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }

  async function handleSendSms() {
    setSendingSms(true);
    let success = 0;
    for (const id of Array.from(smsSelected)) {
      try {
        await api.post(`/api/v1/payments/${id}/send-sms/`);
        success++;
      } catch { /* skip */ }
    }
    toast.success(`${success} ta SMS yuborildi`);
    setSmsSelected(new Set());
    setSendingSms(false);
    setShowSmsConfirm(false);
  }

  return (
    <div className="space-y-5">
      <Toaster position="top-right" />

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">To&apos;lovlar</h1>
        {smsSelected.size > 0 && (
          <button
            onClick={() => setShowSmsConfirm(true)}
            disabled={sendingSms}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded hover:bg-indigo-700 transition-colors"
          >
            <Send className="w-4 h-4" />
            SMS yuborish ({smsSelected.size})
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Ism yoki guruh raqami..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700">
          <option value="">Barcha turlar</option>
          <option value="cash">Naqd</option>
          <option value="card">Karta</option>
          <option value="transfer">O&apos;tkazma</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded border border-gray-200 shadow-sm overflow-hidden">
        {error ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500">
            <p className="mb-3 text-sm">Xatolik yuz berdi</p>
            <button onClick={fetchPayments} className="text-sm text-blue-600 underline">Qayta urinish</button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {['№', '', "O'quvchi", 'Telefon', 'Kurs', 'Guruh', 'Summa', 'Turi', 'Sana'].map((h, i) => (
                  <th key={i} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading
                ? Array(6).fill(0).map((_, i) => (
                  <tr key={i}>{Array(9).fill(0).map((_, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                  ))}</tr>
                ))
                : payments.length === 0
                  ? <tr><td colSpan={9} className="px-4 py-16 text-center text-gray-400">Natija topilmadi</td></tr>
                  : payments.map((p, idx) => (
                    <tr key={p.id} className={cn('transition-colors', smsSelected.has(p.id) ? 'bg-indigo-50' : 'hover:bg-gray-50')}>
                      <td className="px-4 py-3 text-gray-400">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={smsSelected.has(p.id)}
                          onChange={() => toggleSms(p.id)}
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">{p.student_name}</td>
                      <td className="px-4 py-3 text-gray-500">{p.student_phone || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{p.course_name || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{p.group_display || '—'}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900">{formatCurrency(p.amount)}</td>
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex items-center px-2 py-0.5 text-xs font-medium border rounded', TYPE_STYLES[p.payment_type])}>
                          {TYPE_LABELS[p.payment_type]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{formatDMY(p.paid_at)}</td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        )}
      </div>

      <Pagination page={page} pageSize={PAGE_SIZE} count={count} onPageChange={setPage} onPageSizeChange={() => {}} />

      {/* ══ SMS Confirm ══ */}
      <Dialog open={showSmsConfirm} onOpenChange={setShowSmsConfirm}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>SMS yuborish</DialogTitle>
            <DialogDescription className="sr-only">SMS tasdiqlash</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-gray-600 mt-1">
            Tanlangan <span className="font-semibold">{smsSelected.size} ta</span> to&apos;lov egasiga SMS yuboriladi. Tasdiqlaysizmi?
          </p>
          <div className="flex gap-3 mt-4">
            <button onClick={() => setShowSmsConfirm(false)}
              className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50">
              Bekor
            </button>
            <button onClick={handleSendSms} disabled={sendingSms}
              className="flex-1 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded hover:bg-indigo-700 disabled:opacity-60 flex items-center justify-center gap-2">
              <Send className="w-4 h-4" />
              {sendingSms ? 'Yuborilmoqda...' : 'Yuborish'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
