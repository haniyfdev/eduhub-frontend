'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  TrendingUp, TrendingDown, DollarSign, AlertTriangle,
  Users, GraduationCap, Users2, Lightbulb, AlertCircle,
  ChevronDown, ChevronUp, Plus, UserMinus,
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import api from '@/lib/axios';
import { cn, formatCurrency } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PnLData {
  from_date: string; to_date: string;
  income: { total: number };
  expenses: {
    total: number; teacher_salaries: number; staff_salaries: number;
    rent: number; utility: number; other: number;
  };
  net_profit: number; net_profit_percent: number; expense_percent: number;
  stats: {
    total_leads: number; active_students: number; active_teachers: number;
    active_groups: number; total_debtors: number; total_debt_amount: number;
  };
}
interface HistoryItem  { month: string; income: number; expenses: number; profit: number; }
interface CourseIncome { course: string; amount: number; }
interface DebtForecast { total: number; }
interface ConversionStats {
  total: number; trial: number; active: number; ignored: number;
}
interface TeacherSalary {
  id: string;
  teacher_name: string;
  teacher_phone: string;
  teacher_subject: string;
  students_count: number;
  base_amount: number; kpi_amount: number; total_amount: number;
  paid_at: string | null;
}
interface Expense {
  id: string; category: string; amount: number;
  description: string; expense_date: string; source: string;
}
interface ArchivedStudent {
  id: string; first_name: string; last_name: string;
  phone: string; second_phone: string | null;
  course_name: string | null; archived_at: string | null; last_group?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PIE_COLORS = ['#6366f1','#8b5cf6','#ec4899','#3b82f6','#10b981','#f59e0b','#ef4444','#06b6d4'];
const EXPENSE_LABELS: Record<string, string> = {
  rent: 'Ijara', utility: 'Kommunal', tax: 'Soliq', fine: 'Jarima',
  discount: 'Chegirma', teacher_salary: "O'q. maoshi", staff_salary: 'Xodim maoshi', other: 'Boshqa',
};
const MANUAL_CATS = ['rent', 'utility', 'tax', 'fine', 'staff_salary', 'other'];
const MONTH_LABELS = ['Yan','Fev','Mar','Apr','May','Iyn','Iyl','Avg','Sen','Okt','Noy','Dek'];

function todayStr()      { return new Date().toISOString().slice(0, 10); }
function monthStartStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function thisYearStart() { return `${new Date().getFullYear()}-01-01`; }
function shortMonth(m: string) {
  const [, mo] = m.split('-');
  return MONTH_LABELS[parseInt(mo, 10) - 1] ?? m;
}

// ─── DateField — shows dd/mm/yyyy, stores yyyy-mm-dd ─────────────────────────

function DateField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const toDisplay = (iso: string) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  };
  const [text, setText] = useState(() => toDisplay(value));

  useEffect(() => { setText(toDisplay(value)); }, [value]);

  const commit = (raw: string) => {
    const parts = raw.split('/');
    if (parts.length === 3) {
      const [d, m, y] = parts;
      const iso = `${y.padStart(4,'0')}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
      if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) { onChange(iso); setText(toDisplay(iso)); return; }
    }
    setText(toDisplay(value));
  };

  return (
    <input
      type="text"
      value={text}
      placeholder="dd/mm/yyyy"
      onChange={e => setText(e.target.value)}
      onBlur={e => commit(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') commit(text); }}
      className="px-2.5 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white w-28"
    />
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [fromDate, setFromDate] = useState(monthStartStr);
  const [toDate,   setToDate]   = useState(todayStr);
  const [loading,  setLoading]  = useState(true);

  const [pnl,          setPnl]          = useState<PnLData | null>(null);
  const [history,      setHistory]      = useState<HistoryItem[]>([]);
  const [courseIncome, setCourseIncome] = useState<CourseIncome[]>([]);
  const [debt,         setDebt]         = useState<DebtForecast | null>(null);
  const [conversion,   setConversion]   = useState<ConversionStats | null>(null);
  const [teacherSals,  setTeacherSals]  = useState<TeacherSalary[]>([]);
  const [expenses,     setExpenses]     = useState<Expense[]>([]);
  const [churn,        setChurn]        = useState<ArchivedStudent[]>([]);

  // Collapsible sections
  const [salaryOpen,  setSalaryOpen]  = useState(true);
  const [expOpen,     setExpOpen]     = useState(true);

  // Salary confirm dialog
  const [markingPaid,  setMarkingPaid]  = useState<string | null>(null);
  const [confirmSal,   setConfirmSal]   = useState<TeacherSalary | null>(null);
  const [calculating,  setCalculating]  = useState(false);

  // Expense modal
  const [showExpModal, setShowExpModal] = useState(false);
  const [editingExp,   setEditingExp]   = useState<Expense | null>(null);
  const [expForm,      setExpForm]      = useState({
    category: 'rent', amount: '', description: '', expense_date: todayStr(),
  });
  const [savingExp, setSavingExp] = useState(false);

  // ── Data Fetching ────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    const q = `from_date=${fromDate}&to_date=${toDate}`;
    const results = await Promise.allSettled([
      api.get(`/api/v1/profit-loss/?${q}`),
      api.get(`/api/v1/profit-loss/history/?${q}`),
      api.get(`/api/v1/profit-loss/income-by-course/?${q}`),
      api.get(`/api/v1/profit-loss/debt-forecast/`),
      api.get(`/api/v1/leads/conversion-stats/?${q}`),
      api.get(`/api/v1/teacher-salaries/?${q}`),
      api.get(`/api/v1/expenses/?${q}`),
      api.get(`/api/v1/students/?status=archived&${q}`),
    ]);

    const [pnlR, histR, courseR, debtR, convR, salR, expR, churnR] = results;
    if (pnlR.status    === 'fulfilled') setPnl(pnlR.value.data);
    if (histR.status   === 'fulfilled') setHistory(histR.value.data);
    if (courseR.status === 'fulfilled') setCourseIncome(courseR.value.data);
    if (debtR.status   === 'fulfilled') setDebt(debtR.value.data);
    if (convR.status   === 'fulfilled') setConversion(convR.value.data);
    if (salR.status    === 'fulfilled') setTeacherSals(salR.value.data.results ?? salR.value.data);
    if (expR.status    === 'fulfilled') setExpenses(expR.value.data.results ?? expR.value.data);
    if (churnR.status  === 'fulfilled') setChurn(churnR.value.data.results ?? churnR.value.data);

    setLoading(false);
  }, [fromDate, toDate]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  async function handleMarkPaid(id: string) {
    setMarkingPaid(id);
    try {
      const { data: updated } = await api.post<TeacherSalary>(`/api/v1/teacher-salaries/${id}/mark-paid/`);
      setTeacherSals(prev => prev.map(s => s.id === id ? { ...s, ...updated } : s));
      toast.success("Maosh to'landi");
    } catch { toast.error('Xatolik'); }
    finally { setMarkingPaid(null); setConfirmSal(null); }
  }

  async function handleCalculateSalaries() {
    setCalculating(true);
    const month = fromDate.slice(0, 7);
    try {
      const { data } = await api.post(`/api/v1/teacher-salaries/calculate/?month=${month}`);
      toast.success(`${data.created.length} ta maosh yaratildi`);
      loadData();
    } catch { toast.error('Xatolik'); }
    finally { setCalculating(false); }
  }

  function openAddExp() {
    setEditingExp(null);
    setExpForm({ category: 'rent', amount: '', description: '', expense_date: todayStr() });
    setShowExpModal(true);
  }
  function openEditExp(e: Expense) {
    setEditingExp(e);
    setExpForm({ category: e.category, amount: String(e.amount), description: e.description, expense_date: e.expense_date });
    setShowExpModal(true);
  }
  async function handleSaveExp(ev: React.FormEvent) {
    ev.preventDefault();
    if (!expForm.amount || parseFloat(expForm.amount) <= 0) { toast.error('Summani kiriting'); return; }
    setSavingExp(true);
    try {
      const body = {
        category: expForm.category, amount: parseFloat(expForm.amount),
        description: expForm.description || '', expense_date: expForm.expense_date,
      };
      if (editingExp) {
        await api.patch(`/api/v1/expenses/${editingExp.id}/`, body);
        toast.success('Yangilandi');
      } else {
        await api.post('/api/v1/expenses/', body);
        toast.success("Qo'shildi");
      }
      setShowExpModal(false);
      loadData();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      toast.error(e?.response?.data?.detail || 'Xatolik');
    } finally { setSavingExp(false); }
  }

  // ── Derived ──────────────────────────────────────────────────────────────────

  const income   = Number(pnl?.income?.total   ?? 0);
  const expTotal = Number(pnl?.expenses?.total  ?? 0);
  const profit   = Number(pnl?.net_profit       ?? 0);
  const debtAmt  = Number(debt?.total           ?? 0);
  const stats    = pnl?.stats;

  const expBreakdown = useMemo(() => {
    if (!pnl?.expenses) return [];
    const { teacher_salaries, staff_salaries, rent, utility, other } = pnl.expenses;
    return [
      { key: 'teacher_salary', name: "O'q. maoshi",  value: Number(teacher_salaries) },
      { key: 'staff_salary',   name: 'Xodim maoshi', value: Number(staff_salaries) },
      { key: 'rent',           name: 'Ijara',         value: Number(rent) },
      { key: 'utility',        name: 'Kommunal',      value: Number(utility) },
      { key: 'other',          name: 'Boshqa',        value: Number(other) },
    ].filter(d => d.value > 0).sort((a, b) => b.value - a.value);
  }, [pnl]);

  const trendData = history.map(h => ({
    period: shortMonth(h.month),
    income: Number(h.income),
    expenses: Number(h.expenses),
  }));

  const funnelBase = conversion?.total ?? 0;
  const funnelRows = conversion ? [
    { label: 'Jami leadlar',     value: conversion.total,   color: '#6366f1' },
    { label: "Faol o'quvchilar", value: conversion.active,  color: '#10b981' },
    { label: 'Sinovdagilar',     value: conversion.trial,   color: '#f59e0b' },
    { label: 'Rad etganlar',     value: conversion.ignored, color: '#ef4444' },
  ] : [];

  // Expenses: teacher_salary grouped into one row
  const displayExpenses = useMemo(() => {
    const teacherTotal = expenses
      .filter(e => e.category === 'teacher_salary')
      .reduce((s, e) => s + Number(e.amount), 0);
    const others = expenses.filter(e => e.category !== 'teacher_salary');
    if (teacherTotal > 0) {
      const grouped: Expense = {
        id: '__teacher_sal__', category: 'teacher_salary',
        amount: teacherTotal, description: "O'qituvchilar maoshi",
        expense_date: '', source: 'auto',
      };
      return [grouped, ...others];
    }
    return others;
  }, [expenses]);

  const Skel = ({ className }: { className?: string }) => (
    <Skeleton className={cn('rounded-lg', className)} />
  );

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5 pb-12">
      <Toaster position="top-right" />

      {/* ── Header + Date Filter ── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Hisobotlar</h1>
          <p className="text-sm text-gray-500 mt-0.5">Moliyaviy tahlil va statistika</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* 2 preset buttons */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
            {([
              { label: 'Joriy oy',  from: monthStartStr, to: todayStr },
              { label: 'Joriy yil', from: thisYearStart, to: todayStr },
            ] as const).map(({ label, from, to }) => (
              <button key={label}
                onClick={() => { setFromDate(from()); setToDate(to()); }}
                className="px-3 py-2 bg-white text-gray-600 hover:bg-blue-50 hover:text-blue-600 transition-colors border-r border-gray-200 last:border-0">
                {label}
              </button>
            ))}
          </div>
          {/* Date range — dd/mm/yyyy display */}
          <div className="flex items-center gap-1.5">
            <DateField value={fromDate} onChange={setFromDate} />
            <span className="text-gray-400 text-sm">—</span>
            <DateField value={toDate} onChange={setToDate} />
          </div>
        </div>
      </div>

      {/* ── Section 1: 4 Financial KPI Cards ── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {([
          {
            label: 'Daromad', value: income, icon: TrendingUp,
            sub: `${Number(pnl?.net_profit_percent ?? 0).toFixed(1)}% sof foyda`,
            color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200',
          },
          {
            label: 'Harajat', value: expTotal, icon: TrendingDown,
            sub: `${Number(pnl?.expense_percent ?? 0).toFixed(1)}% umumiy daromaddan`,
            color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200',
          },
          {
            label: 'Sof foyda', value: profit, icon: DollarSign, sub: '',
            color: profit >= 0 ? 'text-blue-600' : 'text-red-600',
            bg: profit >= 0 ? 'bg-blue-50' : 'bg-red-50',
            border: profit >= 0 ? 'border-blue-200' : 'border-red-200',
          },
          {
            label: 'Qarzdorlik', value: debtAmt, icon: AlertTriangle, sub: '',
            color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200',
          },
        ] as const).map(({ label, value, icon: Icon, sub, color, bg, border }) => (
          <div key={label} className={cn('rounded-xl border p-5 flex items-start gap-4', bg, border)}>
            <div className={cn('p-2.5 rounded-lg bg-white shadow-sm shrink-0 mt-0.5', color)}>
              <Icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
              {loading
                ? <Skel className="h-7 w-28 mt-1" />
                : <p className={cn('text-xl font-bold mt-0.5 truncate', color)}>{formatCurrency(value)}</p>}
              {sub && !loading && (
                <p className="text-xs text-gray-400 mt-0.5 truncate">{sub}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Section 2: 5 Stat Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        {([
          { label: 'Leadlar',          value: stats?.total_leads,     icon: Lightbulb,     color: 'text-yellow-600 bg-yellow-50 border-yellow-200' },
          { label: "Faol o'quvchilar", value: stats?.active_students, icon: Users,         color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
          { label: "O'qituvchilar",    value: stats?.active_teachers, icon: GraduationCap, color: 'text-blue-600 bg-blue-50 border-blue-200' },
          { label: 'Faol guruhlar',    value: stats?.active_groups,   icon: Users2,        color: 'text-purple-600 bg-purple-50 border-purple-200' },
          { label: 'Qarzdorlar',       value: stats?.total_debtors,   icon: AlertCircle,   color: 'text-red-600 bg-red-50 border-red-200' },
        ] as const).map(({ label, value, icon: Icon, color }) => {
          const [tc, bgc, bc] = color.split(' ');
          return (
            <div key={label} className={cn('rounded-xl border p-4 flex items-center gap-3', bgc, bc)}>
              <div className={cn('p-2 rounded-lg bg-white shadow-sm shrink-0', tc)}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-gray-500 font-medium truncate">{label}</p>
                {loading
                  ? <Skel className="h-6 w-12 mt-0.5" />
                  : <p className={cn('text-lg font-bold', tc)}>{value ?? 0}</p>}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Section 3: Trend + Course Pie ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Progress trendi */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Progress trendi</h2>
          {loading ? <Skel className="h-52 w-full" /> : trendData.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-sm text-gray-400">Ma&apos;lumot yo&apos;q</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={trendData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="gInc" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#10b981" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gExp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                  <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={58}
                    tickFormatter={v => v >= 1_000_000 ? `${(v/1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} />
                  <Tooltip contentStyle={{ border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 12 }}
                    formatter={(v: unknown) => formatCurrency(Number(v))} />
                  <Area type="monotone" dataKey="income"   stroke="#10b981" strokeWidth={2} fill="url(#gInc)" name="Daromad" />
                  <Area type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2} fill="url(#gExp)" name="Harajat" />
                </AreaChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-5 mt-2 justify-center">
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" /> Daromad
                </span>
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> Harajat
                </span>
              </div>
            </>
          )}
        </div>

        {/* Course income pie — 280px left, legend right (dot + name + % only) */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Kurs bo&apos;yicha daromad</h2>
          {loading ? <Skel className="h-64 w-full" /> : courseIncome.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-sm text-gray-400">
              Bu davrda to&apos;lov mavjud emas
            </div>
          ) : (
            <div className="flex items-center gap-8 min-h-[260px]">
              <div className="shrink-0" style={{ width: 280, height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={courseIncome} dataKey="amount" nameKey="course"
                      cx="50%" cy="50%" outerRadius={110} innerRadius={52}>
                      {courseIncome.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 12 }}
                      formatter={(v: unknown) => formatCurrency(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-3 min-w-0">
                {courseIncome.map((c, i) => {
                  const pct = income > 0 ? (Number(c.amount) / income * 100).toFixed(1) : '0';
                  return (
                    <div key={i} className="flex items-center gap-2.5 text-sm">
                      <span className="w-3 h-3 rounded-full shrink-0"
                        style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-gray-700 truncate flex-1">{c.course}</span>
                      <span className="shrink-0 font-semibold text-gray-500 text-xs">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Section 4: Expense breakdown (collapsible) + Leads funnel ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Expense breakdown — collapsible */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <button
            onClick={() => setExpOpen(o => !o)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
          >
            <h2 className="text-sm font-semibold text-gray-900">Harajatlar tafsiloti</h2>
            {expOpen
              ? <ChevronUp className="w-4 h-4 text-gray-400" />
              : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>
          {expOpen && (
            <div className="px-5 pb-5 border-t border-gray-100">
              {loading ? (
                <div className="space-y-3 pt-4">{Array(4).fill(0).map((_, i) => <Skel key={i} className="h-8 w-full" />)}</div>
              ) : expBreakdown.length === 0 ? (
                <div className="h-40 flex items-center justify-center text-sm text-gray-400">Bu davrda harajat yo&apos;q</div>
              ) : (
                <div className="space-y-3 pt-4">
                  {expBreakdown.map(({ key, name, value }) => {
                    const pct = expTotal > 0 ? (value / expTotal) * 100 : 0;
                    return (
                      <div key={key}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-600 font-medium">{name}</span>
                          <span className="text-xs font-semibold text-gray-900">{formatCurrency(value)}</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-500 bg-blue-500"
                            style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Leads conversion funnel — 4 rows */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Lidlar konversiyasi</h2>
          {loading ? (
            <div className="space-y-3">{Array(4).fill(0).map((_, i) => <Skel key={i} className="h-8 w-full" />)}</div>
          ) : !conversion ? (
            <div className="h-40 flex items-center justify-center text-sm text-gray-400">Ma&apos;lumot yo&apos;q</div>
          ) : (
            <div className="space-y-3">
              {funnelRows.map(({ label, value, color }) => {
                const pct = funnelBase > 0 ? (value / funnelBase) * 100 : 0;
                return (
                  <div key={label} className="flex items-center gap-3">
                    <span className="text-xs text-gray-600 shrink-0 w-36">{label}</span>
                    <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden">
                      <div className="h-full rounded transition-all duration-700"
                        style={{ width: `${pct}%`, backgroundColor: color }} />
                    </div>
                    <span className="w-7 text-xs font-bold text-gray-900 text-right shrink-0">{value}</span>
                    <span className="w-11 text-xs text-gray-400 text-right shrink-0">{pct.toFixed(1)}%</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Section 5: Teacher Salaries (collapsible, redesigned) ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <button
          onClick={() => setSalaryOpen(o => !o)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
        >
          <h2 className="text-sm font-semibold text-gray-900">O&apos;qituvchilar maoshi</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={e => { e.stopPropagation(); handleCalculateSalaries(); }}
              disabled={calculating}
              className="text-xs px-2.5 py-1 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50"
            >
              {calculating ? 'Hisoblanmoqda...' : 'Hisoblash'}
            </button>
            {salaryOpen
              ? <ChevronUp className="w-4 h-4 text-gray-400" />
              : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </div>
        </button>

        {salaryOpen && (
          loading ? (
            <div className="p-4 space-y-2 border-t border-gray-100">
              {Array(3).fill(0).map((_, i) => <Skel key={i} className="h-10 w-full" />)}
            </div>
          ) : teacherSals.length === 0 ? (
            <p className="px-5 py-8 text-sm text-gray-400 text-center border-t border-gray-100">
              Bu davr uchun maosh mavjud emas
            </p>
          ) : (
            <div className="overflow-x-auto border-t border-gray-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {['#', "O'qituvchi", 'Telefon', "O'quvchilar", 'Fan', 'Asosiy maosh', 'KPI', 'Jami', 'Holat'].map((h, i) => (
                      <th key={i} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {teacherSals.map((s, idx) => (
                    <tr
                      key={s.id}
                      className={cn(
                        'transition-colors group',
                        s.paid_at ? 'bg-white hover:bg-gray-50' : 'bg-amber-50/60 hover:bg-amber-50'
                      )}
                    >
                      <td className="px-4 py-3 text-gray-400 text-xs font-medium">{idx + 1}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">{s.teacher_name}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs font-medium whitespace-nowrap">{s.teacher_phone || '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-50 text-blue-700 text-xs font-bold">
                          {s.students_count}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs font-medium">{s.teacher_subject || '—'}</td>
                      <td className="px-4 py-3 text-gray-700 font-medium">{formatCurrency(s.base_amount)}</td>
                      <td className="px-4 py-3 text-gray-700 font-medium">{formatCurrency(s.kpi_amount)}</td>
                      <td className="px-4 py-3 font-bold text-gray-900">{formatCurrency(s.total_amount)}</td>
                      {/* Holat: hover transforms To'lanmagan → To'lash */}
                      <td className="px-4 py-3 min-w-[110px]">
                        {s.paid_at ? (
                          <span className="text-emerald-600 font-medium text-xs">To&apos;langan ✓</span>
                        ) : (
                          <span className="relative inline-block">
                            <span className="group-hover:hidden text-amber-500 font-medium text-xs">
                              To&apos;lanmagan
                            </span>
                            <button
                              className="hidden group-hover:inline-flex items-center px-2.5 py-1 bg-emerald-500 text-white text-xs font-semibold rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50"
                              onClick={() => setConfirmSal(s)}
                              disabled={markingPaid === s.id}
                            >
                              {markingPaid === s.id ? '...' : "To'lash"}
                            </button>
                          </span>
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

      {/* ── Section 6: Expenses (numbered, no source, teacher salary grouped) ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Harajatlar</h2>
          <button onClick={openAddExp}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Qo&apos;shish
          </button>
        </div>
        {loading ? (
          <div className="p-4 space-y-2">{Array(4).fill(0).map((_, i) => <Skel key={i} className="h-10 w-full" />)}</div>
        ) : displayExpenses.length === 0 ? (
          <p className="px-5 py-8 text-sm text-gray-400 text-center">Bu davrda harajat yo&apos;q</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['#', 'Kategoriya', 'Miqdor', 'Sana', 'Izoh', ''].map((h, i) => (
                    <th key={i} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {displayExpenses.map((e, idx) => {
                  const isGrouped = e.id === '__teacher_sal__';
                  return (
                    <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-400 text-xs font-medium">{idx + 1}</td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          'inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full',
                          isGrouped ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-700'
                        )}>
                          {isGrouped && <GraduationCap className="w-3 h-3" />}
                          {EXPENSE_LABELS[e.category] ?? e.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-red-600">−{formatCurrency(e.amount)}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{e.expense_date || '—'}</td>
                      <td className="px-4 py-3 text-gray-600 max-w-48 truncate text-xs">{e.description || '—'}</td>
                      <td className="px-4 py-3">
                        {!isGrouped && e.source !== 'auto' && (
                          <button onClick={() => openEditExp(e)} className="text-xs text-blue-600 hover:underline">
                            Tahrirlash
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Section 7: Churn Table ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
          <UserMinus className="w-4 h-4 text-red-500 shrink-0" />
          <h2 className="text-sm font-semibold text-gray-900">Ketgan o&apos;quvchilar</h2>
          {!loading && (
            <span className="ml-auto text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full shrink-0">
              {churn.length} ta
            </span>
          )}
        </div>
        {loading ? (
          <div className="p-4 space-y-2">{Array(3).fill(0).map((_, i) => <Skel key={i} className="h-8 w-full" />)}</div>
        ) : churn.length === 0 ? (
          <p className="px-5 py-8 text-sm text-gray-400 text-center">Bu davrda ketgan o&apos;quvchi yo&apos;q</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['#', "O'quvchi", 'Telefon', 'Ota-ona tel', 'Guruh', 'Kurs', 'Arxivlangan sana'].map((h, i) => (
                    <th key={i} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {churn.map((s, idx) => (
                  <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-400 text-xs font-medium">{idx + 1}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900 text-sm">{s.first_name} {s.last_name}</td>
                    <td className="px-4 py-3 text-gray-600 text-sm font-medium">{s.phone || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-sm font-medium">{s.second_phone || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 text-sm font-medium">{s.last_group || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-sm font-medium">{s.course_name || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-sm font-medium">
                      {s.archived_at ? s.archived_at.slice(0, 10) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Salary Confirm Dialog ── */}
      <Dialog open={!!confirmSal} onOpenChange={open => { if (!open) setConfirmSal(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Maosh to&apos;landi</DialogTitle>
          </DialogHeader>
          {confirmSal && (
            <div className="mt-2 space-y-4">
              <p className="text-sm text-gray-600">
                <span className="font-semibold text-gray-900">{confirmSal.teacher_name}</span>
                {' '}ga{' '}
                <span className="font-semibold text-gray-900">{formatCurrency(confirmSal.total_amount)}</span>
                {' '}so&apos;m maosh berilganini tasdiqlaysizmi?
              </p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmSal(null)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
                  Bekor qilish
                </button>
                <button
                  onClick={() => handleMarkPaid(confirmSal.id)}
                  disabled={markingPaid === confirmSal.id}
                  className="flex-1 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-60"
                >
                  {markingPaid === confirmSal.id ? 'Saqlanmoqda...' : 'Ha, tasdiqlash'}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Expense Modal ── */}
      <Dialog open={showExpModal} onOpenChange={setShowExpModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingExp ? 'Harajatni tahrirlash' : "Yangi harajat qo'shish"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveExp} className="space-y-4 mt-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kategoriya</label>
              <select value={expForm.category} onChange={e => setExpForm({ ...expForm, category: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                {MANUAL_CATS.map(key => <option key={key} value={key}>{EXPENSE_LABELS[key]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Summa</label>
              <input type="number" value={expForm.amount} onChange={e => setExpForm({ ...expForm, amount: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="0" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tavsif</label>
              <input type="text" value={expForm.description} onChange={e => setExpForm({ ...expForm, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="Harajat haqida..." />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sana</label>
              <input type="date" value={expForm.expense_date} onChange={e => setExpForm({ ...expForm, expense_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                required />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowExpModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50">
                Bekor qilish
              </button>
              <button type="submit" disabled={savingExp}
                className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60">
                {savingExp ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
