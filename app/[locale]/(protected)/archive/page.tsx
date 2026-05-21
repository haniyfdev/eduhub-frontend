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
import { cn, formatPhone, formatDMY, formatCurrency } from '@/lib/utils';
import { PaginatedResponse } from '@/types';

type Tab = 'students' | 'teachers' | 'groups' | 'courses';

const TABS: { key: Tab; label: string }[] = [
  { key: 'students', label: "O'quvchilar" },
  { key: 'teachers', label: "O'qituvchilar" },
  { key: 'groups', label: 'Guruhlar' },
  { key: 'courses', label: 'Kurslar' },
];

interface CurrentGroup { group_name: string; course_name: string; }

interface ArchivedStudent {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  second_phone?: string | null;
  birth_date?: string | null;
  course_name?: string | null;
  current_group?: CurrentGroup | null;
  archive_reason?: string | null;
  status: string;
  archived_at?: string | null;
}

interface ArchivedTeacher {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  subject?: string;
  salary_type?: string;
  birth_date?: string | null;
  hired_at?: string | null;
  status: string;
  archived_at?: string | null;
}

interface ArchivedGroup {
  id: string;
  name: string;
  course?: { name: string } | null;
  teacher?: { first_name: string; last_name: string } | null;
  students_count?: number;
  schedule?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  room?: string | null;
  status: string;
  archived_at?: string | null;
}

interface ArchivedCourse {
  id: string;
  name: string;
  price?: number;
  duration_months?: number;
  duration_hours?: number;
  teacher_names?: string[];
  status: string;
  archived_at?: string | null;
}

function parseDays(schedule: string | null | undefined): string {
  if (!schedule) return '—';
  return schedule.split(' ')[0] || '—';
}

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

const ARCHIVE_REASON_LABEL: Record<string, string> = {
  graduated: 'Bitirdi',
  dropped_out: 'Tark etdi',
};

const thCls = 'text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide';
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

