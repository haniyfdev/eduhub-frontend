'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import {
  ArrowLeft, Plus, Search, BookOpen, ChevronRight, UserMinus, RefreshCw,
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import api from '@/lib/axios';
import { cn, formatPhone, formatDMY } from '@/lib/utils';
import { PaginatedResponse } from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface GroupDetail {
  id: string;
  name: string;
  number: number;
  gender_type: 'a' | 'b' | 'c';
  course: { id: string; name: string };
  teacher: { id: string; first_name: string; last_name: string };
  students_count: number;
  schedule: string;
  room: string;
  status: 'active' | 'archived';
  created_at: string;
  students?: Student[];
}

interface Student {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  second_phone?: string;
  birth_date?: string | null;
  status: string;
  joined_at?: string;
  created_at?: string;
}

interface Lesson {
  id: string;
  topic: string;
  date: string;
  attendance_count?: number;
}

interface GroupOption {
  id: string;
  name: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GENDER_LABELS: Record<string, string> = { a: 'Erkaklar', b: 'Ayollar', c: 'Aralash' };

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-green-50 text-green-700 border-green-200',
  trial: 'bg-orange-50 text-orange-700 border-orange-200',
  pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  archived: 'bg-gray-100 text-gray-600 border-gray-200',
};
const STATUS_LABEL: Record<string, string> = {
  active: 'Faol', trial: 'Sinov', pending: 'Kutmoqda', archived: 'Arxivlangan',
};

