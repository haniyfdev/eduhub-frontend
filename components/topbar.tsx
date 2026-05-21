'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Eye, EyeOff, Globe, LogOut } from 'lucide-react';
import { useLocale } from 'next-intl';
import { getUser, logout } from '@/lib/auth';
import NotificationBell from './notification-bell';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { User } from '@/types';
import { cn } from '@/lib/utils';
import api from '@/lib/axios';
import toast from 'react-hot-toast';

const TITLES: Record<string, string> = {
  dashboard: 'Bosh sahifa',
  students: "O'quvchilar",
  groups: 'Guruhlar',
  teachers: "O'qituvchilar",
  courses: 'Kurslar',
  payments: "To'lovlar",
  debts: 'Qarzlar',
  reports: 'Hisobotlar',
  settings: 'Sozlamalar',
  companies: 'Kompaniyalar',
};

const LANG_LABELS: Record<string, string> = { uz: 'UZ', ru: 'RU', en: 'EN' };

const ROLE_LABELS: Record<string, string> = {
  superadmin: 'Superadmin',
  boss: 'Boss',
  manager: 'Manager',
  admin: 'Admin',
  teacher: "O'qituvchi",
};

export default function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const locale = useLocale();
  const [user, setUser] = useState<User | null>(null);
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [showLang, setShowLang] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Profile modal
  const [showProfile, setShowProfile] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState({ old_password: '', new_password: '', confirm: '' });
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const langRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const u = getUser();
    setUser(u);
    try { setAvatarSrc(localStorage.getItem('avatar')); } catch {}

    if (!u) return;

    if (u.role === 'superadmin') {
      setCompanyName('EduHub Admin');
      return;
    }

    try {
      const cached = localStorage.getItem('company_name');
      if (cached) setCompanyName(cached);
    } catch {}

    if (u.company_id) {
      import('@/lib/axios').then(({ default: apiInst }) => {
        apiInst.get(`/api/v1/companies/${u.company_id}/`)
          .then(({ data }) => {
            const name = (data as any).name ?? '';
            setCompanyName(name);
            try { localStorage.setItem('company_name', name); } catch {}
          })
          .catch(() => {});
      });
    }
  }, []);

  useEffect(() => {
    if (!showLang) return;
    function handle(e: MouseEvent) {
      if (langRef.current && !langRef.current.contains(e.target as Node)) setShowLang(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showLang]);

  function handleLogout() {
    logout();
    try {
      localStorage.removeItem('avatar');
      localStorage.removeItem('company_name');
    } catch {}
    router.push(`/${locale}/login`);
  }

  function openProfile() {
    if (user) {
      setFirstName(user.first_name ?? '');
      setLastName(user.last_name ?? '');
      const rawPhone = (user as any).phone ?? '';
      setPhone(rawPhone.startsWith('+998') ? rawPhone.slice(4) : rawPhone.replace(/\D/g, '').slice(0, 9));
    }
    setAvatarPreview(null);
    setAvatarFile(null);
    setPassword({ old_password: '', new_password: '', confirm: '' });
    setShowPasswordSection(false);
    setShowOld(false);
    setShowNew(false);
    setShowConfirm(false);
    setShowProfile(true);
  }

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/jpg'].includes(file.type)) {
      toast.error('Faqat JPG yoki PNG formatida');
      return;
    }
    if (file.size > 1024 * 1024) {
      toast.error('Fayl hajmi 1MB dan oshmasligi kerak');
      return;
    }
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function handleSave() {
    if (!user) return;

    const pwFilled = password.old_password || password.new_password || password.confirm;
    if (pwFilled && password.new_password !== password.confirm) {
      toast.error('Yangi parollar mos kelmaydi');
      return;
    }

    setSaving(true);
    try {
      // 1. Avatar
      if (avatarFile) {
        const formData = new FormData();
        formData.append('avatar', avatarFile);
        try {
          await api.patch(`/api/v1/users/${user.id}/`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        } catch (err: any) {
          if (err?.response?.status !== 400 && err?.response?.status !== 415) throw err;
        }
        const newSrc = avatarPreview!;
        setAvatarSrc(newSrc);
        try { localStorage.setItem('avatar', newSrc); } catch {}
        setAvatarFile(null);
      }

      // 2. Profile info
      const payload: Record<string, string> = { first_name: firstName, last_name: lastName };
      if (phone.length === 9) payload.phone = '+998' + phone;
      await api.patch(`/api/v1/users/${user.id}/`, payload);

      // 3. Password
      if (pwFilled) {
        await api.post('/api/v1/users/change-password/', {
          old_password: password.old_password,
          new_password: password.new_password,
        });
      }

      toast.success("Ma'lumotlar saqlandi");
      setShowProfile(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Xatolik yuz berdi');
    } finally {
      setSaving(false);
    }
  }

  const segment = pathname.split('/')[2] ?? 'dashboard';
  const title = TITLES[segment] ?? 'EduHub';
  const pathWithoutLocale = '/' + pathname.split('/').slice(2).join('/') || '/dashboard';
  const displaySrc = avatarPreview || avatarSrc;

  return (
    <>
      <header className="h-14 bg-white border-b border-gray-200 flex items-center px-6 gap-4 sticky top-0 z-20 flex-shrink-0">
        <h2 className="flex-1 text-base font-semibold text-gray-800 truncate">
          {title}
          {companyName && (
            <span className="text-gray-400 font-normal text-sm"> — {companyName}</span>
          )}
        </h2>
        <div className="flex items-center gap-2">
          {/* Language switcher */}
          <div ref={langRef} className="relative">
            <button
              onClick={() => setShowLang((v) => !v)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <Globe className="w-4 h-4" />
              <span>{LANG_LABELS[locale] ?? locale.toUpperCase()}</span>
            </button>
            {showLang && (
              <div className="absolute right-0 mt-1 w-28 bg-white border border-gray-200 rounded shadow-md z-50 py-1">
                {(['uz', 'ru', 'en'] as const).map((l) => (
                  <a
                    key={l}
                    href={`/${l}${pathWithoutLocale}`}
                    onClick={() => setShowLang(false)}
                    className={cn(
                      'block px-3 py-1.5 text-sm transition-colors',
                      locale === l
                        ? 'bg-blue-50 text-blue-600 font-medium'
                        : 'text-gray-700 hover:bg-gray-50'
                    )}
                  >
                    {LANG_LABELS[l]}
                  </a>
                ))}
              </div>
            )}
          </div>

          <NotificationBell />

          {/* Avatar — click directly opens profile modal */}
          {user && (
            <button
              onClick={openProfile}
              className="ml-1 focus:outline-none"
              aria-label="Profil sozlamalari"
            >
              {avatarSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarSrc} alt="" className="w-8 h-8 rounded-full object-cover" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center hover:bg-blue-700 transition-colors">
                  <span className="text-xs font-bold text-white select-none">
                    {(user.first_name?.[0] ?? '').toUpperCase()}{(user.last_name?.[0] ?? '').toUpperCase()}
                  </span>
                </div>
              )}
            </button>
          )}
        </div>
      </header>

      {/* Logout confirm */}
      <Dialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Tizimdan chiqish</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 mt-1">Rostdan ham chiqmoqchimisiz?</p>
          <div className="flex gap-3 mt-4">
            <button
              onClick={() => setShowLogoutConfirm(false)}
              className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50"
            >
              Bekor qilish
            </button>
            <button
              onClick={handleLogout}
              className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700"
            >
              Ha, chiqish
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Profile modal */}
      <Dialog open={showProfile} onOpenChange={(open) => { if (!open) setShowProfile(false); }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Profil sozlamalari</DialogTitle>
          </DialogHeader>

          {/* Avatar */}
          <div className="flex flex-col items-center gap-3 py-4">
            {displaySrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={displaySrc} alt="Avatar" className="w-20 h-20 rounded-full object-cover border-2 border-blue-200" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-blue-600 flex items-center justify-center">
                <span className="text-2xl font-bold text-white select-none">
                  {(user?.first_name?.[0] ?? '').toUpperCase()}{(user?.last_name?.[0] ?? '').toUpperCase()}
                </span>
              </div>
            )}
            <label className="cursor-pointer px-3 py-1.5 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50 transition-colors">
              Rasm yuklash
              <input
                type="file"
                accept="image/jpeg,image/jpg,image/png"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </label>
            {avatarPreview && (
              <p className="text-xs text-green-600">Yangi rasm tanlandi</p>
            )}
          </div>

          <hr className="border-gray-100" />

          {/* Personal info */}
          <div className="space-y-4 py-4">
            <h3 className="text-sm font-semibold text-gray-900">Shaxsiy ma&apos;lumotlar</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ism</label>
                <input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Familiya</label>
                <input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telefon</label>
              <div className="flex">
                <span className="px-3 py-2 bg-gray-100 border border-r-0 border-gray-300 rounded-l text-sm text-gray-500 select-none">
                  +998
                </span>
                <input
                  type="tel"
                  maxLength={9}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 9))}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-r text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="901234567"
                />
              </div>
            </div>
            {user && (
              <div className="inline-block px-3 py-1.5 bg-gray-50 rounded text-xs text-gray-500">
                Rol: <span className="font-medium">{ROLE_LABELS[user.role ?? ''] ?? user.role}</span>
              </div>
            )}
          </div>

          <hr className="border-gray-100" />

          {/* Password (collapsible) */}
          <div className="py-4 space-y-3">
            <button
              type="button"
              onClick={() => setShowPasswordSection((v) => !v)}
              className="flex items-center w-full text-left text-sm font-semibold text-gray-900 hover:text-blue-600 transition-colors"
            >
              Parolni o&apos;zgartirish
              <ChevronDown className={cn('w-4 h-4 transition-transform ml-auto', showPasswordSection && 'rotate-180')} />
            </button>
            {showPasswordSection && (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Eski parol</label>
                  <div className="relative">
                    <input
                      type={showOld ? 'text' : 'password'}
                      value={password.old_password}
                      onChange={(e) => setPassword((p) => ({ ...p, old_password: e.target.value }))}
                      className="w-full px-3 py-2 pr-10 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowOld((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showOld ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Yangi parol</label>
                  <div className="relative">
                    <input
                      type={showNew ? 'text' : 'password'}
                      value={password.new_password}
                      onChange={(e) => setPassword((p) => ({ ...p, new_password: e.target.value }))}
                      className="w-full px-3 py-2 pr-10 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNew((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Yangi parolni tasdiqlang</label>
                  <div className="relative">
                    <input
                      type={showConfirm ? 'text' : 'password'}
                      value={password.confirm}
                      onChange={(e) => setPassword((p) => ({ ...p, confirm: e.target.value }))}
                      className="w-full px-3 py-2 pr-10 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="pt-3 border-t border-gray-100 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowLogoutConfirm(true)}
              className="flex items-center gap-2 px-4 py-2 border border-red-300 text-red-600 text-sm font-medium rounded hover:bg-red-50 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Chiqish
            </button>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => setShowProfile(false)}
              className="px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50 transition-colors"
            >
              Yopish
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? 'Saqlanmoqda...' : 'Saqlash'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
