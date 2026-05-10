'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Search } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Pagination } from '@/components/pagination';
import api from '@/lib/axios';
import { cn, formatCurrency } from '@/lib/utils';
import { PaginatedResponse } from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Payment {
  id: string;
  student: string;
  student_name: string;
  group: string;
  course: string;
  course_name: string;
  amount: number;
  payment_type: 'cash' | 'card' | 'transfer';
  note: string;
  paid_at: string;
}

interface StudentResult {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
}

interface GroupMembership {
  id: string;           // GroupStudent id
  group: {
    id: string;
    display_name: string;
    course: { id: string; name: string; price?: number };
  };
}

const TYPE_STYLES: Record<string, string> = {
  cash:     'bg-green-50 text-green-700 border-green-200',
  card:     'bg-blue-50 text-blue-700 border-blue-200',
  transfer: 'bg-orange-50 text-orange-700 border-orange-200',
};
const TYPE_LABELS: Record<string, string> = {
  cash: 'Naqd', card: 'Karta', transfer: "O'tkazma",
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

  // ── Add modal state ─────────────────────────────────────────────────────────
  const [showAdd, setShowAdd] = useState(false);

  // Step 1: student search
  const [studentSearch, setStudentSearch] = useState('');
  const [studentResults, setStudentResults] = useState<StudentResult[]>([]);
  const [studentLoading, setStudentLoading] = useState(false);

  // Step 2: selected student → group list
  const [selectedStudent, setSelectedStudent] = useState<StudentResult | null>(null);
  const [memberships, setMemberships] = useState<GroupMembership[]>([]);
  const [membershipsLoading, setMembershipsLoading] = useState(false);
  const [selectedMembership, setSelectedMembership] = useState<GroupMembership | null>(null);

  // Step 3: payment form
  const [form, setForm] = useState({ amount: '', payment_type: 'cash', note: '' });
  const [saving, setSaving] = useState(false);

  // ── Fetch payments list ─────────────────────────────────────────────────────

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

  // ── Student autocomplete ────────────────────────────────────────────────────

  useEffect(() => {
    if (!studentSearch.trim()) { setStudentResults([]); return; }
    const t = setTimeout(async () => {
      setStudentLoading(true);
      try {
        const { data } = await api.get<PaginatedResponse<StudentResult>>(
          `/api/v1/students/?search=${encodeURIComponent(studentSearch)}&page_size=10`
        );
        setStudentResults(data.results ?? []);
      } catch {
        setStudentResults([]);
      } finally {
        setStudentLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [studentSearch]);

  // ── Load student's groups ───────────────────────────────────────────────────

  async function selectStudent(s: StudentResult) {
    setSelectedStudent(s);
    setStudentSearch('');
    setStudentResults([]);
    setSelectedMembership(null);
    setMembershipsLoading(true);
    try {
      // group detail da students array keladi — student ning guruhlarini olish
      const { data } = await api.get<PaginatedResponse<any>>(
        `/api/v1/groups/?student=${s.id}&status=active&page_size=50`
      );
      const groups = data.results ?? [];
      // GroupMembership formatiga o'tkazamiz
      const ms: GroupMembership[] = groups.map((g: any) => ({
        id: g.id,
        group: {
          id: g.id,
          display_name: g.display_name ?? g.name ?? `${g.number}${g.gender_type}`,
          course: {
            id: g.course?.id ?? g.course_id ?? '',
            name: g.course?.name ?? g.course_name ?? '',
            price: g.course?.price ?? null,
          },
        },
      }));
      setMemberships(ms);
    } catch {
      setMemberships([]);
      toast.error("Guruhlar yuklanmadi");
    } finally {
      setMembershipsLoading(false);
    }
  }

  function resetModal() {
    setSelectedStudent(null);
    setStudentSearch('');
    setStudentResults([]);
    setMemberships([]);
    setSelectedMembership(null);
    setForm({ amount: '', payment_type: 'cash', note: '' });
  }

  // ── Submit payment ──────────────────────────────────────────────────────────

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedStudent) { toast.error("O'quvchini tanlang"); return; }
    if (!selectedMembership) { toast.error("Guruhni tanlang"); return; }
    if (!form.amount || parseFloat(form.amount) <= 0) { toast.error("Summani kiriting"); return; }

    setSaving(true);
    try {
      await api.post('/api/v1/payments/', {
        student_id: selectedStudent.id,
        group_id: selectedMembership.group.id,
        course_id: selectedMembership.group.course.id,
        requested_amount: parseFloat(form.amount),
        payment_type: form.payment_type,
        note: form.note || '',
      });
      toast.success("To'lov qo'shildi");
      setShowAdd(false);
      resetModal();
      fetchPayments();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Xatolik yuz berdi');
    } finally {
      setSaving(false);
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      <Toaster position="top-right" />

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">To&apos;lovlar</h1>
        <button
          onClick={() => setShowAdd(true)}
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
            placeholder="Ism yoki guruh nomi..."
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
                      <td className="px-4 py-3 text-gray-600">{(p as any).group_display ?? '—'}</td>
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

      {/* Pagination */}
      {!loading && (
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          count={count}
          onPageChange={setPage}
          onPageSizeChange={() => {}}
        />
      )}

      {/* ══ Add Payment Modal ══ */}
      <Dialog open={showAdd} onOpenChange={(open) => { if (!open) resetModal(); setShowAdd(open); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Yangi to&apos;lov</DialogTitle>
          </DialogHeader>

          {/* Step 1 — O'quvchi tanlanmagan: student search + guruhlar jadvali */}
          {!selectedMembership ? (
            <div className="flex-1 overflow-hidden flex flex-col gap-3">

              {/* Student search */}
              {!selectedStudent ? (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    placeholder="Ism yoki telefon bo'yicha qidirish..."
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                </div>
              ) : (
                <div className="flex items-center justify-between px-3 py-2 bg-blue-50 border border-blue-200 rounded text-sm">
                  <span className="font-medium text-blue-800">{selectedStudent.first_name} {selectedStudent.last_name}</span>
                  <button
                    onClick={() => { setSelectedStudent(null); setMemberships([]); setSelectedMembership(null); }}
                    className="text-blue-400 hover:text-blue-600 text-xs"
                  >✕</button>
                </div>
              )}

              {/* Student results */}
              {!selectedStudent && studentResults.length > 0 && (
                <div className="border border-gray-200 rounded overflow-hidden">
                  {studentResults.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => selectStudent(s)}
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0"
                    >
                      <span className="font-medium text-gray-900">{s.first_name} {s.last_name}</span>
                      <span className="ml-2 text-gray-400">{s.phone}</span>
                    </button>
                  ))}
                </div>
              )}
              {!selectedStudent && studentLoading && (
                <p className="text-sm text-gray-400 text-center py-2">Qidirmoqda...</p>
              )}

              {/* Groups table */}
              {selectedStudent && (
                <div className="flex-1 overflow-hidden flex flex-col">
                  <p className="text-xs text-gray-500 mb-2">Guruhni tanlang:</p>
                  <div className="flex-1 overflow-y-auto border border-gray-200 rounded">
                    {membershipsLoading ? (
                      <div className="py-8 text-center text-sm text-gray-400">Yuklanmoqda...</div>
                    ) : memberships.length === 0 ? (
                      <div className="py-8 text-center text-sm text-gray-400">Faol guruh topilmadi</div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                          <tr>
                            {['#', 'Guruh', 'Kurs', 'Narx'].map((h) => (
                              <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {memberships.map((m, idx) => (
                            <tr
                              key={m.id}
                              onClick={() => setSelectedMembership(m)}
                              className="cursor-pointer hover:bg-blue-50 transition-colors"
                            >
                              <td className="px-4 py-3 text-gray-400">{idx + 1}</td>
                              <td className="px-4 py-3 font-medium text-gray-900">{m.group.display_name}</td>
                              <td className="px-4 py-3 text-gray-600">{m.group.course.name || '—'}</td>
                              <td className="px-4 py-3 text-gray-600">
                                {m.group.course.price ? formatCurrency(m.group.course.price) : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Step 2 — Guruh tanlandi: to'lov formasi */
            <form onSubmit={handleSave} className="space-y-4 mt-1">
              {/* Selected info */}
              <div className="flex gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
                  {selectedStudent?.first_name} {selectedStudent?.last_name}
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-100 border border-gray-200 rounded text-sm text-gray-700">
                  {selectedMembership.group.display_name} — {selectedMembership.group.course.name}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedMembership(null)}
                  className="text-xs text-gray-400 hover:text-gray-600 underline"
                >
                  O&apos;zgartirish
                </button>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Summa (so&apos;m)
                  {selectedMembership.group.course.price && (
                    <span className="ml-2 text-xs text-gray-400 font-normal">
                      Kurs narxi: {formatCurrency(selectedMembership.group.course.price)}
                    </span>
                  )}
                </label>
                <input
                  type="number"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder={selectedMembership.group.course.price ? String(selectedMembership.group.course.price) : '0'}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                  autoFocus
                />
              </div>

              {/* Payment type */}
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

              {/* Note */}
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
                  onClick={() => { setShowAdd(false); resetModal(); }}
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
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}