type TabKey = 'students' | 'lessons' | 'info';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GroupDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const locale = useLocale();

  // ✅ Role check — admin huquqlari
  const canEdit = true; // role === 'admin' yoki boshqa — kerakli hook bilan almashtiring

  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [loadingGroup, setLoadingGroup] = useState(true);
  const [tab, setTab] = useState<TabKey>('students');

  // Students
  const [students, setStudents] = useState<Student[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);

  // Add student modal — search + checkbox
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [courses, setCourses] = useState<{ id: string; name: string }[]>([]);
  const [searchResults, setSearchResults] = useState<Student[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [addingBulk, setAddingBulk] = useState(false);

  // Actions
  const [removeTarget, setRemoveTarget] = useState<{ studentId: string; name: string } | null>(null);
  const [changeGroupTarget, setChangeGroupTarget] = useState<{ studentId: string; name: string } | null>(null);
  const [groupOptions, setGroupOptions] = useState<GroupOption[]>([]);
  const [newGroupId, setNewGroupId] = useState('');
  const [changingGroup, setChangingGroup] = useState(false);

  // Lessons
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loadingLessons, setLoadingLessons] = useState(false);
  const [showAddLesson, setShowAddLesson] = useState(false);
  const [lessonForm, setLessonForm] = useState({ topic: '', date: new Date().toISOString().slice(0, 10) });
  const [savingLesson, setSavingLesson] = useState(false);

  // Archive
  const [showArchive, setShowArchive] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);

  // ── Fetchers ───────────────────────────────────────────────────────────────

  // ✅ FIX: /api/v1/groups/{id}/ — data.students ichida keladi
  const fetchGroup = useCallback(async () => {
    setLoadingGroup(true);
    setLoadingStudents(true);
    try {
      const { data } = await api.get<GroupDetail>(`/api/v1/groups/${id}/`);
      setGroup(data);
      setStudents(data.students ?? []);
    } catch {
      toast.error("Guruh ma'lumotlari yuklanmadi");
    } finally {
      setLoadingGroup(false);
      setLoadingStudents(false);
    }
  }, [id]);

  const fetchLessons = useCallback(async () => {
    setLoadingLessons(true);
    try {
      const { data } = await api.get<PaginatedResponse<Lesson>>('/api/v1/lessons/', {
        params: { group_id: id, ordering: '-date', page_size: 200 },
      });
      setLessons(Array.isArray(data) ? data : (data.results ?? []));
    } catch {
      toast.error('Darslar yuklanmadi');
    } finally {
      setLoadingLessons(false);
    }
  }, [id]);

  useEffect(() => { fetchGroup(); }, [fetchGroup]);
  useEffect(() => { fetchLessons(); }, [fetchLessons]);

  useEffect(() => {
    api.get<PaginatedResponse<{ id: string; name: string }>>('/api/v1/courses/?page_size=100')
      .then(({ data }) => setCourses(data.results ?? []))
      .catch(() => {});
  }, []);

  // ── Student search with debounce ───────────────────────────────────────────

  useEffect(() => {
    if (!showAddStudent) return;
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const params: Record<string, string | number> = { page_size: 50 };
        if (studentSearch.trim()) params.search = studentSearch.trim();
        if (statusFilter) params.status = statusFilter;
        if (courseFilter) params.course = courseFilter;
        const { data } = await api.get<PaginatedResponse<Student>>('/api/v1/students/', { params });
        const currentIds = new Set(students.map((s) => s.id));
        setSearchResults((data.results ?? []).filter((s) => !currentIds.has(s.id)));
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [studentSearch, statusFilter, courseFilter, showAddStudent, students]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
          next.delete(id);
      } else {
          next.add(id);
      }
      return next;
    });
  }

  async function handleAddBulk() {
    if (selectedIds.size === 0) return;
    setAddingBulk(true);
    let success = 0;
    for (const studentId of Array.from(selectedIds)) {
      try {
        await api.post(`/api/v1/groups/${id}/add-student/`, { student_id: studentId });
        success++;
      } catch { /* skip duplicates */ }
    }
    toast.success(`${success} ta o'quvchi qo'shildi`);
    setShowAddStudent(false);
    setSelectedIds(new Set());
    setStudentSearch('');
    fetchGroup();
    setAddingBulk(false);
  }

  async function handleRemoveStudent() {
    if (!removeTarget) return;
    try {
      await api.post(`/api/v1/groups/${id}/remove-student/`, { student_id: removeTarget.studentId });
      toast.success("O'quvchi guruhdan chiqarildi");
      setRemoveTarget(null);
      fetchGroup();
    } catch {
      toast.error('Xatolik yuz berdi');
    }
  }

  async function openChangeGroup(studentId: string, name: string) {
    setChangeGroupTarget({ studentId, name });
    setNewGroupId('');
    try {
      const { data } = await api.get<PaginatedResponse<GroupOption>>('/api/v1/groups/', {
        params: { status: 'active', page_size: 100 },
      });
      setGroupOptions((data.results ?? []).filter((g) => g.id !== id));
    } catch {
      setGroupOptions([]);
    }
  }

  async function handleChangeGroup() {
    if (!changeGroupTarget || !newGroupId) return;
    setChangingGroup(true);
    try {
      await api.post(`/api/v1/groups/${id}/remove-student/`, { student_id: changeGroupTarget.studentId });
      await api.post(`/api/v1/groups/${newGroupId}/add-student/`, { student_id: changeGroupTarget.studentId });
      toast.success("Guruh o'zgartirildi");
      setChangeGroupTarget(null);
      fetchGroup();
    } catch {
      toast.error('Xatolik yuz berdi');
    } finally {
      setChangingGroup(false);
    }
  }

  async function handleAddLesson(e: React.FormEvent) {
    e.preventDefault();
    setSavingLesson(true);
    try {
      await api.post('/api/v1/lessons/', {
        group: id,
        topic: lessonForm.topic || 'Dars',
        date: lessonForm.date,
      });
      toast.success("Dars qo'shildi");
      setShowAddLesson(false);
      setLessonForm({ topic: '', date: new Date().toISOString().slice(0, 10) });
      fetchLessons();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'Xatolik yuz berdi');
    } finally {
      setSavingLesson(false);
    }
  }

  async function handleArchive() {
    setArchiving(true);
    try {
      await api.post(`/api/v1/groups/${id}/archive/`);
      toast.success('Guruh arxivlandi');
      setShowArchive(false);
      fetchGroup();
    } catch {
      toast.error('Xatolik yuz berdi');
    } finally {
      setArchiving(false);
    }
  }

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'students', label: "O'quvchilar" },
    { key: 'lessons', label: 'Darslar' },
    { key: 'info', label: "Ma'lumot" },
  ];

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loadingGroup) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p className="text-sm">Guruh topilmadi</p>
        <button onClick={() => router.push(`/${locale}/groups`)} className="mt-4 text-blue-600 underline text-sm">
          Guruhlar ro&apos;yxatiga qaytish
        </button>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      <Toaster position="top-right" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <button
            onClick={() => router.push(`/${locale}/groups`)}
            className="mt-1 p-1.5 rounded hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900">{group.name}</h1>
              <span className={cn(
                'inline-flex items-center px-2.5 py-0.5 text-xs font-medium border rounded-full',
                group.status === 'active' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-600 border-gray-200',
              )}>
                {group.status === 'active' ? 'Faol' : 'Arxivlangan'}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              {group.course?.name}
              {group.teacher && <> &middot; {group.teacher.first_name} {group.teacher.last_name}</>}
              {group.schedule && <> &middot; {group.schedule}</>}
              {group.room && <> &middot; {group.room}</>}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
          {canEdit && group.status === 'active' && (
            <button
              onClick={() => setShowAddStudent(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" /> Talaba qo&apos;shish
            </button>
          )}
          {lessons.length > 0 && (
            <button
              onClick={() => router.push(`/${locale}/lessons/${lessons[0].id}`)}
              className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700 transition-colors"
            >
              <BookOpen className="w-4 h-4" /> Davomat
            </button>
          )}
          {group.status === 'active' && canEdit && (
            <button
              onClick={() => setShowArchive(true)}
              className="flex items-center gap-1.5 px-3 py-2 border border-red-300 text-red-600 text-sm font-medium rounded hover:bg-red-50 transition-colors"
            >
              Arxivlash
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                'px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                tab === key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300',
              )}
            >
              {label}
              {key === 'students' && (
                <span className={cn('ml-2 inline-flex items-center justify-center px-1.5 py-0.5 text-xs rounded-full', tab === key ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600')}>
                  {students.length}
                </span>
              )}
              {key === 'lessons' && lessons.length > 0 && (
                <span className={cn('ml-2 inline-flex items-center justify-center px-1.5 py-0.5 text-xs rounded-full', tab === key ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600')}>
                  {lessons.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ══ TAB: O'quvchilar ══ */}
      {tab === 'students' && (
        <div className="bg-white rounded border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {['#', 'Ism', 'Telefon', 'Ota-ona tel', 'Status', "Qo'shilgan", 'Amallar'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loadingStudents
                ? Array(5).fill(0).map((_, i) => (
                  <tr key={i}>{Array(7).fill(0).map((_, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                  ))}</tr>
                ))
                : students.length === 0
                  ? <tr><td colSpan={7} className="px-4 py-14 text-center text-gray-400 text-sm">O&apos;quvchilar yo&apos;q</td></tr>
                  : students.map((s, idx) => (
                    <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{s.first_name} {s.last_name}</td>
                      {/* ✅ Telefon */}
                      <td className="px-4 py-3 text-gray-500 text-xs font-mono">{formatPhone(s.phone)}</td>
                      {/* ✅ Ota-ona telefoni */}
                      <td className="px-4 py-3 text-gray-400 text-xs font-mono">
                        {s.second_phone ? formatPhone(s.second_phone) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex items-center px-2 py-0.5 text-xs font-medium border rounded', STATUS_BADGE[s.status] ?? 'bg-gray-100 text-gray-600 border-gray-200')}>
                          {STATUS_LABEL[s.status] ?? s.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{formatDMY(s.joined_at ?? s.created_at)}</td>
                      <td className="px-4 py-3">
                        {canEdit && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => openChangeGroup(s.id, `${s.first_name} ${s.last_name}`)}
                              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                            >
                              <RefreshCw className="w-3 h-3" /> Guruh
                            </button>
                            <span className="text-gray-200">|</span>
                            <button
                              onClick={() => setRemoveTarget({ studentId: s.id, name: `${s.first_name} ${s.last_name}` })}
                              className="inline-flex items-center gap-1 text-xs text-red-500 hover:underline"
                            >
                              <UserMinus className="w-3 h-3" /> Chiqarish
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>
      )}

      {/* ══ TAB: Darslar ══ */}
      {tab === 'lessons' && (
        <div className="space-y-3">
          {canEdit && (
            <div className="flex justify-end">
              <button
                onClick={() => setShowAddLesson(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" /> Yangi dars
              </button>
            </div>
          )}
          <div className="bg-white rounded border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['#', 'Sana', 'Mavzu', 'Davomat', 'Amallar'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loadingLessons
                  ? Array(4).fill(0).map((_, i) => (
                    <tr key={i}>{Array(5).fill(0).map((_, j) => (
                      <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                    ))}</tr>
                  ))
                  : lessons.length === 0
                    ? <tr><td colSpan={5} className="px-4 py-14 text-center text-gray-400 text-sm">Darslar yo&apos;q</td></tr>
                    : lessons.map((lesson, idx) => (
                      <tr
                        key={lesson.id}
                        className="hover:bg-gray-50 cursor-pointer transition-colors"
                        onClick={() => router.push(`/${locale}/lessons/${lesson.id}`)}
                      >
                        <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                        <td className="px-4 py-3 text-gray-700">{formatDMY(lesson.date)}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{lesson.topic || '—'}</td>
                        <td className="px-4 py-3">
                          {lesson.attendance_count != null
                            ? <span className="inline-flex items-center gap-1 text-xs text-green-700"><span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />{lesson.attendance_count} ta</span>
                            : <span className="text-xs text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={(e) => { e.stopPropagation(); router.push(`/${locale}/lessons/${lesson.id}`); }}
                            className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1"
                          >
                            Davomat <ChevronRight className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══ TAB: Ma'lumot ══ */}
      {tab === 'info' && (
        <div className="bg-white rounded border border-gray-200 shadow-sm p-6 max-w-2xl">
          <dl className="divide-y divide-gray-100">
            {[
              { label: 'Kurs', value: group.course?.name },
              { label: "O'qituvchi", value: group.teacher ? `${group.teacher.first_name} ${group.teacher.last_name}` : null },
              { label: 'Guruh turi', value: GENDER_LABELS[group.gender_type] },
              { label: 'Dars jadvali', value: group.schedule },
              { label: 'Xona', value: group.room },
              { label: "O'quvchilar soni", value: String(students.length) },
              { label: 'Holat', value: group.status === 'active' ? 'Faol' : 'Arxivlangan' },
              { label: 'Yaratilgan sana', value: formatDMY(group.created_at) },
            ].map(({ label, value }) => (
              <div key={label} className="flex py-3">
                <dt className="w-44 text-sm text-gray-500 flex-shrink-0">{label}</dt>
                <dd className="text-sm font-medium text-gray-900">{value ?? '—'}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* ══════════════ DIALOGS ══════════════ */}

      <Dialog
        open={showAddStudent}
        onOpenChange={(open) => {
          if (!open) { setStudentSearch(''); setSearchResults([]); setSelectedIds(new Set()); setStatusFilter(''); setCourseFilter(''); }
          setShowAddStudent(open);
        }}
      >
        <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Talaba qo&apos;shish</DialogTitle>
          </DialogHeader>

          {/* Search + filters */}
          <div className="flex gap-2 mt-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                ref={searchRef}
                type="text"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Ism yoki telefon..."
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700"
            >
              <option value="">Barcha holat</option>
              <option value="pending">Kutilmoqda</option>
              <option value="active">Faol</option>
              <option value="trial">Sinov</option>
            </select>
            {/* ✅ Kurs filtri */}
            <select
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700"
            >
              <option value="">Barcha kurslar</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Selected count */}
          {selectedIds.size > 0 && (
            <div className="flex items-center justify-between px-3 py-2 bg-blue-50 rounded text-sm text-blue-700 font-medium">
              <span>{selectedIds.size} ta tanlandi</span>
              <button onClick={() => setSelectedIds(new Set())} className="text-xs text-blue-500 hover:underline">Bekor</button>
            </div>
          )}

          {/* Results list */}
          <div className="flex-1 overflow-y-auto border border-gray-200 rounded mt-1 min-h-[260px]">
            {/* ✅ Table header */}
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="w-10 px-4 py-2"></th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ism</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Telefon</th>
                  {/* ✅ Tug'ilgan sana */}
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Tug&apos;ilgan sana</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Holat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {searchLoading
                  ? <tr><td colSpan={5} className="py-8 text-center text-sm text-gray-400">Qidirmoqda...</td></tr>
                  : searchResults.length === 0
                    ? <tr><td colSpan={5} className="py-8 text-center text-sm text-gray-400">
                        {studentSearch || statusFilter || courseFilter ? 'Natija topilmadi' : "O'quvchi qidiring..."}
                      </td></tr>
                    : searchResults.map((s) => {
                      const checked = selectedIds.has(s.id);
                      return (
                        <tr
                          key={s.id}
                          onClick={() => toggleSelect(s.id)}
                          className={cn('cursor-pointer transition-colors select-none', checked ? 'bg-blue-50' : 'hover:bg-gray-50')}
                        >
                          <td className="px-4 py-3">
                            <div className={cn(
                              'w-4 h-4 rounded border-2 flex items-center justify-center transition-colors',
                              checked ? 'bg-blue-600 border-blue-600' : 'border-gray-300',
                            )}>
                              {checked && (
                                <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 8">
                                  <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </div>
                          </td>
                          {/* ✅ Tug'ilgan sana */}
                          <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">{formatDMY(s.birth_date) || '—'}</td>
                          <td className="px-4 py-3">
                            <span className={cn('text-xs px-1.5 py-0.5 rounded border', STATUS_BADGE[s.status] ?? 'bg-gray-100 text-gray-600 border-gray-200')}>
                              {STATUS_LABEL[s.status] ?? s.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                }
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="flex gap-3 pt-2 border-t border-gray-100">
            <button
              onClick={() => setShowAddStudent(false)}
              className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50"
            >
              Bekor qilish
            </button>
            <button
              onClick={handleAddBulk}
              disabled={selectedIds.size === 0 || addingBulk}
              className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {addingBulk ? "Qo'shilmoqda..." : `Qo'shish${selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}`}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Remove student */}
      <Dialog open={!!removeTarget} onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Guruhdan chiqarish</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600 mt-1">
            <span className="font-medium">{removeTarget?.name}</span>ni guruhdan chiqarishni istaysizmi?
          </p>
          <div className="flex gap-3 mt-4">
            <button onClick={() => setRemoveTarget(null)} className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50">Bekor</button>
            <button onClick={handleRemoveStudent} className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700">Ha, chiqarish</button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Change group */}
      <Dialog open={!!changeGroupTarget} onOpenChange={(open) => { if (!open) setChangeGroupTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Guruh o&apos;zgartirish</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600"><span className="font-medium">{changeGroupTarget?.name}</span> uchun yangi guruh:</p>
          <select
            value={newGroupId}
            onChange={(e) => setNewGroupId(e.target.value)}
            className="w-full mt-3 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Guruh tanlang</option>
            {groupOptions.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          {groupOptions.length === 0 && <p className="text-xs text-gray-400 mt-1">Boshqa faol guruhlar topilmadi</p>}
          <div className="flex gap-3 mt-4">
            <button onClick={() => setChangeGroupTarget(null)} className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50">Bekor</button>
            <button onClick={handleChangeGroup} disabled={!newGroupId || changingGroup} className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-60">
              {changingGroup ? "O'zgartirilmoqda..." : "O'zgartirish"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Archive */}
      <Dialog open={showArchive} onOpenChange={setShowArchive}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Guruhni arxivlash</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600 mt-1">
            <span className="font-medium">{group.name}</span> guruhini arxivlashni istaysizmi?
          </p>
          <div className="flex gap-3 mt-4">
            <button onClick={() => setShowArchive(false)} className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50">Bekor</button>
            <button onClick={handleArchive} disabled={archiving} className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700 disabled:opacity-60">
              {archiving ? 'Arxivlanmoqda...' : 'Ha, arxivlash'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add lesson */}
      <Dialog open={showAddLesson} onOpenChange={setShowAddLesson}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Yangi dars</DialogTitle></DialogHeader>
          <form onSubmit={handleAddLesson} className="space-y-4 mt-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mavzu</label>
              <input
                type="text"
                value={lessonForm.topic}
                onChange={(e) => setLessonForm((f) => ({ ...f, topic: e.target.value }))}
                placeholder="Dars mavzusi..."
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sana <span className="text-red-500">*</span></label>
              <input
                type="date"
                value={lessonForm.date}
                onChange={(e) => setLessonForm((f) => ({ ...f, date: e.target.value }))}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setShowAddLesson(false)} className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50">Bekor</button>
              <button type="submit" disabled={savingLesson} className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-60">
                {savingLesson ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}