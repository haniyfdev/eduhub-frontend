'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Search, Minus, Eye, EyeOff, Banknote, Percent, Users, Snowflake, Play } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Pagination } from '@/components/pagination';
import api from '@/lib/axios';
import { cn, formatPhone, formatDMY, formatCurrency } from '@/lib/utils';
import { PaginatedResponse } from '@/types';

// ── Teacher types ────────────────────────────────────────────────────────────

interface Teacher {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  subject: string;
  birth_date: string | null;
  salary_type: 'fixed' | 'percent' | 'per_student';
  fixed_amount: number | null;
  salary_percent: number | null;
  per_student_amt: number | null;
  hired_at: string;
  status: 'active' | 'frozen' | 'archived';
}

// ── Staff types ──────────────────────────────────────────────────────────────

interface StaffMember {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string;
  role: string;
  role_display: string;
  salary_amount: number;
  hired_at: string;
  status: 'active' | 'frozen' | 'archived';
  archived_at?: string | null;
  updated_at?: string | null;
}

interface StaffForm {
  first_name: string;
  last_name: string;
  phone: string;
  role: string;
  password: string;
  salary_amount: string;
  notes: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const SALARY_STYLES: Record<string, string> = {
  fixed:       'bg-gray-100 text-gray-700 border-gray-200',
  percent:     'bg-blue-50 text-blue-700 border-blue-200',
  per_student: 'bg-green-50 text-green-700 border-green-200',
};
const SALARY_LABELS: Record<string, string> = {
  fixed: 'fixed', percent: 'percent', per_student: 'perStudent',
};

// ROLE_LABELS is now built inside the component using useTranslations('roles')


const EMPTY_FORM: {
  first_name: string; last_name: string; phone: string; password: string;
  subject: string; birth_date: string;
  salary_type: 'fixed' | 'percent' | 'per_student'; salary_amount: string;
} = {
  first_name: '', last_name: '', phone: '', password: '',
  subject: '', birth_date: '', salary_type: 'fixed', salary_amount: '',
};

const formatAmount = (val: string) =>
  val.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const parseAmount = (val: string) => Number(val.replace(/,/g, ''));

function blankStaffForm(): StaffForm {
  return { first_name: '', last_name: '', phone: '', role: 'admin', password: '', salary_amount: '', notes: '' };
}

// ── Keyboard helper ──────────────────────────────────────────────────────────
function makeHandleKey(
  next?: React.RefObject<HTMLElement>,
  prev?: React.RefObject<HTMLElement>,
  onEsc?: () => void,
) {
  return (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onEsc?.(); }
    if (e.key === 'Enter') { e.preventDefault(); next?.current?.focus(); }
    if (e.key === 'Backspace' && (e.target as HTMLInputElement).value === '') {
      e.preventDefault(); prev?.current?.focus();
    }
  };
}

