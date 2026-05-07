'use client';

import { useEffect, useState, useRef } from 'react';
import {
  Users, UsersRound, CreditCard, AlertCircle, MessageSquare, GraduationCap,
} from 'lucide-react';
import Link from 'next/link';
import { useLocale } from 'next-intl';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import toast, { Toaster } from 'react-hot-toast';
import StatCard from '@/components/stat-card';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import api from '@/lib/axios';
import { formatCurrency, cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────

interface RevenuePoint { month: string; revenue: number; }
interface Debtor { id: string; student_name: string; amount: number; due_date: string; }
interface TeacherStat { id: string; name: string; groups_count: number; students_count: number; }

interface DashboardData {
  total_students?: number; active_students?: number; students_count?: number;
  active_groups?: number; groups_count?: number;
  monthly_revenue?: number; total_revenue?: number;
  debtors_count?: number; total_debtors?: number;
  teachers_count?: number;
  revenue_chart?: RevenuePoint[];
  top_debtors?: Debtor[];
  teacher_stats?: TeacherStat[];
}

interface StudentNote {
  id: string;
  author_name?: string;
  author?: { first_name: string; last_name: string };
  student_name?: string;
  student?: { first_name: string; last_name: string };
  note?: string;
  text?: string;
  created_at: string;
}

interface LeaderboardEntry {
  student_id: string;
  student_name: string;
  avg_score: number;
  group_name?: string;
}

interface ActiveGroup {
  id: string;
  name: string;
  teacher?: { first_name: string; last_name: string };
  students_count?: number;
  course?: { name: string };
  schedule?: string;
}

interface Course { id: string; name: string; }
interface Teacher { id: string; first_name: string; last_name: string; }
interface Student { id: string; first_name: string; last_name: string; phone: string; }
interface Group { id: string; name: string; }

const DAYS_LIST = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sha', 'Ya'];

function buildSchedule(days: string[], time: string) {
  return [days.join(','), time].filter(Boolean).join(' ');
}

// ── Helpers ────────────────────────────────────────────────────────────────

function resolve(data: DashboardData) {
  return {
    students: data.active_students ?? data.total_students ?? data.students_count ?? 0,
    groups: data.active_groups ?? data.groups_count ?? 0,
    revenue: data.monthly_revenue ?? data.total_revenue ?? 0,
    debtors: data.debtors_count ?? data.total_debtors ?? 0,
    teachers: data.teachers_count ?? 0,
    chart: data.revenue_chart ?? [],
    topDebtors: data.top_debtors ?? [],
    teacherStats: data.teacher_stats ?? [],
  };
}

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return 'hozirgina';
  if (diff < 3600) return `${Math.floor(diff / 60)} daqiqa oldin`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} soat oldin`;
  return `${Math.floor(diff / 86400)} kun oldin`;
}

const RANK_BADGES = ['🥇', '🥈', '🥉', '4-', '5-'];

function CardSkeleton() { return <Skeleton className="h-28 w-full rounded" />; }

// ── Main Component ─────────────────────────────────────────────────────────

export default function DashboardPage() {
  const locale = useLocale();

  // Dashboard summary
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Section A — notes
  const [notes, setNotes] = useState<StudentNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(true);

  // Section B — leaderboard
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);

  // Section C — active groups
  const [activeGroups, setActiveGroups] = useState<ActiveGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);

  // Quick action: student add
  const [showStudentAdd, setShowStudentAdd] = useState(false);
  const [savingStudent, setSavingStudent] = useState(false);
  const [studentForm, setStudentForm] = useState({
    first_name: '', last_name: '', phone: '', course_id: '',
  });
  const [courses, setCourses] = useState<Course[]>([]);

  // Quick action: payment add
  const [showPaymentAdd, setShowPaymentAdd] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [paymentStudentSearch, setPaymentStudentSearch] = useState('');
  const [paymentStudentResults, setPaymentStudentResults] = useState<Student[]>([]);
  const [selectedPaymentStudent, setSelectedPaymentStudent] = useState<Student | null>(null);
  const [studentGroups, setStudentGroups] = useState<Group[]>([]);
  const [paymentForm, setPaymentForm] = useState({ group_id: '', amount: '', payment_type: 'cash', note: '' });

  // Quick action: group add
  const [showGroupAdd, setShowGroupAdd] = useState(false);
  const [savingGroup, setSavingGroup] = useState(false);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [groupForm, setGroupForm] = useState({
    course_id: '', teacher_id: '', gender_type: '', days: [] as string[], time: '', room: '',
  });

  // Quick action: SMS
  const [showSms, setShowSms] = useState(false);
  const [savingSms, setSavingSms] = useState(false);
  const [smsForm, setSmsForm] = useState({ phone: '', message: '' });

  const paymentDebounce = useRef<ReturnType<typeof setTimeout>>();

  // ── Fetch functions ────────────────────────────────────────────────────

  async function fetchData() {
    setLoading(true);
    setError(false);
    try {
      const res = await api.get('/api/v1/dashboard/summary/').catch(() => null);
      setData(res?.data ?? {});
    } catch {
      setError(true);
      toast.error('Dashboard ma\'lumotlarini yuklashda xatolik');
    } finally {
      setLoading(false);
    }
  }

  async function fetchNotes() {
    setNotesLoading(true);
    try {
      const { data: d } = await api.get('/api/v1/student-notes/', {
        params: { ordering: '-created_at', page_size: 5 },
      });
      setNotes(d.results ?? []);
    } catch {
      setNotes([]);
    } finally {
      setNotesLoading(false);
    }
  }

  async function fetchLeaderboard() {
    setLeaderboardLoading(true);
    try {
      const { data: d } = await api.get('/api/v1/grades/', { params: { page_size: 100 } });
      const results: Array<{ student?: { id: string; first_name: string; last_name: string }; student_id?: string; student_name?: string; score?: number; grade?: number; group?: { name: string } }> = d.results ?? [];
      const map = new Map<string, { name: string; scores: number[]; group?: string }>();
      results.forEach((r) => {
        const sid = r.student?.id ?? r.student_id ?? '';
        const name = r.student
          ? `${r.student.first_name} ${r.student.last_name}`
          : r.student_name ?? '';
        const score = r.score ?? r.grade ?? 0;
        if (!map.has(sid)) map.set(sid, { name, scores: [], group: r.group?.name });
        map.get(sid)!.scores.push(score);
      });
      const entries: LeaderboardEntry[] = Array.from(map.entries())
        .map(([id, v]) => ({
          student_id: id,
          student_name: v.name,
          avg_score: v.scores.reduce((a, b) => a + b, 0) / v.scores.length,
          group_name: v.group,
        }))
        .sort((a, b) => b.avg_score - a.avg_score)
        .slice(0, 5);
      setLeaderboard(entries);
    } catch {
      setLeaderboard([]);
    } finally {
      setLeaderboardLoading(false);
    }
  }

  async function fetchActiveGroups() {
    setGroupsLoading(true);
    try {
      const { data: d } = await api.get('/api/v1/groups/', {
        params: { status: 'active', page_size: 5 },
      });
      setActiveGroups(d.results ?? []);
    } catch {
      setActiveGroups([]);
    } finally {
      setGroupsLoading(false);
    }
  }

  async function fetchCourses() {
    try {
      const { data: d } = await api.get('/api/v1/courses/?page_size=100');
      setCourses(d.results ?? []);
    } catch {}
  }

  async function fetchTeachers() {
    try {
      const { data: d } = await api.get('/api/v1/teachers/?page_size=100');
      setTeachers(d.results ?? []);
    } catch {}
  }

  useEffect(() => {
    fetchData();
    fetchNotes();
    fetchLeaderboard();
    fetchActiveGroups();
    fetchCourses();
    fetchTeachers();
  }, []);

  // Payment student search debounce
  useEffect(() => {
    clearTimeout(paymentDebounce.current);
    if (!paymentStudentSearch) { setPaymentStudentResults([]); return; }
    paymentDebounce.current = setTimeout(async () => {
      try {
        const { data: d } = await api.get('/api/v1/students/', {
          params: { search: paymentStudentSearch, page_size: 8 },
        });
        setPaymentStudentResults(d.results ?? []);
      } catch {}
    }, 300);
    return () => clearTimeout(paymentDebounce.current);
  }, [paymentStudentSearch]);

  useEffect(() => {
    if (!selectedPaymentStudent) { setStudentGroups([]); return; }
    api.get('/api/v1/groups/', { params: { student: selectedPaymentStudent.id } })
      .then(({ data: d }) => setStudentGroups(d.results ?? []))
      .catch(() => setStudentGroups([]));
  }, [selectedPaymentStudent]);

  // ── Handlers ───────────────────────────────────────────────────────────

  async function handleStudentAdd(e: React.FormEvent) {
    e.preventDefault();
    setSavingStudent(true);
    try {
      await api.post('/api/v1/students/', {
        first_name: studentForm.first_name,
        last_name: studentForm.last_name,
        phone: '+998' + studentForm.phone.replace(/\D/g, ''),
        status: 'pending',
        course_id: studentForm.course_id || null,
      });
      toast.success('O\'quvchi qo\'shildi');
      setShowStudentAdd(false);
      setStudentForm({ first_name: '', last_name: '', phone: '', course_id: '' });
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Xatolik yuz berdi');
    } finally {
      setSavingStudent(false);
    }
  }

  async function handlePaymentAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPaymentStudent) { toast.error('O\'quvchini tanlang'); return; }
    setSavingPayment(true);
    try {
      await api.post('/api/v1/payments/', {
        student_id: selectedPaymentStudent.id,
        ...(paymentForm.group_id ? { group_id: paymentForm.group_id } : {}),
        amount: parseFloat(paymentForm.amount),
        payment_type: paymentForm.payment_type,
        ...(paymentForm.note ? { note: paymentForm.note } : {}),
      });
      toast.success('To\'lov kiritildi');
      setShowPaymentAdd(false);
      setSelectedPaymentStudent(null);
      setPaymentStudentSearch('');
      setPaymentForm({ group_id: '', amount: '', payment_type: 'cash', note: '' });
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Xatolik yuz berdi');
    } finally {
      setSavingPayment(false);
    }
  }

  async function handleGroupAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!groupForm.gender_type) { toast.error('Guruh turini tanlang'); return; }
    setSavingGroup(true);
    try {
      const schedule = buildSchedule(groupForm.days, groupForm.time);
      await api.post('/api/v1/groups/', {
        course_id: groupForm.course_id,
        teacher_id: groupForm.teacher_id,
        gender_type: groupForm.gender_type,
        ...(schedule ? { schedule } : {}),
        ...(groupForm.room ? { room: groupForm.room } : {}),
      });
      toast.success('Guruh yaratildi');
      setShowGroupAdd(false);
      setGroupForm({ course_id: '', teacher_id: '', gender_type: '', days: [], time: '', room: '' });
      fetchActiveGroups();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Xatolik yuz berdi');
    } finally {
      setSavingGroup(false);
    }
  }

  async function handleSmsSend(e: React.FormEvent) {
    e.preventDefault();
    setSavingSms(true);
    try {
      await api.post('/api/v1/notifications/send/', {
        phone: '+998' + smsForm.phone.replace(/\D/g, ''),
        message: smsForm.message,
      });
      toast.success('SMS yuborildi');
      setShowSms(false);
      setSmsForm({ phone: '', message: '' });
    } catch {
      toast.error("Bu funksiya tez orada qo'shiladi");
      setShowSms(false);
    } finally {
      setSavingSms(false);
    }
  }

  function toggleDay(day: string) {
    setGroupForm((f) => ({
      ...f,
      days: f.days.includes(day) ? f.days.filter((d) => d !== day) : [...f.days, day],
    }));
  }

  const d = data ? resolve(data) : null;

  const stats = d ? [
    { label: 'Faol o\'quvchilar', value: d.students, icon: Users },
    { label: 'Faol guruhlar', value: d.groups, icon: UsersRound },
    { label: 'Bu oy tushum', value: formatCurrency(d.revenue), icon: CreditCard },
    { label: 'Qarzdorlar', value: d.debtors, icon: AlertCircle, variant: 'danger' as const },
    { label: 'O\'qituvchilar', value: d.teachers, icon: GraduationCap, variant: 'success' as const },
  ] : [];

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        {loading
          ? Array(5).fill(0).map((_, i) => <CardSkeleton key={i} />)
          : stats.map((s) => <StatCard key={s.label} {...s} />)}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded flex items-center justify-between">
          <span>Xatolik yuz berdi</span>
          <button onClick={fetchData} className="underline font-medium">Qayta urinish</button>
        </div>
      )}

      {/* Section D — Quick Actions */}
      <div className="flex flex-wrap gap-3">
        {[
          { label: "+ O'quvchi qo'shish", onClick: () => setShowStudentAdd(true) },
          { label: '+ To\'lov kiritish', onClick: () => setShowPaymentAdd(true) },
          { label: '+ Guruh yaratish', onClick: () => setShowGroupAdd(true) },
          { label: '📱 SMS yuborish', onClick: () => setShowSms(true) },
        ].map(({ label, onClick }) => (
          <button
            key={label}
            onClick={onClick}
            className="flex items-center gap-2 px-4 py-2 border border-blue-600 text-blue-600 text-sm font-medium rounded-lg hover:bg-blue-50 transition-colors"
          >
            {label}
          </button>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 bg-white rounded border border-gray-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Daromad dinamikasi</h2>
          {loading ? <Skeleton className="h-52 w-full" /> : (
            <ResponsiveContainer width="100%" height={210}>
              <AreaChart data={d?.chart ?? []}>
                <defs>
                  <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563EB" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ border: '1px solid #E5E7EB', borderRadius: 4, fontSize: 12 }}
                  // @ts-expect-error recharts ValueType
                  formatter={(v: number) => [formatCurrency(v), 'Daromad']}
                />
                <Area type="monotone" dataKey="revenue" stroke="#2563EB" strokeWidth={2}
                  fill="url(#revenueGrad)" dot={{ fill: '#2563EB', r: 3 }} activeDot={{ r: 5 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded border border-gray-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Eng ko&apos;p qarzdorlar</h2>
          {loading ? (
            <div className="space-y-3">{Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (d?.topDebtors?.length ?? 0) === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Ma&apos;lumot yo&apos;q</p>
          ) : (
            <div className="space-y-3">
              {(d?.topDebtors ?? []).map((debt) => (
                <div key={debt.id} className="flex items-center justify-between py-1 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{debt.student_name}</p>
                    <p className="text-xs text-gray-400">{debt.due_date}</p>
                  </div>
                  <span className="text-sm font-semibold text-red-600">{formatCurrency(debt.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Teacher stats */}
      <div className="bg-white rounded border border-gray-200 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">O&apos;qituvchilar statistikasi</h2>
        {loading ? (
          <div className="space-y-2">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : (d?.teacherStats?.length ?? 0) === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">Ma&apos;lumot yo&apos;q</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 text-xs font-medium text-gray-500">O&apos;qituvchi</th>
                <th className="text-right py-2 text-xs font-medium text-gray-500">Guruhlar</th>
                <th className="text-right py-2 text-xs font-medium text-gray-500">O&apos;quvchilar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(d?.teacherStats ?? []).map((ts) => (
                <tr key={ts.id} className="hover:bg-gray-50">
                  <td className="py-2.5 font-medium text-gray-900">{ts.name}</td>
                  <td className="py-2.5 text-right text-gray-600">{ts.groups_count}</td>
                  <td className="py-2.5 text-right text-gray-600">{ts.students_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Section C — Active Groups */}
      <div className="bg-white rounded border border-gray-200 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Faol guruhlar</h2>
        {groupsLoading ? (
          <div className="space-y-2">{Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : activeGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10">
            <UsersRound className="w-10 h-10 text-gray-300 mb-2" />
            <p className="text-sm font-medium text-gray-500">Ma&apos;lumot topilmadi</p>
            <p className="text-xs text-gray-400 mt-0.5">Hali faol guruhlar yo&apos;q</p>
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  {['Guruh', 'O\'qituvchi', 'O\'quvchilar', 'Kurs', 'Jadval'].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {activeGroups.map((g) => (
                  <tr
                    key={g.id}
                    onClick={() => window.location.href = `/${locale}/groups`}
                    className="hover:bg-blue-50 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3 font-bold text-gray-900">{g.name}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {g.teacher ? `${g.teacher.first_name} ${g.teacher.last_name}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{g.students_count ?? 0}</td>
                    <td className="px-4 py-3 text-gray-600">{g.course?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{g.schedule ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="pt-3 border-t border-gray-100 mt-2">
              <Link href={`/${locale}/groups`} className="text-sm text-blue-600 hover:underline font-medium">
                Barchasini ko&apos;rish →
              </Link>
            </div>
          </>
        )}
      </div>

      {/* Bottom row: Section A (Notes) + Section B (Leaderboard) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Section A — Recent Student Notes */}
        <div className="bg-white rounded border border-gray-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-gray-400" />
            So&apos;nggi izohlar
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
              <MessageSquare className="w-10 h-10 text-gray-300 mb-2" />
              <p className="text-sm font-medium text-gray-500">Ma&apos;lumot topilmadi</p>
              <p className="text-xs text-gray-400 mt-0.5">Hozircha izohlar yo&apos;q</p>
            </div>
          ) : (
            <div className="space-y-4">
              {notes.map((n) => {
                const authorName = n.author_name
                  ?? (n.author ? `${n.author.first_name} ${n.author.last_name}` : 'Noma\'lum');
                const noteText = n.note ?? n.text ?? '';
                const initials = authorName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
                return (
                  <div key={n.id} className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-semibold text-blue-600">{initials}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-gray-700">{authorName}</span>
                        <span className="text-xs text-gray-400">{timeAgo(n.created_at)}</span>
                      </div>
                      <p className="text-sm text-gray-600 mt-0.5 line-clamp-2">{noteText}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Section B — Top Students Leaderboard */}
        <div className="bg-white rounded border border-gray-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">
            🏆 Top o&apos;quvchilar
          </h2>
          {leaderboardLoading ? (
            <div className="space-y-2">
              {Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : leaderboard.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10">
              <Users className="w-10 h-10 text-gray-300 mb-2" />
              <p className="text-sm font-medium text-gray-500">Ma&apos;lumot topilmadi</p>
              <p className="text-xs text-gray-400 mt-0.5">Hali baholar kiritilmagan</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  {['#', 'O\'quvchi', 'O\'rt. ball', 'Guruh'].map((h) => (
                    <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {leaderboard.map((entry, i) => (
                  <tr key={entry.student_id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-3 text-lg">{RANK_BADGES[i]}</td>
                    <td className="px-3 py-3 font-medium text-gray-900">{entry.student_name}</td>
                    <td className="px-3 py-3">
                      <span className="font-bold text-blue-600">{entry.avg_score.toFixed(1)}</span>
                    </td>
                    <td className="px-3 py-3 text-gray-500 text-xs">{entry.group_name ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ─── Quick Action Dialogs ─────────────────────────────────────────── */}

      {/* Student Add */}
      <Dialog open={showStudentAdd} onOpenChange={setShowStudentAdd}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Yangi o&apos;quvchi qo&apos;shish</DialogTitle></DialogHeader>
          <form onSubmit={handleStudentAdd} className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ism <span className="text-red-500">*</span></label>
                <input
                  value={studentForm.first_name}
                  onChange={(e) => setStudentForm((f) => ({ ...f, first_name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Familiya <span className="text-red-500">*</span></label>
                <input
                  value={studentForm.last_name}
                  onChange={(e) => setStudentForm((f) => ({ ...f, last_name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telefon <span className="text-red-500">*</span></label>
              <div className="flex">
                <span className="inline-flex items-center px-3 border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm rounded-l">+998</span>
                <input
                  type="tel"
                  value={studentForm.phone}
                  onChange={(e) => setStudentForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 9) }))}
                  placeholder="XX XXX XX XX"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-r text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kurs (ixtiyoriy)</label>
              <select
                value={studentForm.course_id}
                onChange={(e) => setStudentForm((f) => ({ ...f, course_id: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Tanlang</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowStudentAdd(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50">
                Bekor qilish
              </button>
              <button type="submit" disabled={savingStudent}
                className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-60">
                {savingStudent ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Payment Add */}
      <Dialog open={showPaymentAdd} onOpenChange={(v) => {
        setShowPaymentAdd(v);
        if (!v) { setSelectedPaymentStudent(null); setPaymentStudentSearch(''); setPaymentForm({ group_id: '', amount: '', payment_type: 'cash', note: '' }); }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Yangi to&apos;lov kiritish</DialogTitle></DialogHeader>
          <form onSubmit={handlePaymentAdd} className="space-y-4 mt-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">O&apos;quvchi</label>
              {selectedPaymentStudent ? (
                <div className="flex items-center justify-between px-3 py-2 border border-blue-300 bg-blue-50 rounded text-sm">
                  <span className="font-medium text-blue-800">
                    {selectedPaymentStudent.first_name} {selectedPaymentStudent.last_name}
                  </span>
                  <button type="button"
                    onClick={() => { setSelectedPaymentStudent(null); setPaymentStudentSearch(''); }}
                    className="text-blue-500 hover:text-blue-700 text-xs">✕</button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    type="text"
                    value={paymentStudentSearch}
                    onChange={(e) => setPaymentStudentSearch(e.target.value)}
                    placeholder="Ism yoki telefon bo'yicha qidirish..."
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {paymentStudentResults.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded shadow-md max-h-48 overflow-y-auto">
                      {paymentStudentResults.map((s) => (
                        <button key={s.id} type="button"
                          onClick={() => { setSelectedPaymentStudent(s); setPaymentStudentSearch(''); setPaymentStudentResults([]); }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">
                          {s.first_name} {s.last_name} — {s.phone}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            {studentGroups.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Guruh</label>
                <select value={paymentForm.group_id}
                  onChange={(e) => setPaymentForm((f) => ({ ...f, group_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Tanlang (ixtiyoriy)</option>
                  {studentGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Summa (so&apos;m) <span className="text-red-500">*</span></label>
              <input type="number" value={paymentForm.amount}
                onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required placeholder="0" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">To&apos;lov turi</label>
              <select value={paymentForm.payment_type}
                onChange={(e) => setPaymentForm((f) => ({ ...f, payment_type: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="cash">Naqd</option>
                <option value="card">Karta</option>
                <option value="transfer">O&apos;tkazma</option>
              </select>
            </div>
            <p className="text-xs text-gray-400">* To&apos;lovlar o&apos;chirilmaydi va tahrirlanmaydi</p>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowPaymentAdd(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50">
                Bekor qilish
              </button>
              <button type="submit" disabled={savingPayment}
                className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-60">
                {savingPayment ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Group Add */}
      <Dialog open={showGroupAdd} onOpenChange={(v) => {
        setShowGroupAdd(v);
        if (!v) setGroupForm({ course_id: '', teacher_id: '', gender_type: '', days: [], time: '', room: '' });
      }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Yangi guruh yaratish</DialogTitle></DialogHeader>
          <form onSubmit={handleGroupAdd} className="space-y-4 mt-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kurs <span className="text-red-500">*</span></label>
              <select value={groupForm.course_id}
                onChange={(e) => setGroupForm((f) => ({ ...f, course_id: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required>
                <option value="">Tanlang</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">O&apos;qituvchi <span className="text-red-500">*</span></label>
              <select value={groupForm.teacher_id}
                onChange={(e) => setGroupForm((f) => ({ ...f, teacher_id: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required>
                <option value="">Tanlang</option>
                {teachers.map((t) => <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Guruh turi <span className="text-red-500">*</span>
                {!groupForm.gender_type && <span className="ml-2 text-xs text-orange-500 font-normal">— tanlash majburiy</span>}
              </label>
              <div className="flex gap-2">
                {[
                  { value: 'a', label: 'Erkaklar', cls: 'border-blue-300 bg-blue-50 text-blue-700' },
                  { value: 'b', label: 'Ayollar', cls: 'border-pink-300 bg-pink-50 text-pink-700' },
                  { value: 'c', label: 'Aralash', cls: 'border-purple-300 bg-purple-50 text-purple-700' },
                ].map(({ value, label, cls }) => (
                  <button key={value} type="button"
                    onClick={() => setGroupForm((f) => ({ ...f, gender_type: value }))}
                    className={cn('flex-1 py-2 text-xs font-medium border rounded transition-colors',
                      groupForm.gender_type === value ? cls : 'border-gray-300 text-gray-600 hover:bg-gray-50')}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Dars kunlari</label>
              <div className="flex gap-1.5 flex-wrap">
                {DAYS_LIST.map((day) => (
                  <button key={day} type="button" onClick={() => toggleDay(day)}
                    className={cn('px-3 py-1.5 text-xs font-medium border rounded transition-colors',
                      groupForm.days.includes(day)
                        ? 'border-blue-500 bg-blue-600 text-white'
                        : 'border-gray-300 text-gray-600 hover:bg-gray-50')}>
                    {day}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Dars vaqti</label>
              <input type="time" value={groupForm.time}
                onChange={(e) => setGroupForm((f) => ({ ...f, time: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            {(groupForm.days.length > 0 || groupForm.time) && (
              <div className="px-3 py-2 bg-gray-50 rounded text-xs text-gray-600">
                Jadval: <span className="font-medium">{buildSchedule(groupForm.days, groupForm.time) || '—'}</span>
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowGroupAdd(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50">
                Bekor qilish
              </button>
              <button type="submit" disabled={savingGroup}
                className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-60">
                {savingGroup ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* SMS Send */}
      <Dialog open={showSms} onOpenChange={setShowSms}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>📱 SMS yuborish</DialogTitle></DialogHeader>
          <form onSubmit={handleSmsSend} className="space-y-4 mt-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telefon <span className="text-red-500">*</span></label>
              <div className="flex">
                <span className="inline-flex items-center px-3 border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm rounded-l">+998</span>
                <input type="tel" value={smsForm.phone}
                  onChange={(e) => setSmsForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 9) }))}
                  placeholder="XX XXX XX XX"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-r text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Xabar <span className="text-red-500">*</span></label>
              <textarea value={smsForm.message}
                onChange={(e) => setSmsForm((f) => ({ ...f, message: e.target.value }))}
                rows={4} required
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="SMS matni..." />
              <p className="text-xs text-gray-400 mt-1">{smsForm.message.length} belgi</p>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowSms(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50">
                Bekor qilish
              </button>
              <button type="submit" disabled={savingSms}
                className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-60">
                {savingSms ? 'Yuborilmoqda...' : 'Yuborish'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
