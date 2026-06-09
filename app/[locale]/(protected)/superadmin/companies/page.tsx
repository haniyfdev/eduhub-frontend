'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useTranslations } from 'next-intl';
import { X, Users, Phone, MapPin, Plus, Eye, EyeOff, MoreHorizontal, RotateCcw, Search } from 'lucide-react';
import api from '@/lib/axios';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import toast from 'react-hot-toast';

/* ══════════ Types ══════════ */

interface CompanyCard {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  status: string;
  logo: string | null;
  branch_of: string | null;
  branch_of_name: string | null;
  is_branch: boolean;
  active_student_count: number;
  subscription_status: 'pending' | 'partial' | 'paid' | 'overdue' | null;
  branches: { id: string; name: string }[];
  created_at: string;
}

interface CompanyDetail extends CompanyCard {
  total_students: number;
  active_students: number;
  trial_students: number;
  frozen_students: number;
  pending_students: number;
  rejected_students: number;
  archived_students: number;
}

type CompanyWithBadge = CompanyCard & { badge: string };

interface CreateForm {
  name: string;
  phone: string;
  address: string;
  isBranch: boolean;
  parentId: string;
  bossFirstName: string;
  bossLastName: string;
  bossPhone: string;
  bossPassword: string;
}

/* ══════════ Constants ══════════ */

const EMPTY_FORM: CreateForm = {
  name: '', phone: '', address: '',
  isBranch: false, parentId: '',
  bossFirstName: '', bossLastName: '',
  bossPhone: '', bossPassword: '',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  partial:  'bg-orange-100 text-orange-800 border-orange-200',
  paid:     'bg-green-100  text-green-800  border-green-200',
  overdue:  'bg-red-100    text-red-800    border-red-200',
};

const STATUS_DOT: Record<string, string> = {
  pending: 'bg-yellow-400',
  partial:  'bg-orange-400',
  paid:     'bg-green-400',
  overdue:  'bg-red-500',
};

const CONVERSION_ROWS = [
  { key: 'active',   color: 'bg-green-500'  },
  { key: 'trial',    color: 'bg-blue-500'   },
  { key: 'frozen',   color: 'bg-cyan-500'   },
  { key: 'pending',  color: 'bg-yellow-500' },
  { key: 'rejected', color: 'bg-red-500'    },
  { key: 'archived', color: 'bg-gray-400'   },
] as const;

type ConversionKey = typeof CONVERSION_ROWS[number]['key'];

const BACKDROP = 'fixed top-0 left-0 w-screen h-screen z-50 bg-black/50 flex items-center justify-center';
const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';
const labelCls = 'block text-sm font-medium text-gray-700 mb-1.5';
const errorCls = 'text-red-500 text-xs mt-1';

/* ══════════ Helpers ══════════ */

function getCount(detail: CompanyDetail, key: ConversionKey): number {
  return {
    active:   detail.active_students,
    trial:    detail.trial_students,
    frozen:   detail.frozen_students,
    pending:  detail.pending_students,
    rejected: detail.rejected_students,
    archived: detail.archived_students,
  }[key];
}

function buildHierarchicalList(companies: CompanyCard[]): CompanyWithBadge[] {
  const parents = companies
    .filter(c => !c.branch_of)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const result: CompanyWithBadge[] = [];
  const includedIds = new Set<string>();

  parents.forEach((parent, pIdx) => {
    const pNum = pIdx + 1;
    result.push({ ...parent, badge: String(pNum) });
    includedIds.add(parent.id);
    companies
      .filter(c => c.branch_of === parent.id)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .forEach((branch, bIdx) => {
        result.push({ ...branch, badge: `${pNum}.${bIdx + 1}` });
        includedIds.add(branch.id);
      });
  });

  // Orphan branches: parent is not in the current result set (e.g. partial search results).
  // Still render them so the grid is never empty when companies state has items.
  companies
    .filter(c => c.branch_of && !includedIds.has(c.id))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .forEach(branch => result.push({ ...branch, badge: '↳' }));

  return result;
}

