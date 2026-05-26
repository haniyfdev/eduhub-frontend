'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Search, ArrowUpFromLine, Banknote, Percent, Users } from 'lucide-react';
import { Pagination } from '@/components/pagination';
import toast, { Toaster } from 'react-hot-toast';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import api from '@/lib/axios';
import { cn, formatPhone, formatDMY, formatCurrency } from '@/lib/utils';
import { PaginatedResponse } from '@/types';

type Tab = 'students' | 'teachers' | 'groups' | 'courses';

interface ArchiveStudent {
  id: string;
  source: 'student' | 'lead';
  first_name: string;
  last_name: string;
  phone: string;
  second_phone?: string | null;
  course_name: string;
  group_name: string;
  birth_date: string;
  archive_reason: string;
  archived_at: string;
  reason_display: string;
}

interface ArchivedTeacher {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  subject?: string;
  salary_type?: string;
  fixed_amount?: number | null;
  salary_percent?: number | null;
  per_student_amt?: number | null;
  birth_date?: string | null;
  hired_at?: string | null;
  archived_at?: string | null;
}

interface ArchivedGroup {
  id: string;
  name: string;
  course?: { name: string } | null;
  teacher?: { first_name: string; last_name: string } | null;
  schedule?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  room?: string | null;
  archived_at?: string | null;
}

interface ArchivedCourse {
  id: string;
  name: string;
  price?: number;
  duration_months?: number;
  duration_hours?: number;
  teacher_names?: string[];
  closed_at?: string | null;
}

// REASON_OPTIONS is built dynamically inside the component using translations

const SALARY_STYLES: Record<string, string> = {
  fixed:       'bg-gray-100 text-gray-700 border-gray-200',
  percent:     'bg-blue-50 text-blue-700 border-blue-200',
  per_student: 'bg-green-50 text-green-700 border-green-200',
};
// SALARY_LABELS built using translations inside the component

const thCls = 'text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap';
const tdCls = 'px-4 py-3';
const rowCls = 'bg-[#FFFBEB] hover:brightness-95 transition-colors';

function SkeletonRows({ cols }: { cols: number }) {
  return (
    <>
      {Array(5).fill(0).map((_, i) => (
        <tr key={i}>
          {Array(cols).fill(0).map((_, j) => (
            <td key={j} className={tdCls}><Skeleton className="h-4 w-full" /></td>
          ))}
        </tr>
      ))}
    </>
  );
}

function parseDays(schedule: string | null | undefined): string {
  if (!schedule) return '—';
  return schedule.split(' ')[0] || '—';
}

interface ConfirmState {
  id: string;
  source: 'student' | 'lead' | 'teacher' | 'group' | 'course';
  name: string;
}

