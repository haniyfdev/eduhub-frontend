'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { X, Building2, Users, Phone, MapPin } from 'lucide-react';
import api from '@/lib/axios';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface CompanyCard {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  status: string;
  branch_of: string | null;
  branch_of_name: string | null;
  is_branch: boolean;
  active_student_count: number;
  subscription_status: 'pending' | 'partial' | 'paid' | 'overdue' | null;
  branches: { id: string; name: string }[];
  created_at: string;
}

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

function CompanyInitials({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  const colors = [
    'from-blue-400 to-blue-600',
    'from-purple-400 to-purple-600',
    'from-emerald-400 to-emerald-600',
    'from-rose-400 to-rose-600',
    'from-amber-400 to-amber-600',
    'from-cyan-400 to-cyan-600',
    'from-indigo-400 to-indigo-600',
    'from-teal-400 to-teal-600',
  ];
  const colorIdx = name.charCodeAt(0) % colors.length;
  return (
    <div className={cn('w-full h-full flex items-center justify-center bg-gradient-to-br text-white font-bold text-4xl select-none', colors[colorIdx])}>
      {initials}
    </div>
  );
}

export default function SuperadminCompaniesPage() {
  const t = useTranslations('superadmin');
  const [companies, setCompanies] = useState<CompanyCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CompanyCard | null>(null);

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
          {companies.map((company) => (
            <button
              key={company.id}
              onClick={() => setSelected(company)}
              className="group relative aspect-square rounded-xl overflow-hidden border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all duration-200 hover:scale-[1.02] text-left"
            >
              {/* Background initials */}
              <div className="absolute inset-0 opacity-20 group-hover:opacity-30 transition-opacity">
                <CompanyInitials name={company.name} />
              </div>
              <div className="absolute inset-0 bg-white/70 group-hover:bg-white/60 transition-colors" />

              {/* Content */}
              <div className="relative h-full flex flex-col items-center justify-center p-3 gap-2">
                <div className="w-14 h-14 rounded-xl overflow-hidden shadow-sm border border-white/50 flex-shrink-0">
                  <CompanyInitials name={company.name} />
                </div>
                <p className="font-semibold text-gray-900 text-sm text-center leading-tight line-clamp-2">
                  {company.name}
                </p>
                {company.is_branch && company.branch_of_name && (
                  <p className="text-xs text-gray-500 text-center">{company.branch_of_name}</p>
                )}
                {company.subscription_status && (
                  <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border',
                    STATUS_COLORS[company.subscription_status] ?? 'bg-gray-100 text-gray-600 border-gray-200')}>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            {/* Header */}
            <div className="relative h-28 overflow-hidden">
              <CompanyInitials name={selected.name} />
              <div className="absolute inset-0 bg-black/20" />
              <button
                onClick={() => setSelected(null)}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/30 hover:bg-black/50 flex items-center justify-center text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{selected.name}</h2>
                {selected.is_branch && selected.branch_of_name && (
                  <p className="text-sm text-gray-500">{t('branch')}: {selected.branch_of_name}</p>
                )}
              </div>

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

              {selected.subscription_status && (
                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                  <span className="text-sm text-gray-500">{t('subscriptionStatus')}</span>
                  <span className={cn('inline-flex items-center gap-1.5 px-3 py-1 text-sm font-medium rounded-full border',
                    STATUS_COLORS[selected.subscription_status] ?? 'bg-gray-100 text-gray-600 border-gray-200')}>
                    <span className={cn('w-2 h-2 rounded-full', STATUS_DOT[selected.subscription_status] ?? 'bg-gray-400')} />
                    {t(`status.${selected.subscription_status}` as Parameters<typeof t>[0])}
                  </span>
                </div>
              )}

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
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
