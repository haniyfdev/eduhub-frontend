'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { Plus, Search, Minus, Snowflake, Play } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Pagination } from '@/components/pagination';
import api from '@/lib/axios';
import { cn } from '@/lib/utils';
import { PaginatedResponse } from '@/types';

interface Group {
  id: string;
  name: string;
  number: number;
  gender_type: 'a' | 'b' | 'c';
  course: { id: string; name: string };
  teacher: { id: string; first_name: string; last_name: string };
  students_count: number;
  schedule: string;
  room: string;
  status: 'active' | 'archived' | 'frozen';
}

interface Course { id: string; name: string; }
interface Teacher { id: string; first_name: string; last_name: string; }

const GENDER_STYLES: Record<string, string> = {
  a: 'bg-blue-50 text-blue-700 border-blue-200',
  b: 'bg-pink-50 text-pink-700 border-pink-200',
  c: 'bg-purple-50 text-purple-700 border-purple-200',
};
const GENDER_LABELS: Record<string, string> = {
  a: 'Bolalar', b: 'Qizlar', c: 'Aralash',
};

const DAYS = [
  { key: 'Du', label: 'Du' },
  { key: 'Se', label: 'Se' },
  { key: 'Cho', label: 'Cho' },
  { key: 'Pa', label: 'Pa' },
  { key: 'Ju', label: 'Ju' },
  { key: 'Sha', label: 'Sha' },
  { key: 'Ya', label: 'Ya' },
];

const EMPTY_FORM = {
  course_id: '', teacher_id: '', gender_type: '',
  days: [] as string[], time: '', room: '',
};

function buildSchedule(days: string[], time: string): string {
  if (days.length === 0 && !time) return '';
  return [days.join(','), time].filter(Boolean).join(' ');
}

