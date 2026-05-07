'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Search, ChevronLeft, ChevronRight, UserPlus } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import api from '@/lib/axios';
import { cn } from '@/lib/utils';

interface Company {
  id: string;
  name: string;
  phone: string;
  address: string;
  status: 'active' | 'archived';
  branch_of?: string | null;
  branch_of_name?: string | null;
  subscription?: { status: 'active' | 'trial' | 'expired' };
}

const SUB_STYLES: Record<string, string> = {
  active: 'bg-green-50 text-green-700 border-green-200',
  trial: 'bg-blue-50 text-blue-700 border-blue-200',
  expired: 'bg-red-50 text-red-700 border-red-200',
};
const SUB_LABELS: Record<string, string> = {
  active: 'Faol', trial: 'Sinov', expired: 'Tugagan',
};

const PAGE_SIZE = 20;

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const labelCls = 'block text-sm font-medium text-gray-700 mb-1';

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(0);

  // Add company modal
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', address: '', branch_of: '' });

  // Create boss modal
  const [bossTarget, setBossTarget] = useState<Company | null>(null);
  const [savingBoss, setSavingBoss] = useState(false);
  const [bossForm, setBossForm] = useState({ first_name: '', last_name: '', phone: '', password: '' });

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const params: Record<string, string | number> = { page };
      if (search) params.search = search;
      const { data } = await api.get('/api/superadmin/companies/', { params });
      const raw = data as any;
      setCompanies(raw.results ?? raw ?? []);
      setCount(raw.count ?? (Array.isArray(raw) ? raw.length : 0));
    } catch {
      setError(true);
      toast.error('Ma\'lumotlarni yuklashda xatolik');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { fetchCompanies(); }, [fetchCompanies]);
  useEffect(() => { setPage(1); }, [search]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/api/superadmin/companies/', {
        name: form.name,
        phone: '+998' + form.phone.replace(/\D/g, ''),
        address: form.address,
        ...(form.branch_of ? { branch_of: form.branch_of } : {}),
      });
      toast.success('Kompaniya qo\'shildi');
      setShowAdd(false);
      setForm({ name: '', phone: '', address: '', branch_of: '' });
      fetchCompanies();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Xatolik yuz berdi');
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateBoss(e: React.FormEvent) {
    e.preventDefault();
    if (!bossTarget) return;
    setSavingBoss(true);
    try {
      await api.post(`/api/superadmin/companies/${bossTarget.id}/create-boss/`, {
        first_name: bossForm.first_name,
        last_name: bossForm.last_name,
        phone: '+998' + bossForm.phone.replace(/\D/g, ''),
        password: bossForm.password,
      });
      toast.success('Boss muvaffaqiyatli yaratildi');
      setBossTarget(null);
      setBossForm({ first_name: '', last_name: '', phone: '', password: '' });
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Xatolik yuz berdi');
    } finally {
      setSavingBoss(false);
    }
  }

  const totalPages = Math.ceil(count / PAGE_SIZE);

  // Main companies for the branch_of dropdown (all loaded ones)
  const mainCompanies = companies.filter((c) => !c.branch_of);

  return (
    <div className="space-y-5">
      <Toaster position="top-right" />
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Kompaniyalar</h1>
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
            <button onClick={fetchCompanies} className="text-sm text-blue-600 underline">Qayta urinish</button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {['Nomi', 'Telefon', 'Manzil', 'Filial', 'Holat', 'Obuna', 'Amallar'].map((h) => (
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
                : companies.length === 0
                  ? <tr><td colSpan={7} className="px-4 py-16 text-center text-gray-400">Natija topilmadi</td></tr>
                  : companies.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                      <td className="px-4 py-3 text-gray-500">{c.phone || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{c.address || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{c.branch_of_name || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex items-center px-2 py-0.5 text-xs font-medium border rounded',
                          c.status === 'active' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-600 border-gray-200'
                        )}>
                          {c.status === 'active' ? 'Faol' : 'Arxivlangan'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {c.subscription ? (
                          <span className={cn('inline-flex items-center px-2 py-0.5 text-xs font-medium border rounded', SUB_STYLES[c.subscription.status])}>
                            {SUB_LABELS[c.subscription.status]}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => { setBossTarget(c); setBossForm({ first_name: '', last_name: '', phone: '', password: '' }); }}
                          className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          Boss qo&apos;shish
                        </button>
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        )}
      </div>

      {!loading && count > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>Sahifa {page} / {totalPages}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
              className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
              <ChevronLeft className="w-3.5 h-3.5" /> Oldingi
            </button>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
              Keyingi <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Add company modal */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Yangi kompaniya</DialogTitle></DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4 mt-2">
            <div>
              <label className={labelCls}>Nomi <span className="text-red-500">*</span></label>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className={inputCls} required />
            </div>
            <div>
              <label className={labelCls}>Telefon <span className="text-red-500">*</span></label>
              <div className="flex">
                <span className="inline-flex items-center px-3 border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm rounded-l">+998</span>
                <input type="tel" value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 9) }))}
                  placeholder="XX XXX XX XX"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-r text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
              </div>
            </div>
            <div>
              <label className={labelCls}>Manzil</label>
              <input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Asosiy markaz (filial bo&apos;lsa)</label>
              <select value={form.branch_of} onChange={(e) => setForm((f) => ({ ...f, branch_of: e.target.value }))}
                className={inputCls}>
                <option value="">Mustaqil kompaniya</option>
                {mainCompanies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowAdd(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50">Bekor qilish</button>
              <button type="submit" disabled={saving}
                className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-60">
                {saving ? '...' : 'Saqlash'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create boss modal */}
      <Dialog open={!!bossTarget} onOpenChange={(open) => { if (!open) setBossTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Boss qo&apos;shish — {bossTarget?.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateBoss} className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Ism <span className="text-red-500">*</span></label>
                <input value={bossForm.first_name}
                  onChange={(e) => setBossForm((f) => ({ ...f, first_name: e.target.value }))}
                  className={inputCls} required />
              </div>
              <div>
                <label className={labelCls}>Familiya <span className="text-red-500">*</span></label>
                <input value={bossForm.last_name}
                  onChange={(e) => setBossForm((f) => ({ ...f, last_name: e.target.value }))}
                  className={inputCls} required />
              </div>
            </div>
            <div>
              <label className={labelCls}>Telefon <span className="text-red-500">*</span></label>
              <div className="flex">
                <span className="inline-flex items-center px-3 border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm rounded-l">+998</span>
                <input type="tel" value={bossForm.phone}
                  onChange={(e) => setBossForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 9) }))}
                  placeholder="XX XXX XX XX"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-r text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
              </div>
            </div>
            <div>
              <label className={labelCls}>Parol <span className="text-red-500">*</span></label>
              <input type="password" value={bossForm.password}
                onChange={(e) => setBossForm((f) => ({ ...f, password: e.target.value }))}
                className={inputCls} required minLength={6} />
            </div>
            <div className="px-3 py-2 bg-blue-50 rounded text-xs text-blue-700">
              Rol: <span className="font-semibold">Boss</span>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setBossTarget(null)}
                className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50">Bekor qilish</button>
              <button type="submit" disabled={savingBoss}
                className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-60">
                {savingBoss ? '...' : 'Yaratish'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
