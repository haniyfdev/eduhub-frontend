'use client';

import { useEffect, useState, useCallback } from 'react';
import { Search, MessageSquare, AlertCircle, Send } from 'lucide-react';
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

// ─── Row background ───────────────────────────────────────────────────────────
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

export default function DebtsPage() {
  const [debts, setDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('unpaid,overdue');
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);

  // Bulk SMS
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showSmsModal, setShowSmsModal] = useState(false);
  const [smsTarget, setSmsTarget] = useState<Debt | null>(null); // single
  const [sendingBulk, setSendingBulk] = useState(false);

  // SMS phone selection per debt
  const [smsPhones, setSmsPhones] = useState<Record<string, { phone1: boolean; phone2: boolean }>>({});

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
    } catch {
      setError(true);
      toast.error("Ma'lumotlarni yuklashda xatolik");
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => { fetchDebts(); }, [fetchDebts]);
  useEffect(() => { setPage(1); }, [search, statusFilter]);

  // ── Select ──────────────────────────────────────────────────────────────────

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }

  function toggleAll() {
    if (selectedIds.size === debts.filter(d => d.status !== 'paid').length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(debts.filter(d => d.status !== 'paid').map(d => d.id)));
    }
  }

  // ── Open bulk SMS modal ─────────────────────────────────────────────────────

  function openBulkSms() {
    // Init phone selections
    const init: Record<string, { phone1: boolean; phone2: boolean }> = {};
    debts.filter(d => selectedIds.has(d.id)).forEach(d => {
      init[d.id] = { phone1: true, phone2: false };
    });
    setSmsPhones(init);
    setSmsTarget(null);
    setShowSmsModal(true);
  }

  function openSingleSms(debt: Debt) {
    setSmsPhones({ [debt.id]: { phone1: true, phone2: false } });
    setSmsTarget(debt);
    setShowSmsModal(true);
  }

  // ── Send SMS ────────────────────────────────────────────────────────────────

  async function handleSendSms() {
    setSendingBulk(true);
    const targets = smsTarget ? [smsTarget] : debts.filter(d => selectedIds.has(d.id));
    let success = 0;

    for (const debt of targets) {
      const phones = smsPhones[debt.id] ?? { phone1: true, phone2: false };
      const toSend: string[] = [];
      if (phones.phone1 && debt.student_phone) toSend.push(debt.student_phone);
      if (phones.phone2 && debt.student_second_phone) toSend.push(debt.student_second_phone);

      for (const phone of toSend) {
        try {
          await api.post(`/api/v1/debts/${debt.id}/send-sms/`, { phone });
          success++;
        } catch { /* skip */ }
      }
    }

    toast.success(`${success} ta SMS yuborildi`);
    setShowSmsModal(false);
    setSelectedIds(new Set());
    setSendingBulk(false);
  }

  const selectedDebts = debts.filter(d => selectedIds.has(d.id));
  const allSelected = debts.filter(d => d.status !== 'paid').length > 0 &&
    selectedIds.size === debts.filter(d => d.status !== 'paid').length;

  return (
    <div className="space-y-5">
      <Toaster position="top-right" />

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Qarzdorlar</h1>
        {selectedIds.size > 0 && (
          <button
            onClick={openBulkSms}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors"
          >
            <Send className="w-4 h-4" />
            SMS yuborish ({selectedIds.size})
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
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="rounded border-gray-300"
                  />
                </th>
                {["O'quvchi", 'Telefon', 'Ota-ona tel', 'Guruh', 'Summa', 'Muddati', 'Holat', 'Amallar'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading
                ? Array(8).fill(0).map((_, i) => (
                  <tr key={i}>{Array(9).fill(0).map((_, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                  ))}</tr>
                ))
                : debts.length === 0
                  ? <tr><td colSpan={9} className="px-4 py-16 text-center text-gray-400">Natija topilmadi</td></tr>
                  : debts.map((d) => (
                    <tr key={d.id} className={cn('transition-colors hover:brightness-95', rowBg(d.status))}>
                      <td className="px-4 py-3">
                        {d.status !== 'paid' && (
                          <input
                            type="checkbox"
                            checked={selectedIds.has(d.id)}
                            onChange={() => toggleSelect(d.id)}
                            className="rounded border-gray-300"
                          />
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">{d.student_name}</td>
                      <td className="px-4 py-3 text-gray-600">{formatPhone(d.student_phone) || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{d.student_second_phone ? formatPhone(d.student_second_phone) : '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{d.group_name || '—'}</td>
                      <td className="px-4 py-3 font-semibold text-red-600">{formatCurrency(d.amount)}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {new Date(d.due_date).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex items-center px-2 py-0.5 text-xs font-medium border rounded', STATUS_BADGE[d.status])}>
                          {STATUS_LABELS[d.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {d.status !== 'paid' && (
                          <button
                            onClick={() => openSingleSms(d)}
                            className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            SMS
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

      {/* SMS Modal */}
      <Dialog open={showSmsModal} onOpenChange={(open) => { if (!open) setShowSmsModal(false); }}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>SMS yuborish</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto divide-y divide-gray-100 border border-gray-200 rounded mt-2">
            {(smsTarget ? [smsTarget] : selectedDebts).map((d) => {
              const phones = smsPhones[d.id] ?? { phone1: true, phone2: false };
              return (
                <div key={d.id} className="px-4 py-3 space-y-2">
                  <p className="font-medium text-gray-900 text-sm">{d.student_name}
                    <span className="ml-2 text-xs text-gray-400 font-normal">{d.group_name || ''}</span>
                  </p>
                  <div className="flex gap-4 flex-wrap">
                    {/* Phone 1 */}
                    {d.student_phone && (
                      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={phones.phone1}
                          onChange={(e) => setSmsPhones((prev) => ({
                            ...prev,
                            [d.id]: { ...prev[d.id], phone1: e.target.checked },
                          }))}
                          className="rounded border-gray-300"
                        />
                        {formatPhone(d.student_phone)}
                        <span className="text-xs text-gray-400">(o&apos;zi)</span>
                      </label>
                    )}
                    {/* Phone 2 */}
                    {d.student_second_phone && (
                      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={phones.phone2}
                          onChange={(e) => setSmsPhones((prev) => ({
                            ...prev,
                            [d.id]: { ...prev[d.id], phone2: e.target.checked },
                          }))}
                          className="rounded border-gray-300"
                        />
                        {formatPhone(d.student_second_phone)}
                        <span className="text-xs text-gray-400">(ota-ona)</span>
                      </label>
                    )}
                    {!d.student_second_phone && (
                      <span className="text-xs text-gray-400 italic">Ota-ona raqami yo&apos;q</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex gap-3 pt-3 border-t border-gray-100">
            <button
              onClick={() => setShowSmsModal(false)}
              className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50"
            >
              Bekor qilish
            </button>
            <button
              onClick={handleSendSms}
              disabled={sendingBulk}
              className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" />
              {sendingBulk ? 'Yuborilmoqda...' : 'Yuborish'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}