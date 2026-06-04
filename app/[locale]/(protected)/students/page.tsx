'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Search, Send, Minus, Snowflake, Tag, Play, UserPlus } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Pagination } from '@/components/pagination';
import { SmsModal, type SmsRecipient } from '@/components/sms-modal';
import { DiscountModal, type DiscountStudent } from '@/components/discount-modal';
import api from '@/lib/axios';
import { cn, formatPhone, formatDMY } from '@/lib/utils';
import { getUser } from '@/lib/auth';
import { PaginatedResponse, User } from '@/types';

const STATUS_STYLES: Record<string, string> = {
  pending:  'bg-yellow-50 text-yellow-700 border-yellow-200',
  active:   'bg-green-50 text-green-700 border-green-200',
  trial:    'bg-blue-50 text-blue-700 border-blue-200',
  archived: 'bg-gray-100 text-gray-600 border-gray-200',
  frozen:   'bg-cyan-100 text-cyan-700 border-cyan-300',
};

interface GroupMembership {
  group_student_id: string;
  group_id: string;
  group_name: string;
  course_name: string;
  course_id: string;
  course_price?: number;
  status?: string;
  joined_at: string;
  left_at: string | null;
}

interface Student {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  second_phone?: string;
  birth_date?: string;
  status: string;
  archive_reason?: string;
  archived_at?: string;
  created_at: string;
  group_memberships_data: GroupMembership[];
}

interface StudentRow extends Student {
  current_group: string;
  current_group_id: string | null;
  course_name: string;
  course_id: string;
  group_student_id: string | null;
  gs_status: string;
}

interface Course { id: string; name: string; }

type PhoneSelection = Record<string, { phone1: boolean; phone2: boolean }>;

