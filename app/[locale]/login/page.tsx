'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Eye, EyeOff, GraduationCap, Building2 } from 'lucide-react';
import { login, selectCompany } from '@/lib/auth';
import { useAuthStore } from '@/store/auth-store';
import { CompanyChoice } from '@/types';
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

  // Company selection state
  const [companies, setCompanies] = useState<CompanyChoice[]>([]);
  const [tempToken, setTempToken] = useState('');
  const [selectingCompany, setSelectingCompany] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const fullPhone = '+998' + phone.replace(/\D/g, '');
      const data = await login(fullPhone, password);

      if ('requires_company_selection' in data && data.requires_company_selection) {
        setCompanies(data.companies);
        setTempToken(data.temp_token);
        setSelectingCompany(true);
        return;
      }

      if (!('requires_company_selection' in data)) {
        setUser(data.user);
        setAuthenticated(true);
        router.push(`/${locale}/dashboard`);
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: Record<string, unknown> } };
      const d = e?.response?.data;
      if (d?.non_field_errors) {
        setError(String(Array.isArray(d.non_field_errors) ? d.non_field_errors[0] : d.non_field_errors));
      } else if (d?.detail) {
        setError(String(d.detail));
      } else {
        setError(t('error'));
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectCompany(company: CompanyChoice) {
    setError('');
    setLoading(true);
    try {
      const data = await selectCompany(company.id, tempToken);
      setUser(data.user);
      setAuthenticated(true);
      router.push(`/${locale}/dashboard`);
    } catch (err: unknown) {
      const e = err as { response?: { data?: Record<string, unknown> } };
      const d = e?.response?.data;
      setError(String(d?.error || d?.detail || t('error')));
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

        {selectingCompany ? (
          /* Company selection screen */
          <div className="bg-white rounded shadow-md p-8">
            <h2 className="text-base font-semibold text-gray-800 mb-1">
              {t('selectCompany')}
            </h2>
            <p className="text-sm text-gray-500 mb-5">{t('selectCompanyHint')}</p>

            <div className="space-y-3">
              {companies.map((company) => (
                <button
                  key={company.id}
                  onClick={() => handleSelectCompany(company)}
                  disabled={loading}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-3 border border-gray-200 rounded',
                    'hover:border-blue-500 hover:bg-blue-50 transition-colors text-left',
                    'disabled:opacity-60 disabled:cursor-not-allowed',
                  )}
                >
                  <div className="w-9 h-9 bg-blue-100 rounded flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5 text-blue-600" />
                  </div>
                  <span className="text-sm font-medium text-gray-800">{company.name}</span>
                </button>
              ))}
            </div>

            {error && (
              <div className="mt-4 bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={() => { setSelectingCompany(false); setError(''); }}
              className="mt-5 w-full text-sm text-gray-500 hover:text-gray-700"
            >
              ← {t('back')}
            </button>
          </div>
        ) : (
          /* Login form */
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
        )}

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
          <a
            href="/en/login"
            className={cn(
              'text-sm px-3 py-1 rounded',
              locale === 'en' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            EN
          </a>
        </div>
      </div>
    </div>
  );
}
