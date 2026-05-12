'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from 'recharts';
import { Plus, X, TrendingUp, TrendingDown, DollarSign, Award, ChevronDown, ChevronUp, Check } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import api from '@/lib/axios';
import { cn, formatCurrency, formatDMY } from '@/lib/utils';
import { PaginatedResponse } from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PnLData {
  period: string;
  income: { total: number; breakdown: Array<{ course: string | null; amount: number }> };
  expenses: {
    total: number;
    breakdown: {
      rent: number; utility: number; tax: number; fine: number;
      discount: number; teacher_salary: number; staff_salary: number; other: number;
    };
  };
  profit: number;
  margin: string;
}

interface TeacherSalary {
  id: string; teacher_name: string; month: string;
  base_amount: number; kpi_amount: number; total_amount: number; paid_at: string | null;
}

interface Expense {
  id: string; category: string; source: string;
  amount: number; description: string; expense_date: string;
}

interface Award {
  id: string; title: string; description: string;
  student_name: string; issued_to: string; issued_at: string;
}

interface Student { id: string; first_name: string; last_name: string; }

const EXPENSE_LABELS: Record<string, string> = {
  rent: 'Ijara', utility: 'Kommunal', tax: 'Soliq', fine: 'Jarima',
  discount: 'Chegirma', teacher_salary: "O'qituvchi maoshi",
  staff_salary: 'Xodim maoshi', other: 'Boshqa',
};

const EXPENSE_COLORS: Record<string, string> = {
  rent: '#6366f1', utility: '#8b5cf6', tax: '#a855f7', fine: '#ec4899',
  discount: '#f59e0b', teacher_salary: '#10b981', staff_salary: '#3b82f6', other: '#6b7280',
};

