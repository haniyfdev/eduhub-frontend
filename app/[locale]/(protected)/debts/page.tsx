'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Search, AlertCircle, Send, Banknote, Snowflake } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Pagination } from '@/components/pagination';
import { SmsModal, type SmsRecipient } from '@/components/sms-modal';
import api from '@/lib/axios';
import { cn, formatCurrency, formatPhone } from '@/lib/utils';
import { PaginatedResponse } from '@/types';

interface Debt {
  id: string;
  student: string;
  group_student: string;
  student_name: string;
  student_phone: string;
  student_second_phone: string;
  student_status: string;
  group_name: string | null;
  group_id: string | null;
  course_id: string | null;
  course_name: string | null;
  amount: number;
  paid_amount: number;
  due_date: string;
  status: 'unpaid' | 'partial' | 'overdue' | 'paid';
  group_student_status?: string;
  group_student_left_at?: string | null;
  archive_billing_type?: string | null;
}

interface SobiqAttendance {
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

interface PaymentForm {
  amount: string;
  payment_type: 'cash' | 'card' | 'transfer';
  note: string;
}

function rowBg(debtStatus: Debt['status'], studentStatus: string, dueDate: string): string {
  const isOverdue = debtStatus === 'overdue' ||
    (debtStatus !== 'paid' && dueDate && new Date(dueDate) < new Date());
  if (isOverdue) return 'bg-red-100';
  if (studentStatus === 'frozen') return 'bg-[#F0F9FF]';
  switch (debtStatus) {
    case 'unpaid':   return 'bg-yellow-100';
    case 'partial':  return 'bg-yellow-50';
    default:         return '';
  }
}


const STATUS_BADGE: Record<string, string> = {
  unpaid:  'bg-yellow-100 text-yellow-800 border-yellow-300',
  partial: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  overdue: 'bg-red-100 text-red-700 border-red-300',
  paid:    'bg-green-50 text-green-700 border-green-200',
};

const PAYMENT_TYPE_KEYS: Record<string, string> = {
  cash: 'cash', card: 'card', transfer: 'transfer',
};

const formatAmount = (val: string) =>
  val.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const parseAmount = (val: string) =>
  Number(val.replace(/,/g, ''));

type PhoneSelection = Record<string, { phone1: boolean; phone2: boolean }>;

export default function DebtsPage() {
  const t = useTranslations('debts');
  const common = useTranslations('common');
  const [debts, setDebts]           = useState<Debt[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(false);
  const [search, setSearch]         = useState('');
  const [statusFilter, setStatusFilter] = useState('unpaid,overdue,partial');
  const [page, setPage]             = useState(1);
  const [count, setCount]           = useState(0);
  const [pageSize, setPageSize]     = useState(25);
  const [totalAmount, setTotalAmount] = useState(0);

  const [phoneSelection, setPhoneSelection] = useState<PhoneSelection>({});
  const [showConfirm, setShowConfirm]       = useState(false);
  const [smsVariables, setSmsVariables]     = useState<Record<string, Record<string, string>>>({});

  // Payment modal
  const [paymentTarget, setPaymentTarget] = useState<Debt | null>(null);
  const [paymentForm, setPaymentForm]     = useState<PaymentForm>({ amount: '', payment_type: 'cash', note: '' });
  const [paymentSaving, setPaymentSaving] = useState(false);

  // Sobiq modal
  const [showSobiqModal,  setShowSobiqModal]  = useState(false);
  const [sobiqDebt,       setSobiqDebt]       = useState<Debt | null>(null);
  const [sobiqAttendance, setSobiqAttendance] = useState<SobiqAttendance | null>(null);
  const [sobiqLoading,    setSobiqLoading]    = useState(false);

  async function openSobiqModal(debt: Debt) {
    setSobiqDebt(debt);
    setShowSobiqModal(true);
    setSobiqLoading(true);
    try {
      const { data } = await api.get<SobiqAttendance>(`/api/v1/debts/${debt.id}/last-month-attendance/`);
      setSobiqAttendance(data);
    } catch {
      setSobiqAttendance(null);
    } finally {
      setSobiqLoading(false);
    }
  }

  const fetchDebts = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const params: Record<string, string | number> = { page, page_size: pageSize };
      if (search)       params.search = search;
      if (statusFilter) params.status = statusFilter;
      const { data } = await api.get<PaginatedResponse<Debt> & { total_amount?: number }>(
        '/api/v1/debts/', { params }
      );
      setDebts(data.results);
      setCount(data.count);
      setTotalAmount(data.total_amount ?? data.results.reduce((s, d) => s + d.amount, 0));
      const init: PhoneSelection = {};
      data.results.forEach((d) => { init[d.id] = { phone1: false, phone2: false }; });
      setPhoneSelection(init);
    } catch {
      setError(true);
      toast.error(common('error'));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, statusFilter, common]);

