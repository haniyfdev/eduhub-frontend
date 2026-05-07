'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  LayoutDashboard, Users, Users2, UsersRound, GraduationCap, BookOpen,
  CreditCard, AlertCircle, BarChart3, Settings, Building2, Archive,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { getUser } from '@/lib/auth';
import { User } from '@/types';

const sections = [
  {
    label: null,
    items: [{ key: 'dashboard', icon: LayoutDashboard, href: '/dashboard' }],
  },
  {
    label: "Ta'lim",
    items: [
      { key: 'students', icon: Users, href: '/students' },
      { key: 'groups', icon: Users2, href: '/groups' },
      { key: 'teachers', icon: GraduationCap, href: '/teachers' },
      { key: 'courses', icon: BookOpen, href: '/courses' },
    ],
  },
  {
    label: 'Moliya',
    items: [
      { key: 'payments', icon: CreditCard, href: '/payments' },
      { key: 'debts', icon: AlertCircle, href: '/debts' },
      { key: 'reports', icon: BarChart3, href: '/reports' },
    ],
  },
  {
    label: 'Tizim',
    items: [
      { key: 'settings', icon: Settings, href: '/settings' },
      { key: 'archive', icon: Archive, href: '/archive' },
    ],
  },
];

export default function Sidebar() {
  const t = useTranslations('navigation');
  const locale = useLocale();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);

  useEffect(() => {
    setUser(getUser());
    try {
      const cached = localStorage.getItem('company_name');
      if (cached) setCompanyName(cached);
    } catch {}
  }, []);

  const isActive = (href: string) => {
    const segment = pathname.split('/').slice(2).join('/');
    return segment === href.replace('/', '') || pathname.endsWith(href);
  };

  return (
    <>
      <aside className="fixed left-0 top-0 h-full w-60 bg-white border-r border-gray-200 flex flex-col z-30 shadow-[2px_0_8px_rgba(0,0,0,0.04)]">
        {/* Logo */}
        <div className="flex items-center px-5 py-5 gap-3 border-b border-gray-100 flex-shrink-0">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <GraduationCap className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 leading-tight">EduHub</p>
            {companyName && (
              <p className="text-xs text-blue-600 font-medium truncate max-w-[120px] leading-tight">{companyName}</p>
            )}
            <p className="text-xs text-gray-400 truncate max-w-[120px]">
              {user?.role ? `${user.role.charAt(0).toUpperCase()}${user.role.slice(1)}` : 'CRM Panel'}
            </p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-3 overflow-y-auto space-y-4">
          {sections.map((section, si) => {
            const visibleItems = section.items.filter((item) => {
              if (item.key === 'companies') return user?.role === 'superadmin';
              return true;
            });
            if (visibleItems.length === 0) return null;
            return (
              <div key={si}>
                {section.label && (
                  <p className="px-3 mb-1.5 pt-1 text-[10px] font-semibold text-gray-400 uppercase tracking-widest border-t border-gray-100">
                    {section.label}
                  </p>
                )}
                <div className="space-y-0.5">
                  {visibleItems.map(({ key, icon: Icon, href }) => {
                    const active = isActive(href);
                    return (
                      <Link
                        key={key}
                        href={`/${locale}${href}`}
                        className={cn(
                          'flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                          active ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-blue-50 hover:text-blue-600'
                        )}
                      >
                        <Icon className={cn('flex-shrink-0', active ? 'text-white' : '')} style={{ width: 18, height: 18 }} />
                        {t(key as Parameters<typeof t>[0])}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Companies — superadmin only */}
          {user?.role === 'superadmin' && (
            <div>
              <p className="px-3 mb-1.5 pt-1 text-[10px] font-semibold text-gray-400 uppercase tracking-widest border-t border-gray-100">Superadmin</p>
              <Link
                href={`/${locale}/companies`}
                className={cn(
                  'flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive('/companies') ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-blue-50 hover:text-blue-600'
                )}
              >
                <Building2 className={cn('flex-shrink-0', isActive('/companies') ? 'text-white' : '')} style={{ width: 18, height: 18 }} />
                {t('companies')}
              </Link>
            </div>
          )}
        </nav>

      </aside>
    </>
  );
}