export default function ArchivePage() {
  const t = useTranslations('archive');
  const common = useTranslations('common');
  const tc = useTranslations('teachers');
  const tc2 = useTranslations('courses');

  const REASON_OPTIONS = [
    { value: '', label: t('reasonAll') },
    { value: 'graduated', label: t('reasonGraduated') },
    { value: 'dropped_out', label: t('reasonDropped') },
    { value: 'ignored', label: t('reasonDeclined') },
  ];

  const SALARY_LABELS: Record<string, string> = {
    fixed: tc('fixed'), percent: tc('percent'), per_student: tc('perStudent'),
  };

  const TABS: { key: Tab; label: string }[] = [
    { key: 'students', label: t('tabs.students') },
    { key: 'teachers', label: t('tabs.teachers') },
    { key: 'groups',   label: t('tabs.groups') },
    { key: 'courses',  label: t('tabs.courses') },
  ];

  const [tab, setTab] = useState<Tab>('students');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [reasonFilter, setReasonFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [archiveStudents, setArchiveStudents] = useState<ArchiveStudent[]>([]);
  const [teachers, setTeachers] = useState<ArchivedTeacher[]>([]);
  const [groups, setGroups] = useState<ArchivedGroup[]>([]);
  const [courses, setCourses] = useState<ArchivedCourse[]>([]);

  // Debounce search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  // Reset to page 1 when tab, search, or filter changes
  useEffect(() => { setPage(1); }, [tab, debouncedSearch, reasonFilter]);

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, page_size: pageSize };
      if (debouncedSearch) params.search = debouncedSearch;
      if (reasonFilter) params.reason = reasonFilter;
      const { data } = await api.get<PaginatedResponse<ArchiveStudent>>('/api/v1/archive/students/', { params });
      setArchiveStudents(data.results ?? []);
      setTotalCount(data.count ?? 0);
    } catch {
      toast.error(common('error'));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, reasonFilter, page, pageSize, common]);

  const fetchTeachers = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { status: 'archived', page, page_size: pageSize };
      if (debouncedSearch) params.search = debouncedSearch;
      const { data } = await api.get<PaginatedResponse<ArchivedTeacher>>('/api/v1/teachers/', { params });
      setTeachers(data.results ?? []);
      setTotalCount(data.count ?? 0);
    } catch {
      toast.error(common('error'));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, page, pageSize, common]);

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { status: 'archived', page, page_size: pageSize };
      if (debouncedSearch) params.search = debouncedSearch;
      const { data } = await api.get<PaginatedResponse<ArchivedGroup>>('/api/v1/groups/', { params });
      setGroups(data.results ?? []);
      setTotalCount(data.count ?? 0);
    } catch {
      toast.error(common('error'));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, page, pageSize, common]);

  const fetchCourses = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { status: 'archived', page, page_size: pageSize };
      if (debouncedSearch) params.search = debouncedSearch;
      const { data } = await api.get<PaginatedResponse<ArchivedCourse>>('/api/v1/courses/', { params });
      setCourses(data.results ?? []);
      setTotalCount(data.count ?? 0);
    } catch {
      toast.error(common('error'));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, page, pageSize, common]);

  useEffect(() => {
    if (tab === 'students') fetchStudents();
    else if (tab === 'teachers') fetchTeachers();
    else if (tab === 'groups') fetchGroups();
    else if (tab === 'courses') fetchCourses();
  }, [tab, fetchStudents, fetchTeachers, fetchGroups, fetchCourses]);

  async function handleRestore() {
    if (!confirm) return;
    const { id, source } = confirm;
    setConfirm(null);
    setRestoring(id);
    try {
      if (source === 'lead') {
        await api.patch(`/api/v1/leads/${id}/`, { status: 'pending' });
      } else if (source === 'student') {
        await api.post(`/api/v1/students/${id}/restore/`);
      } else if (source === 'teacher') {
        await api.post(`/api/v1/teachers/${id}/restore/`);
      } else if (source === 'group') {
        await api.post(`/api/v1/groups/${id}/restore/`);
      } else if (source === 'course') {
        await api.post(`/api/v1/courses/${id}/restore/`);
      }
      toast.success(common('success'));
      if (tab === 'students') fetchStudents();
      else if (tab === 'teachers') fetchTeachers();
      else if (tab === 'groups') fetchGroups();
      else if (tab === 'courses') fetchCourses();
    } catch {
      toast.error(common('error'));
    } finally {
      setRestoring(null);
    }
  }

  function RestoreButton({ id, source, name }: { id: string; source: ConfirmState['source']; name: string }) {
    return (
      <button
        onClick={() => setConfirm({ id, source, name })}
        disabled={restoring === id}
        className="p-1.5 rounded-md text-green-600 hover:bg-green-50 disabled:opacity-40 transition-colors"
        title={t('restore')}
      >
        <ArrowUpFromLine className="w-4 h-4" />
      </button>
    );
  }

  function getDialogTitle() {
    if (!confirm) return '';
    const { source, name } = confirm;
    if (source === 'student') return t('restoreStudentTitle', { name });
    if (source === 'lead') return t('restoreLeadTitle', { name });
    if (source === 'teacher') return t('restoreTeacherTitle', { name });
    if (source === 'group') return t('restoreGroupTitle', { name });
    if (source === 'course') return t('restoreCourseTitle', { name });
    return t('restoreDefaultTitle');
  }

  function getDialogBody() {
    if (!confirm) return '';
    const { source } = confirm;
    if (source === 'student') return t('restoreStudentBody');
    if (source === 'lead') return t('restoreLeadBody');
    if (source === 'teacher') return t('restoreTeacherBody');
    if (source === 'group') return t('restoreGroupBody');
    if (source === 'course') return t('restoreCourseBody');
    return '';
  }

  return (
    <div className="space-y-5">
      <Toaster position="top-right" />

      <Dialog open={!!confirm} onOpenChange={(open) => { if (!open) setConfirm(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{getDialogTitle()}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">{getDialogBody()}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>{common('cancel')}</Button>
            <Button onClick={handleRestore} className="bg-green-600 hover:bg-green-700 text-white">{t('restore')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <h1 className="text-xl font-bold text-gray-900">{t('title')}</h1>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => { setTab(key); setSearch(''); setReasonFilter(''); }}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
              tab === key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="pl-9 pr-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
          />
        </div>
        {tab === 'students' && (
          <select
            value={reasonFilter}
            onChange={(e) => setReasonFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {REASON_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        )}
      </div>

      {/* Tables */}
      <div className="bg-white rounded border border-gray-200 shadow-sm overflow-x-auto">

        {/* === STUDENTS === */}
        {tab === 'students' && (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {[t('tableHeaders.num'), t('tableHeaders.name'), t('tableHeaders.phone'), t('tableHeaders.parentPhone'), t('tableHeaders.group'), t('tableHeaders.course'), t('tableHeaders.birthDate'), t('tableHeaders.status'), t('tableHeaders.archiveDate'), t('tableHeaders.actions')].map((h, i) => (
                  <th key={i} className={thCls}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? <SkeletonRows cols={10} /> : archiveStudents.length === 0
                ? <tr><td colSpan={10} className="px-4 py-16 text-center text-gray-400">{t('noStudents')}</td></tr>
                : archiveStudents.map((s, i) => (
                  <tr key={`${s.source}-${s.id}`} className={rowCls}>
                    <td className={cn(tdCls, 'text-gray-400 text-xs')}>{(page - 1) * pageSize + i + 1}</td>
                    <td className={cn(tdCls, 'font-medium text-gray-900 whitespace-nowrap')}>{s.first_name} {s.last_name}</td>
                    <td className={cn(tdCls, 'text-gray-500 whitespace-nowrap')}>{formatPhone(s.phone)}</td>
                    <td className={cn(tdCls, 'text-gray-500 whitespace-nowrap')}>{s.second_phone ? formatPhone(s.second_phone) : '—'}</td>
                    <td className={cn(tdCls, 'text-gray-600 font-medium')}>{s.group_name}</td>
                    <td className={cn(tdCls, 'text-gray-600')}>{s.course_name}</td>
                    <td className={cn(tdCls, 'text-gray-500 text-xs whitespace-nowrap')}>{s.birth_date}</td>
                    <td className={tdCls}>
                      <span className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap',
                        s.archive_reason === 'graduated'
                          ? 'bg-green-100 text-green-700'
                          : s.archive_reason === 'ignored'
                          ? 'bg-gray-100 text-gray-600'
                          : 'bg-red-100 text-red-700'
                      )}>
                        {s.reason_display}
                      </span>
                    </td>
                    <td className={cn(tdCls, 'text-gray-500 text-xs whitespace-nowrap')}>{s.archived_at}</td>
                    <td className={tdCls}>
                      <RestoreButton id={s.id} source={s.source} name={`${s.first_name} ${s.last_name}`} />
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        )}

        {/* === TEACHERS === */}
        {tab === 'teachers' && (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {[t('tableHeaders.num'), t('tableHeaders.name'), t('tableHeaders.phone'), t('tableHeaders.subject'), t('tableHeaders.salaryType'), t('tableHeaders.birthDate'), t('tableHeaders.hiredAt'), t('tableHeaders.archiveDate'), t('tableHeaders.actions')].map((h, i) => (
                  <th key={i} className={thCls}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? <SkeletonRows cols={9} /> : teachers.length === 0
                ? <tr><td colSpan={9} className="px-4 py-16 text-center text-gray-400">{t('noTeachers')}</td></tr>
                : teachers.map((teacher, i) => (
                  <tr key={teacher.id} className={rowCls}>
                    <td className={cn(tdCls, 'text-gray-400 text-xs')}>{(page - 1) * pageSize + i + 1}</td>
                    <td className={cn(tdCls, 'font-medium text-gray-900 whitespace-nowrap')}>{teacher.first_name} {teacher.last_name}</td>
                    <td className={cn(tdCls, 'text-gray-500 whitespace-nowrap')}>{formatPhone(teacher.phone)}</td>
                    <td className={cn(tdCls, 'text-gray-600')}>{teacher.subject || '—'}</td>
                    <td className={tdCls}>
                      {teacher.salary_type ? (
                        <Popover>
                          <PopoverTrigger className={cn('inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium border rounded cursor-pointer hover:scale-105 transition-transform', SALARY_STYLES[teacher.salary_type])}>
                            {teacher.salary_type === 'fixed'       && <Banknote className="w-3 h-3" />}
                            {teacher.salary_type === 'percent'     && <Percent   className="w-3 h-3" />}
                            {teacher.salary_type === 'per_student' && <Users     className="w-3 h-3" />}
                            {SALARY_LABELS[teacher.salary_type] || teacher.salary_type}
                          </PopoverTrigger>
                          <PopoverContent className="w-56 p-3 bg-blue-600 text-white shadow-xl" side="right" align="start">
                            <p className="text-xs font-semibold text-white/70 uppercase tracking-wide mb-2">{t('salaryDetail')}</p>
                            <div className="text-center">
                              <span className="text-xl font-bold text-white">
                                {teacher.salary_type === 'fixed'       && formatCurrency(teacher.fixed_amount ?? 0)}
                                {teacher.salary_type === 'percent'     && `${teacher.salary_percent ?? 0}%`}
                                {teacher.salary_type === 'per_student' && formatCurrency(teacher.per_student_amt ?? 0)}
                              </span>
                            </div>
                          </PopoverContent>
                        </Popover>
                      ) : '—'}
                    </td>
                    <td className={cn(tdCls, 'text-gray-500 text-xs whitespace-nowrap')}>{teacher.birth_date ? formatDMY(teacher.birth_date) : '—'}</td>
                    <td className={cn(tdCls, 'text-gray-500 text-xs whitespace-nowrap')}>{teacher.hired_at ? formatDMY(teacher.hired_at) : '—'}</td>
                    <td className={cn(tdCls, 'text-gray-500 text-xs whitespace-nowrap')}>{teacher.archived_at ? formatDMY(teacher.archived_at) : '—'}</td>
                    <td className={tdCls}>
                      <RestoreButton id={teacher.id} source="teacher" name={`${teacher.first_name} ${teacher.last_name}`} />
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        )}

        {/* === GROUPS === */}
        {tab === 'groups' && (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {[t('tableHeaders.num'), t('tableHeaders.group'), t('tableHeaders.course'), t('tableHeaders.teachers'), t('tableHeaders.days'), t('tableHeaders.hours'), t('tableHeaders.room'), t('tableHeaders.archiveDate'), t('tableHeaders.actions')].map((h, i) => (
                  <th key={i} className={thCls}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? <SkeletonRows cols={9} /> : groups.length === 0
                ? <tr><td colSpan={9} className="px-4 py-16 text-center text-gray-400">{t('noGroups')}</td></tr>
                : groups.map((g, i) => (
                  <tr key={g.id} className={rowCls}>
                    <td className={cn(tdCls, 'text-gray-400 text-xs')}>{(page - 1) * pageSize + i + 1}</td>
                    <td className={cn(tdCls, 'font-bold text-gray-900')}>{g.name}</td>
                    <td className={cn(tdCls, 'text-gray-600')}>{g.course?.name || '—'}</td>
                    <td className={cn(tdCls, 'text-gray-600 whitespace-nowrap')}>
                      {g.teacher ? `${g.teacher.first_name} ${g.teacher.last_name}` : '—'}
                    </td>
                    <td className={cn(tdCls, 'text-gray-600 text-xs')}>{parseDays(g.schedule)}</td>
                    <td className={cn(tdCls, 'text-gray-600 text-xs whitespace-nowrap')}>
                      {g.start_time && g.end_time ? `${g.start_time}–${g.end_time}` : '—'}
                    </td>
                    <td className={cn(tdCls, 'text-gray-600')}>{g.room || '—'}</td>
                    <td className={cn(tdCls, 'text-gray-500 text-xs whitespace-nowrap')}>{g.archived_at ? formatDMY(g.archived_at) : '—'}</td>
                    <td className={tdCls}>
                      <RestoreButton id={g.id} source="group" name={g.name} />
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        )}

        {/* === COURSES === */}
        {tab === 'courses' && (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {[t('tableHeaders.num'), t('tableHeaders.courseName'), t('tableHeaders.price'), t('tableHeaders.duration'), t('tableHeaders.teachers'), t('tableHeaders.archiveDate'), t('tableHeaders.actions')].map((h, i) => (
                  <th key={i} className={thCls}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? <SkeletonRows cols={7} /> : courses.length === 0
                ? <tr><td colSpan={7} className="px-4 py-16 text-center text-gray-400">{t('noCourses')}</td></tr>
                : courses.map((c, i) => (
                  <tr key={c.id} className={rowCls}>
                    <td className={cn(tdCls, 'text-gray-400 text-xs')}>{(page - 1) * pageSize + i + 1}</td>
                    <td className={cn(tdCls, 'font-medium text-gray-900')}>{c.name}</td>
                    <td className={cn(tdCls, 'text-gray-700 whitespace-nowrap')}>
                      {c.price ? formatCurrency(c.price) : '—'}
                    </td>
                    <td className={cn(tdCls, 'text-gray-600 text-xs whitespace-nowrap')}>
                      {[
                        c.duration_months ? `${c.duration_months} ${tc2('months')}` : null,
                        c.duration_hours ? `${c.duration_hours} ${tc2('hours')}` : null,
                      ].filter(Boolean).join(' / ') || '—'}
                    </td>
                    <td className={cn(tdCls, 'text-gray-600 text-xs')}>
                      {c.teacher_names?.length ? c.teacher_names.join(', ') : '—'}
                    </td>
                    <td className={cn(tdCls, 'text-gray-500 text-xs whitespace-nowrap')}>
                      {c.closed_at ? formatDMY(c.closed_at) : '—'}
                    </td>
                    <td className={tdCls}>
                      <RestoreButton id={c.id} source="course" name={c.name} />
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        )}
      </div>

      <Pagination
        page={page}
        pageSize={pageSize}
        count={totalCount}
        onPageChange={setPage}
        onPageSizeChange={(ps) => { setPageSize(ps); setPage(1); }}
      />
    </div>
  );
}
