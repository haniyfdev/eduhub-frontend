'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Bell, ChevronDown, Eye, EyeOff, Globe, LogOut, Paperclip, Plus, Trash2, Users, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { getUser, logout } from '@/lib/auth';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { User } from '@/types';
import { cn } from '@/lib/utils';
import api from '@/lib/axios';
import toast from 'react-hot-toast';

interface Announcement {
  id: string;
  title: string;
  body: string;
  created_by_name: string;
  is_active: boolean;
  is_read: boolean;
  created_at: string;
}

const LANG_LABELS: Record<string, string> = { uz: 'UZ', ru: 'RU', en: 'EN' };

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('uz-UZ', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('topbar');
  const tn = useTranslations('navigation');
  const [user, setUser] = useState<User | null>(null);
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [showLang, setShowLang] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Announcements
  const [unreadCount, setUnreadCount] = useState(0);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [bellOpen, setBellOpen] = useState(false);
  const [loadingAnns, setLoadingAnns] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [creatingAnn, setCreatingAnn] = useState(false);
  const [selectedAnn, setSelectedAnn] = useState<Announcement | null>(null);

  // Profile modal
  const [showProfile, setShowProfile] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState({ old_password: '', new_password: '', confirm: '' });
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [avatarToDelete, setAvatarToDelete] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const langRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

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
      const cachedIsUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(cached ?? '');
      if (cached && !cachedIsUUID) setCompanyName(cached);
    } catch {}

    const activeId = localStorage.getItem('active_company_id') || u.company_id;
    if (activeId) {
      import('@/lib/axios').then(({ default: apiInst }) => {
        apiInst.get(`/api/v1/companies/${activeId}/`)
          .then(({ data }) => {
            const name = (data as any).name ?? '';
            if (name) {
              setCompanyName(name);
              try { localStorage.setItem('company_name', name); } catch {}
            }
          })
          .catch(() => {
            // fallback: try fetching list and find by id
            if (activeId !== u.company_id) {
              apiInst.get(`/api/v1/companies/${u.company_id}/`)
                .then(({ data }) => {
                  const name = (data as any).name ?? '';
                  if (name) { setCompanyName(name); try { localStorage.setItem('company_name', name); } catch {} }
                })
                .catch(() => {});
            }
          });
      });
    }
  }, []);

  // Poll unread announcement count every 5 min
  useEffect(() => {
    async function fetchUnread() {
      try {
        const { data } = await api.get('/api/v1/announcements/unread_count/');
        setUnreadCount(data.unread ?? 0);
      } catch {}
    }
    fetchUnread();
    const interval = setInterval(fetchUnread, 5 * 60 * 1000);
    return () => clearInterval(interval);
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

  async function openBell() {
    setBellOpen(true);
    setLoadingAnns(true);
    try {
      const { data } = await api.get('/api/v1/announcements/');
      setAnnouncements(data.results ?? data);
    } catch {}
    finally { setLoadingAnns(false); }
  }

  async function handleRead(ann: Announcement) {
    if (ann.is_read) return;
    try {
      await api.post(`/api/v1/announcements/${ann.id}/mark_read/`);
      setAnnouncements((prev) =>
        prev.map((a) => a.id === ann.id ? { ...a, is_read: true } : a)
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {}
  }

  async function submitCreate() {
    if (!newTitle.trim() || !newBody.trim()) return;
    setCreatingAnn(true);
    try {
      await api.post('/api/v1/announcements/', { title: newTitle, body: newBody });
      toast.success(t('announcementSent'));
      setShowCreate(false);
      setNewTitle('');
      setNewBody('');
      const { data } = await api.get('/api/v1/announcements/');
      setAnnouncements(data.results ?? data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      toast.error(e?.response?.data?.detail || 'Xatolik yuz berdi');
    } finally {
      setCreatingAnn(false);
    }
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    submitCreate();
  }

  function handleReadAnnouncement(ann: Announcement) {
    setSelectedAnn(ann);
    handleRead(ann);
  }

  function openProfile() {
    if (user) {
      setFirstName(user.first_name ?? '');
      setLastName(user.last_name ?? '');
      setPhone(((user as any).phone || '').replace('+998', '').replace(/\D/g, ''));
    }
    setAvatarPreview(null);
    setAvatarFile(null);
    setAvatarToDelete(false);
    setShowSaveConfirm(false);
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
      toast.error(t('avatarFormatError'));
      return;
    }
    if (file.size > 1024 * 1024) {
      toast.error(t('avatarSizeError'));
      return;
    }
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  function handleAvatarDelete() {
    setAvatarToDelete(true);
    setAvatarPreview(null);
    setAvatarFile(null);
  }

  async function handleSave() {
    if (!user) return;

    const pwFilled = password.old_password || password.new_password || password.confirm;
    if (pwFilled && password.new_password.length > 0 && password.new_password.length < 8) {
      toast.error(t('passwordTooShort'));
      return;
    }
    if (pwFilled && password.new_password !== password.confirm) {
      toast.error(t('passwordMismatch'));
      return;
    }

    setSaving(true);
    try {
      if (avatarToDelete) {
        try { await api.patch(`/api/v1/users/${user.id}/`, { avatar: null }); } catch {}
        setAvatarSrc(null);
        try { localStorage.removeItem('avatar'); } catch {}
      }

      if (avatarFile) {
        const formData = new FormData();
        formData.append('avatar', avatarFile);
        try {
          await api.patch(`/api/v1/users/${user.id}/`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        } catch (err: unknown) {
          const e = err as { response?: { status?: number } };
          if (e?.response?.status !== 400 && e?.response?.status !== 415) throw err;
        }
        const newSrc = avatarPreview!;
        setAvatarSrc(newSrc);
        try { localStorage.setItem('avatar', newSrc); } catch {}
        setAvatarFile(null);
      }

      const payload: Record<string, string> = { first_name: firstName, last_name: lastName };
      if (phone.length === 9) payload.phone = '+998' + phone;
      await api.patch(`/api/v1/users/${user.id}/`, payload);

      if (pwFilled) {
        await api.post('/api/v1/users/change-password/', {
          old_password: password.old_password,
          new_password: password.new_password,
        });
      }

      toast.success(t('dataSaved'));
      setShowProfile(false);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      toast.error(e?.response?.data?.detail || 'Xatolik yuz berdi');
    } finally {
      setSaving(false);
    }
  }

  const segment = pathname.split('/')[2] ?? 'dashboard';
  const navKeys = ['dashboard', 'students', 'leads', 'groups', 'teachers', 'courses', 'attendance', 'payments', 'debts', 'reports', 'settings', 'companies', 'archive', 'rooms', 'salaries', 'discounts'];
  const title = navKeys.includes(segment) ? tn(segment as Parameters<typeof tn>[0]) : 'EduHub';
  const pathWithoutLocale = '/' + pathname.split('/').slice(2).join('/') || '/dashboard';
  const displaySrc = avatarToDelete ? null : (avatarPreview || avatarSrc);

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

          {/* Community link — boss/manager only */}
          {(user?.role === 'boss' || user?.role === 'manager') && (
            <a
              href="https://t.me/+q6IQ8Ae82pQzZWRi"
              target="_blank"
              rel="noopener noreferrer"
              title={tn('community' as Parameters<typeof tn>[0])}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
            >
              <Users className="w-5 h-5" />
            </a>
          )}

          {/* Announcement bell — hidden for teachers */}
          {user?.role !== 'teacher' && (
            <button
              onClick={openBell}
              className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
              title={t('bellTitle')}
            >
              <Bell className={`w-5 h-5 ${unreadCount > 0 ? 'text-gray-600' : 'text-gray-400'}`} />
              {unreadCount > 0 && user?.role !== 'superadmin' && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
          )}

          {/* Avatar — click directly opens profile modal */}
          {user && (
            <button
              onClick={openProfile}
              className="ml-1 focus:outline-none"
              aria-label={t('profileButton')}
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
            <DialogTitle>{t('logoutTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 mt-1">{t('logoutConfirm')}</p>
          <div className="flex gap-3 mt-4">
            <button
              onClick={() => setShowLogoutConfirm(false)}
              className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50"
            >
              {t('cancel')}
            </button>
            <button
              onClick={handleLogout}
              className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700"
            >
              {t('logoutYes')}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Save confirm */}
      <Dialog open={showSaveConfirm} onOpenChange={setShowSaveConfirm}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('saveChangesTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 mt-1">{t('saveChangesConfirm')}</p>
          <div className="flex gap-3 mt-4">
            <button
              onClick={() => setShowSaveConfirm(false)}
              className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50"
            >
              {t('cancel')}
            </button>
            <button
              onClick={() => { setShowSaveConfirm(false); handleSave(); }}
              disabled={saving}
              className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-60"
            >
              {t('saveYes')}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Announcements panel */}
      <Dialog open={bellOpen} onOpenChange={setBellOpen}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden gap-0 [&>button]:hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
            <DialogTitle className="text-sm font-semibold text-gray-900">{t('notifications')}</DialogTitle>
            <div className="flex items-center gap-2">
              {user?.role === 'superadmin' && (
                <button
                  onClick={() => setShowCreate(true)}
                  className="w-7 h-7 flex items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => setBellOpen(false)}
                className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {loadingAnns ? (
              <div className="flex items-center justify-center py-10">
                <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : announcements.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-10">
                {t('noNotifications')}
              </p>
            ) : (
              <div>
                {(() => {
                  const grouped = announcements.reduce((acc, ann) => {
                    const date = new Date(ann.created_at);
                    const dateKey = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
                    if (!acc[dateKey]) acc[dateKey] = [];
                    acc[dateKey].push(ann);
                    return acc;
                  }, {} as Record<string, typeof announcements>);
                  const groupedEntries = Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0]));
                  return groupedEntries.map(([dateKey, items]) => (
                    <div key={dateKey}>
                      <div className="flex items-center gap-2 px-4 py-2">
                        <div className="flex-1 h-px bg-gray-200" />
                        <span className="text-xs text-gray-400 font-medium whitespace-nowrap">{dateKey}</span>
                        <div className="flex-1 h-px bg-gray-200" />
                      </div>
                      {items.map((ann) => (
                        <div
                          key={ann.id}
                          onClick={() => handleReadAnnouncement(ann)}
                          className={cn(
                            'px-4 py-3 border-b cursor-pointer hover:bg-gray-50 transition-colors',
                            !ann.is_read && user?.role !== 'superadmin'
                              ? 'bg-blue-50 border-l-4 border-l-blue-500'
                              : 'bg-white'
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium text-gray-900 flex-1">{ann.title}</p>
                            <span className="text-xs text-gray-400 whitespace-nowrap">{fmtTime(ann.created_at)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ));
                })()}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Create announcement (superadmin only) */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('newAnnouncement')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 mt-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('announcementTitle')}</label>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); bodyRef.current?.focus(); } }}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('announcementBody')}</label>
              <textarea
                ref={bodyRef}
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && newBody.trim()) {
                    e.preventDefault();
                    submitCreate();
                  }
                }}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                required
              />
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowCreate(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50">
                {t('cancel')}
              </button>
              <button type="submit" disabled={creatingAnn}
                className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-60">
                {creatingAnn ? t('sending') : t('send')}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Announcement detail modal */}
      <Dialog open={!!selectedAnn} onOpenChange={(open) => { if (!open) setSelectedAnn(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-bold">{selectedAnn?.title}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-700 whitespace-pre-wrap mt-2">{selectedAnn?.body}</p>
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
            <span className="text-xs text-gray-400">
              {selectedAnn && fmtDate(selectedAnn.created_at)} — {selectedAnn?.created_by_name}
            </span>
            <button
              onClick={() => setSelectedAnn(null)}
              className="px-4 py-1.5 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50"
            >
              {t('close')}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Profile modal */}
      <Dialog open={showProfile} onOpenChange={(open) => { if (!open) setShowProfile(false); }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('profileSettings')}</DialogTitle>
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
            <div className="flex items-center gap-2">
              <label className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50 transition-colors">
                <Paperclip className="w-3.5 h-3.5" />
                {t('uploadAvatar')}
                <input
                  type="file"
                  accept="image/jpeg,image/jpg,image/png"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
              </label>
              {(avatarSrc || avatarPreview) && !avatarToDelete && (
                <button
                  type="button"
                  onClick={handleAvatarDelete}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-red-300 text-red-600 text-sm font-medium rounded hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {t('deleteAvatar')}
                </button>
              )}
            </div>
            {avatarPreview && !avatarToDelete && (
              <p className="text-xs text-green-600">{t('newAvatarSelected')}</p>
            )}
          </div>

          <hr className="border-gray-100" />

          {/* Personal info */}
          <div className="space-y-4 py-4">
            <h3 className="text-sm font-semibold text-gray-900">{t('personalInfo')}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('firstName')}</label>
                <input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('lastName')}</label>
                <input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('phone')}</label>
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
                />
              </div>
            </div>
            {user && (
              <div className="inline-block px-3 py-1.5 bg-gray-50 rounded text-xs text-gray-500">
                {t('role')}: <span className="font-medium">{t(`roles.${user.role ?? 'admin'}` as Parameters<typeof t>[0])}</span>
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
              {t('changePassword')}
              <ChevronDown className={cn('w-4 h-4 transition-transform ml-auto', showPasswordSection && 'rotate-180')} />
            </button>
            {showPasswordSection && (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('oldPassword')}</label>
                  <div className="relative">
                    <input
                      type={showOld ? 'text' : 'password'}
                      value={password.old_password}
                      onChange={(e) => setPassword((p) => ({ ...p, old_password: e.target.value }))}
                      className="w-full px-3 py-2 pr-10 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button type="button" onClick={() => setShowOld((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showOld ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('newPassword')}</label>
                  <div className="relative">
                    <input
                      type={showNew ? 'text' : 'password'}
                      value={password.new_password}
                      onChange={(e) => setPassword((p) => ({ ...p, new_password: e.target.value }))}
                      className="w-full px-3 py-2 pr-10 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button type="button" onClick={() => setShowNew((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('confirmPassword')}</label>
                  <div className="relative">
                    <input
                      type={showConfirm ? 'text' : 'password'}
                      value={password.confirm}
                      onChange={(e) => setPassword((p) => ({ ...p, confirm: e.target.value }))}
                      className="w-full px-3 py-2 pr-10 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button type="button" onClick={() => setShowConfirm((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
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
              {t('logout')}
            </button>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => setShowProfile(false)}
              className="px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50 transition-colors"
            >
              {t('close')}
            </button>
            <button
              type="button"
              onClick={() => setShowSaveConfirm(true)}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? t('saving') : t('save')}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
