'use client';

import { useEffect, useState, useCallback } from 'react';
import { Search } from 'lucide-react';
import { Pagination } from '@/components/pagination';
import toast, { Toaster } from 'react-hot-toast';
import { Skeleton } from '@/components/ui/skeleton';
import api from '@/lib/axios';
import { cn, formatPhone } from '@/lib/utils';
import { PaginatedResponse } from '@/types';

type Tab = 'students' | 'teachers' | 'groups' | 'courses';

const TABS: { key: Tab; label: string }[] = [
  { key: 'students', label: "O'quvchilar" },
  { key: 'teachers', label: "O'qituvchilar" },
  { key: 'groups', label: 'Guruhlar' },
  { key: 'courses', label: 'Kurslar' },
];

interface ArchivedStudent { id: string; first_name: string; last_name: string; phone: string; course_name: string | null; archived_at: string | null; }
interface ArchivedTeacher { id: string; first_name: string; last_name: string; phone: string; subject: string; hired_at: string; archived_at: string | null; }
interface ArchivedGroup { id: string; name: string; course?: { name: string }; teacher?: { first_name: string; last_name: string }; archived_at: string | null; }
interface ArchivedCourse { id: string; name: string; price: number; archived_at: string | null; }


function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('uz-UZ');
}

export default function ArchivePage() {
  const [tab, setTab] = useState<Tab>('students');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);

  const [students, setStudents] = useState<ArchivedStudent[]>([]);
  const [teachers, setTeachers] = useState<ArchivedTeacher[]>([]);
  const [groups, setGroups] = useState<ArchivedGroup[]>([]);
  const [courses, setCourses] = useState<ArchivedCourse[]>([]);
  const [count, setCount] = useState(0);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, page_size: pageSize, status: 'archived' };
      if (search) params.search = search;
      const endpoints: Record<Tab, string> = {
        students: '/api/v1/students/',
        teachers: '/api/v1/teachers/',
        groups: '/api/v1/groups/',
        courses: '/api/v1/courses/',
      };
      const { data } = await api.get<PaginatedResponse<any>>(endpoints[tab], { params });
      setCount(data.count ?? 0);
      if (tab === 'students') setStudents(data.results ?? []);
      if (tab === 'teachers') setTeachers(data.results ?? []);
      if (tab === 'groups') setGroups(data.results ?? []);
      if (tab === 'courses') setCourses(data.results ?? []);
    } catch {
      toast.error('Ma\'lumotlarni yuklashda xatolik');
    } finally {
      setLoading(false);
    }
  }, [tab, page, pageSize, search]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setPage(1); }, [tab, search]);

  async function handleRestore(id: string) {
    setRestoring(id);
    const endpoints: Record<Tab, string> = {
      students: `/api/v1/students/${id}/`,
      teachers: `/api/v1/teachers/${id}/`,
      groups: `/api/v1/groups/${id}/`,
      courses: `/api/v1/courses/${id}/`,
    };
    try {
      await api.patch(endpoints[tab], { status: 'active', archived_at: null });
      toast.success('Muvaffaqiyatli tiklandi');
      fetchData();
    } catch {
      toast.error('Xatolik yuz berdi');
    } finally {
      setRestoring(null);
    }
  }

  return (
    <div className="space-y-5">
      <Toaster position="top-right" />
      <h1 className="text-xl font-bold text-gray-900">Arxiv</h1>

      {/* Tabs */}
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

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Qidirish..."
          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      {/* Table */}
      <div className="bg-white rounded border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {tab === 'students' && ["Ism", "Telefon", "Kurs", "Arxivlangan", ""].map((h, i) => (
                <th key={i} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
              {tab === 'teachers' && ["Ism", "Telefon", "Fan", "Arxivlangan", ""].map((h, i) => (
                <th key={i} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
              {tab === 'groups' && ["Guruh", "Kurs", "O'qituvchi", "Arxivlangan", ""].map((h, i) => (
                <th key={i} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
              {tab === 'courses' && ["Nomi", "Narxi", "Arxivlangan", ""].map((h, i) => (
                <th key={i} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading
              ? Array(5).fill(0).map((_, i) => (
                <tr key={i}>{Array(5).fill(0).map((_, j) => (
                  <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                ))}</tr>
              ))
              : (
                <>
                  {tab === 'students' && (
                    students.length === 0
                      ? <tr><td colSpan={5} className="px-4 py-16 text-center text-gray-400">Arxivlangan o&apos;quvchilar topilmadi</td></tr>
                      : students.map((s) => (
                        <tr key={s.id} className="bg-[#FFFBEB] hover:brightness-95 transition-colors">
                          <td className="px-4 py-3 font-medium text-gray-900">{s.first_name} {s.last_name}</td>
                          <td className="px-4 py-3 text-gray-500">{formatPhone(s.phone)}</td>
                          <td className="px-4 py-3 text-gray-600">{s.course_name || '—'}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(s.archived_at)}</td>
                          <td className="px-4 py-3">
                            <button onClick={() => handleRestore(s.id)} disabled={restoring === s.id}
                              className="text-xs text-blue-600 hover:underline disabled:opacity-50">
                              {restoring === s.id ? '...' : 'Qayta tiklash'}
                            </button>
                          </td>
                        </tr>
                      ))
                  )}
                  {tab === 'teachers' && (
                    teachers.length === 0
                      ? <tr><td colSpan={5} className="px-4 py-16 text-center text-gray-400">Arxivlangan o&apos;qituvchilar topilmadi</td></tr>
                      : teachers.map((t) => (
                        <tr key={t.id} className="bg-[#FFFBEB] hover:brightness-95 transition-colors">
                          <td className="px-4 py-3 font-medium text-gray-900">{t.first_name} {t.last_name}</td>
                          <td className="px-4 py-3 text-gray-500">{formatPhone(t.phone)}</td>
                          <td className="px-4 py-3 text-gray-600">{t.subject || '—'}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(t.archived_at)}</td>
                          <td className="px-4 py-3">
                            <button onClick={() => handleRestore(t.id)} disabled={restoring === t.id}
                              className="text-xs text-blue-600 hover:underline disabled:opacity-50">
                              {restoring === t.id ? '...' : 'Qayta tiklash'}
                            </button>
                          </td>
                        </tr>
                      ))
                  )}
                  {tab === 'groups' && (
                    groups.length === 0
                      ? <tr><td colSpan={5} className="px-4 py-16 text-center text-gray-400">Arxivlangan guruhlar topilmadi</td></tr>
                      : groups.map((g) => (
                        <tr key={g.id} className="bg-[#FFFBEB] hover:brightness-95 transition-colors">
                          <td className="px-4 py-3 font-bold text-gray-900">{g.name}</td>
                          <td className="px-4 py-3 text-gray-600">{g.course?.name || '—'}</td>
                          <td className="px-4 py-3 text-gray-600">{g.teacher ? `${g.teacher.first_name} ${g.teacher.last_name}` : '—'}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(g.archived_at)}</td>
                          <td className="px-4 py-3">
                            <button onClick={() => handleRestore(g.id)} disabled={restoring === g.id}
                              className="text-xs text-blue-600 hover:underline disabled:opacity-50">
                              {restoring === g.id ? '...' : 'Qayta tiklash'}
                            </button>
                          </td>
                        </tr>
                      ))
                  )}
                  {tab === 'courses' && (
                    courses.length === 0
                      ? <tr><td colSpan={4} className="px-4 py-16 text-center text-gray-400">Arxivlangan kurslar topilmadi</td></tr>
                      : courses.map((c) => (
                        <tr key={c.id} className="bg-[#FFFBEB] hover:brightness-95 transition-colors">
                          <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                          <td className="px-4 py-3 text-gray-700">{c.price?.toLocaleString()} so&apos;m</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(c.archived_at)}</td>
                          <td className="px-4 py-3">
                            <button onClick={() => handleRestore(c.id)} disabled={restoring === c.id}
                              className="text-xs text-blue-600 hover:underline disabled:opacity-50">
                              {restoring === c.id ? '...' : 'Qayta tiklash'}
                            </button>
                          </td>
                        </tr>
                      ))
                  )}
                </>
              )
            }
          </tbody>
        </table>
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
