'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Globe, LogOut } from 'lucide-react';
import { useLocale } from 'next-intl';
import { getUser, logout } from '@/lib/auth';
import NotificationBell from './notification-bell';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { User } from '@/types';
import { cn } from '@/lib/utils';

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
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const u = getUser();
    setUser(u);
    try { setAvatarSrc(localStorage.getItem('avatar')); } catch {}

    if (!u) return;

    if (u.role === 'superadmin') {
      setCompanyName('EduHub Admin');
      return;
    }

    // Read cached name first, then refresh in background
    try {
      const cached = localStorage.getItem('company_name');
      if (cached) setCompanyName(cached);
    } catch {}

    if (u.company_id) {
      import('@/lib/axios').then(({ default: api }) => {
        api.get(`/api/v1/companies/${u.company_id}/`)
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

  useEffect(() => {
    if (!showUserMenu) return;
    function handle(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setShowUserMenu(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showUserMenu]);

  function handleLogout() {
    logout();
    try {
      localStorage.removeItem('avatar');
      localStorage.removeItem('company_name');
    } catch {}
    router.push(`/${locale}/login`);
  }

  const segment = pathname.split('/')[2] ?? 'dashboard';
  const title = TITLES[segment] ?? 'EduHub';
  const pathWithoutLocale = '/' + pathname.split('/').slice(2).join('/') || '/dashboard';

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

          {/* User avatar with dropdown */}
          {user && (
            <div ref={userMenuRef} className="relative ml-1">
              <button
                onClick={() => setShowUserMenu((v) => !v)}
                className="focus:outline-none"
                aria-label="User menu"
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

              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-52 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-2">
                  <div className="px-4 py-2 border-b border-gray-100">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {user.first_name} {user.last_name}
                    </p>
                    <span className="inline-block mt-1 px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded">
                      {ROLE_LABELS[user.role ?? ''] ?? user.role}
                    </span>
                  </div>
                  <button
                    onClick={() => { setShowUserMenu(false); setShowLogoutConfirm(true); }}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors mt-1"
                  >
                    <LogOut className="w-4 h-4 flex-shrink-0" />
                    Chiqish
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

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
    </>
  );
}
