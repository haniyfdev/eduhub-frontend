'use client';

import { useEffect, useRef, useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import api from '@/lib/axios';
import { cn } from '@/lib/utils';

interface SmsTemplate {
  id: string;
  name: string;
  body: string;
  trigger: string;
  type: string;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
}

const TRIGGER_CHOICES: [string, string][] = [
  ['debt_reminder',     'Qarzdorlik eslatmasi'],
  ['payment_confirmed', "To'lov tasdiqi"],
  ['lesson_reminder',   'Dars eslatmasi'],
  ['course_started',    'Kurs boshlanishi'],
  ['overdue_debt',      "Muddati o'tgan qarz"],
  ['custom',            'Boshqa'],
];

const TRIGGER_LABEL: Record<string, string> = Object.fromEntries(TRIGGER_CHOICES);

const triggerBadge: Record<string, string> = {
  debt_reminder:     'bg-yellow-100 text-yellow-700',
  payment_confirmed: 'bg-green-100 text-green-700',
  lesson_reminder:   'bg-blue-100 text-blue-700',
  course_started:    'bg-purple-100 text-purple-700',
  overdue_debt:      'bg-red-100 text-red-700',
  custom:            'bg-gray-100 text-gray-600',
};

const VARIABLES = [
  '{student_name}',
  '{amount}',
  '{balance}',
  '{due_date}',
  '{course_name}',
  '{group_name}',
  '{teacher_name}',
  '{company_name}',
  '{phone}',
  '{lesson_time}',
  '{room_number}',
];

const VARIABLE_DESCS: Record<string, string> = {
  '{student_name}': "O'quvchi to'liq ismi",
  '{amount}':       "To'lov summasi",
  '{balance}':      'Qarz summasi',
  '{due_date}':     "To'lov muddati",
  '{course_name}':  'Kurs nomi',
  '{group_name}':   'Guruh nomi (masalan 2B)',
  '{teacher_name}': "O'qituvchi ismi",
  '{company_name}': "O'quv markaz nomi",
  '{phone}':        "O'quvchi telefon raqami",
  '{lesson_time}':  'Dars boshlanish vaqti',
  '{room_number}':  'Xona raqami',
};

const SAMPLE_VALUES: Record<string, string> = {
  '{student_name}': 'Jasur Karimov',
  '{amount}':       "300,000 so'm",
  '{balance}':      "100,000 so'm",
  '{due_date}':     '01/06/2026',
  '{course_name}':  'Ingliz tili',
  '{group_name}':   '2B',
  '{teacher_name}': 'Sardor Azimov',
  '{company_name}': 'EduHub',
  '{phone}':        '+998901234567',
  '{lesson_time}':  '09:00',
  '{room_number}':  '101',
};

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const labelCls = 'block text-sm font-medium text-gray-700 mb-1';

export default function SuperadminSmsTemplatesPage() {
  const [templates, setTemplates] = useState<SmsTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [varsOpen, setVarsOpen] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<SmsTemplate | null>(null);
  const [modalData, setModalData] = useState({ name: '', body: '', trigger: 'custom', is_active: true });
  const [savingModal, setSavingModal] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<SmsTemplate | null>(null);

  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setLoading(true);
    api.get('/api/v1/sms-templates/')
      .then(({ data }) => setTemplates(data.results ?? data))
      .catch(() => toast.error('Shablonlarni yuklashda xatolik'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setShowModal(false); }
    if (showModal) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showModal]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setDeleteTarget(null); }
    if (deleteTarget) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleteTarget]);

  function openCreate() {
    setEditingTemplate(null);
    setModalData({ name: '', body: '', trigger: 'custom', is_active: true });
    setShowModal(true);
  }

  function openEdit(tmpl: SmsTemplate) {
    setEditingTemplate(tmpl);
    setModalData({ name: tmpl.name, body: tmpl.body, trigger: tmpl.trigger, is_active: tmpl.is_active });
    setShowModal(true);
  }

  function insertVariable(variable: string) {
    const el = bodyRef.current;
    const current = modalData.body;
    if (!el) {
      setModalData((d) => ({ ...d, body: current + variable }));
      return;
    }
    const start = el.selectionStart ?? current.length;
    const end = el.selectionEnd ?? current.length;
    const newBody = current.slice(0, start) + variable + current.slice(end);
    setModalData((d) => ({ ...d, body: newBody }));
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + variable.length, start + variable.length);
    }, 0);
  }

  function renderPreview(body: string) {
    return Object.entries(SAMPLE_VALUES).reduce(
      (text, [key, val]) => text.split(key).join(val),
      body,
    );
  }

  async function handleSaveModal() {
    if (!modalData.name.trim() || !modalData.body.trim()) return;
    setSavingModal(true);
    try {
      if (editingTemplate) {
        const { data } = await api.patch(`/api/v1/sms-templates/${editingTemplate.id}/`, modalData);
        setTemplates((prev) => prev.map((t) => t.id === editingTemplate.id ? { ...t, ...data } : t));
      } else {
        const { data } = await api.post('/api/v1/sms-templates/', modalData);
        setTemplates((prev) => [data, ...prev]);
      }
      toast.success("Shablon saqlandi");
      setShowModal(false);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      toast.error(e?.response?.data?.detail || 'Xatolik yuz berdi');
    } finally {
      setSavingModal(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await api.delete(`/api/v1/sms-templates/${deleteTarget.id}/`);
      setTemplates((prev) => prev.filter((t) => t.id !== deleteTarget.id));
      toast.success("Shablon o'chirildi");
      setDeleteTarget(null);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      toast.error(e?.response?.data?.detail || 'Xatolik yuz berdi');
    }
  }

  return (
    <div className="space-y-5">
      <Toaster position="top-right" />
      <h1 className="text-xl font-bold text-gray-900">SMS shablonlar</h1>
      <p className="text-sm text-gray-500 -mt-3">
        Bu yerda yaratilgan shablonlar barcha kompaniyalarga avtomatik ko&apos;rinadi.
      </p>

      {/* Variables reference panel */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <button
          onClick={() => setVarsOpen((o) => !o)}
          className="flex items-center justify-between w-full"
        >
          <span className="text-sm font-semibold text-blue-700">
            📋 O&apos;zgaruvchilar (variables)
          </span>
          <ChevronDown className={cn('w-4 h-4 text-blue-600 transition-transform', varsOpen && 'rotate-180')} />
        </button>
        {varsOpen && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {VARIABLES.map((variable) => (
              <div
                key={variable}
                className="flex items-center gap-2 bg-white rounded px-2 py-1.5 border border-blue-100 cursor-pointer hover:bg-blue-50"
                onClick={() => {
                  navigator.clipboard.writeText(variable);
                  toast.success(`Nusxalandi: ${variable}`);
                }}
              >
                <code className="text-xs font-mono text-blue-600 font-semibold">{variable}</code>
                <span className="text-xs text-gray-500">{VARIABLE_DESCS[variable]}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Global shablonlar</h2>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Shablon qo&apos;shish
        </button>
      </div>

      {/* Template cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
        </div>
      ) : templates.length === 0 ? (
        <div className="py-10 text-center text-gray-400 text-sm">
          Hali global shablon yo&apos;q. Birinchi shablonni yarating.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {templates.map((tmpl, index) => (
            <div key={tmpl.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold shrink-0">
                    {index + 1}
                  </span>
                  <span className="inline-block px-3 py-1 bg-gray-100 text-gray-800 rounded-full text-sm font-semibold">
                    {tmpl.name}
                  </span>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                  <button
                    onClick={() => openEdit(tmpl)}
                    className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(tmpl)}
                    className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed mb-3">{tmpl.body}</p>
              <div className="flex items-center justify-between">
                <span className={cn(
                  'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                  triggerBadge[tmpl.trigger] ?? 'bg-gray-100 text-gray-600',
                )}>
                  {TRIGGER_LABEL[tmpl.trigger] ?? tmpl.trigger}
                </span>
                <span className="text-xs text-gray-400">Global shablon</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit modal */}
      <Dialog open={showModal} onOpenChange={(open) => { if (!open) setShowModal(false); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? 'Shablonni tahrirlash' : 'Yangi shablon'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className={labelCls}>Shablon nomi</label>
              <input
                value={modalData.name}
                onChange={(e) => setModalData((d) => ({ ...d, name: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); bodyRef.current?.focus(); }
                  if (e.key === 'Escape') { e.preventDefault(); setShowModal(false); }
                }}
                className={inputCls}
                placeholder="Masalan: Qarzdorlik eslatmasi"
                autoFocus
              />
            </div>
            <div>
              <label className={labelCls}>Trigger (qachon ishlatiladi)</label>
              <select
                value={modalData.trigger}
                onChange={(e) => setModalData((d) => ({ ...d, trigger: e.target.value }))}
                className={inputCls}
              >
                {TRIGGER_CHOICES.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Shablon matni</label>
              <textarea
                ref={bodyRef}
                value={modalData.body}
                onChange={(e) => setModalData((d) => ({ ...d, body: e.target.value }))}
                rows={5}
                className={cn(inputCls, 'resize-none')}
                placeholder="SMS matni... O'zgaruvchilar qo'shish uchun quyidagi tugmalarni bosing."
              />
              <p className="text-xs text-gray-400 mt-1">
                O&apos;zgaruvchilarni matn ichiga qo&apos;shish uchun quyidagi tugmalarni bosing.
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {VARIABLES.map((variable) => (
                  <button
                    key={variable}
                    type="button"
                    onClick={() => insertVariable(variable)}
                    className="px-2 py-0.5 bg-blue-50 border border-blue-200 text-xs font-mono text-blue-600 rounded hover:bg-blue-100 transition-colors"
                  >
                    {variable}
                  </button>
                ))}
              </div>
            </div>
            {modalData.body && (
              <div>
                <label className={labelCls}>Ko&apos;rinish (namuna)</label>
                <div className="bg-gray-50 rounded p-3 text-sm text-gray-700 whitespace-pre-wrap border border-gray-200">
                  {renderPreview(modalData.body)}
                </div>
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={handleSaveModal}
                disabled={savingModal || !modalData.name.trim() || !modalData.body.trim()}
                className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-60"
              >
                {savingModal ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Shablonni o&apos;chirish</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 mt-1">
            <strong>{deleteTarget?.name}</strong> shablonini o&apos;chirasizmi?
            Bu barcha kompaniyalarda ko&apos;rinmay qoladi.
          </p>
          <div className="flex gap-3 mt-4">
            <button
              onClick={() => setDeleteTarget(null)}
              className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50"
            >
              Bekor qilish
            </button>
            <button
              onClick={handleDelete}
              className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700"
            >
              O&apos;chirish
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
