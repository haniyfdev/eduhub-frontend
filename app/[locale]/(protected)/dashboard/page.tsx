'use client';

import { useEffect, useState } from 'react';
import {
  Users, UserPlus, Users2, CreditCard, AlertCircle, GraduationCap,
  MessageSquare, CalendarCheck, UserMinus,
} from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import {
  PieChart, Pie, Cell, Tooltip,
} from 'recharts';
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
interface TeacherTop {
  id: string;
  first_name: string;
  last_name: string;
  groups_count?: number;
  students_count?: number;
  attendance_rate?: number;
}
interface DashboardData {
  total_students?: number; active_students?: number; students_count?: number;
  active_groups?: number; groups_count?: number;
  debtors_count?: number; total_debtors?: number;
  teachers_count?: number;
}
interface StudentNote {
  id: string;
  author_name?: string;
  author?: { first_name: string; last_name: string };
  note?: string;
  text?: string;
  created_at: string;
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

function timeAgo(dateStr: string, tFn: (key: string, params?: Record<string, number>) => string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return tFn('timeAgoNow');
  if (diff < 3600) return tFn('timeAgoMinutes', { n: Math.floor(diff / 60) });
  if (diff < 86400) return tFn('timeAgoHours', { n: Math.floor(diff / 3600) });
  return tFn('timeAgoDays', { n: Math.floor(diff / 86400) });
}


const RANK_BADGES = ['🥇', '🥈', '🥉', '4', '5', '6', '7', '8', '9', '10'];
const DONUT_COLORS_PAYMENT = ['#10b981', '#f59e0b', '#6b7280', '#ef4444'];
const DONUT_COLORS_COURSE = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#06b6d4'];

function CardSkeleton() { return <Skeleton className="h-28 w-full rounded-xl" />; }

// ── Funnel Widget ──────────────────────────────────────────────────────────

function FunnelWidget({ locale }: { locale: string }) {
  const td = useTranslations('dashboard');
  const [counts, setCounts] = useState<{ leads: number; trial: number; active: number } | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [r1, r2, r3] = await Promise.all([
          api.get('/api/v1/leads/', { params: { page_size: 1 } }),
          api.get('/api/v1/leads/', { params: { status: 'trial', page_size: 1 } }),
          api.get('/api/v1/students/', { params: { status: 'active', page_size: 1 } }),
        ]);
        setCounts({ leads: r1.data.count ?? 0, trial: r2.data.count ?? 0, active: r3.data.count ?? 0 });
      } catch { setCounts({ leads: 0, trial: 0, active: 0 }); }
    }
    load();
  }, []);

  if (!counts) return <Skeleton className="h-24 w-full rounded-lg" />;

  const conv1 = counts.leads > 0 ? Math.round((counts.trial / counts.leads) * 100) : 0;
  const conv2 = counts.trial > 0 ? Math.round((counts.active / counts.trial) * 100) : 0;

  const steps = [
    { label: td('funnelLeads'), count: counts.leads, color: 'bg-amber-400', href: `/${locale}/leads`, width: 100 },
    { label: td('funnelTrial'), count: counts.trial, color: 'bg-blue-400', href: `/${locale}/leads?status=trial`, width: 72 },
    { label: td('funnelActive'), count: counts.active, color: 'bg-emerald-500', href: `/${locale}/students`, width: 50 },
  ];

  return (
    <div className="flex flex-col items-center gap-1.5 py-1">
      {steps.map((step, i) => (
        <div key={step.label} className="w-full flex items-center gap-3">
          <Link href={step.href} style={{ width: `${step.width}%` }}
            className="group block rounded-lg overflow-hidden hover:opacity-90 transition-opacity">
            <div className={cn('py-2.5 px-4 flex items-center justify-between text-white', step.color)}>
              <span className="text-sm font-medium">{step.label}</span>
              <span className="font-bold">{step.count.toLocaleString()}</span>
            </div>
          </Link>
          {i < steps.length - 1 && (
            <span className="text-xs text-gray-400 flex-shrink-0">↓ {[conv1, conv2][i]}%</span>
          )}
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

  const [notes, setNotes] = useState<StudentNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(true);

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [worstStudents, setWorstStudents] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);

  const [todayLessons, setTodayLessons] = useState<TodayLesson[]>([]);
  const [todayLoading, setTodayLoading] = useState(true);

  const [churnTotal, setChurnTotal] = useState(0);
  const [churnLoading, setChurnLoading] = useState(true);

  const [paymentStatus, setPaymentStatus] = useState<{ name: string; value: number }[]>([]);
  const [paymentStatusLoading, setPaymentStatusLoading] = useState(true);

  const [courseDistribution, setCourseDistribution] = useState<{ name: string; value: number }[]>([]);
  const [courseDistributionLoading, setCourseDistributionLoading] = useState(true);

  const [topTeachers, setTopTeachers] = useState<TeacherTop[]>([]);
  const [topTeachersLoading, setTopTeachersLoading] = useState(true);

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

  async function fetchNotes() {
    setNotesLoading(true);
    try {
      const { data: d } = await api.get('/api/v1/student-notes/', { params: { ordering: '-created_at', page_size: 5 } });
      setNotes(d.results ?? []);
    } catch { setNotes([]); } finally { setNotesLoading(false); }
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

  async function fetchChurn() {
    setChurnLoading(true);
    try {
      const { data: d } = await api.get('/api/v1/students/', { params: { status: 'archived', page_size: 1 } });
      setChurnTotal(d.count ?? 0);
    } catch { setChurnTotal(0); } finally { setChurnLoading(false); }
  }

  async function fetchPaymentStatus() {
    setPaymentStatusLoading(true);
    try {
      const [r1, r2, r3, r4] = await Promise.all([
        api.get('/api/v1/debts/', { params: { status: 'paid', page_size: 1 } }),
        api.get('/api/v1/debts/', { params: { status: 'partial', page_size: 1 } }),
        api.get('/api/v1/debts/', { params: { status: 'unpaid', page_size: 1 } }),
        api.get('/api/v1/debts/', { params: { status: 'overdue', page_size: 1 } }),
      ]);
      setPaymentStatus([
        { name: tc('paid'), value: r1.data.count ?? 0 },
        { name: tc('partial'), value: r2.data.count ?? 0 },
        { name: tc('unpaid'), value: r3.data.count ?? 0 },
        { name: tc('overdue'), value: r4.data.count ?? 0 },
      ]);
    } catch { setPaymentStatus([]); } finally { setPaymentStatusLoading(false); }
  }

  async function fetchCourseDistribution() {
    setCourseDistributionLoading(true);
    try {
      const { data: d } = await api.get('/api/v1/groups/', { params: { status: 'active', page_size: 100 } });
      const groups: Array<{ course?: { name: string }; students_count?: number }> = d.results ?? [];
      const map = new Map<string, number>();
      groups.forEach((g) => {
        const name = g.course?.name ?? 'Other';
        map.set(name, (map.get(name) ?? 0) + (g.students_count ?? 0));
      });
      setCourseDistribution(
        Array.from(map.entries())
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 6),
      );
    } catch { setCourseDistribution([]); } finally { setCourseDistributionLoading(false); }
  }

  async function fetchTopTeachers() {
    setTopTeachersLoading(true);
    try {
      const { data: d } = await api.get('/api/v1/teachers/', { params: { page_size: 10 } });
      const teachers: TeacherTop[] = d.results ?? [];
      teachers.sort((a, b) => (b.students_count ?? 0) - (a.students_count ?? 0));
      setTopTeachers(teachers);
    } catch { setTopTeachers([]); } finally { setTopTeachersLoading(false); }
  }

  useEffect(() => {
    fetchData();
    fetchNotes();
    fetchLeaderboard();
    fetchTodayLessons();
    fetchChurn();
    fetchPaymentStatus();
    fetchCourseDistribution();
    fetchTopTeachers();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

      {/* Churn + Payment Status + Course Distribution */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Churn */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
            <UserMinus className="w-4 h-4 text-rose-400" />
            {t('churnTitle')}
          </h2>
          <p className="text-xs text-gray-400 mb-4">{t('last30days')}</p>
          {churnLoading ? (
            <Skeleton className="h-20 w-full rounded-lg" />
          ) : (
            <div className="flex flex-col items-center justify-center py-4">
              <span className="text-5xl font-bold text-rose-500">{churnTotal}</span>
              <span className="text-xs text-gray-400 mt-2">{tc('archived')}</span>
            </div>
          )}
        </div>

        {/* Payment Status Donut */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-blue-400" />
            {t('paymentStatus')}
          </h2>
          {paymentStatusLoading ? (
            <Skeleton className="h-44 w-full rounded-lg" />
          ) : paymentStatus.length === 0 || paymentStatus.every((p) => p.value === 0) ? (
            <p className="text-sm text-gray-400 text-center py-8">{tc('noData')}</p>
          ) : (
            <div className="flex flex-col items-center">
              <PieChart width={150} height={150}>
                <Pie data={paymentStatus} cx="50%" cy="50%" innerRadius={45} outerRadius={68} dataKey="value" paddingAngle={2}>
                  {paymentStatus.map((_, i) => <Cell key={i} fill={DONUT_COLORS_PAYMENT[i % DONUT_COLORS_PAYMENT.length]} />)}
                </Pie>
                {/* @ts-expect-error recharts ValueType */}
                <Tooltip formatter={(v: number) => [v, '']} />
              </PieChart>
              <div className="space-y-1.5 w-full mt-2">
                {paymentStatus.map((p, i) => (
                  <div key={p.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: DONUT_COLORS_PAYMENT[i % DONUT_COLORS_PAYMENT.length] }} />
                      <span className="text-gray-600">{p.name}</span>
                    </div>
                    <span className="font-semibold text-gray-800">{p.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Course Distribution Donut */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-violet-400" />
            {t('courseDistribution')}
          </h2>
          {courseDistributionLoading ? (
            <Skeleton className="h-44 w-full rounded-lg" />
          ) : courseDistribution.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">{tc('noData')}</p>
          ) : (
            <div className="flex flex-col items-center">
              <PieChart width={150} height={150}>
                <Pie data={courseDistribution} cx="50%" cy="50%" innerRadius={45} outerRadius={68} dataKey="value" paddingAngle={2}>
                  {courseDistribution.map((_, i) => <Cell key={i} fill={DONUT_COLORS_COURSE[i % DONUT_COLORS_COURSE.length]} />)}
                </Pie>
                {/* @ts-expect-error recharts ValueType */}
                <Tooltip formatter={(v: number) => [v, '']} />
              </PieChart>
              <div className="space-y-1.5 w-full mt-2">
                {courseDistribution.map((c, i) => (
                  <div key={c.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: DONUT_COLORS_COURSE[i % DONUT_COLORS_COURSE.length] }} />
                      <span className="text-gray-600 truncate">{c.name}</span>
                    </div>
                    <span className="font-semibold text-gray-800 ml-2">{c.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Best + Worst Students */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Top 10 Best */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
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
                <div key={entry.student_id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                  <span className="text-base w-6 flex-shrink-0 text-center">{RANK_BADGES[i] ?? `${i + 1}`}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{entry.student_name}</p>
                    {entry.group_name && <p className="text-xs text-gray-400">{entry.group_name}</p>}
                  </div>
                  <span className="text-sm font-bold text-blue-600 flex-shrink-0">{entry.avg_score.toFixed(1)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top 10 Worst */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
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
                <div key={entry.student_id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                  <span className="text-sm w-6 flex-shrink-0 text-center text-gray-400 font-mono">{i + 1}.</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{entry.student_name}</p>
                    {entry.group_name && <p className="text-xs text-gray-400">{entry.group_name}</p>}
                  </div>
                  <span className="text-sm font-bold text-rose-500 flex-shrink-0">{entry.avg_score.toFixed(1)}</span>
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
        {topTeachersLoading ? (
          <div className="space-y-2">{Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : topTeachers.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">{tc('noData')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {[tc('teacher'), t('activeGroups'), tc('student'), t('attendanceRate')].map((h) => (
                    <th key={h} className="text-left pb-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide pr-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {topTeachers.map((teacher) => (
                  <tr key={teacher.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-[10px] font-bold text-violet-700">
                            {teacher.first_name[0]}{teacher.last_name[0]}
                          </span>
                        </div>
                        <span className="font-medium text-gray-800 whitespace-nowrap">
                          {teacher.first_name} {teacher.last_name}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 text-gray-600">{teacher.groups_count ?? '—'}</td>
                    <td className="py-2.5 pr-3 text-gray-600">{teacher.students_count ?? '—'}</td>
                    <td className="py-2.5 text-gray-500">
                      {teacher.attendance_rate != null ? `${teacher.attendance_rate}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Notes */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-gray-400" />
          {t('recentNotes')}
        </h2>
        {notesLoading ? (
          <div className="space-y-4">
            {Array(3).fill(0).map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-1/3" />
                  <Skeleton className="h-4 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10">
            <MessageSquare className="w-8 h-8 text-gray-200 mb-2" />
            <p className="text-sm text-gray-400">{t('noNotes')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {notes.map((n) => {
              const authorName = n.author_name ?? (n.author ? `${n.author.first_name} ${n.author.last_name}` : tc('noData'));
              const noteText = n.note ?? n.text ?? '';
              const initials = authorName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
              return (
                <div key={n.id} className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-blue-600">{initials}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-gray-700">{authorName}</span>
                      <span className="text-xs text-gray-400">{timeAgo(n.created_at, (key, params) => t(key as Parameters<typeof t>[0], params as Parameters<typeof t>[1]))}</span>
                    </div>
                    <p className="text-sm text-gray-600 mt-0.5 line-clamp-2">{noteText}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
