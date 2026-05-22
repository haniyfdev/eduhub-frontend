'use client';

import { useEffect, useRef, useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import api from '@/lib/axios';
import { getUser } from '@/lib/auth';
import { cn, formatCurrency } from '@/lib/utils';
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

type Tab = 'company' | 'sms' | 'discounts';

const TRIGGER_CHOICES = [
  ['debt_reminder', 'Qarzdorlik eslatmasi'],
  ['payment_confirmed', "To'lov tasdiqi"],
  ['lesson_reminder', 'Dars eslatmasi'],
  ['course_started', 'Kurs boshlanishi'],
  ['overdue_debt', "Muddati o'tgan qarz"],
  ['custom', 'Boshqa'],
];

const triggerLabel: Record<string, string> = {
  debt_reminder: 'Qarz eslatmasi',
  payment_confirmed: "To'lov tasdiqi",
  lesson_reminder: 'Dars eslatmasi',
  course_started: 'Kurs boshlanishi',
  overdue_debt: "Muddati o'tgan qarz",
  custom: 'Boshqa',
};

const triggerBadge: Record<string, string> = {
  debt_reminder: 'bg-yellow-100 text-yellow-700',
  payment_confirmed: 'bg-green-100 text-green-700',
  lesson_reminder: 'bg-blue-100 text-blue-700',
  course_started: 'bg-purple-100 text-purple-700',
  overdue_debt: 'bg-red-100 text-red-700',
  custom: 'bg-gray-100 text-gray-600',
};

const VARIABLES = [
  ['{student_name}', "O'quvchi to'liq ismi"],
  ['{amount}', "Qarz/to'lov summasi"],
  ['{due_date}', "To'lov muddati"],
  ['{course_name}', 'Kurs nomi'],
  ['{group_name}', 'Guruh nomi (masalan 2B)'],
  ['{teacher_name}', "O'qituvchi ismi"],
  ['{company_name}', "O'quv markaz nomi"],
  ['{phone}', "O'quvchi telefon raqami"],
  ['{balance}', 'Qoldiq qarz miqdori'],
];

const SAMPLE_VALUES: Record<string, string> = {
  '{student_name}': 'Jasur Karimov',
  '{amount}': "300,000 so'm",
  '{due_date}': '01/06/2026',
  '{course_name}': 'Ingliz tili',
  '{group_name}': '2B',
  '{teacher_name}': 'Sardor Azimov',
  '{company_name}': 'EduHub',
  '{phone}': '+998901234567',
  '{balance}': "150,000 so'm",
};

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const labelCls = 'block text-sm font-medium text-gray-700 mb-1';

export default function SettingsPage() {
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
      toast.error('Faqat JPG yoki PNG format qabul qilinadi');
      return;
    }
    if (file.size > 1024 * 1024) {
      toast.error('Fayl hajmi 1MB dan oshmasligi kerak');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const b64 = ev.target?.result as string;
      setCompanyLogo(b64);
      try { localStorage.setItem('company_logo', b64); } catch {}
      toast.success('Logo saqlandi');
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
      toast.success("Kompaniya ma'lumotlari saqlandi");
      setCompanyInfo((c) => c ? { ...c, ...companyForm } : c);
      try { localStorage.setItem('company_name', companyForm.name); } catch {}
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Xatolik yuz berdi');
    } finally {
      setSavingCompanyInfo(false);
    }
  }

  async function handleSettingsSave(e: React.FormEvent) {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await api.patch('/api/v1/company-settings/my/', settings);
      toast.success('Sozlamalar saqlandi');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Xatolik yuz berdi');
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
        setSmsTemplates((prev) => prev.map((t) => t.id === editingTemplate.id ? { ...t, ...data } : t));
      } else {
        const { data } = await api.post('/api/v1/sms-templates/', modalData);
        setSmsTemplates((prev) => [...prev, data]);
      }
      toast.success('Shablon saqlandi');
      setShowModal(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Xatolik yuz berdi');
    } finally {
      setSavingModal(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await api.delete(`/api/v1/sms-templates/${deleteTarget.id}/`);
      setSmsTemplates((prev) => prev.filter((t) => t.id !== deleteTarget.id));
      toast.success("Shablon o'chirildi");
      setDeleteTarget(null);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Xatolik yuz berdi');
    }
  }

  const tabs: Array<{ key: Tab; label: string; show: boolean }> = [
    { key: 'company', label: 'Kompaniya', show: canEditCompany },
    { key: 'sms', label: 'SMS shablonlar', show: canEditCompany },
    { key: 'discounts', label: 'Chegirmalar', show: true },
  ];

  const visibleTabs = tabs.filter((t) => t.show);

  return (
    <div className="space-y-5">
      <Toaster position="top-right" />
      <h1 className="text-xl font-bold text-gray-900">Sozlamalar</h1>

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
        <div className="space-y-5">
          {user?.company_id && (
            <div className="bg-white rounded border border-gray-200 shadow-sm p-6 max-w-xl">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Kompaniya ma&apos;lumotlari</h2>
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
                  Logo yuklash
                  <input type="file" accept="image/jpeg,image/jpg,image/png" className="hidden" onChange={handleCompanyLogoChange} />
                </label>
              </div>
              <form onSubmit={handleCompanyInfoSave} className="space-y-4">
                <div>
                  <label className={labelCls}>Kompaniya nomi</label>
                  <input value={companyForm.name} onChange={(e) => setCompanyForm((f) => ({ ...f, name: e.target.value }))}
                    className={inputCls} required />
                </div>
                <div>
                  <label className={labelCls}>Telefon</label>
                  <input value={companyForm.phone} onChange={(e) => setCompanyForm((f) => ({ ...f, phone: e.target.value }))}
                    className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Manzil</label>
                  <input value={companyForm.address} onChange={(e) => setCompanyForm((f) => ({ ...f, address: e.target.value }))}
                    className={inputCls} />
                </div>
                <button type="submit" disabled={savingCompanyInfo}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-60">
                  {savingCompanyInfo ? 'Saqlanmoqda...' : 'Saqlash'}
                </button>
              </form>
            </div>
          )}

          <div className="bg-white rounded border border-gray-200 shadow-sm p-6 max-w-xl">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Kompaniya sozlamalari</h2>
            {loadingSettings ? (
              <div className="space-y-4">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : (
              <form onSubmit={handleSettingsSave} className="space-y-5">
                <div>
                  <label className={labelCls}>Hisoblash turi</label>
                  <select
                    value={settings.billing_type}
                    onChange={(e) => setSettings((s) => ({ ...s, billing_type: e.target.value }))}
                    className={inputCls}
                  >
                    <option value="monthly">Oylik (to&apos;liq narx)</option>
                    <option value="per_lesson">Dars bo&apos;yicha</option>
                    <option value="upfront">Oldindan to&apos;liq</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Davomatsizlik siyosati</label>
                  <select
                    value={settings.absent_policy}
                    onChange={(e) => setSettings((s) => ({ ...s, absent_policy: e.target.value }))}
                    className={inputCls}
                  >
                    <option value="ignore">E&apos;tiborsiz (hech narsa qilmaydi)</option>
                    <option value="deduct">Qarzdan ayirish</option>
                    <option value="penalty">Jarima qo&apos;shish (+5%)</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>O&apos;qituvchi shartnoma bekor siyosati</label>
                  <select
                    value={settings.teacher_contract_break_policy}
                    onChange={(e) => setSettings((s) => ({ ...s, teacher_contract_break_policy: e.target.value }))}
                    className={inputCls}
                  >
                    <option value="full">To&apos;liq maosh</option>
                    <option value="prorate">Ishlagan kunlar bo&apos;yicha</option>
                    <option value="none">Maosh yo&apos;q</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-60"
                >
                  {savingSettings ? 'Saqlanmoqda...' : 'Saqlash'}
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
                📋 Mavjud o&apos;zgaruvchilar
              </span>
              <ChevronDown className={cn('w-4 h-4 text-blue-600 transition-transform', varsOpen && 'rotate-180')} />
            </button>
            {varsOpen && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {VARIABLES.map(([variable, desc]) => (
                  <div
                    key={variable}
                    className="flex items-center gap-2 bg-white rounded px-2 py-1.5 border border-blue-100 cursor-pointer hover:bg-blue-50"
                    onClick={() => {
                      navigator.clipboard.writeText(variable);
                      toast.success(`${variable} nusxalandi`);
                    }}
                  >
                    <code className="text-xs font-mono text-blue-600 font-semibold">{variable}</code>
                    <span className="text-xs text-gray-500">{desc}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Templates header */}
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">SMS shablonlar</h2>
            <button
              onClick={openCreate}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Shablon qo&apos;shish
            </button>
          </div>

          {/* Templates cards */}
          {loadingSms ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
            </div>
          ) : smsTemplates.length === 0 ? (
            <div className="py-10 text-center text-gray-400 text-sm">
              Hech qanday shablon topilmadi
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
                      {triggerLabel[tmpl.trigger] ?? tmpl.trigger}
                    </span>
                    {tmpl.is_default && (
                      <span className="text-xs text-gray-400">Standart shablon</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Discounts tab */}
      {(tab === 'discounts' || !canEditCompany) && (
        <DiscountsTab />
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
                className={inputCls}
                placeholder="Masalan: Qarzdorlik eslatmasi"
              />
            </div>
            <div>
              <label className={labelCls}>Holat uchun</label>
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
              <label className={labelCls}>Matn</label>
              <textarea
                ref={bodyRef}
                value={modalData.body}
                onChange={(e) => setModalData((d) => ({ ...d, body: e.target.value }))}
                rows={5}
                className={cn(inputCls, 'resize-none')}
                placeholder="SMS matnini kiriting..."
              />
              <p className="text-xs text-gray-400 mt-1">
                O&apos;zgaruvchi qo&apos;shish uchun yuqoridagi ro&apos;yxatdan bosing yoki qo&apos;lda yozing
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {VARIABLES.map(([variable]) => (
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
                <label className={labelCls}>Ko&apos;rinishi</label>
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
            {deleteTarget?.is_default
              ? "Bu standart shablon o'chiriladi va barcha markazlarda ko'rinmay qoladi."
              : <><span className="font-medium">{deleteTarget?.name}</span> shabloni o&apos;chiriladi.</>
            }
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

function DiscountsTab() {
  interface Discount {
    id: string;
    student: { id: string; first_name: string; last_name: string };
    amount: number;
    description: string;
    valid_until: string | null;
  }

  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ results: Discount[] }>('/api/v1/discounts/')
      .then(({ data }) => setDiscounts(data.results ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="bg-white rounded border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-900">Chegirmalar</h2>
      </div>
      {loading ? (
        <div className="p-5 space-y-3">{Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : discounts.length === 0 ? (
        <div className="px-5 py-10 text-center text-gray-400 text-sm">Chegirmalar topilmadi</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {["O'quvchi", 'Summa', 'Sabab', 'Amal qilish muddati'].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {discounts.map((d) => (
              <tr key={d.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">
                  {d.student?.first_name} {d.student?.last_name}
                </td>
                <td className="px-4 py-3 text-green-600 font-medium">{formatCurrency(d.amount)}</td>
                <td className="px-4 py-3 text-gray-600">{d.description || '—'}</td>
                <td className="px-4 py-3 text-gray-500">
                  {d.valid_until ? new Date(d.valid_until).toLocaleDateString('uz-UZ') : 'Cheksiz'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
