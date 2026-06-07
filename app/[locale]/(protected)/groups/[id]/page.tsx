'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, Plus, Search, Minus, ArrowLeftRight, Snowflake, Play, Pencil } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import api from '@/lib/axios';
import { cn, formatPhone, formatDMY } from '@/lib/utils';
import { PaginatedResponse } from '@/types';
import { getUser } from '@/lib/auth';

interface GroupDetail {
  id: string;
  name: string;
  number: number;
  gender_type: 'a' | 'b' | 'c';
  course: { id: string; name: string };
  teacher: { id: string; first_name: string; last_name: string; status?: string } | null;
  students_count: number;
  schedule: string;
  room_name?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  status: 'active' | 'archived' | 'frozen';
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
  course_name?: string;
  status: string;
  gs_status?: string;
  joined_at?: string;
  created_at?: string;
  left_at?: string | null;
  current_group?: string | null;
}

interface Lesson {
  
  id: string;
  topic: string;
  date: string;
  status: 'pending' | 'ongoing' | 'finished';
  started_at: string | null;
  finished_at: string | null;
}

interface GroupOption {
  id: string;
  name: string;
}

interface TeacherOption {
  id: string;
  first_name: string;
  last_name: string;
}

const GENDER_LABELS_KEYS: Record<string, string> = { a: 'genderA', b: 'genderB', c: 'genderC' };

type TabKey = 'students' | 'lessons' | 'info';

function formatTime(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
}

