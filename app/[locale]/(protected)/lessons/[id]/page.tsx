'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { ArrowLeft, Save, Pencil, Check, X } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { Skeleton } from '@/components/ui/skeleton';
import api from '@/lib/axios';
import { cn, formatDMY } from '@/lib/utils';

interface LessonDetail {
  id: string;
  topic: string;
  date: string;
  group: string | { id: string; name: string; course?: { name: string } };
  group_id?: string;
  attendance_count?: number;
}

interface GroupStudentRaw {
  id: string;
  student?: { id: string; first_name: string; last_name: string; phone: string; status: string };
  student_id?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  status?: string;
}

interface AttendanceRecord {
  student_id: string;
  status: 'present' | 'absent' | 'late';
  note?: string;
}

interface GradeRecord {
  student_id: string;
  score: number;
}

interface AttendanceEntry {
  status: 'present' | 'absent' | 'late' | null;
  note: string;
  score: string;
}

function getStudentData(gs: GroupStudentRaw) {
  if (gs.student) {
    return {
      id: gs.student.id,
      name: `${gs.student.first_name} ${gs.student.last_name}`.trim(),
      phone: gs.student.phone,
    };
  }
  return {
    id: gs.student_id ?? gs.id,
    name: `${gs.first_name ?? ''} ${gs.last_name ?? ''}`.trim(),
    phone: gs.phone ?? '',
  };
}

function getGroupId(lesson: LessonDetail): string {
  if (typeof lesson.group === 'string') return lesson.group;
  return (lesson.group as { id: string }).id ?? lesson.group_id ?? '';
}

function getGroupName(lesson: LessonDetail): string {
  if (typeof lesson.group === 'object' && lesson.group !== null) {
    return (lesson.group as { id: string; name: string }).name ?? '';
  }
  return '';
}

