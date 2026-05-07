'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Search, X } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Pagination } from '@/components/pagination';
import api from '@/lib/axios';
import { cn, formatCurrency } from '@/lib/utils';
import { PaginatedResponse } from '@/types';

interface Course {
  id: string;
  name: string;
  description: string;
  price: number;
  duration_months: number;
  duration_hours: number;
  status: 'active' | 'archived';
  teacher_names?: { id: string; first_name: string; last_name: string }[];
}

interface Teacher { id: string; first_name: string; last_name: string; }

const EMPTY_FORM = {
  name: '', description: '', price: '', duration_months: '', duration_hours: '',
  teacher_ids: [] as string[],
};

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [count, setCount] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [archiveTarget, setArchiveTarget] = useState<{ id: string; name: string } | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const priceVal = parseFloat(form.price);
  const monthsVal = parseInt(form.duration_months);
  const hoursVal = parseFloat(form.duration_hours);
  const fieldErrors = {
    name: !form.name ? 'Nomi majburiy' : form.name.length < 2 ? 'Kamida 2 harf' : form.name.length > 100 ? "Ko'pi bilan 100 harf" : '',
    price: isNaN(priceVal) || priceVal < 1000 ? 'Kamida 1 000 so\'m' : priceVal > 50000000 ? "Ko'pi bilan 50 000 000 so'm" : '',
    duration_months: isNaN(monthsVal) || monthsVal < 1 ? 'Kamida 1 oy' : monthsVal > 18 ? "Ko'pi bilan 18 oy" : '',
    duration_hours: isNaN(hoursVal) || hoursVal < 1 ? 'Kamida 1 soat' : hoursVal > 500 ? "Ko'pi bilan 500 soat" : '',
  };
  const hasFormErrors = Object.values(fieldErrors).some(Boolean);

  function touch(field: string) { setTouched((t) => ({ ...t, [field]: true })); }
  function showErr(field: string) { return touched[field] ? (fieldErrors as Record<string, string>)[field] ?? '' : ''; }

  const fetchCourses = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const params: Record<string, string | number> = { page, page_size: pageSize };
      if (search) params.search = search;
      const { data } = await api.get<PaginatedResponse<Course>>('/api/v1/courses/', { params });
      setCourses(data.results);
      setCount(data.count);
    } catch {
      setError(true);
      toast.error('Ma\'lumotlarni yuklashda xatolik');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search]);

  useEffect(() => { fetchCourses(); }, [fetchCourses]);
  useEffect(() => { setPage(1); }, [search]);

  useEffect(() => {
    api.get<PaginatedResponse<Teacher>>('/api/v1/teachers/?status=active&page_size=100')
      .then(({ data }) => setTeachers(data.results))
      .catch(() => {});
  }, []);

  function toggleTeacher(id: string) {
    setForm((f) => ({
      ...f,
      teacher_ids: f.teacher_ids.includes(id)
        ? f.teacher_ids.filter((t) => t !== id)
        : [...f.teacher_ids, id],
    }));
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ name: true, price: true, duration_months: true, duration_hours: true });
    if (hasFormErrors) return;
    setSaving(true);
    try {
      await api.post('/api/v1/courses/', {
        name: form.name,
        description: form.description,
        price: parseFloat(form.price),
        duration_months: parseInt(form.duration_months),
        duration_hours: parseFloat(form.duration_hours),
        teacher_ids: form.teacher_ids,
      });
      toast.success('Kurs muvaffaqiyatli qo\'shildi');
      setShowAdd(false);
      setForm(EMPTY_FORM);
      fetchCourses();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Xatolik yuz berdi');
    } finally {
      setSaving(false);
    }
  }

  async function confirmArchive() {
    if (!archiveTarget) return;
    try {
      await api.post(`/api/v1/courses/${archiveTarget.id}/archive/`);
      toast.success('Kurs arxivlandi');
      setArchiveTarget(null);
      fetchCourses();
    } catch {
      toast.error('Xatolik yuz berdi');
    }
  }


  return (
    <div className="space-y-5">
      <Toaster position="top-right" />
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Kurslar</h1>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors">
          <Plus className="w-4 h-4" /> Qo'shish
        </button>
      </div>

      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Qidirish..."
          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      <div className="bg-white rounded border border-gray-200 shadow-sm overflow-hidden">
        {error ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500">
            <p className="mb-3 text-sm">Xatolik yuz berdi</p>
            <button onClick={fetchCourses} className="text-sm text-blue-600 underline">Qayta urinish</button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {['#', 'Nomi', 'Narxi', 'Muddati', 'O\'qituvchilar', 'Holat', 'Amallar'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading
                ? Array(6).fill(0).map((_, i) => (
                  <tr key={i}>{Array(7).fill(0).map((_, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                  ))}</tr>
                ))
                : courses.length === 0
                  ? <tr><td colSpan={7} className="px-4 py-16 text-center text-gray-400">Natija topilmadi</td></tr>
                  : [...courses].sort((a, b) => (a.status === 'archived' ? 1 : -1)).map((c, idx) => (
                    <tr 
                        key={c.id} 
                        className={cn(
                          "transition-colors",
                          c.status === 'archived' 
                            ? "bg-yellow-50 hover:bg-yellow-100" 
                            : "hover:bg-gray-50"
                        )}
                      >
                      <td className="px-4 py-3 text-gray-400 text-xs">{(page - 1) * pageSize + idx + 1}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                      <td className="px-4 py-3 text-gray-700">{formatCurrency(c.price)}</td>
                      <td className="px-4 py-3 text-gray-600">{c.duration_months} oy / {c.duration_hours} soat</td>
                      <td className="px-4 py-3 text-gray-600">
                        {c.teacher_names && c.teacher_names.length > 0
                          ? (
                            <div className="flex flex-wrap gap-1">
                              {c.teacher_names.map((t) => (
                                <span key={t.id} className="inline-flex items-center px-1.5 py-0.5 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded">
                                  {t.first_name} {t.last_name}
                                </span>
                              ))}
                            </div>
                          )
                          : '—'
                        }
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex items-center px-2 py-0.5 text-xs font-medium border rounded',
                          c.status === 'active' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-600 border-gray-200'
                        )}>
                          {c.status === 'active' ? 'Faol' : 'Arxivlangan'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {c.status === 'active' && (
                          <button onClick={() => setArchiveTarget({ id: c.id, name: c.name })} className="text-xs text-red-500 hover:underline">Arxivlash</button>
                        )}
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

      {/* Add course modal */}
      <Dialog open={showAdd} onOpenChange={(open) => { if (!open) { setForm(EMPTY_FORM); setTouched({}); } setShowAdd(open); }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Yangi kurs</DialogTitle></DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4 mt-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nomi <span className="text-red-500">*</span></label>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                onBlur={() => touch('name')}
                className={cn('w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500', showErr('name') ? 'border-red-400' : 'border-gray-300')} />
              {showErr('name') && <p className="text-xs text-red-500 mt-0.5">{showErr('name')}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tavsif</label>
              <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Narxi (so&apos;m) <span className="text-red-500">*</span></label>
              <input type="number" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                onBlur={() => touch('price')}
                min="1000" step="1000"
                className={cn('w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500', showErr('price') ? 'border-red-400' : 'border-gray-300')} />
              {showErr('price') && <p className="text-xs text-red-500 mt-0.5">{showErr('price')}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Davomiyligi (oy) <span className="text-red-500">*</span></label>
              <input type="number" value={form.duration_months} onChange={(e) => setForm((f) => ({ ...f, duration_months: e.target.value }))}
                onBlur={() => touch('duration_months')}
                min="1" max="18" step="1"
                className={cn('w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500', showErr('duration_months') ? 'border-red-400' : 'border-gray-300')} />
              {showErr('duration_months') && <p className="text-xs text-red-500 mt-0.5">{showErr('duration_months')}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Dars davomiyligi (soat) <span className="text-red-500">*</span></label>
              <input type="number" value={form.duration_hours} onChange={(e) => setForm((f) => ({ ...f, duration_hours: e.target.value }))}
                onBlur={() => touch('duration_hours')}
                min="1" max="500" step="0.5"
                className={cn('w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500', showErr('duration_hours') ? 'border-red-400' : 'border-gray-300')} />
              {showErr('duration_hours')
                ? <p className="text-xs text-red-500 mt-0.5">{showErr('duration_hours')}</p>
                : <p className="mt-1 text-xs text-gray-400">Masalan: ingliz tili boshlang'ich = 120 soat</p>}
            </div>

            {/* Multi-select teachers */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">O&apos;qituvchilar</label>
              {form.teacher_ids.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {form.teacher_ids.map((tid) => {
                    const t = teachers.find((t) => t.id === tid);
                    return t ? (
                      <span key={tid} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">
                        {t.first_name} {t.last_name}
                        <button type="button" onClick={() => toggleTeacher(tid)}><X className="w-3 h-3" /></button>
                      </span>
                    ) : null;
                  })}
                </div>
              )}
              <div className="max-h-32 overflow-y-auto border border-gray-300 rounded p-2 space-y-1">
                {teachers.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-2">O&apos;qituvchilar topilmadi</p>
                ) : teachers.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded">
                    <input type="checkbox" checked={form.teacher_ids.includes(t.id)} onChange={() => toggleTeacher(t.id)} className="rounded" />
                    {t.first_name} {t.last_name}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => { setShowAdd(false); setForm(EMPTY_FORM); setTouched({}); }}
                className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50">Bekor qilish</button>
              <button type="submit" disabled={saving || hasFormErrors}
                className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-60">
                {saving ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

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
    </div>
  );
}
