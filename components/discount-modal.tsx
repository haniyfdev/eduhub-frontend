'use client';

import { useState } from 'react';
import { Tag } from 'lucide-react';
import { useTranslations } from 'next-intl';
import toast from 'react-hot-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import api from '@/lib/axios';
import { cn, formatCurrency } from '@/lib/utils';

export interface DiscountStudent {
  id: string;
  name: string;
  course_id: string;
  course_name: string;
  course_price: number;
}

interface DiscountModalProps {
  open: boolean;
  onClose: () => void;
  students: DiscountStudent[];
  onSave: () => void;
}

function nextMonthStr() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  d.setDate(1);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export function DiscountModal({ open, onClose, students, onSave }: DiscountModalProps) {
  const t  = useTranslations('students');
  const tc = useTranslations('common');

  const [percent, setPercent] = useState(10);
  const [months, setMonths]   = useState(1);
  const [note, setNote]       = useState('');
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving]   = useState(false);

  const coursePrice = students[0]?.course_price ?? 0;
  const courseName  = students[0]?.course_name  ?? '';
  const discountAmt = coursePrice * percent / 100;
  const finalAmt    = coursePrice * (1 - percent / 100);

  function handleClose() {
    setPercent(10); setMonths(1); setNote(''); setConfirm(false);
    onClose();
  }

  async function handleConfirm() {
    setSaving(true);
    try {
      await Promise.all(students.map(s =>
        api.post('/api/v1/discounts/', {
          student: s.id,
          course:  s.course_id,
          percent,
          months,
          note: note || null,
        })
      ));
      toast.success(t('discountSaved'));
      onSave();
      handleClose();
    } catch {
      toast.error(tc('error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Main modal */}
      <Dialog open={open && !confirm} onOpenChange={(o) => { if (!o) handleClose(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-amber-500" />
              {t('discountTitle')}
            </DialogTitle>
          </DialogHeader>

          <p className="text-sm text-gray-500 -mt-1">
            {students.length} {t('selectedStudents')} —{' '}
            <span className="font-medium text-gray-700">{courseName}</span>
          </p>

          <div className="space-y-5 mt-1">
            {/* Percent */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('discountPercent')} *
              </label>
              <input
                type="number" min={1} max={100} value={percent}
                onChange={e => setPercent(Math.min(100, Math.max(1, Number(e.target.value))))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <div className="grid grid-cols-3 gap-2 mt-2">
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500">{t('discountCoursePrice')}</p>
                  <p className="font-semibold text-gray-900 text-sm">{formatCurrency(coursePrice)}</p>
                </div>
                <div className="bg-red-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-red-500">{t('discountAmount')}</p>
                  <p className="font-semibold text-red-600 text-sm">-{formatCurrency(discountAmt)}</p>
                </div>
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-green-500">{t('discountFinal')}</p>
                  <p className="font-semibold text-green-700 text-sm">{formatCurrency(finalAmt)}</p>
                </div>
              </div>
            </div>

            {/* Months */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('discountMonths')} *
              </label>
              <input
                type="number" min={1} max={12} value={months}
                onChange={e => setMonths(Math.min(12, Math.max(1, Number(e.target.value))))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <div className="grid grid-cols-3 gap-2 mt-2">
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500">{t('discountMonthly')}</p>
                  <p className="font-semibold text-sm">{formatCurrency(finalAmt)}</p>
                </div>
                <div className="bg-amber-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-amber-600">{months} {t('discountTotal')}</p>
                  <p className="font-semibold text-amber-700 text-sm">{formatCurrency(finalAmt * months)}</p>
                </div>
                <div className="bg-blue-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-blue-500">{t('discountStarts')}</p>
                  <p className="font-semibold text-blue-700 text-sm">{nextMonthStr()}</p>
                </div>
              </div>
            </div>

            {/* Note */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('discountNote')}
              </label>
              <textarea
                rows={2} value={note} onChange={e => setNote(e.target.value)}
                placeholder={t('discountReasonPlaceholder')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={handleClose}
                className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50">
                {tc('cancel')}
              </button>
              <button type="button" onClick={() => setConfirm(true)}
                className="flex-1 px-4 py-2 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600">
                {tc('save')}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm dialog */}
      <Dialog open={confirm} onOpenChange={(o) => { if (!o) setConfirm(false); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('discountConfirmTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 mt-1">
            <span className="font-semibold">{students.length} {t('selectedStudents')}</span>:{' '}
            <span className="text-amber-600 font-semibold">{percent}%</span>{' '}
            {t('discountAmount').toLowerCase()},{' '}
            <span className="font-semibold">{months} {tc('month')}</span>.
            <br />
            {t('discountStarts')}:{' '}
            <span className="font-semibold text-blue-600">{nextMonthStr()}</span>.
          </p>
          <div className={cn('mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm')}>
            <p className="text-amber-700">
              {t('discountMonthly')}: <strong>{formatCurrency(finalAmt)}</strong>{' '}
              ({percent}% {t('discountAmount').toLowerCase()})
            </p>
          </div>
          <div className="flex gap-3 mt-3">
            <button type="button" onClick={() => setConfirm(false)} disabled={saving}
              className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50">
              {tc('no')}
            </button>
            <button type="button" onClick={handleConfirm} disabled={saving}
              className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60">
              {saving ? t('discountSaving') : tc('confirm')}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
