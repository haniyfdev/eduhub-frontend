'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Plus, Search, Send } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Pagination } from '@/components/pagination';
import api from '@/lib/axios';
import { cn, formatPhone, formatDMY } from '@/lib/utils';
import { Student, PaginatedResponse } from '@/types';

const STATUS_STYLES: Record<string, string> = {
  pending:  'bg-yellow-50 text-yellow-700 border-yellow-200',
  active:   'bg-green-50 text-green-700 border-green-200',
  trial:    'bg-blue-50 text-blue-700 border-blue-200',
  archived: 'bg-gray-100 text-gray-600 border-gray-200',
};
const STATUS_LABELS: Record<string, string> = {
  pending: 'Kutilmoqda', active: 'Faol', trial: 'Sinov', archived: 'Arxivlangan',
};
const STATUS_ORDER: Record<string, number> = { active: 0, trial: 1, pending: 2, archived: 4 };

interface Course { id: string; name: string; }

const EMPTY_FORM = {
  first_name: '', last_name: '', phone: '', second_phone: '',
  birth_date: '', course_id: '', referral_source: '',
};

type PhoneSelection = Record<string, { phone1: boolean; phone2: boolean }>;

export default function StudentsPage() {
  const [students, setStudents]         = useState<Student[]>([]);
  const [courses, setCourses]           = useState<Course[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(false);
  const [search, setSearch]             = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [page, setPage]                 = useState(1);
  const [pageSize, setPageSize]         = useState(25);
  const [count, setCount]               = useState(0);
  const [showAdd, setShowAdd]           = useState(false);
  const [saving, setSaving]             = useState(false);
  const [form, setForm]                 = useState(EMPTY_FORM);
  const [archiveTarget, setArchiveTarget] = useState<{ id: string; name: string } | null>(null);
  const overdueIdsRef = useRef<Set<string>>(new Set());
  const [touched, setTouched]           = useState<Record<string, boolean>>({});
  const [phoneSelection, setPhoneSelection] = useState<PhoneSelection>({});
  const [showSmsConfirm, setShowSmsConfirm] = useState(false);
  const [sendingSms, setSendingSms]     = useState(false);

  // ── Keyboard refs ──────────────────────────────────────────────────────────
  const firstNameRef = useRef<HTMLInputElement>(null);
  const lastNameRef  = useRef<HTMLInputElement>(null);
  const phoneRef     = useRef<HTMLInputElement>(null);
  const phone2Ref    = useRef<HTMLInputElement>(null);
  const courseRef    = useRef<HTMLSelectElement>(null);
  const saveRef      = useRef<HTMLButtonElement>(null);
  

  function handleKey(
    e: React.KeyboardEvent,
    next?: React.RefObject<HTMLElement>,
    prev?: React.RefObject<HTMLElement>,
  ) {
    if (e.key === 'Escape') {
      setShowAdd(false);
      setForm(EMPTY_FORM);
      setTouched({});
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      next?.current?.focus();
    }
    if (e.key === 'Backspace' && (e.target as HTMLInputElement).value === '') {
      e.preventDefault();
      prev?.current?.focus();
    }
  }

  // ── Data fetching ──────────────────────────────────────────────────────────

  useEffect(() => {
    api.get<PaginatedResponse<{ student: string }>>('/api/v1/debts/?status=overdue&page_size=200')
      .then(({ data }) => {
        overdueIdsRef.current = new Set<string>(data.results.map((d) => d.student).filter(Boolean));
      })
      .catch(() => {});
  }, []);

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const params: Record<string, string | number> = { page, page_size: pageSize };
      if (search)       params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (courseFilter) params.course = courseFilter;
      const { data } = await api.get<PaginatedResponse<Student>>('/api/v1/students/', { params });

      setStudents(data.results ?? []);

      
      setCount(data.count);
      const init: PhoneSelection = {};
      (data.results ?? []).forEach((s: Student) => { init[s.id] = { phone1: false, phone2: false }; });
      setPhoneSelection(init);
    } catch {
      setError(true);
      toast.error("Ma'lumotlarni yuklashda xatolik");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, statusFilter, courseFilter]);

  useEffect(() => { fetchStudents(); }, [fetchStudents]);
  useEffect(() => { setPage(1); }, [search, statusFilter, courseFilter]);

  useEffect(() => {
    api.get<PaginatedResponse<Course>>('/api/v1/courses/?page_size=100&status=active')
      .then(({ data }) => setCourses(data.results))
      .catch(() => {});
  }, []);

  // ── SMS ────────────────────────────────────────────────────────────────────

  function togglePhone(id: string, key: 'phone1' | 'phone2') {
    setPhoneSelection((prev) => ({
      ...prev,
      [id]: { ...prev[id], [key]: !prev[id]?.[key] },
    }));
  }

  const selectedSmsCount = students.reduce((acc, s) => {
    const sel = phoneSelection[s.id];
    if (sel?.phone1 && s.phone)        acc++;
    if (sel?.phone2 && s.second_phone) acc++;
    return acc;
  }, 0);

  async function handleSendSms() {
    setSendingSms(true);
    let success = 0;
    for (const s of students) {
      const sel = phoneSelection[s.id];
      const phones: string[] = [];
      if (sel?.phone1 && s.phone)        phones.push(s.phone);
      if (sel?.phone2 && s.second_phone) phones.push(s.second_phone);
      for (const phone of phones) {
        try {
          await api.post(`/api/v1/students/${s.id}/send-sms/`, { phone });
          success++;
        } catch { /* skip */ }
      }
    }
    toast.success(`${success} ta SMS yuborildi`);
    setShowSmsConfirm(false);
    setSendingSms(false);
  }

  // ── Form validation ────────────────────────────────────────────────────────

  const fieldErrors = {
    first_name:  !form.first_name  ? 'Ism majburiy'        : form.first_name.length  < 2 ? 'Kamida 2 harf'  : form.first_name.length  > 50 ? "Ko'pi bilan 50 harf" : '',
    last_name:   !form.last_name   ? 'Familiya majburiy'   : form.last_name.length   < 2 ? 'Kamida 2 harf'  : form.last_name.length   > 50 ? "Ko'pi bilan 50 harf" : '',
    phone:       form.phone.replace(/\D/g, '').length !== 9 ? "To'liq 9 raqam kiriting" : '',
    second_phone: form.second_phone && form.second_phone.replace(/\D/g, '').length !== 9 ? '9 raqam kiriting' : '',
    course_id:   !form.course_id   ? 'Kurs majburiy'       : '',
    birth_date: !form.birth_date ? "Tug'ilgan sana majburiy" : form.birth_date.length !== 10 ? "dd/mm/yyyy formatida kiriting" : '',
  };
  const hasFormErrors = Object.values(fieldErrors).some(Boolean);

  function touch(field: string) {
    setTouched((t) => ({ ...t, [field]: true }));
  }

  function showErr(field: string) {
    return touched[field] ? (fieldErrors as Record<string, string>)[field] ?? '' : '';
  }

  // ── Add student ────────────────────────────────────────────────────────────

  async function handleAddStudent(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ first_name: true, last_name: true, phone: true, second_phone: true, course_id: true, birth_date: true });
    if (hasFormErrors) return;
    setSaving(true);
    try {
      await api.post('/api/v1/students/', {
        first_name:      form.first_name,
        last_name:       form.last_name,
        phone:           '+998' + form.phone.replace(/\D/g, ''),
        second_phone:    form.second_phone ? '+998' + form.second_phone.replace(/\D/g, '') : null,
        birth_date:      form.birth_date
                         ? form.birth_date.split('/').reverse().join('-')
                         : null,
        course:          form.course_id || null,
        referral_source: form.referral_source || null,
      });
      toast.success("O'quvchi muvaffaqiyatli qo'shildi");
      setShowAdd(false);
      setForm(EMPTY_FORM);
      setTouched({});
      fetchStudents();
    } catch (err: any) {
      const detail = err?.response?.data;
      const msg = typeof detail === 'string' ? detail : detail?.detail || Object.values(detail ?? {})[0] || 'Xatolik yuz berdi';
      toast.error(String(msg));
    } finally {
      setSaving(false);
    }
  }

  async function confirmArchive() {
    if (!archiveTarget) return;
    try {
      await api.post(`/api/v1/students/${archiveTarget.id}/archive/`);
      toast.success("O'quvchi arxivlandi");
      setArchiveTarget(null);
      fetchStudents();
    } catch {
      toast.error('Xatolik yuz berdi');
    }
  }

  function rowBg(s: Student): string {
    if (s.status === 'archived')              return 'bg-[#FFFBEB]';
    if (overdueIdsRef.current.has(s.id))     return 'bg-[#FEF2F2]';
    return '';
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      <Toaster position="top-right" />

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">O&apos;quvchilar</h1>
        <div className="flex items-center gap-2">
          {selectedSmsCount > 0 && (
            <button
              onClick={() => setShowSmsConfirm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded hover:bg-indigo-700 transition-colors"
            >
              <Send className="w-4 h-4" />
              SMS yuborish ({selectedSmsCount})
            </button>
          )}
          <button
            onClick={() => { setShowAdd(true); setTimeout(() => firstNameRef.current?.focus(), 100); }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> Qo&apos;shish
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Qidirish..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700">
          <option value="">Barchasi</option>
          <option value="pending">Kutilmoqda</option>
          <option value="active">Faol</option>
          <option value="trial">Sinov</option>
          <option value="archived">Arxivlangan</option>
        </select>
        <select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700">
          <option value="">Barcha kurslar</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded border border-gray-200 shadow-sm overflow-hidden">
        {error ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500">
            <p className="mb-3 text-sm">Xatolik yuz berdi</p>
            <button onClick={fetchStudents} className="text-sm text-blue-600 underline">Qayta urinish</button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {['№', 'Ism', 'Telefon', 'Ota-ona tel', "Tug'ilgan sana", 'Kurs', 'Holat', 'Amallar'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading
                ? Array(8).fill(0).map((_, i) => (
                  <tr key={i}>{Array(8).fill(0).map((_, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                  ))}</tr>
                ))
                : students.length === 0
                  ? <tr><td colSpan={8} className="px-4 py-16 text-center text-gray-400">Natija topilmadi</td></tr>
                  : students.map((s, idx) => (
                    <tr key={s.id} className={cn('transition-colors hover:brightness-95', rowBg(s))}>
                      <td className="px-4 py-3 text-gray-400 text-xs">{(page - 1) * pageSize + idx + 1}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{s.first_name} {s.last_name}</td>
                      <td className="px-4 py-3">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input type="checkbox" checked={phoneSelection[s.id]?.phone1 ?? false}
                            onChange={() => togglePhone(s.id, 'phone1')} className="rounded border-gray-300 flex-shrink-0" />
                          <span className="text-gray-500">{formatPhone(s.phone)}</span>
                        </label>
                      </td>
                      <td className="px-4 py-3">
                        {s.second_phone ? (
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input type="checkbox" checked={phoneSelection[s.id]?.phone2 ?? false}
                              onChange={() => togglePhone(s.id, 'phone2')} className="rounded border-gray-300 flex-shrink-0" />
                            <span className="text-gray-500">{formatPhone(s.second_phone)}</span>
                          </label>
                        ) : <span className="text-gray-400 px-4">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{formatDMY(s.birth_date)}</td>
                      <td className="px-4 py-3 text-gray-600">{s.course_name || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex items-center px-2 py-0.5 text-xs font-medium border rounded',
                          STATUS_STYLES[s.status] ?? 'bg-gray-100 text-gray-600 border-gray-200')}>
                          {STATUS_LABELS[s.status] ?? s.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {s.status !== 'archived' ? (
                          <button
                            onClick={() => setArchiveTarget({ id: s.id, name: `${s.first_name} ${s.last_name}` })}
                            className="text-xs text-red-500 hover:underline"
                          >
                            Arxivlash
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400">
                            {s.archived_at ? formatDMY(s.archived_at) : '—'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        )}
      </div>

      <Pagination page={page} pageSize={pageSize} count={count}
        onPageChange={setPage} onPageSizeChange={(ps) => { setPageSize(ps); setPage(1); }} />

      {/* ══ Add Student Dialog ══ */}
      <Dialog open={showAdd} onOpenChange={(open) => { if (!open) { setForm(EMPTY_FORM); setTouched({}); } setShowAdd(open); }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Yangi o&apos;quvchi</DialogTitle></DialogHeader>
          <form onSubmit={handleAddStudent} className="space-y-4 mt-2">

            {/* Ism + Familiya */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ism <span className="text-red-500">*</span></label>
                <input
                  ref={firstNameRef}
                  value={form.first_name}
                  onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                  onBlur={() => touch('first_name')}
                  onKeyDown={(e) => handleKey(e, lastNameRef)}
                  className={cn('w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500',
                    showErr('first_name') ? 'border-red-400' : 'border-gray-300')}
                />
                {showErr('first_name') && <p className="text-xs text-red-500 mt-0.5">{showErr('first_name')}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Familiya <span className="text-red-500">*</span></label>
                <input
                  ref={lastNameRef}
                  value={form.last_name}
                  onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                  onBlur={() => touch('last_name')}
                  onKeyDown={(e) => handleKey(e, phoneRef, firstNameRef)}
                  className={cn('w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500',
                    showErr('last_name') ? 'border-red-400' : 'border-gray-300')}
                />
                {showErr('last_name') && <p className="text-xs text-red-500 mt-0.5">{showErr('last_name')}</p>}
              </div>
            </div>

            {/* Telefon */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telefon <span className="text-red-500">*</span></label>
              <div className="flex">
                <span className="inline-flex items-center px-3 border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm rounded-l">+998</span>
                <input
                  ref={phoneRef}
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 9) }))}
                  onBlur={() => touch('phone')}
                  onKeyDown={(e) => handleKey(e, phone2Ref, lastNameRef)}
                  placeholder="XX XXX XX XX"
                  className={cn('flex-1 px-3 py-2 border rounded-r text-sm focus:outline-none focus:ring-2 focus:ring-blue-500',
                    showErr('phone') ? 'border-red-400' : 'border-gray-300')}
                />
              </div>
              {showErr('phone') && <p className="text-xs text-red-500 mt-0.5">{showErr('phone')}</p>}
            </div>

            {/* Ota-ona tel */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ota-ona telefoni</label>
              <div className="flex">
                <span className="inline-flex items-center px-3 border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm rounded-l">+998</span>
                <input
                  ref={phone2Ref}
                  type="tel"
                  value={form.second_phone}
                  onChange={(e) => setForm((f) => ({ ...f, second_phone: e.target.value.replace(/\D/g, '').slice(0, 9) }))}
                  onBlur={() => touch('second_phone')}
                  onKeyDown={(e) => handleKey(e, saveRef, phoneRef)}
                  placeholder="XX XXX XX XX"
                  className={cn('flex-1 px-3 py-2 border rounded-r text-sm focus:outline-none focus:ring-2 focus:ring-blue-500',
                    showErr('second_phone') ? 'border-red-400' : 'border-gray-300')}
                />
              </div>
              {showErr('second_phone') && <p className="text-xs text-red-500 mt-0.5">{showErr('second_phone')}</p>}
            </div>

            {/* Tug'ilgan sana */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tug&apos;ilgan sana <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="dd/mm/yyyy"
                value={form.birth_date}
                maxLength={10}
                onKeyDown={(e) => handleKey(e, courseRef, phone2Ref)}
                onChange={(e) => {
                  let val = e.target.value.replace(/\D/g, ''); // Faqat raqamlarni qoldirish
                  if (val.length > 8) val = val.slice(0, 8);
                  
                  // Avtomatik "/" belgilarini qo'shish (Maska: 12/05/2010)
                  let masked = val;
                  if (val.length > 2) masked = val.slice(0, 2) + '/' + val.slice(2);
                  if (val.length > 4) masked = masked.slice(0, 5) + '/' + masked.slice(5);
                  
                  setForm((f) => ({ ...f, birth_date: masked }));
                  touch('birth_date');
                }}
                className={cn(
                  'w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500',
                  showErr('birth_date') ? 'border-red-400' : 'border-gray-300'
                )}
              />
              {showErr('birth_date') && (
                <p className="text-xs text-red-500 mt-0.5">{showErr('birth_date')}</p>
              )}
            </div>
            {/* Kurs */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kurs <span className="text-red-500">*</span></label>
              <select
                  value={form.course_id}
                  onChange={(e) => { setForm((f) => ({ ...f, course_id: e.target.value })); touch('course_id'); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); saveRef.current?.focus(); }
                    if (e.key === 'Escape') { setShowAdd(false); setForm(EMPTY_FORM); setTouched({}); }
                  }}
                className={cn('w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500',
                  showErr('course_id') ? 'border-red-400' : 'border-gray-300')}
              >
                <option value="">Tanlang</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {showErr('course_id') && <p className="text-xs text-red-500 mt-0.5">{showErr('course_id')}</p>}
            </div>

            {/* Qayerdan eshitdi */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Qayerdan eshitdi</label>
              <select
                value={form.referral_source}
                onChange={(e) => setForm((f) => ({ ...f, referral_source: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); saveRef.current?.focus(); }
                  if (e.key === 'Escape') { setShowAdd(false); setForm(EMPTY_FORM); setTouched({}); }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Tanlang</option>
                <option value="banner">Banner</option>
                <option value="friend">Tanish</option>
                <option value="parent">Ota-ona</option>
                <option value="social_media">Ijtimoiy tarmoq</option>
                <option value="other">Boshqa</option>
              </select>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => { setShowAdd(false); setForm(EMPTY_FORM); setTouched({}); }}
                className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50"
              >
                Bekor qilish
              </button>
              <button
                ref={saveRef}
                type="submit"
                disabled={saving || hasFormErrors}
                className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-60"
              >
                {saving ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ══ Archive Dialog ══ */}
      <Dialog open={!!archiveTarget} onOpenChange={(open) => { if (!open) setArchiveTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Arxivlash</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600 mt-1">
            <span className="font-medium">{archiveTarget?.name}</span>ni arxivlashni istaysizmi?
          </p>
          <div className="flex gap-3 mt-4">
            <button onClick={() => setArchiveTarget(null)}
              className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50">
              Bekor qilish
            </button>
            <button onClick={confirmArchive}
              className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700">
              Ha, arxivlash
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══ SMS Confirm Dialog ══ */}
      <Dialog open={showSmsConfirm} onOpenChange={setShowSmsConfirm}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>SMS yuborish</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600 mt-1">
            Tanlangan <span className="font-semibold">{selectedSmsCount} ta</span> raqamga SMS yuboriladi. Tasdiqlaysizmi?
          </p>
          <div className="flex gap-3 mt-4">
            <button onClick={() => setShowSmsConfirm(false)}
              className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50">
              Bekor
            </button>
            <button onClick={handleSendSms} disabled={sendingSms}
              className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2">
              <Send className="w-4 h-4" />
              {sendingSms ? 'Yuborilmoqda...' : 'Yuborish'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}