export default function StudentsPage() {
  const t  = useTranslations('students');
  const tc = useTranslations('common');

  const [students, setStudents]         = useState<Student[]>([]);
  const [courses, setCourses]           = useState<Course[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(false);
  const [searchInput, setSearchInput]   = useState('');
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
  const [selectedIds, setSelectedIds]       = useState<Set<string>>(new Set());
  const [discountOpen, setDiscountOpen]     = useState(false);
  const [user, setUser]                     = useState<User | null>(() => getUser());
  const [showAddToGroup, setShowAddToGroup] = useState(false);
  const [addToGroupStudent, setAddToGroupStudent] = useState<Student | null>(null);
  const [availableGroups, setAvailableGroups] = useState<{id: string; name: string; course_name: string}[]>([]);

  useEffect(() => { setUser(getUser()); }, []);

  useEffect(() => {
    api.get<PaginatedResponse<any>>('/api/v1/debts/?status=overdue&page_size=200')
      .then(({ data }) => {
        overdueIdsRef.current = new Set<string>(
          data.results.map((d: any) => d.student_id).filter(Boolean)
        );
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
      toast.error(tc('error'));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, statusFilter, courseFilter, tc]);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => { fetchStudents(); }, [fetchStudents]);
  useEffect(() => { setPage(1); }, [search, statusFilter, courseFilter]);

  useEffect(() => {
    api.get<PaginatedResponse<Course>>('/api/v1/courses/?page_size=100&status=active')
      .then(({ data }) => setCourses(data.results))
      .catch(() => {});
  }, []);

const studentRows: StudentRow[] = students.flatMap(s => {
  const memberships = s.group_memberships_data ?? [];
  
  if (memberships.length === 0) {
    return [{
      ...s,
      current_group: '—',
      current_group_id: '',
      course_name: '—',
      course_id: '',
      group_student_id: '',
      gs_status: s.status,
    }];
  }

  return memberships.map(m => ({
    ...s,
    current_group: m.group_name,
    current_group_id: String(m.group_id),
    course_name: m.course_name,
    course_id: m.course_id || '',
    group_student_id: String(m.group_student_id),
    gs_status: m.status || s.status,
  }));
});
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
      toast.error(tc('error'));
    }
  }

  const selectedStudentIds = students
    .filter(s => phoneSelection[s.id]?.phone1 || phoneSelection[s.id]?.phone2)
    .map(s => s.id);

  const [smsVariables, setSmsVariables] = useState<Record<string, Record<string, string>>>({});

  async function openSmsModal() {
    if (selectedStudentIds.length === 0) return;
    try {
      const { data } = await api.post('/api/v1/sms-variables/', { student_ids: selectedStudentIds });
      setSmsVariables(data);
    } catch {
      setSmsVariables({});
    }
    setShowSmsConfirm(true);
  }

  const smsRecipients: SmsRecipient[] = students.flatMap(s => {
    const sel = phoneSelection[s.id];
    const vars = smsVariables[s.id] ?? {};
    const recs: SmsRecipient[] = [];
    const firstMembership = s.group_memberships_data?.[0];
    const base = {
      name: `${s.first_name} ${s.last_name}`,
      type: 'student' as const,
      amount: vars.amount || '',
      balance: vars.balance || '',
      due_date: vars.due_date || '',
      course_name: vars.course_name || firstMembership?.course_name || '',
      group_name: vars.group_name || firstMembership?.group_name || '',
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

  const canDiscount = ['boss', 'manager', 'admin'].includes(user?.role ?? '');
  const canFreeze   = ['boss', 'manager', 'admin'].includes(user?.role ?? '');
  const canEdit     = user?.role === 'boss' || user?.role === 'manager' || user?.role === 'admin';

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }

  // Selection is per-row (group_student_id), not per-student.
  // This lets Zafar's row in group 9 and his row in group 5C be checked independently.
  const selectedRows = studentRows.filter(s => selectedIds.has(s.group_student_id || s.id));

  const allSameCourse = selectedRows.length > 0 &&
    selectedRows.every(s => s.gs_status === 'active') &&
    !!selectedRows[0].course_id &&
    selectedRows.every(s => s.course_id === selectedRows[0].course_id);

  const discountStudents: DiscountStudent[] = selectedRows.map(s => {
    const m = s.group_memberships_data?.find(m => String(m.group_student_id) === s.group_student_id);
    return {
      id: s.id,
      name: `${s.first_name} ${s.last_name}`,
      course_id: s.course_id || '',
      course_name: s.course_name || '',
      course_price: m?.course_price ? Number(m.course_price) : 0,
    };
  });

  async function confirmArchive() {
    if (!archiveTarget || !archiveReason) return;
    try {
      await api.post(`/api/v1/students/${archiveTarget.id}/archive/`, { reason: archiveReason });
      toast.success(tc('success'));
      setArchiveTarget(null);
      setArchiveReason('');
      fetchStudents();
    } catch {
      toast.error(tc('error'));
    }
  }

  async function handleFreeze(id: string) {
    try {
      await api.post(`/api/v1/students/${id}/freeze/`);
      toast.success("O'quvchi muzlatildi");
      fetchStudents();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e?.response?.data?.error || tc('error'));
    }
  }

  async function handleUnfreeze(id: string) {
    try {
      await api.post(`/api/v1/students/${id}/unfreeze/`);
      toast.success("O'quvchi faollashtirildi");
      fetchStudents();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e?.response?.data?.error || tc('error'));
    }
  }

  function openAddToGroup(student: Student) {
    setAddToGroupStudent(student);
    setShowAddToGroup(true);
    api.get('/api/v1/groups/', { params: { status: 'active', page_size: 100 } })
      .then(({ data }) => setAvailableGroups(
        (data.results ?? []).map((g: any) => ({
          id: g.id,
          name: g.display_name ?? `${g.number}${(g.gender_type || '').toUpperCase()}`,
          course_name: g.course?.name ?? '—',
        }))
      ));
  }

  async function handleAddToGroup(groupId: string) {
    if (!addToGroupStudent) return;
    try {
      await api.post(`/api/v1/groups/${groupId}/add-student/`, {
        student_id: addToGroupStudent.id,
      });
      toast.success(t('addedToGroup'));
      setShowAddToGroup(false);
      fetchStudents();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.response?.data?.detail || tc('error'));
    }
  }

  function rowBg(s: Student): string {
    if (s.status === 'frozen')            return 'bg-[#F0F9FF]';
    if (s.status === 'archived')          return 'bg-[#FFFBEB]';
    if (overdueIdsRef.current.has(s.id)) return 'bg-[#FEF2F2]';
    return '';
  }

  const statusLabel = (status: string) => {
    switch (status) {
      case 'pending':  return tc('all') === 'All' ? 'Pending' : 'Kutilmoqda';
      case 'active':   return tc('active');
      case 'trial':    return 'Trial';
      case 'archived': return tc('archived');
      case 'frozen':   return tc('frozen');
      default:         return status;
    }
  };

  return (
    <div className="space-y-5">
      <Toaster position="top-right" />

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">{t('title')}</h1>
        <div className="flex gap-2">
          {selectedSmsCount > 0 && (
            <button onClick={openSmsModal}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded hover:bg-indigo-700 transition-colors">
              <Send className="w-4 h-4" />
              SMS ({selectedSmsCount})
            </button>
          )}
          {selectedRows.length > 0 && allSameCourse && canDiscount && (
            <button onClick={() => setDiscountOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white text-sm font-medium rounded hover:bg-amber-600 transition-colors">
              <Tag className="w-4 h-4" />
              Chegirma ({selectedRows.length})
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text" value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700">
          <option value="">{tc('all')}</option>
          <option value="active">{tc('active')}</option>
          <option value="frozen">{tc('frozen')}</option>
          <option value="archived">{tc('archived')}</option>
        </select>
        <select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700">
          <option value="">{tc('all')}</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="bg-white rounded border border-gray-200 shadow-sm overflow-hidden">
        {error ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500">
            <p className="mb-3 text-sm">{tc('error')}</p>
            <button onClick={fetchStudents} className="text-sm text-blue-600 underline">{tc('retry')}</button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {['№', '', tc('name'), tc('phone'), 'Ota-ona tel', tc('group'), tc('course'), tc('birthDate'), tc('status'), tc('actions')].map((h) => (
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
                : studentRows.length === 0
                  ? <tr><td colSpan={10} className="px-4 py-16 text-center text-gray-400">{t('noStudents')}</td></tr>
                  : studentRows.map((s, idx) => (
                    <tr key={`${s.id}-${s.group_student_id ?? idx}`} className={cn('transition-colors hover:brightness-95', rowBg(s))}>
                      <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>

                      {canDiscount && s.gs_status === 'active' ? (
                        <td className="px-3 py-3">
                          <input type="checkbox"
                            checked={selectedIds.has(s.group_student_id || s.id)}
                            onChange={() => toggleSelect(s.group_student_id || s.id)}
                            className="rounded border-gray-300" />
                        </td>
                      ) : <td />}

                      <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{s.first_name} {s.last_name}</td>

                      <td className="px-4 py-3">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input type="checkbox" checked={phoneSelection[s.id]?.phone1 ?? false}
                            onChange={() => togglePhone(s.id, 'phone1')} className="rounded border-gray-300 flex-shrink-0" />
                          <span className="text-gray-500 whitespace-nowrap">{formatPhone(s.phone)}</span>
                        </label>
                      </td>

                      <td className="px-4 py-3">
                        {s.second_phone ? (
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input type="checkbox" checked={phoneSelection[s.id]?.phone2 ?? false}
                             onChange={() => togglePhone(s.id, 'phone2')} className="rounded border-gray-300 flex-shrink-0" />
                            <span className="text-gray-500 whitespace-nowrap">{formatPhone(s.second_phone)}</span>
                          </label>
                        ) : <span className="text-gray-400">—</span>}
                      </td>

                      <td className="px-4 py-3 font-medium text-gray-700">{s.current_group || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{s.course_name || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{formatDMY(s.birth_date)}</td>

                      <td className="px-4 py-3">
                        {(() => {
                          const badge = s.status === 'archived' ? 'archived' : (s.gs_status || s.status);
                          return (
                            <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium border rounded',
                              STATUS_STYLES[badge] ?? 'bg-gray-100 text-gray-600 border-gray-200')}>
                              {badge === 'frozen' && <Snowflake className="w-3 h-3 flex-shrink-0" />}
                              {statusLabel(badge)}
                            </span>
                          );
                        })()}
                      </td>

                      <td className="px-4 py-3">
                        {s.status === 'archived' ? (
                          <span className="text-xs text-gray-400">
                            {s.archived_at ? formatDMY(s.archived_at) : '—'}
                          </span>
                        ) : (
                          <div className="flex items-center gap-1">
                            {selectedIds.has(s.group_student_id || s.id) && s.status === 'active' && canEdit && (
                              <button
                                onClick={(e) => { e.stopPropagation(); openAddToGroup(s); }}
                                className="p-1 rounded text-blue-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                                title={t('addToGroup')}
                              >
                                <UserPlus className="w-4 h-4" />
                              </button>
                            )}
                            {canFreeze && s.status === 'active' && (
                              <button
                                onClick={() => handleFreeze(s.id)}
                                className="p-1 rounded text-cyan-400 hover:bg-cyan-50 hover:text-cyan-600 transition-colors"
                                title="Muzlatish"
                              >
                                <Snowflake className="w-4 h-4" />
                              </button>
                            )}
                            {canFreeze && s.status === 'frozen' && (
                              <button
                                onClick={() => handleUnfreeze(s.id)}
                                className="p-1 rounded text-blue-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                                title="Faollashtirish"
                              >
                                <Play className="w-4 h-4" />
                              </button>
                            )}
                            {['boss', 'manager'].includes(user?.role ?? '') && s.status !== 'frozen' && (
                              <button
                                onClick={() => setArchiveTarget({ id: s.id, name: `${s.first_name} ${s.last_name}`, status: s.status })}
                                className="p-1 rounded text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                                title={tc('archive')}
                              >
                                <Minus className="w-4 h-4" />
                              </button>
                            )}
                          </div>
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

      <Dialog open={!!archiveTarget} onOpenChange={(open) => { if (!open) { setArchiveTarget(null); setArchiveReason(''); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{archiveTarget?.name} — {tc('archive')}</DialogTitle>
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
                  <p className="font-medium text-sm text-gray-900">{t('graduated')}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{t('graduatedDesc')}</p>
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
                <p className="font-medium text-sm text-gray-900">{t('droppedOut')}</p>
                <p className="text-xs text-gray-500 mt-0.5">{t('droppedOutDesc')}</p>
              </div>
            </button>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={() => { setArchiveTarget(null); setArchiveReason(''); }}
              className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50">
              {tc('cancel')}
            </button>
            <button onClick={confirmArchive} disabled={!archiveReason}
              className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700 disabled:opacity-50">
              {tc('archive')}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddToGroup} onOpenChange={setShowAddToGroup}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('addToGroup')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 mt-2 max-h-80 overflow-y-auto">
            {availableGroups.map(g => (
              <button
                key={g.id}
                onClick={() => handleAddToGroup(g.id)}
                className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 hover:bg-blue-50 hover:border-blue-300 transition-colors"
              >
                <span className="font-semibold text-gray-800">{g.name}</span>
                <span className="text-xs text-gray-500 ml-2">{g.course_name}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <SmsModal
        open={showSmsConfirm}
        onClose={() => setShowSmsConfirm(false)}
        recipients={smsRecipients}
        onSend={handleSendSms}
      />

      <DiscountModal
        open={discountOpen}
        onClose={() => { setDiscountOpen(false); setSelectedIds(new Set()); }}
        students={discountStudents}
        onSave={() => { fetchStudents(); setSelectedIds(new Set()); }}
      />
    </div>
  );
}
