'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import api from '@/lib/axios';
import { cn, formatCurrency } from '@/lib/utils';
import { PaginatedResponse } from '@/types';

interface Payment {
  id: string;
  student: { id: string; first_name: string; last_name: string };
  group?: { id: string; name: string };
  course?: { id: string; name: string };
  amount: number;
  payment_type: 'cash' | 'card' | 'transfer';
  note: string;
  created_at: string;
}

interface Student { id: string; first_name: string; last_name: string; phone: string; }
interface Group { id: string; name: string; course_id: string; }

const TYPE_STYLES: Record<string, string> = {
  cash: 'bg-green-50 text-green-700 border-green-200',
  card: 'bg-blue-50 text-blue-700 border-blue-200',
  transfer: 'bg-orange-50 text-orange-700 border-orange-200',
};
const TYPE_LABELS: Record<string, string> = {
  cash: 'Naqd', card: 'Karta', transfer: "O'tkazma",
};

const PAGE_SIZE = 20;

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);

  const [studentSearch, setStudentSearch] = useState('');
  const [studentResults, setStudentResults] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [form, setForm] = useState({ group_id: '', amount: '', payment_type: 'cash', note: '' });

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const params: Record<string, string | number> = { page };
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

  useEffect(() => {
    if (!studentSearch) { setStudentResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get<PaginatedResponse<Student>>(`/api/v1/students/?search=${studentSearch}`);
        setStudentResults((data.results ?? []).slice(0, 8));
      } catch {}
    }, 300);
    return () => clearTimeout(t);
  }, [studentSearch]);

  useEffect(() => {
    if (!selectedStudent) { setGroups([]); return; }
    api.get<PaginatedResponse<Group>>(`/api/v1/groups/?student=${selectedStudent.id}`)
      .then(({ data }) => setGroups(data.results ?? []))
      .catch(() => {});
  }, [selectedStudent]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedStudent) { toast.error("O'quvchini tanlang"); return; }
    if (!form.amount || parseFloat(form.amount) <= 0) { toast.error("Summa musbat bo'lishi kerak"); return; }
    setSaving(true);
    try {
      await api.post('/api/v1/payments/', {
        student_id: selectedStudent.id,
        ...(form.group_id ? { group_id: form.group_id } : {}),
        amount: parseFloat(form.amount),
        payment_type: form.payment_type,
        ...(form.note ? { note: form.note } : {}),
      });
      toast.success("To'lov muvaffaqiyatli qo'shildi");
      setShowAdd(false);
      setSelectedStudent(null);
      setStudentSearch('');
      setForm({ group_id: '', amount: '', payment_type: 'cash', note: '' });
      fetchPayments();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Xatolik yuz berdi');
    } finally {
      setSaving(false);
    }
  }

  const totalPages = Math.ceil(count / PAGE_SIZE);

  return (
    <div className="space-y-5">
      <Toaster position="top-right" />
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">To'lovlar</h1>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> Qo'shish
        </button>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Qidirish..."
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
          <option value="transfer">O'tkazma</option>
        </select>
      </div>

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
                {["O'quvchi", 'Kurs', 'Guruh', 'Summa', 'Turi', 'Sana'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading
                ? Array(6).fill(0).map((_, i) => (
                  <tr key={i}>{Array(6).fill(0).map((_, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                  ))}</tr>
                ))
                : payments.length === 0
                  ? <tr><td colSpan={6} className="px-4 py-16 text-center text-gray-400">Natija topilmadi</td></tr>
                  : payments.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {p.student?.first_name} {p.student?.last_name}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{p.course?.name || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{p.group?.name || '—'}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{formatCurrency(p.amount)}</td>
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex items-center px-2 py-0.5 text-xs font-medium border rounded', TYPE_STYLES[p.payment_type])}>
                          {TYPE_LABELS[p.payment_type]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {new Date(p.created_at).toLocaleDateString('uz-UZ')}
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

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Yangi to'lov</DialogTitle></DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4 mt-2">
            {/* Student autocomplete */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">O'quvchi</label>
              {selectedStudent ? (
                <div className="flex items-center justify-between px-3 py-2 border border-blue-300 bg-blue-50 rounded text-sm">
                  <span className="font-medium text-blue-800">{selectedStudent.first_name} {selectedStudent.last_name}</span>
                  <button
                    type="button"
                    onClick={() => { setSelectedStudent(null); setStudentSearch(''); }}
                    className="text-blue-500 hover:text-blue-700 text-xs"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    type="text"
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    placeholder="Ism yoki telefon bo'yicha qidirish..."
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {studentResults.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded shadow-md max-h-48 overflow-y-auto">
                      {studentResults.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => { setSelectedStudent(s); setStudentSearch(''); setStudentResults([]); }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                        >
                          {s.first_name} {s.last_name} — {s.phone}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {groups.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Guruh</label>
                <select
                  value={form.group_id}
                  onChange={(e) => setForm((f) => ({ ...f, group_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Tanlang (ixtiyoriy)</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Summa (so'm)</label>
              <input
                type="number"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
                placeholder="0"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">To'lov turi</label>
              <select
                value={form.payment_type}
                onChange={(e) => setForm((f) => ({ ...f, payment_type: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="cash">Naqd</option>
                <option value="card">Karta</option>
                <option value="transfer">O'tkazma</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Izoh (ixtiyoriy)</label>
              <input
                type="text"
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <p className="text-xs text-gray-400">* To'lovlar o'chirilmaydi va tahrirlanmaydi</p>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowAdd(false)}
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
