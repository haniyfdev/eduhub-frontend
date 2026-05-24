'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Search, Send, Minus, Snowflake } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Pagination } from '@/components/pagination';
import { SmsModal, type SmsRecipient } from '@/components/sms-modal';
import api from '@/lib/axios';
import { cn, formatPhone, formatDMY } from '@/lib/utils';
import { Student, PaginatedResponse } from '@/types';

const STATUS_STYLES: Record<string, string> = {
  pending:  'bg-yellow-50 text-yellow-700 border-yellow-200',
  active:   'bg-green-50 text-green-700 border-green-200',
  trial:    'bg-blue-50 text-blue-700 border-blue-200',
  archived: 'bg-gray-100 text-gray-600 border-gray-200',
  frozen:   'bg-cyan-100 text-cyan-700 border-cyan-300',
};
const STATUS_LABELS: Record<string, string> = {
  pending: 'Kutilmoqda', active: 'Faol', trial: 'Sinov', archived: 'Arxivlangan', frozen: 'Muzlatilgan',
};

interface Course { id: string; name: string; }

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
  const [archiveTarget, setArchiveTarget] = useState<{ id: string; name: string; status: string } | null>(null);
  const [archiveReason, setArchiveReason] = useState<'graduated' | 'dropped_out' | ''>('');
  const overdueIdsRef = useRef<Set<string>>(new Set());
  const [phoneSelection, setPhoneSelection] = useState<PhoneSelection>({});
  const [showSmsConfirm, setShowSmsConfirm] = useState(false);

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

  async function handleSendSms(templateId: string | null, customMessage: string | null, recipients: SmsRecipient[]) {
    try {
      await api.post('/api/v1/notifications/send-sms/', {
        template_id: templateId,
        message: customMessage,
        recipients: recipients.map(r => ({
          type: r.type,
          id: r.id,
          phone: r.phone,
          student_name: r.name,
          amount: r.amount || '',
          due_date: r.due_date || '',
          course_name: r.course_name || '',
          group_name: r.group_name || '',
          teacher_name: r.teacher_name || '',
          company_name: r.company_name || '',
          lesson_time: r.lesson_time || '',
          room_number: r.room_number || '',
        })),
      });

      toast.success(`${recipients.length} ta SMS yuborildi`);
    } catch {
      toast.error('SMS yuborishda xatolik');
    }
  }

const selectedStudentIds = students
  .filter(s => phoneSelection[s.id]?.phone1 || phoneSelection[s.id]?.phone2)
  .map(s => s.id);

const [smsVariables, setSmsVariables] = useState<Record<string, Record<string, string>>>({});

