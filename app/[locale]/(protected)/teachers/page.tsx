'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Search } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Pagination } from '@/components/pagination';
import { DatePicker } from '@/components/date-picker';
import api from '@/lib/axios';
import { cn, formatPhone, formatDMY } from '@/lib/utils';
import { PaginatedResponse } from '@/types';

interface Teacher {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  subject: string;
  birth_date: string | null;
  salary_type: 'fixed' | 'percent' | 'per_student';
  hired_at: string;
  status: 'active' | 'archived';
}

const SALARY_STYLES: Record<string, string> = {
  fixed: 'bg-gray-100 text-gray-700 border-gray-200',
  percent: 'bg-blue-50 text-blue-700 border-blue-200',
  per_student: 'bg-green-50 text-green-700 border-green-200',
};
const SALARY_LABELS: Record<string, string> = {
  fixed: 'Belgilangan',
  percent: 'Foizli',
  per_student: "O'quvchi bo'yicha",
};
const SALARY_AMOUNT_LABELS: Record<string, string> = {
  fixed: 'Oylik maosh (so\'m)',
  percent: 'Foiz (%)',
  per_student: "O'quvchi boshiga (so'm)",
};

const EMPTY_FORM: {
  first_name: string; last_name: string; phone: string; password: string;
  subject: string; birth_date: string; salary_type: 'fixed' | 'percent' | 'per_student';
  salary_amount: string;
} = {
  first_name: '', last_name: '', phone: '', password: '',
  subject: '', birth_date: '', salary_type: 'fixed', salary_amount: '',
};