function CompanyInitials({ name, className }: { name: string; className?: string }) {
  const initials = name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
  return (
    <div className={cn('w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-500 to-blue-700 text-white font-bold select-none', className)}>
      {initials}
    </div>
  );
}

/* ══════════ Page ══════════ */

export default function SuperadminCompaniesPage() {
  const t = useTranslations('superadmin');

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  /* ── filter ── */
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived'>('active');

  /* ── list ── */
  const [companies, setCompanies] = useState<CompanyCard[]>([]);
  const [loading, setLoading] = useState(true);

  /* ── detail ── */
  const [selected, setSelected] = useState<CompanyWithBadge | null>(null);
  const [detail, setDetail] = useState<CompanyDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  /* ── search ── */
  const [search, setSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── card menu ── */
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  /* ── archive/unarchive confirm ── */
  const [archiveTarget, setArchiveTarget] = useState<CompanyWithBadge | null>(null);
  const [unarchiveTarget, setUnarchiveTarget] = useState<CompanyWithBadge | null>(null);
  const [archiving, setArchiving] = useState(false);

  /* ── create modal ── */
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});

  const set = useCallback(<K extends keyof CreateForm>(k: K, v: CreateForm[K]) =>
    setForm(p => ({ ...p, [k]: v })), []);

  /* ── fetch ── */
  const fetchCompanies = useCallback(async (filter: 'active' | 'archived' = 'active', q = '') => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: filter });
      if (q) params.set('search', q);
      const { data } = await api.get<CompanyCard[]>(`/api/superadmin/companies/?${params}`);
      setCompanies(data);
    } catch {
      //
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearchQuery(search), 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  useEffect(() => { fetchCompanies(statusFilter, searchQuery); }, [fetchCompanies, statusFilter, searchQuery]);

  /* ── close menu on outside click ── */
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    }
    if (openMenuId) document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [openMenuId]);

  /* ── keyboard escape ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showCreate) { resetCreate(); return; }
      if (archiveTarget) { setArchiveTarget(null); return; }
      if (unarchiveTarget) { setUnarchiveTarget(null); return; }
      setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCreate, archiveTarget, unarchiveTarget]);

  useEffect(() => {
    return () => { if (logoPreview) URL.revokeObjectURL(logoPreview); };
  }, [logoPreview]);

  /* ── detail open ── */
  const openDetail = useCallback(async (company: CompanyWithBadge) => {
    setSelected(company);
    setOpenMenuId(null);
    setDetail(null);
    setDetailLoading(true);
    try {
      const { data } = await api.get<CompanyDetail>(`/api/superadmin/companies/${company.id}/`);
      setDetail(data);
    } catch {
      //
    } finally {
      setDetailLoading(false);
    }
  }, []);

  /* ── archive ── */
  async function handleArchive() {
    if (!archiveTarget) return;
    setArchiving(true);
    try {
      await api.post(`/api/superadmin/companies/${archiveTarget.id}/archive/`);
      toast.success(t('archiveSuccess' as Parameters<typeof t>[0]));
      setArchiveTarget(null);
      fetchCompanies(statusFilter, searchQuery);
    } catch {
      toast.error(t('genericError' as Parameters<typeof t>[0]));
    } finally {
      setArchiving(false);
    }
  }

  /* ── unarchive ── */
  async function handleUnarchive() {
    if (!unarchiveTarget) return;
    setArchiving(true);
    try {
      await api.post(`/api/superadmin/companies/${unarchiveTarget.id}/unarchive/`);
      toast.success(t('unarchiveSuccess' as Parameters<typeof t>[0]));
      setUnarchiveTarget(null);
      fetchCompanies(statusFilter, searchQuery);
    } catch {
      toast.error(t('genericError' as Parameters<typeof t>[0]));
    } finally {
      setArchiving(false);
    }
  }

  /* ── create modal helpers ── */
  function resetCreate() {
    setForm(EMPTY_FORM);
    setLogoFile(null);
    setLogoPreview(null);
    setShowPassword(false);
    setCreateErrors({});
    setShowCreate(false);
  }

  function handlePhoneInput(field: 'phone' | 'bossPhone', raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 9);
    set(field, digits);
  }

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    setLogoPreview(URL.createObjectURL(file));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateErrors({});

    const clientErrors: Record<string, string> = {};
    if (form.isBranch && !form.parentId) {
      clientErrors.parent = t('selectParentError' as Parameters<typeof t>[0]);
    }
    const phoneLen = t('phoneLength' as Parameters<typeof t>[0]);
    if (form.phone.length < 9) clientErrors.phone = phoneLen;
    if (!form.isBranch && form.bossPhone.length < 9) clientErrors.boss_phone = phoneLen;
    if (Object.keys(clientErrors).length > 0) { setCreateErrors(clientErrors); return; }

    const fd = new FormData();
    fd.append('name', form.name);
    fd.append('phone', '+998' + form.phone);
    fd.append('address', form.address);
    if (logoFile) fd.append('logo', logoFile);
    if (form.isBranch && form.parentId) fd.append('parent', form.parentId);
    if (!form.isBranch) {
      fd.append('boss_first_name', form.bossFirstName);
      fd.append('boss_last_name', form.bossLastName);
      fd.append('boss_phone', '+998' + form.bossPhone);
      fd.append('boss_password', form.bossPassword);
    }

    setCreating(true);
    try {
      await api.post('/api/superadmin/companies/', fd);
      toast.success(t('companyCreated' as Parameters<typeof t>[0]));
      resetCreate();
      fetchCompanies(statusFilter, searchQuery);
    } catch (err: unknown) {
      const data = (err as { response?: { data?: Record<string, string> } })?.response?.data;
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        setCreateErrors(data as Record<string, string>);
        toast.error(t('formErrors' as Parameters<typeof t>[0]));
      } else {
        toast.error(t('genericError' as Parameters<typeof t>[0]));
      }
    } finally {
      setCreating(false);
    }
  }

  const parentCompanies = companies.filter(c => !c.is_branch);
  const hierarchical = buildHierarchicalList(companies);

  /* ══════════════════════════════ MODALS ══════════════════════════════ */

  /* Detail modal */
  const detailModal = selected ? (
    <div className={BACKDROP} onClick={() => setSelected(null)}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="relative min-h-40 bg-gradient-to-br from-blue-500 to-blue-700 rounded-t-2xl flex-shrink-0">
          {selected.logo ? (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <img src={selected.logo} alt={selected.name} className="max-h-24 max-w-full object-contain" />
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-white font-bold text-7xl select-none opacity-20 tracking-tight">
              {selected.name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')}
            </div>
          )}
          <button
            onClick={() => setSelected(null)}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/25 hover:bg-black/45 flex items-center justify-center text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-8 space-y-5 overflow-y-auto flex-1">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{selected.name}</h2>
            {selected.is_branch && selected.branch_of_name && (
              <p className="text-base text-gray-500 mt-0.5">{t('branch')}: {selected.branch_of_name}</p>
            )}
          </div>

          <div className="space-y-3">
            {selected.phone && (
              <div className="flex items-center gap-3 text-base text-gray-700">
                <Phone className="w-5 h-5 text-gray-400 flex-shrink-0" />
                <span>{selected.phone}</span>
              </div>
            )}
            {selected.address && (
              <div className="flex items-start gap-3 text-base text-gray-700">
                <MapPin className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                <span>{selected.address}</span>
              </div>
            )}
            <div className="flex items-center gap-3 text-base text-gray-700">
              <Users className="w-5 h-5 text-gray-400 flex-shrink-0" />
              <span>
                <span className="font-semibold text-gray-900">{selected.active_student_count}</span>
                {' '}{t('activeStudents')}
              </span>
            </div>
          </div>

          {selected.subscription_status && (
            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
              <span className="text-base text-gray-500">{t('subscriptionStatus')}</span>
              <span className={cn(
                'inline-flex items-center gap-2 px-3 py-1 text-base font-medium rounded-full border',
                STATUS_COLORS[selected.subscription_status] ?? 'bg-gray-100 text-gray-600 border-gray-200',
              )}>
                <span className={cn('w-2 h-2 rounded-full', STATUS_DOT[selected.subscription_status] ?? 'bg-gray-400')} />
                {t(`status.${selected.subscription_status}` as Parameters<typeof t>[0])}
              </span>
            </div>
          )}

          {selected.branches.length > 0 && (
            <div className="pt-3 border-t border-gray-100">
              <p className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-3">Filiallar</p>
              <div className="flex flex-wrap gap-1.5">
                {selected.branches.map(b => (
                  <span key={b.id} className="px-3 py-1 bg-blue-50 text-blue-700 text-sm rounded-full border border-blue-100">
                    {b.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="pt-3 border-t border-gray-100">
            <p className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-4">
              {t('conversion.title' as Parameters<typeof t>[0])}
            </p>
            {detailLoading ? (
              <div className="space-y-3">
                {Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-6 w-full rounded" />)}
              </div>
            ) : detail ? (() => {
              const grandTotal = Math.max(1,
                detail.active_students + detail.trial_students + detail.frozen_students +
                detail.archived_students + detail.pending_students + detail.rejected_students,
              );
              return (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="w-36 text-sm text-gray-600 truncate">{t('conversion.total' as Parameters<typeof t>[0])}</span>
                    <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-blue-600 w-full" />
                    </div>
                    <span className="w-7 text-right text-sm font-medium text-gray-700">{grandTotal}</span>
                    <span className="w-10 text-right text-sm text-gray-400">100%</span>
                  </div>
                  {CONVERSION_ROWS.map(({ key, color }) => {
                    const count = getCount(detail, key);
                    const pct = Math.round((count / grandTotal) * 100);
                    return (
                      <div key={key} className="flex items-center gap-3">
                        <span className="w-36 text-sm text-gray-600 truncate">
                          {t(`conversion.${key}` as Parameters<typeof t>[0])}
                        </span>
                        <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-7 text-right text-sm font-medium text-gray-700">{count}</span>
                        <span className="w-10 text-right text-sm text-gray-400">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              );
            })() : null}
          </div>
        </div>
      </div>
    </div>
  ) : null;

  /* Archive confirm modal */
  const archiveModal = archiveTarget ? (
    <div className={BACKDROP} onClick={() => setArchiveTarget(null)}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-900 mb-2">
          {t('archiveConfirm' as Parameters<typeof t>[0])}
        </h3>
        <p className="text-sm text-gray-600 mb-1">
          <span className="font-semibold">"{archiveTarget.name}"</span>
        </p>
        <p className="text-sm text-red-600 mb-6">
          {t('archiveWarning' as Parameters<typeof t>[0])}
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setArchiveTarget(null)}
            className="flex-1 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            {t('cancel' as Parameters<typeof t>[0])}
          </button>
          <button
            type="button"
            onClick={handleArchive}
            disabled={archiving}
            className="flex-1 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-60 transition-colors"
          >
            {archiving ? '...' : t('archive' as Parameters<typeof t>[0])}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  /* Unarchive confirm modal */
  const unarchiveModal = unarchiveTarget ? (
    <div className={BACKDROP} onClick={() => setUnarchiveTarget(null)}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-900 mb-2">
          {t('unarchive' as Parameters<typeof t>[0])}
        </h3>
        <p className="text-sm text-gray-600 mb-6">
          <span className="font-semibold">"{unarchiveTarget.name}"</span>{' '}
          kompaniyasini qayta tiklashni tasdiqlaysizmi?
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setUnarchiveTarget(null)}
            className="flex-1 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            {t('cancel' as Parameters<typeof t>[0])}
          </button>
          <button
            type="button"
            onClick={handleUnarchive}
            disabled={archiving}
            className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
          >
            {archiving ? '...' : t('unarchive' as Parameters<typeof t>[0])}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  /* Create modal */
  const createModal = showCreate ? (
    <div className={BACKDROP} onClick={resetCreate}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden flex flex-col max-h-[92vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">
            {t('addCompany' as Parameters<typeof t>[0])}
          </h2>
          <button onClick={resetCreate} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleCreate} className="overflow-y-auto flex-1">
          <div className="px-6 py-5 space-y-5">
            <div className="pb-1">
              <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide bg-blue-50 px-3 py-1.5 rounded-md">
                {t('companyInfo' as Parameters<typeof t>[0])}
              </p>
            </div>

            <div>
              <label className={labelCls}>{t('companyName' as Parameters<typeof t>[0])} <span className="text-red-500">*</span></label>
              <input className={inputCls} value={form.name} onChange={e => set('name', e.target.value)}
                placeholder={t('namePlaceholder' as Parameters<typeof t>[0])} required />
              {createErrors.name && <p className={errorCls}>{createErrors.name}</p>}
            </div>

            <div>
              <label className={labelCls}>{t('phone')} <span className="text-red-500">*</span></label>
              <div className="flex">
                <span className={cn('inline-flex items-center px-3 border border-r-0 rounded-l-lg bg-gray-50 text-gray-600 text-sm',
                  createErrors.phone ? 'border-red-400' : 'border-gray-300')}>+998</span>
                <input
                  className={cn('flex-1 px-3 py-2 border rounded-r-lg text-sm focus:outline-none focus:ring-2',
                    createErrors.phone ? 'border-red-400 focus:ring-red-400' : 'border-gray-300 focus:ring-blue-500')}
                  value={form.phone} onChange={e => handlePhoneInput('phone', e.target.value)}
                  placeholder="901234567" inputMode="numeric" maxLength={9} required />
              </div>
              {createErrors.phone && <p className={errorCls}>{createErrors.phone}</p>}
            </div>

            <div>
              <label className={labelCls}>{t('address' as Parameters<typeof t>[0])} <span className="text-red-500">*</span></label>
              <input className={inputCls} value={form.address} onChange={e => set('address', e.target.value)}
                placeholder={t('addressPlaceholder' as Parameters<typeof t>[0])} required />
              {createErrors.address && <p className={errorCls}>{createErrors.address}</p>}
            </div>

            <div>
              <label className={labelCls}>{t('logo' as Parameters<typeof t>[0])}</label>
              <label className="flex items-center gap-4 cursor-pointer">
                <div className="w-16 h-16 rounded-xl border-2 border-dashed border-gray-300 hover:border-blue-400 transition-colors overflow-hidden flex-shrink-0 flex items-center justify-center bg-gray-50">
                  {logoPreview
                    ? <img src={logoPreview} alt="preview" className="w-full h-full object-cover" />
                    : <span className="text-gray-400 text-[10px] text-center leading-tight px-1">{t('logoUpload' as Parameters<typeof t>[0])}</span>
                  }
                </div>
                <div className="text-sm text-gray-500">
                  <span className="text-blue-600 hover:underline">{t('chooseImage' as Parameters<typeof t>[0])}</span>{' '}
                  ({t('optional' as Parameters<typeof t>[0])})
                  <p className="text-xs text-gray-400 mt-0.5">{t('imageFormats' as Parameters<typeof t>[0])}</p>
                </div>
                <input type="file" accept="image/*" className="sr-only" onChange={handleLogoChange} />
              </label>
            </div>

            <div className="flex items-center gap-3">
              <input id="is-branch" type="checkbox"
                className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                checked={form.isBranch}
                onChange={e => { set('isBranch', e.target.checked); if (!e.target.checked) set('parentId', ''); }} />
              <label htmlFor="is-branch" className="text-sm font-medium text-gray-700 cursor-pointer">
                {t('isBranch' as Parameters<typeof t>[0])}
              </label>
            </div>

            {form.isBranch && (
              <div>
                <label className={labelCls}>{t('parentCompany' as Parameters<typeof t>[0])} <span className="text-red-500">*</span></label>
                <select className={inputCls} value={form.parentId}
                  onChange={e => set('parentId', e.target.value)} required={form.isBranch}>
                  <option value="">{t('selectPlaceholder' as Parameters<typeof t>[0])}</option>
                  {parentCompanies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {createErrors.parent && <p className={errorCls}>{createErrors.parent}</p>}
              </div>
            )}

            {!form.isBranch && (
              <>
                <div className="pt-2 pb-1">
                  <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide bg-blue-50 px-3 py-1.5 rounded-md">
                    {t('bossInfo' as Parameters<typeof t>[0])}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>{t('bossFirstName' as Parameters<typeof t>[0])} <span className="text-red-500">*</span></label>
                    <input className={inputCls} value={form.bossFirstName} onChange={e => set('bossFirstName', e.target.value)}
                      placeholder={t('firstNamePlaceholder' as Parameters<typeof t>[0])} required />
                    {createErrors.boss_first_name && <p className={errorCls}>{createErrors.boss_first_name}</p>}
                  </div>
                  <div>
                    <label className={labelCls}>{t('bossLastName' as Parameters<typeof t>[0])} <span className="text-red-500">*</span></label>
                    <input className={inputCls} value={form.bossLastName} onChange={e => set('bossLastName', e.target.value)}
                      placeholder={t('lastNamePlaceholder' as Parameters<typeof t>[0])} required />
                    {createErrors.boss_last_name && <p className={errorCls}>{createErrors.boss_last_name}</p>}
                  </div>
                </div>

                <div>
                  <label className={labelCls}>{t('bossPhone' as Parameters<typeof t>[0])} <span className="text-red-500">*</span></label>
                  <div className="flex">
                    <span className={cn('inline-flex items-center px-3 border border-r-0 rounded-l-lg bg-gray-50 text-gray-600 text-sm',
                      createErrors.boss_phone ? 'border-red-400' : 'border-gray-300')}>+998</span>
                    <input
                      className={cn('flex-1 px-3 py-2 border rounded-r-lg text-sm focus:outline-none focus:ring-2',
                        createErrors.boss_phone ? 'border-red-400 focus:ring-red-400' : 'border-gray-300 focus:ring-blue-500')}
                      value={form.bossPhone} onChange={e => handlePhoneInput('bossPhone', e.target.value)}
                      placeholder="901234567" inputMode="numeric" maxLength={9} required />
                  </div>
                  {createErrors.boss_phone && <p className={errorCls}>{createErrors.boss_phone}</p>}
                </div>

                <div>
                  <label className={labelCls}>{t('bossPassword' as Parameters<typeof t>[0])} <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <input type={showPassword ? 'text' : 'password'}
                      className={cn(inputCls, 'pr-10')}
                      value={form.bossPassword} onChange={e => set('bossPassword', e.target.value)}
                      placeholder={t('passwordPlaceholder' as Parameters<typeof t>[0])} required minLength={4} />
                    <button type="button" onClick={() => setShowPassword(p => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {createErrors.boss_password && <p className={errorCls}>{createErrors.boss_password}</p>}
                </div>
              </>
            )}

            {createErrors.detail && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{createErrors.detail}</p>
            )}
          </div>

          <div className="px-6 py-4 border-t border-gray-100 flex gap-3 bg-gray-50">
            <button type="button" onClick={resetCreate}
              className="flex-1 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-100 transition-colors">
              {t('cancel' as Parameters<typeof t>[0])}
            </button>
            <button type="submit" disabled={creating}
              className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors">
              {creating ? t('saving' as Parameters<typeof t>[0]) : t('save' as Parameters<typeof t>[0])}
            </button>
          </div>
        </form>
      </div>
    </div>
  ) : null;

  /* ══════════════════════════════ JSX ══════════════════════════════ */
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">{t('companies')}</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{companies.length} ta kompaniya</span>
          {statusFilter === 'active' && (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              {t('addCompany' as Parameters<typeof t>[0])}
            </button>
          )}
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {(['active', 'archived'] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              'px-4 py-1.5 text-sm font-medium rounded-md transition-all',
              statusFilter === s
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700',
            )}
          >
            {t(s as Parameters<typeof t>[0])}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative w-full max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchCompanies' as Parameters<typeof t>[0])}
          className="w-full pl-9 pr-8 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array(8).fill(0).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      ) : companies.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          {statusFilter === 'archived' ? 'Arxivlangan kompaniyalar yo\'q' : 'Kompaniyalar yo\'q'}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {hierarchical.map((company) => (
            <div
              key={company.id}
              className={cn(
                'group relative aspect-square rounded-xl overflow-hidden border transition-all duration-200',
                statusFilter === 'archived'
                  ? 'border-gray-200 opacity-70'
                  : 'border-gray-200 hover:border-blue-300 hover:shadow-md hover:scale-[1.02]',
              )}
            >
              {/* Background */}
              <div className="absolute inset-0 opacity-20">
                {company.logo
                  ? <img src={company.logo} alt="" className="w-full h-full object-cover" />
                  : <CompanyInitials name={company.name} />}
              </div>
              <div className={cn(
                'absolute inset-0',
                statusFilter === 'archived' ? 'bg-gray-200/70' : 'bg-white/70 group-hover:bg-white/60 transition-colors',
              )} />

              {/* Badge */}
              <div className="absolute top-2 left-2 min-w-8 h-8 px-1.5 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center shadow-sm z-10 leading-none">
                {company.badge}
              </div>

              {/* ⋯ menu (active only) */}
              {statusFilter === 'active' && (
                <div className="absolute top-2 right-2 z-10" ref={openMenuId === company.id ? menuRef : null}>
                  <button
                    onClick={e => { e.stopPropagation(); setOpenMenuId(prev => prev === company.id ? null : company.id); }}
                    className="w-7 h-7 rounded-full bg-white/80 hover:bg-white flex items-center justify-center text-gray-600 shadow-sm transition-colors"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                  {openMenuId === company.id && (
                    <div className="absolute right-0 top-8 bg-white rounded-xl shadow-lg border border-gray-100 py-1 w-36 z-20">
                      <button
                        onClick={e => { e.stopPropagation(); openDetail(company); }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        {t('details' as Parameters<typeof t>[0])}
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); setOpenMenuId(null); setArchiveTarget(company); }}
                        className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                      >
                        {t('archive' as Parameters<typeof t>[0])}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Card content */}
              <button
                onClick={() => statusFilter === 'active' ? openDetail(company) : undefined}
                className="relative h-full w-full flex flex-col items-center justify-center p-3 gap-2"
              >
                <div className="w-14 h-14 rounded-xl overflow-hidden shadow-sm border border-white/50 flex-shrink-0">
                  {company.logo
                    ? <img src={company.logo} alt={company.name} className="w-full h-full object-cover" />
                    : <CompanyInitials name={company.name} className="text-2xl" />}
                </div>
                <p className="font-semibold text-gray-900 text-sm text-center leading-tight line-clamp-2">
                  {company.name}
                </p>
                {company.is_branch && company.branch_of_name && (
                  <p className="text-xs text-gray-500 text-center">{company.branch_of_name}</p>
                )}
                {company.subscription_status && (
                  <span className={cn(
                    'inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border',
                    STATUS_COLORS[company.subscription_status] ?? 'bg-gray-100 text-gray-600 border-gray-200',
                  )}>
                    <span className={cn('w-1.5 h-1.5 rounded-full', STATUS_DOT[company.subscription_status] ?? 'bg-gray-400')} />
                    {t(`status.${company.subscription_status}` as Parameters<typeof t>[0])}
                  </span>
                )}

                {/* Unarchive button (archived view only) */}
                {statusFilter === 'archived' && (
                  <button
                    onClick={e => { e.stopPropagation(); setUnarchiveTarget(company); }}
                    className="flex items-center gap-1 px-2.5 py-1 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors mt-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    {t('unarchive' as Parameters<typeof t>[0])}
                  </button>
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Portals */}
      {mounted && ReactDOM.createPortal(detailModal, document.body)}
      {mounted && ReactDOM.createPortal(archiveModal, document.body)}
      {mounted && ReactDOM.createPortal(unarchiveModal, document.body)}
      {mounted && ReactDOM.createPortal(createModal, document.body)}
    </div>
  );
}
