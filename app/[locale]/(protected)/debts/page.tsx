'use client';

import { useEffect, useState, useCallback } from 'react';
import { Search, AlertCircle, Send } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Pagination } from '@/components/pagination';
import api from '@/lib/axios';
import { cn, formatCurrency, formatPhone } from '@/lib/utils';
import { PaginatedResponse } from '@/types';

interface Debt {
  id: string;
  student: string;
  student_name: string;
  student_phone: string;
  student_second_phone: string;
  group_name: string | null;
  amount: number;
  due_date: string;
  status: 'unpaid' | 'partial' | 'overdue' | 'paid';
}

function rowBg(status: Debt['status']): string {
  switch (status) {
    case 'overdue':  return 'bg-red-100';
    case 'unpaid':   return 'bg-yellow-100';
    case 'partial':  return 'bg-yellow-50';
    default:         return '';
  }
}

const STATUS_LABELS: Record<string, string> = {
  unpaid: "To'lanmagan",
  partial: 'Qisman',
  overdue: "Muddati o'tgan",
  paid: "To'langan",
};

const STATUS_BADGE: Record<string, string> = {
  unpaid:  'bg-yellow-100 text-yellow-800 border-yellow-300',
  partial: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  overdue: 'bg-red-100 text-red-700 border-red-300',
  paid:    'bg-green-50 text-green-700 border-green-200',
};

const PAGE_SIZE = 20;

// phone selections per debt: { [debtId]: { phone1: bool, phone2: bool } }
type PhoneSelection = Record<string, { phone1: boolean; phone2: boolean }>;