  useEffect(() => { fetchDebts(); }, [fetchDebts]);
  useEffect(() => { setPage(1); }, [search, statusFilter]);

  function togglePhone(debtId: string, key: 'phone1' | 'phone2') {
    setPhoneSelection((prev) => ({
      ...prev,
      [debtId]: { ...prev[debtId], [key]: !prev[debtId]?.[key] },
    }));
  }

  const selectedCount = debts.reduce((acc, d) => {
    if (d.status === 'paid') return acc;
    const sel = phoneSelection[d.id];
    if (sel?.phone1 && d.student_phone)        acc++;
    if (sel?.phone2 && d.student_second_phone) acc++;
    return acc;
  }, 0);

  const selectedStudentIds = Array.from(new Set(
    debts
      .filter(d => d.status !== 'paid' && (phoneSelection[d.id]?.phone1 || phoneSelection[d.id]?.phone2))
      .map(d => d.student)
  ));

  async function openSmsModal() {
    if (selectedStudentIds.length === 0) return;
    try {
      const { data } = await api.post('/api/v1/sms-variables/', { student_ids: selectedStudentIds });
      setSmsVariables(data);
    } catch {
      setSmsVariables({});
    }
    setShowConfirm(true);
  }

  async function handleSend(templateId: string | null, customMessage: string | null, recipients: SmsRecipient[]) {
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
  }

  const smsRecipients: SmsRecipient[] = debts.flatMap(d => {
    if (d.status === 'paid') return [];
    const sel = phoneSelection[d.id];
    const vars = smsVariables[d.student] ?? {};
    const recs: SmsRecipient[] = [];
    const base = {
      name: d.student_name,
      type: 'student' as const,
      balance: String(Math.round(d.amount)),
      amount: String(Math.round(d.paid_amount || 0)),
      due_date: vars.due_date || d.due_date,
      course_name: vars.course_name || d.course_name || '',
      group_name: vars.group_name || d.group_name || '',
      teacher_name: vars.teacher_name || '',
      company_name: vars.company_name || '',
      lesson_time: vars.lesson_time || '',
      room_number: vars.room_number || '',
    };
    if (sel?.phone1 && d.student_phone)
      recs.push({ id: d.student, phone: d.student_phone, ...base });
    if (sel?.phone2 && d.student_second_phone)
      recs.push({ id: d.student, phone: d.student_second_phone, ...base });
    return recs;
  });

  function openPayment(debt: Debt) {
    console.log('debt object:', debt);
    setPaymentTarget(debt);
    const remaining = Math.abs(Number(debt.amount));
    setPaymentForm({ amount: formatAmount(String(Math.round(remaining))), payment_type: 'cash', note: '' });
  }

