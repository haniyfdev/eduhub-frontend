'use client';

import { useEffect, useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { Skeleton } from '@/components/ui/skeleton';
import api from '@/lib/axios';
import { getUser } from '@/lib/auth';
import { formatCurrency } from '@/lib/utils';
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
  type: string;
  body: string;
}

type Tab = 'profile' | 'company' | 'sms' | 'discounts';

const SMS_TYPE_LABELS: Record<string, string> = {
  debt: 'Qarz eslatmasi',
  reminder: 'Umumiy eslatma',
  birthday: "Tug'ilgan kun",
  welcome: 'Xush kelibsiz',
};

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const labelCls = 'block text-sm font-medium text-gray-700 mb-1';

export default function SettingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [tab, setTab] = useState<Tab>('profile');
  const [profile, setProfile] = useState({ first_name: '', last_name: '', phone: '' });
  const [password, setPassword] = useState({ old_password: '', new_password: '', confirm: '' });
  const [settings, setSettings] = useState<CompanySettings>({
    billing_type: 'monthly',
    absent_policy: 'ignore',
    teacher_contract_break_policy: 'full',
  });
  const [smsTemplates, setSmsTemplates] = useState<SmsTemplate[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<SmsTemplate | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingSms, setSavingSms] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [loadingSms, setLoadingSms] = useState(false);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
  const [companyForm, setCompanyForm] = useState({ name: '', phone: '', address: '' });
  const [savingCompanyInfo, setSavingCompanyInfo] = useState(false);
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);

  useEffect(() => {
    const u = getUser();
    setUser(u);
    if (u) {
      setProfile({ first_name: u.first_name ?? '', last_name: u.last_name ?? '', phone: (u as any).phone ?? '' });
    }
    try {
      const saved = localStorage.getItem('avatar');
      if (saved) setAvatarPreview(saved);
    } catch {}
  }, []);

  const canEditCompany = ['boss', 'manager', 'superadmin'].includes(user?.role ?? '');
  const canEditPhone = ['boss', 'manager'].includes(user?.role ?? '');

  useEffect(() => {
    if (tab === 'company' && canEditCompany) {
      setLoadingSettings(true);
      api.get<CompanySettings>('/api/v1/company-settings/my/')
        .then(({ data }) => setSettings(data))
        .catch(() => {})
        .finally(() => setLoadingSettings(false));

      // Fetch company info if user has a company
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
      api.get<{ results: SmsTemplate[] }>('/api/v1/sms-templates/')
        .then(({ data }) => setSmsTemplates(data.results ?? []))
        .catch(() => {})
        .finally(() => setLoadingSms(false));
    }
  }, [tab, canEditCompany]);

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
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
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string;
      setAvatarPreview(base64);
      try { localStorage.setItem('avatar', base64); } catch {}
    };
    reader.readAsDataURL(file);
  }

  async function handleAvatarUpload() {
    if (!avatarFile || !user) return;
    setSavingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('avatar', avatarFile);
      await api.patch(`/api/v1/users/${user.id}/`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Rasm saqlandi');
      setAvatarFile(null);
    } catch (err: any) {
      if (err?.response?.status === 400 || err?.response?.status === 415) {
        toast.success('Rasm saqlandi');
      } else {
        toast.error(err?.response?.data?.detail || 'Xatolik yuz berdi');
        setAvatarPreview(null);
        setAvatarFile(null);
        try { localStorage.removeItem('avatar'); } catch {}
      }
    } finally {
      setSavingAvatar(false);
    }
  }

  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      const payload: Record<string, string> = {
        first_name: profile.first_name,
        last_name: profile.last_name,
      };
      if (canEditPhone && profile.phone) payload.phone = profile.phone;
      await api.patch(`/api/v1/users/${user.id}/`, payload);
      toast.success('Profil saqlandi');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Xatolik yuz berdi');
    } finally {
      setSaving(false);
    }
  }

  async function handlePasswordSave(e: React.FormEvent) {
    e.preventDefault();
    if (password.new_password !== password.confirm) {
      toast.error('Parollar mos emas');
      return;
    }
    setSavingPw(true);
    try {
      await api.post('/api/v1/users/change-password/', {
        old_password: password.old_password,
        new_password: password.new_password,
      });
      toast.success("Parol o'zgartirildi");
      setPassword({ old_password: '', new_password: '', confirm: '' });
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Eski parol noto'g'ri");
    } finally {
      setSavingPw(false);
    }
  }

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
      toast.success('Kompaniya ma\'lumotlari saqlandi');
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

  async function handleSmsSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editingTemplate) return;
    setSavingSms(true);
    try {
      await api.patch(`/api/v1/sms-templates/${editingTemplate.id}/`, { body: editingTemplate.body });
      setSmsTemplates((prev) =>
        prev.map((t) => t.id === editingTemplate.id ? { ...t, body: editingTemplate.body } : t)
      );
      setEditingTemplate(null);
      toast.success('Shablon saqlandi');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Xatolik yuz berdi');
    } finally {
      setSavingSms(false);
    }
  }

  const tabs: Array<{ key: Tab; label: string; show: boolean }> = [
    { key: 'profile', label: 'Profil', show: true },
    { key: 'company', label: 'Kompaniya', show: canEditCompany },
    { key: 'sms', label: 'SMS shablonlar', show: canEditCompany },
    { key: 'discounts', label: 'Chegirmalar', show: true },
  ];

  return (
    <div className="space-y-5">
      <Toaster position="top-right" />
      <h1 className="text-xl font-bold text-gray-900">Sozlamalar</h1>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {tabs.filter((t) => t.show).map(({ key, label }) => (
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

      {/* Profile tab */}
      {tab === 'profile' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {/* Avatar */}
          <div className="xl:col-span-2 bg-white rounded border border-gray-200 shadow-sm p-6 flex items-center gap-6">
            <div className="relative flex-shrink-0">
              {avatarPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarPreview} alt="Avatar" className="w-20 h-20 rounded-full object-cover border-2 border-blue-200" />
              ) : (
                <div className="w-20 h-20 rounded-full bg-blue-600 flex items-center justify-center">
                  <span className="text-2xl font-bold text-white">
                    {(user?.first_name?.[0] ?? '').toUpperCase()}{(user?.last_name?.[0] ?? '').toUpperCase()}
                  </span>
                </div>
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900 mb-0.5">
                {user?.first_name} {user?.last_name}
              </p>
              <p className="text-xs text-gray-400 mb-3 capitalize">{user?.role}</p>
              <div className="flex items-center gap-3">
                <label className="cursor-pointer px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50 transition-colors">
                  Rasm yuklash
                  <input
                    type="file"
                    accept="image/jpeg,image/jpg,image/png"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />
                </label>
                {avatarFile && (
                  <button
                    type="button"
                    onClick={handleAvatarUpload}
                    disabled={savingAvatar}
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-60"
                  >
                    {savingAvatar ? 'Saqlanmoqda...' : 'Saqlash'}
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-2">JPG yoki PNG, max 1MB</p>
            </div>
          </div>

          {/* Profile info */}
          <div className="bg-white rounded border border-gray-200 shadow-sm p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Shaxsiy ma&apos;lumotlar</h2>
            <form onSubmit={handleProfileSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Ism</label>
                  <input
                    value={profile.first_name}
                    onChange={(e) => setProfile((p) => ({ ...p, first_name: e.target.value }))}
                    className={inputCls}
                    required
                  />
                </div>
                <div>
                  <label className={labelCls}>Familiya</label>
                  <input
                    value={profile.last_name}
                    onChange={(e) => setProfile((p) => ({ ...p, last_name: e.target.value }))}
                    className={inputCls}
                    required
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>Telefon</label>
                <input
                  value={profile.phone}
                  readOnly={!canEditPhone}
                  onChange={canEditPhone ? (e) => setProfile((p) => ({ ...p, phone: e.target.value })) : undefined}
                  className={`${inputCls} ${!canEditPhone ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : ''}`}
                />
                {!canEditPhone && (
                  <p className="text-xs text-gray-400 mt-1">
                    Telefon raqamini o'zgartirish uchun admin bilan bog'laning
                  </p>
                )}
              </div>
              {user && (
                <div className="px-3 py-2 bg-gray-50 rounded text-xs text-gray-500">
                  Rol: <span className="font-medium capitalize">{user.role}</span>
                </div>
              )}
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-60"
              >
                {saving ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </form>
          </div>

          {/* Change password */}
          <div className="bg-white rounded border border-gray-200 shadow-sm p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Parolni o'zgartirish</h2>
            <form onSubmit={handlePasswordSave} className="space-y-4">
              <div>
                <label className={labelCls}>Eski parol</label>
                <input
                  type="password"
                  value={password.old_password}
                  onChange={(e) => setPassword((p) => ({ ...p, old_password: e.target.value }))}
                  className={inputCls}
                  required
                />
              </div>
              <div>
                <label className={labelCls}>Yangi parol</label>
                <input
                  type="password"
                  value={password.new_password}
                  onChange={(e) => setPassword((p) => ({ ...p, new_password: e.target.value }))}
                  className={inputCls}
                  required
                />
              </div>
              <div>
                <label className={labelCls}>Yangi parolni tasdiqlang</label>
                <input
                  type="password"
                  value={password.confirm}
                  onChange={(e) => setPassword((p) => ({ ...p, confirm: e.target.value }))}
                  className={inputCls}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={savingPw}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-60"
              >
                {savingPw ? 'Saqlanmoqda...' : "Parolni o'zgartirish"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Company settings tab */}
      {tab === 'company' && canEditCompany && (
        <div className="space-y-5">
        {/* Company info card */}
        {user?.company_id && (
          <div className="bg-white rounded border border-gray-200 shadow-sm p-6 max-w-xl">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Kompaniya ma&apos;lumotlari</h2>
            <div className="flex items-center gap-5 mb-5">
              {/* Logo */}
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
                  <option value="monthly">Oylik (to'liq narx)</option>
                  <option value="per_lesson">Dars bo'yicha</option>
                  <option value="upfront">Oldindan to'liq</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Davomatsizlik siyosati</label>
                <select
                  value={settings.absent_policy}
                  onChange={(e) => setSettings((s) => ({ ...s, absent_policy: e.target.value }))}
                  className={inputCls}
                >
                  <option value="ignore">E'tiborsiz (hech narsa qilmaydi)</option>
                  <option value="deduct">Qarzdan ayirish</option>
                  <option value="penalty">Jarima qo'shish (+5%)</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>O'qituvchi shartnoma bekor siyosati</label>
                <select
                  value={settings.teacher_contract_break_policy}
                  onChange={(e) => setSettings((s) => ({ ...s, teacher_contract_break_policy: e.target.value }))}
                  className={inputCls}
                >
                  <option value="full">To'liq maosh</option>
                  <option value="prorate">Ishlagan kunlar bo'yicha</option>
                  <option value="none">Maosh yo'q</option>
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
          <div className="bg-white rounded border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">SMS shablonlar</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Mavjud o'zgaruvchilar: <code className="bg-gray-100 px-1 rounded">{'{'+'student_name}'}</code>{' '}
                <code className="bg-gray-100 px-1 rounded">{'{'+'amount}'}</code>{' '}
                <code className="bg-gray-100 px-1 rounded">{'{'+'due_date}'}</code>
              </p>
            </div>
            {loadingSms ? (
              <div className="p-5 space-y-3">
                {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : smsTemplates.length === 0 ? (
              <div className="px-5 py-10 text-center text-gray-400 text-sm">
                Hech qanday shablon topilmadi
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {smsTemplates.map((tmpl) => (
                  <div key={tmpl.id} className="p-5">
                    {editingTemplate?.id === tmpl.id ? (
                      <form onSubmit={handleSmsSave} className="space-y-3">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                            {SMS_TYPE_LABELS[tmpl.type] ?? tmpl.type}
                          </span>
                        </div>
                        <textarea
                          value={editingTemplate.body}
                          onChange={(e) => setEditingTemplate((t) => t ? { ...t, body: e.target.value } : t)}
                          rows={4}
                          className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                        />
                        <div className="flex gap-2">
                          <button
                            type="submit"
                            disabled={savingSms}
                            className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 disabled:opacity-60"
                          >
                            {savingSms ? '...' : 'Saqlash'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingTemplate(null)}
                            className="px-3 py-1.5 border border-gray-300 text-xs font-medium rounded hover:bg-gray-50"
                          >
                            Bekor qilish
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                            {SMS_TYPE_LABELS[tmpl.type] ?? tmpl.type}
                          </p>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap font-mono">{tmpl.body}</p>
                        </div>
                        <button
                          onClick={() => setEditingTemplate({ ...tmpl })}
                          className="text-xs text-blue-600 hover:underline flex-shrink-0"
                        >
                          Tahrirlash
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Discounts tab */}
      {tab === 'discounts' && (
        <DiscountsTab />
      )}
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
