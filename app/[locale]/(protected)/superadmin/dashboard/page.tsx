'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Building2, AlertCircle, Users, TrendingUp, BadgeDollarSign, AlertTriangle } from 'lucide-react';
import api from '@/lib/axios';
import { cn, formatCurrency } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

/* ══════════ Types ══════════ */

interface DashboardStats {
  total_companies: number;
  debt_companies: number;
  total_active_students: number;
  total_revenue: number;
  current_month_revenue: number;
  overdue_debt_total: number;
}

interface RevenuePoint {
  date: string;
  revenue: number;
}

interface CompanyRow {
  id: string;
  name: string;
  active_students: number;
  subscription_status: string | null;
  debt_amount: number;
}

interface DashboardData {
  stats: DashboardStats;
  revenue_trend: RevenuePoint[];
  companies_table: CompanyRow[];
}

/* ══════════ Constants ══════════ */

const BADGE: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  partial:  'bg-orange-100 text-orange-800 border-orange-200',
  paid:     'bg-green-100  text-green-800  border-green-200',
  overdue:  'bg-red-100    text-red-800    border-red-200',
};

const STATUS_UZ: Record<string, string> = {
  pending: 'Kutilmoqda',
  partial: 'Qisman',
  paid:    "To'langan",
  overdue: "Muddati o'tgan",
};

const thCls = 'text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-50 whitespace-nowrap';

/* ══════════ Helpers ══════════ */

function fmtYAxis(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}K`;
  return String(v);
}

function fmtDate(iso: string): string {
  const p = iso.split('-');
  return `${p[2]}/${p[1]}`;
}

/* ══════════ Stat Card ══════════ */

function StatCard({
  title,
  value,
  icon: Icon,
  iconBg,
  iconColor,
  loading,
}: {
  title: string;
  value: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  loading: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex items-center gap-4">
      <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0', iconBg)}>
        <Icon className={cn('w-6 h-6', iconColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-gray-500 truncate">{title}</p>
        {loading
          ? <Skeleton className="h-7 w-28 mt-1" />
          : <p className="text-2xl font-bold text-gray-900 mt-0.5 tabular-nums">{value}</p>
        }
      </div>
    </div>
  );
}

/* ══════════ Page ══════════ */

export default function SuperadminDashboardPage() {
  const t = useTranslations('superadmin');
  const router = useRouter();
  const locale = useLocale();

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const { data: resp } = await api.get<DashboardData>('/api/superadmin/dashboard/');
      setData(resp);
    } catch {
      //
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  const stats = data?.stats;
  const trend = data?.revenue_trend ?? [];
  const table = (data?.companies_table ?? []).slice(0, 10);

  const statCards1 = [
    {
      title: t('totalCompanies' as Parameters<typeof t>[0]),
      value: stats ? String(stats.total_companies) : '—',
      icon: Building2, iconBg: 'bg-blue-50', iconColor: 'text-blue-600',
    },
    {
      title: t('debtCompanies' as Parameters<typeof t>[0]),
      value: stats ? String(stats.debt_companies) : '—',
      icon: AlertCircle, iconBg: 'bg-orange-50', iconColor: 'text-orange-500',
    },
    {
      title: t('totalActiveStudents' as Parameters<typeof t>[0]),
      value: stats ? String(stats.total_active_students) : '—',
      icon: Users, iconBg: 'bg-green-50', iconColor: 'text-green-600',
    },
  ];

  const statCards2 = [
    {
      title: t('totalRevenue' as Parameters<typeof t>[0]),
      value: stats ? formatCurrency(stats.total_revenue) : '—',
      icon: TrendingUp, iconBg: 'bg-blue-50', iconColor: 'text-blue-600',
    },
    {
      title: t('monthRevenue' as Parameters<typeof t>[0]),
      value: stats ? formatCurrency(stats.current_month_revenue) : '—',
      icon: BadgeDollarSign, iconBg: 'bg-green-50', iconColor: 'text-green-600',
    },
    {
      title: t('overdueTotal' as Parameters<typeof t>[0]),
      value: stats ? formatCurrency(stats.overdue_debt_total) : '—',
      icon: AlertTriangle, iconBg: 'bg-red-50', iconColor: 'text-red-600',
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">
        {t('dashboard' as Parameters<typeof t>[0])}
      </h1>

      {/* Row 1: center + student stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {statCards1.map((card) => (
          <StatCard key={card.title} {...card} loading={loading} />
        ))}
      </div>

      {/* Row 2: revenue stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {statCards2.map((card) => (
          <StatCard key={card.title} {...card} loading={loading} />
        ))}
      </div>

      {/* Revenue trend chart */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">
          {t('revenueTrend' as Parameters<typeof t>[0])}
        </h2>
        {loading ? (
          <Skeleton className="h-60 w-full rounded-lg" />
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={trend} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={fmtDate}
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={fmtYAxis}
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
                width={52}
              />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(v: any) => [formatCurrency(Number(v)), 'Daromad']}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                labelFormatter={(label: any) => fmtDate(String(label))}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="#22c55e"
                strokeWidth={2}
                fill="url(#revenueGrad)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0, fill: '#22c55e' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Companies table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">
            {t('companiesStatus' as Parameters<typeof t>[0])}
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {[
                  '№',
                  t('company'),
                  t('totalActiveStudents' as Parameters<typeof t>[0]),
                  'Obuna holati',
                  t('remainingDebt' as Parameters<typeof t>[0]),
                ].map((h, i) => <th key={i} className={thCls}>{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading
                ? Array(5).fill(0).map((_, i) => (
                  <tr key={i}><td colSpan={5} className="px-4 py-3">
                    <Skeleton className="h-4 w-full" />
                  </td></tr>
                ))
                : table.length === 0
                  ? <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400">Markazlar yo&apos;q</td></tr>
                  : table.map((row, idx) => (
                    <tr
                      key={row.id}
                      className="hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => router.push(`/${locale}/superadmin/companies`)}
                    >
                      <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                      <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{row.name}</td>
                      <td className="px-4 py-3 text-gray-600">{row.active_students}</td>
                      <td className="px-4 py-3">
                        {row.subscription_status ? (
                          <span className={cn(
                            'inline-flex items-center px-2 py-0.5 text-xs font-medium border rounded-full',
                            BADGE[row.subscription_status] ?? 'bg-gray-100 text-gray-600 border-gray-200',
                          )}>
                            {STATUS_UZ[row.subscription_status] ?? row.subscription_status}
                          </span>
                        ) : '—'}
                      </td>
                      <td className={cn(
                        'px-4 py-3 font-medium whitespace-nowrap',
                        row.debt_amount > 0 ? 'text-red-600' : 'text-gray-400',
                      )}>
                        {formatCurrency(row.debt_amount)}
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