export default function ArchivePage() {
  const [tab, setTab] = useState<Tab>('students');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [students, setStudents] = useState<ArchivedStudent[]>([]);
  const [teachers, setTeachers] = useState<ArchivedTeacher[]>([]);
  const [groups, setGroups] = useState<ArchivedGroup[]>([]);
  const [courses, setCourses] = useState<ArchivedCourse[]>([]);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, page_size: pageSize, status: 'archived' };
      if (debouncedSearch) params.search = debouncedSearch;
      const { data } = await api.get<PaginatedResponse<unknown>>(`/api/v1/${tab}/`, { params });
      setCount(data.count ?? 0);
      if (tab === 'students') setStudents((data.results ?? []) as ArchivedStudent[]);
      if (tab === 'teachers') setTeachers((data.results ?? []) as ArchivedTeacher[]);
      if (tab === 'groups') setGroups((data.results ?? []) as ArchivedGroup[]);
      if (tab === 'courses') setCourses((data.results ?? []) as ArchivedCourse[]);
    } catch {
      toast.error("Ma'lumotlarni yuklashda xatolik");
    } finally {
      setLoading(false);
    }
  }, [tab, page, pageSize, debouncedSearch]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setPage(1); }, [tab, debouncedSearch]);

  async function handleRestore() {
    if (!confirmId) return;
    const id = confirmId;
    setConfirmId(null);
    setRestoring(id);
    try {
      await api.post(`/api/v1/${tab}/${id}/restore/`);
      toast.success('Muvaffaqiyatli tiklandi');
      fetchData();
    } catch {
      toast.error('Xatolik yuz berdi');
    } finally {
      setRestoring(null);
    }
  }

  function RestoreButton({ id }: { id: string }) {
    return (
      <button
        onClick={() => setConfirmId(id)}
        disabled={restoring === id}
        className="p-1.5 rounded-md text-green-600 hover:bg-green-50 disabled:opacity-40 transition-colors"
        title="Tiklash"
      >
        <ArrowUpFromLine className="w-4 h-4" />
      </button>
    );
  }

  return (
    <div className="space-y-5">
      <Toaster position="top-right" />

      <Dialog open={!!confirmId} onOpenChange={(open) => { if (!open) setConfirmId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tiklashni tasdiqlang</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">Bu yozuvni arxivdan tiklashni xohlaysizmi?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmId(null)}>Bekor qilish</Button>
            <Button onClick={handleRestore} className="bg-green-600 hover:bg-green-700 text-white">Tiklash</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <h1 className="text-xl font-bold text-gray-900">Arxiv</h1>

      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
              tab === key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Qidirish..."
          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="bg-white rounded border border-gray-200 shadow-sm overflow-x-auto">
        {tab === 'students' && (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {['#', 'Ism', 'Telefon', 'Ota-ona tel', 'Guruh', 'Kurs', "Tug'ilgan", 'Holat', 'Amal'].map((h, i) => (
                  <th key={i} className={thCls}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? <SkeletonRows cols={9} /> : students.length === 0
                ? <tr><td colSpan={9} className="px-4 py-16 text-center text-gray-400">Arxivlangan o&apos;quvchilar topilmadi</td></tr>
                : students.map((s, i) => (
                  <tr key={s.id} className={rowCls}>
                    <td className={cn(tdCls, 'text-gray-400 text-xs')}>{(page - 1) * pageSize + i + 1}</td>
                    <td className={cn(tdCls, 'font-medium text-gray-900 whitespace-nowrap')}>{s.first_name} {s.last_name}</td>
                    <td className={cn(tdCls, 'text-gray-500 whitespace-nowrap')}>{formatPhone(s.phone)}</td>
                    <td className={cn(tdCls, 'text-gray-500 whitespace-nowrap')}>{s.second_phone ? formatPhone(s.second_phone) : '—'}</td>
                    <td className={cn(tdCls, 'text-gray-600')}>{s.current_group?.group_name || '—'}</td>
                    <td className={cn(tdCls, 'text-gray-600')}>{s.course_name || s.current_group?.course_name || '—'}</td>
                    <td className={cn(tdCls, 'text-gray-500 text-xs whitespace-nowrap')}>{s.birth_date ? formatDMY(s.birth_date) : '—'}</td>
                    <td className={tdCls}>
                      {s.archive_reason ? (
                        <span className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap',
                          s.archive_reason === 'graduated' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        )}>
                          {ARCHIVE_REASON_LABEL[s.archive_reason] || s.archive_reason}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">Arxivlangan</span>
                      )}
                    </td>
                    <td className={tdCls}><RestoreButton id={s.id} /></td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        )}

        {tab === 'teachers' && (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {['#', 'Ism', 'Telefon', 'Fan', 'Maosh turi', "Tug'ilgan", 'Ish boshlagan', 'Holat', 'Amal'].map((h, i) => (
                  <th key={i} className={thCls}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? <SkeletonRows cols={9} /> : teachers.length === 0
                ? <tr><td colSpan={9} className="px-4 py-16 text-center text-gray-400">Arxivlangan o&apos;qituvchilar topilmadi</td></tr>
                : teachers.map((t, i) => (
                  <tr key={t.id} className={rowCls}>
                    <td className={cn(tdCls, 'text-gray-400 text-xs')}>{(page - 1) * pageSize + i + 1}</td>
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
                    <td className={tdCls}>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 whitespace-nowrap">Arxivlangan</span>
                    </td>
                    <td className={tdCls}><RestoreButton id={t.id} /></td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        )}

        {tab === 'groups' && (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {['#', 'Guruh', 'Kurs', "O'qituvchi", "O'quvchilar", 'Kunlar', 'Soatlar', 'Xona', 'Holat', 'Amal'].map((h, i) => (
                  <th key={i} className={thCls}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? <SkeletonRows cols={10} /> : groups.length === 0
                ? <tr><td colSpan={10} className="px-4 py-16 text-center text-gray-400">Arxivlangan guruhlar topilmadi</td></tr>
                : groups.map((g, i) => (
                  <tr key={g.id} className={rowCls}>
                    <td className={cn(tdCls, 'text-gray-400 text-xs')}>{(page - 1) * pageSize + i + 1}</td>
                    <td className={cn(tdCls, 'font-bold text-gray-900')}>{g.name}</td>
                    <td className={cn(tdCls, 'text-gray-600')}>{g.course?.name || '—'}</td>
                    <td className={cn(tdCls, 'text-gray-600 whitespace-nowrap')}>
                      {g.teacher ? `${g.teacher.first_name} ${g.teacher.last_name}` : '—'}
                    </td>
                    <td className={cn(tdCls, 'text-gray-700 text-center')}>{g.students_count ?? '—'}</td>
                    <td className={cn(tdCls, 'text-gray-600 text-xs')}>{parseDays(g.schedule)}</td>
                    <td className={cn(tdCls, 'text-gray-600 text-xs whitespace-nowrap')}>
                      {g.start_time && g.end_time ? `${g.start_time}–${g.end_time}` : '—'}
                    </td>
                    <td className={cn(tdCls, 'text-gray-600')}>{g.room || '—'}</td>
                    <td className={tdCls}>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 whitespace-nowrap">Arxivlangan</span>
                    </td>
                    <td className={tdCls}><RestoreButton id={g.id} /></td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        )}

        {tab === 'courses' && (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {['#', 'Kurs nomi', 'Narxi', 'Davomiyligi', "O'qituvchilar", 'Holat', 'Amal'].map((h, i) => (
                  <th key={i} className={thCls}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? <SkeletonRows cols={7} /> : courses.length === 0
                ? <tr><td colSpan={7} className="px-4 py-16 text-center text-gray-400">Arxivlangan kurslar topilmadi</td></tr>
                : courses.map((c, i) => (
                  <tr key={c.id} className={rowCls}>
                    <td className={cn(tdCls, 'text-gray-400 text-xs')}>{(page - 1) * pageSize + i + 1}</td>
                    <td className={cn(tdCls, 'font-medium text-gray-900')}>{c.name}</td>
                    <td className={cn(tdCls, 'text-gray-700 whitespace-nowrap')}>{c.price ? formatCurrency(c.price) : '—'}</td>
                    <td className={cn(tdCls, 'text-gray-600 text-xs whitespace-nowrap')}>
                      {[
                        c.duration_months ? `${c.duration_months} oy` : null,
                        c.duration_hours ? `${c.duration_hours} soat` : null,
                      ].filter(Boolean).join(' / ') || '—'}
                    </td>
                    <td className={cn(tdCls, 'text-gray-600 text-xs')}>{c.teacher_names?.length ? c.teacher_names.join(', ') : '—'}</td>
                    <td className={tdCls}>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 whitespace-nowrap">Arxivlangan</span>
                    </td>
                    <td className={tdCls}><RestoreButton id={c.id} /></td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        )}
      </div>

      {!loading && (
        <Pagination
          page={page}
          pageSize={pageSize}
          count={count}
          onPageChange={setPage}
          onPageSizeChange={(ps) => { setPageSize(ps); setPage(1); }}
        />
      )}
    </div>
  );
}
