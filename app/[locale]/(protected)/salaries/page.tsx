'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Banknote } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import api from '@/lib/axios';
import { cn, formatCurrency } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface GroupSalaryData {
  salary_id: string;
  group_id: string | null;
  group_name: string | null;
  course_name: string | null;
  calculated_amount: number;
  paid_amount: number;
  carry_over: number;
  total_owed: number;
  status: 'unpaid' | 'partial' | 'paid';
  due_date: string | null;
  first_active_date: string | null;
  student_count: number;
  course_price: number;
  kpi_amount: number;
}

interface TeacherSalaryGrouped {
  teacher_id: string;
  teacher_name: string;
  teacher_subject: string;
  teacher_status?: string;
  teacher_archived_at?: string | null;
  salary_type: string;
  salary_percent: number | null;
  fixed_amount: number | null;
  per_student_amt: number | null;
  kpi_amount: number;
  total_calculated: number;
  total_paid: number;
  total_owed: number;
  overall_status: 'unpaid' | 'partial' | 'paid';
  groups: GroupSalaryData[];
}

interface SobiqSalaryBreakdown {
  teacher_name: string;
  group_name: string | null;
  course_name: string | null;
  month: string;
  archived_at: string;
  billing_type: 'full' | 'manual' | 'per_day' | 'per_lesson';
  salary_type: 'fixed' | 'percent' | 'per_student';
  salary_percent: number;
  per_student_amt: number;
  students_count: number;
  group_revenue: number;
  course_price: number;
  full_monthly_salary: number;
  base_amount: number;
  raw_amount: number | null;
  calculated_amount: number | null;
  per_unit: number | null;
  units_count: number | null;
  total_units: number | null;
  unit_label: 'day' | 'lesson' | null;
}

interface StaffSalaryData {
  id: string;
  staff: string;
  staff_name: string;
  staff_role: string;
  hired_at?: string | null;
  month: string;
  calculated_amount: number;
  paid_amount: number;
  carry_over: number;
  total_owed: number;
  due_date: string | null;
  status: 'unpaid' | 'partial' | 'paid';
  is_paid: boolean;
  paid_at: string | null;
  note?: string | null;
}

interface SalaryRow {
  id: string;
  entityType: 'staff';
  name: string;
  roleDisplay: string;
  badgeText: string;
  badgeStyle: string;
  salaryTypeText: string;
  salaryTypeStyle: string;
  rawSalaryType: string;
  calculatedAmount: number;
  carryOver: number;
  paidAmount: number;
  totalOwed: number;
  status: 'unpaid' | 'partial' | 'paid';
  month: string | null;
  dueDate: string | null;
  hiredAt: string | null;
}

