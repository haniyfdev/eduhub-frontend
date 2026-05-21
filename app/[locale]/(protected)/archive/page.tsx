'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Search, ArrowUpFromLine, Banknote, Percent, Users } from 'lucide-react';
import { Pagination } from '@/components/pagination';
import toast, { Toaster } from 'react-hot-toast';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import api from '@/lib/axios';
import { cn, formatPhone, formatDMY } from '@/lib/utils';
import { PaginatedResponse } from '@/types';

type Tab = 'students' | 'teachers' | 'groups' | 'courses';

const TABS: { key: Tab; label: string }[] = [
  { key: 'students', label: "O'quvchilar" },
  { key: 'teachers', label: "O'qituvchilar" },
  { key: 'groups', label: 'Guruhlar' },
  { key: 'courses', label: 'Kurslar' },
];

// --- Student archive (merged students + ignored leads) ---
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

// --- Teacher (from /api/v1/teachers/?status=archived) ---
interface ArchivedTeacher {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  subject?: string;
  salary_type?: string;
  birth_date?: string | null;
  hired_at?: string | null;
  archived_at?: string | null;
}

// --- Group (from /api/v1/groups/?status=archived) ---
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

// --- Course (from /api/v1/courses/?status=archived) ---
interface ArchivedCourse {
  id: string;
  name: string;
  price?: number;
  duration_months?: number;
  duration_hours?: number;
  teacher_names?: string[];
  closed_at?: string | null;
}

const REASON_OPTIONS = [
  { value: '', label: 'Barchasi' },
  { value: 'graduated', label: 'Bitirdi' },
  { value: 'dropped_out', label: 'Tark etdi' },
  { value: 'ignored', label: 'Rad etdi' },
];