export default function LessonAttendancePage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const locale = useLocale();

  const [lesson, setLesson] = useState<LessonDetail | null>(null);
  const [loadingLesson, setLoadingLesson] = useState(true);
  const [students, setStudents] = useState<GroupStudentRaw[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [attendance, setAttendance] = useState<Record<string, AttendanceEntry>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  // ✅ saved: saqlangandan keyin edit bo'lmaydi
  const [saved, setSaved] = useState(false);

  const [editingTopic, setEditingTopic] = useState(false);
  const [topicDraft, setTopicDraft] = useState('');
  const topicInputRef = useRef<HTMLInputElement>(null);

  const fetchLesson = useCallback(async () => {
    setLoadingLesson(true);
    try {
      const { data } = await api.get<LessonDetail>(`/api/v1/lessons/${id}/`);
      setLesson(data);
      setTopicDraft(data.topic ?? '');
    } catch {
      toast.error("Dars ma'lumotlari yuklanmadi");
    } finally {
      setLoadingLesson(false);
    }
  }, [id]);

  const fetchStudentsAndAttendance = useCallback(async (groupId: string) => {
    setLoadingStudents(true);
    try {
      const [groupRes, attendanceRes] = await Promise.allSettled([
        api.get<{ students: GroupStudentRaw[] }>(`/api/v1/groups/${groupId}/`),
        api.get<AttendanceRecord[]>(`/api/v1/lessons/${id}/attendance/`),
      ]);

      if (groupRes.status !== 'fulfilled') return;

      const list: GroupStudentRaw[] = groupRes.value.data.students ?? [];
      setStudents(list);

      const init: Record<string, AttendanceEntry> = {};
      list.forEach((gs) => {
        const s = getStudentData(gs);
        init[s.id] = { status: null, note: '', score: '' };
      });

      if (attendanceRes.status === 'fulfilled') {
        const rawAtt = attendanceRes.value.data;
        const attList: AttendanceRecord[] = Array.isArray(rawAtt)
          ? rawAtt
          : ((rawAtt as any)?.results ?? []);
        attList.forEach((rec: any) => {
          const sid = rec.student_id ?? rec.student?.id ?? rec.student;
          if (sid && init[sid]) {
            init[sid].status = rec.status;
            init[sid].note = rec.note ?? '';
          }
        });
        // ✅ Agar avval saqlangan attendance bo'lsa — saved=true qilib qo'y
        if (attList.length > 0) setSaved(true);
      }

      try {
        const { data: gradesData } = await api.get<GradeRecord[]>(`/api/v1/lessons/${id}/grades/`);
        const gradeList: GradeRecord[] = Array.isArray(gradesData)
          ? gradesData
          : ((gradesData as any)?.results ?? []);
        gradeList.forEach((g: any) => {
          const sid = g.student_id ?? g.student?.id ?? g.student;
          if (sid && init[sid]) {
            init[sid].score = String(Math.round(Number(g.score ?? 0)) || '');
          }
        });
      } catch { /* grades may not exist yet */ }

      setAttendance(init);
    } catch {
      toast.error("O'quvchilar yuklanmadi");
    } finally {
      setLoadingStudents(false);
    }
  }, [id]);

  useEffect(() => { fetchLesson(); }, [fetchLesson]);

  useEffect(() => {
    if (!lesson) return;
    const groupId = getGroupId(lesson);
    if (groupId) fetchStudentsAndAttendance(groupId);
  }, [lesson, fetchStudentsAndAttendance]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  function toggleStatus(studentId: string, st: 'present' | 'absent' | 'late') {
    if (saved) return;
    setAttendance((a) => ({
      ...a,
      [studentId]: {
        ...a[studentId],
        status: a[studentId]?.status === st ? null : st,
      },
    }));
    setDirty(true);
  }

  function setNote(studentId: string, note: string) {
    if (saved) return;
    setAttendance((a) => ({ ...a, [studentId]: { ...a[studentId], note } }));
    setDirty(true);
  }

  function setScore(studentId: string, raw: string) {
    if (saved) return;
    if (raw !== '' && (isNaN(Number(raw)) || Number(raw) < 0 || Number(raw) > 100)) return;
    setAttendance((a) => ({ ...a, [studentId]: { ...a[studentId], score: raw } }));
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const attendanceRows = students.reduce<{ student_id: string; status: string; note: string }[]>(
        (acc, gs) => {
          const s = getStudentData(gs);
          const entry = attendance[s.id];
          if (entry?.status) acc.push({ student_id: s.id, status: entry.status, note: entry.note ?? '' });
          return acc;
        }, [],
      );

      const gradeRows = students.reduce<{ student_id: string; score: number }[]>(
        (acc, gs) => {
          const s = getStudentData(gs);
          const entry = attendance[s.id];
          if (entry?.score) acc.push({ student_id: s.id, score: parseInt(entry.score, 10) });
          return acc;
        }, [],
      );

      await api.post(`/api/v1/lessons/${id}/attendance/`, attendanceRows);
      if (gradeRows.length > 0) {
        await api.post(`/api/v1/lessons/${id}/grades/`, gradeRows);
      }

      setDirty(false);
      setSaved(true);
      toast.success('Davomat saqlandi');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'Xatolik yuz berdi');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveTopic() {
    if (!lesson) return;
    try {
      await api.patch(`/api/v1/lessons/${id}/`, { topic: topicDraft });
      setLesson((l) => l ? { ...l, topic: topicDraft } : l);
      setEditingTopic(false);
      toast.success('Mavzu saqlandi');
    } catch {
      toast.error('Xatolik yuz berdi');
    }
  }

  const entries = Object.values(attendance);
  const summary = {
    present: entries.filter((e) => e.status === 'present').length,
    absent: entries.filter((e) => e.status === 'absent').length,
    late: entries.filter((e) => e.status === 'late').length,
    unmarked: entries.filter((e) => !e.status).length,
  };

  if (loadingLesson) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p className="text-sm">Dars topilmadi</p>
        <button onClick={() => router.back()} className="mt-4 text-blue-600 underline text-sm">Orqaga</button>
      </div>
    );
  }

  const groupId = getGroupId(lesson);
  const groupName = getGroupName(lesson);

  return (
    <div className="space-y-5">
      <Toaster position="top-right" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <button
            onClick={() => groupId ? router.push(`/${locale}/groups/${groupId}`) : router.back()}
            className="mt-1 p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              {editingTopic ? (
                <div className="flex items-center gap-1.5">
                  <input
                    ref={topicInputRef}
                    value={topicDraft}
                    onChange={(e) => setTopicDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveTopic();
                      if (e.key === 'Escape') setEditingTopic(false);
                    }}
                    className="text-xl font-bold text-gray-900 border-b-2 border-blue-500 outline-none bg-transparent min-w-[180px]"
                    autoFocus
                  />
                  <button onClick={handleSaveTopic} className="p-1 text-green-600 hover:bg-green-50 rounded transition-colors">
                    <Check className="w-4 h-4" />
                  </button>
                  <button onClick={() => setEditingTopic(false)} className="p-1 text-gray-400 hover:bg-gray-100 rounded transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <h1 className="text-xl font-bold text-gray-900">{lesson.topic || 'Dars'}</h1>
                  <button
                    onClick={() => { setTopicDraft(lesson.topic ?? ''); setEditingTopic(true); }}
                    className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              {groupName && <>{groupName} &middot; </>}
              {formatDMY(lesson.date)}
              {/* ✅ Saqlangan bo'lsa "Saqlangan" badge chiqaradi */}
              {saved
                ? <span className="ml-2 text-green-600 text-xs font-medium">✓ Saqlangan</span>
                : dirty && <span className="ml-2 text-orange-500 text-xs font-medium">● Saqlanmagan o&apos;zgarishlar</span>
              }
            </p>
          </div>
        </div>

        {/* ✅ Saqlangandan keyin button disabled */}
        <button
          onClick={handleSave}
          disabled={saving || saved}
          className={cn(
            'flex items-center gap-1.5 px-4 py-2 text-white text-sm font-medium rounded transition-colors self-start',
            saved ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 disabled:opacity-60',
          )}
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saqlanmoqda...' : saved ? 'Saqlandi' : 'Saqlash'}
        </button>
      </div>

      {/* Summary bar */}
      <div className="flex flex-wrap gap-2">
        {([
          { label: 'Keldi', count: summary.present, color: 'bg-green-50 text-green-700 border-green-200' },
          { label: 'Kelmadi', count: summary.absent, color: 'bg-red-50 text-red-700 border-red-200' },
          { label: 'Kech qoldi', count: summary.late, color: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
          { label: 'Belgilanmagan', count: summary.unmarked, color: 'bg-gray-50 text-gray-600 border-gray-200' },
        ] as const).map(({ label, count, color }) => (
          <div key={label} className={cn('inline-flex items-center gap-2 px-3 py-1.5 rounded border text-sm font-medium', color)}>
            <span>{label}:</span>
            <span className="font-bold text-base leading-none">{count}</span>
          </div>
        ))}
      </div>

      {/* Attendance table */}
      <div className="bg-white rounded border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[680px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-10">#</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ism</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Telefon</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide min-w-[240px]">Davomat</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-20">Baho</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Izoh</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loadingStudents
                ? Array(6).fill(0).map((_, i) => (
                  <tr key={i}>{Array(6).fill(0).map((_, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                  ))}</tr>
                ))
                : students.length === 0
                  ? <tr><td colSpan={6} className="px-4 py-14 text-center text-gray-400 text-sm">O&apos;quvchilar yo&apos;q</td></tr>
                  : students.map((gs, idx) => {
                    const s = getStudentData(gs);
                    const entry = attendance[s.id] ?? { status: null, note: '', score: '' };
                    return (
                      <tr
                        key={gs.id}
                        className={cn(
                          'transition-colors',
                          entry.status === 'present' && 'bg-green-100',
                          entry.status === 'absent' && 'bg-red-100',
                          entry.status === 'late' && 'bg-yellow-100',
                          !entry.status && 'hover:bg-gray-50',
                        )}
                      >
                        <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{s.name || '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{s.phone || '—'}</td>

                        {/* ✅ Davomat tugmalari — saved bo'lsa disabled */}
                        <td className="px-4 py-3">
                          <div className="flex gap-1.5">
                            {(['present', 'absent', 'late'] as const).map((st) => (
                              <button
                                key={st}
                                onClick={() => toggleStatus(s.id, st)}
                                disabled={saved}
                                className={cn(
                                  'px-2.5 py-1 text-xs font-medium rounded border transition-colors',
                                  saved && 'cursor-not-allowed',
                                  st === 'present' && entry.status === 'present' && 'bg-green-500 text-white border-green-500',
                                  st === 'present' && entry.status !== 'present' && 'border-gray-300 text-gray-600',
                                  st === 'absent' && entry.status === 'absent' && 'bg-red-500 text-white border-red-500',
                                  st === 'absent' && entry.status !== 'absent' && 'border-gray-300 text-gray-600',
                                  st === 'late' && entry.status === 'late' && 'bg-yellow-500 text-white border-yellow-500',
                                  st === 'late' && entry.status !== 'late' && 'border-gray-300 text-gray-600',
                                )}
                              >
                                {st === 'present' ? '✓ Keldi' : st === 'absent' ? '○ Kelmadi' : '⏰ Kech'}
                              </button>
                            ))}
                          </div>
                        </td>

                        {/* ✅ Baho — saved bo'lsa disabled */}
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={entry.score}
                            onChange={(e) => setScore(s.id, e.target.value)}
                            disabled={saved}
                            placeholder="—"
                            className="w-16 px-2 py-1 border border-gray-300 rounded text-xs text-center focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-gray-50"
                          />
                        </td>

                        {/* ✅ Izoh — saved bo'lsa disabled */}
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={entry.note}
                            onChange={(e) => setNote(s.id, e.target.value)}
                            disabled={saved}
                            placeholder="Sabab..."
                            className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-transparent placeholder-gray-400 disabled:opacity-60 disabled:cursor-not-allowed"
                          />
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
      </div>

      {dirty && !saved && (
        <div className="fixed bottom-4 right-4 sm:hidden z-40">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-3 bg-green-600 text-white text-sm font-medium rounded-full shadow-lg hover:bg-green-700 disabled:opacity-60 transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saqlanmoqda...' : 'Saqlash'}
          </button>
        </div>
      )}
    </div>
  );
}