interface ExpenseItem {
  id: string;
  category: string;
  amount: number;
  description: string;
  expense_date: string;
  source?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_BADGE: Record<string, string> = {
  teacher: 'bg-blue-50 text-blue-700',
  admin: 'bg-gray-100 text-gray-700',
  manager: 'bg-purple-50 text-purple-700',
  accountant: 'bg-emerald-50 text-emerald-700',
  security: 'bg-orange-50 text-orange-700',
  cleaner: 'bg-teal-50 text-teal-700',
  supply: 'bg-yellow-50 text-yellow-700',
  other: 'bg-gray-50 text-gray-500',
};

const formatAmount = (val: string) =>
  val.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const parseAmount = (val: string) => Number(val.replace(/,/g, ''));

function currentMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SalariesPage() {
  const t = useTranslations('salaries');
  const common = useTranslations('common');
  const [activeTab, setActiveTab] = useState<'debts' | 'history'>('debts');

  // ── Shared state ─────────────────────────────────────────────────────────────
  const [month, setMonth]               = useState(currentMonthStr);
  const [statusFilter, setStatusFilter] = useState('all');
  const [loadingSals, setLoadingSals]   = useState(true);
  const [generating, setGenerating]     = useState(false);

  // ── Teacher salary state ──────────────────────────────────────────────────────
  const [teacherGrouped, setTeacherGrouped]   = useState<TeacherSalaryGrouped[]>([]);
  const [groupSelections, setGroupSelections] = useState<Record<string, string>>({});
  const [teacherDetail, setTeacherDetail]     = useState<TeacherSalaryGrouped | null>(null);
  const [teacherPay, setTeacherPay]           = useState<{ teacher: TeacherSalaryGrouped; selectionId: string } | null>(null);
  const [bulkAmounts, setBulkAmounts]         = useState<Record<string, string>>({});
  const [bulkPaying, setBulkPaying]           = useState(false);

  // ── Sobiq teacher modal ───────────────────────────────────────────────────────
  const [sobiqSalary,     setSobiqSalary]    = useState<{ salaryId: string; teacher: TeacherSalaryGrouped } | null>(null);
  const [sobiqBreakdown,  setSobiqBreakdown] = useState<SobiqSalaryBreakdown | null>(null);
  const [sobiqLoading,    setSobiqLoading]   = useState(false);

  async function openSobiqTeacherModal(teacher: TeacherSalaryGrouped) {
    const firstGroup = teacher.groups.find(g => g.salary_id) ?? teacher.groups[0];
    if (!firstGroup?.salary_id) return;
    setSobiqSalary({ salaryId: firstGroup.salary_id, teacher });
    setSobiqBreakdown(null);
    setSobiqLoading(true);
    try {
      const { data } = await api.get<SobiqSalaryBreakdown>(
        `/api/v1/teacher-salaries/${firstGroup.salary_id}/last-month-breakdown/`
      );
      setSobiqBreakdown(data);
    } catch {
      setSobiqBreakdown(null);
    } finally {
      setSobiqLoading(false);
    }
  }

  // ── Staff salary state ────────────────────────────────────────────────────────
  const [staffSals, setStaffSals] = useState<StaffSalaryData[]>([]);
  const [payTarget, setPayTarget] = useState<SalaryRow | null>(null);
  const [payAmount, setPayAmount]             = useState('');
  const [paying, setPaying]                   = useState(false);

  // ── Summary state ─────────────────────────────────────────────────────────────
  const [summary, setSummary] = useState({ total_calculated: 0, total_paid: 0, total_remaining: 0 });

  // ── History state ─────────────────────────────────────────────────────────────
  const [histMonth, setHistMonth]       = useState(currentMonthStr);
  const [histCategory, setHistCategory] = useState('all');
  const [expenses, setExpenses]         = useState<ExpenseItem[]>([]);
  const [loadingHist, setLoadingHist]   = useState(false);

  // ── Fetchers ──────────────────────────────────────────────────────────────────

  const loadSalaries = useCallback(async () => {
    setLoadingSals(true);
    const [tRes, sRes] = await Promise.allSettled([
      api.get(`/api/v1/teacher-salaries/?month=${month}`),
      api.get(`/api/v1/staff-salaries/?month=${month}`),
    ]);
    if (tRes.status === 'fulfilled') {
      const data: TeacherSalaryGrouped[] = Array.isArray(tRes.value.data)
        ? tRes.value.data
        : (tRes.value.data.results ?? []);
      const sorted = [...data].sort((a, b) => {
        // 1. Archived first
        const aArchived = a.teacher_status === 'archived' ? 0 : 1;
        const bArchived = b.teacher_status === 'archived' ? 0 : 1;
        if (aArchived !== bArchived) return aArchived - bArchived;

        // 2. Oldest due_date first (ascending)
        const aDate = a.groups?.[0]?.due_date ?? '';
        const bDate = b.groups?.[0]?.due_date ?? '';
        if (aDate !== bDate) return aDate.localeCompare(bDate);

        // 3. Largest total_owed first (descending)
        if (b.total_owed !== a.total_owed) return b.total_owed - a.total_owed;

        // 4. Alphabetical by teacher name A-Z
        return a.teacher_name.localeCompare(b.teacher_name);
      });
      setTeacherGrouped(sorted);
    }
    if (sRes.status === 'fulfilled') setStaffSals(sRes.value.data.results ?? sRes.value.data);
    setLoadingSals(false);
  }, [month]);

  const loadHistory = useCallback(async () => {
    setLoadingHist(true);
    try {
      const year = histMonth.split('-')[0];
      const mon  = histMonth.split('-')[1];
      const from = `${year}-${mon}-01`;
      const lastDay = new Date(Number(year), Number(mon), 0).getDate();
      const to  = `${year}-${mon}-${String(lastDay).padStart(2, '0')}`;
      const { data } = await api.get(`/api/v1/expenses/?from_date=${from}&to_date=${to}`);
      const all: ExpenseItem[] = data.results ?? data;
      setExpenses(all.filter(e => e.category === 'teacher_salary' || e.category === 'staff_salary'));
    } catch {
      toast.error(common('error'));
    } finally {
      setLoadingHist(false);
    }
  }, [histMonth, common]);

  const loadSummary = useCallback(async () => {
    try {
      const { data } = await api.get(`/api/v1/teacher-salaries/summary/?month=${month}`);
      setSummary(data);
    } catch {
      // silently fail — cards stay at previous values
    }
  }, [month]);

  useEffect(() => { loadSalaries(); }, [loadSalaries]);
  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { if (activeTab === 'history') loadHistory(); }, [activeTab, loadHistory]);

  // ── Generate ──────────────────────────────────────────────────────────────────

  async function handleGenerate() {
    setGenerating(true);
    try {
      const [tRes, sRes] = await Promise.allSettled([
        api.post(`/api/v1/teacher-salaries/generate/?month=${month}`),
        api.post(`/api/v1/staff-salaries/generate/?month=${month}`),
      ]);
      void tRes; void sRes;
      toast.success(common('success'));
      loadSalaries();
    } catch {
      toast.error(common('error'));
    } finally {
      setGenerating(false);
    }
  }

  // ── Teacher helpers ───────────────────────────────────────────────────────────

  function getSelection(teacherId: string): string {
    return groupSelections[teacherId] ?? 'all';
  }

  function getTeacherValues(teacher: TeacherSalaryGrouped, selId: string) {
    if (selId === 'all') {
      const dueDates = teacher.groups.map(g => g.due_date).filter(Boolean) as string[];
      dueDates.sort();
      return {
        jami: teacher.total_calculated,
        tolangan: teacher.total_paid,
        qoldiq: Math.max(teacher.total_owed - teacher.total_paid, 0),
        dueDate: dueDates[dueDates.length - 1] ?? null,
        status: teacher.overall_status,
      };
    }
    const g = teacher.groups.find(gr => gr.salary_id === selId);
    if (!g) return { jami: 0, tolangan: 0, qoldiq: 0, dueDate: null, status: 'unpaid' as const };
    return {
      jami: g.calculated_amount,
      tolangan: g.paid_amount,
      qoldiq: Math.max(g.total_owed - g.paid_amount, 0),
      dueDate: g.due_date,
      status: g.status,
    };
  }

