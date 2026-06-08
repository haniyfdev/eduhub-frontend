'use client';

import { useEffect, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useTranslations } from 'next-intl';
import { X, Users, Phone, MapPin, Plus, Eye, EyeOff } from 'lucide-react';
import api from '@/lib/axios';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import toast from 'react-hot-toast';

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

function getCount(detail: CompanyDetail, key: ConversionKey): number {
  const map: Record<ConversionKey, number> = {
    active:   detail.active_students,
    trial:    detail.trial_students,
    frozen:   detail.frozen_students,
    pending:  detail.pending_students,
    rejected: detail.rejected_students,
    archived: detail.archived_students,
  };
  return map[key];
}

function buildHierarchicalList(companies: CompanyCard[]): CompanyWithBadge[] {
  const parents = companies
    .filter(c => !c.branch_of)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const result: CompanyWithBadge[] = [];
  parents.forEach((parent, pIdx) => {
    const pNum = pIdx + 1;
    result.push({ ...parent, badge: String(pNum) });
    companies
      .filter(c => c.branch_of === parent.id)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .forEach((branch, bIdx) => {
        result.push({ ...branch, badge: `${pNum}.${bIdx + 1}` });
      });
  });
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

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';
const labelCls = 'block text-sm font-medium text-gray-700 mb-1.5';
const errorCls = 'text-red-500 text-xs mt-1';

const BACKDROP = 'fixed top-0 left-0 w-screen h-screen z-50 bg-black/50 flex items-center justify-center';

export default function SuperadminCompaniesPage() {
  const t = useTranslations('superadmin');

  /* ── portal mount guard (SSR-safe) ── */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  /* ── detail state ── */
  const [companies, setCompanies] = useState<CompanyCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CompanyWithBadge | null>(null);
  const [detail, setDetail] = useState<CompanyDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  /* ── create modal state ── */
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
  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<CompanyCard[]>('/api/superadmin/companies/');
      setCompanies(data);
    } catch {
      //
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCompanies(); }, [fetchCompanies]);

  /* ── keyboard ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showCreate) { resetCreate(); return; }
      setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCreate]);

  /* ── logo preview cleanup ── */
  useEffect(() => {
    return () => { if (logoPreview) URL.revokeObjectURL(logoPreview); };
  }, [logoPreview]);

  /* ── detail modal open ── */
  const openDetail = useCallback(async (company: CompanyWithBadge) => {
    setSelected(company);
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

  const closeModal = useCallback(() => setSelected(null), []);

  /* ── create modal helpers ── */
  function resetCreate() {
    setForm(EMPTY_FORM);
    setLogoFile(null);
    setLogoPreview(null);
    setShowPassword(false);
    setCreateErrors({});
    setShowCreate(false);
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

    if (form.isBranch && !form.parentId) {
      setCreateErrors({ parent: t('selectParentError' as Parameters<typeof t>[0]) });
      return;
    }

    const fd = new FormData();
    fd.append('name', form.name);
    fd.append('phone', form.phone);
    fd.append('address', form.address);
    if (logoFile) fd.append('logo', logoFile);
    if (form.isBranch && form.parentId) fd.append('parent', form.parentId);
    fd.append('boss_first_name', form.bossFirstName);
    fd.append('boss_last_name', form.bossLastName);
    fd.append('boss_phone', form.bossPhone);
    fd.append('boss_password', form.bossPassword);

    setCreating(true);
    try {
      await api.post('/api/superadmin/companies/', fd);
      toast.success(t('companyCreated' as Parameters<typeof t>[0]));
      resetCreate();
      fetchCompanies();
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

  /* ════════════════════════════════ MODALS ════════════════════════════════ */

  const detailModal = selected ? (
    <div className={BACKDROP} onClick={closeModal}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Colored header — min-h-40 */}
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
            onClick={closeModal}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/25 hover:bg-black/45 flex items-center justify-center text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="p-8 space-y-5 overflow-y-auto flex-1">
          {/* Name + branch */}
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{selected.name}</h2>
            {selected.is_branch && selected.branch_of_name && (
              <p className="text-base text-gray-500 mt-0.5">{t('branch')}: {selected.branch_of_name}</p>
            )}
          </div>

          {/* Contact info */}
          <div className="space-y-3">
            {selected.phone && (
              <div className="flex items-center gap-3 text-base text-gray-700">
                <Phone className="w-5 h-5 text-gray-400 flex-shrink-0" />
                <span className="whitespace-nowrap">{selected.phone}</span>
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

          {/* Subscription status */}
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

          {/* Branches */}
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

          {/* Conversion funnel */}
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

  const createModal = showCreate ? (
    <div className={BACKDROP} onClick={resetCreate}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden flex flex-col max-h-[92vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">
            {t('addCompany' as Parameters<typeof t>[0])}
          </h2>
          <button onClick={resetCreate} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable form body */}
        <form onSubmit={handleCreate} className="overflow-y-auto flex-1">
          <div className="px-6 py-5 space-y-5">

            {/* ── Section 1: Company ── */}
            <div className="pb-1">
              <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide bg-blue-50 px-3 py-1.5 rounded-md">
                {t('companyInfo' as Parameters<typeof t>[0])}
              </p>
            </div>

            <div>
              <label className={labelCls}>{t('companyName' as Parameters<typeof t>[0])} <span className="text-red-500">*</span></label>
              <input
                className={inputCls}
                value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder={t('namePlaceholder' as Parameters<typeof t>[0])}
                required
              />
              {createErrors.name && <p className={errorCls}>{createErrors.name}</p>}
            </div>

            <div>
              <label className={labelCls}>{t('phone')} <span className="text-red-500">*</span></label>
              <div className="flex">
                <span className="inline-flex items-center px-3 border border-r-0 border-gray-300 rounded-l-lg bg-gray-50 text-gray-600 text-sm">
                  +998
                </span>
                <input
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-r-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.phone}
                  onChange={e => set('phone', e.target.value)}
                  placeholder="90 123 45 67"
                  required
                />
              </div>
              {createErrors.phone && <p className={errorCls}>{createErrors.phone}</p>}
            </div>

            <div>
              <label className={labelCls}>{t('address' as Parameters<typeof t>[0])} <span className="text-red-500">*</span></label>
              <input
                className={inputCls}
                value={form.address}
                onChange={e => set('address', e.target.value)}
                placeholder={t('addressPlaceholder' as Parameters<typeof t>[0])}
                required
              />
              {createErrors.address && <p className={errorCls}>{createErrors.address}</p>}
            </div>

            {/* Logo upload */}
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
                  <span className="text-blue-600 hover:underline">{t('chooseImage' as Parameters<typeof t>[0])}</span> ({t('optional' as Parameters<typeof t>[0])})
                  <p className="text-xs text-gray-400 mt-0.5">{t('imageFormats' as Parameters<typeof t>[0])}</p>
                </div>
                <input type="file" accept="image/*" className="sr-only" onChange={handleLogoChange} />
              </label>
            </div>

            {/* Branch toggle */}
            <div className="flex items-center gap-3">
              <input
                id="is-branch"
                type="checkbox"
                className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                checked={form.isBranch}
                onChange={e => { set('isBranch', e.target.checked); if (!e.target.checked) set('parentId', ''); }}
              />
              <label htmlFor="is-branch" className="text-sm font-medium text-gray-700 cursor-pointer">
                {t('isBranch' as Parameters<typeof t>[0])}
              </label>
            </div>

            {form.isBranch && (
              <div>
                <label className={labelCls}>
                  {t('parentCompany' as Parameters<typeof t>[0])} <span className="text-red-500">*</span>
                </label>
                <select
                  className={inputCls}
                  value={form.parentId}
                  onChange={e => set('parentId', e.target.value)}
                  required={form.isBranch}
                >
                  <option value="">{t('selectPlaceholder' as Parameters<typeof t>[0])}</option>
                  {parentCompanies.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {createErrors.parent && <p className={errorCls}>{createErrors.parent}</p>}
              </div>
            )}

            {/* ── Section 2: Boss ── */}
            <div className="pt-2 pb-1">
              <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide bg-blue-50 px-3 py-1.5 rounded-md">
                {t('bossInfo' as Parameters<typeof t>[0])}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>
                  {t('bossFirstName' as Parameters<typeof t>[0])} <span className="text-red-500">*</span>
                </label>
                <input
                  className={inputCls}
                  value={form.bossFirstName}
                  onChange={e => set('bossFirstName', e.target.value)}
                  placeholder={t('firstNamePlaceholder' as Parameters<typeof t>[0])}
                  required
                />
                {createErrors.boss_first_name && <p className={errorCls}>{createErrors.boss_first_name}</p>}
              </div>
              <div>
                <label className={labelCls}>
                  {t('bossLastName' as Parameters<typeof t>[0])} <span className="text-red-500">*</span>
                </label>
                <input
                  className={inputCls}
                  value={form.bossLastName}
                  onChange={e => set('bossLastName', e.target.value)}
                  placeholder={t('lastNamePlaceholder' as Parameters<typeof t>[0])}
                  required
                />
                {createErrors.boss_last_name && <p className={errorCls}>{createErrors.boss_last_name}</p>}
              </div>
            </div>

            <div>
              <label className={labelCls}>
                {t('bossPhone' as Parameters<typeof t>[0])} <span className="text-red-500">*</span>
              </label>
              <div className="flex">
                <span className="inline-flex items-center px-3 border border-r-0 border-gray-300 rounded-l-lg bg-gray-50 text-gray-600 text-sm">
                  +998
                </span>
                <input
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-r-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.bossPhone}
                  onChange={e => set('bossPhone', e.target.value)}
                  placeholder="90 123 45 67"
                  required
                />
              </div>
              {createErrors.boss_phone && <p className={errorCls}>{createErrors.boss_phone}</p>}
            </div>

            <div>
              <label className={labelCls}>
                {t('bossPassword' as Parameters<typeof t>[0])} <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className={cn(inputCls, 'pr-10')}
                  value={form.bossPassword}
                  onChange={e => set('bossPassword', e.target.value)}
                  placeholder={t('passwordPlaceholder' as Parameters<typeof t>[0])}
                  required
                  minLength={4}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {createErrors.boss_password && <p className={errorCls}>{createErrors.boss_password}</p>}
            </div>

            {/* Generic error */}
            {createErrors.detail && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{createErrors.detail}</p>
            )}

          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-100 flex gap-3 bg-gray-50">
            <button
              type="button"
              onClick={resetCreate}
              className="flex-1 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-100 transition-colors"
            >
              {t('cancel' as Parameters<typeof t>[0])}
            </button>
            <button
              type="submit"
              disabled={creating}
              className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
            >
              {creating ? t('saving' as Parameters<typeof t>[0]) : t('save' as Parameters<typeof t>[0])}
            </button>
          </div>
        </form>
      </div>
    </div>
  ) : null;

  /* ════════════════════════════════ JSX ════════════════════════════════ */
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">{t('companies')}</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{companies.length} ta kompaniya</span>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            {t('addCompany' as Parameters<typeof t>[0])}
          </button>
        </div>
      </div>

      {/* Company grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array(8).fill(0).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      ) : companies.length === 0 ? (
        <div className="text-center py-20 text-gray-400">Kompaniyalar yo&apos;q</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {hierarchical.map((company) => (
            <button
              key={company.id}
              onClick={() => openDetail(company)}
              className="group relative aspect-square rounded-xl overflow-hidden border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all duration-200 hover:scale-[1.02] text-left"
            >
              <div className="absolute inset-0 opacity-20 group-hover:opacity-30 transition-opacity">
                {company.logo
                  ? <img src={company.logo} alt="" className="w-full h-full object-cover" />
                  : <CompanyInitials name={company.name} />}
              </div>
              <div className="absolute inset-0 bg-white/70 group-hover:bg-white/60 transition-colors" />

              <div className="absolute top-2 left-2 min-w-8 h-8 px-1.5 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center shadow-sm z-10 leading-none">
                {company.badge}
              </div>

              <div className="relative h-full flex flex-col items-center justify-center p-3 gap-2">
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
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Portals — rendered directly into document.body, no parent clipping */}
      {mounted && ReactDOM.createPortal(detailModal, document.body)}
      {mounted && ReactDOM.createPortal(createModal, document.body)}
    </div>
  );
}
