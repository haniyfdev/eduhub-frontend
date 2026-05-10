'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Plus, Search } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Pagination } from '@/components/pagination';
import api from '@/lib/axios';
import { cn, formatCurrency, formatDMY } from '@/lib/utils';
import { PaginatedResponse } from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Payment {
  id: string;
  student_name: string;
  course_name: string;
  group_display?: string;
  amount: number;
  payment_type: 'cash' | 'card' | 'transfer';
  note: string;
  paid_at: string;
}

interface StudentRow {
  id: string;
  first_name: string;
  last_name: string;
  birth_date?: string | null;
  course_name?: string;
  course_id?: string;
  course_price?: number | null;
  group_id?: string;
  group_display?: string;
  // from groups API
  number?: number;
  gender_type?: string;
  course?: { id: string; name: string; price?: number | null };
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(0);

  // ── Modal step 1: student+group table ──────────────────────────────────────
  const [showStep1, setShowStep1] = useState(false);
  const [tableSearch, setTableSearch] = useState('');
  const [tableRows, setTableRows] = useState<StudentRow[]>([]);
  const [tableLoading, setTableLoading] = useState(false);
  const tableSearchRef = useRef<HTMLInputElement>(null);

  // ── Modal step 2: payment form ─────────────────────────────────────────────
  const [showStep2, setShowStep2] = useState(false);
  const [selectedRow, setSelectedRow] = useState<StudentRow | null>(null);
  const [form, setForm] = useState({ amount: '', payment_type: 'cash', note: '' });
  const [saving, setSaving] = useState(false);

  // ── Fetch payments ─────────────────────────────────────────────────────────

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const params: Record<string, string | number> = { page, page_size: PAGE_SIZE };
      if (search) params.search = search;
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

  // ── Step 1: load students with their active groups ─────────────────────────
  // We fetch students and match them with group memberships
  // API: /api/v1/students/ with search, returns student list
  // Then for each student we show their active group info

  const fetchTable = useCallback(async (q: string) => {
    setTableLoading(true);
    try {
      const params: Record<string, string | number> = { page_size: 50, status: 'active' };
      if (q.trim()) {
        // number search → group filter, else student name search
        params.search = q.trim();
      }
      const { data } = await api.get<PaginatedResponse<any>>('/api/v1/students/', { params });
      const rows: StudentRow[] = (data.results ?? []).map((s: any) => ({
        id: s.id,
        first_name: s.first_name,
        last_name: s.last_name,
        birth_date: s.birth_date ?? null,
        course_name: s.course_name ?? '—',
        course_id: s.course_id ?? '',
        course_price: s.course_price ?? null,
        group_id: s.current_group_id ?? '',
        group_display: s.current_group ?? s.group_name ?? '—',
      }));
      setTableRows(rows);
    } catch {
      setTableRows([]);
    } finally {
      setTableLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!showStep1) return;
    const t = setTimeout(() => fetchTable(tableSearch), 300);
    return () => clearTimeout(t);
  }, [tableSearch, showStep1, fetchTable]);

  function openStep1() {
    setTableSearch('');
    setTableRows([]);
    setShowStep1(true);
    setTimeout(() => tableSearchRef.current?.focus(), 100);
    fetchTable('');
  }

  function selectRow(row: StudentRow) {
    setSelectedRow(row);
    setForm({ amount: row.course_price ? String(row.course_price) : '', payment_type: 'cash', note: '' });
    setShowStep1(false);
    setShowStep2(true);
  }

