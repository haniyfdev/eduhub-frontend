'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Search, Send } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Pagination } from '@/components/pagination';
import { SmsModal, type SmsRecipient } from '@/components/sms-modal';
import api from '@/lib/axios';
import { cn, formatCurrency, formatDMY } from '@/lib/utils';
import { PaginatedResponse } from '@/types';

interface Payment {
  id: string;
  student_id?: string;
  student_name: string;
  student_phone?: string;
  course_name: string;
  group_display?: string;
  group_student: string;
  amount: number;
  payment_type: 'cash' | 'card' | 'transfer';
  note: string;
  paid_at: string;
  refund_candidate: boolean;
  refund_status: 'pending' | 'confirmed' | 'paid' | null;
}

interface RefundBreakdown {
  lessons: { lesson_id: string; date: string; status: string }[];
  period_start: string;
  left_at: string;
  course_price: number;
  course_name: string;
  group_name: string;
  student_name: string;
  billing_type: 'manual' | 'per_day' | 'per_lesson';
  calculated_amount: number | null;
  per_unit: number | null;
  units_count: number | null;
  total_units: number | null;
  unit_label: 'day' | 'lesson' | null;
  raw_amount: number | null;
}

interface RefundCandidate {
  group_student_id: string;
  student_name: string;
  student_phone: string | null;
  group_name: string;
  course_name: string | null;
  total_paid: number;
  earned_amount: number | null;
  refund_amount: number | null;
  debt_id: string | null;
  billing_type: 'manual' | 'per_day' | 'per_lesson';
  breakdown: RefundBreakdown | null;
}

interface RefundRecord {
  id: string;
  group_student: string;
  debt: string | null;
  original_paid: number;
  earned_amount: number;
  refund_amount: number;
  status: 'pending' | 'confirmed' | 'paid';
  confirmed_at: string | null;
  paid_at: string | null;
}

const TYPE_LABEL_KEYS: Record<string, string> = {
  cash: 'cash', card: 'card', transfer: 'transfer',
};
const TYPE_STYLES: Record<string, string> = {
  cash:     'bg-green-50 text-green-700 border-green-200',
  card:     'bg-blue-50 text-blue-700 border-blue-200',
  transfer: 'bg-orange-50 text-orange-700 border-orange-200',
};

function refundRowBg(p: Payment): string {
  if (p.refund_status === 'paid') return '';
  if (p.refund_status === 'confirmed') return 'bg-lime-50';
  if (p.refund_candidate) return 'bg-green-100';
  return '';
}

const formatAmount = (val: string) =>
  val.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const parseAmount = (val: string) =>
  Number(val.replace(/,/g, ''));