export default function GroupsPage() {
  const router = useRouter();
  const locale = useLocale();

  const [groups, setGroups] = useState<Group[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [courseFilter, setCourseFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [count, setCount] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [archiveTarget, setArchiveTarget] = useState<{ id: string; name: string } | null>(null);
  const [freezeTarget, setFreezeTarget] = useState<{ id: string; name: string } | null>(null);
  const [unfreezeTarget, setUnfreezeTarget] = useState<{ id: string; name: string } | null>(null);

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const params: Record<string, string | number> = { page, page_size: pageSize };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (courseFilter) params.course = courseFilter;
      const { data } = await api.get<PaginatedResponse<Group>>('/api/v1/groups/', { params });
      setGroups(data.results ?? []);
      setCount(data.count ?? 0);
    } catch {
      setError(true);
      toast.error("Ma'lumotlarni yuklashda xatolik");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, statusFilter, courseFilter]);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);
  useEffect(() => { setPage(1); }, [search, statusFilter, courseFilter]);

  useEffect(() => {
    api.get<PaginatedResponse<Course>>('/api/v1/courses/?status=active&page_size=100').then(({ data }) => setCourses(data.results ?? [])).catch(() => {});
    api.get<PaginatedResponse<Teacher>>('/api/v1/teachers/?status=active&page_size=100').then(({ data }) => setTeachers(data.results ?? [])).catch(() => {});
  }, []);

  function toggleDay(day: string) {
    setForm((f) => ({
      ...f,
      days: f.days.includes(day) ? f.days.filter((d) => d !== day) : [...f.days, day],
    }));
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();

    if (!form.gender_type) { toast.error('Guruh turini tanlang!'); return; }
    if (!form.time) { toast.error('Dars vaqtini kiriting!'); return; }
    if (!form.room) { toast.error('Xonani kiriting!'); return; }

    // Vaqt validatsiyasi
    const timeParts = form.time.split(':');
    if (timeParts.length !== 2) { toast.error("Vaqt HH:MM formatida bo'lishi kerak!"); return; }
    const hours = parseInt(timeParts[0], 10);
    const minutes = parseInt(timeParts[1], 10);
    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || form.time.length !== 5) {
      toast.error("Vaqt 00:00 — 23:59 oralig'ida bo'lishi kerak!"); return;
    }
    
    setSaving(true);
    try {
      const schedule = buildSchedule(form.days, form.time);
      await api.post('/api/v1/groups/', {
        course_id: form.course_id,
        teacher_id: form.teacher_id,
        gender_type: form.gender_type,
        ...(schedule ? { schedule } : {}),
        ...(form.room ? { room: form.room } : {}),
      });
      toast.success("Guruh muvaffaqiyatli qo'shildi");
      setShowAdd(false);
      setForm(EMPTY_FORM);
      fetchGroups();
    } catch (err: any) {
      const d = err?.response?.data;
      const msg = typeof d === 'string' ? d : d?.detail || Object.values(d ?? {})[0] || 'Xatolik yuz berdi';
      toast.error(String(msg));
    } finally {
      setSaving(false);
    }
  }

  async function confirmArchive() {
    if (!archiveTarget) return;
    try {
      await api.post(`/api/v1/groups/${archiveTarget.id}/archive/`);
      toast.success('Guruh arxivlandi');
      setArchiveTarget(null);
      fetchGroups();
    } catch {
      toast.error('Xatolik yuz berdi');
    }
  }

  async function confirmFreeze() {
    if (!freezeTarget) return;
    try {
      await api.post(`/api/v1/groups/${freezeTarget.id}/freeze/`);
      toast.success('Guruh muzlatildi');
      setFreezeTarget(null);
      fetchGroups();
    } catch {
      toast.error('Xatolik yuz berdi');
    }
  }

  async function confirmUnfreeze() {
    if (!unfreezeTarget) return;
    try {
      await api.post(`/api/v1/groups/${unfreezeTarget.id}/unfreeze/`);
      toast.success('Guruh faollashtirildi');
      setUnfreezeTarget(null);
      fetchGroups();
    } catch {
      toast.error('Xatolik yuz berdi');
    }
  }


  return (
    <div className="space-y-5">
      <Toaster position="top-right" />
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Guruhlar</h1>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> Qo'shish
        </button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="O'qituvchi yoki guruh..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700">
          <option value="active">Faol</option>
          <option value="frozen">Muzlatilgan</option>
          <option value="archived">Arxivlangan</option>
          <option value="">Barchasi</option>
        </select>
        <select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700">
          <option value="">Barcha kurslar</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="bg-white rounded border border-gray-200 shadow-sm overflow-hidden">
        {error ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500">
            <p className="mb-3 text-sm">Xatolik yuz berdi</p>
            <button onClick={fetchGroups} className="text-sm text-blue-600 underline">Qayta urinish</button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {['№', "Guruh", "Kurs", "O'qituvchi", "O'quvchilar", 'Turi', 'Jadval', 'Holat', 'Amallar'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading
                ? Array(6).fill(0).map((_, i) => (
                  <tr key={i}>{Array(9).fill(0).map((_, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                  ))}</tr>
                ))
                : groups.length === 0
                  ? <tr><td colSpan={9} className="px-4 py-16 text-center text-gray-400">Natija topilmadi</td></tr>
                  : groups.map((g, idx) => (
                    <tr
                        key={g.id}
                        onClick={() => router.push(`/${locale}/groups/${g.id}`)}
                        className={cn(
                          "cursor-pointer transition-colors",
                          g.status === 'archived' ? "bg-yellow-50 hover:bg-yellow-100"
                          : g.status === 'frozen' ? "bg-sky-50 hover:bg-sky-100"
                          : "hover:bg-gray-50"
                        )}
                        >
                      <td className="px-4 py-3 text-gray-400 text-xs">{(page - 1) * pageSize + idx + 1}</td>
                      <td className="px-4 py-3 font-bold text-gray-900">{g.name}</td>
                      <td className="px-4 py-3 text-gray-600">{g.course?.name || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {g.teacher ? `${g.teacher.first_name} ${g.teacher.last_name}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{g.students_count ?? 0}</td>
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex items-center px-2 py-0.5 text-xs font-medium border rounded', GENDER_STYLES[g.gender_type])}>
                          {GENDER_LABELS[g.gender_type]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{g.schedule || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex items-center px-2 py-0.5 text-xs font-medium border rounded',
                          g.status === 'active' ? 'bg-green-50 text-green-700 border-green-200'
                          : g.status === 'frozen' ? 'bg-sky-100 text-sky-700 border-sky-300'
                          : 'bg-gray-100 text-gray-600 border-gray-200'
                        )}>
                          {g.status === 'active' ? 'Faol' : g.status === 'frozen' ? 'Muzlatilgan' : 'Arxivlangan'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {g.status === 'active' && (
                            <>
                              <button
                                onClick={(e) => { e.stopPropagation(); setFreezeTarget({ id: g.id, name: g.name }); }}
                                className="p-1 rounded text-sky-400 hover:bg-sky-50 hover:text-sky-600 transition-colors"
                                title="Muzlatish"
                              >
                                <Snowflake className="w-4 h-4" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setArchiveTarget({ id: g.id, name: g.name }); }}
                                className="p-1 rounded text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                                title="Arxivlash"
                              >
                                <Minus className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          {g.status === 'frozen' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setUnfreezeTarget({ id: g.id, name: g.name }); }}
                              className="p-1 rounded text-green-500 hover:bg-green-50 hover:text-green-700 transition-colors"
                              title="Faollashtirish"
                            >
                              <Play className="w-4 h-4" />
                            </button>
                          )}
                          {g.status === 'archived' && (
                            <span className="text-xs text-gray-400">
                              {(g as any).archived_at ? new Date((g as any).archived_at).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}
                            </span>
                          )}
                        </div>
                    </td>
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

      {/* Archive confirmation dialog */}
      <Dialog open={!!archiveTarget} onOpenChange={(open) => { if (!open) setArchiveTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Arxivlash</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600 mt-1">
            <span className="font-medium">{archiveTarget?.name}</span>ni arxivlashni istaysizmi?
          </p>
          <div className="flex gap-3 mt-4">
            <button onClick={() => setArchiveTarget(null)}
              className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50">
              Bekor qilish
            </button>
            <button onClick={confirmArchive}
              className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700">
              Ha, arxivlash
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Freeze confirmation dialog */}
      <Dialog open={!!freezeTarget} onOpenChange={(open) => { if (!open) setFreezeTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Guruhni muzlatish</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600 mt-1">
            <span className="font-medium">{freezeTarget?.name}</span> guruhini muzlatmoqchimisiz? Muzlatilgan guruh uchun oylik qarz hisoblanmaydi.
          </p>
          <div className="flex gap-3 mt-4">
            <button onClick={() => setFreezeTarget(null)}
              className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50">
              Bekor qilish
            </button>
            <button onClick={confirmFreeze}
              className="flex-1 px-4 py-2 bg-sky-600 text-white text-sm font-medium rounded hover:bg-sky-700">
              Ha, muzlatish
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Unfreeze confirmation dialog */}
      <Dialog open={!!unfreezeTarget} onOpenChange={(open) => { if (!open) setUnfreezeTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Guruhni faollashtirish</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600 mt-1">
            <span className="font-medium">{unfreezeTarget?.name}</span> guruhini faollashtirishni istaysizmi?
          </p>
          <div className="flex gap-3 mt-4">
            <button onClick={() => setUnfreezeTarget(null)}
              className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50">
              Bekor qilish
            </button>
            <button onClick={confirmUnfreeze}
              className="flex-1 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700">
              Ha, faollashtirish
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showAdd} onOpenChange={(open) => { if (!open) setForm(EMPTY_FORM); setShowAdd(open); }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Yangi guruh</DialogTitle></DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4 mt-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kurs <span className="text-red-500">*</span></label>
              <select
                value={form.course_id}
                onChange={(e) => setForm((f) => ({ ...f, course_id: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Tanlang</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">O'qituvchi <span className="text-red-500">*</span></label>
              <select
                value={form.teacher_id}
                onChange={(e) => setForm((f) => ({ ...f, teacher_id: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Tanlang</option>
                {teachers.map((t) => <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Guruh turi <span className="text-red-500">*</span>
                {!form.gender_type && <span className="ml-2 text-xs text-orange-500 font-normal">— tanlash majburiy</span>}
              </label>
              <div className="flex gap-2">
                {[
                  { value: 'a', label: 'Bolalar', style: 'border-blue-300 bg-blue-50 text-blue-700' },
                  { value: 'b', label: 'Qizlar', style: 'border-pink-300 bg-pink-50 text-pink-700' },
                  { value: 'c', label: 'Aralash', style: 'border-purple-300 bg-purple-50 text-purple-700' },
                ].map(({ value, label, style }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, gender_type: value }))}
                    className={cn(
                      'flex-1 py-2 text-xs font-medium border rounded transition-colors',
                      form.gender_type === value ? style : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Weekday picker */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Dars kunlari</label>
              <div className="flex gap-1.5 flex-wrap">
                {DAYS.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleDay(key)}
                    className={cn(
                      'px-3 py-1.5 text-xs font-medium border rounded transition-colors',
                      form.days.includes(key)
                        ? 'border-blue-500 bg-blue-600 text-white'
                        : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Time picker */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Dars vaqti</label>
              <input
                type="text"
                value={form.time}
                maxLength={5}
                placeholder="HH:MM"
                onChange={(e) => {
                  let val = e.target.value.replace(/\D/g, '');
                  if (val.length > 4) val = val.slice(0, 4);
                  if (val.length > 2) val = val.slice(0, 2) + ':' + val.slice(2);
                  setForm((f) => ({ ...f, time: val }));
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Schedule preview */}
            {(form.days.length > 0 || form.time) && (
              <div className="px-3 py-2 bg-gray-50 rounded text-xs text-gray-600">
                Jadval: <span className="font-medium">{buildSchedule(form.days, form.time) || '—'}</span>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Xona <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={form.room}
                onChange={(e) => setForm((f) => ({ ...f, room: e.target.value }))}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => { setShowAdd(false); setForm(EMPTY_FORM); }}
                className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50"
              >
                Bekor qilish
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-60"
              >
                {saving ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
