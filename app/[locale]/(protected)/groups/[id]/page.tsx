'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import {
  ArrowLeft, Plus, Search, BookOpen, ChevronRight,
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import api from '@/lib/axios';
import { cn, formatDMY } from '@/lib/utils';
import { getUser } from '@/lib/auth';
import { PaginatedResponse } from '@/types';

// ─── Local types ──────────────────────────────────────────────────────────────

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
  start_date?: string;
  end_date?: string;
}

interface GroupStudentRaw {
  id: string;
  student?: { id: string; first_name: string; last_name: string; phone: string; status: string };
  student_id?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  status?: string;
  joined_at?: string;
  created_at?: string;
}

interface Lesson {
  id: string;
  topic: string;
  date: string;
  group?: string;
  attendance_count?: number;
}

interface StudentSearchResult {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  status: string;
}

interface GroupOption {
  id: string;
  name: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStudentData(gs: GroupStudentRaw) {
  if (gs.student) {
    return {
      id: gs.student.id,
      name: `${gs.student.first_name} ${gs.student.last_name}`.trim(),
      phone: gs.student.phone,
      status: gs.student.status,
    };
  }
  return {
    id: gs.student_id ?? gs.id,
    name: `${gs.first_name ?? ''} ${gs.last_name ?? ''}`.trim(),
    phone: gs.phone ?? '',
    status: gs.status ?? '',
  };
}

const GENDER_LABELS: Record<string, string> = { a: 'Erkaklar', b: 'Ayollar', c: 'Aralash' };

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-green-50 text-green-700 border-green-200',
  trial: 'bg-orange-50 text-orange-700 border-orange-200',
  pending: 'bg-gray-100 text-gray-600 border-gray-200',
  archived: 'bg-red-50 text-red-600 border-red-200',
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
  const user = getUser();

  const canTakeAttendance = ['teacher', 'admin', 'boss', 'manager', 'superadmin'].includes(user?.role ?? '');
  const canEdit = ['admin', 'boss', 'manager', 'superadmin'].includes(user?.role ?? '');

  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [loadingGroup, setLoadingGroup] = useState(true);
  const [tab, setTab] = useState<TabKey>('students');

  // Students tab
  const [students, setStudents] = useState<GroupStudentRaw[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [searchResults, setSearchResults] = useState<StudentSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [addingStudent, setAddingStudent] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<{ studentId: string; name: string } | null>(null);
  const [changeGroupTarget, setChangeGroupTarget] = useState<{ studentId: string; name: string } | null>(null);
  const [groupOptions, setGroupOptions] = useState<GroupOption[]>([]);
  const [newGroupId, setNewGroupId] = useState('');
  const [changingGroup, setChangingGroup] = useState(false);

  // Lessons tab
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loadingLessons, setLoadingLessons] = useState(false);
  const [showAddLesson, setShowAddLesson] = useState(false);
  const [lessonForm, setLessonForm] = useState({ topic: '', date: new Date().toISOString().slice(0, 10) });
  const [savingLesson, setSavingLesson] = useState(false);

  // Archive
  const [showArchive, setShowArchive] = useState(false);
  const [archiving, setArchiving] = useState(false);

  // ── Fetchers ───────────────────────────────────────────────────────────────

  const fetchGroup = useCallback(async () => {
    setLoadingGroup(true);
    try {
      const { data } = await api.get<GroupDetail>(`/api/v1/groups/${id}/`);
      setGroup(data);
    } catch {
      toast.error("Guruh ma'lumotlari yuklanmadi");
    } finally {
      setLoadingGroup(false);
    }
  }, [id]);

  const fetchStudents = useCallback(async () => {
    setLoadingStudents(true);
    try {
      const { data } = await api.get<PaginatedResponse<GroupStudentRaw>>(`/api/v1/group-students/`, {
        params: { group_id: id, page_size: 200 },
      });
      const list = Array.isArray(data) ? (data as GroupStudentRaw[]) : (data.results ?? []);
      setStudents(list);
    } catch {
      toast.error("O'quvchilar yuklanmadi");
    } finally {
      setLoadingStudents(false);
    }
  }, [id]);

