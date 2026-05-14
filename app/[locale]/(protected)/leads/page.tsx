'use client';

import { useEffect, useState, useCallback } from 'react';
import { UserPlus, Search, ArrowUp, ArrowDown } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { UserTable, ColumnDef } from '@/components/user-table';
import api from '@/lib/axios';
import { cn, formatPhone } from '@/lib/utils';
import { getUser } from '@/lib/auth';

interface Lead {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  course: string | null;
  course_name: string | null;
  status: 'pending' | 'trial' | 'active';
  current_group: string | null;
  created_at: string;
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  trial:   'bg-blue-50 text-blue-700 border-blue-200',
  active:  'bg-green-50 text-green-700 border-green-200',
};
const STATUS_LABELS: Record<string, string> = {
  pending: 'Kutilmoqda',
  trial:   'Sinov',
  active:  'Faol',
};

const EMPTY_FORM = { first_name: '', last_name: '', phone: '', course_id: '' };

interface Course { id: string; name: string; }

export default function LeadsPage() {
  const [leads, setLeads]         = useState<Lead[]>([]);
  const [filtered, setFiltered]   = useState<Lead[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [statusFilter, setStatus] = useState('');
  const [showAdd, setShowAdd]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [courses, setCourses]     = useState<Course[]>([]);
  const [actionTarget, setActionTarget] = useState<{ lead: Lead; action: 'promote' | 'demote' } | null>(null);
  const [acting, setActing]       = useState(false);

  const canEdit = ['boss', 'manager', 'admin'].includes(getUser()?.role ?? '');

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page_size: '200' };
      if (statusFilter) params.status = statusFilter;
      const { data } = await api.get('/api/v1/leads/', { params });
      const list: Lead[] = Array.isArray(data) ? data : (data.results ?? []);
      setLeads(list);
    } catch {
      toast.error('Leadlarni yuklashda xatolik');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(
      q
        ? leads.filter(
            (l) =>
              `${l.first_name} ${l.last_name}`.toLowerCase().includes(q) ||
              l.phone.includes(q),
          )
        : leads,
    );
  }, [search, leads]);

  async function fetchCourses() {
    try {
      const { data } = await api.get('/api/v1/courses/?page_size=100');
      setCourses(Array.isArray(data) ? data : (data.results ?? []));
    } catch {}
  }

  useEffect(() => { fetchCourses(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.first_name.trim() || !form.last_name.trim() || !form.phone.trim()) {
      toast.error('Ism, familiya va telefon majburiy');
      return;
    }
    setSaving(true);
    try {
      await api.post('/api/v1/leads/', {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone: form.phone.trim(),
        course: form.course_id || null,
      });
      toast.success('Lead qo\'shildi');
      setShowAdd(false);
      setForm(EMPTY_FORM);
      fetchLeads();
    } catch {
      toast.error('Xatolik yuz berdi');
    } finally {
      setSaving(false);
    }
  }

  async function handleAction() {
    if (!actionTarget) return;
    setActing(true);
    try {
      await api.post(`/api/v1/leads/${actionTarget.lead.id}/${actionTarget.action}/`);
      toast.success(
        actionTarget.action === 'promote'
          ? 'Muvaffaqiyatli ko\'tarildi'
          : 'Muvaffaqiyatli tushirildi',
      );
      setActionTarget(null);
      fetchLeads();
    } catch {
      toast.error('Xatolik yuz berdi');
    } finally {
      setActing(false);
    }
  }

  // Counts
  const pendingCount = leads.filter((l) => l.status === 'pending').length;
  const trialCount   = leads.filter((l) => l.status === 'trial').length;
  const activeCount  = leads.filter((l) => l.status === 'active').length;

  const columns: ColumnDef<Lead>[] = [
    {
      key: 'name',
      header: "O'quvchi",
      render: (row) => (
        <div>
          <p className="font-medium text-gray-900">{row.first_name} {row.last_name}</p>
          <p className="text-xs text-gray-400">{formatPhone(row.phone)}</p>
        </div>
      ),
    },
    {
      key: 'course',
      header: 'Kurs',
      render: (row) => <span className="text-gray-600">{row.course_name ?? '—'}</span>,
    },
    {
      key: 'group',
      header: 'Guruh',
      render: (row) => <span className="text-gray-600">{row.current_group ?? '—'}</span>,
    },
    {
      key: 'status',
      header: 'Holat',
      render: (row) => (
        <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border', STATUS_STYLES[row.status])}>
          {STATUS_LABELS[row.status]}
        </span>
      ),
    },
    {
      key: 'date',
      header: 'Qo\'shilgan',
      render: (row) => (
        <span className="text-xs text-gray-400">
          {new Date(row.created_at).toLocaleDateString('uz-UZ')}
        </span>
      ),
    },
    ...(canEdit ? [{
      key: 'actions',
      header: '',
      render: (row: Lead) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {row.status !== 'active' && (
            <button
              onClick={() => setActionTarget({ lead: row, action: 'promote' })}
              title="Ko'tarish"
              className="p-1.5 rounded text-green-600 hover:bg-green-50 transition-colors"
            >
              <ArrowUp className="w-4 h-4" />
            </button>
          )}
          {row.status !== 'pending' && (
            <button
              onClick={() => setActionTarget({ lead: row, action: 'demote' })}
              title="Tushirish"
              className="p-1.5 rounded text-orange-500 hover:bg-orange-50 transition-colors"
            >
              <ArrowDown className="w-4 h-4" />
            </button>
          )}
        </div>
      ),
    }] : []),
  ];

  return (
    <div className="space-y-5">
      <Toaster position="top-right" />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <UserPlus className="w-6 h-6 text-blue-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Leadlar</h1>
            <p className="text-xs text-gray-500">Potentsial va sinov o&apos;quvchilar</p>
          </div>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Qo&apos;shish
          </button>
        )}
      </div>

      {/* Funnel stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Kutilmoqda', count: pendingCount, color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200' },
          { label: 'Sinov', count: trialCount, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
          { label: 'Faol', count: activeCount, color: 'text-green-600', bg: 'bg-green-50 border-green-200' },
        ].map(({ label, count, color, bg }) => (
          <div key={label} className={cn('rounded-lg border p-4 text-center', bg)}>
            <p className={cn('text-3xl font-bold', color)}>{count}</p>
            <p className="text-xs text-gray-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Qidirish..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatus(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Barcha holat</option>
          <option value="pending">Kutilmoqda</option>
          <option value="trial">Sinov</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <UserTable
          columns={columns}
          rows={filtered}
          loading={loading}
          skeletonRows={6}
          emptyMessage="Leadlar topilmadi"
          keyExtractor={(row) => row.id}
        />
      </div>

      {/* Add Lead Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Yangi lead qo&apos;shish</DialogTitle></DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ism <span className="text-red-500">*</span></label>
                <input
                  value={form.first_name}
                  onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Familiya <span className="text-red-500">*</span></label>
                <input
                  value={form.last_name}
                  onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telefon <span className="text-red-500">*</span></label>
              <input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+998XXXXXXXXX"
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kurs</label>
              <select
                value={form.course_id}
                onChange={(e) => setForm((f) => ({ ...f, course_id: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Tanlang</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
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

      {/* Promote/Demote Confirm */}
      <Dialog open={!!actionTarget} onOpenChange={() => setActionTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {actionTarget?.action === 'promote' ? 'Ko\'tarishni tasdiqlang' : 'Tushirishni tasdiqlang'}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 mt-2">
            <span className="font-medium">{actionTarget?.lead.first_name} {actionTarget?.lead.last_name}</span>
            {actionTarget?.action === 'promote'
              ? ` — ${STATUS_LABELS[actionTarget.lead.status]} → ${STATUS_LABELS[actionTarget.lead.status === 'pending' ? 'trial' : 'active']}`
              : ` — ${STATUS_LABELS[actionTarget?.lead.status ?? '']} → ${STATUS_LABELS[actionTarget?.lead.status === 'trial' ? 'pending' : 'trial']}`}
          </p>
          <div className="flex gap-3 mt-4">
            <button
              onClick={() => setActionTarget(null)}
              className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50"
            >
              Bekor
            </button>
            <button
              onClick={handleAction}
              disabled={acting}
              className={cn(
                'flex-1 px-4 py-2 text-white text-sm font-medium rounded disabled:opacity-60',
                actionTarget?.action === 'promote' ? 'bg-green-600 hover:bg-green-700' : 'bg-orange-500 hover:bg-orange-600',
              )}
            >
              {acting ? '...' : actionTarget?.action === 'promote' ? "Ko'tarish" : 'Tushirish'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
