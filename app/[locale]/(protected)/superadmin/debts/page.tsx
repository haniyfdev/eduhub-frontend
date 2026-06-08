'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Pencil, Check, X } from 'lucide-react';
import api from '@/lib/axios';
import { cn, formatCurrency, formatDMY } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import toast from 'react-hot-toast';

interface SubscriptionDebt {
  id: number;
  company_id: string;
  company_name: string;
  created_at: string;
  amount: number;
  paid_amount: number;
  remaining: number;
  period_start: string;
  period_end: string;
  status: 'pending' | 'partial' | 'paid' | 'overdue';
}

interface Plan {
  id?: number;
  price: number | null;
}

const BADGE: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  partial: 'bg-orange-100 text-orange-800 border-orange-200',
  paid:    'bg-green-100  text-green-800  border-green-200',
  overdue: 'bg-red-100    text-red-800    border-red-200',
};

const thCls = 'text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-50 whitespace-nowrap';

export default function SuperadminDebtsPage() {
  const t = useTranslations('superadmin');
  const [debts, setDebts] = useState<SubscriptionDebt[]>([]);
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<Plan>({ price: null });
  const [editingPlan, setEditingPlan] = useState(false);
  const [planInput, setPlanInput] = useState('');
  const [savingPlan, setSavingPlan] = useState(false);

  const [payTarget, setPayTarget] = useState<SubscriptionDebt | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<'cash' | 'card' | 'transfer'>('cash');
  const [paying, setPaying] = useState(false);

  const fetchDebts = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<SubscriptionDebt[]>('/api/superadmin/debts/');
      setDebts(data);
    } catch {
      //
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPlan = useCallback(async () => {
    try {
      const { data } = await api.get<Plan>('/api/superadmin/plan/');
      setPlan(data);
      setPlanInput(data.price != null ? String(data.price) : '');
    } catch {
      //
    }
  }, []);

  useEffect(() => {
    fetchDebts();
    fetchPlan();
  }, [fetchDebts, fetchPlan]);

  async function savePlan() {
    const price = parseFloat(planInput.replace(/\s/g, ''));
    if (isNaN(price) || price <= 0) { toast.error("Noto'g'ri narx"); return; }
    setSavingPlan(true);
    try {
      const { data } = await api.put<Plan>('/api/superadmin/plan/', { price });
      setPlan(data);
      setEditingPlan(false);
      toast.success("Narx yangilandi");
    } catch {
      toast.error("Xatolik");
    } finally {
      setSavingPlan(false);
    }
  }

  function openPayModal(debt: SubscriptionDebt) {
    setPayTarget(debt);
    setPayAmount(String(debt.remaining));
    setPayMethod('cash');
  }

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    if (!payTarget) return;
    const amount = parseFloat(payAmount.replace(/\s/g, ''));
    if (isNaN(amount) || amount <= 0) { toast.error("Noto'g'ri summa"); return; }
    setPaying(true);
    try {
      await api.post(`/api/superadmin/debts/${payTarget.id}/pay/`, {
        amount,
        payment_method: payMethod,
      });
      toast.success("To'lov qabul qilindi");
      setPayTarget(null);
      fetchDebts();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || "Xatolik");
    } finally {
      setPaying(false);
    }
  }

  const COLS = [
    '№',
    t('company'),
    t('debtRecordedAt' as Parameters<typeof t>[0]),
    t('total' as Parameters<typeof t>[0]),
    t('paid' as Parameters<typeof t>[0]),
    t('remaining' as Parameters<typeof t>[0]),
    'Holat',
    t('dueDate' as Parameters<typeof t>[0]),
    '',
  ];

  const METHODS: { value: 'cash' | 'card' | 'transfer'; labelKey: string }[] = [
    { value: 'cash',     labelKey: 'cash'     },
    { value: 'card',     labelKey: 'card'     },
    { value: 'transfer', labelKey: 'transfer' },
  ];

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-900">{t('debts')}</h1>

        {/* Plan price control */}
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-4 py-2 shadow-sm">
          <span className="text-sm text-gray-600">{t('plan')}:</span>
          {editingPlan ? (
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                value={planInput}
                onChange={(e) => setPlanInput(e.target.value)}
                className="w-32 px-2 py-1 border border-blue-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') savePlan();
                  if (e.key === 'Escape') setEditingPlan(false);
                }}
              />
              <button onClick={savePlan} disabled={savingPlan}
                className="p-1 text-green-600 hover:text-green-700 disabled:opacity-50">
                <Check className="w-4 h-4" />
              </button>
              <button onClick={() => setEditingPlan(false)}
                className="p-1 text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <span className="text-sm font-semibold text-gray-900">
                {plan.price != null ? formatCurrency(plan.price) : '—'}
              </span>
              <button onClick={() => setEditingPlan(true)}
                className="p-1 text-gray-400 hover:text-blue-600 transition-colors" title={t('editPlan')}>
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Debts table */}
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
              : debts.length === 0
                ? <tr><td colSpan={COLS.length} className="px-4 py-16 text-center text-gray-400">Qarzlar yo&apos;q</td></tr>
                : debts.map((debt, idx) => (
                  <tr key={debt.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{debt.company_name}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">{formatDMY(debt.created_at)}</td>
                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{formatCurrency(debt.amount)}</td>
                    <td className="px-4 py-3 text-green-700 whitespace-nowrap">{formatCurrency(debt.paid_amount)}</td>
                    <td className={cn(
                      'px-4 py-3 font-semibold whitespace-nowrap',
                      debt.remaining > 0 ? 'text-red-600' : 'text-gray-400',
                    )}>
                      {formatCurrency(debt.remaining)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'inline-flex items-center px-2 py-0.5 text-xs font-medium border rounded-full',
                        BADGE[debt.status] ?? 'bg-gray-100 text-gray-600 border-gray-200',
                      )}>
                        {t(`status.${debt.status}` as Parameters<typeof t>[0])}
                      </span>
                    </td>
                    <td className={cn(
                      'px-4 py-3 whitespace-nowrap text-xs font-medium',
                      debt.status === 'overdue' ? 'text-red-600' : 'text-gray-600',
                    )}>
                      {formatDMY(debt.period_end)}
                    </td>
                    <td className="px-4 py-3">
                      {debt.status !== 'paid' && (
                        <button
                          onClick={() => openPayModal(debt)}
                          className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 transition-colors whitespace-nowrap"
                        >
                          {t('payNow')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {/* Payment modal */}
      {payTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={() => setPayTarget(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="font-bold text-gray-900">{t('payNow')}</h2>
                <p className="text-sm text-gray-500 mt-0.5">{payTarget.company_name}</p>
              </div>
              <button onClick={() => setPayTarget(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4 text-sm text-gray-600 space-y-1">
              <div className="flex justify-between">
                <span>{t('total' as Parameters<typeof t>[0])}:</span>
                <span className="font-medium">{formatCurrency(payTarget.amount)}</span>
              </div>
              {payTarget.paid_amount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>{t('paid' as Parameters<typeof t>[0])}:</span>
                  <span className="font-medium">{formatCurrency(payTarget.paid_amount)}</span>
                </div>
              )}
              <div className="flex justify-between text-red-600 font-semibold border-t border-gray-100 pt-1">
                <span>{t('remaining' as Parameters<typeof t>[0])}:</span>
                <span>{formatCurrency(payTarget.remaining)}</span>
              </div>
            </div>

            <form onSubmit={handlePay} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t('amount')} (so&apos;m)
                </label>
                <input
                  type="number"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                  min="1"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t('paymentMethod' as Parameters<typeof t>[0])}
                </label>
                <div className="flex gap-2">
                  {METHODS.map(({ value, labelKey }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setPayMethod(value)}
                      className={cn(
                        'flex-1 py-2 text-sm font-medium rounded-lg border transition-colors',
                        payMethod === value
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-700 border-gray-300 hover:border-blue-300',
                      )}
                    >
                      {t(labelKey as Parameters<typeof t>[0])}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setPayTarget(null)}
                  className="flex-1 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
                  Bekor
                </button>
                <button type="submit" disabled={paying}
                  className="flex-1 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors">
                  {paying ? '...' : "To'lash"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