  const fetchLessons = useCallback(async () => {
    setLoadingLessons(true);
    try {
      const { data } = await api.get<PaginatedResponse<Lesson>>(`/api/v1/lessons/`, {
        params: { group_id: id, ordering: '-date', page_size: 200 },
      });
      const list = Array.isArray(data) ? (data as Lesson[]) : (data.results ?? []);
      setLessons(list);
    } catch {
      toast.error('Darslar yuklanmadi');
    } finally {
      setLoadingLessons(false);
    }
  }, [id]);

  useEffect(() => { fetchGroup(); }, [fetchGroup]);
  useEffect(() => { fetchStudents(); }, [fetchStudents]);
  useEffect(() => { fetchLessons(); }, [fetchLessons]);

  // Student search debounce
  useEffect(() => {
    if (!studentSearch.trim()) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const { data } = await api.get<PaginatedResponse<StudentSearchResult>>(`/api/v1/students/`, {
          params: { search: studentSearch, page_size: 20 },
        });
        setSearchResults(data.results ?? []);
      } catch { setSearchResults([]); }
      finally { setSearchLoading(false); }
    }, 400);
    return () => clearTimeout(timer);
  }, [studentSearch]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  async function handleAddStudent(studentId: string, name: string) {
    setAddingStudent(studentId);
    try {
      await api.post(`/api/v1/groups/${id}/add-student/`, { student_id: studentId });
      toast.success(`${name} guruhga qo'shildi`);
      setShowAddStudent(false);
      setStudentSearch('');
      fetchStudents();
      fetchGroup();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'Xatolik yuz berdi');
    } finally {
      setAddingStudent(null);
    }
  }

  async function handleRemoveStudent() {
    if (!removeTarget) return;
    try {
      await api.post(`/api/v1/groups/${id}/remove-student/`, { student_id: removeTarget.studentId });
      toast.success("O'quvchi guruhdan chiqarildi");
      setRemoveTarget(null);
      fetchStudents();
      fetchGroup();
    } catch {
      toast.error('Xatolik yuz berdi');
    }
  }

  async function openChangeGroup(studentId: string, name: string) {
    setChangeGroupTarget({ studentId, name });
    setNewGroupId('');
    if (group) {
      try {
        const { data } = await api.get<PaginatedResponse<GroupOption>>(`/api/v1/groups/`, {
          params: { status: 'active', course_id: group.course?.id, page_size: 100 },
        });
        setGroupOptions((data.results ?? []).filter((g) => g.id !== id));
      } catch { setGroupOptions([]); }
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
      fetchStudents();
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
      await api.post(`/api/v1/lessons/`, {
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

  // ── Loading / not found ────────────────────────────────────────────────────

  if (loadingGroup) {
    return (
      <div className="space-y-4">
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
        <button
          onClick={() => router.push(`/${locale}/groups`)}
          className="mt-4 text-blue-600 underline text-sm"
        >
          Guruhlar ro&apos;yxatiga qaytish
        </button>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      <Toaster position="top-right" />

      {/* ── Page header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <button
            onClick={() => router.push(`/${locale}/groups`)}
            className="mt-1 p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors"
            aria-label="Orqaga"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900">{group.name}</h1>
              <span className={cn(
                'inline-flex items-center px-2.5 py-0.5 text-xs font-medium border rounded-full',
                group.status === 'active'
                  ? 'bg-green-50 text-green-700 border-green-200'
                  : 'bg-gray-100 text-gray-600 border-gray-200',
              )}>
                {group.status === 'active' ? 'Faol' : 'Arxivlangan'}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              {group.course?.name}
              {group.teacher && (
                <> &middot; {group.teacher.first_name} {group.teacher.last_name}</>
              )}
              {group.schedule && <> &middot; {group.schedule}</>}
              {group.room && <> &middot; {group.room}</>}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
          <button
            onClick={() => setShowAddStudent(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> Talaba qo&apos;shish
          </button>

          {canTakeAttendance && lessons.length > 0 && (
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

      {/* ── Tabs ── */}
      <div className="border-b border-gray-200">
        <div className="flex">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                'px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                tab === key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300',
              )}
            >
              {label}
              {key === 'students' && (
                <span className={cn(
                  'ml-2 inline-flex items-center justify-center px-1.5 py-0.5 text-xs rounded-full',
                  tab === key ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600',
                )}>
                  {group.students_count ?? students.length}
                </span>
              )}
              {key === 'lessons' && lessons.length > 0 && (
                <span className={cn(
                  'ml-2 inline-flex items-center justify-center px-1.5 py-0.5 text-xs rounded-full',
                  tab === key ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600',
                )}>
                  {lessons.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════
          TAB: O'quvchilar
      ══════════════════════════════════════════ */}
      {tab === 'students' && (
        <div className="bg-white rounded border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {['#', 'Ism', 'Telefon', 'Status', "Qo'shilgan sana", 'Amallar'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loadingStudents
                ? Array(5).fill(0).map((_, i) => (
                  <tr key={i}>
                    {Array(6).fill(0).map((_, j) => (
                      <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                    ))}
                  </tr>
                ))
                : students.length === 0
                  ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-14 text-center text-gray-400 text-sm">
                        O&apos;quvchilar yo&apos;q
                      </td>
                    </tr>
                  )
                  : students.map((gs, idx) => {
                    const s = getStudentData(gs);
                    return (
                      <tr key={gs.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{s.name || '—'}</td>
                        <td className="px-4 py-3 text-gray-500 font-mono text-xs">{s.phone || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            'inline-flex items-center px-2 py-0.5 text-xs font-medium border rounded',
                            STATUS_BADGE[s.status] ?? 'bg-gray-100 text-gray-600 border-gray-200',
                          )}>
                            {STATUS_LABEL[s.status] ?? s.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {formatDMY(gs.joined_at ?? gs.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => openChangeGroup(s.id, s.name)}
                              className="text-xs text-blue-600 hover:underline"
                            >
                              Guruh o&apos;zgartirish
                            </button>
                            <span className="text-gray-300">|</span>
                            <button
                              onClick={() => setRemoveTarget({ studentId: s.id, name: s.name })}
                              className="text-xs text-red-500 hover:underline"
                            >
                              Chiqarish
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
      )}

      {/* ══════════════════════════════════════════
          TAB: Darslar
      ══════════════════════════════════════════ */}
      {tab === 'lessons' && (
        <div className="space-y-3">
          {canTakeAttendance && (
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
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loadingLessons
                  ? Array(4).fill(0).map((_, i) => (
                    <tr key={i}>
                      {Array(5).fill(0).map((_, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))
                  : lessons.length === 0
                    ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-14 text-center text-gray-400 text-sm">
                          Darslar yo&apos;q
                        </td>
                      </tr>
                    )
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
                            ? (
                              <span className="inline-flex items-center gap-1 text-xs text-green-700">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                                {lesson.attendance_count} ta
                              </span>
                            )
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

      {/* ══════════════════════════════════════════
          TAB: Ma'lumot
      ══════════════════════════════════════════ */}
      {tab === 'info' && (
        <div className="bg-white rounded border border-gray-200 shadow-sm p-6 max-w-2xl">
          <dl className="divide-y divide-gray-100">
            {[
              { label: 'Kurs', value: group.course?.name },
              { label: "O'qituvchi", value: group.teacher ? `${group.teacher.first_name} ${group.teacher.last_name}` : null },
              { label: 'Guruh turi', value: GENDER_LABELS[group.gender_type] },
              { label: 'Dars jadvali', value: group.schedule },
              { label: 'Xona', value: group.room },
              { label: "O'quvchilar soni", value: String(group.students_count ?? 0) },
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

      {/* ══════════════════════════════════════════
          DIALOGS
      ══════════════════════════════════════════ */}

      {/* Archive */}
      <Dialog open={showArchive} onOpenChange={setShowArchive}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Guruhni arxivlash</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600 mt-1">
            <span className="font-medium">{group.name}</span> guruhini arxivlashni istaysizmi?
            Bu amal guruhni faollar ro&apos;yxatidan olib tashlaydi.
          </p>
          <div className="flex gap-3 mt-4">
            <button
              onClick={() => setShowArchive(false)}
              className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50"
            >
              Bekor qilish
            </button>
            <button
              onClick={handleArchive}
              disabled={archiving}
              className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700 disabled:opacity-60"
            >
              {archiving ? 'Arxivlanmoqda...' : 'Ha, arxivlash'}
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
            <button
              onClick={() => setRemoveTarget(null)}
              className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50"
            >
              Bekor qilish
            </button>
            <button
              onClick={handleRemoveStudent}
              className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700"
            >
              Ha, chiqarish
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Change group */}
      <Dialog open={!!changeGroupTarget} onOpenChange={(open) => { if (!open) setChangeGroupTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Guruh o&apos;zgartirish</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600">
            <span className="font-medium">{changeGroupTarget?.name}</span> uchun yangi guruh tanlang:
          </p>
          <select
            value={newGroupId}
            onChange={(e) => setNewGroupId(e.target.value)}
            className="w-full mt-3 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Guruh tanlang</option>
            {groupOptions.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
          {groupOptions.length === 0 && (
            <p className="text-xs text-gray-400 mt-1">Boshqa faol guruhlar topilmadi</p>
          )}
          <div className="flex gap-3 mt-4">
            <button
              onClick={() => setChangeGroupTarget(null)}
              className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50"
            >
              Bekor qilish
            </button>
            <button
              onClick={handleChangeGroup}
              disabled={!newGroupId || changingGroup}
              className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-60"
            >
              {changingGroup ? "O'zgartirilmoqda..." : "O'zgartirish"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add student */}
      <Dialog
        open={showAddStudent}
        onOpenChange={(open) => {
          if (!open) { setStudentSearch(''); setSearchResults([]); }
          setShowAddStudent(open);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Talaba qo&apos;shish</DialogTitle></DialogHeader>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              placeholder="Ism yoki telefon bo'yicha qidirish..."
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>

          <div className="mt-2 max-h-64 overflow-y-auto divide-y divide-gray-100">
            {searchLoading
              ? <p className="py-6 text-center text-sm text-gray-400">Qidirmoqda...</p>
              : searchResults.length === 0 && studentSearch.trim()
                ? <p className="py-6 text-center text-sm text-gray-400">Natija topilmadi</p>
                : searchResults.length === 0
                  ? <p className="py-6 text-center text-sm text-gray-400">Qidirish uchun yozing...</p>
                  : searchResults.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => handleAddStudent(s.id, `${s.first_name} ${s.last_name}`)}
                      disabled={addingStudent === s.id}
                      className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-blue-50 transition-colors text-left disabled:opacity-60"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900">{s.first_name} {s.last_name}</p>
                        <p className="text-xs text-gray-500">{s.phone}</p>
                      </div>
                      <span className={cn(
                        'text-xs px-1.5 py-0.5 rounded border',
                        STATUS_BADGE[s.status] ?? 'bg-gray-100 text-gray-600 border-gray-200',
                      )}>
                        {STATUS_LABEL[s.status] ?? s.status}
                      </span>
                    </button>
                  ))}
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
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sana <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={lessonForm.date}
                onChange={(e) => setLessonForm((f) => ({ ...f, date: e.target.value }))}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setShowAddLesson(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50"
              >
                Bekor qilish
              </button>
              <button
                type="submit"
                disabled={savingLesson}
                className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-60"
              >
                {savingLesson ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