  function teacherRowBg(teacher: TeacherSalaryGrouped): string {
    if (teacher.teacher_status === 'archived') return 'bg-green-100 hover:bg-green-200 cursor-pointer';
    if (teacher.overall_status === 'paid') return 'bg-white';
    const today = new Date().toISOString().slice(0, 10);
    const anyOverdue = teacher.groups.some(
      g => g.status !== 'paid' && g.due_date && g.due_date < today,
    );
    if (anyOverdue) return 'bg-[#FEF2F2]';
    return teacher.overall_status === 'partial' ? 'bg-yellow-50' : 'bg-yellow-100';
  }

  function openTeacherPayModal(teacher: TeacherSalaryGrouped, selId: string) {
    setTeacherPay({ teacher, selectionId: selId });
    const amounts: Record<string, string> = {};
    if (teacher.salary_type === 'fixed') {
      const fixedId = teacher.groups[0]?.salary_id ?? selId;
      const rem = Math.max(teacher.total_owed - teacher.total_paid, 0);
      if (rem > 0 && fixedId) amounts[fixedId] = formatAmount(String(Math.round(rem)));
    } else if (selId === 'all') {
      teacher.groups.forEach(g => {
        const rem = Math.max(g.total_owed - g.paid_amount, 0);
        if (rem > 0) amounts[g.salary_id] = formatAmount(String(Math.round(rem)));
      });
    } else {
      const g = teacher.groups.find(gr => gr.salary_id === selId);
      if (g) {
        const rem = Math.max(g.total_owed - g.paid_amount, 0);
        amounts[selId] = formatAmount(String(Math.round(rem > 0 ? rem : g.total_owed)));
      }
    }
    setBulkAmounts(amounts);
  }