async function openSmsModal() {
  if (selectedStudentIds.length === 0) return;
  try {
    const { data } = await api.post('/api/v1/sms-variables/', {
      student_ids: selectedStudentIds,
    });
    console.log('sms-variables response:', data);
    setSmsVariables(data);
  } catch (err) {
    console.error('sms-variables error:', err);
    setSmsVariables({});
  }
  setShowSmsConfirm(true);
}

  const smsRecipients: SmsRecipient[] = students.flatMap(s => {
    const sel = phoneSelection[s.id];
    const vars = smsVariables[s.id] ?? {};
    const recs: SmsRecipient[] = [];
    const base = {
      name: `${s.first_name} ${s.last_name}`,
      type: 'student' as const,
      amount: vars.amount || '',
      balance: vars.balance || '',
      due_date: vars.due_date || '',
      course_name: vars.course_name || s.course_name || '',
      group_name: vars.group_name || s.current_group || '',
      teacher_name: vars.teacher_name || '',
      company_name: vars.company_name || '',
      lesson_time: vars.lesson_time || '',
      room_number: vars.room_number || '',
    };
    if (sel?.phone1 && s.phone)
      recs.push({ id: s.id, phone: s.phone, ...base });
    if (sel?.phone2 && s.second_phone)
      recs.push({ id: s.id, phone: s.second_phone, ...base });
    return recs;
  });

  // ── Archive ────────────────────────────────────────────────────────────────

  async function confirmArchive() {
    if (!archiveTarget || !archiveReason) return;
    try {
      await api.post(`/api/v1/students/${archiveTarget.id}/archive/`, { reason: archiveReason });
      toast.success("O'quvchi arxivlandi");
      setArchiveTarget(null);
      setArchiveReason('');
      fetchStudents();
    } catch {
      toast.error('Xatolik yuz berdi');
    }
  }

  function rowBg(s: Student): string {
    if (s.status === 'frozen')                return 'bg-[#F0F9FF]';
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
        {selectedSmsCount > 0 && (
          <button
            onClick={openSmsModal}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded hover:bg-indigo-700 transition-colors"
          >
            <Send className="w-4 h-4" />
            SMS yuborish ({selectedSmsCount})
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ism yoki guruh raqami..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700">
          <option value="">Barchasi</option>
          <option value="active">Faol</option>
          <option value="frozen">Muzlatilgan</option>
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
                {['№', 'Ism', 'Telefon', 'Ota-ona tel', 'Guruh', 'Kurs', "Tug'ilgan", 'Holat', 'Amal'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading
                ? Array(8).fill(0).map((_, i) => (
                  <tr key={i}>{Array(9).fill(0).map((_, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                  ))}</tr>
                ))
                : students.length === 0
                  ? <tr><td colSpan={9} className="px-4 py-16 text-center text-gray-400">Natija topilmadi</td></tr>
                  : students.map((s, idx) => (
                    <tr key={s.id} className={cn('transition-colors hover:brightness-95', rowBg(s))}>
                      {/* 1. № */}
                      <td className="px-4 py-3 text-gray-400 text-xs">{(page - 1) * pageSize + idx + 1}</td>
                      
                      {/* 2. Ism */}
                      <td className="px-4 py-3 font-medium text-gray-900">{s.first_name} {s.last_name}</td>
                      
                      {/* 3. Telefon */}
                      <td className="px-4 py-3">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input type="checkbox" checked={phoneSelection[s.id]?.phone1 ?? false}
                            onChange={() => togglePhone(s.id, 'phone1')} className="rounded border-gray-300 flex-shrink-0" />
                          <span className="text-gray-500">{formatPhone(s.phone)}</span>
                        </label>
                      </td>

                      {/* 4. Ota-ona tel */}
                      <td className="px-4 py-3">
                        {s.second_phone ? (
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input type="checkbox" checked={phoneSelection[s.id]?.phone2 ?? false}
                             onChange={() => togglePhone(s.id, 'phone2')} className="rounded border-gray-300 flex-shrink-0" />
                            <span className="text-gray-500">{formatPhone(s.second_phone)}</span>
                          </label>
                        ) : <span className="text-gray-400">—</span>}
                      </td>

                      {/* 5. Guruh */}
                      <td className="px-4 py-3 font-medium text-gray-700">{s.current_group || '—'}</td>

                      {/* 6. Kurs */}
                      <td className="px-4 py-3 text-gray-600">{s.course_name || '—'}</td>

                      {/* 7. Tug'ilgan */}
                      <td className="px-4 py-3 text-gray-600">{formatDMY(s.birth_date)}</td>

                      {/* 8. Holat */}
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium border rounded',
                          STATUS_STYLES[s.status] ?? 'bg-gray-100 text-gray-600 border-gray-200')}>
                          {s.status === 'frozen' && <Snowflake className="w-3 h-3 flex-shrink-0" />}
                          {STATUS_LABELS[s.status] ?? s.status}
                        </span>
                      </td>

                      {/* 9. Amal */}
                      <td className="px-4 py-3">
                        {s.status !== 'archived' ? (
                          <button
                            onClick={() => setArchiveTarget({ id: s.id, name: `${s.first_name} ${s.last_name}`, status: s.status })}
                            className="p-1 rounded text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                            title="Arxivlash"
                          >
                            <Minus className="w-4 h-4" />
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

      {/* ══ Archive Dialog ══ */}
      <Dialog open={!!archiveTarget} onOpenChange={(open) => { if (!open) { setArchiveTarget(null); setArchiveReason(''); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{archiveTarget?.name}ni arxivlash</DialogTitle>
          </DialogHeader>
          <div className="mt-4 space-y-3">
            {archiveTarget?.status !== 'trial' && (
              <button
                onClick={() => setArchiveReason('graduated')}
                className={cn(
                  'w-full flex items-start gap-3 p-4 rounded-lg border-2 text-left transition-colors',
                  archiveReason === 'graduated' ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                )}
              >
                <span className="text-2xl leading-none">🎓</span>
                <div>
                  <p className="font-medium text-sm text-gray-900">Kursni bitirdi</p>
                  <p className="text-xs text-gray-500 mt-0.5">O&apos;quv rejasi to&apos;liq tugadi</p>
                </div>
              </button>
            )}
            <button
              onClick={() => setArchiveReason('dropped_out')}
              className={cn(
                'w-full flex items-start gap-3 p-4 rounded-lg border-2 text-left transition-colors',
                archiveReason === 'dropped_out' ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
              )}
            >
              <span className="text-2xl leading-none">🚪</span>
              <div>
                <p className="font-medium text-sm text-gray-900">Tashlab ketdi</p>
                <p className="text-xs text-gray-500 mt-0.5">Kurs tugamasdan chiqib ketdi</p>
              </div>
            </button>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={() => { setArchiveTarget(null); setArchiveReason(''); }}
              className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50">
              Bekor qilish
            </button>
            <button onClick={confirmArchive} disabled={!archiveReason}
              className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700 disabled:opacity-50">
              Arxivlash
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <SmsModal
        open={showSmsConfirm}
        onClose={() => setShowSmsConfirm(false)}
        recipients={smsRecipients}
        onSend={handleSendSms}
      />
    </div>
  );
}
