'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Banknote, ChevronDown, ChevronUp, Plus, AlertCircle,
} from 'lucide-react';
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
  admin: 'Admin', manager: 'Menejer', accountant: 'Buxgalter',
  security: 'Qorovul', cleaner: 'Farrosh', supply: 'Zavxoz', other: 'Boshqa',
};

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

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  cash: 'Naqd', card: 'Karta', transfer: "O'tkazma",
};

const formatAmount = (val: string) =>
  val.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const parseAmount = (val: string) => Number(val.replace(/,/g, ''));

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

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SalariesPage() {
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

  // ── Staff salary state ────────────────────────────────────────────────────────
  const [staffSals, setStaffSals]   = useState<StaffSalaryData[]>([]);
  const [staffList, setStaffList]   = useState<StaffMember[]>([]);
  const [staffOpen, setStaffOpen]   = useState(false);
  const [showAddStaff, setShowAddStaff]       = useState(false);
  const [staffForm, setStaffForm]             = useState<StaffForm>(blankStaffForm);
  const [savingStaff, setSavingStaff]         = useState(false);
  const [archivingId, setArchivingId]         = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive]   = useState<StaffMember | null>(null);
  const [payTarget, setPayTarget]             = useState<SalaryRow | null>(null);
  const [payAmount, setPayAmount]             = useState('');
  const [payType, setPayType]                 = useState<'cash' | 'card' | 'transfer'>('cash');
  const [paying, setPaying]                   = useState(false);

  // ── History state ─────────────────────────────────────────────────────────────
  const [histMonth, setHistMonth]   = useState(currentMonthStr);
  const [expenses, setExpenses]     = useState<ExpenseItem[]>([]);
  const [loadingHist, setLoadingHist] = useState(false);

  // ── Fetchers ──────────────────────────────────────────────────────────────────

  const loadSalaries = useCallback(async () => {
    setLoadingSals(true);
    const [tRes, sRes, staffRes] = await Promise.allSettled([
      api.get(`/api/v1/teacher-salaries/?month=${month}`),
      api.get(`/api/v1/staff-salaries/?month=${month}`),
      api.get(`/api/v1/staff/?status=active`),
    ]);
    if (tRes.status === 'fulfilled') {
      const data = tRes.value.data.results ?? tRes.value.data;
      setTeacherGrouped(Array.isArray(data) ? data : []);
    }
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
      toast.error('Tarix yuklanmadi');
    } finally {
      setLoadingHist(false);
    }
  }, [histMonth]);

  useEffect(() => { loadSalaries(); }, [loadSalaries]);
  useEffect(() => { if (activeTab === 'history') loadHistory(); }, [activeTab, loadHistory]);

  // ── Generate ──────────────────────────────────────────────────────────────────

  async function handleGenerate() {
    setGenerating(true);
    try {
      const [tRes, sRes] = await Promise.allSettled([
        api.post(`/api/v1/teacher-salaries/generate/?month=${month}`),
        api.post(`/api/v1/staff-salaries/generate/?month=${month}`),
      ]);
      const tCount = tRes.status === 'fulfilled' ? (tRes.value.data.created ?? 0) : 0;
      const sCount = sRes.status === 'fulfilled' ? (sRes.value.data.created?.length ?? 0) : 0;
      toast.success(`${tCount + sCount} ta maosh hisoblandi`);
      loadSalaries();
    } catch {
      toast.error('Xatolik');
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
    if (teacher.overall_status === 'paid') return 'bg-white';
    const today = new Date().toISOString().slice(0, 10);
    const anyOverdue = teacher.groups.some(
      g => g.status !== 'paid' && g.due_date && g.due_date < today,
    );
    return anyOverdue ? 'bg-[#FEF2F2]' : 'bg-[#FFFBEB]';
  }

  function openTeacherPayModal(teacher: TeacherSalaryGrouped, selId: string) {
    setTeacherPay({ teacher, selectionId: selId });
    const amounts: Record<string, string> = {};
    if (selId === 'all') {
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
        if (payments.length === 0) { toast.error("To'lanadigan summa yo'q"); setBulkPaying(false); return; }
        await api.post('/api/v1/teacher-salaries/bulk-pay/', { payments });
      } else {
        const amount = parseAmount(bulkAmounts[selectionId] || '0');
        if (amount < 10000) { toast.error("Minimal to'lov 10,000 so'm"); setBulkPaying(false); return; }
        await api.post(`/api/v1/teacher-salaries/${selectionId}/pay/`, { amount });
      }
      toast.success("Maosh to'landi");
      setTeacherPay(null);
      setBulkAmounts({});
      loadSalaries();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e?.response?.data?.error || 'Xatolik');
    } finally {
      setBulkPaying(false);
    }
  }

  // ── Staff handlers ────────────────────────────────────────────────────────────

  function openPayModal(row: SalaryRow) {
    const remaining = row.totalOwed - row.paidAmount;
    setPayTarget(row);
    setPayAmount(formatAmount(String(remaining > 0 ? remaining : row.totalOwed)));
    setPayType('cash');
  }

  async function handlePay() {
    if (!payTarget) return;
    const amount = parseAmount(payAmount);
    if (!amount || amount <= 0) { toast.error('Summani kiriting'); return; }
    if (amount < 10000) { toast.error("Minimal to'lov 10,000 so'm"); return; }
    setPaying(true);
    try {
      await api.post(`/api/v1/staff-salaries/${payTarget.id}/pay/`, { amount, payment_type: payType });
      toast.success("Maosh muvaffaqiyatli to'landi");
      setPayTarget(null);
      loadSalaries();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e?.response?.data?.error || 'Xatolik');
    } finally {
      setPaying(false);
    }
  }

  async function handleAddStaff(e: React.FormEvent) {
    e.preventDefault();
    const salaryNum = parseAmount(staffForm.salary_amount);
    if (!staffForm.salary_amount || salaryNum < 100000) {
      toast.error("Oylik kamida 100,000 so'm bo'lishi kerak"); return;
    }
    if (staffForm.phone.replace(/\D/g, '').length !== 9) {
      toast.error("To'liq 9 raqam kiriting"); return;
    }
    setSavingStaff(true);
    try {
      let contractStartIso = '';
      if (staffForm.contract_type === 'contract' && staffForm.contract_start.length === 10) {
        const [d, m, y] = staffForm.contract_start.split('/');
        contractStartIso = `${y}-${m}-${d}`;
      }
      const body: Record<string, unknown> = {
        first_name: staffForm.first_name,
        last_name:  staffForm.last_name,
        phone:      '+998' + staffForm.phone.replace(/\D/g, ''),
        role:       staffForm.role,
        contract_type: staffForm.contract_type,
        salary_amount: salaryNum,
        notes: staffForm.notes || null,
      };
      if (staffForm.contract_type === 'contract') {
        body.contract_months = parseInt(staffForm.contract_months);
        body.contract_start  = contractStartIso;
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

  // ── Derived ───────────────────────────────────────────────────────────────────

  const staffRows = useMemo<SalaryRow[]>(() => staffSals.map(s => ({
    id:               s.id,
    entityType:       'staff',
    name:             s.staff_name,
    roleDisplay:      s.staff_role || '—',
    badgeText:        s.staff_role || 'Xodim',
    badgeStyle:       ROLE_BADGE[s.staff_role_key] ?? ROLE_BADGE.other,
    salaryTypeText:   s.contract_type === 'monthly' ? 'Oylik' : 'Shartnomaviy',
    salaryTypeStyle:  s.contract_type === 'monthly' ? 'bg-gray-100 text-gray-600' : 'bg-purple-50 text-purple-600',
    rawSalaryType:    s.contract_type,
    calculatedAmount: Number(s.calculated_amount),
    carryOver:        Number(s.carry_over),
    paidAmount:       Number(s.paid_amount),
    totalOwed:        Number(s.calculated_amount) + Number(s.carry_over) - Number(s.paid_amount),
    status:           s.status,
  })), [staffSals]);

  const filteredTeachers = useMemo(() => (
    statusFilter === 'all' ? teacherGrouped : teacherGrouped.filter(t => t.overall_status === statusFilter)
  ), [teacherGrouped, statusFilter]);

  const filteredStaffRows = useMemo(() => (
    statusFilter === 'all' ? staffRows : staffRows.filter(r => r.status === statusFilter)
  ), [staffRows, statusFilter]);

  const totalCalculated = teacherGrouped.reduce((s, t) => s + t.total_calculated, 0)
    + staffRows.reduce((s, r) => s + r.calculatedAmount + r.carryOver, 0);
  const totalPaid = teacherGrouped.reduce((s, t) => s + t.total_paid, 0)
    + staffRows.reduce((s, r) => s + r.paidAmount, 0);
  const totalRemaining = teacherGrouped.reduce((s, t) => s + Math.max(t.total_owed - t.total_paid, 0), 0)
    + staffRows.filter(r => r.status !== 'paid').reduce((s, r) => s + Math.max(r.totalOwed - r.paidAmount, 0), 0);

  const Skel = ({ w }: { w?: string }) => <Skeleton className={cn('h-4 rounded', w ?? 'w-full')} />;

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5 pb-12">
      <Toaster position="top-right" />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Maoshlar</h1>
          <p className="text-sm text-gray-500 mt-0.5">O&apos;qituvchi va xodimlar maoshi</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {([
          { id: 'debts',   label: '💰 Maosh qarzdorligi' },
          { id: 'history', label: "📋 To'lovlar tarixi" },
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
              {generating ? 'Hisoblanmoqda...' : 'Hisoblash'}
            </button>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none text-gray-700">
              <option value="all">Barchasi</option>
              <option value="unpaid">To&apos;lanmagan</option>
              <option value="partial">Qisman</option>
              <option value="paid">To&apos;langan</option>
            </select>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Jami hisoblangan', value: totalCalculated, color: 'text-gray-900',    bg: 'bg-gray-50 border-gray-200' },
              { label: "To'langan",        value: totalPaid,       color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
              { label: 'Qolgan',           value: totalRemaining,  color: 'text-red-600',     bg: 'bg-red-50 border-red-200' },
            ].map(({ label, value, color, bg }) => (
              <div key={label} className={cn('rounded-xl border p-4', bg)}>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
                {loadingSals ? <Skel w="w-32 mt-1" /> : <p className={cn('text-xl font-bold mt-1', color)}>{formatCurrency(value)}</p>}
              </div>
            ))}
          </div>

          {/* Staff management — collapsible */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <button onClick={() => setStaffOpen(o => !o)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors">
              <span className="text-sm font-semibold text-gray-900">Xodimlar jadvali</span>
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
                              ? `${s.contract_start?.slice(0, 7)} → ${s.contract_end?.slice(0, 7)}` : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn('inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full',
                              s.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500')}>
                              {s.status === 'active' ? 'Faol' : 'Arxivlangan'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <button onClick={() => setConfirmArchive(s)} className="text-xs text-red-500 hover:text-red-700 hover:underline">
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

          {/* ── Teacher salary table ── */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">O&apos;qituvchilar maoshi</h2>
            </div>
            {loadingSals ? (
              <div className="p-4 space-y-2">{Array(4).fill(0).map((_, i) => <Skel key={i} />)}</div>
            ) : filteredTeachers.length === 0 ? (
              <p className="px-5 py-10 text-sm text-gray-400 text-center">Bu davr uchun maosh mavjud emas</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      {["№", "O'qituvchi", 'Maosh qayd kuni', 'Jami', "To'langan", 'Qoldiq', 'Holat', 'Oxirgi muddat'].map((h, i) => (
                        <th key={i} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredTeachers.map((teacher, idx) => {
                      const selId = getSelection(teacher.teacher_id);
                      const vals  = getTeacherValues(teacher, selId);
                      return (
                        <tr key={teacher.teacher_id} className={cn('transition-colors group', teacherRowBg(teacher))}>
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
                                <option value="all">Barcha guruhlar</option>
                                {teacher.groups.map(g => (
                                  <option key={g.salary_id} value={g.salary_id}>
                                    {g.first_active_date
                                      ? `${fmtDate(g.first_active_date)} (${g.group_name ?? '?'})`
                                      : `Hali hisob yo'q (${g.group_name ?? '?'})`}
                                  </option>
                                ))}
                              </select>
                            )}
                          </td>
                          {/* Jami — clickable */}
                          <td className="px-4 py-3">
                            <button onClick={() => setTeacherDetail(teacher)}
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
                          {/* Holat */}
                          <td className="px-4 py-3 min-w-[130px]">
                            {vals.status === 'paid' ? (
                              <span className="text-emerald-600 font-medium text-xs">To&apos;langan ✓</span>
                            ) : (
                              <span className="relative inline-block">
                                <span className={cn(
                                  'group-hover:hidden text-xs font-medium',
                                  vals.status === 'partial' ? 'text-orange-500' : 'text-amber-500',
                                )}>
                                  {vals.status === 'partial' ? 'Qisman' : "To'lanmagan"}
                                </span>
                                <button
                                  className="hidden group-hover:inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-500 text-white text-xs font-semibold rounded-lg hover:bg-emerald-600 transition-colors"
                                  onClick={() => openTeacherPayModal(teacher, selId)}>
                                  <Banknote className="w-3 h-3" /> To&apos;lash
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
                <h2 className="text-sm font-semibold text-gray-900">Xodimlar maoshi</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      {['№', 'Ism', 'Lavozim', 'Hisoblangan', 'Jami', "To'langan", 'Qoldiq', 'Holat'].map((h, i) => (
                        <th key={i} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredStaffRows.map((row, idx) => {
                      const jami   = row.calculatedAmount + row.carryOver;
                      const qoldiq = row.totalOwed - row.paidAmount;
                      return (
                        <tr key={row.id} className={cn(
                          'transition-colors group',
                          row.status === 'paid' ? 'bg-white' : row.status === 'partial' ? 'bg-orange-50' : 'bg-yellow-50',
                        )}>
                          <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                          <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">{row.name}</td>
                          <td className="px-4 py-3 text-gray-600 text-xs">{row.roleDisplay}</td>
                          <td className="px-4 py-3 text-gray-700 font-medium">{formatCurrency(row.calculatedAmount)}</td>
                          <td className="px-4 py-3 font-bold text-gray-900">{formatCurrency(jami)}</td>
                          <td className="px-4 py-3 font-semibold text-emerald-600">
                            {row.paidAmount > 0 ? formatCurrency(row.paidAmount) : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-4 py-3 font-semibold">
                            {qoldiq > 0 ? <span className="text-red-600">{formatCurrency(qoldiq)}</span> : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-4 py-3 min-w-[130px]">
                            {row.status === 'paid' ? (
                              <span className="text-emerald-600 font-medium text-xs">To&apos;langan ✓</span>
                            ) : (
                              <span className="relative inline-block">
                                <span className={cn('group-hover:hidden text-xs font-medium', row.status === 'partial' ? 'text-orange-500' : 'text-amber-500')}>
                                  {row.status === 'partial' ? 'Qisman' : "To'lanmagan"}
                                </span>
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
            </div>
          )}
        </div>
      )}

      {/* ════════════ TAB 2: TO'LOVLAR TARIXI ════════════ */}
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
                    {expenses.map((exp, idx) => (
                      <tr key={exp.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                        <td className="px-4 py-3">
                          <span className={cn('inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full',
                            exp.category === 'teacher_salary' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-700')}>
                            {exp.category === 'teacher_salary' ? "O'q. maoshi" : 'Xodim maoshi'}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-semibold text-emerald-600">{formatCurrency(exp.amount)}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{exp.expense_date || '—'}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs max-w-64 truncate">{exp.description || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ Teacher Detail Modal ══ */}
      <Dialog open={!!teacherDetail} onOpenChange={open => { if (!open) setTeacherDetail(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{teacherDetail?.teacher_name} — Maosh tafsiloti</DialogTitle>
          </DialogHeader>
          {teacherDetail && (() => {
            const t = teacherDetail;
            const remaining = Math.max(t.total_owed - t.total_paid, 0);
            const Row = ({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) => (
              <div className="flex justify-between items-center py-1.5">
                <span className="text-sm text-gray-500">{label}</span>
                <span className={cn('text-sm font-medium text-gray-900', valueClass)}>{value}</span>
              </div>
            );
            return (
              <div className="mt-1 space-y-3">
                <div className="space-y-0.5">
                  <Row label="Muallim" value={t.teacher_subject || '—'} />
                  <Row label="Maosh turi" value={
                    t.salary_type === 'fixed' ? 'Belgilangan' :
                    t.salary_type === 'percent' ? `Foizli (${t.salary_percent ?? 0}%)` :
                    "O'quvchi boshiga"
                  } />
                  <Row label="Guruhlar" value={`${t.groups.length}ta (${t.groups.map(g => g.group_name).filter(Boolean).join(', ')})`} />
                </div>

                {t.groups.filter(g => g.student_count > 0 || g.course_price > 0).length === 0 ? (
                  <div className="py-3 text-sm text-gray-400 text-center">Hisob ma&apos;lumotlari yo&apos;q</div>
                ) : t.groups.filter(g => g.student_count > 0 || g.course_price > 0).map((g, i) => (
                  <div key={g.salary_id}>
                    <hr className="border-gray-100" />
                    <div className="space-y-1 mt-2">
                      <p className="text-xs font-semibold text-gray-700 mb-1">
                        ({g.group_name ?? '?'}) — {g.course_name ?? '—'}
                      </p>
                      {t.salary_type === 'fixed' && (
                        <Row label="Belgilangan oylik" value={formatCurrency(g.calculated_amount - g.kpi_amount)} />
                      )}
                      {t.salary_type === 'percent' && (() => {
                        const perStudent = g.course_price * (t.salary_percent ?? 0) / 100;
                        return (<>
                          <Row label="O'qitilgan talabalar" value={`${g.student_count} ta`} />
                          <Row label="Kurs narxi" value={formatCurrency(g.course_price)} />
                          <Row label="Har talaba uchun" value={formatCurrency(perStudent)} />
                          <Row
                            label="Hisoblangan"
                            value={`${g.student_count} × ${formatCurrency(perStudent)} = ${formatCurrency(g.student_count * perStudent)}`}
                          />
                        </>);
                      })()}
                      {t.salary_type === 'per_student' && (() => {
                        const perAmt = t.per_student_amt ?? 0;
                        return (<>
                          <Row label="O'qitilgan talabalar" value={`${g.student_count} ta`} />
                          <Row label="Har talaba uchun" value={formatCurrency(perAmt)} />
                          <Row
                            label="Hisoblangan"
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

                {t.kpi_amount > 0 ? (
                  <Row label="KPI" value={`+${formatCurrency(t.kpi_amount)}`} valueClass="text-blue-600" />
                ) : (
                  <Row label="KPI" value="0 so'm" valueClass="text-gray-400" />
                )}

                <hr className="border-gray-100" />

                <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                  <div className="flex justify-between items-center pt-0.5">
                    <span className="text-sm font-bold text-gray-900">Jami</span>
                    <span className="text-base font-bold text-gray-900">{formatCurrency(t.total_owed)}</span>
                  </div>
                  <Row label="To'langan" value={formatCurrency(t.total_paid)} valueClass="text-emerald-600" />
                  <Row label="Qoldiq" value={formatCurrency(remaining)} valueClass={remaining > 0 ? 'text-red-600' : 'text-emerald-600'} />
                </div>

                <div className="flex gap-3 pt-1">
                  <button onClick={() => setTeacherDetail(null)}
                    className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
                    Yopish
                  </button>
                  {t.overall_status !== 'paid' && (
                    <button
                      onClick={() => { setTeacherDetail(null); openTeacherPayModal(t, getSelection(t.teacher_id)); }}
                      className="flex-1 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors">
                      To&apos;lash
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
            <DialogTitle>{teacherPay?.teacher.teacher_name}ga maosh to&apos;lash</DialogTitle>
          </DialogHeader>
          {teacherPay && (() => {
            const { teacher, selectionId } = teacherPay;
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
                        Qoldiq: <span className="font-semibold text-red-600">{formatCurrency(rem)}</span>
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
                    <span className="text-sm font-semibold text-gray-700">Jami to&apos;lov</span>
                    <span className="text-sm font-bold text-gray-900">{formatCurrency(totalAmt)}</span>
                  </div>
                )}

                <div className="flex gap-3 pt-1">
                  <button onClick={() => { setTeacherPay(null); setBulkAmounts({}); }}
                    className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
                    Bekor qilish
                  </button>
                  <button onClick={handleTeacherPay} disabled={bulkPaying}
                    className="flex-1 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-60 transition-colors">
                    {bulkPaying ? 'Saqlanmoqda...' : 'Tasdiqlash'}
                  </button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ══ Staff Pay Modal ══ */}
      <Dialog open={!!payTarget} onOpenChange={open => { if (!open) setPayTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{payTarget?.name}ga maosh to&apos;lash</DialogTitle>
          </DialogHeader>
          {payTarget && (() => {
            const remaining = payTarget.totalOwed - payTarget.paidAmount;
            const amt = parseAmount(payAmount);
            const preview = amt >= remaining ? 'paid' : amt >= 10000 ? 'partial' : null;
            return (
              <div className="mt-2 space-y-4">
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
                  <div className="flex justify-between font-semibold border-t border-gray-200 pt-1.5">
                    <span>Qolgan</span>
                    <span className="text-red-600">{formatCurrency(remaining)}</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">To&apos;lov summasi (so&apos;m)</label>
                  <input type="text" inputMode="numeric" value={payAmount}
                    onChange={e => setPayAmount(formatAmount(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="0" autoFocus />
                  <p className="text-xs text-gray-400 mt-1">Min: 10,000 | Max: {formatCurrency(remaining)}</p>
                  {preview && (
                    <p className={cn('text-xs mt-1 font-medium', preview === 'paid' ? 'text-emerald-600' : 'text-orange-500')}>
                      {preview === 'paid' ? "✓ To'liq to'lanadi" : `◑ Qisman — ${formatCurrency(remaining - amt)} qoladi`}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">To&apos;lov turi</label>
                  <div className="flex gap-2">
                    {(['cash', 'card', 'transfer'] as const).map(tp => (
                      <button key={tp} type="button" onClick={() => setPayType(tp)}
                        className={cn('flex-1 py-2 text-xs font-medium rounded-lg border transition-colors',
                          payType === tp ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50')}>
                        {PAYMENT_TYPE_LABELS[tp]}
                      </button>
                    ))}
                  </div>
                </div>
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
          <DialogHeader><DialogTitle>Yangi xodim qo&apos;shish</DialogTitle></DialogHeader>
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
              <div className="flex">
                <span className="inline-flex items-center px-3 border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm rounded-l-lg">+998</span>
                <input type="tel" value={staffForm.phone} required
                  onChange={e => setStaffForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 9) }))}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-r-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="XX XXX XX XX" maxLength={9} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lavozim *</label>
              <select value={staffForm.role} onChange={e => setStaffForm(f => ({ ...f, role: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Shartnoma turi</label>
              <div className="flex gap-2">
                {([{ v: 'monthly', label: 'Oylik belgilangan' }, { v: 'contract', label: 'Shartnomaviy' }] as const).map(({ v, label }) => (
                  <button key={v} type="button" onClick={() => setStaffForm(f => ({ ...f, contract_type: v }))}
                    className={cn('flex-1 py-2 text-sm font-medium rounded-lg border transition-colors',
                      staffForm.contract_type === v ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50')}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Oylik miqdor (so&apos;m) *</label>
              <input type="text" inputMode="numeric" value={staffForm.salary_amount}
                onChange={e => setStaffForm(f => ({ ...f, salary_amount: formatAmount(e.target.value) }))}
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
                    <input type="text" value={staffForm.contract_start} maxLength={10} placeholder="dd/mm/yyyy"
                      onChange={e => {
                        let val = e.target.value.replace(/\D/g, '');
                        if (val.length > 8) val = val.slice(0, 8);
                        let masked = val;
                        if (val.length > 2) masked = val.slice(0, 2) + '/' + val.slice(2);
                        if (val.length > 4) masked = masked.slice(0, 5) + '/' + masked.slice(5);
                        setStaffForm(f => ({ ...f, contract_start: masked }));
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      required />
                  </div>
                </div>
                {staffForm.contract_months && staffForm.contract_start.length === 10 && (() => {
                  const [d, m, y] = staffForm.contract_start.split('/');
                  const end = new Date(`${y}-${m}-${d}`);
                  end.setMonth(end.getMonth() + parseInt(staffForm.contract_months));
                  return <p className="text-xs text-gray-500">Tugash sanasi: <strong>{end.toLocaleDateString('uz-UZ')}</strong></p>;
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
          <DialogHeader><DialogTitle>Xodimni arxivlash</DialogTitle></DialogHeader>
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