  async function handlePayment(e: React.FormEvent) {
    e.preventDefault();
    if (!paymentTarget) return;
    const amt = parseAmount(paymentForm.amount);
    const remaining = Math.abs(Number(paymentTarget.amount));
    if (amt < 1000) { toast.error(t('minAmount')); return; }
    if (amt > remaining) { toast.error(t('maxAmount')); return; }
    setPaymentSaving(true);
    try {
      await api.post('/api/v1/payments/', {
        group_student_id: paymentTarget.group_student,
        requested_amount: amt,
        payment_type:     paymentForm.payment_type,
        note:             paymentForm.note || '',
      });
      toast.success(common('success'));
      setPaymentTarget(null);
      fetchDebts();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: unknown } })?.response?.data;
      const msg = (detail as Record<string, unknown>)?.amount
        || (detail as Record<string, unknown>)?.detail
        || (typeof detail === 'string' ? detail : common('error'));
      toast.error(String(msg));
    } finally {
      setPaymentSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <Toaster position="top-right" />

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">{t('title')}</h1>
        {selectedCount > 0 && (
          <button
            onClick={openSmsModal}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors"
          >
            <Send className="w-4 h-4" />
            {common('send')} ({selectedCount})
          </button>
        )}
      </div>

      {/* Total alert */}
      {!loading && totalAmount > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-700">{t('totalDebt')}: {formatCurrency(totalAmount)}</p>
            <p className="text-xs text-red-500">{t('debtorCount', { count })}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700"
        >
          <option value="unpaid,overdue,partial">{common('all')}</option>
          <option value="unpaid">{common('unpaid')}</option>
          <option value="overdue">{t('overdue')}</option>
          <option value="partial">{common('partial')}</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded border border-gray-200 shadow-sm overflow-hidden">
        {error ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500">
            <p className="mb-3 text-sm">{common('error')}</p>
            <button onClick={fetchDebts} className="text-sm text-blue-600 underline">{common('retry')}</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-10">№</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-44">{common('student')}</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-16">{common('group')}</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-36">{common('phone')}</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-36">{t('parentPhone')}</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-32">{t('balance')}</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-28">{t('dueDate')}</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-24">{common('status')}</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-16">{common('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading
                ? Array(8).fill(0).map((_, i) => (
                  <tr key={i}>{Array(9).fill(0).map((_, j) => (
                    <td key={j} className="px-3 py-3"><Skeleton className="h-4 w-full" /></td>
                  ))}</tr>
                ))
                : debts.length === 0
                  ? <tr><td colSpan={9} className="px-3 py-16 text-center text-gray-400">{t('noDebts')}</td></tr>
                  : debts.map((d, idx) => {
                    const sel = phoneSelection[d.id] ?? { phone1: false, phone2: false };
                    const canSms = d.status !== 'paid';
                    return (
                      <tr
                        key={d.id}
                        className={cn(
                          'transition-colors',
                          d.group_student_status === 'left'
                            ? 'bg-green-100 hover:bg-green-200 cursor-pointer'
                            : cn('hover:brightness-95', rowBg(d.status, d.student_status, d.due_date))
                        )}
                        onClick={() => { if (d.group_student_status === 'left') openSobiqModal(d); }}
                      >
                        <td className="px-3 py-3 text-gray-400 text-xs w-10">{(page - 1) * pageSize + idx + 1}</td>

                        <td className="px-3 py-3 w-44">
                          <div className="flex flex-col">
                            <span className="font-medium text-gray-900 truncate max-w-[160px]">{d.student_name}</span>
                            {d.student_status === 'frozen' && (
                              <span className="inline-flex items-center gap-1 text-xs text-cyan-600 mt-0.5">
                                <Snowflake className="w-3 h-3" /> {common('frozen')}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="px-3 py-3 w-16">
                          <span className="text-gray-600 text-xs whitespace-nowrap">{d.group_name || '—'}</span>
                        </td>

                        <td className="px-3 py-3 w-36">
                          <label className={cn('flex items-center gap-1.5 cursor-pointer select-none', !canSms && 'cursor-default')}>
                            {canSms && (
                              <input
                                type="checkbox"
                                checked={sel.phone1}
                                onChange={() => togglePhone(d.id, 'phone1')}
                                className="rounded border-gray-300 flex-shrink-0"
                              />
                            )}
                            <span className="text-gray-600 text-xs whitespace-nowrap">{formatPhone(d.student_phone) || '—'}</span>
                          </label>
                        </td>

                        <td className="px-3 py-3 w-36">
                          {d.student_second_phone ? (
                            <label className={cn('flex items-center gap-1.5 cursor-pointer select-none', !canSms && 'cursor-default')}>
                              {canSms && (
                                <input
                                  type="checkbox"
                                  checked={sel.phone2}
                                  onChange={() => togglePhone(d.id, 'phone2')}
                                  className="rounded border-gray-300 flex-shrink-0"
                                />
                              )}
                              <span className="text-gray-600 text-xs whitespace-nowrap">{formatPhone(d.student_second_phone)}</span>
                            </label>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>

                        <td className="px-3 py-3 w-32">
                          <span className="font-semibold text-red-600 whitespace-nowrap">-{formatCurrency(d.amount)}</span>
                        </td>

                        <td className="px-3 py-3 w-28">
                          <span className="text-gray-600 text-xs whitespace-nowrap">
                            {new Date(d.due_date).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                          </span>
                        </td>

                        <td className="px-3 py-3 w-24">
                          <span className={cn('inline-flex items-center px-2 py-0.5 text-xs font-medium border rounded whitespace-nowrap', STATUS_BADGE[d.status])}>
                            {d.status === 'overdue' ? t('overdue') : common(d.status as Parameters<typeof common>[0])}
                          </span>
                        </td>

                        <td className="px-3 py-3 w-16">
                          {d.status !== 'paid' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); openPayment(d); }}
                              className="p-1 rounded text-blue-500 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                              title={t('payDebt')}
                            >
                              <Banknote className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
              }
            </tbody>
          </table>
          </div>
        )}
      </div>

      {!loading && count > 0 && (
        <Pagination
          page={page}
          pageSize={pageSize}
          count={count}
          onPageChange={setPage}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
        />
      )}

      <SmsModal
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        recipients={smsRecipients}
        onSend={handleSend}
      />

      {/* ══ Sobiq Modal ══ */}
      <Dialog open={showSobiqModal} onOpenChange={(v) => {
        setShowSobiqModal(v);
        if (!v) { setSobiqAttendance(null); fetchDebts(); }
      }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{sobiqAttendance?.student_name} — {sobiqAttendance?.group_name}</DialogTitle>
            <p className="text-xs text-gray-500 mt-0.5">{sobiqAttendance?.course_name}</p>
          </DialogHeader>

          {sobiqLoading ? (
            <div className="space-y-2 mt-4">
              {Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : sobiqAttendance && (
            <div className="mt-2 space-y-4">
              <div className="text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded">
                {sobiqAttendance.period_start} — {sobiqAttendance.left_at}
              </div>

              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-blue-300 bg-blue-50 text-blue-700 text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                {t('billingTypeLabel')}: {
                  sobiqAttendance.billing_type === 'manual'  ? t('billingManual') :
                  sobiqAttendance.billing_type === 'per_day' ? t('billingPerDay') :
                  t('billingPerLesson')
                }
              </div>

              <div className="border border-gray-100 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">{t('date')}</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">{t('attendanceStatus')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {sobiqAttendance.lessons.map((lesson) => (
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
                            {lesson.status === 'present' ? t('present') :
                             lesson.status === 'late'    ? t('late') : t('absent')}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {sobiqAttendance.lessons.length === 0 && (
                      <tr>
                        <td colSpan={2} className="px-3 py-4 text-center text-xs text-gray-400">{t('noDebts')}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="border-t border-gray-100 pt-4 space-y-3">
                {/* MANUAL — read-only saved amount */}
                {sobiqAttendance.billing_type === 'manual' && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">{t('manualDebtSaved')}</span>
                      <span className="font-bold text-blue-600">{formatCurrency(sobiqDebt?.amount ?? 0)}</span>
                    </div>
                  </div>
                )}

                {/* PER_DAY — read-only */}
                {sobiqAttendance.billing_type === 'per_day' && sobiqAttendance.per_unit !== null && (
                  <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-700">{t('coursePriceLabel')}</span>
                      <span className="font-semibold">{formatCurrency(sobiqAttendance.course_price)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-700">{t('perDayPrice')}</span>
                      <span className="font-semibold">{formatCurrency(sobiqAttendance.per_unit)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-700">{t('daysInGroup')}</span>
                      <span className="font-semibold">{sobiqAttendance.units_count} {t('days')}</span>
                    </div>
                    <div className="border-t border-gray-200 pt-2 flex justify-between text-sm">
                      <span className="text-gray-700">{t('calculatedDebt')}</span>
                      <span className="font-medium text-gray-700">{formatCurrency(sobiqAttendance.raw_amount ?? 0)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-700 font-medium">{t('roundedDebt')}</span>
                      <span className="font-bold text-blue-600">{formatCurrency(sobiqAttendance.calculated_amount ?? 0)}</span>
                    </div>
                  </div>
                )}

                {/* PER_LESSON — read-only */}
                {sobiqAttendance.billing_type === 'per_lesson' && sobiqAttendance.per_unit !== null && (
                  <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-700">{t('coursePriceLabel')}</span>
                      <span className="font-semibold">{formatCurrency(sobiqAttendance.course_price)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-700">{t('perLessonPrice')}</span>
                      <span className="font-semibold">{formatCurrency(sobiqAttendance.per_unit)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-700">{t('attendedLessons')}</span>
                      <span className="font-semibold">{sobiqAttendance.units_count} / {sobiqAttendance.total_units} {t('lessons')}</span>
                    </div>
                    <div className="border-t border-gray-200 pt-2 flex justify-between text-sm">
                      <span className="text-gray-700">{t('calculatedDebt')}</span>
                      <span className="font-medium text-gray-700">{formatCurrency(sobiqAttendance.raw_amount ?? 0)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-700 font-medium">{t('roundedDebt')}</span>
                      <span className="font-bold text-blue-600">{formatCurrency(sobiqAttendance.calculated_amount ?? 0)}</span>
                    </div>
                  </div>
                )}

              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ══ Payment Modal ══ */}
      <Dialog open={!!paymentTarget} onOpenChange={(open) => { if (!open) setPaymentTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{t('payDebt')}</DialogTitle></DialogHeader>

          {paymentTarget && (
            <div className="flex flex-wrap gap-1.5 mb-1 mt-2">
              <span className="inline-flex items-center px-2.5 py-1 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800 font-medium">
                {paymentTarget.student_name}
              </span>
              {paymentTarget.group_name && (
                <span className="inline-flex items-center px-2.5 py-1 bg-gray-100 border border-gray-200 rounded text-sm text-gray-600">
                  {paymentTarget.group_name}
                </span>
              )}
              {paymentTarget.course_name && (
                <span className="inline-flex items-center px-2.5 py-1 bg-gray-100 border border-gray-200 rounded text-sm text-gray-600">
                  {paymentTarget.course_name}
                </span>
              )}
            </div>
          )}

          <form onSubmit={handlePayment} className="space-y-4 mt-1">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {common('amount')}
                {paymentTarget && (
                  <span className="ml-2 text-xs text-gray-400 font-normal">
                    Maksimal: {formatCurrency(Math.abs(Number(paymentTarget.amount)))}
                  </span>
                )}
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={paymentForm.amount}
                onChange={(e) => {
                  const val = parseAmount(formatAmount(e.target.value));
                  const remaining = paymentTarget ? Math.abs(Number(paymentTarget.amount)) : Infinity;
                  if (val > remaining) return;
                  setPaymentForm((f) => ({ ...f, amount: formatAmount(e.target.value) }));
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
                autoFocus
                placeholder="0"
              />
              {paymentTarget && (() => {
                const amt = parseAmount(paymentForm.amount);
                const remaining = Math.abs(Number(paymentTarget.amount));
                const rem = remaining - amt;
                if (amt < 1000) return null;
                return (
                  <p className={cn('text-xs mt-1 font-medium',
                    rem <= 0 ? 'text-emerald-600' : 'text-orange-500'
                  )}>
                    {rem <= 0
                      ? `✓ ${t('fullPaid')}`
                      : `◑ ${t('partialRemaining', { rem: formatCurrency(Math.round(rem)) })}`
                    }
                  </p>
                );
              })()}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('paymentType')}</label>
              <div className="flex gap-2">
                {(['cash', 'card', 'transfer'] as const).map((pt) => (
                  <button key={pt} type="button"
                    onClick={() => setPaymentForm((f) => ({ ...f, payment_type: pt }))}
                    className={cn('flex-1 py-2 text-sm font-medium rounded border transition-colors',
                      paymentForm.payment_type === pt
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'border-gray-300 text-gray-600 hover:bg-gray-50')}>
                    {t(PAYMENT_TYPE_KEYS[pt] as Parameters<typeof t>[0])}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{common('note')}</label>
              <input type="text" value={paymentForm.note}
                onChange={(e) => setPaymentForm((f) => ({ ...f, note: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="..."
              />
            </div>

            <p className="text-xs text-gray-400">* {t('paymentNote')}</p>

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setPaymentTarget(null)}
                className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50">
                {common('cancel')}
              </button>
              <button type="submit" disabled={paymentSaving}
                className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-60">
                {paymentSaving ? common('loading') : t('pay')}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