export default function DebtsPage() {
  const [debts, setDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('unpaid,overdue');
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);

  // Per-row phone checkboxes
  const [phoneSelection, setPhoneSelection] = useState<PhoneSelection>({});

  // Bulk SMS confirm modal
  const [showConfirm, setShowConfirm] = useState(false);
  const [sending, setSending] = useState(false);

  const fetchDebts = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const params: Record<string, string | number> = { page, page_size: PAGE_SIZE };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const { data } = await api.get<PaginatedResponse<Debt> & { total_amount?: number }>(
        '/api/v1/debts/', { params }
      );
      setDebts(data.results);
      setCount(data.count);
      setTotalAmount(data.total_amount ?? data.results.reduce((s, d) => s + d.amount, 0));
      // Init phone selections — default: phone1 checked
      const init: PhoneSelection = {};
      data.results.forEach((d) => {
        init[d.id] = { phone1: false, phone2: false };
      });
      setPhoneSelection(init);
    } catch {
      setError(true);
      toast.error("Ma'lumotlarni yuklashda xatolik");
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => { fetchDebts(); }, [fetchDebts]);
  useEffect(() => { setPage(1); }, [search, statusFilter]);

  function togglePhone(debtId: string, key: 'phone1' | 'phone2') {
    setPhoneSelection((prev) => ({
      ...prev,
      [debtId]: { ...prev[debtId], [key]: !prev[debtId]?.[key] },
    }));
  }

  // Yuborish uchun tanlangan raqamlar soni
  const selectedCount = debts.reduce((acc, d) => {
    if (d.status === 'paid') return acc;
    const sel = phoneSelection[d.id];
    if (sel?.phone1 && d.student_phone) acc++;
    if (sel?.phone2 && d.student_second_phone) acc++;
    return acc;
  }, 0);

  async function handleSend() {
    setSending(true);
    let success = 0;
    for (const d of debts) {
      if (d.status === 'paid') continue;
      const sel = phoneSelection[d.id];
      const phones: string[] = [];
      if (sel?.phone1 && d.student_phone) phones.push(d.student_phone);
      if (sel?.phone2 && d.student_second_phone) phones.push(d.student_second_phone);
      for (const phone of phones) {
        try {
          await api.post(`/api/v1/debts/${d.id}/send-sms/`, { phone });
          success++;
        } catch { /* skip */ }
      }
    }
    toast.success(`${success} ta SMS yuborildi`);
    setShowConfirm(false);
    setSending(false);
  }

  return (
    <div className="space-y-5">
      <Toaster position="top-right" />

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Qarzdorlar</h1>
        {selectedCount > 0 && (
          <button
            onClick={() => setShowConfirm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors"
          >
            <Send className="w-4 h-4" />
            SMS yuborish ({selectedCount})
          </button>
        )}
      </div>

      {/* Total alert */}
      {!loading && totalAmount > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-700">Jami qarz: {formatCurrency(totalAmount)}</p>
            <p className="text-xs text-red-500">{count} ta qarzdor</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ism yoki guruh..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700"
        >
          <option value="unpaid,overdue">Faol qarzlar</option>
          <option value="">Barchasi</option>
          <option value="unpaid">To&apos;lanmagan</option>
          <option value="overdue">Muddati o&apos;tgan</option>
          <option value="partial">Qisman</option>
          <option value="paid">To&apos;langan</option>
        </select>
      </div>

      {/* Table */}
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
                {['#', "O'quvchi", 'Guruh', 'Telefon', 'Ota-ona tel', 'Summa', 'Muddati', 'Holat'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading
                ? Array(8).fill(0).map((_, i) => (
                  <tr key={i}>{Array(8).fill(0).map((_, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                  ))}</tr>
                ))
                : debts.length === 0
                  ? <tr><td colSpan={8} className="px-4 py-16 text-center text-gray-400">Natija topilmadi</td></tr>
                  : debts.map((d, idx) => {
                    const sel = phoneSelection[d.id] ?? { phone1: true, phone2: false };
                    const canSms = d.status !== 'paid';
                    return (
                      <tr key={d.id} className={cn('transition-colors hover:brightness-95', rowBg(d.status))}>
                        <td className="px-4 py-3 text-gray-500">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{d.student_name}</td>
                        <td className="px-4 py-3 text-gray-600">{d.group_name || '—'}</td>

                        {/* Telefon + checkbox */}
                        <td className="px-4 py-3">
                          <label className={cn('flex items-center gap-2 cursor-pointer select-none', !canSms && 'cursor-default')}>
                            {canSms && (
                              <input
                                type="checkbox"
                                checked={sel.phone1}
                                onChange={() => togglePhone(d.id, 'phone1')}
                                className="rounded border-gray-300 flex-shrink-0"
                              />
                            )}
                            <span className="text-gray-600">{formatPhone(d.student_phone) || '—'}</span>
                          </label>
                        </td>

                        {/* Ota-ona tel + checkbox */}
                        <td className="px-4 py-3">
                          {d.student_second_phone ? (
                            <label className={cn('flex items-center gap-2 cursor-pointer select-none', !canSms && 'cursor-default')}>
                              {canSms && (
                                <input
                                  type="checkbox"
                                  checked={sel.phone2}
                                  onChange={() => togglePhone(d.id, 'phone2')}
                                  className="rounded border-gray-300 flex-shrink-0"
                                />
                              )}
                              <span className="text-gray-600">{formatPhone(d.student_second_phone)}</span>
                            </label>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>

                        <td className="px-4 py-3 font-semibold text-red-600">{formatCurrency(d.amount)}</td>
                        <td className="px-4 py-3 text-gray-600">
                          {new Date(d.due_date).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn('inline-flex items-center px-2 py-0.5 text-xs font-medium border rounded', STATUS_BADGE[d.status])}>
                            {STATUS_LABELS[d.status]}
                          </span>
                        </td>
                      </tr>
                    );
                  })
              }
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {!loading && count > PAGE_SIZE && (
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          count={count}
          onPageChange={setPage}
          onPageSizeChange={() => {}}
        />
      )}

      {/* Confirm SMS dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>SMS yuborish</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 mt-1">
            Tanlangan <span className="font-semibold">{selectedCount} ta</span> raqamga SMS yuboriladi. Tasdiqlaysizmi?
          </p>
          <div className="flex gap-3 mt-4">
            <button
              onClick={() => setShowConfirm(false)}
              className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50"
            >
              Bekor
            </button>
            <button
              onClick={handleSend}
              disabled={sending}
              className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" />
              {sending ? 'Yuborilmoqda...' : 'Yuborish'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}