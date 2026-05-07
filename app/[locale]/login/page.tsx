'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Eye, EyeOff, GraduationCap } from 'lucide-react';
import { login } from '@/lib/auth';
import { useAuthStore } from '@/store/auth-store';
import { cn } from '@/lib/utils';

export default function LoginPage() {
  const t = useTranslations('login');
  const locale = useLocale();
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const setAuthenticated = useAuthStore((s) => s.setAuthenticated);

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const fullPhone = '+998' + phone.replace(/\D/g, '');
      const data = await login(fullPhone, password);
      setUser(data.user);
      setAuthenticated(true);
      router.push(`/${locale}/dashboard`);
    } catch {
      setError(t('error'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 bg-blue-600 rounded flex items-center justify-center mb-3">
            <GraduationCap className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('subtitle')}</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded shadow-md p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Phone */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {t('phone')}
              </label>
              <div className="flex">
                <span className="inline-flex items-center px-3 border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm rounded-l">
                  +998
                </span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 9))}
                  placeholder="XX XXX XX XX"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-r text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {t('password')}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 pr-10 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className={cn(
                'w-full py-2.5 px-4 bg-blue-600 text-white text-sm font-medium rounded',
                'hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
                'transition-colors disabled:opacity-60 disabled:cursor-not-allowed'
              )}
            >
              {loading ? '...' : t('submit')}
            </button>
          </form>
        </div>

        {/* Language switcher */}
        <div className="flex justify-center gap-3 mt-6">
          <a
            href="/uz/login"
            className={cn(
              'text-sm px-3 py-1 rounded',
              locale === 'uz' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            UZ
          </a>
          <a
            href="/ru/login"
            className={cn(
              'text-sm px-3 py-1 rounded',
              locale === 'ru' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            RU
          </a>
        </div>
      </div>
    </div>
  );
}
