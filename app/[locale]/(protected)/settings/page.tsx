'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import toast, { Toaster } from 'react-hot-toast';
import { ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import api from '@/lib/axios';
import { getUser } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { User } from '@/types';

interface CompanyInfo {
  id: string;
  name: string;
  phone: string;
  address: string;
}

interface CompanySettings {
  billing_type: string;
  absent_policy: string;
  teacher_contract_break_policy: string;
}

interface SmsTemplate {
  id: string;
  name: string;
  body: string;
  trigger: string;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
}

type Tab = 'company' | 'sms';

const triggerBadge: Record<string, string> = {
  debt_reminder: 'bg-yellow-100 text-yellow-700',
  payment_confirmed: 'bg-green-100 text-green-700',
  lesson_reminder: 'bg-blue-100 text-blue-700',
  course_started: 'bg-purple-100 text-purple-700',
  overdue_debt: 'bg-red-100 text-red-700',
  custom: 'bg-gray-100 text-gray-600',
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
  '{amount}': "To'lov summasi",
  '{balance}': 'Qarz summasi',
  '{due_date}': "To'lov muddati",
  '{course_name}': 'Kurs nomi',
  '{group_name}': 'Guruh nomi (masalan 2B)',
  '{teacher_name}': "O'qituvchi ismi",
  '{company_name}': "O'quv markaz nomi",
  '{phone}': "O'quvchi telefon raqami",
  '{lesson_time}': 'Dars boshlanish vaqti',
  '{room_number}': 'Xona raqami',
};

const SAMPLE_VALUES: Record<string, string> = {
  '{student_name}': 'Jasur Karimov',
  '{amount}': "300,000 so'm",
  '{balance}': "100,000 so'm",
  '{due_date}': '01/06/2026',
  '{course_name}': 'Ingliz tili',
  '{group_name}': '2B',
  '{teacher_name}': 'Sardor Azimov',
  '{company_name}': 'EduHub',
  '{phone}': '+998901234567',
  '{lesson_time}': '09:00',
  '{room_number}': '101',
};

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const labelCls = 'block text-sm font-medium text-gray-700 mb-1';

export default function SettingsPage() {
  const t = useTranslations('settings');
  const common = useTranslations('common');

  const [user, setUser] = useState<User | null>(null);
  const [tab, setTab] = useState<Tab>('company');
  const [settings, setSettings] = useState<CompanySettings>({
    billing_type: 'monthly',
    absent_policy: 'ignore',
    teacher_contract_break_policy: 'full',
  });
  const [smsTemplates, setSmsTemplates] = useState<SmsTemplate[]>([]);
  const [savingSettings, setSavingSettings] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [loadingSms, setLoadingSms] = useState(false);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
  const [companyForm, setCompanyForm] = useState({ name: '', phone: '', address: '' });
  const [savingCompanyInfo, setSavingCompanyInfo] = useState(false);
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);

  // SMS tab state
  const [varsOpen, setVarsOpen] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<SmsTemplate | null>(null);
  const [modalData, setModalData] = useState({ name: '', body: '', trigger: 'custom', is_active: true });
  const [savingModal, setSavingModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SmsTemplate | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Trigger choices built from translation keys
  const TRIGGER_CHOICES: [string, string][] = [
    ['debt_reminder', t('triggerChoices.debt_reminder')],
    ['payment_confirmed', t('triggerChoices.payment_confirmed')],
    ['lesson_reminder', t('triggerChoices.lesson_reminder')],
    ['course_started', t('triggerChoices.course_started')],
    ['overdue_debt', t('triggerChoices.overdue_debt')],
    ['custom', t('triggerChoices.custom')],
  ];

  useEffect(() => {
    const u = getUser();
    setUser(u);
  }, []);

  const canEditCompany = ['boss', 'manager', 'superadmin'].includes(user?.role ?? '');

  useEffect(() => {
    if (tab === 'company' && canEditCompany) {
      setLoadingSettings(true);
      api.get<CompanySettings>('/api/v1/company-settings/my/')
        .then(({ data }) => setSettings(data))
        .catch(() => {})
        .finally(() => setLoadingSettings(false));

      if (user?.company_id && !companyInfo) {
        api.get<CompanyInfo>(`/api/v1/companies/${user.company_id}/`)
          .then(({ data }) => {
            setCompanyInfo(data);
            setCompanyForm({ name: data.name ?? '', phone: data.phone ?? '', address: data.address ?? '' });
          })
          .catch(() => {});
      }

      try {
        const saved = localStorage.getItem('company_logo');
        if (saved) setCompanyLogo(saved);
      } catch {}
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, canEditCompany]);

  useEffect(() => {
    if (tab === 'sms' && canEditCompany) {
      setLoadingSms(true);
      api.get('/api/v1/sms-templates/')
        .then(({ data }) => setSmsTemplates(data.results ?? data))
        .catch(() => {})
        .finally(() => setLoadingSms(false));
    }
  }, [tab, canEditCompany]);

  function handleCompanyLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/jpg'].includes(file.type)) {
      toast.error(t('logoFormatError'));
      return;
    }
    if (file.size > 1024 * 1024) {
      toast.error(t('logoSizeError'));
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const b64 = ev.target?.result as string;
      setCompanyLogo(b64);
      try { localStorage.setItem('company_logo', b64); } catch {}
      toast.success(t('logoSaved'));
    };
    reader.readAsDataURL(file);
  }

  async function handleCompanyInfoSave(e: React.FormEvent) {
    e.preventDefault();
    if (!companyInfo) return;
    setSavingCompanyInfo(true);
    try {
      await api.patch(`/api/v1/companies/${companyInfo.id}/`, {
        name: companyForm.name,
        phone: companyForm.phone,
        address: companyForm.address,
      });
      toast.success(t('companySaved'));
      setCompanyInfo((c) => c ? { ...c, ...companyForm } : c);
      try { localStorage.setItem('company_name', companyForm.name); } catch {}
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { detail?: string } } };
      toast.error(e2?.response?.data?.detail || common('error'));
    } finally {
      setSavingCompanyInfo(false);
    }
  }

  async function handleSettingsSave(e: React.FormEvent) {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await api.patch('/api/v1/company-settings/my/', settings);
      toast.success(t('settingsSaved'));
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { detail?: string } } };
      toast.error(e2?.response?.data?.detail || common('error'));
    } finally {
      setSavingSettings(false);
    }
  }

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
    const currentBody = modalData.body;
    if (!el) {
      setModalData((d) => ({ ...d, body: currentBody + variable }));
      return;
    }
    const start = el.selectionStart ?? currentBody.length;
    const end = el.selectionEnd ?? currentBody.length;
    const newBody = currentBody.slice(0, start) + variable + currentBody.slice(end);
    setModalData((d) => ({ ...d, body: newBody }));
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + variable.length, start + variable.length);
    }, 0);
  }

  function renderPreview(body: string) {
    return Object.entries(SAMPLE_VALUES).reduce(
      (text, [key, val]) => text.split(key).join(val),
      body
    );
  }

  async function handleSaveModal() {
    if (!modalData.name.trim() || !modalData.body.trim()) return;
    setSavingModal(true);
    try {
      if (editingTemplate) {
        const { data } = await api.patch(`/api/v1/sms-templates/${editingTemplate.id}/`, modalData);
        setSmsTemplates((prev) => prev.map((tmpl) => tmpl.id === editingTemplate.id ? { ...tmpl, ...data } : tmpl));
      } else {
        const { data } = await api.post('/api/v1/sms-templates/', modalData);
        setSmsTemplates((prev) => [...prev, data]);
      }
      toast.success(t('templateSaved'));
      setShowModal(false);
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { detail?: string } } };
      toast.error(e2?.response?.data?.detail || common('error'));
    } finally {
      setSavingModal(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await api.delete(`/api/v1/sms-templates/${deleteTarget.id}/`);
      setSmsTemplates((prev) => prev.filter((tmpl) => tmpl.id !== deleteTarget.id));
      toast.success(t('templateDeleted'));
      setDeleteTarget(null);
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { detail?: string } } };
      toast.error(e2?.response?.data?.detail || common('error'));
    }
  }

  const tabs: Array<{ key: Tab; label: string; show: boolean }> = [
    { key: 'company', label: t('tabs.company'), show: canEditCompany },
    { key: 'sms', label: t('tabs.sms'), show: canEditCompany },
  ];

  const visibleTabs = tabs.filter((tab) => tab.show);

  return (
    <div className="space-y-5">
      <Toaster position="top-right" />
      <h1 className="text-xl font-bold text-gray-900">{t('title')}</h1>

      {visibleTabs.length > 1 && (
        <div className="flex border-b border-gray-200">
          {visibleTabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Company settings tab */}
      {tab === 'company' && canEditCompany && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {user?.company_id && (
            <div className="bg-white rounded border border-gray-200 shadow-sm p-6">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">{t('companyInfo')}</h2>
              <div className="flex items-center gap-5 mb-5">
                <div className="relative flex-shrink-0">
                  {companyLogo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={companyLogo} alt="Logo" className="w-16 h-16 rounded-xl object-cover border border-gray-200" />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-blue-600 flex items-center justify-center">
                      <span className="text-lg font-bold text-white">
                        {(companyForm.name || companyInfo?.name || '?')[0]?.toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
                <label className="cursor-pointer px-3 py-1.5 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50 transition-colors">
                  {t('uploadLogo')}
                  <input type="file" accept="image/jpeg,image/jpg,image/png" className="hidden" onChange={handleCompanyLogoChange} />
                </label>
              </div>
              <form onSubmit={handleCompanyInfoSave} className="space-y-4">
                <div>
                  <label className={labelCls}>{t('companyName')}</label>
                  <input value={companyForm.name} onChange={(e) => setCompanyForm((f) => ({ ...f, name: e.target.value }))}
                    className={inputCls} required />
                </div>
                <div>
                  <label className={labelCls}>{t('phone')}</label>
                  <input value={companyForm.phone} onChange={(e) => setCompanyForm((f) => ({ ...f, phone: e.target.value }))}
                    className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>{t('address')}</label>
                  <input value={companyForm.address} onChange={(e) => setCompanyForm((f) => ({ ...f, address: e.target.value }))}
                    className={inputCls} />
                </div>
                <button type="submit" disabled={savingCompanyInfo}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-60">
                  {savingCompanyInfo ? t('saving') : t('save')}
                </button>
              </form>
            </div>
          )}

          <div className="bg-white rounded border border-gray-200 shadow-sm p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">{t('companySettings')}</h2>
            {loadingSettings ? (
              <div className="space-y-4">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : (
              <form onSubmit={handleSettingsSave} className="space-y-5">
                <div>
                  <label className={labelCls}>{t('billingType')}</label>
                  <select
                    value={settings.billing_type}
                    onChange={(e) => setSettings((s) => ({ ...s, billing_type: e.target.value }))}
                    className={inputCls}
                  >
                    <option value="monthly">{t('billingMonthly')}</option>
                    <option value="per_lesson">{t('billingPerLesson')}</option>
                    <option value="upfront">{t('billingUpfront')}</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>{t('absentPolicy')}</label>
                  <select
                    value={settings.absent_policy}
                    onChange={(e) => setSettings((s) => ({ ...s, absent_policy: e.target.value }))}
                    className={inputCls}
                  >
                    <option value="ignore">{t('absentIgnore')}</option>
                    <option value="deduct">{t('absentDeduct')}</option>
                    <option value="penalty">{t('absentPenalty')}</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>{t('contractPolicy')}</label>
                  <select
                    value={settings.teacher_contract_break_policy}
                    onChange={(e) => setSettings((s) => ({ ...s, teacher_contract_break_policy: e.target.value }))}
                    className={inputCls}
                  >
                    <option value="full">{t('contractFull')}</option>
                    <option value="prorate">{t('contractProrate')}</option>
                    <option value="none">{t('contractNone')}</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-60"
                >
                  {savingSettings ? t('saving') : t('save')}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* SMS Templates tab */}
      {tab === 'sms' && canEditCompany && (
        <div className="space-y-4">
          {/* Variables reference panel */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <button
              onClick={() => setVarsOpen((o) => !o)}
              className="flex items-center justify-between w-full"
            >
              <span className="text-sm font-semibold text-blue-700">
                📋 {t('variables')}
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
                      toast.success(t('copied', { var: variable }));
                    }}
                  >
                    <code className="text-xs font-mono text-blue-600 font-semibold">{variable}</code>
                    <span className="text-xs text-gray-500">{VARIABLE_DESCS[variable]}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Templates header */}
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">{t('templates')}</h2>
            <button
              onClick={openCreate}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              {t('addTemplate')}
            </button>
          </div>

          {/* Templates cards */}
          {loadingSms ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
            </div>
          ) : smsTemplates.length === 0 ? (
            <div className="py-10 text-center text-gray-400 text-sm">
              {t('noTemplates')}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {smsTemplates.map((tmpl, index) => (
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
                    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', triggerBadge[tmpl.trigger] ?? 'bg-gray-100 text-gray-600')}>
                      {t(`triggerChoices.${tmpl.trigger}` as Parameters<typeof t>[0]) ?? tmpl.trigger}
                    </span>
                    {tmpl.is_default && (
                      <span className="text-xs text-gray-400">{t('defaultTemplate')}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add / Edit modal */}
      <Dialog open={showModal} onOpenChange={(open) => { if (!open) setShowModal(false); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? t('editTemplate') : t('newTemplate')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className={labelCls}>{t('templateName')}</label>
              <input
                value={modalData.name}
                onChange={(e) => setModalData((d) => ({ ...d, name: e.target.value }))}
                className={inputCls}
                placeholder={t('templateNamePlaceholder')}
              />
            </div>
            <div>
              <label className={labelCls}>{t('templateTrigger')}</label>
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
              <label className={labelCls}>{t('templateBody')}</label>
              <textarea
                ref={bodyRef}
                value={modalData.body}
                onChange={(e) => setModalData((d) => ({ ...d, body: e.target.value }))}
                rows={5}
                className={cn(inputCls, 'resize-none')}
                placeholder={t('templateBodyPlaceholder')}
              />
              <p className="text-xs text-gray-400 mt-1">
                {t('templateBodyHint')}
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
                <label className={labelCls}>{t('preview')}</label>
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
                {common('cancel')}
              </button>
              <button
                type="button"
                onClick={handleSaveModal}
                disabled={savingModal || !modalData.name.trim() || !modalData.body.trim()}
                className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-60"
              >
                {savingModal ? t('saving') : t('save')}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('deleteTemplate')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 mt-1">
            {deleteTarget?.is_default
              ? t('deleteDefaultBody')
              : t('deleteBody', { name: deleteTarget?.name ?? '' })
            }
          </p>
          <div className="flex gap-3 mt-4">
            <button
              onClick={() => setDeleteTarget(null)}
              className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50"
            >
              {common('cancel')}
            </button>
            <button
              onClick={handleDelete}
              className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700"
            >
              {common('delete')}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