export default function TeachersPage() {
  const t = useTranslations('teachers');
  const common = useTranslations('common');
  const tRoles = useTranslations('roles');

  const ROLE_LABELS: Record<string, string> = {
    admin:      tRoles('admin'),
    manager:    tRoles('manager'),
    accountant: tRoles('accountant'),
    security:   tRoles('security'),
    cleaner:    tRoles('cleaner'),
    supply:     tRoles('supply'),
    other:      tRoles('other'),
  };
  const [activeTab, setActiveTab] = useState<'teachers' | 'staff'>('teachers');

  // ── Teacher state ─────────────────────────────────────────────────────────
  const [teachers, setTeachers]           = useState<Teacher[]>([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(false);
  const [search, setSearch]               = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [statusFilter, setStatusFilter]   = useState('');
  const [subjects, setSubjects]           = useState<string[]>([]);
  const [page, setPage]                   = useState(1);
  const [pageSize, setPageSize]           = useState(25);
  const [count, setCount]                 = useState(0);
  const [showAdd, setShowAdd]             = useState(false);
  const [saving, setSaving]               = useState(false);
  const [form, setForm]                   = useState(EMPTY_FORM);
  const [archiveTarget, setArchiveTarget] = useState<{ id: string; name: string } | null>(null);
  const [touched, setTouched]             = useState<Record<string, boolean>>({});
  const [showPassword, setShowPassword]   = useState(false);

  // ── Staff state ───────────────────────────────────────────────────────────
  const [staffList, setStaffList]                   = useState<StaffMember[]>([]);
  const [staffLoading, setStaffLoading]             = useState(false);
  const [staffSearch, setStaffSearch]               = useState('');
  const [staffStatusFilter, setStaffStatusFilter]   = useState('');
  const [showAddStaff, setShowAddStaff]             = useState(false);
  const [staffForm, setStaffForm]                   = useState<StaffForm>(blankStaffForm);
  const [savingStaff, setSavingStaff]               = useState(false);
  const [staffArchiveTarget, setStaffArchiveTarget] = useState<StaffMember | null>(null);
  const [staffArchiving, setStaffArchiving]         = useState(false);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const firstNameRef  = useRef<HTMLInputElement>(null);
  const lastNameRef   = useRef<HTMLInputElement>(null);
  const phoneRef      = useRef<HTMLInputElement>(null);
  const passwordRef   = useRef<HTMLInputElement>(null);
  const subjectRef    = useRef<HTMLInputElement>(null);
  const birthDateRef  = useRef<HTMLInputElement>(null);
  const salaryAmtRef  = useRef<HTMLInputElement>(null);
  const saveRef       = useRef<HTMLButtonElement>(null);

  function closeModal() { setShowAdd(false); setForm(EMPTY_FORM); setTouched({}); setShowPassword(false); }

  // ── Validation ─────────────────────────────────────────────────────────────
  const salaryAmt = parseFloat(form.salary_amount);
  const fieldErrors = {
    first_name:    !form.first_name    ? 'Ism majburiy'       : form.first_name.length < 2    ? 'Kamida 2 harf' : '',
    last_name:     !form.last_name     ? 'Familiya majburiy'  : form.last_name.length < 2     ? 'Kamida 2 harf' : '',
    phone:         form.phone.replace(/\D/g, '').length !== 9 ? "To'liq 9 raqam kiriting"     : '',
    subject:       !form.subject       ? 'Fan majburiy'       : '',
    birth_date:    !form.birth_date    ? "Tug'ilgan sana majburiy" : (() => {
      const parts = form.birth_date.split('/');
      if (parts.length !== 3 || form.birth_date.length !== 10) return "dd/mm/yyyy formatida kiriting";
      const [d, m] = [parseInt(parts[0]), parseInt(parts[1])];
      if (d < 1 || d > 31) return "Kun 1-31 oralig'ida bo'lsin";
      if (m < 1 || m > 12) return "Oy 1-12 oralig'ida bo'lsin";
      return '';
    })(),
    salary_amount: form.salary_type === 'percent'
      ? (isNaN(salaryAmt) || salaryAmt < 1 || salaryAmt > 100 ? "Foiz 1–100 orasida bo'lishi kerak" : '')
      : form.salary_type === 'fixed'
        ? (isNaN(salaryAmt) || salaryAmt < 100000 ? "Kamida 100 000 so'm kiriting" : '')
        : (isNaN(salaryAmt) || salaryAmt < 1000   ? "Kamida 1 000 so'm kiriting"   : ''),
  };
  const hasFormErrors = Object.values(fieldErrors).some(Boolean);

  function touch(field: string) { setTouched((t) => ({ ...t, [field]: true })); }
  function showErr(field: string) { return touched[field] ? (fieldErrors as Record<string, string>)[field] ?? '' : ''; }

  // ── Fetch subjects ─────────────────────────────────────────────────────────
  useEffect(() => {
    api.get<PaginatedResponse<Teacher>>('/api/v1/teachers/?page_size=200')
      .then(({ data }) => {
        const unique = Array.from(new Set((data.results ?? []).map((t) => t.subject).filter(Boolean))).sort();
        setSubjects(unique);
      }).catch(() => {});
  }, []);

  // ── Fetch teachers ─────────────────────────────────────────────────────────
  const fetchTeachers = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const params: Record<string, string | number> = { page, page_size: pageSize };
      if (search)        params.search  = search;
      if (subjectFilter) params.subject = subjectFilter;
      if (statusFilter)  params.status  = statusFilter;
      const { data } = await api.get<PaginatedResponse<Teacher>>('/api/v1/teachers/', { params });
      setTeachers(data.results ?? []);
      setCount(data.count ?? 0);
    } catch {
      setError(true);
      toast.error(common('error'));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, subjectFilter, statusFilter, common]);

  useEffect(() => { fetchTeachers(); }, [fetchTeachers]);
  useEffect(() => { setPage(1); }, [search, subjectFilter, statusFilter]);

  // ── Fetch staff ────────────────────────────────────────────────────────────
  const fetchStaff = useCallback(async () => {
    setStaffLoading(true);
    try {
      const params: Record<string, string> = {};
      if (staffSearch)       params.search = staffSearch;
      if (staffStatusFilter) params.status = staffStatusFilter;
      const { data } = await api.get('/api/v1/staff/', { params });
      setStaffList(data.results ?? data);
    } catch {
      toast.error(common('error'));
    } finally {
      setStaffLoading(false);
    }
  }, [staffSearch, staffStatusFilter, common]);

  useEffect(() => { if (activeTab === 'staff') fetchStaff(); }, [activeTab, fetchStaff]);

  // ── Save teacher ───────────────────────────────────────────────────────────
  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ first_name: true, last_name: true, phone: true, subject: true, birth_date: true, salary_amount: true });
    if (hasFormErrors) return;
    setSaving(true);
    try {
      const [d, m, y] = form.birth_date.split('/');
      const isoDate = `${y}-${m}-${d}`;
      await api.post('/api/v1/teachers/', {
        first_name: form.first_name,
        last_name:  form.last_name,
        phone:      '+998' + form.phone.replace(/\D/g, ''),
        password:   form.password,
        subject:    form.subject,
        birth_date: isoDate,
        salary_type: form.salary_type,
        ...(form.salary_type === 'fixed'       ? { fixed_amount:    parseFloat(form.salary_amount) } : {}),
        ...(form.salary_type === 'percent'     ? { salary_percent:  parseFloat(form.salary_amount) } : {}),
        ...(form.salary_type === 'per_student' ? { per_student_amt: parseFloat(form.salary_amount) } : {}),
      });
      toast.success(common('success'));
      closeModal();
      fetchTeachers();
    } catch (err: unknown) {
      const e = err as { response?: { data?: unknown } };
      const detail = e?.response?.data;
      const msg = typeof detail === 'string' ? detail
        : (detail as Record<string, unknown>)?.detail
        || Object.values(detail as Record<string, unknown> ?? {})[0]
        || common('error');
      toast.error(String(msg));
    } finally {
      setSaving(false);
    }
  }

  async function confirmArchive() {
    if (!archiveTarget) return;
    try {
      await api.post(`/api/v1/teachers/${archiveTarget.id}/archive/`);
      toast.success(common('success'));
      setArchiveTarget(null);
      fetchTeachers();
    } catch {
      toast.error(common('error'));
    }
  }

  async function handleFreezeTeacher(id: string) {
    try {
      await api.post(`/api/v1/teachers/${id}/freeze/`);
      toast.success(t('freezeSuccess'));
      fetchTeachers();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e?.response?.data?.error || common('error'));
    }
  }

  async function handleUnfreezeTeacher(id: string) {
    try {
      await api.post(`/api/v1/teachers/${id}/unfreeze/`);
      toast.success(t('unfreezeSuccess'));
      fetchTeachers();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e?.response?.data?.error || common('error'));
    }
  }

  async function handleFreezeStaff(id: string) {
    try {
      await api.post(`/api/v1/staff/${id}/freeze/`);
      toast.success(t('freezeSuccess'));
      fetchStaff();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e?.response?.data?.error || common('error'));
    }
  }

  async function handleUnfreezeStaff(id: string) {
    try {
      await api.post(`/api/v1/staff/${id}/unfreeze/`);
      toast.success(t('unfreezeSuccess'));
      fetchStaff();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e?.response?.data?.error || common('error'));
    }
  }

  // ── Add staff ─────────────────────────────────────────────────────────────
  async function handleAddStaff(e: React.FormEvent) {
    e.preventDefault();
    const salaryNum = parseAmount(staffForm.salary_amount);
    if (salaryNum < 100000) { toast.error(t('minSalary')); return; }
    if (staffForm.phone.replace(/\D/g, '').length !== 9) { toast.error(t('phoneRequired')); return; }
    setSavingStaff(true);
    try {
      await api.post('/api/v1/staff/', {
        first_name:    staffForm.first_name,
        last_name:     staffForm.last_name,
        phone:         '+998' + staffForm.phone.replace(/\D/g, ''),
        role:          staffForm.role,
        password:      staffForm.password || 'parol123',
        salary_amount: salaryNum,
        notes:         staffForm.notes || null,
      });
      toast.success(common('success'));
      setShowAddStaff(false);
      setStaffForm(blankStaffForm());
      fetchStaff();
    } catch (err: unknown) {
      const e = err as { response?: { data?: unknown } };
      const detail = e?.response?.data;
      toast.error(typeof detail === 'object' ? JSON.stringify(detail) : common('error'));
    } finally {
      setSavingStaff(false);
    }
  }

  async function handleArchiveStaff() {
    if (!staffArchiveTarget) return;
    setStaffArchiving(true);
    try {
      await api.patch(`/api/v1/staff/${staffArchiveTarget.id}/archive/`);
      toast.success(common('success'));
      setStaffArchiveTarget(null);
      fetchStaff();
    } catch {
      toast.error(common('error'));
    } finally {
      setStaffArchiving(false);
    }
  }

// ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <Toaster position="top-right" />

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">
          {activeTab === 'teachers' ? t('title') : t('tabs.staff')}
        </h1>
        {activeTab === 'teachers' ? (
          <button
            onClick={() => { setShowAdd(true); setTimeout(() => firstNameRef.current?.focus(), 100); }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> {t('addTeacher')}
          </button>
        ) : (
          <button
            onClick={() => setShowAddStaff(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> {t('addStaff')}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {([
          { id: 'teachers', label: t('tabs.teachers') },
          { id: 'staff',    label: t('tabs.staff') },
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

      {/* ════ TAB 1: O'QITUVCHILAR ════ */}
      {activeTab === 'teachers' && (
        <>
          <div className="flex gap-3 items-center flex-wrap">
            <div className="relative max-w-xs flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('searchPlaceholder')}
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700">
              <option value="">{t('allSubjects')}</option>
              {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700">
              <option value="">{common('all')}</option>
              <option value="active">{common('active')}</option>
              <option value="archived">{common('archived')}</option>
            </select>
          </div>

          <div className="bg-white rounded border border-gray-200 shadow-sm overflow-hidden">
            {error ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-500">
                <p className="mb-3 text-sm">{common('error')}</p>
                <button onClick={fetchTeachers} className="text-sm text-blue-600 underline">{common('retry')}</button>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {['№', common('name'), common('phone'), t('subject'), t('salaryType'), common('birthDate'), t('hiredAt'), common('status'), common('actions')].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading
                    ? Array(6).fill(0).map((_, i) => (
                      <tr key={i}>{Array(9).fill(0).map((_, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                      ))}</tr>
                    ))
                    : teachers.length === 0
                      ? <tr><td colSpan={9} className="px-4 py-16 text-center text-gray-400">{t('noTeachers')}</td></tr>
                      : teachers.map((teacher, idx) => (
                        <tr key={teacher.id} className={cn('transition-colors', teacher.status === 'archived' ? 'bg-yellow-50 hover:bg-yellow-100' : teacher.status === 'frozen' ? 'bg-cyan-50 hover:bg-cyan-100' : 'hover:bg-gray-50')}>
                          <td className="px-4 py-3 text-gray-400 text-xs">{(page - 1) * pageSize + idx + 1}</td>
                          <td className="px-4 py-3 font-medium text-gray-900">{teacher.first_name} {teacher.last_name}</td>
                          <td className="px-4 py-3 text-gray-500">{formatPhone(teacher.phone)}</td>
                          <td className="px-4 py-3 text-gray-600">{teacher.subject || '—'}</td>
                          <td className="px-4 py-3">
                            <Popover>
                              <PopoverTrigger className={cn('inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium border rounded cursor-pointer hover:scale-110 transition-transform', SALARY_STYLES[teacher.salary_type])}>
                                {teacher.salary_type === 'fixed'       && <Banknote className="w-3 h-3" />}
                                {teacher.salary_type === 'percent'     && <Percent   className="w-3 h-3" />}
                                {teacher.salary_type === 'per_student' && <Users     className="w-3 h-3" />}
                                {t(SALARY_LABELS[teacher.salary_type] as Parameters<typeof t>[0])}
                              </PopoverTrigger>
                              <PopoverContent className="w-56 p-3 bg-blue-600 text-white shadow-xl" side="right" align="start">
                                <p className="text-xs font-semibold text-white/70 uppercase tracking-wide mb-2">{common('salary')}</p>
                                <div className="text-center">
                                  <span className="text-xl font-bold text-white">
                                    {teacher.salary_type === 'fixed'       && formatCurrency(teacher.fixed_amount ?? 0)}
                                    {teacher.salary_type === 'percent'     && `${teacher.salary_percent ?? 0}%`}
                                    {teacher.salary_type === 'per_student' && formatCurrency(teacher.per_student_amt ?? 0)}
                                  </span>
                                </div>
                              </PopoverContent>
                            </Popover>
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{formatDMY(teacher.birth_date)}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{formatDMY(teacher.hired_at)}</td>
                          <td className="px-4 py-3">
                            <span className={cn('inline-flex items-center px-2 py-0.5 text-xs font-medium border rounded',
                              teacher.status === 'active'   ? 'bg-green-50 text-green-700 border-green-200' :
                              teacher.status === 'frozen'   ? 'bg-cyan-100 text-cyan-700 border-cyan-300' :
                              'bg-gray-100 text-gray-600 border-gray-200')}>
                              {teacher.status === 'active' ? common('active') : teacher.status === 'frozen' ? t('frozen') : common('archived')}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              {teacher.status === 'active' && (
                                <>
                                  <button onClick={() => handleFreezeTeacher(teacher.id)}
                                    className="p-1 rounded text-blue-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                                    title={t('frozen')}>
                                    <Snowflake className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => setArchiveTarget({ id: teacher.id, name: `${teacher.first_name} ${teacher.last_name}` })}
                                    className="p-1 rounded text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                                    title={common('archive')}>
                                    <Minus className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                              {teacher.status === 'frozen' && (
                                <button onClick={() => handleUnfreezeTeacher(teacher.id)}
                                  className="p-1 rounded text-cyan-400 hover:bg-cyan-50 hover:text-cyan-600 transition-colors"
                                  title={t('unfreezeSuccess')}>
                                  <Play className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                  }
                </tbody>
              </table>
            )}
          </div>

          {!loading && (
            <Pagination page={page} pageSize={pageSize} count={count}
              onPageChange={setPage} onPageSizeChange={(ps) => { setPageSize(ps); setPage(1); }} />
          )}
        </>
      )}

      {/* ════ TAB 2: XODIMLAR ════ */}
      {activeTab === 'staff' && (
        <>
          <div className="flex gap-3 items-center flex-wrap">
            <div className="relative max-w-xs flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={staffSearch}
                onChange={(e) => setStaffSearch(e.target.value)}
                placeholder={t('searchPlaceholder')}
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select value={staffStatusFilter} onChange={(e) => setStaffStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700">
              <option value="">{common('all')}</option>
              <option value="active">{common('active')}</option>
              <option value="archived">{common('archived')}</option>
            </select>
          </div>

          <div className="bg-white rounded border border-gray-200 shadow-sm overflow-hidden">
            {staffLoading ? (
              <div className="p-4 space-y-3">
                {Array(5).fill(0).map((_, i) => (
                  <div key={i} className="flex gap-3">
                    {Array(7).fill(0).map((_, j) => <Skeleton key={j} className="h-4 flex-1" />)}
                  </div>
                ))}
              </div>
            ) : staffList.length === 0 ? (
              <p className="px-5 py-16 text-sm text-gray-400 text-center">
                Xodimlar yo&apos;q — birinchi xodimni qo&apos;shing
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {['№', common('name'), common('phone'), t('hiredAt'), common('salary'), common('status'), common('actions')].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[...staffList]
                    .sort((a, b) => a.status === b.status ? 0 : a.status === 'active' ? -1 : 1)
                    .map((s, idx) => (
                      <tr key={s.id} className={cn('transition-colors', s.status === 'archived' ? 'bg-yellow-50 hover:bg-yellow-100' : s.status === 'frozen' ? 'bg-cyan-50 hover:bg-cyan-100' : 'hover:bg-gray-50')}>
                        <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-gray-900">{s.full_name}</p>
                          <p className="text-xs text-gray-500">{s.role_display}</p>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-sm">{formatPhone(s.phone)}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{formatDMY(s.hired_at)}</td>
                        <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">{formatCurrency(s.salary_amount)}</td>
                        <td className="px-4 py-3">
                          <span className={cn('inline-flex items-center px-2 py-0.5 text-xs font-medium border rounded',
                            s.status === 'active' ? 'bg-green-50 text-green-700 border-green-200' :
                            s.status === 'frozen' ? 'bg-cyan-100 text-cyan-700 border-cyan-300' :
                            'bg-gray-100 text-gray-600 border-gray-200')}>
                            {s.status === 'active' ? common('active') : s.status === 'frozen' ? t('frozen') : common('archived')}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {s.status === 'active' && (
                              <>
                                <button onClick={() => handleFreezeStaff(s.id)}
                                  className="p-1 rounded text-blue-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                                  title={t('frozen')}>
                                  <Snowflake className="w-4 h-4" />
                                </button>
                                <button onClick={() => setStaffArchiveTarget(s)}
                                  className="p-1 rounded text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                                  title={common('archive')}>
                                  <Minus className="w-4 h-4" />
                                </button>
                              </>
                            )}
                            {s.status === 'frozen' && (
                              <button onClick={() => handleUnfreezeStaff(s.id)}
                                className="p-1 rounded text-cyan-400 hover:bg-cyan-50 hover:text-cyan-600 transition-colors"
                                title={t('unfreezeSuccess')}>
                                <Play className="w-4 h-4" />
                              </button>
                            )}
                            {s.status === 'archived' && (
                              <span className="text-gray-400 text-xs">
                                {(s.archived_at || s.updated_at) ? formatDMY(s.archived_at || s.updated_at) : common('archived')}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ══ Add Teacher Dialog ══ */}
      <Dialog open={showAdd} onOpenChange={(open) => { if (!open) closeModal(); setShowAdd(open); }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t('addTeacher')}</DialogTitle></DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4 mt-2">

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{common('name')} <span className="text-red-500">*</span></label>
                <input
                  ref={firstNameRef}
                  value={form.first_name}
                  onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                  onBlur={() => touch('first_name')}
                  onKeyDown={makeHandleKey(lastNameRef, undefined, closeModal)}
                  className={cn('w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500', showErr('first_name') ? 'border-red-400' : 'border-gray-300')}
                />
                {showErr('first_name') && <p className="text-xs text-red-500 mt-0.5">{showErr('first_name')}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{common('lastName')} <span className="text-red-500">*</span></label>
                <input
                  ref={lastNameRef}
                  value={form.last_name}
                  onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                  onBlur={() => touch('last_name')}
                  onKeyDown={makeHandleKey(phoneRef, firstNameRef, closeModal)}
                  className={cn('w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500', showErr('last_name') ? 'border-red-400' : 'border-gray-300')}
                />
                {showErr('last_name') && <p className="text-xs text-red-500 mt-0.5">{showErr('last_name')}</p>}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{common('phone')} <span className="text-red-500">*</span></label>
              <div className="flex">
                <span className="inline-flex items-center px-3 border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm rounded-l">+998</span>
                <input
                  ref={phoneRef}
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 9) }))}
                  onBlur={() => touch('phone')}
                  onKeyDown={makeHandleKey(passwordRef, lastNameRef, closeModal)}
                  placeholder="XX XXX XX XX"
                  className={cn('flex-1 px-3 py-2 border rounded-r text-sm focus:outline-none focus:ring-2 focus:ring-blue-500', showErr('phone') ? 'border-red-400' : 'border-gray-300')}
                />
              </div>
              {showErr('phone') && <p className="text-xs text-red-500 mt-0.5">{showErr('phone')}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('password')} <span className="text-red-500">*</span></label>
              <div className="relative">
                <input
                  ref={passwordRef}
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  onKeyDown={makeHandleKey(subjectRef, phoneRef, closeModal)}
                  className="w-full px-3 py-2 pr-10 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('subject')} <span className="text-red-500">*</span></label>
              <input
                ref={subjectRef}
                value={form.subject}
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                onBlur={() => touch('subject')}
                onKeyDown={makeHandleKey(birthDateRef, passwordRef, closeModal)}
                placeholder="Masalan: Matematika"
                className={cn('w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500', showErr('subject') ? 'border-red-400' : 'border-gray-300')}
              />
              {showErr('subject') && <p className="text-xs text-red-500 mt-0.5">{showErr('subject')}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{common('birthDate')} <span className="text-red-500">*</span></label>
              <input
                ref={birthDateRef}
                type="text"
                value={form.birth_date}
                maxLength={10}
                placeholder="dd/mm/yyyy"
                onChange={(e) => {
                  let val = e.target.value.replace(/\D/g, '');
                  if (val.length > 8) val = val.slice(0, 8);
                  let masked = val;
                  if (val.length > 2) masked = val.slice(0, 2) + '/' + val.slice(2);
                  if (val.length > 4) masked = masked.slice(0, 5) + '/' + masked.slice(5);
                  setForm((f) => ({ ...f, birth_date: masked }));
                  touch('birth_date');
                }}
                onKeyDown={makeHandleKey(salaryAmtRef, subjectRef, closeModal)}
                className={cn('w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500', showErr('birth_date') ? 'border-red-400' : 'border-gray-300')}
              />
              {showErr('birth_date') && <p className="text-xs text-red-500 mt-0.5">{showErr('birth_date')}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('salaryType')} <span className="text-red-500">*</span></label>
              <div className="flex gap-2">
                {(['fixed', 'percent', 'per_student'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, salary_type: type, salary_amount: '' }))}
                    className={cn('flex-1 py-2 text-xs font-medium border rounded transition-colors',
                      form.salary_type === type ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50')}
                  >
                    {t(SALARY_LABELS[type] as Parameters<typeof t>[0])}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('monthlySalary')} <span className="text-red-500">*</span>
              </label>
              <input
                ref={salaryAmtRef}
                type="number"
                value={form.salary_amount}
                onChange={(e) => setForm((f) => ({ ...f, salary_amount: e.target.value }))}
                onBlur={() => touch('salary_amount')}
                onKeyDown={makeHandleKey(saveRef, birthDateRef, closeModal)}
                className={cn('w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500', showErr('salary_amount') ? 'border-red-400' : 'border-gray-300')}
                required
              />
              {showErr('salary_amount') && <p className="text-xs text-red-500 mt-1">{showErr('salary_amount')}</p>}
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={closeModal}
                className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50">
                {common('cancel')}
              </button>
              <button
                ref={saveRef}
                type="submit"
                disabled={saving || hasFormErrors}
                className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-60"
              >
                {saving ? common('loading') : common('save')}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ══ Archive Teacher Dialog ══ */}
      <Dialog open={!!archiveTarget} onOpenChange={(open) => { if (!open) setArchiveTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{common('archive')}</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600 mt-1">
            <span className="font-medium">{archiveTarget?.name}</span>
          </p>
          <div className="flex gap-3 mt-4">
            <button onClick={() => setArchiveTarget(null)}
              className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50">
              {common('cancel')}
            </button>
            <button onClick={confirmArchive}
              className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700">
              {common('archive')}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══ Add Staff Dialog ══ */}
      <Dialog open={showAddStaff} onOpenChange={(open) => { if (!open) { setShowAddStaff(false); setStaffForm(blankStaffForm()); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{t('addStaff')}</DialogTitle></DialogHeader>
          <form onSubmit={handleAddStaff} className="space-y-3 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{common('name')} *</label>
                <input type="text" value={staffForm.first_name} required
                  onChange={e => setStaffForm(f => ({ ...f, first_name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={common('name')} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{common('lastName')} *</label>
                <input type="text" value={staffForm.last_name} required
                  onChange={e => setStaffForm(f => ({ ...f, last_name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={common('lastName')} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{common('phone')} *</label>
              <div className="flex">
                <span className="inline-flex items-center px-3 border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm rounded-l">+998</span>
                <input type="tel" value={staffForm.phone} required
                  onChange={e => setStaffForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 9) }))}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-r text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="XX XXX XX XX" maxLength={9} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('role')} *</label>
              <select value={staffForm.role} onChange={e => setStaffForm(f => ({ ...f, role: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            {['admin', 'manager'].includes(staffForm.role) && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Parol *</label>
                <input type="password" value={staffForm.password}
                  onChange={e => setStaffForm(f => ({ ...f, password: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Kamida 6 ta belgi" minLength={6} required />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('monthlySalary')} *</label>
              <input type="text" inputMode="numeric" value={staffForm.salary_amount}
                onChange={e => setStaffForm(f => ({ ...f, salary_amount: formatAmount(e.target.value) }))}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0" />
              <p className="text-xs text-gray-400 mt-0.5">Minimal: 100,000 so&apos;m</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{common('note')}</label>
              <textarea value={staffForm.notes} rows={2}
                onChange={e => setStaffForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="Qo'shimcha ma'lumot..." />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => { setShowAddStaff(false); setStaffForm(blankStaffForm()); }}
                className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50">
                {common('cancel')}
              </button>
              <button type="submit" disabled={savingStaff}
                className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-60">
                {savingStaff ? common('loading') : common('save')}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ══ Archive Staff Dialog ══ */}
      <Dialog open={!!staffArchiveTarget} onOpenChange={(open) => { if (!open) setStaffArchiveTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{common('archive')}</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600 mt-1">
            <span className="font-medium">{staffArchiveTarget?.full_name}</span>
          </p>
          <div className="flex gap-3 mt-4">
            <button onClick={() => setStaffArchiveTarget(null)}
              className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50">
              {common('cancel')}
            </button>
            <button onClick={handleArchiveStaff} disabled={staffArchiving}
              className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700 disabled:opacity-60">
              {staffArchiving ? common('loading') : common('archive')}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
