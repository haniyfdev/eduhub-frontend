'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { X, Users, Phone, MapPin } from 'lucide-react';
import api from '@/lib/axios';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

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

// Sort: parents first, then branches grouped under each parent
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
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <div className={cn('w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-400 to-blue-600 text-white font-bold select-none', className)}>
      {initials}
    </div>
  );
}

export default function SuperadminCompaniesPage() {
  const t = useTranslations('superadmin');
  const [companies, setCompanies] = useState<CompanyCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CompanyWithBadge | null>(null);
  const [detail, setDetail] = useState<CompanyDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelected(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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

  const hierarchical = buildHierarchicalList(companies);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">{t('companies')}</h1>
        <span className="text-sm text-gray-500">{companies.length} ta kompaniya</span>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array(8).fill(0).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
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
              {/* Background */}
              <div className="absolute inset-0 opacity-20 group-hover:opacity-30 transition-opacity">
                {company.logo ? (
                  <img src={company.logo} alt="" className="w-full h-full object-cover" />
                ) : (
                  <CompanyInitials name={company.name} />
                )}
              </div>
              <div className="absolute inset-0 bg-white/70 group-hover:bg-white/60 transition-colors" />

              {/* Hierarchical badge */}
              <div className="absolute top-2 left-2 min-w-[20px] h-5 px-1.5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center shadow-sm z-10 leading-none">
                {company.badge}
              </div>

              {/* Content */}
              <div className="relative h-full flex flex-col items-center justify-center p-3 gap-2">
                <div className="w-14 h-14 rounded-xl overflow-hidden shadow-sm border border-white/50 flex-shrink-0">
                  {company.logo ? (
                    <img src={company.logo} alt={company.name} className="w-full h-full object-cover" />
                  ) : (
                    <CompanyInitials name={company.name} className="text-2xl" />
                  )}
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

      {/* Detail modal */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Seamless gradient header — no border artifact */}
            <div className="relative h-28 bg-gradient-to-br from-blue-400 to-blue-600 rounded-t-2xl">
              {selected.logo ? (
                <div className="absolute inset-0 flex items-center justify-center p-4">
                  <img
                    src={selected.logo}
                    alt={selected.name}
                    className="max-h-16 max-w-full object-contain"
                  />
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-white font-bold text-5xl select-none opacity-25 tracking-tight">
                  {selected.name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')}
                </div>
              )}
              <button
                onClick={closeModal}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/25 hover:bg-black/45 flex items-center justify-center text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Name + branch */}
              <div>
                <h2 className="text-lg font-bold text-gray-900">{selected.name}</h2>
                {selected.is_branch && selected.branch_of_name && (
                  <p className="text-sm text-gray-500">{t('branch')}: {selected.branch_of_name}</p>
                )}
              </div>

              {/* Contact info */}
              <div className="space-y-2.5">
                {selected.phone && (
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <Phone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="whitespace-nowrap">{selected.phone}</span>
                  </div>
                )}
                {selected.address && (
                  <div className="flex items-start gap-2 text-sm text-gray-700">
                    <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                    <span>{selected.address}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <Users className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span>
                    <span className="font-semibold text-gray-900">{selected.active_student_count}</span>
                    {' '}{t('activeStudents')}
                  </span>
                </div>
              </div>

              {/* Subscription status */}
              {selected.subscription_status && (
                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                  <span className="text-sm text-gray-500">{t('subscriptionStatus')}</span>
                  <span className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-1 text-sm font-medium rounded-full border',
                    STATUS_COLORS[selected.subscription_status] ?? 'bg-gray-100 text-gray-600 border-gray-200',
                  )}>
                    <span className={cn('w-2 h-2 rounded-full', STATUS_DOT[selected.subscription_status] ?? 'bg-gray-400')} />
                    {t(`status.${selected.subscription_status}` as Parameters<typeof t>[0])}
                  </span>
                </div>
              )}

              {/* Branches */}
              {selected.branches.length > 0 && (
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Filiallar</p>
                  <div className="flex flex-wrap gap-1">
                    {selected.branches.map((b) => (
                      <span key={b.id} className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full border border-blue-100">
                        {b.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Student conversion */}
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                  {t('conversion.title' as Parameters<typeof t>[0])}
                </p>

                {detailLoading ? (
                  <div className="space-y-2">
                    {Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-5 w-full rounded" />)}
                  </div>
                ) : detail ? (() => {
                  const grandTotal = Math.max(
                    1,
                    detail.active_students + detail.trial_students + detail.frozen_students +
                    detail.archived_students + detail.pending_students + detail.rejected_students,
                  );
                  return (
                    <div className="space-y-2">
                      {/* Jami row */}
                      <div className="flex items-center gap-2">
                        <span className="w-28 text-xs text-gray-600 truncate">
                          {t('conversion.total' as Parameters<typeof t>[0])}
                        </span>
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-blue-600 w-full" />
                        </div>
                        <span className="w-6 text-right text-xs font-medium text-gray-700">{grandTotal}</span>
                        <span className="w-9 text-right text-xs text-gray-400">100%</span>
                      </div>

                      {CONVERSION_ROWS.map(({ key, color }) => {
                        const count = getCount(detail, key);
                        const pct = Math.round((count / grandTotal) * 100);
                        return (
                          <div key={key} className="flex items-center gap-2">
                            <span className="w-28 text-xs text-gray-600 truncate">
                              {t(`conversion.${key}` as Parameters<typeof t>[0])}
                            </span>
                            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={cn('h-full rounded-full transition-all', color)}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="w-6 text-right text-xs font-medium text-gray-700">{count}</span>
                            <span className="w-9 text-right text-xs text-gray-400">{pct}%</span>
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
      )}
    </div>
  );
}