export default function GroupDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('groups');
  const common = useTranslations('common');
  const user = getUser();
  const canEdit = ['boss', 'manager', 'admin'].includes(user?.role ?? '');
  const isTeacher = user?.role === 'teacher';

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') router.push(`/${locale}/groups`);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [router, locale]);

  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [loadingGroup, setLoadingGroup] = useState(true);
  const [tab, setTab] = useState<TabKey>('students');
  const [students, setStudents] = useState<Student[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);

  // Add student modal
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [courses, setCourses] = useState<{ id: string; name: string }[]>([]);
  const [searchResults, setSearchResults] = useState<Student[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [addingBulk, setAddingBulk] = useState(false);

  // Actions
  const [archiveTarget, setArchiveTarget] = useState<{ studentId: string; name: string; status: string } | null>(null);
  const [archiveReason, setArchiveReason] = useState<'graduated' | 'dropped_out' | ''>('');
  const [changeGroupTarget, setChangeGroupTarget] = useState<{ studentId: string; name: string } | null>(null);
  const [groupOptions, setGroupOptions] = useState<GroupOption[]>([]);
  const [newGroupId, setNewGroupId] = useState('');
  const [changingGroup, setChangingGroup] = useState(false);

  // Change teacher
  const [showChangeTeacher, setShowChangeTeacher] = useState(false);
  const [teacherOptions, setTeacherOptions] = useState<TeacherOption[]>([]);
  const [changeTeacherId, setChangeTeacherId] = useState('');
  const [changingTeacher, setChangingTeacher] = useState(false);
  const [loadingTeachers, setLoadingTeachers] = useState(false);

  // Lessons
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loadingLessons, setLoadingLessons] = useState(false);
  const [showAddLesson, setShowAddLesson] = useState(false);
  const [lessonForm, setLessonForm] = useState({ topic: '' });
  const [savingLesson, setSavingLesson] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);

  const fetchGroup = useCallback(async () => {
    setLoadingGroup(true);
    setLoadingStudents(true);
    try {
      const { data } = await api.get<GroupDetail>(`/api/v1/groups/${id}/`);
      setGroup(data);
      setStudents(data.students ?? []);
    } catch {
      toast.error(common('error'));
    } finally {
      setLoadingGroup(false);
      setLoadingStudents(false);
    }
  }, [id, common]);

  const fetchLessons = useCallback(async () => {
    setLoadingLessons(true);
    try {
      const { data } = await api.get<PaginatedResponse<Lesson>>('/api/v1/lessons/', {
        params: { group: id, ordering: '-date', page_size: 200 },
      });
      setLessons(Array.isArray(data) ? data : (data.results ?? []));
    } catch {
      toast.error(common('error'));
    } finally {
      setLoadingLessons(false);
    }
  }, [id, common]);

  useEffect(() => { fetchGroup(); }, [fetchGroup]);
  useEffect(() => { fetchLessons(); }, [fetchLessons]);

  useEffect(() => {
    api.get<PaginatedResponse<{ id: string; name: string }>>('/api/v1/courses/?page_size=100&status=active')
      .then(({ data }) => setCourses(data.results ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!changeGroupTarget) return;
    api.get<PaginatedResponse<GroupOption>>('/api/v1/groups/?status=active&page_size=100')
      .then(({ data }) => setGroupOptions((data.results ?? []).filter((g) => g.id !== id)))
      .catch(() => {});
  }, [changeGroupTarget, id]);

  // Student search
  useEffect(() => {
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const params: Record<string, string | number> = { page_size: 50, status: 'pending' };
        if (studentSearch.trim()) params.search = studentSearch.trim();
        if (courseFilter) params.course = courseFilter;
        const { data } = await api.get<PaginatedResponse<Student>>('/api/v1/leads/', { params });
        const currentIds = new Set(students.map((s) => s.id));
        setSearchResults((data.results ?? []).filter((s) => !currentIds.has(s.id)));
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [studentSearch, courseFilter, students]);

  function toggleSelect(sid: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(sid)) { next.delete(sid); } else { next.add(sid); }
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
      } catch { /* skip */ }
    }
    toast.success(t('addedBulkSuccess', { count: success }));
    setShowAddStudent(false);
    setSelectedIds(new Set());
    setStudentSearch('');
    fetchGroup();
    setAddingBulk(false);
  }

  async function handleArchiveStudent() {
    if (!archiveTarget || !archiveReason) return;
    try {
      await api.post(`/api/v1/groups/${id}/remove-student/`, {
        student_id: archiveTarget.studentId,
        reason: archiveReason,
      });
      toast.success(common('success'));
      setArchiveTarget(null);
      setArchiveReason('');
      fetchGroup();
    } catch {
      toast.error(common('error'));
    }
  }

  async function handleChangeGroup() {
    if (!changeGroupTarget || !newGroupId) return;
    setChangingGroup(true);
    try {
      await api.post(`/api/v1/groups/${id}/transfer-student/`, {
        student_id: changeGroupTarget.studentId,
        new_group_id: newGroupId,
      });
      toast.success(common('success'));
      setChangeGroupTarget(null);
      fetchGroup();
    } catch {
      toast.error(common('error'));
    } finally {
      setChangingGroup(false);
    }
  }

  async function fetchTeachers() {
    setLoadingTeachers(true);
    try {
      const { data } = await api.get<{ results?: TeacherOption[] }>('/api/v1/teachers/?status=active&page_size=100');
      setTeacherOptions(data.results ?? []);
    } catch {
      setTeacherOptions([]);
    } finally {
      setLoadingTeachers(false);
    }
  }

  async function handleChangeTeacher() {
    if (!changeTeacherId) return;
    setChangingTeacher(true);
    try {
      const { data } = await api.post<GroupDetail>(`/api/v1/groups/${id}/change-teacher/`, { teacher_id: changeTeacherId });
      setGroup(data);
      setShowChangeTeacher(false);
      setChangeTeacherId('');
      toast.success(t('teacherChanged'));
    } catch {
      toast.error(common('error'));
    } finally {
      setChangingTeacher(false);
    }
  }

  async function handleAddLesson(e: React.FormEvent) {
    e.preventDefault();
    setSavingLesson(true);
    try {
      await api.post('/api/v1/lessons/', {
        group: id,
        topic: lessonForm.topic || t('newLesson'),
        date: new Date().toISOString().slice(0, 10),
      });
      toast.success(common('success'));
      setShowAddLesson(false);
      setLessonForm({ topic: '' });
      fetchLessons();
    } catch (err: any) {
      const errorMsg = err?.response?.data?.date?.[0] ||
                       err?.response?.data?.detail ||
                       err?.response?.data?.error || '';
      if (errorMsg.includes('allaqachon') || err?.response?.status === 400) {
        toast.error(t('lessonAlreadyExists'));
      } else {
        toast.error(common('error'));
      }
    } finally {
      setSavingLesson(false);
    }
  }

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'students', label: t('tabs.students') },
    { key: 'lessons', label: t('tabs.lessons') },
    { key: 'info', label: t('tabs.info') },
  ];


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
        <p className="text-sm">{t('notFound')}</p>
        <button onClick={() => router.push(`/${locale}/groups`)} className="mt-4 text-blue-600 underline text-sm">
          {common('back')}
        </button>
      </div>
    );
  }

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
          <span className="text-xs text-gray-400 ml-1 hidden sm:inline">Esc</span>

          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900">{group.name}</h1>
              <span className={cn(
                'inline-flex items-center px-2.5 py-0.5 text-xs font-medium border rounded-full',
                group.status === 'active' ? 'bg-green-50 text-green-700 border-green-200'
                : group.status === 'frozen' ? 'bg-sky-100 text-sky-700 border-sky-300'
                : 'bg-gray-100 text-gray-600 border-gray-200',
              )}>
                {group.status === 'active' ? common('active') : group.status === 'frozen' ? common('frozen') : common('archived')}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-0.5 flex items-center flex-wrap gap-x-0.5">
              {group.course?.name}
              {group.teacher && (
                <>
                  &nbsp;&middot;&nbsp;{group.teacher.first_name} {group.teacher.last_name}
                  {canEdit && (group.status === 'active' || group.teacher?.status === 'archived') && (
                    <button
                      onClick={() => { setChangeTeacherId(group.teacher!.id); fetchTeachers(); setShowChangeTeacher(true); }}
                      className={cn(
                        'ml-1 p-0.5 rounded transition-colors',
                        group.teacher?.status === 'archived'
                          ? 'text-amber-500 hover:bg-amber-100 hover:text-amber-700'
                          : 'text-gray-400 hover:bg-gray-200 hover:text-gray-600',
                      )}
                      title={t('changeTeacher')}
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  )}
                </>
              )}
              {group.schedule && <>&nbsp;&middot;&nbsp;{group.schedule}</>}
              {group.room_name && <>&nbsp;&middot;&nbsp;{group.room_name}</>}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
          {canEdit && group.status === 'active' && (
            <button
              onClick={() => setShowAddStudent(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" /> {t('addStudent')}
            </button>
          )}
        </div>
    </div>

      {/* Archived teacher banner */}
      {group.teacher?.status === 'archived' && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-center gap-2 text-amber-700">
            <span className="text-sm font-medium">
              {t('archivedTeacherBanner', { name: `${group.teacher.first_name} ${group.teacher.last_name}` })}
            </span>
          </div>
          {canEdit && (
            <button
              onClick={() => { setChangeTeacherId(group.teacher!.id); fetchTeachers(); setShowChangeTeacher(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white text-xs font-medium rounded hover:bg-amber-700 transition-colors flex-shrink-0"
            >
              <Pencil className="w-3 h-3" /> {t('changeTeacher')}
            </button>
          )}
        </div>
      )}

      {/* Frozen banner */}
      {group.status === 'frozen' && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-sky-50 border border-sky-200 rounded-lg">
          <div className="flex items-center gap-2 text-sky-700">
            <Snowflake className="w-4 h-4 flex-shrink-0" />
            <span className="text-sm font-medium">{t('frozenBanner')}</span>
          </div>
          {['boss', 'manager'].includes(user?.role ?? '') && (
            <button
              onClick={async () => {
                try {
                  await api.post(`/api/v1/groups/${id}/unfreeze/`);
                  toast.success(common('success'));
                  fetchGroup();
                } catch {
                  toast.error(common('error'));
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 text-white text-xs font-medium rounded hover:bg-sky-700 transition-colors flex-shrink-0"
            >
              <Play className="w-3 h-3" /> {t('unfreeze')}
            </button>
          )}
        </div>
      )}

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
                  {students.filter(s => !s.left_at).length}
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
        <div className="space-y-3">
          {students.length > 0 && (
            <div className="flex flex-wrap items-center gap-4 px-4 py-2 bg-gray-50 border border-gray-200 rounded text-xs">
              {students.filter(s => !s.left_at && s.status === 'active').length > 0 && (
                <span className="text-gray-600"><span className="font-semibold text-green-700">{students.filter(s => !s.left_at && s.status === 'active').length}</span> faol</span>
              )}
              {students.filter(s => !s.left_at && s.status === 'trial').length > 0 && (
                <span className="text-gray-600"><span className="font-semibold text-orange-600">{students.filter(s => !s.left_at && s.status === 'trial').length}</span> sinov</span>
              )}
              {students.filter(s => !s.left_at && s.status === 'frozen').length > 0 && (
                <span className="text-gray-600"><span className="font-semibold text-sky-600">{students.filter(s => !s.left_at && s.status === 'frozen').length}</span> muzlatilgan</span>
              )}
              {students.filter(s => s.left_at).length > 0 && (
                <span className="text-gray-500"><span className="font-semibold">{students.filter(s => s.left_at).length}</span> chiqib ketgan</span>
              )}
            </div>
          )}
          <div className="bg-white rounded border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['№', common('name'), common('phone'), t('parentPhone'), common('birthDate'), common('status'), common('actions')].map((h) => (
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
                    : students.map((s, idx) => {
                      const isLeft = !!s.left_at;
                      return (
                        <tr key={s.id} className={cn(
                          'transition-colors',
                          isLeft ? 'bg-[#FFFBEB]' : s.status === 'frozen' ? 'bg-[#F0F9FF] hover:bg-sky-100' : 'hover:bg-gray-50'
                        )}>
                          <td className={cn('px-4 py-3', isLeft ? 'text-gray-400' : 'text-gray-500')}>{idx + 1}</td>
                          <td className={cn('px-4 py-3 font-medium', isLeft ? 'text-gray-400' : 'text-gray-900')}>{s.first_name} {s.last_name}</td>
                          <td className={cn('px-4 py-3', isLeft ? 'text-gray-400' : 'text-gray-600')}>{formatPhone(s.phone)}</td>
                          <td className={cn('px-4 py-3', isLeft ? 'text-gray-400' : 'text-gray-600')}>{s.second_phone ? formatPhone(s.second_phone) : '—'}</td>
                          <td className={cn('px-4 py-3', isLeft ? 'text-gray-400' : 'text-gray-600')}>{formatDMY(s.birth_date) || '—'}</td>
                          <td className="px-4 py-3">
                            {/* Student still in this group — use gs_status for per-group accuracy */}
                            {!s.left_at && (s.gs_status ?? s.status) === 'active' && (
                              <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                                {common('active')}
                              </span>
                            )}
                            {!s.left_at && (s.gs_status ?? s.status) === 'trial' && (
                              <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">
                                {t('trial')}
                              </span>
                            )}
                            {!s.left_at && (s.gs_status ?? s.status) === 'frozen' && (
                              <span className="px-2 py-0.5 bg-sky-100 text-sky-700 rounded-full text-xs font-medium">
                                {common('frozen')}
                              </span>
                            )}
                            {/* Student transferred to another group */}
                            {s.left_at && s.current_group && (
                              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                                {common('active')} ({s.current_group})
                              </span>
                            )}
                            {/* Student archived */}
                            {!s.left_at && s.status === 'archived' && (
                              <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs font-medium">
                                {common('archived')}
                              </span>
                            )}
                            {/* Student transferred but now archived */}
                            {s.left_at && !s.current_group && (
                              <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs font-medium">
                                {common('archived')}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {isLeft ? (
                              <span className="text-xs text-gray-400">Chiqdi: {formatDMY(s.left_at)}</span>
                            ) : (canEdit || isTeacher) ? (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => {
                                    if (isTeacher) { toast.error("Bu amal uchun huquqingiz yo'q. Admin orqali murojaat qiling."); return; }
                                    setArchiveReason(''); setArchiveTarget({ studentId: s.id, name: `${s.first_name} ${s.last_name}`, status: s.status });
                                  }}
                                  className={cn('p-1 rounded transition-colors', isTeacher ? 'text-gray-300 cursor-not-allowed' : 'text-red-400 hover:bg-red-50 hover:text-red-600')}
                                  title={common('archive')}
                                >
                                  <Minus className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => {
                                    if (isTeacher) { toast.error("Bu amal uchun huquqingiz yo'q. Admin orqali murojaat qiling."); return; }
                                    setNewGroupId(''); setChangeGroupTarget({ studentId: s.id, name: `${s.first_name} ${s.last_name}` });
                                  }}
                                  className={cn('p-1 rounded transition-colors', isTeacher ? 'text-gray-300 cursor-not-allowed' : 'text-blue-400 hover:bg-blue-50 hover:text-blue-600')}
                                  title={t('transferStudent')}
                                >
                                  <ArrowLeftRight className="w-4 h-4" />
                                </button>
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })
                }
              </tbody>
            </table>
          </div>
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
                <Plus className="w-4 h-4" /> {t('newLesson')}
              </button>
            </div>
          )}
          <div className="bg-white rounded border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['№', common('date'), t('weekDay'), t('topic'), t('lessonTime')].map((h) => (
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
                    : lessons.map((lesson, idx) => {
                      const weekDay = lesson.date
                        ? ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'][new Date(lesson.date).getDay()]
                        : '—';
                      const startTime = formatTime(lesson.started_at);
                      const endTime = formatTime(lesson.finished_at);
                      return (
                        <tr
                          key={lesson.id}
                          onClick={() => router.push(`/${locale}/lessons/${lesson.id}`)}
                          className={cn(
                            'cursor-pointer transition-colors',
                            lesson.status === 'ongoing' ? 'bg-green-200 hover:bg-green-300' : 'hover:bg-gray-50',
                          )}
                        >
                          <td className="px-4 py-3 text-gray-500">{idx + 1}</td>
                          <td className="px-4 py-3 text-gray-700">{formatDMY(lesson.date)}</td>
                          <td className="px-4 py-3 text-gray-600">{weekDay}</td>
                          <td className="px-4 py-3 font-medium text-gray-900">{lesson.topic || '—'}</td>
                          <td className="px-4 py-3 text-gray-600">
                            {startTime ? `${startTime}${endTime ? ` — ${endTime}` : ''}` : '—'}
                          </td>
                        </tr>
                      );
                    })}
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
              { label: common('course'), value: group.course?.name },
              { label: t('groupType'), value: t(GENDER_LABELS_KEYS[group.gender_type] as Parameters<typeof t>[0]) },
              { label: t('schedule'), value: group.schedule },
              { label: common('room'), value: group.room_name || null },
              { label: t('startTime'), value: group.start_time || null },
              { label: t('endTime'), value: group.end_time || null },
              { label: t('studentsCount'), value: String(students.filter(s => !s.left_at).length) },
              { label: common('status'), value: group.status === 'active' ? common('active') : common('archived') },
              { label: t('createdAt'), value: formatDMY(group.created_at) },
            ].map(({ label, value }) => (
              <div key={label} className="flex py-3">
                <dt className="w-44 text-sm text-gray-500 flex-shrink-0">{label}</dt>
                <dd className="text-sm font-medium text-gray-900">{value ?? '—'}</dd>
              </div>
            ))}
            {/* Teacher row with archived badge */}
            <div className="flex py-3">
              <dt className="w-44 text-sm text-gray-500 flex-shrink-0">{common('teacher')}</dt>
              <dd className="text-sm font-medium text-gray-900 flex items-center gap-2">
                {group.teacher ? `${group.teacher.first_name} ${group.teacher.last_name}` : '—'}
                {group.teacher?.status === 'archived' && (
                  <span className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200 rounded-full">
                    {common('archived')}
                  </span>
                )}
              </dd>
            </div>
          </dl>
        </div>
      )}

      {/* ══ Add Student Dialog ══ */}
      <Dialog
        open={showAddStudent}
        onOpenChange={(open) => {
          if (!open) { setStudentSearch(''); setSearchResults([]); setSelectedIds(new Set()); setCourseFilter(''); }
          setShowAddStudent(open);
        }}
      >
        <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{t('addStudent')}</DialogTitle>
          </DialogHeader>
          <div className="flex gap-2 mt-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                ref={searchRef}
                type="text"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Ism yoki familyani kiriting..."
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
            <select
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700"
            >
              <option value="">{t('allCourses')}</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {selectedIds.size > 0 && (
            <div className="flex items-center justify-between px-3 py-2 bg-blue-50 rounded text-sm text-blue-700 font-medium">
              <span>{selectedIds.size} ta tanlandi</span>
              <button onClick={() => setSelectedIds(new Set())} className="text-xs text-blue-500 hover:underline">Bekor</button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto border border-gray-200 rounded mt-1 min-h-[260px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="w-10 px-4 py-2"></th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">{common('name')}</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">{common('phone')}</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">{common('birthDate')}</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">{common('course')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {searchLoading
                  ? <tr><td colSpan={5} className="py-8 text-center text-sm text-gray-400">Qidirmoqda...</td></tr>
                  : searchResults.length === 0
                    ? <tr><td colSpan={5} className="py-8 text-center text-sm text-gray-400">
                        {studentSearch || courseFilter ? 'Natija topilmadi' : "O'quvchi qidiring..."}
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
                            <div className={cn('w-4 h-4 rounded border-2 flex items-center justify-center transition-colors', checked ? 'bg-blue-600 border-blue-600' : 'border-gray-300')}>
                              {checked && (
                                <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 8">
                                  <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 font-medium text-gray-900">{s.first_name} {s.last_name}</td>
                          <td className="px-4 py-3 text-gray-600">{formatPhone(s.phone)}</td>
                          <td className="px-4 py-3 text-gray-600">{formatDMY(s.birth_date) || '—'}</td>
                          <td className="px-4 py-3 text-gray-600">{s.course_name || '—'}</td>
                        </tr>
                      );
                    })
                }
              </tbody>
            </table>
          </div>

          <div className="flex gap-3 pt-2 border-t border-gray-100">
            <button onClick={() => setShowAddStudent(false)} className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50">
              {common('cancel')}
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

      {/* Archive student */}
      <Dialog open={!!archiveTarget} onOpenChange={(open) => { if (!open) { setArchiveTarget(null); setArchiveReason(''); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{archiveTarget?.name} — {common('archive')}</DialogTitle>
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
            <button onClick={() => { setArchiveTarget(null); setArchiveReason(''); }} className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50">{common('cancel')}</button>
            <button onClick={handleArchiveStudent} disabled={!archiveReason} className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700 disabled:opacity-50">{common('archive')}</button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Change group */}
      <Dialog open={!!changeGroupTarget} onOpenChange={(open) => { if (!open) setChangeGroupTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{t('transferStudent')}</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600"><span className="font-medium">{changeGroupTarget?.name}</span></p>
          <select value={newGroupId} onChange={(e) => setNewGroupId(e.target.value)} className="w-full mt-3 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">{t('selectPlaceholder')}</option>
            {groupOptions.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          {groupOptions.length === 0 && <p className="text-xs text-gray-400 mt-1">Boshqa faol guruhlar topilmadi</p>}
          <div className="flex gap-3 mt-4">
            <button onClick={() => setChangeGroupTarget(null)} className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50">{common('cancel')}</button>
            <button onClick={handleChangeGroup} disabled={!newGroupId || changingGroup} className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-60">
              {changingGroup ? common('loading') : common('confirm')}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Change teacher */}
      <Dialog open={showChangeTeacher} onOpenChange={(open) => { if (!open) { setShowChangeTeacher(false); setChangeTeacherId(''); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{t('changeTeacher')}</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600 mt-1">
            {common('teacher')}: <span className="font-medium">{group?.teacher ? `${group.teacher.first_name} ${group.teacher.last_name}` : '—'}</span>
          </p>
          <select
            value={changeTeacherId}
            onChange={(e) => setChangeTeacherId(e.target.value)}
            className="w-full mt-3 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={loadingTeachers}
          >
            <option value="">{loadingTeachers ? common('loading') : t('selectTeacherPlaceholder')}</option>
            {teacherOptions.filter((tc) => tc.id !== group?.teacher?.id).map((tc) => (
              <option key={tc.id} value={tc.id}>{tc.first_name} {tc.last_name}</option>
            ))}
          </select>
          <div className="flex gap-3 mt-4">
            <button onClick={() => setShowChangeTeacher(false)} className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50">{common('cancel')}</button>
            <button
              onClick={handleChangeTeacher}
              disabled={!changeTeacherId || changingTeacher}
              className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-60"
            >
              {changingTeacher ? common('loading') : common('confirm')}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add lesson */}
      <Dialog open={showAddLesson} onOpenChange={setShowAddLesson}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{t('newLesson')}</DialogTitle></DialogHeader>
          <form onSubmit={handleAddLesson} className="space-y-4 mt-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('topic')}</label>
              <input
                type="text"
                value={lessonForm.topic}
                onChange={(e) => setLessonForm({ topic: e.target.value })}
                placeholder="Dars mavzusi..."
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setShowAddLesson(false)} className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50">{common('cancel')}</button>
              <button type="submit" disabled={savingLesson} className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-60">
                {savingLesson ? common('loading') : common('save')}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}