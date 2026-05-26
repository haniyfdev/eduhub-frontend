'use client';

import { useEffect, useState, useCallback } from 'react';
import { Minus } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui/skeleton';
import api from '@/lib/axios';
import { cn, formatCurrency } from '@/lib/utils';
import { PaginatedResponse } from '@/types';

interface Discount {
  id: string;
  student: string;
  student_name: string;
  student_phone: string;
  course: string;
  course_name: string;
  course_price: number;
  percent: number;
  months: number;
  start_month: string;
  end_month: string;
  discount_amount: number;
  final_amount: number;
  note: string | null;
  created_at: string;
}

function isActiveDiscount(endMonth: string) {
  if (!endMonth) return false;
  return new Date(endMonth) > new Date();
}

export default function DiscountsPage() {
  const t  = useTranslations('discounts');
  const tc = useTranslations('common');

  const [discounts, setDiscounts]   = useState<Discount[]>([]);
  const [loading, setLoading]       = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchDiscounts = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<PaginatedResponse<Discount>>('/api/v1/discounts/?page_size=200');
      setDiscounts(data.results ?? []);
    } catch {
      toast.error(tc('error'));
    } finally {
      setLoading(false);
    }
  }, [tc]);

  useEffect(() => { fetchDiscounts(); }, [fetchDiscounts]);

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await api.delete(`/api/v1/discounts/${id}/`);
      setDiscounts(prev => prev.filter(d => d.id !== id));
      toast.success(tc('success'));
    } catch {
      toast.error(tc('error'));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <Toaster position="top-right" />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{t('title')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t('subtitle')}</p>
        </div>
      </div>

      <div className="bg-white rounded border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {['№', tc('student'), tc('course'), tc('amount'), t('percent'), t('months'), tc('status'), tc('actions')].map((h, i) => (
                <th key={i} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading
              ? Array(5).fill(0).map((_, i) => (
                <tr key={i}>{Array(8).fill(0).map((_, j) => (
                  <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                ))}</tr>
              ))
              : discounts.length === 0
                ? <tr><td colSpan={8} className="px-4 py-16 text-center text-gray-400">{t('noDiscounts')}</td></tr>
                : discounts.map((d, idx) => {
                    const active = isActiveDiscount(d.end_month);
                    return (
                      <tr key={d.id} className="transition-colors hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{d.student_name}</td>
                        <td className="px-4 py-3 text-gray-600">{d.course_name}</td>
                        <td className="px-4 py-3 text-gray-700">{formatCurrency(d.course_price)}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded bg-amber-50 text-amber-700 border border-amber-200">
                            {d.percent}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{d.months} {tc('month')}</td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            'inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded border',
                            active
                              ? 'bg-green-50 text-green-700 border-green-200'
                              : 'bg-gray-100 text-gray-500 border-gray-200'
                          )}>
                            {active ? tc('active') : tc('archived')}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleDelete(d.id)}
                            disabled={deletingId === d.id}
                            className="p-1 rounded text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-40"
                            title={tc('archive')}
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}