const SALARY_TYPE_ICON: Record<string, React.ReactNode> = {
  fixed:       <Banknote className="w-3.5 h-3.5 text-blue-600" />,
  percent:     <Percent className="w-3.5 h-3.5 text-purple-600" />,
  per_student: <Users className="w-3.5 h-3.5 text-green-600" />,
};
const SALARY_TYPE_LABEL: Record<string, string> = {
  fixed: 'Sobit',
  percent: 'Foiz',
  per_student: "O'quvchi",
};

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
  const [tab, setTab] = useState<Tab>('students');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [reasonFilter, setReasonFilter] = useState('');
  const [pageSize] = useState(50);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [archiveStudents, setArchiveStudents] = useState<ArchiveStudent[]>([]);
  const [teachers, setTeachers] = useState<ArchivedTeacher[]>([]);
  const [teacherCount, setTeacherCount] = useState(0);
  const [teacherPage, setTeacherPage] = useState(1);
  const [groups, setGroups] = useState<ArchivedGroup[]>([]);
  const [groupCount, setGroupCount] = useState(0);
  const [groupPage, setGroupPage] = useState(1);
  const [courses, setCourses] = useState<ArchivedCourse[]>([]);
  const [courseCount, setCourseCount] = useState(0);
  const [coursePage, setCoursePage] = useState(1);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  // Reset page when search/tab/filter changes
  useEffect(() => {
    setTeacherPage(1); setGroupPage(1); setCoursePage(1);
  }, [tab, debouncedSearch]);

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (debouncedSearch) params.search = debouncedSearch;
      if (reasonFilter) params.reason = reasonFilter;
      const { data } = await api.get<ArchiveStudent[]>('/api/v1/archive/students/', { params });
      setArchiveStudents(data ?? []);
    } catch {
      toast.error("Ma'lumotlarni yuklashda xatolik");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, reasonFilter]);

  const fetchTeachers = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { status: 'archived', page: teacherPage, page_size: pageSize };
      if (debouncedSearch) params.search = debouncedSearch;
      const { data } = await api.get<PaginatedResponse<ArchivedTeacher>>('/api/v1/teachers/', { params });
      setTeachers(data.results ?? []);
      setTeacherCount(data.count ?? 0);
    } catch {
      toast.error("Ma'lumotlarni yuklashda xatolik");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, teacherPage, pageSize]);

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { status: 'archived', page: groupPage, page_size: pageSize };
      if (debouncedSearch) params.search = debouncedSearch;
      const { data } = await api.get<PaginatedResponse<ArchivedGroup>>('/api/v1/groups/', { params });
      setGroups(data.results ?? []);
      setGroupCount(data.count ?? 0);
    } catch {
      toast.error("Ma'lumotlarni yuklashda xatolik");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, groupPage, pageSize]);

  const fetchCourses = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { status: 'archived', page: coursePage, page_size: pageSize };
      if (debouncedSearch) params.search = debouncedSearch;
      const { data } = await api.get<PaginatedResponse<ArchivedCourse>>('/api/v1/courses/', { params });
      setCourses(data.results ?? []);
      setCourseCount(data.count ?? 0);
    } catch {
      toast.error("Ma'lumotlarni yuklashda xatolik");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, coursePage, pageSize]);

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
      toast.success('Muvaffaqiyatli tiklandi');
      if (tab === 'students') fetchStudents();
      else if (tab === 'teachers') fetchTeachers();
      else if (tab === 'groups') fetchGroups();
      else if (tab === 'courses') fetchCourses();
    } catch {
      toast.error('Xatolik yuz berdi');
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
        title="Tiklash"
      >
        <ArrowUpFromLine className="w-4 h-4" />
      </button>
    );
  }

  function getDialogTitle() {
    if (!confirm) return '';
    const { source, name } = confirm;
    if (source === 'student') return `${name}ni arxivdan tiklash`;
    if (source === 'lead') return `${name}ni ro'yxatga qaytarish`;
    if (source === 'teacher') return `${name}ni faollashtirish`;
    if (source === 'group') return `${name} guruhini faollashtirish`;
    if (source === 'course') return `${name} kursini faollashtirish`;
    return 'Tiklashni tasdiqlang';
  }

  function getDialogBody() {
    if (!confirm) return '';
    const { source } = confirm;
    if (source === 'student') return "Bu o'quvchi arxivdan faol holatga qaytariladi.";
    if (source === 'lead') return "Bu lead yana kutilmoqda statusiga qaytariladi.";
    if (source === 'teacher') return "O'qituvchi faol holatga qaytariladi.";
    if (source === 'group') return "Guruh faol holatga qaytadi. O'quvchilarga ta'sir qilmaydi.";
    if (source === 'course') return "Kurs faol holatga qaytariladi.";
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
            <Button variant="outline" onClick={() => setConfirm(null)}>Bekor qilish</Button>
            <Button onClick={handleRestore} className="bg-green-600 hover:bg-green-700 text-white">Tiklash</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <h1 className="text-xl font-bold text-gray-900">Arxiv</h1>

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
            placeholder="Qidirish..."
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

        {/* === O'QUVCHILAR === */}
        {tab === 'students' && (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {['№', 'Ism', 'Telefon', 'Ota-ona tel', 'Guruh', 'Kurs', "Tug'ilgan", 'Holat', 'Arxiv.Sana', 'Amal'].map((h, i) => (
                  <th key={i} className={thCls}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? <SkeletonRows cols={10} /> : archiveStudents.length === 0
                ? <tr><td colSpan={10} className="px-4 py-16 text-center text-gray-400">Arxivlangan o&apos;quvchilar topilmadi</td></tr>
                : archiveStudents.map((s, i) => (
                  <tr key={`${s.source}-${s.id}`} className={rowCls}>
                    <td className={cn(tdCls, 'text-gray-400 text-xs')}>{i + 1}</td>
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
                      <RestoreButton
                        id={s.id}
                        source={s.source}
                        name={`${s.first_name} ${s.last_name}`}
                      />
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        )}

        {/* === O'QITUVCHILAR === */}
        {tab === 'teachers' && (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {['№', 'Ism', 'Telefon', 'Fan', 'Maosh turi', "Tug'ilgan", 'Ish boshlagan', 'Arxiv.Sana', 'Amal'].map((h, i) => (
                  <th key={i} className={thCls}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? <SkeletonRows cols={9} /> : teachers.length === 0
                ? <tr><td colSpan={9} className="px-4 py-16 text-center text-gray-400">Arxivlangan o&apos;qituvchilar topilmadi</td></tr>
                : teachers.map((t, i) => (
                  <tr key={t.id} className={rowCls}>
                    <td className={cn(tdCls, 'text-gray-400 text-xs')}>{(teacherPage - 1) * pageSize + i + 1}</td>
                    <td className={cn(tdCls, 'font-medium text-gray-900 whitespace-nowrap')}>{t.first_name} {t.last_name}</td>
                    <td className={cn(tdCls, 'text-gray-500 whitespace-nowrap')}>{formatPhone(t.phone)}</td>
                    <td className={cn(tdCls, 'text-gray-600')}>{t.subject || '—'}</td>
                    <td className={tdCls}>
                      {t.salary_type ? (
                        <span className="inline-flex items-center gap-1 text-xs whitespace-nowrap">
                          {SALARY_TYPE_ICON[t.salary_type]}
                          {SALARY_TYPE_LABEL[t.salary_type] || t.salary_type}
                        </span>
                      ) : '—'}
                    </td>
                    <td className={cn(tdCls, 'text-gray-500 text-xs whitespace-nowrap')}>{t.birth_date ? formatDMY(t.birth_date) : '—'}</td>
                    <td className={cn(tdCls, 'text-gray-500 text-xs whitespace-nowrap')}>{t.hired_at ? formatDMY(t.hired_at) : '—'}</td>
                    <td className={cn(tdCls, 'text-gray-500 text-xs whitespace-nowrap')}>{t.archived_at ? formatDMY(t.archived_at) : '—'}</td>
                    <td className={tdCls}>
                      <RestoreButton id={t.id} source="teacher" name={`${t.first_name} ${t.last_name}`} />
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        )}

        {/* === GURUHLAR === */}
        {tab === 'groups' && (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {['№', 'Guruh', 'Kurs', "O'qituvchi", 'Kunlar', 'Soatlar', 'Xona', 'Arxiv.Sana', 'Amal'].map((h, i) => (
                  <th key={i} className={thCls}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? <SkeletonRows cols={9} /> : groups.length === 0
                ? <tr><td colSpan={9} className="px-4 py-16 text-center text-gray-400">Arxivlangan guruhlar topilmadi</td></tr>
                : groups.map((g, i) => (
                  <tr key={g.id} className={rowCls}>
                    <td className={cn(tdCls, 'text-gray-400 text-xs')}>{(groupPage - 1) * pageSize + i + 1}</td>
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

        {/* === KURSLAR === */}
        {tab === 'courses' && (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {['№', 'Kurs nomi', 'Narxi', 'Davomiyligi', "O'qituvchilar", 'Arxiv.Sana', 'Amal'].map((h, i) => (
                  <th key={i} className={thCls}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? <SkeletonRows cols={7} /> : courses.length === 0
                ? <tr><td colSpan={7} className="px-4 py-16 text-center text-gray-400">Arxivlangan kurslar topilmadi</td></tr>
                : courses.map((c, i) => (
                  <tr key={c.id} className={rowCls}>
                    <td className={cn(tdCls, 'text-gray-400 text-xs')}>{(coursePage - 1) * pageSize + i + 1}</td>
                    <td className={cn(tdCls, 'font-medium text-gray-900')}>{c.name}</td>
                    <td className={cn(tdCls, 'text-gray-700 whitespace-nowrap')}>
                      {c.price ? Number(c.price).toLocaleString() + " so'm" : '—'}
                    </td>
                    <td className={cn(tdCls, 'text-gray-600 text-xs whitespace-nowrap')}>
                      {[
                        c.duration_months ? `${c.duration_months} oy` : null,
                        c.duration_hours ? `${c.duration_hours} soat` : null,
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

      {/* Pagination — teachers/groups/courses only */}
      {!loading && tab === 'teachers' && teacherCount > pageSize && (
        <Pagination page={teacherPage} pageSize={pageSize} count={teacherCount}
          onPageChange={setTeacherPage} onPageSizeChange={() => {}} />
      )}
      {!loading && tab === 'groups' && groupCount > pageSize && (
        <Pagination page={groupPage} pageSize={pageSize} count={groupCount}
          onPageChange={setGroupPage} onPageSizeChange={() => {}} />
      )}
      {!loading && tab === 'courses' && courseCount > pageSize && (
        <Pagination page={coursePage} pageSize={pageSize} count={courseCount}
          onPageChange={setCoursePage} onPageSizeChange={() => {}} />
      )}
    </div>
  );
}
