'use client';

import { useEffect, useState, useCallback } from 'react';
import { Tag, Users, BookOpen, Send } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { SmsModal, type SmsRecipient } from '@/components/sms-modal';
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

function fmtMonthYear(iso: string) {
  if (!iso) return '—';
  const [, m, ] = iso.split('-');
  const [y] = iso.split('-');
  return `${m}/${y}`;
}

type TabKey = 'students' | 'courses';

export default function DiscountsPage() {
  const [tab, setTab]               = useState<TabKey>('students');
  const [discounts, setDiscounts]   = useState<Discount[]>([]);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState<Set<string>>(new Set());
  const [showSms, setShowSms]       = useState(false);

  const fetchDiscounts = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<PaginatedResponse<Discount>>('/api/v1/discounts/?page_size=200');
      setDiscounts(data.results ?? []);
    } catch {
      toast.error("Ma'lumotlarni yuklashda xatolik");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDiscounts(); }, [fetchDiscounts]);

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }

  const smsRecipients: SmsRecipient[] = discounts
    .filter(d => selected.has(d.id) && !!d.student_phone)
    .map(d => ({
      id: d.student,
      type: 'student' as const,
      name: d.student_name,
      phone: d.student_phone,
    }));

  async function handleSendSms(templateId: string | null, customMessage: string | null, recipients: SmsRecipient[]) {
    try {
      await api.post('/api/v1/notifications/send-sms/', {
        template_id: templateId,
        message: customMessage,
        recipients: recipients.map(r => ({ type: r.type, id: r.id, phone: r.phone })),
      });
      toast.success(`${recipients.length} ta SMS yuborildi`);
    } catch {
      toast.error('SMS yuborishda xatolik');
    }
    setSelected(new Set());
  }

  return (
    <div className="space-y-5">
      <Toaster position="top-right" />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Chegirmalar</h1>
          <p className="text-sm text-gray-500 mt-0.5">Talabalar uchun chegirmalar</p>
        </div>
        {selected.size > 0 && (
          <button onClick={() => setShowSms(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded hover:bg-indigo-700 transition-colors">
            <Send className="w-4 h-4" />
            SMS ({selected.size})
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {([
          { key: 'students', label: 'Talabalar', icon: Users },
          { key: 'courses',  label: 'Kurslar',   icon: BookOpen },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}>
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* TAB: Talabalar */}
      {tab === 'students' && (
        <div className="bg-white rounded border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {['', '№', 'Talaba', 'Kurs', 'Chegirma', 'Chegirma (so\'m)', 'To\'lanajak', 'Muddat', 'Boshlanish', 'Tugash'].map((h, i) => (
                  <th key={i} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
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
                  ? <tr><td colSpan={10} className="px-4 py-16 text-center text-gray-400">Chegirmalar mavjud emas</td></tr>
                  : discounts.map((d, idx) => (
                    <tr key={d.id} className={cn('transition-colors hover:bg-gray-50', selected.has(d.id) && 'bg-indigo-50')}>
                      <td className="px-3 py-3">
                        <input type="checkbox" checked={selected.has(d.id)}
                          onChange={() => toggleSelect(d.id)}
                          className="rounded border-gray-300" />
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{d.student_name}</td>
                      <td className="px-4 py-3 text-gray-600">{d.course_name}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold border rounded bg-amber-50 text-amber-700 border-amber-200">
                          <Tag className="w-3 h-3" />
                          {d.percent}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-red-600 font-medium">-{formatCurrency(d.discount_amount)}</td>
                      <td className="px-4 py-3 text-green-700 font-semibold">{formatCurrency(d.final_amount)}</td>
                      <td className="px-4 py-3 text-gray-600">{d.months} oy</td>
                      <td className="px-4 py-3 text-gray-500">{fmtMonthYear(d.start_month)}</td>
                      <td className="px-4 py-3 text-gray-500">{fmtMonthYear(d.end_month)}</td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>
      )}

      {/* TAB: Kurslar */}
      {tab === 'courses' && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <BookOpen className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm font-medium">Tez kunda...</p>
          <p className="text-xs mt-1">Kurslar bo&apos;yicha chegirmalar statistikasi</p>
        </div>
      )}

      <SmsModal
        open={showSms}
        onClose={() => setShowSms(false)}
        recipients={smsRecipients}
        onSend={handleSendSms}
      />
    </div>
  );
}
