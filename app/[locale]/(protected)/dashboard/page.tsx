'use client';

import { useEffect, useState } from 'react';
import {
  Users, UserPlus, Users2, AlertCircle, GraduationCap,
  MessageSquare, CalendarCheck, TrendingDown, ChevronUp, ChevronDown,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import toast, { Toaster } from 'react-hot-toast';
import StatCard from '@/components/stat-card';
import { Skeleton } from '@/components/ui/skeleton';
import api from '@/lib/axios';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────

interface LeaderboardEntry { student_id: string; student_name: string; avg_score: number; group_name?: string; }
interface TodayLesson {
  id: string;
  display_name: string;
  course_name: string;
  teacher_name: string;
  room_name: string;
  start_time: string;
  end_time: string;
  schedule: string;
  students_count: number;
  lesson_status: string | null;
}
interface TopTeacher {
  id: string;
  name: string;
  groups_count: number;
  group_names: string[];
  students_count: number;
  attendance_rate: number;
}
interface DashboardData {
  total_students?: number; active_students?: number; students_count?: number;
  active_groups?: number; groups_count?: number;
  debtors_count?: number; total_debtors?: number;
  teachers_count?: number;
}
interface AttendanceNote {
  id: string;
  student_name: string;
  teacher_name: string;
  group_name: string;
  note: string;
  date: string;
  status: string;
}
interface GroupItem { id: string; name: string; display_name?: string; }
interface ChurnStudent {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  second_phone?: string | null;
  group_name?: string;
  course_name?: string | null;
  archived_at?: string | null;
  archive_reason?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function resolve(data: DashboardData) {
  return {
    students: data.active_students || data.students_count || data.total_students || (data as any).students || 0,
    groups: data.active_groups || data.groups_count || (data as any).groups || 0,
    debtors: data.debtors_count || data.total_debtors || (data as any).debtors || 0,
    teachers: data.teachers_count || (data as any).teachers || 0,
  };
}



function parseDMY(val: string): string {
  const parts = val.split('/');
  if (parts.length < 3) return '';
  const [d, m, y] = parts;
  if (!d || !m || !y || y.length < 4) return '';
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function daysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

function handleDateInput(val: string, setter: (v: string) => void) {
  const digits = val.replace(/\D/g, '');
  let masked = digits;
  if (digits.length > 2) masked = digits.slice(0, 2) + '/' + digits.slice(2);
  if (digits.length > 4) masked = digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4, 8);

  if (digits.length >= 8) {
    const d = parseInt(digits.slice(0, 2));
    const m = parseInt(digits.slice(2, 4));
    const y = parseInt(digits.slice(4, 8));
    const currentYear = new Date().getFullYear();
    if (m < 1 || m > 12) return;
    if (d < 1 || d > daysInMonth(m, y)) return;
    if (y < 2000 || y > currentYear + 10) return;
  }
  setter(masked);
}

function CardSkeleton() { return <Skeleton className="h-28 w-full rounded-xl" />; }

// ── Funnel Widget ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function FunnelWidget({ locale }: { locale: string }) {
  const [conversionStats, setConversionStats] = useState<any>(null);

  useEffect(() => {
    api.get('/api/v1/leads/conversion-stats/')
      .then(({ data }) => setConversionStats(data))
      .catch(() => {});
  }, []);

  if (!conversionStats) return <Skeleton className="h-40 w-full rounded-lg" />;

  const funnelRows = [
    { label: 'Jami',              count: conversionStats.grand_total,       percent: 100,                              color: '#6B7280' },
    { label: "Faol o'quvchilar",  count: conversionStats.active?.count,     percent: conversionStats.active?.percent,  color: '#22C55E' },
    { label: 'Sinov muddatida',   count: conversionStats.trial?.count,      percent: conversionStats.trial?.percent,   color: '#F97316' },
    { label: 'Muzlatilgan',       count: conversionStats.frozen?.count,     percent: conversionStats.frozen?.percent,  color: '#06B6D4' },
    { label: 'Kutilmoqda',        count: conversionStats.pending?.count,    percent: conversionStats.pending?.percent, color: '#EAB308' },
    { label: 'Rad etdi',          count: conversionStats.ignored?.count,    percent: conversionStats.ignored?.percent, color: '#EF4444' },
    { label: 'Arxivlangan',       count: conversionStats.archived?.count,   percent: conversionStats.archived?.percent,color: '#9CA3AF' },
  ];

  return (
    <div className="flex flex-col gap-2.5">
      {funnelRows.map(row => (
        <div key={row.label} className="flex items-center gap-3">
          <span className="w-44 text-sm text-gray-600 shrink-0">{row.label}</span>
          <div className="flex-1 bg-gray-100 rounded-full h-3">
            <div
              className="h-3 rounded-full transition-all"
              style={{ width: `${row.percent ?? 0}%`, backgroundColor: row.color }}
            />
          </div>
          <span className="w-12 text-sm font-semibold text-right">{row.count ?? 0}</span>
          <span className="w-14 text-sm text-gray-500 text-right">{row.percent ?? 0}%</span>
        </div>
      ))}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function DashboardPage() {
  const locale = useLocale();
  const t = useTranslations('dashboard');
  const tc = useTranslations('common');

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [leadsCount, setLeadsCount] = useState(0);

  const [notes, setNotes] = useState<AttendanceNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [activePreset, setActivePreset] = useState('');

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [worstStudents, setWorstStudents] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);

  const [todayLessons, setTodayLessons] = useState<TodayLesson[]>([]);
  const [todayLoading, setTodayLoading] = useState(true);

  const [churnList, setChurnList] = useState<ChurnStudent[]>([]);
  const [churnLoading, setChurnLoading] = useState(true);
  const [churnOpen, setChurnOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);

  const [teacherStats, setTeacherStats] = useState<TopTeacher[]>([]);
  const [teacherStatsLoading, setTeacherStatsLoading] = useState(true);

  // ── Fetch ──────────────────────────────────────────────────────────────

  async function fetchData() {
    setLoading(true); setError(false);
    try {
      const [summaryRes, leadsRes] = await Promise.all([
        api.get('/api/v1/dashboard/summary/').catch(() => null),
        api.get('/api/v1/leads/', { params: { page_size: 1 } }).catch(() => null),
      ]);
      setData(summaryRes?.data ?? {});
      setLeadsCount(leadsRes?.data?.count ?? 0);
    } catch {
      setError(true);
      toast.error(t('loadError'));
    } finally {
      setLoading(false);
    }
  }

  async function fetchNotes(apiFrom: string, apiTo: string) {
    setNotesLoading(true);
    try {
      const params: Record<string, string> = {};
      if (apiFrom) params.from_date = apiFrom;
      if (apiTo) params.to_date = apiTo;
      if (selectedGroup) params.group = selectedGroup;
      const { data: d } = await api.get('/api/v1/attendance/notes/', { params });
      setNotes(Array.isArray(d) ? d : (d.results ?? []));
    } catch { setNotes([]); } finally { setNotesLoading(false); }
  }

  async function fetchGroups() {
    try {
      const { data: d } = await api.get('/api/v1/groups/', { params: { status: 'active', page_size: 100 } });
      setGroups(d.results ?? []);
    } catch { setGroups([]); }
  }

  async function fetchLeaderboard() {
    setLeaderboardLoading(true);
    try {
      const { data: d } = await api.get('/api/v1/grades/', { params: { page_size: 100 } });
      const results: Array<{ student?: { id: string; first_name: string; last_name: string }; student_id?: string; student_name?: string; score?: number; grade?: number; group?: { name: string } }> = d.results ?? [];
      const map = new Map<string, { name: string; scores: number[]; group?: string }>();
      results.forEach((r) => {
        const sid = r.student?.id ?? r.student_id ?? '';
        const name = r.student ? `${r.student.first_name} ${r.student.last_name}` : r.student_name ?? '';
        const score = r.score ?? r.grade ?? 0;
        if (!map.has(sid)) map.set(sid, { name, scores: [], group: r.group?.name });
        map.get(sid)!.scores.push(score);
      });
      const entries: LeaderboardEntry[] = Array.from(map.entries())
        .map(([id, v]) => ({
          student_id: id,
          student_name: v.name,
          avg_score: v.scores.length > 0 ? v.scores.reduce((a, b) => a + b, 0) / v.scores.length : 0,
          group_name: v.group,
        }))
        .sort((a, b) => b.avg_score - a.avg_score);
      setLeaderboard(entries.slice(0, 10));
      setWorstStudents([...entries].sort((a, b) => a.avg_score - b.avg_score).slice(0, 10));
    } catch { setLeaderboard([]); setWorstStudents([]); } finally { setLeaderboardLoading(false); }
  }

  async function fetchTodayLessons() {
    setTodayLoading(true);
    try {
      const { data } = await api.get('/api/v1/groups/today/');
      setTodayLessons(Array.isArray(data) ? data : (data.results ?? []));
    } catch { setTodayLessons([]); } finally { setTodayLoading(false); }
  }

  async function fetchChurnList(apiFrom: string, apiTo: string) {
    setChurnLoading(true);
    try {
      const params: Record<string, string> = { reason: 'dropped_out', page_size: '100' };
      if (apiFrom) params.from_date = apiFrom;
      if (apiTo) params.to_date = apiTo;
      const { data: d } = await api.get('/api/v1/archive/students/', { params });
      setChurnList(d.results ?? []);
    } catch { setChurnList([]); } finally { setChurnLoading(false); }
  }

  async function fetchTeacherStats() {
    setTeacherStatsLoading(true);
    try {
      const { data } = await api.get('/api/v1/teachers/top/');
      setTeacherStats(Array.isArray(data) ? data : (data.results ?? []));
    } catch { setTeacherStats([]); } finally { setTeacherStatsLoading(false); }
  }

  const apiFrom = parseDMY(fromDate);
  const apiTo = parseDMY(toDate);

  useEffect(() => {
    fetchData();
    fetchNotes('', '');
    fetchLeaderboard();
    fetchTodayLessons();
    fetchChurnList('', '');
    fetchTeacherStats();
    fetchGroups();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchNotes(apiFrom, apiTo); }, [apiFrom, apiTo, selectedGroup]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { fetchChurnList(apiFrom, apiTo); }, [apiFrom, apiTo]); // eslint-disable-line react-hooks/exhaustive-deps

  const d = data ? resolve(data) : null;

  const stats = d ? [
    { label: t('totalLeads'), value: leadsCount, icon: UserPlus },
    { label: t('totalStudents'), value: d.students, icon: Users },
    { label: t('activeGroups'), value: d.groups, icon: Users2 },
    { label: t('debtors'), value: d.debtors, icon: AlertCircle, variant: 'danger' as const },
    { label: tc('teacher'), value: d.teachers, icon: GraduationCap, variant: 'success' as const },
  ] : [];

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      <Toaster position="top-right" />

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        {loading
          ? Array(5).fill(0).map((_, i) => <CardSkeleton key={i} />)
          : stats.map((s) => <StatCard key={s.label} {...s} />)}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl flex items-center justify-between">
          <span>{tc('error')}</span>
          <button onClick={fetchData} className="underline font-medium">{tc('retry')}</button>
        </div>
      )}

      {/* Conversion Funnel */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-100 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-800 mb-4">{t('conversion')}</h2>
        <FunnelWidget locale={locale} />
      </div>

      {/* Today's Lessons */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <CalendarCheck className="w-4 h-4 text-emerald-500" />
            {t('todayLessons')}
          </h2>
          <span className="text-xs text-gray-400">
            {!todayLoading && `${todayLessons.length} ${t('groups2')}`}
          </span>
        </div>
        {todayLoading ? (
          <div className="space-y-2">{Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : todayLessons.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8">
            <CalendarCheck className="w-8 h-8 text-gray-200 mb-2" />
            <p className="text-sm text-gray-400">{t('noLessons')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {[t('groupHeader'), t('courseHeader'), t('teacherHeader'), t('room'), t('time'), t('studentsHeader')].map((h) => (
                    <th key={h} className="text-left pb-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide pr-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {todayLessons.map((lesson) => {
                  return (
                  <tr
                    key={lesson.id}
                    className={cn(
                      'transition-colors hover:brightness-95',
                      lesson.lesson_status === 'finished' ? 'bg-white' : 'bg-blue-50'
                    )}
                  >
                    <td className="py-3 pr-4">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600 text-white text-xs font-bold">
                        {lesson.display_name}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-gray-700 text-xs font-medium">{lesson.course_name}</td>
                    <td className="py-3 pr-4 text-gray-600 text-xs">{lesson.teacher_name}</td>
                    <td className="py-3 pr-4">
                      <span className="inline-flex items-center justify-center min-w-[2rem] h-8 px-2 rounded-lg bg-blue-100 text-blue-700 text-xs font-bold">
                        {lesson.room_name}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <span className="text-xs font-semibold text-gray-700 whitespace-nowrap">
                        {lesson.start_time}{lesson.end_time && lesson.end_time !== '—' ? ` — ${lesson.end_time}` : ''}
                      </span>
                    </td>
                    <td className="py-3">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-700">
                        <Users className="w-3 h-3 text-gray-400" />
                        {lesson.students_count}
                      </span>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Best + Worst Students */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Top 10 Best */}
        <div className="bg-white rounded-xl border-2 border-green-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">
            🏆 {t('topStudents')}
          </h2>
          {leaderboardLoading ? (
            <div className="space-y-2">{Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : leaderboard.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10">
              <Users className="w-8 h-8 text-gray-200 mb-2" />
              <p className="text-sm text-gray-400">{t('noGrades')}</p>
            </div>
          ) : (
            <div className="space-y-1">
              {leaderboard.map((entry, i) => (
                <div key={entry.student_id} className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
                  <span className="text-xs font-bold text-gray-400 w-5 flex-shrink-0 text-center">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{entry.student_name}</p>
                    {entry.group_name && <p className="text-xs text-gray-400">{entry.group_name}</p>}
                  </div>
                  <span className="text-sm font-bold text-green-600 flex-shrink-0">{entry.avg_score > 0 ? entry.avg_score.toFixed(1) : '—'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top 10 Worst */}
        <div className="bg-white rounded-xl border-2 border-red-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">
            📉 {t('worstStudents')}
          </h2>
          {leaderboardLoading ? (
            <div className="space-y-2">{Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : worstStudents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10">
              <Users className="w-8 h-8 text-gray-200 mb-2" />
              <p className="text-sm text-gray-400">{t('noGrades')}</p>
            </div>
          ) : (
            <div className="space-y-1">
              {worstStudents.map((entry, i) => (
                <div key={entry.student_id} className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
                  <span className="text-xs font-bold text-gray-400 w-5 flex-shrink-0 text-center">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{entry.student_name}</p>
                    {entry.group_name && <p className="text-xs text-gray-400">{entry.group_name}</p>}
                  </div>
                  <span className="text-sm font-bold text-red-500 flex-shrink-0">{entry.avg_score > 0 ? entry.avg_score.toFixed(1) : '—'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Top Teachers */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <GraduationCap className="w-4 h-4 text-violet-500" />
          {t('topTeachers')}
        </h2>
        {teacherStatsLoading ? (
          <div className="space-y-2">{Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : teacherStats.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">{tc('noData')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {['№', t('teacherHeader'), t('activeGroups'), t('studentsHeader'), t('attendanceRate')].map((h) => (
                  <th key={h} className="text-left pb-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide pr-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {teacherStats.map((teacher, idx) => (
                <tr key={teacher.id} className="hover:bg-gray-50 transition-colors">
                  <td className="py-3 pr-4 text-gray-400 text-xs">{idx + 1}</td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-[10px] font-bold text-violet-700">
                          {teacher.name.charAt(0)}
                        </span>
                      </div>
                      <span className="text-sm font-medium text-gray-900">{teacher.name}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-sm font-semibold text-gray-700">{teacher.groups_count}</span>
                      <span className="text-xs text-gray-400">({teacher.group_names.join(', ')})</span>
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    <span className="text-sm font-semibold text-gray-700">{teacher.students_count}</span>
                  </td>
                  <td className="py-3">
                    <span className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold',
                      teacher.attendance_rate >= 80 ? 'bg-green-100 text-green-700' :
                      teacher.attendance_rate >= 60 ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    )}>
                      {teacher.attendance_rate}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Shared date filter bar for Notes + Churn */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => {
              const now = new Date();
              const y = now.getFullYear();
              const m = String(now.getMonth() + 1).padStart(2, '0');
              const lastDay = String(daysInMonth(now.getMonth() + 1, y)).padStart(2, '0');
              setFromDate(`01/${m}/${y}`);
              setToDate(`${lastDay}/${m}/${y}`);
              setActivePreset('current_month');
            }}
            className={cn(
              'px-3 py-2 text-sm rounded-lg border transition-colors',
              activePreset === 'current_month'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            )}
          >
            Joriy oy
          </button>
          <input
            type="text"
            value={fromDate}
            onChange={e => { handleDateInput(e.target.value, setFromDate); setActivePreset('custom'); }}
            placeholder="dd/mm/yyyy"
            maxLength={10}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-32"
          />
          <span className="text-gray-400">—</span>
          <input
            type="text"
            value={toDate}
            onChange={e => { handleDateInput(e.target.value, setToDate); setActivePreset('custom'); }}
            placeholder="dd/mm/yyyy"
            maxLength={10}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-32"
          />
          {(fromDate || toDate) && (
            <button
              onClick={() => { setFromDate(''); setToDate(''); setActivePreset(''); }}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Tozalash
            </button>
          )}
        </div>
      </div>

      {/* Recent Notes */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div
          onClick={() => setNotesOpen(o => !o)}
          className="flex items-center justify-between cursor-pointer px-5 py-4 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-gray-400" />
            <h3 className="font-semibold text-gray-900 text-sm">So&apos;ngi izohlar</h3>
            {!notesLoading && notes.length > 0 && (
              <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-medium">
                {notes.length}
              </span>
            )}
          </div>
          <ChevronDown className={cn('w-4 h-4 text-gray-400 transition-transform', notesOpen ? 'rotate-180' : '')} />
        </div>

        {notesOpen && (
          <div className="border-t border-gray-100 p-4">
            <div className="mb-3">
              <select
                value={selectedGroup}
                onChange={e => { setSelectedGroup(e.target.value); setActivePreset('custom'); }}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-700"
              >
                <option value="">Barcha guruhlar</option>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.display_name ?? g.name}</option>
                ))}
              </select>
            </div>
            {notesLoading ? (
              <div className="grid grid-cols-2 gap-3">
                {Array(4).fill(0).map((_, i) => (
                  <div key={i} className="flex gap-3 p-3 border border-gray-100 rounded-lg">
                    <Skeleton className="w-7 h-7 rounded-full flex-shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3 w-1/3" />
                      <Skeleton className="h-4 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : notes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8">
                <MessageSquare className="w-8 h-8 text-gray-200 mb-2" />
                <p className="text-sm text-gray-400">Izohlar yo&apos;q</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {notes.map((note, idx) => (
                  <div key={note.id} className="flex items-start gap-3 p-3 border border-gray-100 rounded-lg">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold shrink-0">
                      {idx + 1}
                    </span>
                    <div className="flex-1">
                      <p className="text-xs text-gray-400 mb-0.5">
                        {note.teacher_name} — {note.group_name} — {note.date}
                      </p>
                      <p className="text-sm font-semibold text-gray-900 mb-1">{note.student_name}</p>
                      <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2 whitespace-pre-wrap">
                        {note.note}
                      </p>
                    </div>
                    <span className={cn(
                      'text-xs px-2 py-0.5 rounded-full font-medium shrink-0',
                      note.status === 'present' ? 'bg-green-100 text-green-700' :
                      note.status === 'late' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    )}>
                      {note.status === 'present' ? 'Keldi' : note.status === 'late' ? 'Kechikdi' : 'Kelmadi'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Churn Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <button
          onClick={() => setChurnOpen(o => !o)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-rose-500" />
            <span className="text-sm font-semibold text-gray-900">{t('churnTitle')}</span>
            {!churnLoading && churnList.length > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-700">
                {churnList.length} {t('churnCount')}
              </span>
            )}
          </div>
          {churnOpen
            ? <ChevronUp className="w-4 h-4 text-gray-400" />
            : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>

        {churnOpen && (
          <div className="border-t border-gray-100">
            {churnLoading ? (
              <div className="p-4 space-y-2">{Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : churnList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <span className="text-2xl text-green-500">✓</span>
                <p className="text-sm text-green-600 font-medium">{t('churnEmpty')}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      {["№", "O'quvchi", 'Telefon', 'Ota-ona tel', 'Guruh', 'Kurs', 'Arxivlangan sana'].map((h) => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-red-100">
                    {churnList.map((s, idx) => (
                      <tr key={s.id} className="bg-red-50 transition-colors hover:brightness-95">
                        <td className="px-4 py-3 text-gray-400 text-xs font-medium">{idx + 1}</td>
                        <td className="px-4 py-3 font-semibold text-gray-900">{s.first_name} {s.last_name}</td>
                        <td className="px-4 py-3 text-gray-600">{s.phone || '—'}</td>
                        <td className="px-4 py-3 text-gray-500">{s.second_phone || '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{s.group_name || '—'}</td>
                        <td className="px-4 py-3 text-gray-500">{s.course_name || '—'}</td>
                        <td className="px-4 py-3 text-gray-500">{s.archived_at ? s.archived_at.slice(0, 10) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
