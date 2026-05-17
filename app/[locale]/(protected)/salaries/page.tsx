'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Banknote, ChevronDown, ChevronUp, Plus, Search,
  X, Check, AlertCircle,
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import api from '@/lib/axios';
import { cn, formatCurrency } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TeacherSalaryData {
  id: string;
  teacher_name: string;
  teacher_subject: string;
  salary_type: string;
  students_count: number;
  calculated_amount: number;
  carry_over: number;
  paid_amount: number;
  total_owed: number;
  status: 'unpaid' | 'partial' | 'paid';
  is_paid: boolean;
  paid_at: string | null;
}

interface StaffSalaryData {
  id: string;
  staff: string;
  staff_name: string;
  staff_role: string;
  staff_role_key: string;
  staff_phone: string;
  contract_type: string;
  calculated_amount: number;
  carry_over: number;
  paid_amount: number;
  total_owed: number;
  status: 'unpaid' | 'partial' | 'paid';
  is_paid: boolean;
  paid_at: string | null;
}

interface StaffMember {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string;
  role: string;
  role_display: string;
  contract_type: string;
  contract_display: string;
  salary_amount: number;
  contract_months: number | null;
  contract_start: string | null;
  contract_end: string | null;
  status: string;
}

interface SalaryRow {
  id: string;
  entityType: 'teacher' | 'staff';
  name: string;
  roleDisplay: string;
  badgeText: string;
  badgeStyle: string;
  salaryTypeText: string;
  salaryTypeStyle: string;
  calculatedAmount: number;
  carryOver: number;
  paidAmount: number;
  totalOwed: number;
  status: 'unpaid' | 'partial' | 'paid';
}

interface ExpenseItem {
  id: string;
  category: string;
  amount: number;
  description: string;
  expense_date: string;
}

interface StaffForm {
  first_name: string;
  last_name: string;
  phone: string;
  role: string;
  contract_type: 'monthly' | 'contract';
  salary_amount: string;
  contract_months: string;
  contract_start: string;
  notes: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  admin:      'Admin',
  manager:    'Menejer',
  accountant: 'Buxgalter',
  security:   'Qorovul',
  cleaner:    'Farrosh',
  supply:     'Zavxoz',
  other:      'Boshqa',
};

const ROLE_BADGE: Record<string, string> = {
  teacher:    'bg-blue-50 text-blue-700',
  admin:      'bg-gray-100 text-gray-700',
  manager:    'bg-purple-50 text-purple-700',
  accountant: 'bg-emerald-50 text-emerald-700',
  security:   'bg-orange-50 text-orange-700',
  cleaner:    'bg-teal-50 text-teal-700',
  supply:     'bg-yellow-50 text-yellow-700',
  other:      'bg-gray-50 text-gray-500',
};

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  cash: 'Naqd', card: 'Karta', transfer: "O'tkazma",
};

function currentMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function blankStaffForm(): StaffForm {
  return {
    first_name: '', last_name: '', phone: '', role: 'admin',
    contract_type: 'monthly', salary_amount: '', contract_months: '',
    contract_start: '', notes: '',
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SalariesPage() {
  const [activeTab, setActiveTab] = useState<'debts' | 'history'>('debts');

  // ── Tab 1 state ──────────────────────────────────────────────────────────────
  const [month, setMonth]               = useState(currentMonthStr);
  const [typeFilter, setTypeFilter]     = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [teacherSals, setTeacherSals]   = useState<TeacherSalaryData[]>([]);
  const [staffSals, setStaffSals]       = useState<StaffSalaryData[]>([]);
  const [staffList, setStaffList]       = useState<StaffMember[]>([]);
  const [loadingSals, setLoadingSals]   = useState(true);
  const [generating, setGenerating]     = useState(false);

  // Staff management section
  const [staffOpen, setStaffOpen]       = useState(false);
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [staffForm, setStaffForm]       = useState<StaffForm>(blankStaffForm);
  const [savingStaff, setSavingStaff]   = useState(false);
  const [archivingId, setArchivingId]   = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<StaffMember | null>(null);

  // Payment modal
  const [payTarget, setPayTarget]       = useState<SalaryRow | null>(null);
  const [payAmount, setPayAmount]       = useState('');
  const [payType, setPayType]           = useState<'cash' | 'card' | 'transfer'>('cash');
  const [paying, setPaying]             = useState(false);

  // ── Tab 2 state ──────────────────────────────────────────────────────────────
  const [histMonth, setHistMonth]       = useState(currentMonthStr);
  const [expenses, setExpenses]         = useState<ExpenseItem[]>([]);
  const [loadingHist, setLoadingHist]   = useState(false);

  // ── Fetchers ─────────────────────────────────────────────────────────────────

  const loadSalaries = useCallback(async () => {
    setLoadingSals(true);
    const [tRes, sRes, staffRes] = await Promise.allSettled([
      api.get(`/api/v1/teacher-salaries/?month=${month}`),
      api.get(`/api/v1/staff-salaries/?month=${month}`),
      api.get(`/api/v1/staff/?status=active`),
    ]);
    if (tRes.status === 'fulfilled') setTeacherSals(tRes.value.data.results ?? tRes.value.data);
    if (sRes.status === 'fulfilled') setStaffSals(sRes.value.data.results ?? sRes.value.data);
    if (staffRes.status === 'fulfilled') setStaffList(staffRes.value.data.results ?? staffRes.value.data);
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
      toast.error("Tarix yuklanmadi");
    } finally {
      setLoadingHist(false);
    }
  }, [histMonth]);

  useEffect(() => { loadSalaries(); }, [loadSalaries]);
  useEffect(() => { if (activeTab === 'history') loadHistory(); }, [activeTab, loadHistory]);

  // ── Generate handler ─────────────────────────────────────────────────────────

  async function handleGenerate() {
    setGenerating(true);
    try {
      const [tRes, sRes] = await Promise.allSettled([
        api.post(`/api/v1/teacher-salaries/calculate/?month=${month}`),
        api.post(`/api/v1/staff-salaries/generate/?month=${month}`),
      ]);
      const tCount = tRes.status === 'fulfilled' ? (tRes.value.data.created?.length ?? 0) : 0;
      const sCount = sRes.status === 'fulfilled' ? (sRes.value.data.created?.length ?? 0) : 0;
      toast.success(`${tCount + sCount} ta maosh hisoblandi`);
      loadSalaries();
    } catch {
      toast.error('Xatolik');
    } finally {
      setGenerating(false);
    }
  }

  // ── Pay handler ───────────────────────────────────────────────────────────────

  function openPayModal(row: SalaryRow) {
    const remaining = row.totalOwed - row.paidAmount;
    setPayTarget(row);
    setPayAmount(String(remaining > 0 ? remaining : row.totalOwed));
    setPayType('cash');
  }

  async function handlePay() {
    if (!payTarget) return;
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) { toast.error('Summani kiriting'); return; }
    if (amount < 10000) { toast.error("Minimal to'lov 10,000 so'm"); return; }
    setPaying(true);
    try {
      const endpoint = payTarget.entityType === 'teacher'
        ? `/api/v1/teacher-salaries/${payTarget.id}/pay/`
        : `/api/v1/staff-salaries/${payTarget.id}/pay/`;
      const { data: updated } = await api.post(endpoint, { amount, payment_type: payType });
      toast.success("Maosh muvaffaqiyatli to'landi");
      setPayTarget(null);
      // Update local state
      if (payTarget.entityType === 'teacher') {
        setTeacherSals(prev => prev.map(s => s.id === payTarget.id ? updated : s));
      } else {
        setStaffSals(prev => prev.map(s => s.id === payTarget.id ? updated : s));
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e?.response?.data?.error || 'Xatolik');
    } finally {
      setPaying(false);
    }
  }

  // ── Staff handlers ────────────────────────────────────────────────────────────

  async function handleAddStaff(e: React.FormEvent) {
    e.preventDefault();
    if (!staffForm.salary_amount || parseFloat(staffForm.salary_amount) < 100000) {
      toast.error("Oylik kamida 100,000 so'm bo'lishi kerak"); return;
    }
    setSavingStaff(true);
    try {
      const body: Record<string, unknown> = {
        first_name: staffForm.first_name,
        last_name:  staffForm.last_name,
        phone:      staffForm.phone,
        role:       staffForm.role,
        contract_type: staffForm.contract_type,
        salary_amount: parseFloat(staffForm.salary_amount),
        notes: staffForm.notes || null,
      };
      if (staffForm.contract_type === 'contract') {
        body.contract_months = parseInt(staffForm.contract_months);
        body.contract_start  = staffForm.contract_start;
      }
      await api.post('/api/v1/staff/', body);
      toast.success("Xodim qo'shildi");
      setShowAddStaff(false);
      setStaffForm(blankStaffForm());
      loadSalaries();
    } catch (err: unknown) {
      const e = err as { response?: { data?: unknown } };
      const detail = e?.response?.data;
      toast.error(typeof detail === 'object' ? JSON.stringify(detail) : 'Xatolik');
    } finally {
      setSavingStaff(false);
    }
  }

  async function handleArchive(staff: StaffMember) {
    setArchivingId(staff.id);
    try {
      await api.patch(`/api/v1/staff/${staff.id}/archive/`);
      toast.success(`${staff.full_name} arxivlandi`);
      setConfirmArchive(null);
      loadSalaries();
    } catch {
      toast.error('Xatolik');
    } finally {
      setArchivingId(null);
    }
  }

  // ── Derived data ──────────────────────────────────────────────────────────────

  const allRows = useMemo<SalaryRow[]>(() => {
    const teachers: SalaryRow[] = teacherSals.map(s => ({
      id:               s.id,
      entityType:       'teacher',
      name:             s.teacher_name,
      roleDisplay:      s.teacher_subject || '—',
      badgeText:        "O'qituvchi",
      badgeStyle:       ROLE_BADGE.teacher,
      salaryTypeText:   s.salary_type === 'fixed' ? 'Belgilangan' : s.salary_type === 'percent' ? 'Foizli' : "O'quvchi boshiga",
      salaryTypeStyle:  s.salary_type === 'fixed' ? 'bg-gray-100 text-gray-600' : s.salary_type === 'percent' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600',
      calculatedAmount: Number(s.calculated_amount),
      carryOver:        Number(s.carry_over),
      paidAmount:       Number(s.paid_amount),
      totalOwed:        Number(s.total_owed ?? s.calculated_amount),
      status:           s.status,
    }));

    const staff: SalaryRow[] = staffSals.map(s => ({
      id:               s.id,
      entityType:       'staff',
      name:             s.staff_name,
      roleDisplay:      s.staff_role || '—',
      badgeText:        s.staff_role || 'Xodim',
      badgeStyle:       ROLE_BADGE[s.staff_role_key] ?? ROLE_BADGE.other,
      salaryTypeText:   s.contract_type === 'monthly' ? 'Oylik' : 'Shartnomaviy',
      salaryTypeStyle:  s.contract_type === 'monthly' ? 'bg-gray-100 text-gray-600' : 'bg-purple-50 text-purple-600',
      calculatedAmount: Number(s.calculated_amount),
      carryOver:        Number(s.carry_over),
      paidAmount:       Number(s.paid_amount),
      totalOwed:        Number(s.calculated_amount) + Number(s.carry_over) - Number(s.paid_amount),
      status:           s.status,
    }));

    return [...teachers, ...staff];
  }, [teacherSals, staffSals]);

  const filteredRows = useMemo(() => {
    let rows = allRows;
    if (typeFilter === 'teachers') rows = rows.filter(r => r.entityType === 'teacher');
    if (typeFilter === 'staff')    rows = rows.filter(r => r.entityType === 'staff');
    if (statusFilter !== 'all')    rows = rows.filter(r => r.status === statusFilter);
    return rows;
  }, [allRows, typeFilter, statusFilter]);

  const totalCalculated = allRows.reduce((s, r) => s + r.calculatedAmount + r.carryOver, 0);
  const totalPaid       = allRows.reduce((s, r) => s + r.paidAmount, 0);
  const totalRemaining  = allRows.filter(r => r.status !== 'paid').reduce((s, r) => s + (r.totalOwed - r.paidAmount), 0);

  function rowBg(row: SalaryRow) {
    if (row.calculatedAmount === 0 && row.carryOver === 0) return 'bg-gray-50';
    if (row.status === 'paid')    return 'bg-white';
    if (row.status === 'partial') return 'bg-orange-50';
    return 'bg-yellow-50';
  }

  const Skel = ({ w }: { w?: string }) => <Skeleton className={cn('h-4 rounded', w ?? 'w-full')} />;

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5 pb-12">
      <Toaster position="top-right" />

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Maoshlar</h1>
          <p className="text-sm text-gray-500 mt-0.5">O&apos;qituvchi va xodimlar maoshi</p>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 border-b border-gray-200">
        {([
          { id: 'debts',   label: '💰 Maosh qarzdorligi' },
          { id: 'history', label: "📋 To'lovlar tarixi" },
        ] as const).map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700',
            )}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ════════════════ TAB 1: MAOSH QARZDORLIGI ════════════════ */}
      {activeTab === 'debts' && (
        <div className="space-y-5">

          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-2">
            <input type="month" value={month} onChange={e => setMonth(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />

            <button onClick={handleGenerate} disabled={generating}
              className="px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {generating ? 'Hisoblanmoqda...' : 'Hisoblash'}
            </button>

            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium ml-auto">
              {([
                { v: 'all',      label: 'Barchasi' },
                { v: 'teachers', label: "O'qituvchilar" },
                { v: 'staff',    label: 'Xodimlar' },
              ] as const).map(({ v, label }) => (
                <button key={v} onClick={() => setTypeFilter(v)}
                  className={cn('px-3 py-2 transition-colors border-r border-gray-200 last:border-0',
                    typeFilter === v ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-blue-50')}>
                  {label}
                </button>
              ))}
            </div>

            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
              {([
                { v: 'all',     label: 'Barchasi' },
                { v: 'unpaid',  label: "To'lanmagan" },
                { v: 'partial', label: 'Qisman' },
                { v: 'paid',    label: "To'langan" },
              ] as const).map(({ v, label }) => (
                <button key={v} onClick={() => setStatusFilter(v)}
                  className={cn('px-3 py-2 transition-colors border-r border-gray-200 last:border-0',
                    statusFilter === v ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-blue-50')}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Jami hisoblangan', value: totalCalculated, color: 'text-gray-900', bg: 'bg-gray-50 border-gray-200' },
              { label: "To'langan",        value: totalPaid,       color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
              { label: 'Qolgan',           value: totalRemaining,  color: 'text-red-600', bg: 'bg-red-50 border-red-200' },
            ].map(({ label, value, color, bg }) => (
              <div key={label} className={cn('rounded-xl border p-4', bg)}>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
                {loadingSals
                  ? <Skel w="w-32 mt-1" />
                  : <p className={cn('text-xl font-bold mt-1', color)}>{formatCurrency(value)}</p>}
              </div>
            ))}
          </div>

          {/* Staff management — collapsible */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <button onClick={() => setStaffOpen(o => !o)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors">
              <span className="text-sm font-semibold text-gray-900">Xodimlar ro&apos;yxati</span>
              <div className="flex items-center gap-2">
                <button onClick={e => { e.stopPropagation(); setShowAddStaff(true); }}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                  <Plus className="w-3 h-3" /> Qo&apos;shish
                </button>
                {staffOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </div>
            </button>

            {staffOpen && (
              <div className="border-t border-gray-100 overflow-x-auto">
                {loadingSals ? (
                  <div className="p-4 space-y-2">{Array(3).fill(0).map((_, i) => <Skel key={i} />)}</div>
                ) : staffList.length === 0 ? (
                  <p className="px-5 py-8 text-sm text-gray-400 text-center">Xodimlar yo&apos;q</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        {['№', 'Ism', 'Lavozim', 'Shartnoma turi', 'Oylik', 'Muddat', 'Holat', 'Amal'].map((h, i) => (
                          <th key={i} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {staffList.map((s, idx) => (
                        <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                          <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">{s.full_name}</td>
                          <td className="px-4 py-3">
                            <span className={cn('inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full', ROLE_BADGE[s.role] ?? ROLE_BADGE.other)}>
                              {s.role_display}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-xs">{s.contract_display}</td>
                          <td className="px-4 py-3 font-semibold text-gray-900">{formatCurrency(s.salary_amount)}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">
                            {s.contract_type === 'contract' && s.contract_end
                              ? `${s.contract_start?.slice(0,7)} → ${s.contract_end?.slice(0,7)}`
                              : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn('inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full',
                              s.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500')}>
                              {s.status === 'active' ? 'Faol' : 'Arxivlangan'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <button onClick={() => setConfirmArchive(s)}
                              className="text-xs text-red-500 hover:text-red-700 hover:underline">
                              Arxiv
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>

          {/* Salary table */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Maosh jadvali</h2>
            </div>
            {loadingSals ? (
              <div className="p-4 space-y-2">{Array(5).fill(0).map((_, i) => <Skel key={i} />)}</div>
            ) : filteredRows.length === 0 ? (
              <p className="px-5 py-10 text-sm text-gray-400 text-center">
                Bu davr uchun maosh mavjud emas
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      {['№', 'Ism', 'Lavozim/Fan', 'Tur', 'Hisoblangan', "O'tgan oy qarzi", 'Jami', "To'langan", 'Qoldiq', 'Holat'].map((h, i) => (
                        <th key={i} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredRows.map((row, idx) => {
                      const jami    = row.calculatedAmount + row.carryOver;
                      const qoldiq  = row.totalOwed - row.paidAmount;
                      const isEmpty = jami === 0;
                      return (
                        <tr key={row.id} className={cn('transition-colors group', rowBg(row))}>
                          <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                          <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">{row.name}</td>
                          <td className="px-4 py-3 text-gray-600 text-xs">{row.roleDisplay}</td>
                          <td className="px-4 py-3">
                            <span className={cn('inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full', row.badgeStyle)}>
                              {row.badgeText}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-700 font-medium">{formatCurrency(row.calculatedAmount)}</td>
                          <td className="px-4 py-3">
                            {row.carryOver > 0
                              ? <span className="text-orange-600 font-semibold">{formatCurrency(row.carryOver)}</span>
                              : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-4 py-3 font-bold text-gray-900">{formatCurrency(jami)}</td>
                          <td className="px-4 py-3 font-semibold text-emerald-600">
                            {row.paidAmount > 0 ? formatCurrency(row.paidAmount) : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-4 py-3 font-semibold">
                            {qoldiq > 0
                              ? <span className="text-red-600">{formatCurrency(qoldiq)}</span>
                              : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-4 py-3 min-w-[130px]">
                            {isEmpty ? (
                              <span className="text-gray-400 text-xs">—</span>
                            ) : row.status === 'paid' ? (
                              <span className="text-emerald-600 font-medium text-xs">To&apos;langan ✓</span>
                            ) : row.status === 'partial' ? (
                              <span className="relative inline-block">
                                <span className="group-hover:hidden text-orange-500 font-medium text-xs">Qisman</span>
                                <button
                                  className="hidden group-hover:inline-flex items-center gap-1 px-2.5 py-1 bg-orange-500 text-white text-xs font-semibold rounded-lg hover:bg-orange-600 transition-colors"
                                  onClick={() => openPayModal(row)}>
                                  <Banknote className="w-3 h-3" /> To&apos;lash
                                </button>
                              </span>
                            ) : (
                              <span className="relative inline-block">
                                <span className="group-hover:hidden text-amber-500 font-medium text-xs">To&apos;lanmagan</span>
                                <button
                                  className="hidden group-hover:inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-500 text-white text-xs font-semibold rounded-lg hover:bg-emerald-600 transition-colors"
                                  onClick={() => openPayModal(row)}>
                                  <Banknote className="w-3 h-3" /> To&apos;lash
                                </button>
                              </span>
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
        </div>
      )}

      {/* ════════════════ TAB 2: TO'LOVLAR TARIXI ════════════════ */}
      {activeTab === 'history' && (
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <input type="month" value={histMonth} onChange={e => setHistMonth(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            <span className="text-sm text-gray-500">{expenses.length} ta yozuv</span>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {loadingHist ? (
              <div className="p-4 space-y-2">{Array(5).fill(0).map((_, i) => <Skel key={i} />)}</div>
            ) : expenses.length === 0 ? (
              <p className="px-5 py-10 text-sm text-gray-400 text-center">Bu oy uchun to&apos;lov tarixi yo&apos;q</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      {['№', 'Kategoriya', 'Miqdor', 'Sana', 'Izoh'].map((h, i) => (
                        <th key={i} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {expenses.map((e, idx) => (
                      <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            'inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full',
                            e.category === 'teacher_salary' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-700',
                          )}>
                            {e.category === 'teacher_salary' ? "O'q. maoshi" : 'Xodim maoshi'}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-semibold text-emerald-600">{formatCurrency(e.amount)}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{e.expense_date || '—'}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs max-w-64 truncate">{e.description || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ Pay Modal ══ */}
      <Dialog open={!!payTarget} onOpenChange={open => { if (!open) setPayTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{payTarget?.name}ga maosh to&apos;lash</DialogTitle>
          </DialogHeader>
          {payTarget && (() => {
            const remaining = payTarget.totalOwed - payTarget.paidAmount;
            const amt = parseFloat(payAmount);
            const preview = amt >= remaining ? 'paid' : amt >= 10000 ? 'partial' : null;
            return (
              <div className="mt-2 space-y-4">
                {/* Info cards */}
                <div className="text-sm text-gray-600 space-y-1.5 bg-gray-50 rounded-lg px-3 py-3">
                  <div className="flex justify-between">
                    <span>Hisoblangan</span>
                    <span className="font-semibold text-gray-900">{formatCurrency(payTarget.calculatedAmount)}</span>
                  </div>
                  {payTarget.carryOver > 0 && (
                    <div className="flex justify-between text-orange-600 text-xs">
                      <span>O&apos;tgan oy qarzi</span>
                      <span className="font-semibold">{formatCurrency(payTarget.carryOver)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Jami qarzdorlik</span>
                    <span className="font-semibold text-gray-900">{formatCurrency(payTarget.calculatedAmount + payTarget.carryOver)}</span>
                  </div>
                  {payTarget.paidAmount > 0 && (
                    <div className="flex justify-between">
                      <span>Avval to&apos;langan</span>
                      <span className="font-semibold text-emerald-600">{formatCurrency(payTarget.paidAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold border-t border-gray-200 pt-1.5">
                    <span>Qolgan</span>
                    <span className="text-red-600">{formatCurrency(remaining)}</span>
                  </div>
                </div>

                {/* Amount input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    To&apos;lov summasi (so&apos;m)
                  </label>
                  <input
                    type="number" value={payAmount}
                    onChange={e => setPayAmount(e.target.value)}
                    min={10000} max={remaining}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="0" autoFocus
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Minimal: 10,000 so&apos;m | Maksimal: {formatCurrency(remaining)}
                  </p>
                  {preview && (
                    <p className={cn('text-xs mt-1 font-medium', preview === 'paid' ? 'text-emerald-600' : 'text-orange-500')}>
                      {preview === 'paid'
                        ? "✓ To'liq to'lanadi"
                        : `◑ Qisman — ${formatCurrency(remaining - amt)} qoladi`}
                    </p>
                  )}
                </div>

                {/* Payment type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">To&apos;lov turi</label>
                  <div className="flex gap-2">
                    {(['cash', 'card', 'transfer'] as const).map(t => (
                      <button key={t} type="button"
                        onClick={() => setPayType(t)}
                        className={cn(
                          'flex-1 py-2 text-xs font-medium rounded-lg border transition-colors',
                          payType === t ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50',
                        )}>
                        {PAYMENT_TYPE_LABELS[t]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-1">
                  <button onClick={() => setPayTarget(null)}
                    className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
                    Bekor qilish
                  </button>
                  <button onClick={handlePay} disabled={paying}
                    className="flex-1 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-60 transition-colors">
                    {paying ? 'Saqlanmoqda...' : 'Tasdiqlash'}
                  </button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ══ Add Staff Modal ══ */}
      <Dialog open={showAddStaff} onOpenChange={open => { if (!open) { setShowAddStaff(false); setStaffForm(blankStaffForm()); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Yangi xodim qo&apos;shish</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddStaff} className="space-y-3 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ism *</label>
                <input type="text" value={staffForm.first_name} required
                  onChange={e => setStaffForm(f => ({ ...f, first_name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Ism" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Familiya *</label>
                <input type="text" value={staffForm.last_name} required
                  onChange={e => setStaffForm(f => ({ ...f, last_name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Familiya" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telefon *</label>
              <input type="text" value={staffForm.phone} required
                onChange={e => setStaffForm(f => ({ ...f, phone: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="+998 ..." />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lavozim *</label>
              <select value={staffForm.role} onChange={e => setStaffForm(f => ({ ...f, role: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>

            {/* Contract type toggle */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Shartnoma turi</label>
              <div className="flex gap-2">
                {([
                  { v: 'monthly',  label: 'Oylik belgilangan' },
                  { v: 'contract', label: 'Shartnomaviy' },
                ] as const).map(({ v, label }) => (
                  <button key={v} type="button"
                    onClick={() => setStaffForm(f => ({ ...f, contract_type: v }))}
                    className={cn(
                      'flex-1 py-2 text-sm font-medium rounded-lg border transition-colors',
                      staffForm.contract_type === v ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50',
                    )}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Oylik miqdor (so&apos;m) *</label>
              <input type="number" value={staffForm.salary_amount} required min={100000} max={50000000}
                onChange={e => setStaffForm(f => ({ ...f, salary_amount: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="0" />
              <p className="text-xs text-gray-400 mt-0.5">Minimal: 100,000 so&apos;m</p>
            </div>

            {staffForm.contract_type === 'contract' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Muddat (oy)</label>
                    <input type="number" value={staffForm.contract_months} min={1} max={60}
                      onChange={e => setStaffForm(f => ({ ...f, contract_months: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="12" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Boshlanish sanasi</label>
                    <input type="date" value={staffForm.contract_start}
                      onChange={e => setStaffForm(f => ({ ...f, contract_start: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      required />
                  </div>
                </div>
                {staffForm.contract_months && staffForm.contract_start && (() => {
                  const end = new Date(staffForm.contract_start);
                  end.setMonth(end.getMonth() + parseInt(staffForm.contract_months));
                  return (
                    <p className="text-xs text-gray-500">
                      Tugash sanasi: <strong>{end.toLocaleDateString('uz-UZ')}</strong>
                    </p>
                  );
                })()}
              </>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Izoh</label>
              <textarea value={staffForm.notes} rows={2}
                onChange={e => setStaffForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                placeholder="Qo'shimcha ma'lumot..." />
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => { setShowAddStaff(false); setStaffForm(blankStaffForm()); }}
                className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50">
                Bekor qilish
              </button>
              <button type="submit" disabled={savingStaff}
                className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60">
                {savingStaff ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ══ Archive Confirm ══ */}
      <Dialog open={!!confirmArchive} onOpenChange={open => { if (!open) setConfirmArchive(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Xodimni arxivlash</DialogTitle>
          </DialogHeader>
          {confirmArchive && (
            <div className="mt-2 space-y-4">
              <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-700">
                  <strong>{confirmArchive.full_name}</strong> arxivlanadi va keyingi oy uchun maosh hisoblanmaydi.
                </p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setConfirmArchive(null)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50">
                  Bekor qilish
                </button>
                <button onClick={() => handleArchive(confirmArchive)} disabled={archivingId === confirmArchive.id}
                  className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-60">
                  {archivingId === confirmArchive.id ? '...' : 'Arxivlash'}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