const CHART_COLORS = ['#10b981', '#ef4444', '#3b82f6'];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const [data, setData]           = useState<PnLData | null>(null);
  const [loading, setLoading]     = useState(true);

  const [teacherSalaries, setTeacherSalaries] = useState<TeacherSalary[]>([]);
  const [expenses, setExpenses]               = useState<Expense[]>([]);
  const [awards, setAwards]                   = useState<Award[]>([]);
  const [students, setStudents]               = useState<Student[]>([]);
  const [loadingSub, setLoadingSub]           = useState(false);
  const [markingPaid, setMarkingPaid]         = useState<string | null>(null);

  // Expense modal
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [editExpense, setEditExpense]           = useState<Expense | null>(null);
  const [expenseForm, setExpenseForm]           = useState({
    category: 'rent', amount: '', description: '', expense_date: '',
  });
  const [savingExpense, setSavingExpense] = useState(false);

  // Award modal
  const [showAwardModal, setShowAwardModal] = useState(false);
  const [awardForm, setAwardForm]           = useState({
    title: '', description: '', issued_to: '', issued_at: '',
  });
  const [savingAward, setSavingAward]   = useState(false);
  const [deletingAward, setDeletingAward] = useState<string | null>(null);

  // Collapsible sections
  const [showTeachers, setShowTeachers] = useState(true);
  const [showExpenses, setShowExpenses] = useState(true);
  const [showAwards, setShowAwards]     = useState(true);

  // ── Fetch PnL ───────────────────────────────────────────────────────────────

  useEffect(() => {
    setLoading(true);
    api.get<PnLData>(`/api/v1/profit-loss/?month=${month}`)
      .then(({ data }) => setData(data))
      .catch(() => toast.error('Hisobotni yuklashda xatolik'))
      .finally(() => setLoading(false));
  }, [month]);

  // ── Fetch sub data ──────────────────────────────────────────────────────────

  const fetchSub = useCallback(async () => {
    setLoadingSub(true);
    try {
      const [t, e, a] = await Promise.allSettled([
        api.get<PaginatedResponse<TeacherSalary>>(`/api/v1/teacher-salaries/?month=${month}`),
        api.get<PaginatedResponse<Expense>>(`/api/v1/expenses/?month=${month}&source=manual`),
        api.get<PaginatedResponse<Award>>(`/api/v1/awards/`),
      ]);
      if (t.status === 'fulfilled') setTeacherSalaries(t.value.data.results ?? []);
      if (e.status === 'fulfilled') setExpenses(e.value.data.results ?? []);
      if (a.status === 'fulfilled') setAwards(a.value.data.results ?? []);
    } finally {
      setLoadingSub(false);
    }
  }, [month]);

  useEffect(() => { fetchSub(); }, [fetchSub]);

  useEffect(() => {
    api.get<PaginatedResponse<Student>>('/api/v1/students/?status=active&page_size=200')
      .then(({ data }) => setStudents(data.results ?? []))
      .catch(() => {});
  }, []);

  // ── Teacher salary mark paid ────────────────────────────────────────────────

  async function handleMarkPaid(id: string) {
    setMarkingPaid(id);
    try {
      const { data: updated } = await api.post<TeacherSalary>(`/api/v1/teacher-salaries/${id}/mark-paid/`);
      setTeacherSalaries((prev) => prev.map((s) => s.id === id ? updated : s));
      toast.success("Maosh to'langan deb belgilandi");
    } catch {
      toast.error('Xatolik yuz berdi');
    } finally {
      setMarkingPaid(null);
    }
  }

  // ── Expense CRUD ────────────────────────────────────────────────────────────

  function openAddExpense() {
    setEditExpense(null);
    const today = new Date().toISOString().slice(0, 10);
    setExpenseForm({ category: 'rent', amount: '', description: '', expense_date: today });
    setShowExpenseModal(true);
  }

  function openEditExpense(e: Expense) {
    setEditExpense(e);
    setExpenseForm({
      category: e.category,
      amount: String(e.amount),
      description: e.description,
      expense_date: e.expense_date,
    });
    setShowExpenseModal(true);
  }

  async function handleSaveExpense(ev: React.FormEvent) {
    ev.preventDefault();
    if (!expenseForm.amount || parseFloat(expenseForm.amount) <= 0) {
      toast.error('Summani kiriting'); return;
    }
    setSavingExpense(true);
    try {
      const body = {
        category:     expenseForm.category,
        amount:       parseFloat(expenseForm.amount),
        description:  expenseForm.description,
        expense_date: expenseForm.expense_date,
      };
      if (editExpense) {
        const { data: updated } = await api.patch<Expense>(`/api/v1/expenses/${editExpense.id}/`, body);
        setExpenses((prev) => prev.map((e) => e.id === editExpense.id ? updated : e));
        toast.success('Xarajat yangilandi');
      } else {
        const { data: created } = await api.post<Expense>('/api/v1/expenses/', body);
        setExpenses((prev) => [created, ...prev]);
        toast.success("Xarajat qo'shildi");
      }
      setShowExpenseModal(false);
      // Refresh PnL
      api.get<PnLData>(`/api/v1/profit-loss/?month=${month}`).then(({ data }) => setData(data)).catch(() => {});
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Xatolik yuz berdi');
    } finally {
      setSavingExpense(false);
    }
  }

  // ── Award CRUD ──────────────────────────────────────────────────────────────

  function openAddAward() {
    setAwardForm({ title: '', description: '', issued_to: '', issued_at: new Date().toISOString().slice(0, 10) });
    setShowAwardModal(true);
  }

  async function handleSaveAward(ev: React.FormEvent) {
    ev.preventDefault();
    if (!awardForm.title || !awardForm.issued_to) { toast.error("Maydonlarni to'ldiring"); return; }
    setSavingAward(true);
    try {
      const { data: created } = await api.post<Award>('/api/v1/awards/', {
        title:       awardForm.title,
        description: awardForm.description,
        issued_to:   awardForm.issued_to,
        issued_at:   awardForm.issued_at,
      });
      setAwards((prev) => [created, ...prev]);
      toast.success("Mukofot qo'shildi");
      setShowAwardModal(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Xatolik yuz berdi');
    } finally {
      setSavingAward(false);
    }
  }

  async function handleDeleteAward(id: string) {
    setDeletingAward(id);
    try {
      await api.delete(`/api/v1/awards/${id}/`);
      setAwards((prev) => prev.filter((a) => a.id !== id));
      toast.success("Mukofot o'chirildi");
    } catch {
      toast.error('Xatolik yuz berdi');
    } finally {
      setDeletingAward(null);
    }
  }

  // ── Chart data ──────────────────────────────────────────────────────────────

  const incomeTotal   = data?.income?.total   ?? 0;
  const expensesTotal = data?.expenses?.total ?? 0;
  const profit        = data?.profit          ?? 0;

  const chartData = [
    { name: 'Daromad', value: incomeTotal },
    { name: 'Xarajat', value: expensesTotal },
    { name: 'Foyda',   value: Math.abs(profit) },
  ];

  const breakdownData = data?.expenses?.breakdown
    ? Object.entries(data.expenses.breakdown)
        .map(([key, val]) => ({ key, name: EXPENSE_LABELS[key] ?? key, value: typeof val === 'number' ? val : 0 }))
        .filter((d) => d.value > 0)
    : [];

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 pb-10">
      <Toaster position="top-right" />

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Hisobotlar</h1>
          <p className="text-sm text-gray-500 mt-0.5">Daromad & Xarajat tahlili</p>
        </div>
        <input
          type="month" value={month} onChange={(e) => setMonth(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        />
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Daromad', value: incomeTotal, icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
          { label: 'Xarajat', value: expensesTotal, icon: TrendingDown, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
          { label: 'Sof foyda', value: profit, icon: DollarSign,
            color: profit >= 0 ? 'text-blue-600' : 'text-red-600',
            bg: profit >= 0 ? 'bg-blue-50' : 'bg-red-50',
            border: profit >= 0 ? 'border-blue-200' : 'border-red-200' },
        ].map(({ label, value, icon: Icon, color, bg, border }) => (
          <div key={label} className={cn('rounded-xl border p-5 flex items-center gap-4', bg, border)}>
            <div className={cn('p-2.5 rounded-lg bg-white shadow-sm', color)}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
              {loading
                ? <Skeleton className="h-7 w-32 mt-1" />
                : <p className={cn('text-xl font-bold mt-0.5', color)}>{formatCurrency(value)}</p>
              }
            </div>
          </div>
        ))}
      </div>

      {data?.margin && !loading && (
        <p className="text-sm text-gray-500">
          Foyda marjasi: <span className="font-semibold text-gray-800">{data.margin}</span>
        </p>
      )}

      {/* ── Charts ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Umumiy ko&apos;rsatkichlar</h2>
          {loading ? <Skeleton className="h-52 w-full" /> : (
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={chartData} barSize={48}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 12, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  // @ts-expect-error recharts
                  formatter={(v: number) => formatCurrency(v)}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {chartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Xarajatlar tafsiloti</h2>
          {loading ? (
            <div className="space-y-2">{Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : breakdownData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-gray-400">
              <p className="text-sm">Bu oy xarajat yo&apos;q</p>
            </div>
          ) : (
            <div className="space-y-3">
              {breakdownData.map(({ key, name, value }) => {
                const pct = expensesTotal > 0 ? (value / expensesTotal) * 100 : 0;
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-600 font-medium">{name}</span>
                      <span className="text-xs font-semibold text-gray-900">{formatCurrency(value)}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: EXPENSE_COLORS[key] ?? '#6b7280' }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Kurslar bo'yicha daromad ── */}
      {!loading && (data?.income?.breakdown?.length ?? 0) > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Kurslar bo&apos;yicha daromad</h2>
          <div className="space-y-2">
            {(data?.income?.breakdown ?? []).map((row, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-sm text-gray-600">{row.course ?? 'Nomsiz kurs'}</span>
                </div>
                <span className="text-sm font-semibold text-emerald-600">{formatCurrency(row.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── O'qituvchilar maoshi ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <button
          onClick={() => setShowTeachers((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-4 border-b border-gray-100 hover:bg-gray-50 transition-colors"
        >
          <h2 className="text-sm font-semibold text-gray-900">O&apos;qituvchilar maoshi</h2>
          {showTeachers ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>
        {showTeachers && (
          loadingSub ? (
            <div className="p-4 space-y-2">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : teacherSalaries.length === 0 ? (
            <p className="px-5 py-8 text-sm text-gray-400 text-center">Bu oy uchun ma&apos;lumot yo&apos;q</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {["O'qituvchi", 'Asosiy', 'KPI', 'Jami', 'Holat', ''].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {teacherSalaries.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{s.teacher_name}</td>
                    <td className="px-4 py-3 text-gray-600">{formatCurrency(s.base_amount)}</td>
                    <td className="px-4 py-3 text-gray-600">{formatCurrency(s.kpi_amount)}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900">{formatCurrency(s.total_amount)}</td>
                    <td className="px-4 py-3">
                      {s.paid_at ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">
                          <Check className="w-3 h-3" /> To&apos;langan
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-full">
                          Kutilmoqda
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {!s.paid_at && (
                        <button onClick={() => handleMarkPaid(s.id)} disabled={markingPaid === s.id}
                          className="text-xs text-blue-600 hover:underline disabled:opacity-50">
                          {markingPaid === s.id ? '...' : "To'langan deb belgilash"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>

      {/* ── Xarajatlar ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <button onClick={() => setShowExpenses((v) => !v)} className="flex items-center gap-2 hover:opacity-70 transition-opacity">
            <h2 className="text-sm font-semibold text-gray-900">Qo&apos;lda kiritilgan xarajatlar</h2>
            {showExpenses ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>
          <button onClick={openAddExpense}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Qo&apos;shish
          </button>
        </div>
        {showExpenses && (
          loadingSub ? (
            <div className="p-4 space-y-2">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : expenses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-gray-400">
              <p className="text-sm">Bu oy xarajat kiritilmagan</p>
              <button onClick={openAddExpense} className="mt-2 text-sm text-blue-600 hover:underline">+ Xarajat qo&apos;shish</button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['Kategoriya', 'Tavsif', 'Sana', 'Summa', ''].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {expenses.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
                        {EXPENSE_LABELS[e.category] ?? e.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{e.description || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{formatDMY(e.expense_date)}</td>
                    <td className="px-4 py-3 font-semibold text-red-600">−{formatCurrency(e.amount)}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => openEditExpense(e)} className="text-xs text-blue-600 hover:underline">
                        Tahrirlash
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>

      {/* ── Awards ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <button onClick={() => setShowAwards((v) => !v)} className="flex items-center gap-2 hover:opacity-70 transition-opacity">
            <Award className="w-4 h-4 text-amber-500" />
            <h2 className="text-sm font-semibold text-gray-900">Mukofotlar</h2>
            {showAwards ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>
          <button onClick={openAddAward}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white text-xs font-medium rounded-lg hover:bg-amber-600 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Mukofot berish
          </button>
        </div>
        {showAwards && (
          loadingSub ? (
            <div className="p-4 space-y-2">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : awards.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-gray-400">
              <Award className="w-8 h-8 mb-2 text-gray-300" />
              <p className="text-sm">Hali mukofot berilmagan</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['O\'quvchi', 'Mukofot', 'Tavsif', 'Sana', ''].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {awards.map((a) => (
                  <tr key={a.id} className="hover:bg-amber-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{a.student_name}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                        <Award className="w-3.5 h-3.5" /> {a.title}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{a.description || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{formatDMY(a.issued_at)}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => handleDeleteAward(a.id)} disabled={deletingAward === a.id}
                        className="text-xs text-red-500 hover:underline disabled:opacity-50">
                        {deletingAward === a.id ? '...' : "O'chirish"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>

      {/* ══ Expense Modal ══ */}
      <Dialog open={showExpenseModal} onOpenChange={(open) => { if (!open) setShowExpenseModal(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editExpense ? 'Xarajatni tahrirlash' : "Yangi xarajat qo'shish"}</DialogTitle>
            <DialogDescription className="sr-only">Xarajat shakli</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveExpense} className="space-y-4 mt-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kategoriya <span className="text-red-500">*</span></label>
              <select value={expenseForm.category} onChange={(e) => setExpenseForm((f) => ({ ...f, category: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {Object.entries(EXPENSE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Summa (so&apos;m) <span className="text-red-500">*</span></label>
              <input type="number" value={expenseForm.amount}
                onChange={(e) => setExpenseForm((f) => ({ ...f, amount: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0" required autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tavsif</label>
              <input type="text" value={expenseForm.description}
                onChange={(e) => setExpenseForm((f) => ({ ...f, description: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sana <span className="text-red-500">*</span></label>
              <input type="date" value={expenseForm.expense_date}
                onChange={(e) => setExpenseForm((f) => ({ ...f, expense_date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setShowExpenseModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50">
                Bekor qilish
              </button>
              <button type="submit" disabled={savingExpense}
                className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60">
                {savingExpense ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ══ Award Modal ══ */}
      <Dialog open={showAwardModal} onOpenChange={(open) => { if (!open) setShowAwardModal(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mukofot berish</DialogTitle>
            <DialogDescription className="sr-only">Mukofot shakli</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveAward} className="space-y-4 mt-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">O&apos;quvchi <span className="text-red-500">*</span></label>
              <select value={awardForm.issued_to} onChange={(e) => setAwardForm((f) => ({ ...f, issued_to: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required>
                <option value="">Tanlang</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mukofot nomi <span className="text-red-500">*</span></label>
              <input type="text" value={awardForm.title}
                onChange={(e) => setAwardForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Masalan: Oy o'quvchisi" required autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tavsif</label>
              <input type="text" value={awardForm.description}
                onChange={(e) => setAwardForm((f) => ({ ...f, description: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sana <span className="text-red-500">*</span></label>
              <input type="date" value={awardForm.issued_at}
                onChange={(e) => setAwardForm((f) => ({ ...f, issued_at: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setShowAwardModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50">
                Bekor qilish
              </button>
              <button type="submit" disabled={savingAward}
                className="flex-1 px-4 py-2 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600 disabled:opacity-60">
                {savingAward ? 'Saqlanmoqda...' : 'Berish'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}