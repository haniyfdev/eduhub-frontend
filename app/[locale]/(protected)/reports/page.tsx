'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
  AreaChart, Area, PieChart, Pie, Cell, Sector,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AnimatedPie = Pie as React.ComponentType<any>;
import {
  TrendingUp, TrendingDown, DollarSign, AlertTriangle,
  Users, GraduationCap, Users2, Lightbulb, AlertCircle,
  Plus, PencilLine,
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import api from '@/lib/axios';
import { cn, formatCurrency } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExpenseRow {
  id: string | null;
  category: string;
  amount: number;
  date: string | null;
  note: string | null;
  source: string;
}

interface PnLData {
  from_date: string; to_date: string;
  income: { total: number };
  expenses: {
    total: number; maoshlar: number;
    rent: number; utility: number; tax: number; fine: number;
    discount: number; other: number;
    breakdown: ExpenseRow[];
  };
  net_profit: number; net_profit_percent: number; expense_percent: number;
  stats: {
    total_leads: number; active_students: number; active_teachers: number;
    active_groups: number; total_debtors: number; total_debt_amount: number;
  };
}
interface HistoryItem  { month?: string; date?: string; label?: string; income: number; expenses: number; profit: number; }
interface CourseIncome { course: string; amount: number; }
interface DebtForecast { total: number; }
interface ConversionStats {
  grand_total: number;
  active:   { count: number; percent: number };
  trial:    { count: number; percent: number };
  frozen:   { count: number; percent: number };
  archived: { count: number; percent: number };
  pending:  { count: number; percent: number };
  ignored:  { count: number; percent: number };
}
interface ReferralItem { source: string; label: string; count: number; percent: number; }
interface ReferralData { total: number; data: ReferralItem[]; }

// ─── Constants ────────────────────────────────────────────────────────────────

const PIE_COLORS = ['#6366f1','#8b5cf6','#ec4899','#3b82f6','#10b981','#f59e0b','#ef4444','#06b6d4'];
const REFERRAL_COLORS: Record<string, string> = {
  banner: '#F59E0B', friend: '#3B82F6', parent: '#10B981',
  social_media: '#8B5CF6', other: '#6B7280',
};
const EXPENSE_PIE_COLORS: Record<string, string> = {
  maoshlar: '#3B82F6',
  rent:     '#F59E0B',
  utility:  '#10B981',
  tax:      '#EF4444',
  fine:     '#F97316',
  discount: '#EC4899',
  other:    '#6B7280',
};
const EXPENSE_LABEL_KEYS = ['rent', 'utility', 'tax', 'fine', 'discount', 'maoshlar', 'other'] as const;
type ExpenseLabelKey = typeof EXPENSE_LABEL_KEYS[number];
const MANUAL_CATS = ['rent', 'utility', 'tax', 'fine', 'discount', 'other'];
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
  const t = useTranslations('reports');
  const common = useTranslations('common');
  const [fromDate, setFromDate] = useState(monthStartStr);
  const [toDate,   setToDate]   = useState(todayStr);
  const [loading,  setLoading]  = useState(true);

  const [pnl,          setPnl]          = useState<PnLData | null>(null);
  const [history,      setHistory]      = useState<HistoryItem[]>([]);
  const [courseIncome, setCourseIncome] = useState<CourseIncome[]>([]);
  const [debt,         setDebt]         = useState<DebtForecast | null>(null);
  const [conversion,   setConversion]   = useState<ConversionStats | null>(null);
  const [referral,     setReferral]     = useState<ReferralData | null>(null);
  const [activePreset, setActivePreset] = useState<'current_month' | 'current_year' | 'custom'>('current_month');

  const [activePie1, setActivePie1] = useState<number | undefined>();
  const [activePie2, setActivePie2] = useState<number | undefined>();
  const [activePie3, setActivePie3] = useState<number | undefined>();

  // Expense modal
  const [showExpModal, setShowExpModal] = useState(false);
  const [editingExp,   setEditingExp]   = useState<ExpenseRow | null>(null);
  const [expForm,      setExpForm]      = useState({
    category: 'rent', amount: '', description: '', expense_date: todayStr(),
  });
  const [savingExp, setSavingExp] = useState(false);

  // ── Data Fetching ────────────────────────────────────────────────────────────

  const daysDiff = useMemo(() => {
    if (!fromDate || !toDate) return 365;
    return Math.floor((new Date(toDate).getTime() - new Date(fromDate).getTime()) / (1000 * 60 * 60 * 24));
  }, [fromDate, toDate]);
  const groupBy = daysDiff <= 31 ? 'day' : 'month';

  const loadData = useCallback(async () => {
    setLoading(true);
    const q = `from_date=${fromDate}&to_date=${toDate}`;
    const gb = daysDiff <= 31 ? 'day' : 'month';
    const results = await Promise.allSettled([
      api.get(`/api/v1/profit-loss/?${q}`),
      api.get(`/api/v1/profit-loss/history/?${q}&group_by=${gb}`),
      api.get(`/api/v1/profit-loss/income-by-course/?${q}`),
      api.get(`/api/v1/profit-loss/debt-forecast/`),
      api.get(`/api/v1/leads/conversion-stats/`),
      api.get(`/api/v1/leads/referral-stats/`),
    ]);

    const [pnlR, histR, courseR, debtR, convR, refR] = results;
    if (pnlR.status    === 'fulfilled') setPnl(pnlR.value.data);
    if (histR.status   === 'fulfilled') setHistory(histR.value.data);
    if (courseR.status === 'fulfilled') setCourseIncome(courseR.value.data);
    if (debtR.status   === 'fulfilled') setDebt(debtR.value.data);
    if (convR.status   === 'fulfilled') setConversion(convR.value.data);
    if (refR.status    === 'fulfilled') setReferral(refR.value.data);

    setLoading(false);
  }, [fromDate, toDate]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  function openAddExp() {
    setEditingExp(null);
    setExpForm({ category: 'rent', amount: '', description: '', expense_date: todayStr() });
    setShowExpModal(true);
  }
  function openEditExp(e: ExpenseRow) {
    setEditingExp(e);
    setExpForm({
      category: e.category,
      amount: String(e.amount),
      description: e.note ?? '',
      expense_date: e.date ?? todayStr(),
    });
    setShowExpModal(true);
  }
  async function handleSaveExp(ev: React.FormEvent) {
    ev.preventDefault();
    if (!expForm.amount || parseFloat(expForm.amount) <= 0) { toast.error(common('error')); return; }
    setSavingExp(true);
    try {
      const body = {
        category: expForm.category, amount: parseFloat(expForm.amount),
        description: expForm.description || '', expense_date: expForm.expense_date,
      };
      if (editingExp?.id) {
        await api.patch(`/api/v1/expenses/${editingExp.id}/`, body);
        toast.success(common('success'));
      } else {
        await api.post('/api/v1/expenses/', body);
        toast.success(common('success'));
      }
      setShowExpModal(false);
      loadData();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      toast.error(e?.response?.data?.detail || common('error'));
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
    const { maoshlar, rent, utility, tax, fine, discount, other } = pnl.expenses;
    return [
      { key: 'maoshlar', value: Number(maoshlar) },
      { key: 'rent',     value: Number(rent) },
      { key: 'utility',  value: Number(utility) },
      { key: 'tax',      value: Number(tax) },
      { key: 'fine',     value: Number(fine) },
      { key: 'discount', value: Number(discount) },
      { key: 'other',    value: Number(other) },
    ].filter(d => d.value > 0).sort((a, b) => b.value - a.value);
  }, [pnl]);

  const displayExpenses = useMemo(() => pnl?.expenses?.breakdown ?? [], [pnl]);

  const trendData = history.map(h => ({
    period: h.label ?? shortMonth(h.month ?? ''),
    income: Number(h.income),
    expenses: Number(h.expenses),
  }));

  const funnelRows = conversion ? [
    { label: "Jami (leads+students)",  value: conversion.grand_total,       percent: 100,                           color: '#6B7280' },
    { label: "Faol o'quvchilar",       value: conversion.active?.count,     percent: conversion.active?.percent,    color: '#22C55E' },
    { label: "Sinov muddatida",        value: conversion.trial?.count,      percent: conversion.trial?.percent,     color: '#F97316' },
    { label: "Muzlatilgan",            value: conversion.frozen?.count,     percent: conversion.frozen?.percent,    color: '#06B6D4' },
    { label: "Kutilmoqda",             value: conversion.pending?.count,    percent: conversion.pending?.percent,   color: '#EAB308' },
    { label: "Rad etdi",               value: conversion.ignored?.count,    percent: conversion.ignored?.percent,   color: '#EF4444' },
    { label: "Arxivlangan",            value: conversion.archived?.count,   percent: conversion.archived?.percent,  color: '#9CA3AF' },
  ] : [];

  const debtPct = (income + debtAmt) > 0 ? (debtAmt / (income + debtAmt)) * 100 : 0;
  const debtPctColor = debtPct > 10 ? 'text-red-500' : debtPct >= 5 ? 'text-orange-500' : 'text-green-500';

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
          <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t('subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
            {([
              { label: t('currentMonth'),  preset: 'current_month' as const, from: monthStartStr, to: todayStr },
              { label: t('currentYear'), preset: 'current_year' as const, from: thisYearStart, to: todayStr },
            ]).map(({ label, preset, from, to }) => (
              <button key={label}
                onClick={() => { setActivePreset(preset); setFromDate(from()); setToDate(to()); }}
                className={cn(
                  'px-3 py-2 transition-colors border-r border-gray-200 last:border-0',
                  activePreset === preset
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-blue-50 hover:text-blue-600'
                )}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <DateField value={fromDate} onChange={(v) => { setFromDate(v); setActivePreset('custom'); }} />
            <span className="text-gray-400 text-sm">—</span>
            <DateField value={toDate} onChange={(v) => { setToDate(v); setActivePreset('custom'); }} />
          </div>
        </div>
      </div>

      {/* ── Section 1: 4 Financial KPI Cards ── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {([
          {
            label: t('kpiLabels.income'), value: income, icon: TrendingUp,
            sub: t('kpiSubs.income', { pct: Number(pnl?.net_profit_percent ?? 0).toFixed(1) }),
            subColor: 'text-gray-400',
            color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200',
          },
          {
            label: t('kpiLabels.expense'), value: expTotal, icon: TrendingDown,
            sub: t('kpiSubs.expense', { pct: Number(pnl?.expense_percent ?? 0).toFixed(1) }),
            subColor: 'text-gray-400',
            color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200',
          },
          {
            label: t('kpiLabels.profit'), value: profit, icon: DollarSign, sub: '', subColor: 'text-gray-400',
            color: profit >= 0 ? 'text-blue-600' : 'text-red-600',
            bg: profit >= 0 ? 'bg-blue-50' : 'bg-red-50',
            border: profit >= 0 ? 'border-blue-200' : 'border-red-200',
          },
          {
            label: t('kpiLabels.debt'), value: debtAmt, icon: AlertTriangle,
            sub: t('kpiSubs.debt', { pct: debtPct.toFixed(1) }),
            subColor: debtPctColor,
            color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200',
          },
        ]).map(({ label, value, icon: Icon, sub, subColor, color, bg, border }) => (
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
                <p className={cn('text-xs mt-0.5 truncate', subColor)}>{sub}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Section 2: 5 Stat Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        {([
          { label: t('statLabels.leads'),          value: stats?.total_leads,     icon: Lightbulb,     color: 'text-yellow-600 bg-yellow-50 border-yellow-200' },
          { label: t('statLabels.activeStudents'),  value: stats?.active_students, icon: Users,         color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
          { label: t('statLabels.activeTeachers'),  value: stats?.active_teachers, icon: GraduationCap, color: 'text-blue-600 bg-blue-50 border-blue-200' },
          { label: t('statLabels.activeGroups'),    value: stats?.active_groups,   icon: Users2,        color: 'text-purple-600 bg-purple-50 border-purple-200' },
          { label: t('statLabels.debtors'),         value: stats?.total_debtors,   icon: AlertCircle,   color: 'text-red-600 bg-red-50 border-red-200' },
        ] as const).map(({ label, value, icon: Icon, color }) => {
          const [clr, bgc, bc] = color.split(' ');
          return (
            <div key={label} className={cn('rounded-xl border p-4 flex items-center gap-3', bgc, bc)}>
              <div className={cn('p-2 rounded-lg bg-white shadow-sm shrink-0', clr)}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-gray-500 font-medium truncate">{label}</p>
                {loading
                  ? <Skel className="h-6 w-12 mt-0.5" />
                  : <p className={cn('text-lg font-bold', clr)}>{value ?? 0}</p>}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Section 3: Conversion Funnel + Course Pie ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">{t('leadsConversion')}</h2>
        {loading ? (
          <div className="space-y-3">{Array(5).fill(0).map((_, i) => <Skel key={i} className="h-7 w-full" />)}</div>
        ) : !conversion ? (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-400">{t('noData')}</div>
        ) : (
          <div className="flex-1 flex flex-col justify-center space-y-2.5">
              {funnelRows.map(({ label, value, percent, color }) => (
                <div key={label} className="flex items-center gap-3">
                  <span className="w-44 text-sm text-gray-600 shrink-0">{label}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-3">
                    <div
                      className="h-3 rounded-full transition-all"
                      style={{ width: `${percent ?? 0}%`, backgroundColor: color }}
                    />
                  </div>
                  <span className="w-12 text-sm font-semibold text-gray-900 text-right shrink-0">{value ?? 0}</span>
                  <span className="w-14 text-sm text-gray-500 text-right shrink-0">{(percent ?? 0).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">{t('courseRevenue')}</h2>
          {loading ? <Skel className="h-64 w-full" /> : courseIncome.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-sm text-gray-400">
              {t('noPayments')}
            </div>
          ) : (
            <div className="flex items-center gap-8 min-h-[260px]">
              <div className="shrink-0" style={{ width: 240, height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <AnimatedPie data={courseIncome} dataKey="amount" nameKey="course"
                      cx="50%" cy="50%" outerRadius={110} innerRadius={0}
                      activeIndex={activePie1}
                      activeShape={(props: { cx: number; cy: number; innerRadius: number; outerRadius: number; startAngle: number; endAngle: number; fill: string }) => {
                        const { cx = 0, cy = 0, innerRadius = 0, outerRadius = 0, startAngle = 0, endAngle = 0, fill = '' } = props;
                        return <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 8} startAngle={startAngle} endAngle={endAngle} fill={fill} />;
                      }}
                      onMouseEnter={(_: unknown, index: number) => setActivePie1(index)}
                      onMouseLeave={() => setActivePie1(undefined)}>
                      {courseIncome.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </AnimatedPie>
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
                      <span className="w-2.5 h-2.5 rounded-full shrink-0"
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

      {/* ── Section 4: Progress Trend (full-width) ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">{t('progressTrend')}</h2>
        {loading ? <Skel className="h-52 w-full" /> : trendData.length === 0 ? (
          <div className="h-52 flex items-center justify-center text-sm text-gray-400">{t('noData')}</div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={220}>
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
                <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false}
                  interval={groupBy === 'day' && daysDiff > 14 ? 'preserveStartEnd' : 0} />
                <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={58}
                  tickFormatter={v => v >= 1_000_000 ? `${(v/1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} />
                <Tooltip contentStyle={{ border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: unknown) => formatCurrency(Number(v))} />
                <Area type="monotone" dataKey="income"   stroke="#10b981" strokeWidth={2} fill="url(#gInc)" name={t('kpiLabels.income')} />
                <Area type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2} fill="url(#gExp)" name={t('kpiLabels.expense')} />
              </AreaChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-5 mt-2 justify-center">
              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" /> {t('kpiLabels.income')}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> {t('kpiLabels.expense')}
              </span>
            </div>
          </>
        )}
      </div>

      {/* ── Section 5: Referral Pie + Expense Breakdown Pie ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

        {/* LEFT: Qayerdan kelishdi? */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">{t('referralSources')}</h2>
          {loading ? <Skel className="h-60 w-full" /> : !referral || referral.data.length === 0 ? (
            <div className="h-60 flex items-center justify-center text-sm text-gray-400">{t('noData')}</div>
          ) : (
            <div className="flex items-center gap-8 min-h-[240px]">
              <div className="shrink-0" style={{ width: 240, height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <AnimatedPie data={referral.data} dataKey="count" nameKey="label"
                      cx="50%" cy="50%" outerRadius={110} innerRadius={50}
                      activeIndex={activePie2}
                      activeShape={(props: { cx: number; cy: number; innerRadius: number; outerRadius: number; startAngle: number; endAngle: number; fill: string }) => {
                        const { cx = 0, cy = 0, innerRadius = 0, outerRadius = 0, startAngle = 0, endAngle = 0, fill = '' } = props;
                        return <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 8} startAngle={startAngle} endAngle={endAngle} fill={fill} />;
                      }}
                      onMouseEnter={(_: unknown, index: number) => setActivePie2(index)}
                      onMouseLeave={() => setActivePie2(undefined)}>
                      {referral.data.map((item, i) => (
                        <Cell key={i} fill={REFERRAL_COLORS[item.source] ?? '#6B7280'} />
                      ))}
                    </AnimatedPie>
                    <Tooltip
                      contentStyle={{ border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 12 }}
                      formatter={(_v: unknown, _n: unknown, props: { payload?: ReferralItem }) => [
                        `${props.payload?.count ?? 0} ta`,
                        props.payload?.label ?? '',
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-2.5 min-w-0">
                {referral.data.map((item) => (
                  <div key={item.source} className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: REFERRAL_COLORS[item.source] ?? '#6B7280' }} />
                    <span className="text-xs text-gray-700 flex-1 truncate">{item.label}</span>
                    <span className="text-xs font-semibold text-gray-500 shrink-0">{item.percent}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: Harajatlar taqsimoti */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">{t('expenseBreakdown')}</h2>
          {loading ? <Skel className="h-60 w-full" /> : expBreakdown.length === 0 ? (
            <div className="h-60 flex items-center justify-center text-sm text-gray-400">{t('noExpenses')}</div>
          ) : (
            <div className="flex items-center gap-8 min-h-[240px]">
              <div className="shrink-0" style={{ width: 240, height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <AnimatedPie data={expBreakdown} dataKey="value" nameKey="key"
                      cx="50%" cy="50%" outerRadius={110} innerRadius={50}
                      activeIndex={activePie3}
                      activeShape={(props: { cx: number; cy: number; innerRadius: number; outerRadius: number; startAngle: number; endAngle: number; fill: string }) => {
                        const { cx = 0, cy = 0, innerRadius = 0, outerRadius = 0, startAngle = 0, endAngle = 0, fill = '' } = props;
                        return <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 8} startAngle={startAngle} endAngle={endAngle} fill={fill} />;
                      }}
                      onMouseEnter={(_: unknown, index: number) => setActivePie3(index)}
                      onMouseLeave={() => setActivePie3(undefined)}>
                      {expBreakdown.map((item, i) => (
                        <Cell key={i} fill={EXPENSE_PIE_COLORS[item.key] ?? '#6B7280'} />
                      ))}
                    </AnimatedPie>
                    <Tooltip
                      contentStyle={{ border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 12 }}
                      formatter={(v: unknown, _n: unknown, props: { payload?: { key: string; value: number } }) => [
                        `${formatCurrency(Number(v))}`,
                        props.payload?.key ? t(`expenseLabels.${props.payload.key}` as Parameters<typeof t>[0]) : '',
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-2.5 min-w-0">
                {expBreakdown.map((item) => {
                  const pct = expTotal > 0 ? ((item.value / expTotal) * 100).toFixed(1) : '0';
                  return (
                    <div key={item.key} className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ background: EXPENSE_PIE_COLORS[item.key] ?? '#6B7280' }} />
                      <span className="text-xs text-gray-700 flex-1 truncate">
                        {t(`expenseLabels.${item.key}` as Parameters<typeof t>[0])}
                      </span>
                      <span className="text-xs font-semibold text-gray-500 shrink-0">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Section 6: Expenses Table (full-width) ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">{t('expensesSection')}</h2>
          <button onClick={openAddExp}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors">
            <Plus className="w-3.5 h-3.5" /> {t('addExpense')}
          </button>
        </div>
        {loading ? (
          <div className="p-4 space-y-2">{Array(4).fill(0).map((_, i) => <Skel key={i} className="h-10 w-full" />)}</div>
        ) : displayExpenses.length === 0 ? (
          <p className="px-5 py-8 text-sm text-gray-400 text-center">{t('noExpenses')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['№', t('categoryLabel'), common('amount'), common('date'), common('note'), ''].map((h, i) => (
                    <th key={i} className={cn(
                      'text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide',
                      i === 4 && 'w-1/3',
                    )}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {displayExpenses.map((e, idx) => (
                  <tr key={e.id ?? idx} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-400 text-xs font-medium align-top">{idx + 1}</td>
                    <td className="px-4 py-3 align-top">
                      <span className={cn(
                        'inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full',
                        e.source === 'auto' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-700'
                      )}>
                        {e.source === 'auto' && e.category === 'maoshlar' && <GraduationCap className="w-3 h-3" />}
                        {EXPENSE_LABEL_KEYS.includes(e.category as ExpenseLabelKey)
                          ? t(`expenseLabels.${e.category}` as Parameters<typeof t>[0])
                          : e.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-red-600 align-top whitespace-nowrap">−{formatCurrency(e.amount)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs align-top whitespace-nowrap">{e.date || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs align-top w-1/3 break-words">{e.note || '—'}</td>
                    <td className="px-4 py-3 align-top">
                      {e.source !== 'auto' && e.id && (
                        <button onClick={() => openEditExp(e)}
                          className="text-gray-400 hover:text-blue-600 transition-colors">
                          <PencilLine className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Expense Modal ── */}
      <Dialog open={showExpModal} onOpenChange={setShowExpModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingExp ? t('editExpenseTitle') : t('addExpenseTitle')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveExp} className="space-y-4 mt-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('categoryLabel')}</label>
              <select value={expForm.category} onChange={e => setExpForm({ ...expForm, category: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                {MANUAL_CATS.map(key => <option key={key} value={key}>{t(`expenseLabels.${key}` as Parameters<typeof t>[0])}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('amountLabel')}</label>
              <input type="number" value={expForm.amount} onChange={e => setExpForm({ ...expForm, amount: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="0" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('noteLabel')}</label>
              <textarea rows={3} value={expForm.description} onChange={e => setExpForm({ ...expForm, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                placeholder={t('notePlaceholder')} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{common('date')}</label>
              <input type="date" value={expForm.expense_date} onChange={e => setExpForm({ ...expForm, expense_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                required />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowExpModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50">
                {common('cancel')}
              </button>
              <button type="submit" disabled={savingExp}
                className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60">
                {savingExp ? common('loading') : common('save')}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