export default function PaymentsPage() {
  const t = useTranslations('payments');
  const td = useTranslations('debts');
  const common = useTranslations('common');
  const [payments, setPayments]     = useState<Payment[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(false);
  const [search, setSearch]         = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage]             = useState(1);
  const [count, setCount]           = useState(0);
  const [pageSize, setPageSize]     = useState(25);

  // SMS
  const [smsSelected, setSmsSelected]       = useState<Set<string>>(new Set());
  const [showSmsConfirm, setShowSmsConfirm] = useState(false);
  const [smsVariables, setSmsVariables]     = useState<Record<string, Record<string, string>>>({});

  // Refund modal
  const [refundTarget, setRefundTarget]   = useState<Payment | null>(null);
  const [refundLoading, setRefundLoading] = useState(false);
  const [candidateData, setCandidateData] = useState<RefundCandidate | null>(null);
  const [existingRefund, setExistingRefund] = useState<RefundRecord | null>(null);
  const [manualEarned, setManualEarned]   = useState('');
  const [refundSaving, setRefundSaving]   = useState(false);

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const params: Record<string, string | number> = { page, page_size: pageSize };
      if (search)     params.search       = search;
      if (typeFilter) params.payment_type = typeFilter;
      const { data } = await api.get<PaginatedResponse<Payment>>('/api/v1/payments/', { params });
      setPayments(data.results ?? []);
      setCount(data.count ?? 0);
    } catch {
      setError(true);
      toast.error(common('error'));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, typeFilter, common]);

  useEffect(() => { fetchPayments(); }, [fetchPayments]);
  useEffect(() => { setPage(1); }, [search, typeFilter]);

  async function openRefundModal(p: Payment) {
    setRefundTarget(p);
    setRefundLoading(true);
    setCandidateData(null);
    setExistingRefund(null);
    setManualEarned('');
    try {
      if (p.refund_status) {
        const { data } = await api.get<PaginatedResponse<RefundRecord>>('/api/v1/refunds/', {
          params: { group_student: p.group_student },
        });
        setExistingRefund(data.results?.[0] ?? null);
      } else {
        const { data } = await api.get<RefundCandidate[]>('/api/v1/refunds/candidates/');
        setCandidateData(data.find((c) => c.group_student_id === p.group_student) ?? null);
      }
    } catch {
      toast.error(common('error'));
    } finally {
      setRefundLoading(false);
    }
  }

  function closeRefundModal() {
    setRefundTarget(null);
    setCandidateData(null);
    setExistingRefund(null);
    setManualEarned('');
  }

  async function handleConfirmRefund() {
    if (!refundTarget || !candidateData) return;
    const earned = candidateData.earned_amount ?? parseAmount(manualEarned);
    const refundAmount = candidateData.total_paid - earned;
    if (!earned || earned < 0 || refundAmount <= 0) {
      toast.error(common('error'));
      return;
    }
    setRefundSaving(true);
    try {
      await api.post('/api/v1/refunds/', {
        group_student: candidateData.group_student_id,
        debt: candidateData.debt_id,
        original_paid: candidateData.total_paid,
        earned_amount: earned,
        refund_amount: refundAmount,
      });
      toast.success(common('success'));
      closeRefundModal();
      fetchPayments();
    } catch {
      toast.error(common('error'));
    } finally {
      setRefundSaving(false);
    }
  }

  async function handleMarkRefundPaid() {
    if (!existingRefund) return;
    setRefundSaving(true);
    try {
      await api.patch(`/api/v1/refunds/${existingRefund.id}/`, { status: 'paid' });
      toast.success(common('success'));
      closeRefundModal();
      fetchPayments();
    } catch {
      toast.error(common('error'));
    } finally {
      setRefundSaving(false);
    }
  }

  function toggleSms(id: string) {
    setSmsSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }

  const selectedStudentIds = Array.from(new Set(
    payments.filter(p => smsSelected.has(p.id) && p.student_id).map(p => p.student_id!)
  ));

  async function openSmsModal() {
    if (smsSelected.size === 0) return;
    if (selectedStudentIds.length > 0) {
      try {
        const { data } = await api.post('/api/v1/sms-variables/', { student_ids: selectedStudentIds });
        setSmsVariables(data);
      } catch {
        setSmsVariables({});
      }
    }
    setShowSmsConfirm(true);
  }

  async function handleSendSms(templateId: string | null, customMessage: string | null, recipients: SmsRecipient[]) {
    try {
      await api.post('/api/v1/notifications/send-sms/', {
        template_id: templateId,
        message: customMessage,
        recipients: recipients.map(r => ({
          type: r.type,
          id: r.id,
          phone: r.phone,
          amount: r.amount || '',
          due_date: r.due_date || '',
        })),
      });
      toast.success(common('success'));
    } catch {
      toast.error(common('error'));
    }
    setSmsSelected(new Set());
  }

  const smsRecipients: SmsRecipient[] = payments
    .filter(p => smsSelected.has(p.id) && !!p.student_phone)
    .map(p => {
      const vars = p.student_id ? (smsVariables[p.student_id] ?? {}) : {};
      return {
        id: p.student_id || p.id,
        name: p.student_name,
        phone: p.student_phone!,
        type: 'student' as const,
        amount: String(p.amount || ''),
        balance: vars.balance || '',
        due_date: vars.due_date || '',
        course_name: vars.course_name || p.course_name || '',
        group_name: vars.group_name || p.group_display || '',
        teacher_name: vars.teacher_name || '',
        company_name: vars.company_name || '',
        lesson_time: vars.lesson_time || '',
        room_number: vars.room_number || '',
      };
    });

  return (
    <div className="space-y-5">
      <Toaster position="top-right" />

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">{t('title')}</h1>
        {smsSelected.size > 0 && (
          <button
            onClick={openSmsModal}
            disabled={false}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded hover:bg-indigo-700 transition-colors"
          >
            <Send className="w-4 h-4" />
            {common('send')} ({smsSelected.size})
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700">
          <option value="">{t('allTypes')}</option>
          <option value="cash">{t('cash')}</option>
          <option value="card">{t('card')}</option>
          <option value="transfer">{t('transfer')}</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded border border-gray-200 shadow-sm overflow-hidden">
        {error ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500">
            <p className="mb-3 text-sm">{common('error')}</p>
            <button onClick={fetchPayments} className="text-sm text-blue-600 underline">{common('retry')}</button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {['№', '', common('student'), common('phone'), common('course'), common('group'), common('amount'), t('paymentType'), common('date')].map((h, i) => (
                  <th key={i} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading
                ? Array(6).fill(0).map((_, i) => (
                  <tr key={i}>{Array(9).fill(0).map((_, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                  ))}</tr>
                ))
                : payments.length === 0
                  ? <tr><td colSpan={9} className="px-4 py-16 text-center text-gray-400">{t('noPayments')}</td></tr>
                  : payments.map((p, idx) => {
                    const refundable = p.refund_candidate || !!p.refund_status;
                    return (
                    <tr
                      key={p.id}
                      onClick={() => { if (refundable) openRefundModal(p); }}
                      className={cn(
                        'transition-colors',
                        refundable ? 'cursor-pointer' : '',
                        smsSelected.has(p.id) ? 'bg-indigo-50' : cn(refundRowBg(p), 'hover:brightness-95'),
                      )}
                    >
                      <td className="px-4 py-3 text-gray-400">{(page - 1) * pageSize + idx + 1}</td>
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={smsSelected.has(p.id)}
                          onChange={() => toggleSms(p.id)}
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">{p.student_name}</td>
                      <td className="px-4 py-3 text-gray-500">{p.student_phone || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{p.course_name || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{p.group_display || '—'}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900">{formatCurrency(p.amount)}</td>
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex items-center px-2 py-0.5 text-xs font-medium border rounded', TYPE_STYLES[p.payment_type])}>
                          {t(TYPE_LABEL_KEYS[p.payment_type] as Parameters<typeof t>[0])}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{formatDMY(p.paid_at)}</td>
                    </tr>
                    );
                  })
              }
            </tbody>
          </table>
        )}
      </div>

      <Pagination page={page} pageSize={pageSize} count={count} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />

      {/* ══ Refund Modal ══ */}
      <Dialog open={!!refundTarget} onOpenChange={(v) => { if (!v) closeRefundModal(); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('refundTitle')} — {refundTarget?.student_name}</DialogTitle>
            <p className="text-xs text-gray-500 mt-0.5">{refundTarget?.group_display} · {refundTarget?.course_name}</p>
          </DialogHeader>

          {refundLoading ? (
            <div className="space-y-2 mt-4">
              {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : existingRefund ? (
            <div className="mt-2 space-y-4">
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-700">{t('totalPaidLabel')}</span>
                  <span className="font-semibold">{formatCurrency(existingRefund.original_paid)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-700">{td('calculatedDebt')}</span>
                  <span className="font-semibold">{formatCurrency(existingRefund.earned_amount)}</span>
                </div>
                <div className="border-t border-gray-200 pt-2 flex justify-between text-sm">
                  <span className="text-gray-700 font-medium">{t('refundAmountLabel')}</span>
                  <span className="font-bold text-blue-600">{formatCurrency(existingRefund.refund_amount)}</span>
                </div>
              </div>

              {existingRefund.status === 'confirmed' && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-700">{t('refundReturnedPrompt')}</p>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={closeRefundModal}
                      className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50"
                    >
                      {common('cancel')}
                    </button>
                    <button
                      type="button"
                      onClick={handleMarkRefundPaid}
                      disabled={refundSaving}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-60"
                    >
                      {refundSaving ? common('loading') : t('refundReturnedButton')}
                    </button>
                  </div>
                </div>
              )}

              {existingRefund.status === 'paid' && (
                <p className="text-xs text-emerald-600 font-medium">
                  ✓ {t('refundReturnedOn', { date: existingRefund.paid_at ? formatDMY(existingRefund.paid_at) : '—' })}
                </p>
              )}
            </div>
          ) : candidateData ? (
            <div className="mt-2 space-y-4">
              <div className="text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded">
                {t('totalPaidLabel')}: {formatCurrency(candidateData.total_paid)}
              </div>

              {candidateData.billing_type === 'per_lesson' && candidateData.breakdown && (
                <div className="border border-gray-100 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">{td('date')}</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">{td('attendanceStatus')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {candidateData.breakdown.lessons.map((lesson) => (
                        <tr key={lesson.lesson_id} className={cn(
                          lesson.status === 'present' ? 'bg-green-50' :
                          lesson.status === 'late'    ? 'bg-yellow-50' : 'bg-red-50'
                        )}>
                          <td className="px-3 py-2 text-xs font-medium text-gray-700">{lesson.date}</td>
                          <td className="px-3 py-2">
                            <span className={cn(
                              'text-xs font-medium px-2 py-0.5 rounded-full',
                              lesson.status === 'present' ? 'bg-green-100 text-green-700' :
                              lesson.status === 'late'    ? 'bg-yellow-100 text-yellow-700' :
                                                            'bg-red-100 text-red-700'
                            )}>
                              {lesson.status === 'present' ? td('present') :
                               lesson.status === 'late'    ? td('late') : td('absent')}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-700">{td('coursePriceLabel')}</span>
                  <span className="font-semibold">{formatCurrency(candidateData.breakdown?.course_price ?? 0)}</span>
                </div>

                {candidateData.billing_type !== 'manual' && candidateData.breakdown && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-700">
                        {candidateData.billing_type === 'per_day' ? td('perDayPrice') : td('perLessonPrice')}
                      </span>
                      <span className="font-semibold">{formatCurrency(candidateData.breakdown.per_unit ?? 0)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-700">
                        {candidateData.billing_type === 'per_day' ? td('daysInGroup') : td('attendedLessons')}
                      </span>
                      <span className="font-semibold">
                        {candidateData.breakdown.units_count}
                        {candidateData.billing_type === 'per_lesson' ? ` / ${candidateData.breakdown.total_units}` : ''}{' '}
                        {candidateData.billing_type === 'per_day' ? td('days') : td('lessons')}
                      </span>
                    </div>
                  </>
                )}

                {candidateData.billing_type === 'manual' ? (
                  <div className="space-y-2 pt-1">
                    <label className="block text-sm font-medium text-gray-700">{t('manualEarnedLabel')}</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={manualEarned}
                      onChange={(e) => setManualEarned(formatAmount(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="0"
                    />
                  </div>
                ) : (
                  <div className="border-t border-gray-200 pt-2 flex justify-between text-sm">
                    <span className="text-gray-700 font-medium">{td('calculatedDebt')}</span>
                    <span className="font-bold text-blue-600">{formatCurrency(candidateData.earned_amount ?? 0)}</span>
                  </div>
                )}

                <div className="border-t border-gray-200 pt-2 flex justify-between text-sm">
                  <span className="text-gray-700 font-medium">{t('refundAmountLabel')}</span>
                  <span className="font-bold text-emerald-600">
                    {formatCurrency(Math.max(
                      candidateData.total_paid - (candidateData.earned_amount ?? parseAmount(manualEarned || '0')),
                      0,
                    ))}
                  </span>
                </div>
              </div>

              <p className="text-sm text-gray-700">{t('refundConfirmPrompt')}</p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={closeRefundModal}
                  className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50"
                >
                  {common('cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleConfirmRefund}
                  disabled={refundSaving || (candidateData.billing_type === 'manual' && parseAmount(manualEarned || '0') <= 0)}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-60"
                >
                  {refundSaving ? common('loading') : `${common('confirm')} ✓`}
                </button>
              </div>
            </div>
          ) : (
            <div className="py-6 text-sm text-gray-400 text-center">{common('noData')}</div>
          )}
        </DialogContent>
      </Dialog>

      <SmsModal
        open={showSmsConfirm}
        onClose={() => setShowSmsConfirm(false)}
        recipients={smsRecipients}
        onSend={handleSendSms}
      />
    </div>
  );
}