  async function handleTeacherPay() {
    if (!teacherPay) return;
    const { teacher, selectionId } = teacherPay;
    setBulkPaying(true);
    try {
      if (selectionId === 'all') {
        const payments = teacher.groups
          .filter(g => g.status !== 'paid')
          .map(g => ({ salary_id: g.salary_id, amount: parseAmount(bulkAmounts[g.salary_id] || '0') }))
          .filter(p => p.amount >= 10000);
        if (payments.length === 0) { toast.error(common('error')); setBulkPaying(false); return; }
        await api.post('/api/v1/teacher-salaries/bulk-pay/', { payments });
      } else {
        const amount = parseAmount(bulkAmounts[selectionId] || '0');
        if (amount < 10000) { toast.error(t('minPayment')); setBulkPaying(false); return; }
        await api.post(`/api/v1/teacher-salaries/${selectionId}/pay/`, { amount });
      }
      toast.success(common('success'));
      setTeacherPay(null);
      setBulkAmounts({});
      loadSalaries();
      loadSummary();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e?.response?.data?.error || common('error'));
    } finally {
      setBulkPaying(false);
    }
  }

  // ── Staff handlers ────────────────────────────────────────────────────────────

  function openPayModal(row: SalaryRow) {
    setPayTarget(row);
    setPayAmount(formatAmount(String(Math.round(row.totalOwed))));
  }

  async function handlePay() {
    if (!payTarget) return;
    const amount = parseAmount(payAmount);
    if (!amount || amount <= 0) { toast.error(t('minPayment')); return; }
    if (amount < 10000) { toast.error(t('minPayment')); return; }
    setPaying(true);
    try {
      await api.post(`/api/v1/staff-salaries/${payTarget.id}/pay/`, { amount });
      toast.success(common('success'));
      setPayTarget(null);
      loadSalaries();
      loadSummary();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e?.response?.data?.error || common('error'));
    } finally {
      setPaying(false);
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────────

  const staffRows = useMemo<SalaryRow[]>(() => staffSals.map(s => ({
    id:               s.id,
    entityType:       'staff',
    name:             s.staff_name,
    roleDisplay:      s.staff_role || '—',
    badgeText:        s.staff_role || t('categoryStaff'),
    badgeStyle:       ROLE_BADGE.other,
    salaryTypeText:   '',
    salaryTypeStyle:  '',
    rawSalaryType:    '',
    calculatedAmount: Number(s.calculated_amount),
    carryOver:        Number(s.carry_over),
    paidAmount:       Number(s.paid_amount),
    totalOwed:        Number(s.calculated_amount) + Number(s.carry_over) - Number(s.paid_amount),
    status:           s.status,
    month:            s.month ?? null,
    dueDate:          s.due_date ?? null,
    hiredAt:          s.hired_at ?? null,
  })), [staffSals, t]);

  const filteredTeachers = useMemo(() => (
    statusFilter === 'all' ? teacherGrouped : teacherGrouped.filter(tg => tg.overall_status === statusFilter)
  ), [teacherGrouped, statusFilter]);

  const filteredStaffRows = useMemo(() => (
    statusFilter === 'all' ? staffRows : staffRows.filter(r => r.status === statusFilter)
  ), [staffRows, statusFilter]);


  const Skel = ({ w }: { w?: string }) => <Skeleton className={cn('h-4 rounded', w ?? 'w-full')} />;

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5 pb-12">
      <Toaster position="top-right" />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t('subtitle')}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {([
          { id: 'debts',   label: t('tabs.debts') },
          { id: 'history', label: t('tabs.history') },
        ] as const).map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
              activeTab === tab.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700',
            )}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ════════════ TAB 1: MAOSH QARZDORLIGI ════════════ */}
      {activeTab === 'debts' && (
        <div className="space-y-5">

          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-2">
            <input type="month" value={month} onChange={e => setMonth(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            <button onClick={handleGenerate} disabled={generating}
              className="px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {generating ? common('loading') : t('calculate')}
            </button>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none text-gray-700">
              <option value="all">{common('all')}</option>
              <option value="unpaid">{t('unpaid')}</option>
              <option value="partial">{t('partial')}</option>
              <option value="paid">{common('paid')}</option>
            </select>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: t('totalCalculated'), value: summary.total_calculated, color: 'text-gray-900',    bg: 'bg-gray-50 border-gray-200' },
              { label: t('totalPaid'),        value: summary.total_paid,       color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
              { label: t('remaining'),        value: summary.total_remaining,  color: 'text-red-600',     bg: 'bg-red-50 border-red-200' },
            ].map(({ label, value, color, bg }) => (
              <div key={label} className={cn('rounded-xl border p-4', bg)}>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
                {loadingSals ? <Skel w="w-32 mt-1" /> : <p className={cn('text-xl font-bold mt-1', color)}>{formatCurrency(value)}</p>}
              </div>
            ))}
          </div>

          {/* ── Teacher salary table ── */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">{t('teachersSection')}</h2>
            </div>
            {loadingSals ? (
              <div className="p-4 space-y-2">{Array(4).fill(0).map((_, i) => <Skel key={i} />)}</div>
            ) : filteredTeachers.length === 0 ? (
              <p className="px-5 py-10 text-sm text-gray-400 text-center">{t('noSalaries')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      {[t('tableHeaders.num'), t('tableHeaders.teacher'), t('paymentDate'), t('tableHeaders.total'), t('tableHeaders.paid'), t('tableHeaders.remaining'), t('tableHeaders.status'), t('lastDate')].map((h, i) => (
                        <th key={i} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredTeachers.map((teacher, idx) => {
                      const selId = getSelection(teacher.teacher_id);
                      const vals  = getTeacherValues(teacher, selId);
                      return (
                        <tr
                          key={teacher.teacher_id}
                          className={cn('transition-colors group', teacherRowBg(teacher))}
                          onClick={() => { if (teacher.teacher_status === 'archived') openSobiqTeacherModal(teacher); }}
                        >
                          <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-gray-900 whitespace-nowrap">{teacher.teacher_name}</p>
                            <p className="text-xs text-gray-500">{teacher.teacher_subject || '—'}</p>
                          </td>
                          {/* Maosh qayd kuni — group selector */}
                          <td className="px-4 py-3 min-w-[180px]">
                            {teacher.groups.length <= 1 ? (
                              <span className="text-xs text-gray-600">
                                {teacher.groups[0]?.first_active_date
                                  ? `${fmtDate(teacher.groups[0].first_active_date)} (${teacher.groups[0].group_name ?? '?'})`
                                  : '—'}
                              </span>
                            ) : (
                              <select
                                value={selId}
                                onChange={e => setGroupSelections(prev => ({ ...prev, [teacher.teacher_id]: e.target.value }))}
                                className="text-xs border border-gray-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 max-w-[170px]"
                              >
                                <option value="all">{t('allGroups')}</option>
                                {teacher.groups.map(g => (
                                  <option key={g.salary_id} value={g.salary_id}>
                                    {g.first_active_date
                                      ? `${fmtDate(g.first_active_date)} (${g.group_name ?? '?'})`
                                      : `${t('noAccount')} (${g.group_name ?? '?'})`}
                                  </option>
                                ))}
                              </select>
                            )}
                          </td>
                          {/* Jami — clickable */}
                          <td className="px-4 py-3">
                            <button onClick={(e) => { e.stopPropagation(); setTeacherDetail(teacher); }}
                              className="font-bold text-blue-600 underline underline-offset-2 hover:text-blue-800 transition-colors whitespace-nowrap">
                              {formatCurrency(vals.jami)}
                            </button>
                          </td>
                          <td className="px-4 py-3 font-semibold text-emerald-600 whitespace-nowrap">
                            {vals.tolangan > 0 ? formatCurrency(vals.tolangan) : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-4 py-3 font-semibold whitespace-nowrap">
                            {vals.qoldiq > 0
                              ? <span className="text-red-600">{formatCurrency(vals.qoldiq)}</span>
                              : <span className="text-gray-400">—</span>}
                          </td>
                          {/* Status */}
                          <td className="px-4 py-3 min-w-[130px]">
                            {vals.status === 'paid' ? (
                              <span className="text-emerald-600 font-medium text-xs">{t('paidStatus')}</span>
                            ) : (
                              <span className="relative inline-block">
                                <span className={cn(
                                  'group-hover:hidden text-xs font-medium',
                                  vals.status === 'partial' ? 'text-orange-500' : 'text-amber-500',
                                )}>
                                  {vals.status === 'partial' ? t('partial') : t('unpaid')}
                                </span>
                                <button
                                  className="hidden group-hover:inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-500 text-white text-xs font-semibold rounded-lg hover:bg-emerald-600 transition-colors"
                                  onClick={(e) => { e.stopPropagation(); openTeacherPayModal(teacher, selId); }}>
                                  <Banknote className="w-3 h-3" /> {t('pay')}
                                </button>
                              </span>
                            )}
                          </td>
                          {/* Oxirgi muddat */}
                          <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                            {fmtDate(vals.dueDate)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Staff salary table ── */}
          {filteredStaffRows.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-900">{t('staffSection')}</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      {[t('tableHeaders.num'), t('tableHeaders.staff'), t('paymentDate'), t('tableHeaders.total'), t('tableHeaders.paid'), t('tableHeaders.remaining'), t('tableHeaders.status'), t('lastDate')].map((h, i) => (
                        <th key={i} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredStaffRows.map((row, idx) => {
                      const today   = new Date().toISOString().slice(0, 10);
                      const qoldiq  = Math.max(row.totalOwed, 0);
                      const overdue = row.status !== 'paid' && !!row.dueDate && row.dueDate < today;
                      const rowBg   = row.status === 'paid' ? 'bg-white' : overdue ? 'bg-[#FEF2F2]' : row.status === 'partial' ? 'bg-yellow-50' : 'bg-yellow-100';
                      return (
                        <tr key={row.id} className={cn('transition-colors group', rowBg)}>
                          <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-gray-900 whitespace-nowrap">{row.name}</p>
                            <p className="text-xs text-gray-500">{row.roleDisplay || '—'}</p>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{fmtDate(row.hiredAt)}</td>
                          <td className="px-4 py-3 font-bold text-gray-900 whitespace-nowrap">
                            {formatCurrency(row.calculatedAmount + row.carryOver)}
                          </td>
                          <td className="px-4 py-3 font-semibold text-emerald-600 whitespace-nowrap">
                            {row.paidAmount > 0 ? formatCurrency(row.paidAmount) : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-4 py-3 font-semibold whitespace-nowrap">
                            {qoldiq > 0 ? <span className="text-red-600">{formatCurrency(qoldiq)}</span> : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-4 py-3 min-w-[130px]">
                            {row.status === 'paid' ? (
                              <span className="text-emerald-600 font-medium text-xs">{t('paidStatus')}</span>
                            ) : (
                              <span className="relative inline-block">
                                <span className={cn('group-hover:hidden text-xs font-medium', row.status === 'partial' ? 'text-orange-500' : 'text-amber-500')}>
                                  {row.status === 'partial' ? t('partial') : t('unpaid')}
                                </span>
                                <button
                                  className="hidden group-hover:inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-500 text-white text-xs font-semibold rounded-lg hover:bg-emerald-600 transition-colors"
                                  onClick={() => openPayModal(row)}>
                                  <Banknote className="w-3 h-3" /> {t('pay')}
                                </button>
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                            {fmtDate(row.dueDate)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════ TAB 2: TO'LOVLAR TARIXI ════════════ */}
      {activeTab === 'history' && (
        <div className="space-y-5">
          {(() => {
            const filteredExp = histCategory === 'all'
              ? expenses
              : expenses.filter(e => e.category === histCategory);
            function parseDesc(desc: string): { name: string; group: string } {
              const parenIdx = desc.indexOf('(');
              if (parenIdx !== -1) {
                const closeIdx = desc.indexOf(')', parenIdx);
                return {
                  name:  desc.slice(0, parenIdx).trim(),
                  group: closeIdx !== -1 ? desc.slice(parenIdx + 1, closeIdx) : '—',
                };
              }
              const dashIdx = desc.indexOf(' — ');
              return { name: dashIdx !== -1 ? desc.slice(0, dashIdx) : desc, group: '—' };
            }
            return (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <input type="month" value={histMonth} onChange={e => setHistMonth(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                  <select value={histCategory} onChange={e => setHistCategory(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none text-gray-700">
                    <option value="all">{common('all')}</option>
                    <option value="teacher_salary">{t('categoryTeacher')}</option>
                    <option value="staff_salary">{t('categoryStaff')}</option>
                  </select>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  {loadingHist ? (
                    <div className="p-4 space-y-2">{Array(5).fill(0).map((_, i) => <Skel key={i} />)}</div>
                  ) : filteredExp.length === 0 ? (
                    <p className="px-5 py-10 text-sm text-gray-400 text-center">{t('noHistory')}</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-200">
                            {[t('tableHeaders.num'), t('tableHeaders.name'), t('tableHeaders.group'), t('tableHeaders.category'), t('tableHeaders.amount'), t('tableHeaders.date')].map((h, i) => (
                              <th key={i} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {filteredExp.map((exp, idx) => {
                            const parsed = parseDesc(exp.description || '');
                            return (
                              <tr key={exp.id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                                <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{parsed.name}</td>
                                <td className="px-4 py-3 text-xs text-gray-600">{parsed.group}</td>
                                <td className="px-4 py-3">
                                  <span className={cn('inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full',
                                    exp.category === 'teacher_salary' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-700')}>
                                    {exp.category === 'teacher_salary' ? t('categoryTeacher') : t('categoryStaff')}
                                  </span>
                                </td>
                                <td className="px-4 py-3 font-semibold text-emerald-600 whitespace-nowrap">{formatCurrency(exp.amount)}</td>
                                <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fmtDate(exp.expense_date)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* ══ Teacher Detail Modal ══ */}
      <Dialog open={!!teacherDetail} onOpenChange={open => { if (!open) setTeacherDetail(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{teacherDetail?.teacher_name} — {t('detail')}</DialogTitle>
          </DialogHeader>
          {teacherDetail && (() => {
            const td = teacherDetail;
            const remaining = Math.max(td.total_owed - td.total_paid, 0);
            const Row = ({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) => (
              <div className="flex justify-between items-center py-1.5">
                <span className="text-sm text-gray-500">{label}</span>
                <span className={cn('text-sm font-medium text-gray-900', valueClass)}>{value}</span>
              </div>
            );
            return (
              <div className="mt-1 space-y-3">
                <div className="space-y-0.5">
                  <Row label={t('salarySubject')} value={td.teacher_subject || '—'} />
                  <Row label={t('salaryTypeLabel')} value={
                    td.salary_type === 'fixed' ? t('salaryFixed') :
                    td.salary_type === 'percent' ? t('salaryPercent', { pct: td.salary_percent ?? 0 }) :
                    t('salaryPerStudent')
                  } />
                  <Row label={t('groups')} value={
                    td.groups.length > 0
                      ? `${td.groups.length}ta (${td.groups.map(g => g.group_name).filter(Boolean).join(', ')})`
                      : '—'
                  } />
                </div>

                {td.salary_type === 'fixed' ? (
                  <>
                    <hr className="border-gray-100" />
                    <Row label={t('fixedMonthly')} value={formatCurrency(td.fixed_amount ?? 0)} />
                    {td.groups.map(g => (
                      <div key={g.group_id ?? g.salary_id}>
                        <hr className="border-gray-100" />
                        <div className="space-y-1 mt-2">
                          <p className="text-xs font-semibold text-gray-700 mb-1">
                            ({g.group_name ?? '?'}) — {g.course_name ?? '—'}
                          </p>
                          <Row label={t('studentsCount')} value={`${g.student_count} ta`} />
                        </div>
                      </div>
                    ))}
                  </>
                ) : td.groups.filter(g => g.student_count > 0 || g.course_price > 0).length === 0 ? (
                  <div className="py-3 text-sm text-gray-400 text-center">{t('noCalcData')}</div>
                ) : td.groups.filter(g => g.student_count > 0 || g.course_price > 0).map((g, i) => (
                  <div key={g.salary_id}>
                    <hr className="border-gray-100" />
                    <div className="space-y-1 mt-2">
                      <p className="text-xs font-semibold text-gray-700 mb-1">
                        ({g.group_name ?? '?'}) — {g.course_name ?? '—'}
                      </p>
                      {td.salary_type === 'percent' && (() => {
                        const perStudent = g.course_price * (td.salary_percent ?? 0) / 100;
                        return (<>
                          <Row label={t('studentsCount')} value={`${g.student_count} ta`} />
                          <Row label={t('coursePrice')} value={formatCurrency(g.course_price)} />
                          <Row label={t('perStudentAmount')} value={formatCurrency(perStudent)} />
                          <Row
                            label={t('calculated2')}
                            value={`${g.student_count} × ${formatCurrency(perStudent)} = ${formatCurrency(g.student_count * perStudent)}`}
                          />
                        </>);
                      })()}
                      {td.salary_type === 'per_student' && (() => {
                        const perAmt = td.per_student_amt ?? 0;
                        return (<>
                          <Row label={t('studentsCount')} value={`${g.student_count} ta`} />
                          <Row label={t('perStudentAmount')} value={formatCurrency(perAmt)} />
                          <Row
                            label={t('calculated2')}
                            value={`${g.student_count} × ${formatCurrency(perAmt)} = ${formatCurrency(g.student_count * perAmt)}`}
                          />
                        </>);
                      })()}
                      {g.kpi_amount > 0 && i === 0 && (
                        <Row label="KPI bonus" value={`+${formatCurrency(g.kpi_amount)}`} valueClass="text-blue-600" />
                      )}
                    </div>
                  </div>
                ))}

                <hr className="border-gray-100" />

                {td.kpi_amount > 0 ? (
                  <Row label="KPI" value={`+${formatCurrency(td.kpi_amount)}`} valueClass="text-blue-600" />
                ) : (
                  <Row label="KPI" value="0" valueClass="text-gray-400" />
                )}

                <hr className="border-gray-100" />

                <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                  <div className="flex justify-between items-center pt-0.5">
                    <span className="text-sm font-bold text-gray-900">{t('totalLabel')}</span>
                    <span className="text-base font-bold text-gray-900">{formatCurrency(td.total_owed)}</span>
                  </div>
                  <Row label={t('tableHeaders.paid')} value={formatCurrency(td.total_paid)} valueClass="text-emerald-600" />
                  <Row label={t('tableHeaders.remaining')} value={formatCurrency(remaining)} valueClass={remaining > 0 ? 'text-red-600' : 'text-emerald-600'} />
                </div>

                <div className="flex gap-3 pt-1">
                  <button onClick={() => setTeacherDetail(null)}
                    className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
                    {common('close')}
                  </button>
                  {td.overall_status !== 'paid' && (
                    <button
                      onClick={() => { setTeacherDetail(null); openTeacherPayModal(td, getSelection(td.teacher_id)); }}
                      className="flex-1 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors">
                      {t('pay')}
                    </button>
                  )}
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ══ Teacher Pay Modal ══ */}
      <Dialog open={!!teacherPay} onOpenChange={open => { if (!open) { setTeacherPay(null); setBulkAmounts({}); } }}>
        <DialogContent className="sm:max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('payModalTitle', { name: teacherPay?.teacher.teacher_name ?? '' })}</DialogTitle>
          </DialogHeader>
          {teacherPay && (() => {
            const { teacher, selectionId } = teacherPay;

            // ── Fixed salary: staff-style single payment ──
            if (teacher.salary_type === 'fixed') {
              const fixedId = teacher.groups[0]?.salary_id ?? selectionId;
              const rem = Math.max(teacher.total_owed - teacher.total_paid, 0);
              const amt = parseAmount(bulkAmounts[fixedId] || '0');
              const preview = amt >= rem && rem > 0 ? 'paid' : amt >= 10000 ? 'partial' : null;
              return (
                <div className="mt-2 space-y-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">{t('calculated')}</span>
                    <span className="font-semibold text-gray-900">{formatCurrency(teacher.total_calculated)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">{t('remaining')}</span>
                    <span className="font-semibold text-red-600">{formatCurrency(rem)}</span>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-gray-700">{t('payAmount')} (so&apos;m)</label>
                    <input
                      type="text" inputMode="numeric"
                      value={bulkAmounts[fixedId] ?? ''}
                      onChange={e => setBulkAmounts({ [fixedId]: formatAmount(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="0"
                    />
                    <p className="text-xs text-gray-400">Min: 10,000 | Max: {formatCurrency(rem)} so&apos;m</p>
                    {preview === 'paid' && <p className="text-xs text-green-600">✓ {t('fullPay')}</p>}
                    {preview === 'partial' && <p className="text-xs text-yellow-600">~ {t('partialPay')}</p>}
                  </div>
                  <div className="flex gap-3 pt-1">
                    <button onClick={() => { setTeacherPay(null); setBulkAmounts({}); }}
                      className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50">
                      {common('cancel')}
                    </button>
                    <button disabled={bulkPaying || amt < 10000 || amt > rem}
                      onClick={async () => {
                        setBulkPaying(true);
                        try {
                          await api.post(`/api/v1/teacher-salaries/${fixedId}/pay/`, { amount: amt });
                          setTeacherPay(null); setBulkAmounts({});
                          loadSalaries();
                        } catch (e: unknown) {
                          const err = e as { response?: { data?: { error?: string } } };
                          toast.error(err?.response?.data?.error || common('error'));
                        } finally { setBulkPaying(false); }
                      }}
                      className="flex-1 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-60">
                      {bulkPaying ? common('loading') : common('confirm')}
                    </button>
                  </div>
                </div>
              );
            }

            // ── Percent / per_student: per-group payment ──
            const isAll = selectionId === 'all';
            const payableGroups = isAll
              ? teacher.groups.filter(g => g.status !== 'paid')
              : teacher.groups.filter(g => g.salary_id === selectionId && g.status !== 'paid');
            const totalAmt = payableGroups.reduce((s, g) => s + parseAmount(bulkAmounts[g.salary_id] || '0'), 0);
            return (
              <div className="mt-2 space-y-4">
                {payableGroups.map(g => {
                  const rem = Math.max(g.total_owed - g.paid_amount, 0);
                  return (
                    <div key={g.salary_id} className="space-y-1.5">
                      <p className="text-sm font-medium text-gray-700">
                        ({g.group_name ?? '?'}) {g.course_name ?? '—'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {t('remaining2')}: <span className="font-semibold text-red-600">{formatCurrency(rem)}</span>
                      </p>
                      <input
                        type="text" inputMode="numeric"
                        value={bulkAmounts[g.salary_id] ?? ''}
                        onChange={e => setBulkAmounts(prev => ({ ...prev, [g.salary_id]: formatAmount(e.target.value) }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="0"
                      />
                      <p className="text-xs text-gray-400">Min: 10,000 | Max: {formatCurrency(rem)}</p>
                    </div>
                  );
                })}
                {isAll && payableGroups.length > 1 && (
                  <div className="flex justify-between items-center pt-1 border-t border-gray-200">
                    <span className="text-sm font-semibold text-gray-700">{t('totalPayment')}</span>
                    <span className="text-sm font-bold text-gray-900">{formatCurrency(totalAmt)}</span>
                  </div>
                )}
                <div className="flex gap-3 pt-1">
                  <button onClick={() => { setTeacherPay(null); setBulkAmounts({}); }}
                    className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
                    {common('cancel')}
                  </button>
                  <button onClick={handleTeacherPay} disabled={bulkPaying}
                    className="flex-1 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-60 transition-colors">
                    {bulkPaying ? common('loading') : common('confirm')}
                  </button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ══ Sobiq Teacher Modal ══ */}
      <Dialog open={!!sobiqSalary} onOpenChange={open => { if (!open) { setSobiqSalary(null); setSobiqBreakdown(null); } }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{sobiqBreakdown?.teacher_name ?? sobiqSalary?.teacher.teacher_name} — {t('sobiqTeacherModalTitle')}</DialogTitle>
            {sobiqBreakdown?.group_name && (
              <p className="text-xs text-gray-500 mt-0.5">{sobiqBreakdown.group_name} · {sobiqBreakdown.course_name}</p>
            )}
          </DialogHeader>

          {sobiqLoading ? (
            <div className="space-y-2 mt-4">
              {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : sobiqBreakdown && (
            <div className="mt-2 space-y-4">
              <div className="text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded">
                {t('archivedAt')}: {sobiqBreakdown.archived_at}
              </div>

              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-blue-300 bg-blue-50 text-blue-700 text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                {t('billingTypeLabel')}: {
                  sobiqBreakdown.billing_type === 'full'       ? t('billingFull') :
                  sobiqBreakdown.billing_type === 'manual'     ? t('billingManual') :
                  sobiqBreakdown.billing_type === 'per_day'    ? t('billingPerDay') :
                  t('billingPerLesson')
                }
              </div>

              <div className="border border-gray-100 rounded-lg p-4 space-y-0">
                {/* Helper: one row */}
                {(() => {
                  const bd = sobiqBreakdown;
                  const Row = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => (
                    <div className="flex justify-between text-sm py-1">
                      <span className="text-gray-700">{label}</span>
                      <span className={bold ? 'font-bold text-blue-600' : 'font-medium text-gray-900'}>{value}</span>
                    </div>
                  );
                  const fc = (n: number) => formatCurrency(n);
                  const n  = (v: number) => v.toLocaleString('uz-UZ');

                  if (bd.billing_type === 'full') {
                    return (
                      <Row label={t('salaryAmount')} value={fc(bd.full_monthly_salary)} bold />
                    );
                  }

                  if (bd.billing_type === 'manual') {
                    return (
                      <Row label={t('salaryAmount')} value={fc(bd.calculated_amount ?? 0)} bold />
                    );
                  }

                  if (bd.billing_type === 'per_day' && bd.per_unit !== null) {
                    return (
                      <>
                        <Row label={t('fullMonthlySalary')} value={fc(bd.full_monthly_salary)} />
                        <Row label={t('perDayAmount')}       value={`${fc(bd.full_monthly_salary)} / 30 = ${fc(bd.per_unit)}`} />
                        <Row label={t('daysWorked')}         value={`${bd.units_count} ${t('days')}`} />
                        <div className="border-t border-gray-200 my-1" />
                        <Row label={t('calculatedSalary')}  value={`${fc(bd.per_unit)} × ${bd.units_count} = ${fc(bd.raw_amount ?? 0)}`} />
                        <Row label={t('salaryAmount')}       value={fc(bd.calculated_amount ?? 0)} bold />
                      </>
                    );
                  }

                  if (bd.billing_type === 'per_lesson' && bd.per_unit !== null) {
                    const totalU = bd.total_units ?? 0;
                    return (
                      <>
                        {/* Build-up to full monthly depending on salary_type */}
                        {bd.salary_type === 'percent' && bd.students_count > 0 && (
                          <>
                            <Row label={t('groupRevenue')}
                                 value={`${n(bd.students_count)} × ${fc(bd.course_price)} = ${fc(bd.group_revenue)}`} />
                            <Row label={t('teacherShare')}
                                 value={`${fc(bd.group_revenue)} × ${bd.salary_percent}% = ${fc(bd.full_monthly_salary)}`} />
                          </>
                        )}
                        {bd.salary_type === 'per_student' && bd.students_count > 0 && (
                          <>
                            <Row label={t('perStudentRate')} value={fc(bd.per_student_amt)} />
                            <Row label={t('studentsCount')}  value={`${n(bd.students_count)}`} />
                            <Row label={t('fullMonthlySalary')}
                                 value={`${n(bd.students_count)} × ${fc(bd.per_student_amt)} = ${fc(bd.full_monthly_salary)}`} />
                          </>
                        )}
                        {bd.salary_type === 'fixed' && (
                          <Row label={t('fullMonthlySalary')} value={fc(bd.full_monthly_salary)} />
                        )}

                        <Row label={t('perLessonAmount')}
                             value={`${fc(bd.full_monthly_salary)} / ${totalU} = ${fc(bd.per_unit)}`} />
                        <Row label={t('lessonsTeached')}
                             value={`${bd.units_count} / ${totalU} ${t('lessons')}`} />
                        <div className="border-t border-gray-200 my-1" />
                        <Row label={t('calculatedSalary')}
                             value={`${fc(bd.per_unit)} × ${bd.units_count} = ${fc(bd.raw_amount ?? 0)}`} />
                        <Row label={t('salaryAmount')} value={fc(bd.calculated_amount ?? 0)} bold />
                      </>
                    );
                  }

                  return null;
                })()}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ══ Staff Pay Modal ══ */}
      <Dialog open={!!payTarget} onOpenChange={open => { if (!open) setPayTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('payModalTitle', { name: payTarget?.name ?? '' })}</DialogTitle>
          </DialogHeader>
          {payTarget && (() => {
            const amt     = parseAmount(payAmount);
            const preview = amt >= payTarget.totalOwed ? 'paid' : amt >= 10000 ? 'partial' : null;
            return (
              <div className="mt-2 space-y-4">
                <div className="text-sm text-gray-600 space-y-1.5 bg-gray-50 rounded-lg px-3 py-3">
                  <div className="flex justify-between">
                    <span>{t('calculated')}</span>
                    <span className="font-semibold text-gray-900">{formatCurrency(payTarget.calculatedAmount)}</span>
                  </div>
                  {payTarget.carryOver > 0 && (
                    <div className="flex justify-between text-orange-600 text-xs">
                      <span>{t('prevMonthDebt')}</span>
                      <span className="font-semibold">{formatCurrency(payTarget.carryOver)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold border-t border-gray-200 pt-1.5">
                    <span>{t('remaining2')}</span>
                    <span className="text-red-600">{formatCurrency(payTarget.totalOwed)}</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('paymentAmount')}</label>
                  <input type="text" inputMode="numeric" value={payAmount}
                    onChange={e => setPayAmount(formatAmount(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="0" autoFocus />
                  <p className="text-xs text-gray-400 mt-1">Min: 10,000 | Max: {formatCurrency(payTarget.totalOwed)}</p>
                  {preview && (
                    <p className={cn('text-xs mt-1 font-medium', preview === 'paid' ? 'text-emerald-600' : 'text-orange-500')}>
                      {preview === 'paid' ? t('fullPaid') : t('partialRemaining', { rem: formatCurrency(payTarget.totalOwed - amt) })}
                    </p>
                  )}
                </div>
                <div className="flex gap-3 pt-1">
                  <button onClick={() => setPayTarget(null)}
                    className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
                    {common('cancel')}
                  </button>
                  <button onClick={handlePay} disabled={paying}
                    className="flex-1 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-60 transition-colors">
                    {paying ? common('loading') : common('confirm')}
                  </button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

    </div>
  );
}
