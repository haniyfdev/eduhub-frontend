'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import api from '@/lib/axios';
import { formatCurrency } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface SubscriptionPayment {
  id: number;
  company_name: string;
  amount: number;
  paid_at: string;
  recorded_by_name: string | null;
  period_start: string | null;
  period_end: string | null;
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    const day   = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year  = d.getFullYear();
    const hour  = String(d.getHours()).padStart(2, '0');
    const min   = String(d.getMinutes()).padStart(2, '0');
    return `${day}.${month}.${year} ${hour}:${min}`;
  } catch {
    return iso;
  }
}

const thCls = 'text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-50';

export default function SuperadminPaymentsPage() {
  const t = useTranslations('superadmin');
  const [payments, setPayments] = useState<SubscriptionPayment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<SubscriptionPayment[]>('/api/superadmin/payments/');
      setPayments(data);
    } catch {
      //
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPayments(); }, [fetchPayments]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">{t('payments')}</h1>
        <span className="text-sm text-gray-500">{payments.length} ta to&apos;lov</span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              {['№', t('company'), 'Summa', "To'langan sana", 'Kim tomonidan'].map((h, i) => (
                <th key={i} className={thCls}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading
              ? Array(6).fill(0).map((_, i) => (
                <tr key={i}><td colSpan={5} className="px-4 py-3">
                  <Skeleton className="h-4 w-full" />
                </td></tr>
              ))
              : payments.length === 0
                ? <tr><td colSpan={5} className="px-4 py-16 text-center text-gray-400">To&apos;lovlar yo&apos;q</td></tr>
                : payments.map((p, idx) => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{p.company_name}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">{formatCurrency(p.amount)}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDateTime(p.paid_at)}</td>
                    <td className="px-4 py-3 text-gray-500">{p.recorded_by_name || '—'}</td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
