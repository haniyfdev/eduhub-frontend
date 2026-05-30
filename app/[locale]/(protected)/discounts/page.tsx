'use client';

import { useEffect, useState, useCallback } from 'react';
import { Minus, Send } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { useTranslations } from 'next-intl';
import { getUser } from '@/lib/auth';
import { Skeleton } from '@/components/ui/skeleton';
import { SmsModal, type SmsRecipient } from '@/components/sms-modal';
import api from '@/lib/axios';
import { cn, formatCurrency, formatPhone } from '@/lib/utils';
import { PaginatedResponse } from '@/types';

interface Discount {
  id: string;
  student: string;
  student_name: string;
  student_phone: string;
  student_second_phone: string | null;
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

type PhoneSelection = Record<string, { phone1: boolean; phone2: boolean }>;

function isActiveDiscount(endMonth: string) {
  if (!endMonth) return false;
  return new Date(endMonth) > new Date();
}

export default function DiscountsPage() {
  const t  = useTranslations('discounts');
  const tc = useTranslations('common');
  const isAdmin = getUser()?.role === 'admin';

  const [discounts, setDiscounts]   = useState<Discount[]>([]);
  const [loading, setLoading]       = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [phoneSelection, setPhoneSelection] = useState<PhoneSelection>({});
  const [showSms, setShowSms]               = useState(false);
  const [smsVariables, setSmsVariables]     = useState<Record<string, Record<string, string>>>({});

  const fetchDiscounts = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<PaginatedResponse<Discount>>('/api/v1/discounts/?page_size=200');
      const results = data.results ?? [];
      setDiscounts(results);
      const init: PhoneSelection = {};
      results.forEach(d => { init[d.id] = { phone1: false, phone2: false }; });
      setPhoneSelection(init);
    } catch {
      toast.error(tc('error'));
    } finally {
      setLoading(false);
    }
  }, [tc]);

  useEffect(() => { fetchDiscounts(); }, [fetchDiscounts]);

  function togglePhone(id: string, key: 'phone1' | 'phone2') {
    setPhoneSelection(prev => ({
      ...prev,
      [id]: { ...prev[id], [key]: !prev[id]?.[key] },
    }));
  }

  const selectedCount = discounts.reduce((acc, d) => {
    const sel = phoneSelection[d.id];
    if (sel?.phone1 && d.student_phone)        acc++;
    if (sel?.phone2 && d.student_second_phone) acc++;
    return acc;
  }, 0);

  const selectedStudentIds = Array.from(new Set(
    discounts
      .filter(d => phoneSelection[d.id]?.phone1 || phoneSelection[d.id]?.phone2)
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
    setShowSms(true);
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
          course_name: r.course_name || '',
          group_name: r.group_name || '',
          teacher_name: r.teacher_name || '',
          company_name: r.company_name || '',
          lesson_time: r.lesson_time || '',
          room_number: r.room_number || '',
        })),
      });
      toast.success(`${recipients.length} ta SMS yuborildi`);
    } catch {
      toast.error(tc('error'));
    }
  }

  const smsRecipients: SmsRecipient[] = discounts.flatMap(d => {
    const sel  = phoneSelection[d.id];
    const vars = smsVariables[d.student] ?? {};
    const recs: SmsRecipient[] = [];
    const base = {
      name:         d.student_name,
      amount:       vars.amount       || '',
      balance:      vars.balance      || '',
      due_date:     vars.due_date     || '',
      course_name:  vars.course_name  || d.course_name || '',
      group_name:   vars.group_name   || '',
      teacher_name: vars.teacher_name || '',
      company_name: vars.company_name || '',
      lesson_time:  vars.lesson_time  || '',
      room_number:  vars.room_number  || '',
    };
    if (sel?.phone1 && d.student_phone)
      recs.push({ id: d.student, phone: d.student_phone, type: 'student', ...base });
    if (sel?.phone2 && d.student_second_phone)
      recs.push({ id: d.student, phone: d.student_second_phone, type: 'parent', ...base });
    return recs;
  });

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
        {selectedCount > 0 && (
          <button
            onClick={openSmsModal}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors"
          >
            <Send className="w-4 h-4" />
            SMS ({selectedCount})
          </button>
        )}
      </div>

      <div className="bg-white rounded border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {(() => { const th = 'text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide'; return (<>
                <th className={th}>№</th>
                <th className={th}>{tc('student')}</th>
                <th className={th}>{tc('course')}</th>
                <th className={th}>Kurs narxi</th>
                <th className={`${th} w-28`}>{t('percent')}</th>
                <th className={`${th} w-28`}>{t('months')}</th>
                <th className={th}>{tc('phone')}</th>
                <th className={th}>{t('parentPhone')}</th>
                <th className={th}>{tc('status')}</th>
                <th className={`${th} text-right`}>{tc('actions')}</th>
              </>); })()}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading
              ? Array(5).fill(0).map((_, i) => (
                <tr key={i}>{Array(10).fill(0).map((_, j) => (
                  <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                ))}</tr>
              ))
              : discounts.length === 0
                ? <tr><td colSpan={10} className="px-4 py-16 text-center text-gray-400">{t('noDiscounts')}</td></tr>
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

                        {/* Phone 1 */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={phoneSelection[d.id]?.phone1 ?? false}
                              onChange={() => togglePhone(d.id, 'phone1')}
                              className="rounded border-gray-300 flex-shrink-0"
                            />
                            <span className="text-gray-500 text-xs whitespace-nowrap">{formatPhone(d.student_phone)}</span>
                          </label>
                        </td>

                        {/* Phone 2 (parent) */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          {d.student_second_phone ? (
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={phoneSelection[d.id]?.phone2 ?? false}
                                onChange={() => togglePhone(d.id, 'phone2')}
                                className="rounded border-gray-300 flex-shrink-0"
                              />
                              <span className="text-gray-500 text-xs whitespace-nowrap">{formatPhone(d.student_second_phone)}</span>
                            </label>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>

                        <td className="px-4 py-3">
                          <span className={cn(
                            'inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded border',
                            active
                              ? 'bg-green-50 text-green-700 border-green-200'
                              : 'bg-gray-100 text-gray-500 border-gray-200'
                          )}>
                            {active ? tc('active') : 'Tugagan'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {!isAdmin && (
                            <button
                              onClick={() => handleDelete(d.id)}
                              disabled={deletingId === d.id}
                              className="p-1 rounded text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-40"
                              title={tc('archive')}
                            >
                              <Minus className="w-4 h-4" />
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

      <SmsModal
        open={showSms}
        onClose={() => setShowSms(false)}
        recipients={smsRecipients}
        onSend={handleSendSms}
      />
    </div>
  );
}