export default function TeachersPage() {
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

  const salaryAmt = parseFloat(form.salary_amount);
  const fieldErrors = {
    first_name: !form.first_name ? 'Ism majburiy' : form.first_name.length < 2 ? 'Kamida 2 harf' : form.first_name.length > 50 ? "Ko'pi bilan 50 harf" : '',
    last_name: !form.last_name ? 'Familiya majburiy' : form.last_name.length < 2 ? 'Kamida 2 harf' : form.last_name.length > 50 ? "Ko'pi bilan 50 harf" : '',
    phone: form.phone.replace(/\D/g, '').length !== 9 ? "To'liq 9 raqam kiriting" : '',
    salary_amount: form.salary_type === 'percent'
      ? (isNaN(salaryAmt) || salaryAmt < 1 || salaryAmt > 100 ? 'Foiz 1–100 orasida bo\'lishi kerak' : '')
      : form.salary_type === 'fixed'
        ? (isNaN(salaryAmt) || salaryAmt < 100000 ? 'Kamida 100 000 so\'m kiriting' : '')
        : (isNaN(salaryAmt) || salaryAmt < 1000 ? 'Kamida 1 000 so\'m kiriting' : ''),
  };
  const hasFormErrors = Object.values(fieldErrors).some(Boolean);

  function touch(field: string) { setTouched((t) => ({ ...t, [field]: true })); }
  function showErr(field: string) { return touched[field] ? (fieldErrors as Record<string, string>)[field] ?? '' : ''; }

  // const percentInvalid = !!fieldErrors.salary_amount && form.salary_type === 'percent';

  const fetchTeachers = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const params: Record<string, string | number> = { page, page_size: pageSize };
      if (search) params.search = search;
      const { data } = await api.get<PaginatedResponse<Teacher>>('/api/v1/teachers/', { params });
      setTeachers(data.results ?? []);
      setCount(data.count ?? 0);
    } catch {
      setError(true);
      toast.error("Ma'lumotlarni yuklashda xatolik");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search]);

  useEffect(() => { fetchTeachers(); }, [fetchTeachers]);
  useEffect(() => { setPage(1); }, [search]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ first_name: true, last_name: true, phone: true, salary_amount: true });
    if (hasFormErrors) return;
    setSaving(true);
    try {
      await api.post('/api/v1/teachers/', {
        first_name: form.first_name,
        last_name: form.last_name,
        phone: '+998' + form.phone.replace(/\D/g, ''),
        password: form.password,
        subject: form.subject || '',
        birth_date: form.birth_date || null,
        salary_type: form.salary_type,
        ...(form.salary_type === 'fixed' ? { fixed_amount: parseFloat(form.salary_amount) } : {}),
        ...(form.salary_type === 'percent' ? { salary_percent: parseFloat(form.salary_amount) } : {}),
        ...(form.salary_type === 'per_student' ? { per_student_amt: parseFloat(form.salary_amount) } : {}),
      });
      toast.success("O'qituvchi muvaffaqiyatli qo'shildi");
      setShowAdd(false);
      setForm(EMPTY_FORM);
      fetchTeachers();
    } catch (err: any) {
      const detail = err?.response?.data;
      const msg = typeof detail === 'string'
        ? detail
        : detail?.detail || Object.values(detail ?? {})[0] || 'Xatolik yuz berdi';
      toast.error(String(msg));
    } finally {
      setSaving(false);
    }
  }

  async function confirmArchive() {
    if (!archiveTarget) return;
    try {
      await api.post(`/api/v1/teachers/${archiveTarget.id}/archive/`);
      toast.success("O'qituvchi arxivlandi");
      setArchiveTarget(null);
      fetchTeachers();
    } catch {
      toast.error('Xatolik yuz berdi');
    }
  }

  return (
    <div className="space-y-5">
      <Toaster position="top-right" />
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">O'qituvchilar</h1>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> Qo'shish
        </button>
      </div>

      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Qidirish..."
          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="bg-white rounded border border-gray-200 shadow-sm overflow-hidden">
        {error ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500">
            <p className="mb-3 text-sm">Xatolik yuz berdi</p>
            <button onClick={fetchTeachers} className="text-sm text-blue-600 underline">Qayta urinish</button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {['#', 'Ism', 'Telefon', 'Fan', 'Maosh turi', "Tug'ilgan sana", 'Ish boshlagan', 'Holat', 'Amallar'].map((h) => (
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
                : teachers.length === 0
                  ? <tr><td colSpan={9} className="px-4 py-16 text-center text-gray-400">Natija topilmadi</td></tr>
                  : teachers.map((t, idx) => (
                    <tr 
                        key={t.id} 
                        className={cn(
                          "transition-colors",
                          t.status === 'archived' 
                            ? "bg-yellow-50 hover:bg-yellow-100" 
                            : "hover:bg-gray-50"
                        )}
                      >
                      <td className="px-4 py-3 text-gray-400 text-xs">{(page - 1) * pageSize + idx + 1}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{t.first_name} {t.last_name}</td>
                      <td className="px-4 py-3 text-gray-500">{formatPhone(t.phone)}</td>
                      <td className="px-4 py-3 text-gray-600">{t.subject || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex items-center px-2 py-0.5 text-xs font-medium border rounded', SALARY_STYLES[t.salary_type])}>
                          {SALARY_LABELS[t.salary_type]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{formatDMY(t.birth_date)}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{formatDMY(t.hired_at)}</td>
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex items-center px-2 py-0.5 text-xs font-medium border rounded',
                          t.status === 'active' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-600 border-gray-200'
                        )}>
                          {t.status === 'active' ? 'Faol' : 'Arxivlangan'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {t.status === 'active' && (
                          <button onClick={() => setArchiveTarget({ id: t.id, name: `${t.first_name} ${t.last_name}` })} className="text-xs text-red-500 hover:underline">
                            Arxivlash
                          </button>
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

      <Dialog open={showAdd} onOpenChange={(open) => { if (!open) { setForm(EMPTY_FORM); setTouched({}); } setShowAdd(open); }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Yangi o'qituvchi</DialogTitle></DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ism <span className="text-red-500">*</span></label>
                <input
                  value={form.first_name}
                  onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                  onBlur={() => touch('first_name')}
                  className={cn('w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500', showErr('first_name') ? 'border-red-400' : 'border-gray-300')}
                />
                {showErr('first_name') && <p className="text-xs text-red-500 mt-0.5">{showErr('first_name')}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Familiya <span className="text-red-500">*</span></label>
                <input
                  value={form.last_name}
                  onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                  onBlur={() => touch('last_name')}
                  className={cn('w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500', showErr('last_name') ? 'border-red-400' : 'border-gray-300')}
                />
                {showErr('last_name') && <p className="text-xs text-red-500 mt-0.5">{showErr('last_name')}</p>}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telefon <span className="text-red-500">*</span></label>
              <div className="flex">
                <span className="inline-flex items-center px-3 border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm rounded-l">+998</span>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 9) }))}
                  onBlur={() => touch('phone')}
                  placeholder="XX XXX XX XX"
                  className={cn('flex-1 px-3 py-2 border rounded-r text-sm focus:outline-none focus:ring-2 focus:ring-blue-500', showErr('phone') ? 'border-red-400' : 'border-gray-300')}
                />
              </div>
              {showErr('phone') && <p className="text-xs text-red-500 mt-0.5">{showErr('phone')}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Parol <span className="text-red-500">*</span></label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
                minLength={6}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fan (ixtiyoriy)</label>
              <input
                value={form.subject}
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                placeholder="Masalan: Matematika"
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tug'ilgan sana</label>
              <DatePicker
                value={form.birth_date}
                onChange={(iso) => setForm((f) => ({ ...f, birth_date: iso }))}
                maxYear={new Date().getFullYear() - 18}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Maosh turi <span className="text-red-500">*</span></label>
              <div className="flex gap-2">
                {(['fixed', 'percent', 'per_student'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, salary_type: type, salary_amount: '' }))}
                    className={cn(
                      'flex-1 py-2 text-xs font-medium border rounded transition-colors',
                      form.salary_type === type
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                    )}
                  >
                    {SALARY_LABELS[type]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {SALARY_AMOUNT_LABELS[form.salary_type]} <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={form.salary_amount}
                onChange={(e) => setForm((f) => ({ ...f, salary_amount: e.target.value }))}
                onBlur={() => touch('salary_amount')}
                min={form.salary_type === 'percent' ? 1 : form.salary_type === 'fixed' ? 100000 : 1000}
                max={form.salary_type === 'percent' ? 100 : undefined}
                step={form.salary_type === 'percent' ? '1' : '1000'}
                className={cn(
                  'w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500',
                  showErr('salary_amount') ? 'border-red-400' : 'border-gray-300'
                )}
                required
              />
              {showErr('salary_amount') && (
                <p className="text-xs text-red-500 mt-1">{showErr('salary_amount')}</p>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => { setShowAdd(false); setForm(EMPTY_FORM); setTouched({}); }}
                className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50"
              >
                Bekor qilish
              </button>
              <button
                type="submit"
                disabled={saving || hasFormErrors}
                className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-60"
              >
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