  // ── Step 2: save payment ───────────────────────────────────────────────────

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedRow) return;
    if (!form.amount || parseFloat(form.amount) <= 0) { toast.error("Summani kiriting"); return; }
    if (!selectedRow.group_id) { toast.error("O'quvchining faol guruhi topilmadi"); return; }
    if (!selectedRow.course_id) { toast.error("Kurs topilmadi"); return; }

    setSaving(true);
    try {
      await api.post('/api/v1/payments/', {
        student_id: selectedRow.id,
        group_id: selectedRow.group_id,
        course_id: selectedRow.course_id,
        requested_amount: parseFloat(form.amount),
        payment_type: form.payment_type,
        note: form.note || '',
      });
      toast.success("To'lov qo'shildi");
      setShowStep2(false);
      setSelectedRow(null);
      fetchPayments();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Xatolik yuz berdi');
    } finally {
      setSaving(false);
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      <Toaster position="top-right" />

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">To&apos;lovlar</h1>
        <button
          onClick={openStep1}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> Qo&apos;shish
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ism, guruh raqami yoki harfi..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700"
        >
          <option value="">Barcha turlar</option>
          <option value="cash">Naqd</option>
          <option value="card">Karta</option>
          <option value="transfer">O&apos;tkazma</option>
        </select>
      </div>

      {/* Payments table */}
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
                {['#', "O'quvchi", 'Kurs', 'Guruh', 'Summa', 'Turi', 'Sana'].map((h) => (
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
                : payments.length === 0
                  ? <tr><td colSpan={7} className="px-4 py-16 text-center text-gray-400">Natija topilmadi</td></tr>
                  : payments.map((p, idx) => (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-400">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{p.student_name}</td>
                      <td className="px-4 py-3 text-gray-600">{p.course_name || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{p.group_display || '—'}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900">{formatCurrency(p.amount)}</td>
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex items-center px-2 py-0.5 text-xs font-medium border rounded', TYPE_STYLES[p.payment_type])}>
                          {TYPE_LABELS[p.payment_type]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {new Date(p.paid_at).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        )}
      </div>

      <Pagination page={page} pageSize={PAGE_SIZE} count={count} onPageChange={setPage} onPageSizeChange={() => {}} />

      {/* ══ Step 1: O'quvchi tanlash ══ */}
      <Dialog open={showStep1} onOpenChange={(open) => { if (!open) setShowStep1(false); }}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>To&apos;lov — O&apos;quvchi tanlash</DialogTitle>
          </DialogHeader>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              ref={tableSearchRef}
              type="text"
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              placeholder="Ism, familiya, guruh raqami yoki harfi..."
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Table */}
          <div className="flex-1 overflow-y-auto border border-gray-200 rounded">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                <tr>
                  {['#', 'Ism', "Tug'ilgan sana", 'Kurs', 'Kurs narxi', 'Guruh'].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tableLoading
                  ? Array(6).fill(0).map((_, i) => (
                    <tr key={i}>{Array(6).fill(0).map((_, j) => (
                      <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                    ))}</tr>
                  ))
                  : tableRows.length === 0
                    ? <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">Natija topilmadi</td></tr>
                    : tableRows.map((row, idx) => (
                      <tr
                        key={row.id}
                        onClick={() => selectRow(row)}
                        className="cursor-pointer hover:bg-blue-50 transition-colors"
                      >
                        <td className="px-4 py-3 text-gray-400">{idx + 1}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{row.first_name} {row.last_name}</td>
                        <td className="px-4 py-3 text-gray-600">{formatDMY(row.birth_date) || '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{row.course_name || '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{row.course_price ? formatCurrency(row.course_price) : '—'}</td>
                        <td className="px-4 py-3 font-medium text-gray-700">{row.group_display || '—'}</td>
                      </tr>
                    ))
                }
              </tbody>
            </table>
          </div>

          <div className="pt-2 border-t border-gray-100">
            <button
              onClick={() => setShowStep1(false)}
              className="w-full px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50"
            >
              Bekor qilish
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══ Step 2: To'lov formasi ══ */}
      <Dialog open={showStep2} onOpenChange={(open) => { if (!open) { setShowStep2(false); setSelectedRow(null); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>To&apos;lov ma&apos;lumotlari</DialogTitle>
          </DialogHeader>

          {selectedRow && (
            <div className="flex flex-wrap gap-1.5 mb-1">
              <span className="inline-flex items-center px-2.5 py-1 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800 font-medium">
                {selectedRow.first_name} {selectedRow.last_name}
              </span>
              {selectedRow.group_display && selectedRow.group_display !== '—' && (
                <span className="inline-flex items-center px-2.5 py-1 bg-gray-100 border border-gray-200 rounded text-sm text-gray-600">
                  {selectedRow.group_display}
                </span>
              )}
              {selectedRow.course_name && selectedRow.course_name !== '—' && (
                <span className="inline-flex items-center px-2.5 py-1 bg-gray-100 border border-gray-200 rounded text-sm text-gray-600">
                  {selectedRow.course_name}
                </span>
              )}
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-4 mt-1">
            {/* Summa */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Summa (so&apos;m)
                {selectedRow?.course_price && (
                  <span className="ml-2 text-xs text-gray-400 font-normal">
                    Kurs narxi: {formatCurrency(selectedRow.course_price)}
                  </span>
                )}
              </label>
              <input
                type="number"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
                autoFocus
                placeholder="0"
              />
            </div>

            {/* To'lov turi */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">To&apos;lov turi</label>
              <div className="flex gap-2">
                {(['cash', 'card', 'transfer'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, payment_type: t }))}
                    className={cn(
                      'flex-1 py-2 text-sm font-medium rounded border transition-colors',
                      form.payment_type === t
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'border-gray-300 text-gray-600 hover:bg-gray-50',
                    )}
                  >
                    {TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>

            {/* Izoh */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Izoh (ixtiyoriy)</label>
              <input
                type="text"
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="..."
              />
            </div>

            <p className="text-xs text-gray-400">* To&apos;lovlar o&apos;chirilmaydi va tahrirlanmaydi</p>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => { setShowStep2(false); setSelectedRow(null); }}
                className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50"
              >
                Bekor qilish
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-60"
              >
                {saving ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}