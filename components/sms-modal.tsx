'use client';

import { useState, useEffect } from 'react';
import { Send } from 'lucide-react';
import toast from 'react-hot-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import api from '@/lib/axios';
import { cn } from '@/lib/utils';

interface SmsTemplate {
  id: string;
  name: string;
  body: string;
  trigger: string;
  is_default: boolean;
}

export interface SmsRecipient {
  id: string;
  name: string;
  phone: string;
  type?: 'student' | 'lead';
  amount?: string;
  due_date?: string;
  company_name?: string;
  course_name?: string;
  group_name?: string;
  teacher_name?: string;
}

const FINANCIAL_TRIGGERS = ['debt_reminder', 'overdue_debt', 'payment_confirmed'];

interface SmsModalProps {
  open: boolean;
  onClose: () => void;
  recipients: SmsRecipient[];
  onSend: (templateId: string | null, customMessage: string | null, recipients: SmsRecipient[]) => void;
}

const SAMPLE: Record<string, string> = {
  student_name: "O'quvchi",
  amount: '500,000',
  company_name: "O'quv markaz",
  due_date: '01.06.2026',
  group_name: '1A guruh',
  teacher_name: 'Ustoz',
  course_name: 'Kurs',
  lesson_time: '09:00',
  room_number: '101',
};

function resolvePreview(body: string, first?: SmsRecipient): string {
  return body.replace(/\{(\w+)\}/g, (_, key) => {
    if (key === 'student_name' && first) return first.name;
    return SAMPLE[key] ?? `{${key}}`;
  });
}

function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1][0]}.`;
}

export function SmsModal({ open, onClose, recipients, onSend }: SmsModalProps) {
  const [tab, setTab] = useState<'template' | 'custom'>('template');
  const [templates, setTemplates] = useState<SmsTemplate[]>([]);
  const [selected, setSelected] = useState<SmsTemplate | null>(null);
  const [customText, setCustomText] = useState('');

  useEffect(() => {
    if (open) {
      api.get('/api/v1/sms-templates/')
        .then(({ data }) => {
          const list: SmsTemplate[] = Array.isArray(data) ? data : (data?.results ?? []);
          setTemplates(list);
        })
        .catch(() => {});
    } else {
      setSelected(null);
      setCustomText('');
      setTab('template');
      setTemplates([]);
    }
  }, [open]);

  const first = recipients[0];
  const allLeads = recipients.length > 0 && recipients.every(r => r.type === 'lead');
  const visibleTemplates = allLeads
    ? templates.filter(t => !FINANCIAL_TRIGGERS.includes(t.trigger))
    : templates;

  function recipientLabel(): string {
    if (recipients.length === 0) return 'Qabul qiluvchilar tanlanmagan';
    if (recipients.length === 1) return `Yuboriladi: ${first.name} (${first.phone})`;
    if (recipients.length <= 3) return `Yuboriladi: ${recipients.map(r => shortName(r.name)).join(', ')}`;
    const shown = recipients.slice(0, 2).map(r => shortName(r.name)).join(', ');
    return `Yuboriladi: ${shown} va yana ${recipients.length - 2} ta`;
  }

  function handleSend() {
    if (recipients.length === 0) return;
    if (tab === 'template') {
      if (!selected) return;
      if (allLeads && FINANCIAL_TRIGGERS.includes(selected.trigger)) {
        toast.error("Bu shablon leads uchun mos emas");
        return;
      }
      onSend(selected.id, null, recipients);
    } else {
      if (!customText.trim()) return;
      onSend(null, customText, recipients);
    }
    onClose();
  }

  const canSend = recipients.length > 0 && (
    tab === 'template' ? !!selected : !!customText.trim()
  );

  const charCount = customText.length;
  const smsParts = charCount > 160 ? Math.ceil(charCount / 153) : 1;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>SMS yuborish</DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mt-2">
          <button
            onClick={() => setTab('template')}
            className={cn(
              'flex-1 py-1.5 text-sm font-medium rounded-md transition-colors',
              tab === 'template' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            📋 Shablon
          </button>
          <button
            onClick={() => setTab('custom')}
            className={cn(
              'flex-1 py-1.5 text-sm font-medium rounded-md transition-colors',
              tab === 'custom' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            ✏️ Qo&apos;lda yozish
          </button>
        </div>

        {/* Tab content */}
        {tab === 'template' ? (
          <div className="space-y-3 mt-2">
            {allLeads && (
              <div className="bg-amber-50 border border-amber-200 rounded p-2">
                <p className="text-xs text-amber-700">⚠️ Leadlar uchun moliyaviy shablonlar mavjud emas</p>
              </div>
            )}
            {visibleTemplates.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">Shablonlar topilmadi</p>
            ) : (
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {visibleTemplates.map((t, index) => (
                  <div
                    key={t.id}
                    onClick={() => setSelected(selected?.id === t.id ? null : t)}
                    className={cn(
                      'border rounded-xl p-3 cursor-pointer transition-colors hover:border-blue-400',
                      selected?.id === t.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 bg-white'
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold flex-shrink-0">
                        {index + 1}
                      </span>
                      <span className="text-sm font-semibold text-gray-900">{t.name}</span>
                    </div>
                    <p className="text-xs text-gray-500 whitespace-pre-wrap line-clamp-2">{t.body}</p>
                  </div>
                ))}
              </div>
            )}

            {selected && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Ko&apos;rinishi:</p>
                <div className="bg-gray-50 rounded p-3 text-sm whitespace-pre-wrap text-gray-700">
                  {resolvePreview(selected.body, first)}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2 mt-2">
            <textarea
              value={customText}
              onChange={e => setCustomText(e.target.value)}
              rows={5}
              placeholder="SMS matnini yozing..."
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400">{charCount}/160</p>
              {smsParts > 1 && (
                <p className="text-xs text-amber-600 font-medium">
                  Bu SMS {smsParts} ta xabarga bo&apos;linadi
                </p>
              )}
            </div>
          </div>
        )}

        {/* Recipients preview */}
        <p className="text-xs text-gray-500 mt-1 border-t border-gray-100 pt-2">{recipientLabel()}</p>

        {/* Footer */}
        <div className="flex gap-3 mt-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50"
          >
            Bekor qilish
          </button>
          <button
            onClick={handleSend}
            disabled={!canSend}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-60"
          >
            <Send className="w-4 h-4" />
            Yuborish
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
