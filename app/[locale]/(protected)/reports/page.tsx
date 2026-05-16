'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  TrendingUp, TrendingDown, DollarSign, AlertTriangle,
  Plus, Check, ChevronDown, ChevronUp, UserMinus,
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import api from '@/lib/axios';
import { cn, formatCurrency } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PnLData {
  income: number;
  expenses: number;
  net_profit: number;
  expense_breakdown: Record<string, number>;
}
interface HistoryItem { period: string; income: number; expenses: number; profit: number; }
interface CourseIncome { course: string; amount: number; }
interface DebtForecast {
  total: number;
  breakdown: { unpaid: number; overdue: number; partial: number };
  count: { unpaid: number; overdue: number; partial: number };
}
interface ConversionStats { pending: number; trial: number; ignored: number; }
interface TeacherSalary {
  id: string; teacher_name: string;
  base_amount: number; kpi_amount: number; total_amount: number; paid_at: string | null;
}
interface ManualExpense {
  id: string; category: string; amount: number; description: string; expense_date: string;
}
interface ArchivedStudent {
  id: string; first_name: string; last_name: string; course_name: string | null; archived_at: string | null;
}
interface GroupData {
  id: string; name: string; room: string; schedule: string | null;
  start_time: string | null; end_time: string | null;
  course: { name: string } | null;
  teacher: { first_name: string; last_name: string } | null;
  status: string; students_count: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EXPENSE_LABELS: Record<string, string> = {
  rent: 'Ijara', utility: 'Kommunal', tax: 'Soliq', fine: 'Jarima',
  discount: 'Chegirma', teacher_salary: "O'q. maoshi", staff_salary: 'Xodim maoshi', other: 'Boshqa',
};
const MANUAL_CATEGORIES = ['rent', 'utility', 'tax', 'fine', 'staff_salary', 'other'];
const PIE_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4'];
const MONTH_LABELS = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function todayStr() { return new Date().toISOString().slice(0, 10); }
function shortMonth(period: string) {
  const [, m] = period.split('-');
  return MONTH_LABELS[parseInt(m, 10) - 1] ?? period;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [month, setMonth] = useState(currentMonth);
  const [loading, setLoading] = useState(true);

  const [pnl, setPnl] = useState<PnLData | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [courseIncome, setCourseIncome] = useState<CourseIncome[]>([]);
  const [debt, setDebt] = useState<DebtForecast | null>(null);
  const [conversion, setConversion] = useState<ConversionStats | null>(null);
  const [teacherSalaries, setTeacherSalaries] = useState<TeacherSalary[]>([]);
  const [manualExpenses, setManualExpenses] = useState<ManualExpense[]>([]);
  const [churn, setChurn] = useState<ArchivedStudent[]>([]);
  const [rooms, setRooms] = useState<GroupData[]>([]);

  const [showTeachers, setShowTeachers] = useState(true);
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ManualExpense | null>(null);
  const [expenseForm, setExpenseForm] = useState({
    category: 'rent', amount: '', description: '', expense_date: todayStr(),
  });
  const [savingExpense, setSavingExpense] = useState(false);

  // ── Data Fetching ────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    const results = await Promise.allSettled([
      api.get(`/api/v1/profit-loss/?month=${month}`),
      api.get(`/api/v1/profit-loss/history/?months=6`),
      api.get(`/api/v1/profit-loss/income-by-course/?month=${month}`),
      api.get(`/api/v1/profit-loss/debt-forecast/`),
      api.get(`/api/v1/leads/conversion-stats/`),
      api.get(`/api/v1/teacher-salaries/?month=${month}`),
      api.get(`/api/v1/expenses/?month=${month}&source=manual`),
      api.get(`/api/v1/students/?archived_month=${month}&status=archived`),
      api.get(`/api/v1/groups/?status=active`),
    ]);

    const [pnlR, histR, courseR, debtR, convR, salR, expR, churnR, roomR] = results;
    if (pnlR.status === 'fulfilled') setPnl(pnlR.value.data);
    if (histR.status === 'fulfilled') setHistory(histR.value.data);
    if (courseR.status === 'fulfilled') setCourseIncome(courseR.value.data);
    if (debtR.status === 'fulfilled') setDebt(debtR.value.data);
    if (convR.status === 'fulfilled') setConversion(convR.value.data);
    if (salR.status === 'fulfilled') setTeacherSalaries(salR.value.data.results ?? salR.value.data);
    if (expR.status === 'fulfilled') setManualExpenses(expR.value.data.results ?? expR.value.data);
    if (churnR.status === 'fulfilled') setChurn(churnR.value.data.results ?? churnR.value.data);
    if (roomR.status === 'fulfilled') setRooms(roomR.value.data.results ?? roomR.value.data);

    setLoading(false);
  }, [month]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  async function handleMarkPaid(id: string) {
    setMarkingPaid(id);
    try {
      const { data: updated } = await api.post<TeacherSalary>(`/api/v1/teacher-salaries/${id}/mark-paid/`);
      setTeacherSalaries(prev => prev.map(s => s.id === id ? updated : s));
      toast.success("Maosh to'landi");
      loadData();
    } catch { toast.error('Xatolik yuz berdi'); }
    finally { setMarkingPaid(null); }
  }

  function openAddExpense() {
    setEditingExpense(null);
    setExpenseForm({ category: 'rent', amount: '', description: '', expense_date: todayStr() });
    setShowExpenseModal(true);
  }

  function openEditExpense(e: ManualExpense) {
    setEditingExpense(e);
    setExpenseForm({ category: e.category, amount: String(e.amount), description: e.description, expense_date: e.expense_date });
    setShowExpenseModal(true);
  }

  async function handleSaveExpense(ev: React.FormEvent) {
    ev.preventDefault();
    if (!expenseForm.amount || parseFloat(expenseForm.amount) <= 0) { toast.error('Summani kiriting'); return; }
    setSavingExpense(true);
    try {
      const body = {
        category: expenseForm.category,
        amount: parseFloat(expenseForm.amount),
        description: expenseForm.description || '',
        expense_date: expenseForm.expense_date,
      };
      if (editingExpense) {
        await api.patch(`/api/v1/expenses/${editingExpense.id}/`, body);
        toast.success('Xarajat yangilandi');
      } else {
        await api.post('/api/v1/expenses/', body);
        toast.success("Xarajat qo'shildi");
      }
      setShowExpenseModal(false);
      loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Xatolik yuz berdi');
    } finally {
      setSavingExpense(false);
    }
  }

  // ── Derived Data ─────────────────────────────────────────────────────────────

  const income = Number(pnl?.income ?? 0);
  const expenses = Number(pnl?.expenses ?? 0);
  const profit = Number(pnl?.net_profit ?? 0);
  const totalDebt = Number(debt?.total ?? 0);

  const expenseBreakdownData = useMemo(() => {
    if (!pnl?.expense_breakdown) return [];
    return Object.entries(pnl.expense_breakdown)
      .map(([key, val]) => ({ key, name: EXPENSE_LABELS[key] ?? key, value: Number(val) }))
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [pnl]);

  const totalLeads = (conversion?.pending ?? 0) + (conversion?.trial ?? 0) + (conversion?.ignored ?? 0);
  const funnelData = conversion ? [
    { label: 'Yangi (kutilmoqda)', value: conversion.pending, color: '#6366f1' },
    { label: 'Sinov darsida', value: conversion.trial, color: '#f59e0b' },
    { label: 'Rad etilgan', value: conversion.ignored, color: '#ef4444' },
  ] : [];

  const trendData = history.map(h => ({
    period: shortMonth(h.period),
    income: Number(h.income),
    expenses: Number(h.expenses),
  }));

  const roomSchedule = useMemo(() => {
    const byRoom: Record<string, GroupData[]> = {};
    for (const g of rooms) {
      const r = g.room || 'Nomsiz xona';
      if (!byRoom[r]) byRoom[r] = [];
      byRoom[r].push(g);
    }
    return Object.entries(byRoom).sort(([a], [b]) => a.localeCompare(b));
  }, [rooms]);

  const Skel = ({ className }: { className?: string }) => (
    <Skeleton className={cn('rounded-lg', className)} />
  );

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 pb-12">
      <Toaster position="top-right" />

      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Hisobotlar</h1>
          <p className="text-sm text-gray-500 mt-0.5">Moliyaviy tahlil va statistika</p>
        </div>
        <input
          type="month" value={month} onChange={e => setMonth(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        />
      </div>

      {/* Section 1: KPI Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {([
          { label: 'Daromad', value: income, icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
          { label: 'Xarajat', value: expenses, icon: TrendingDown, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
          {
            label: 'Sof foyda', value: profit, icon: DollarSign,
            color: profit >= 0 ? 'text-blue-600' : 'text-red-600',
            bg: profit >= 0 ? 'bg-blue-50' : 'bg-red-50',
            border: profit >= 0 ? 'border-blue-200' : 'border-red-200',
          },
          { label: 'Qarzdorlik', value: totalDebt, icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
        ] as const).map(({ label, value, icon: Icon, color, bg, border }) => (
          <div key={label} className={cn('rounded-xl border p-5 flex items-center gap-4', bg, border)}>
            <div className={cn('p-2.5 rounded-lg bg-white shadow-sm shrink-0', color)}>
              <Icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
              {loading
                ? <Skel className="h-7 w-28 mt-1" />
                : <p className={cn('text-xl font-bold mt-0.5 truncate', color)}>{formatCurrency(value)}</p>}
            </div>
          </div>
        ))}
      </div>

      {/* Section 2+3: Trend chart + Course income pie */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Area chart — 6-month trend */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">6 oylik trend</h2>
          {loading ? <Skel className="h-52 w-full" /> : (
            <>
              <ResponsiveContainer width="100%" height={210}>
                <AreaChart data={trendData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="gIncome" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gExpense" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                  <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={60}
                    tickFormatter={v => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)}
                  />
                  <Tooltip
                    contentStyle={{ border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 12 }}
                    formatter={(v: any) => formatCurrency(Number(v))}
                  />
                  <Area type="monotone" dataKey="income" stroke="#10b981" strokeWidth={2} fill="url(#gIncome)" name="Daromad" />
                  <Area type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2} fill="url(#gExpense)" name="Xarajat" />
                </AreaChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-5 mt-2 justify-center">
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" /> Daromad
                </span>
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> Xarajat
                </span>
              </div>
            </>
          )}
        </div>

        {/* Pie chart — income by course */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Kurs bo&apos;yicha daromad</h2>
          {loading ? <Skel className="h-52 w-full" /> : courseIncome.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-sm text-gray-400">
              Bu oyda to&apos;lov mavjud emas
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie
                  data={courseIncome} dataKey="amount" nameKey="course"
                  cx="50%" cy="50%" outerRadius={85} innerRadius={40}
                >
                  {courseIncome.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: any) => formatCurrency(Number(v))}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
          {!loading && courseIncome.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-1 justify-center">
              {courseIncome.map((c, i) => (
                <span key={i} className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                  {c.course}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Section 4+5: Expense breakdown + Leads funnel */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Expense breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Xarajatlar tafsiloti</h2>
          {loading ? (
            <div className="space-y-3">{Array(5).fill(0).map((_, i) => <Skel key={i} className="h-8 w-full" />)}</div>
          ) : expenseBreakdownData.length === 0 ? (
            <div className="h-44 flex items-center justify-center text-sm text-gray-400">
              Bu oyda xarajat yo&apos;q
            </div>
          ) : (
            <div className="space-y-3">
              {expenseBreakdownData.map(({ key, name, value }) => {
                const pct = expenses > 0 ? (value / expenses) * 100 : 0;
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-600 font-medium">{name}</span>
                      <span className="text-xs font-semibold text-gray-900">{formatCurrency(value)}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500 bg-blue-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Leads funnel */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900">Lidlar konversiyasi</h2>
            {!loading && conversion && (
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                Jami: {totalLeads}
              </span>
            )}
          </div>
          {loading ? (
            <div className="space-y-4">{Array(3).fill(0).map((_, i) => <Skel key={i} className="h-10 w-full" />)}</div>
          ) : !conversion ? (
            <div className="h-44 flex items-center justify-center text-sm text-gray-400">Ma&apos;lumot yo&apos;q</div>
          ) : (
            <div className="space-y-5">
              {funnelData.map(({ label, value, color }) => {
                const pct = totalLeads > 0 ? (value / totalLeads) * 100 : 0;
                return (
                  <div key={label}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm text-gray-700">{label}</span>
                      <span className="text-sm font-bold text-gray-900">{value}</span>
                    </div>
                    <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${pct}%`, backgroundColor: color }}
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{pct.toFixed(1)}%</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Section 6: Teacher Salaries */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <button
          onClick={() => setShowTeachers(t => !t)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
        >
          <h2 className="text-sm font-semibold text-gray-900">O&apos;qituvchilar maoshi</h2>
          {showTeachers ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>
        {showTeachers && (
          loading ? (
            <div className="p-4 space-y-2 border-t border-gray-100">
              {Array(3).fill(0).map((_, i) => <Skel key={i} className="h-10 w-full" />)}
            </div>
          ) : teacherSalaries.length === 0 ? (
            <p className="px-5 py-8 text-sm text-gray-400 text-center border-t border-gray-100">
              Bu oy uchun maosh mavjud emas
            </p>
          ) : (
            <div className="overflow-x-auto border-t border-gray-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {["O'qituvchi", 'Asosiy', 'KPI', 'Jami', 'Holat', ''].map((h, i) => (
                      <th key={i} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {teacherSalaries.map(s => (
                    <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900">{s.teacher_name}</td>
                      <td className="px-4 py-3 text-gray-600">{formatCurrency(s.base_amount)}</td>
                      <td className="px-4 py-3 text-gray-600">{formatCurrency(s.kpi_amount)}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900">{formatCurrency(s.total_amount)}</td>
                      <td className="px-4 py-3">
                        {s.paid_at
                          ? <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">
                              <Check className="w-3 h-3" /> To&apos;langan
                            </span>
                          : <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-full">
                              Kutilmoqda
                            </span>}
                      </td>
                      <td className="px-4 py-3">
                        {!s.paid_at && (
                          <button
                            onClick={() => handleMarkPaid(s.id)}
                            disabled={markingPaid === s.id}
                            className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                          >
                            {markingPaid === s.id ? '...' : 'Tasdiqlash'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* Section 7: Manual Expenses */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Kiritilgan xarajatlar</h2>
          <button
            onClick={openAddExpense}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Qo&apos;shish
          </button>
        </div>
        {loading ? (
          <div className="p-4 space-y-2">
            {Array(3).fill(0).map((_, i) => <Skel key={i} className="h-10 w-full" />)}
          </div>
        ) : manualExpenses.length === 0 ? (
          <p className="px-5 py-8 text-sm text-gray-400 text-center">Bu oyda kiritilgan xarajat yo&apos;q</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['Kategoriya', 'Tavsif', 'Sana', 'Summa', ''].map((h, i) => (
                    <th key={i} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {manualExpenses.map(e => (
                  <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
                        {EXPENSE_LABELS[e.category] ?? e.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{e.description || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{e.expense_date}</td>
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
          </div>
        )}
      </div>

      {/* Section 8+9: Churn table + Room schedule */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Churn — students archived this month */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
            <UserMinus className="w-4 h-4 text-red-500 shrink-0" />
            <h2 className="text-sm font-semibold text-gray-900">Bu oyda ketgan o&apos;quvchilar</h2>
            {!loading && (
              <span className="ml-auto text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full shrink-0">
                {churn.length}
              </span>
            )}
          </div>
          {loading ? (
            <div className="p-4 space-y-2">
              {Array(3).fill(0).map((_, i) => <Skel key={i} className="h-8 w-full" />)}
            </div>
          ) : churn.length === 0 ? (
            <p className="px-5 py-8 text-sm text-gray-400 text-center">Bu oy ketgan o&apos;quvchi yo&apos;q</p>
          ) : (
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {["O'quvchi", 'Kurs', 'Sana'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {churn.map(s => (
                    <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900">{s.first_name} {s.last_name}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{s.course_name || '—'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {s.archived_at ? s.archived_at.slice(0, 10) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Room schedule */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Xonalar jadvali</h2>
            {!loading && (
              <span className="ml-auto text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full shrink-0">
                {roomSchedule.length} xona
              </span>
            )}
          </div>
          {loading ? (
            <div className="p-4 space-y-2">
              {Array(4).fill(0).map((_, i) => <Skel key={i} className="h-10 w-full" />)}
            </div>
          ) : roomSchedule.length === 0 ? (
            <p className="px-5 py-8 text-sm text-gray-400 text-center">Faol guruhlar mavjud emas</p>
          ) : (
            <div className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
              {roomSchedule.map(([room, groups]) => (
                <div key={room} className="px-5 py-3">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">{room}</p>
                  <div className="space-y-2">
                    {[...groups]
                      .sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''))
                      .map(g => (
                        <div key={g.id} className="flex items-center gap-3 text-xs">
                          <span className="font-semibold text-gray-900 w-10 shrink-0">{g.name}</span>
                          <span className="text-gray-500 w-24 shrink-0">
                            {g.start_time && g.end_time ? `${g.start_time}–${g.end_time}` : '—'}
                          </span>
                          <span className="text-gray-400 w-16 shrink-0">{g.schedule?.split(' ')[0] ?? ''}</span>
                          <span className="text-gray-500 truncate">{g.course?.name ?? ''}</span>
                          <span className="ml-auto text-gray-400 shrink-0">{g.students_count}</span>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Expense Modal */}
      <Dialog open={showExpenseModal} onOpenChange={setShowExpenseModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingExpense ? 'Xarajatni tahrirlash' : "Yangi xarajat qo'shish"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveExpense} className="space-y-4 mt-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kategoriya</label>
              <select
                value={expenseForm.category}
                onChange={e => setExpenseForm({ ...expenseForm, category: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              >
                {MANUAL_CATEGORIES.map(key => (
                  <option key={key} value={key}>{EXPENSE_LABELS[key]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Summa</label>
              <input
                type="number" value={expenseForm.amount}
                onChange={e => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="0" required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tavsif</label>
              <input
                type="text" value={expenseForm.description}
                onChange={e => setExpenseForm({ ...expenseForm, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="Xarajat haqida..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sana</label>
              <input
                type="date" value={expenseForm.expense_date}
                onChange={e => setExpenseForm({ ...expenseForm, expense_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                required
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button" onClick={() => setShowExpenseModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50"
              >
                Bekor qilish
              </button>
              <button
                type="submit" disabled={savingExpense}
                className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60"
              >
                {savingExpense ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
