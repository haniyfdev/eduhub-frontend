'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import api from '@/lib/axios';
import { formatCurrency } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface SubscriptionPayment {
  id: number;
  company_name: string;
  company_phone: string | null;
  amount: number;
  payment_method: 'cash' | 'card' | 'transfer';
  paid_at: string;
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

const thCls = 'text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-50 whitespace-nowrap';

const METHOD_BADGE: Record<string, string> = {
  cash:     'bg-green-50  text-green-700  border-green-200',
  card:     'bg-blue-50   text-blue-700   border-blue-200',
  transfer: 'bg-purple-50 text-purple-700 border-purple-200',
};

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

  const COLS = [
    '№',
    t('company'),
    t('phone' as Parameters<typeof t>[0]),
    t('amount'),
    t('paymentMethod' as Parameters<typeof t>[0]),
    t('paymentDate' as Parameters<typeof t>[0]),
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">{t('payments')}</h1>
        <span className="text-sm text-gray-500">{payments.length} ta to&apos;lov</span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              {COLS.map((h, i) => <th key={i} className={thCls}>{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading
              ? Array(6).fill(0).map((_, i) => (
                <tr key={i}><td colSpan={COLS.length} className="px-4 py-3">
                  <Skeleton className="h-4 w-full" />
                </td></tr>
              ))
              : payments.length === 0
                ? <tr><td colSpan={COLS.length} className="px-4 py-16 text-center text-gray-400">To&apos;lovlar yo&apos;q</td></tr>
                : payments.map((p, idx) => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{p.company_name}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{p.company_phone || '—'}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">{formatCurrency(p.amount)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium border rounded-full ${METHOD_BADGE[p.payment_method] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                        {t(p.payment_method as Parameters<typeof t>[0])}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDateTime(p.paid_at)}</td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
