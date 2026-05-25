'use client';

import { useEffect, useState, useRef } from 'react';
import {
  Users, UsersRound, CreditCard, AlertCircle, MessageSquare, GraduationCap,
  Users2, UserPlus, TrendingUp, ArrowRight,
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
    students: data.active_students || data.students_count || data.total_students || (data as any).active_students_count || (data as any).students || 0,
    groups: data.active_groups || data.groups_count || (data as any).groups || 0,
    revenue: data.monthly_revenue || data.total_revenue || (data as any).revenue || 0,
    debtors: data.debtors_count || data.total_debtors || (data as any).debtors || 0,
    teachers: data.teachers_count || (data as any).teachers || 0,
    chart: data.revenue_chart || [],
    topDebtors: data.top_debtors || [],
    teacherStats: data.teacher_stats || [],
  };
}

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return 'hozirgina';
  if (diff < 3600) return `${Math.floor(diff / 60)} daqiqa oldin`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} soat oldin`;
  return `${Math.floor(diff / 86400)} kun oldin`;
}

function getInitials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

const RANK_BADGES = ['🥇', '🥈', '🥉', '4-', '5-'];
const DEBTOR_COLORS = [
  'bg-red-100 text-red-700',
  'bg-orange-100 text-orange-700',
  'bg-rose-100 text-rose-700',
  'bg-pink-100 text-pink-700',
  'bg-amber-100 text-amber-700',
];

function CardSkeleton() { return <Skeleton className="h-28 w-full rounded-xl" />; }

function FunnelWidget({ locale }: { locale: string }) {
  const [counts, setCounts] = useState<{ pending: number; trial: number; active: number } | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const { data } = await import('@/lib/axios').then((m) => m.default.get('/api/v1/leads/?page_size=1'));
        const pending = data.count ?? 0;
        const { data: d2 } = await import('@/lib/axios').then((m) => m.default.get('/api/v1/leads/?status=trial&page_size=1'));
        const trial = d2.count ?? 0;
        const { data: d3 } = await import('@/lib/axios').then((m) => m.default.get('/api/v1/students/?status=active&page_size=1'));
        const active = d3.count ?? 0;
        setCounts({ pending, trial, active });
      } catch {
        setCounts(null);
      }
    }
    load();
  }, []);

  if (!counts) return <Skeleton className="h-16 w-full rounded-lg" />;

  const total = counts.pending + counts.trial + counts.active || 1;
  const steps = [
    { label: 'Leadlar', count: counts.pending + counts.trial, color: 'bg-amber-400', pct: Math.round((counts.pending + counts.trial) / total * 100), href: `/${locale}/leads` },
    { label: 'Sinov', count: counts.trial, color: 'bg-blue-400', pct: Math.round(counts.trial / total * 100), href: `/${locale}/leads?status=trial` },
    { label: 'Faol talaba', count: counts.active, color: 'bg-emerald-500', pct: Math.round(counts.active / total * 100), href: `/${locale}/students` },
  ];

  return (
    <div className="flex items-end gap-4">
      {steps.map((s, i) => (
        <Link key={s.label} href={s.href} className="flex-1 group">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-gray-600">{s.label}</span>
            <span className="text-sm font-bold text-gray-800">{s.count}</span>
          </div>
          <div className="h-2.5 w-full bg-white/60 rounded-full overflow-hidden">
            <div className={cn('h-full rounded-full transition-all duration-500', s.color)} style={{ width: `${s.pct}%` }} />
          </div>
          {i < steps.length - 1 && (
            <p className="text-[10px] text-gray-400 mt-1 text-right">{s.pct}%</p>
          )}
        </Link>
      ))}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function DashboardPage() {
  const locale = useLocale();

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [notes, setNotes] = useState<StudentNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(true);

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);

  const [activeGroups, setActiveGroups] = useState<ActiveGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);

  const [showStudentAdd, setShowStudentAdd] = useState(false);
  const [savingStudent, setSavingStudent] = useState(false);
  const [studentForm, setStudentForm] = useState({ first_name: '', last_name: '', phone: '', course_id: '' });
  const [courses, setCourses] = useState<Course[]>([]);

  const [showPaymentAdd, setShowPaymentAdd] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [paymentStudentSearch, setPaymentStudentSearch] = useState('');
  const [paymentStudentResults, setPaymentStudentResults] = useState<Student[]>([]);
  const [selectedPaymentStudent, setSelectedPaymentStudent] = useState<Student | null>(null);
  const [studentGroups, setStudentGroups] = useState<Group[]>([]);
  const [paymentForm, setPaymentForm] = useState({ group_id: '', amount: '', payment_type: 'cash', note: '' });

  const [showGroupAdd, setShowGroupAdd] = useState(false);
  const [savingGroup, setSavingGroup] = useState(false);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [groupForm, setGroupForm] = useState({ course_id: '', teacher_id: '', gender_type: '', days: [] as string[], time: '', room: '' });

  const [showSms, setShowSms] = useState(false);
  const [savingSms, setSavingSms] = useState(false);
  const [smsForm, setSmsForm] = useState({ phone: '', message: '' });

  const paymentDebounce = useRef<ReturnType<typeof setTimeout>>();

  // ── Fetch ──────────────────────────────────────────────────────────────

  async function fetchData() {
    setLoading(true); setError(false);
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
        .map(([id, v]) => ({ student_id: id, student_name: v.name, avg_score: v.scores.reduce((a, b) => a + b, 0) / v.scores.length, group_name: v.group }))
        .sort((a, b) => b.avg_score - a.avg_score)
        .slice(0, 5);
      setLeaderboard(entries);
    } catch { setLeaderboard([]); } finally { setLeaderboardLoading(false); }
  }

  async function fetchActiveGroups() {
    setGroupsLoading(true);
    try {
      const { data: d } = await api.get('/api/v1/groups/', { params: { status: 'active', page_size: 5 } });
      setActiveGroups(d.results ?? []);
    } catch { setActiveGroups([]); } finally { setGroupsLoading(false); }
  }

  async function fetchCourses() {
    try { const { data: d } = await api.get('/api/v1/courses/?page_size=100'); setCourses(d.results ?? []); } catch {}
  }

  async function fetchTeachers() {
    try { const { data: d } = await api.get('/api/v1/teachers/?page_size=100'); setTeachers(d.results ?? []); } catch {}
  }

  useEffect(() => { fetchData(); fetchNotes(); fetchLeaderboard(); fetchActiveGroups(); fetchCourses(); fetchTeachers(); }, []);

  useEffect(() => {
    clearTimeout(paymentDebounce.current);
    if (!paymentStudentSearch) { setPaymentStudentResults([]); return; }
    paymentDebounce.current = setTimeout(async () => {
      try {
        const { data: d } = await api.get('/api/v1/students/', { params: { search: paymentStudentSearch, page_size: 8 } });
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
    e.preventDefault(); setSavingStudent(true);
    try {
      await api.post('/api/v1/students/', { first_name: studentForm.first_name, last_name: studentForm.last_name, phone: '+998' + studentForm.phone.replace(/\D/g, ''), status: 'pending', course_id: studentForm.course_id || null });
      toast.success('O\'quvchi qo\'shildi');
      setShowStudentAdd(false);
      setStudentForm({ first_name: '', last_name: '', phone: '', course_id: '' });
    } catch (err: any) { toast.error(err?.response?.data?.detail || 'Xatolik yuz berdi'); } finally { setSavingStudent(false); }
  }

  async function handlePaymentAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPaymentStudent) { toast.error('O\'quvchini tanlang'); return; }
    setSavingPayment(true);
    try {
      await api.post('/api/v1/payments/', { student_id: selectedPaymentStudent.id, ...(paymentForm.group_id ? { group_id: paymentForm.group_id } : {}), amount: parseFloat(paymentForm.amount), payment_type: paymentForm.payment_type, ...(paymentForm.note ? { note: paymentForm.note } : {}) });
      toast.success('To\'lov kiritildi');
      setShowPaymentAdd(false);
      setSelectedPaymentStudent(null); setPaymentStudentSearch('');
      setPaymentForm({ group_id: '', amount: '', payment_type: 'cash', note: '' });
    } catch (err: any) { toast.error(err?.response?.data?.detail || 'Xatolik yuz berdi'); } finally { setSavingPayment(false); }
  }

  async function handleGroupAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!groupForm.gender_type) { toast.error('Guruh turini tanlang'); return; }
    setSavingGroup(true);
    try {
      const schedule = buildSchedule(groupForm.days, groupForm.time);
      await api.post('/api/v1/groups/', { course_id: groupForm.course_id, teacher_id: groupForm.teacher_id, gender_type: groupForm.gender_type, ...(schedule ? { schedule } : {}), ...(groupForm.room ? { room: groupForm.room } : {}) });
      toast.success('Guruh yaratildi');
      setShowGroupAdd(false);
      setGroupForm({ course_id: '', teacher_id: '', gender_type: '', days: [], time: '', room: '' });
      fetchActiveGroups();
    } catch (err: any) { toast.error(err?.response?.data?.detail || 'Xatolik yuz berdi'); } finally { setSavingGroup(false); }
  }

  async function handleSmsSend(e: React.FormEvent) {
    e.preventDefault(); setSavingSms(true);
    try {
      await api.post('/api/v1/notifications/send/', { phone: '+998' + smsForm.phone.replace(/\D/g, ''), message: smsForm.message });
      toast.success('SMS yuborildi');
      setShowSms(false); setSmsForm({ phone: '', message: '' });
    } catch {
      toast.error("Bu funksiya tez orada qo'shiladi");
      setShowSms(false);
    } finally { setSavingSms(false); }
  }

  function toggleDay(day: string) {
    setGroupForm((f) => ({ ...f, days: f.days.includes(day) ? f.days.filter((d) => d !== day) : [...f.days, day] }));
  }

  const d = data ? resolve(data) : null;

  const stats = d ? [
    { label: 'Faol o\'quvchilar', value: d.students, icon: Users },
    { label: 'Faol guruhlar', value: d.groups, icon: Users2 },
    { label: 'Bu oy tushum', value: formatCurrency(d.revenue), icon: CreditCard },
    { label: 'Qarzdorlar', value: d.debtors, icon: AlertCircle, variant: 'danger' as const },
    { label: 'O\'qituvchilar', value: d.teachers, icon: GraduationCap, variant: 'success' as const },
  ] : [];

  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1';

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
          <span>Xatolik yuz berdi</span>
          <button onClick={fetchData} className="underline font-medium">Qayta urinish</button>
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {[
          { label: "O'quvchi qo'shish", icon: UserPlus,     onClick: () => setShowStudentAdd(true),  cls: 'bg-blue-600 hover:bg-blue-700' },
          { label: "To'lov kiritish",   icon: CreditCard,   onClick: () => setShowPaymentAdd(true),  cls: 'bg-emerald-600 hover:bg-emerald-700' },
          { label: "Guruh yaratish",    icon: Users2,        onClick: () => setShowGroupAdd(true),    cls: 'bg-violet-600 hover:bg-violet-700' },
          { label: "SMS yuborish",      icon: MessageSquare, onClick: () => setShowSms(true),         cls: 'bg-amber-500 hover:bg-amber-600' },
        ].map(({ label, icon: Icon, onClick, cls }) => (
          <button key={label} onClick={onClick}
            className={cn('flex items-center justify-center gap-2.5 px-4 py-3.5 rounded-xl text-white text-sm font-semibold transition-colors shadow-sm', cls)}>
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </button>
        ))}
      </div>

      {/* Conversion Funnel */}
      {!loading && d && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">O&apos;quvchi konversiyasi</h2>
          <FunnelWidget locale={locale} />
        </div>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Revenue chart */}
        <div className="xl:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-500" />
              Daromad dinamikasi
            </h2>
            {d?.revenue ? (
              <div className="text-right">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">Bu oy</p>
                <p className="text-sm font-bold text-blue-600">{formatCurrency(d.revenue)}</p>
              </div>
            ) : null}
          </div>
          {loading ? <Skeleton className="h-52 w-full rounded-lg" /> : (
            <ResponsiveContainer width="100%" height={210}>
              <AreaChart data={d?.chart ?? []}>
                <defs>
                  <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563EB" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 12, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.07)' }}
                  // @ts-expect-error recharts ValueType
                  formatter={(v: number) => [formatCurrency(v), 'Daromad']}
                />
                <Area type="monotone" dataKey="revenue" stroke="#2563EB" strokeWidth={2.5}
                  fill="url(#revenueGrad)" dot={{ fill: '#2563EB', r: 3, strokeWidth: 0 }} activeDot={{ r: 5, strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top debtors */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400" />
            Eng ko&apos;p qarzdorlar
          </h2>
          {loading ? (
            <div className="space-y-3">{Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>
          ) : (d?.topDebtors?.length ?? 0) === 0 ? (
            <div className="flex flex-col items-center justify-center py-10">
              <AlertCircle className="w-8 h-8 text-gray-200 mb-2" />
              <p className="text-sm text-gray-400">Qarzdor yo&apos;q</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(d?.topDebtors ?? []).map((debt, i) => (
                <div key={debt.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors">
                  <div className={cn('w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold', DEBTOR_COLORS[i % DEBTOR_COLORS.length])}>
                    {getInitials(debt.student_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{debt.student_name}</p>
                    <p className="text-xs text-gray-400">{debt.due_date}</p>
                  </div>
                  <span className="text-sm font-bold text-red-500 flex-shrink-0">{formatCurrency(debt.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Teacher stats + Active Groups */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Teacher stats */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-violet-500" />
            O&apos;qituvchilar
          </h2>
          {loading ? (
            <div className="space-y-2">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (d?.teacherStats?.length ?? 0) === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Ma&apos;lumot yo&apos;q</p>
          ) : (
            <div className="space-y-1">
              {(d?.teacherStats ?? []).map((ts, i) => (
                <div key={ts.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-[10px] font-bold text-violet-700">{ts.name.charAt(0)}</span>
                    </div>
                    <p className="text-sm font-medium text-gray-900 truncate">{ts.name}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                    <span className="text-xs text-gray-500"><span className="font-semibold text-gray-700">{ts.groups_count}</span> guruh</span>
                    <span className="text-xs text-gray-500"><span className="font-semibold text-gray-700">{ts.students_count}</span> o&apos;q</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Active Groups */}
        <div className="xl:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Users2 className="w-4 h-4 text-blue-500" />
              Faol guruhlar
            </h2>
            <Link href={`/${locale}/groups`}
              className="flex items-center gap-1 text-xs text-blue-600 hover:underline font-medium">
              Barchasini ko&apos;rish <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {groupsLoading ? (
            <div className="space-y-2">{Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : activeGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10">
              <UsersRound className="w-10 h-10 text-gray-200 mb-2" />
              <p className="text-sm text-gray-400">Hali faol guruhlar yo&apos;q</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Guruh', 'O\'qituvchi', 'O\'quvchilar', 'Kurs', 'Jadval'].map((h) => (
                    <th key={h} className="text-left pb-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {activeGroups.map((g) => (
                  <tr key={g.id} onClick={() => window.location.href = `/${locale}/groups`}
                    className="hover:bg-blue-50/50 transition-colors cursor-pointer">
                    <td className="py-3 pr-3">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-blue-600 text-white text-xs font-bold">{g.name}</span>
                    </td>
                    <td className="py-3 pr-3 text-gray-700 text-xs font-medium">
                      {g.teacher ? `${g.teacher.first_name} ${g.teacher.last_name}` : '—'}
                    </td>
                    <td className="py-3 pr-3">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-700">
                        <Users className="w-3 h-3 text-gray-400" />
                        {g.students_count ?? 0}
                      </span>
                    </td>
                    <td className="py-3 pr-3 text-gray-600 text-xs">{g.course?.name ?? '—'}</td>
                    <td className="py-3 text-gray-400 text-xs">{g.schedule ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Notes + Leaderboard */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Recent Notes */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
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
              <MessageSquare className="w-8 h-8 text-gray-200 mb-2" />
              <p className="text-sm text-gray-400">Hozircha izohlar yo&apos;q</p>
            </div>
          ) : (
            <div className="space-y-4">
              {notes.map((n) => {
                const authorName = n.author_name ?? (n.author ? `${n.author.first_name} ${n.author.last_name}` : 'Noma\'lum');
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

        {/* Leaderboard */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">
            🏆 Top o&apos;quvchilar
          </h2>
          {leaderboardLoading ? (
            <div className="space-y-2">{Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : leaderboard.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10">
              <Users className="w-8 h-8 text-gray-200 mb-2" />
              <p className="text-sm text-gray-400">Hali baholar kiritilmagan</p>
            </div>
          ) : (
            <div className="space-y-1">
              {leaderboard.map((entry, i) => (
                <div key={entry.student_id} className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
                  <span className="text-lg w-7 flex-shrink-0 text-center">{RANK_BADGES[i]}</span>
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
      </div>

      {/* ─── Quick Action Dialogs ─────────────────────────────────────────── */}

      {/* Student Add */}
      <Dialog open={showStudentAdd} onOpenChange={setShowStudentAdd}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Yangi o&apos;quvchi qo&apos;shish</DialogTitle></DialogHeader>
          <form onSubmit={handleStudentAdd} className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Ism <span className="text-red-500">*</span></label>
                <input value={studentForm.first_name} onChange={(e) => setStudentForm((f) => ({ ...f, first_name: e.target.value }))} className={inputCls} required />
              </div>
              <div>
                <label className={labelCls}>Familiya <span className="text-red-500">*</span></label>
                <input value={studentForm.last_name} onChange={(e) => setStudentForm((f) => ({ ...f, last_name: e.target.value }))} className={inputCls} required />
              </div>
            </div>
            <div>
              <label className={labelCls}>Telefon <span className="text-red-500">*</span></label>
              <div className="flex">
                <span className="inline-flex items-center px-3 border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm rounded-l">+998</span>
                <input type="tel" value={studentForm.phone}
                  onChange={(e) => setStudentForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 9) }))}
                  placeholder="XX XXX XX XX"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-r text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required />
              </div>
            </div>
            <div>
              <label className={labelCls}>Kurs (ixtiyoriy)</label>
              <select value={studentForm.course_id} onChange={(e) => setStudentForm((f) => ({ ...f, course_id: e.target.value }))} className={inputCls}>
                <option value="">Tanlang</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowStudentAdd(false)} className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50">Bekor qilish</button>
              <button type="submit" disabled={savingStudent} className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-60">
                {savingStudent ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Payment Add */}
      <Dialog open={showPaymentAdd} onOpenChange={(v) => { setShowPaymentAdd(v); if (!v) { setSelectedPaymentStudent(null); setPaymentStudentSearch(''); setPaymentForm({ group_id: '', amount: '', payment_type: 'cash', note: '' }); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Yangi to&apos;lov kiritish</DialogTitle></DialogHeader>
          <form onSubmit={handlePaymentAdd} className="space-y-4 mt-2">
            <div>
              <label className={labelCls}>O&apos;quvchi</label>
              {selectedPaymentStudent ? (
                <div className="flex items-center justify-between px-3 py-2 border border-blue-300 bg-blue-50 rounded text-sm">
                  <span className="font-medium text-blue-800">{selectedPaymentStudent.first_name} {selectedPaymentStudent.last_name}</span>
                  <button type="button" onClick={() => { setSelectedPaymentStudent(null); setPaymentStudentSearch(''); }} className="text-blue-500 hover:text-blue-700 text-xs">✕</button>
                </div>
              ) : (
                <div className="relative">
                  <input type="text" value={paymentStudentSearch} onChange={(e) => setPaymentStudentSearch(e.target.value)}
                    placeholder="Ism yoki telefon bo'yicha qidirish..." className={inputCls} />
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
                <label className={labelCls}>Guruh</label>
                <select value={paymentForm.group_id} onChange={(e) => setPaymentForm((f) => ({ ...f, group_id: e.target.value }))} className={inputCls}>
                  <option value="">Tanlang (ixtiyoriy)</option>
                  {studentGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className={labelCls}>Summa (so&apos;m) <span className="text-red-500">*</span></label>
              <input type="number" value={paymentForm.amount} onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))} className={inputCls} required placeholder="0" />
            </div>
            <div>
              <label className={labelCls}>To&apos;lov turi</label>
              <select value={paymentForm.payment_type} onChange={(e) => setPaymentForm((f) => ({ ...f, payment_type: e.target.value }))} className={inputCls}>
                <option value="cash">Naqd</option>
                <option value="card">Karta</option>
                <option value="transfer">O&apos;tkazma</option>
              </select>
            </div>
            <p className="text-xs text-gray-400">* To&apos;lovlar o&apos;chirilmaydi va tahrirlanmaydi</p>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowPaymentAdd(false)} className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50">Bekor qilish</button>
              <button type="submit" disabled={savingPayment} className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-60">
                {savingPayment ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Group Add */}
      <Dialog open={showGroupAdd} onOpenChange={(v) => { setShowGroupAdd(v); if (!v) setGroupForm({ course_id: '', teacher_id: '', gender_type: '', days: [], time: '', room: '' }); }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Yangi guruh yaratish</DialogTitle></DialogHeader>
          <form onSubmit={handleGroupAdd} className="space-y-4 mt-2">
            <div>
              <label className={labelCls}>Kurs <span className="text-red-500">*</span></label>
              <select value={groupForm.course_id} onChange={(e) => setGroupForm((f) => ({ ...f, course_id: e.target.value }))} className={inputCls} required>
                <option value="">Tanlang</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>O&apos;qituvchi <span className="text-red-500">*</span></label>
              <select value={groupForm.teacher_id} onChange={(e) => setGroupForm((f) => ({ ...f, teacher_id: e.target.value }))} className={inputCls} required>
                <option value="">Tanlang</option>
                {teachers.map((t) => <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>
                Guruh turi <span className="text-red-500">*</span>
                {!groupForm.gender_type && <span className="ml-2 text-xs text-orange-500 font-normal">— tanlash majburiy</span>}
              </label>
              <div className="flex gap-2">
                {[
                  { value: 'a', label: 'Erkaklar', cls: 'border-blue-300 bg-blue-50 text-blue-700' },
                  { value: 'b', label: 'Ayollar', cls: 'border-pink-300 bg-pink-50 text-pink-700' },
                  { value: 'c', label: 'Aralash', cls: 'border-purple-300 bg-purple-50 text-purple-700' },
                ].map(({ value, label, cls }) => (
                  <button key={value} type="button" onClick={() => setGroupForm((f) => ({ ...f, gender_type: value }))}
                    className={cn('flex-1 py-2 text-xs font-medium border rounded transition-colors', groupForm.gender_type === value ? cls : 'border-gray-300 text-gray-600 hover:bg-gray-50')}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelCls}>Dars kunlari</label>
              <div className="flex gap-1.5 flex-wrap">
                {DAYS_LIST.map((day) => (
                  <button key={day} type="button" onClick={() => toggleDay(day)}
                    className={cn('px-3 py-1.5 text-xs font-medium border rounded transition-colors',
                      groupForm.days.includes(day) ? 'border-blue-500 bg-blue-600 text-white' : 'border-gray-300 text-gray-600 hover:bg-gray-50')}>
                    {day}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelCls}>Dars vaqti</label>
              <input type="time" value={groupForm.time} onChange={(e) => setGroupForm((f) => ({ ...f, time: e.target.value }))} className={inputCls} />
            </div>
            {(groupForm.days.length > 0 || groupForm.time) && (
              <div className="px-3 py-2 bg-gray-50 rounded text-xs text-gray-600">
                Jadval: <span className="font-medium">{buildSchedule(groupForm.days, groupForm.time) || '—'}</span>
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowGroupAdd(false)} className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50">Bekor qilish</button>
              <button type="submit" disabled={savingGroup} className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-60">
                {savingGroup ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* SMS Send */}
      <Dialog open={showSms} onOpenChange={setShowSms}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>SMS yuborish</DialogTitle></DialogHeader>
          <form onSubmit={handleSmsSend} className="space-y-4 mt-2">
            <div>
              <label className={labelCls}>Telefon <span className="text-red-500">*</span></label>
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
              <label className={labelCls}>Xabar <span className="text-red-500">*</span></label>
              <textarea value={smsForm.message} onChange={(e) => setSmsForm((f) => ({ ...f, message: e.target.value }))}
                rows={4} required
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="SMS matni..." />
              <p className="text-xs text-gray-400 mt-1">{smsForm.message.length} belgi</p>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowSms(false)} className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50">Bekor qilish</button>
              <button type="submit" disabled={savingSms} className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-60">
                {savingSms ? 'Yuborilmoqda...' : 'Yuborish'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
