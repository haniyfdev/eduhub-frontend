'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Eye, EyeOff, GraduationCap, Building2 } from 'lucide-react';
import { login, selectCompany } from '@/lib/auth';
import { useAuthStore } from '@/store/auth-store';
import { CompanyChoice } from '@/types';
import { cn } from '@/lib/utils';
import api from '@/lib/axios';
import toast from 'react-hot-toast';

// Replace with your actual bot username
const TELEGRAM_BOT_USERNAME = 'EduHub_Message_Bot';

export default function LoginPage() {
  const t = useTranslations('login');
  const ta = useTranslations('auth');
  const locale = useLocale();
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const setAuthenticated = useAuthStore((s) => s.setAuthenticated);

  /* ── Login state ── */
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [companies, setCompanies] = useState<CompanyChoice[]>([]);
  const [tempToken, setTempToken] = useState('');
  const [selectingCompany, setSelectingCompany] = useState(false);

  /* ── Forgot-password state ── */
  type ForgotStep = 0 | 1 | 2 | 3;
  const [forgotStep, setForgotStep] = useState<ForgotStep>(0);
  const [fpPhone, setFpPhone] = useState('');
  const [fpOtp, setFpOtp] = useState(['', '', '', '', '', '']);
  const [fpResetToken, setFpResetToken] = useState('');
  const [fpNewPassword, setFpNewPassword] = useState('');
  const [fpConfirm, setFpConfirm] = useState('');
  const [fpShowNew, setFpShowNew] = useState(false);
  const [fpShowConfirm, setFpShowConfirm] = useState(false);
  const [fpLoading, setFpLoading] = useState(false);
  const [fpError, setFpError] = useState('');
  const [countdown, setCountdown] = useState(100);
  const [canResend, setCanResend] = useState(false);
  const [countdownKey, setCountdownKey] = useState(0); // increment to restart timer

  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const fpConfirmRef = useRef<HTMLInputElement>(null);

  /* ── Countdown for OTP step — restarts whenever countdownKey changes ── */
  useEffect(() => {
    if (forgotStep !== 2) return;
    setCountdown(100);
    setCanResend(false);
    const id = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(id);
          setCanResend(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [forgotStep, countdownKey]);

  /* ── Login handlers ── */
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
        const home = data.user.role === 'superadmin'
          ? `/${locale}/superadmin/dashboard`
          : `/${locale}/dashboard`;
        router.push(home);
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
      const home = data.user.role === 'superadmin'
        ? `/${locale}/superadmin/dashboard`
        : `/${locale}/dashboard`;
      router.push(home);
    } catch (err: unknown) {
      const e = err as { response?: { data?: Record<string, unknown> } };
      const d = e?.response?.data;
      setError(String(d?.error || d?.detail || t('error')));
    } finally {
      setLoading(false);
    }
  }

  /* ── Forgot-password helpers ── */
  function resetForgotFlow() {
    setForgotStep(0);
    setFpPhone('');
    setFpOtp(['', '', '', '', '', '']);
    setFpResetToken('');
    setFpNewPassword('');
    setFpConfirm('');
    setFpError('');
    setCountdownKey(0);
  }

  async function handleSendCode() {
    setFpError('');
    if (fpPhone.length !== 9) {
      setFpError("Telefon raqamni to'liq kiriting");
      return;
    }
    setFpLoading(true);
    try {
      const fullPhone = '+998' + fpPhone;
      await api.post('/api/auth/forgot-password/', { phone: fullPhone });
      setFpOtp(['', '', '', '', '', '']);
      setForgotStep(2);
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string; wait_seconds?: number } } };
      const errCode = e?.response?.data?.error;
      if (errCode === 'telegram_not_linked') {
        setFpError(ta('telegramNotLinked'));
      } else if (errCode === 'rate_limited') {
        const ws = e?.response?.data?.wait_seconds ?? 0;
        const timeStr = ws >= 3600 ? `${Math.round(ws / 3600)} soat` : `${Math.round(ws / 60)} daqiqa`;
        setFpError(`${ta('tooManyAttempts')} ${timeStr} ${ta('tryAfter')}`);
      } else {
        setFpError('Xatolik yuz berdi');
      }
    } finally {
      setFpLoading(false);
    }
  }

  function handleOtpChange(index: number, value: string) {
    if (!/^\d*$/.test(value)) return;
    const next = [...fpOtp];
    next[index] = value.slice(-1);
    setFpOtp(next);
    if (value && index < 5) otpRefs.current[index + 1]?.focus();
  }

  function handleOtpKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !fpOtp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (index < 5) {
        otpRefs.current[index + 1]?.focus();
      } else {
        handleVerifyOtp();
      }
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setForgotStep(1);
      setFpError('');
      setFpOtp(['', '', '', '', '', '']);
    }
  }

  function handleOtpPaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    const next = ['', '', '', '', '', ''];
    pasted.split('').forEach((digit, i) => { next[i] = digit; });
    setFpOtp(next);
    const lastIndex = Math.min(pasted.length - 1, 5);
    otpRefs.current[lastIndex]?.focus();
  }

  function handleKeyDown(
    e: React.KeyboardEvent,
    onEnter: () => void,
    onEsc: () => void,
  ) {
    if (e.key === 'Enter') { e.preventDefault(); onEnter(); }
    if (e.key === 'Escape') { e.preventDefault(); onEsc(); }
  }

  async function handleResend() {
    setFpOtp(['', '', '', '', '', '']);
    setFpError('');
    setFpLoading(true);
    try {
      await api.post('/api/auth/forgot-password/', { phone: '+998' + fpPhone });
      setCountdownKey((k) => k + 1);
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string; wait_seconds?: number } } };
      const errCode = e?.response?.data?.error;
      if (errCode === 'rate_limited') {
        const ws = e?.response?.data?.wait_seconds ?? 0;
        const timeStr = ws >= 3600 ? `${Math.round(ws / 3600)} soat` : `${Math.round(ws / 60)} daqiqa`;
        setFpError(`${ta('tooManyAttempts')} ${timeStr} ${ta('tryAfter')}`);
      } else {
        setFpError('Xatolik yuz berdi');
      }
    } finally {
      setFpLoading(false);
    }
  }

  async function handleVerifyOtp() {
    setFpError('');
    const code = fpOtp.join('');
    if (code.length !== 6) { setFpError('6 xonali kodni kiriting'); return; }
    setFpLoading(true);
    try {
      const fullPhone = '+998' + fpPhone;
      const { data } = await api.post<{ reset_token: string }>('/api/auth/verify-otp/', {
        phone: fullPhone,
        code,
      });
      setFpResetToken(data.reset_token);
      setForgotStep(3);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      const errCode = e?.response?.data?.error;
      setFpError(errCode === 'otp_expired' ? 'Kod muddati tugadi. Qayta yuboring.' : "Noto'g'ri kod");
    } finally {
      setFpLoading(false);
    }
  }

  async function handleResetPassword() {
    setFpError('');
    if (!fpNewPassword || !fpConfirm) {
      setFpError("Barcha maydonlarni to'ldiring");
      return;
    }
    if (fpNewPassword.length < 8) {
      setFpError("Parol kamida 8 ta belgidan iborat bo'lishi kerak");
      return;
    }
    if (fpNewPassword !== fpConfirm) {
      setFpError('Parollar mos kelmaydi');
      return;
    }
    setFpLoading(true);
    try {
      await api.post('/api/auth/reset-password/', {
        reset_token: fpResetToken,
        new_password: fpNewPassword,
      });

      // Auto-login with new credentials
      const fullPhone = '+998' + fpPhone;
      const loginData = await login(fullPhone, fpNewPassword);
      toast.success(ta('passwordUpdated'));

      if ('requires_company_selection' in loginData && loginData.requires_company_selection) {
        setCompanies(loginData.companies);
        setTempToken(loginData.temp_token);
        resetForgotFlow();
        setSelectingCompany(true);
      } else if (!('requires_company_selection' in loginData)) {
        setUser(loginData.user);
        setAuthenticated(true);
        const home = loginData.user.role === 'superadmin'
          ? `/${locale}/superadmin/dashboard`
          : `/${locale}/dashboard`;
        router.push(home);
      }
    } catch {
      setFpError('Xatolik yuz berdi');
    } finally {
      setFpLoading(false);
    }
  }

  /* ── Shared UI classes ── */
  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500';
  const btnPrimary = cn(
    'w-full py-2.5 px-4 bg-blue-600 text-white text-sm font-medium rounded',
    'hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
    'transition-colors disabled:opacity-60 disabled:cursor-not-allowed',
  );

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

        {/* ── Company selection ── */}
        {selectingCompany ? (
          <div className="bg-white rounded shadow-md p-8">
            <h2 className="text-base font-semibold text-gray-800 mb-1">{t('selectCompany')}</h2>
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
              <div className="mt-4 bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded">{error}</div>
            )}
            <button
              type="button"
              onClick={() => { setSelectingCompany(false); setError(''); }}
              className="mt-5 w-full text-sm text-gray-500 hover:text-gray-700"
            >
              ← {t('back')}
            </button>
          </div>

        /* ── Forgot step 1: phone ── */
        ) : forgotStep === 1 ? (
          <div className="bg-white rounded shadow-md p-8">
            <h2 className="text-base font-semibold text-gray-800 mb-4">{ta('resetPassword')}</h2>

            <p className="text-sm text-gray-600 mb-4">{ta('toGetCode')}</p>

            <a
              href={`https://t.me/${TELEGRAM_BOT_USERNAME}`}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(btnPrimary, 'block text-center mb-5 no-underline')}
            >
              {ta('goToBot')}
            </a>

            <p className="text-xs text-gray-400 mb-3">{ta('afterBotInstruction')}</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('phone')}</label>
                <div className="flex">
                  <span className="inline-flex items-center px-3 border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm rounded-l">
                    +998
                  </span>
                  <input
                    type="tel"
                    value={fpPhone}
                    onChange={(e) => setFpPhone(e.target.value.replace(/\D/g, '').slice(0, 9))}
                    onKeyDown={(e) => handleKeyDown(e, handleSendCode, resetForgotFlow)}
                    placeholder="XX XXX XX XX"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-r text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              {fpError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded">{fpError}</div>
              )}

              <button onClick={handleSendCode} disabled={fpLoading} className={btnPrimary}>
                {fpLoading ? '...' : ta('sendCode')}
              </button>
            </div>

            <button
              type="button"
              onClick={resetForgotFlow}
              className="mt-4 w-full text-sm text-gray-500 hover:text-gray-700"
            >
              ← {ta('back')}
            </button>
          </div>

        /* ── Forgot step 2: OTP ── */
        ) : forgotStep === 2 ? (
          <div className="bg-white rounded shadow-md p-8">
            <h2 className="text-base font-semibold text-gray-800 mb-1">{ta('enterCode')}</h2>
            <p className="text-sm text-gray-500 mb-5">{ta('enterVerifyCode')}</p>

            {/* 6 OTP boxes */}
            <div className="flex gap-2 justify-center mb-4">
              {fpOtp.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { otpRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(i, e)}
                  onPaste={handleOtpPaste}
                  className={cn(
                    'w-10 h-12 text-center text-lg font-bold border rounded focus:outline-none focus:ring-2 focus:ring-blue-500',
                    digit ? 'border-blue-500 bg-blue-50' : 'border-gray-300',
                  )}
                />
              ))}
            </div>

            {/* Countdown */}
            <div className="flex items-center justify-between mb-4">
              <span className={cn('text-sm', countdown < 20 ? 'text-red-500 font-medium' : 'text-gray-400')}>
                ⏱ {countdown} {ta('seconds')}
              </span>
              <button
                type="button"
                disabled={!canResend || fpLoading}
                onClick={handleResend}
                className={cn(
                  'text-sm font-medium',
                  canResend && !fpLoading ? 'text-blue-600 hover:underline cursor-pointer' : 'text-gray-300 cursor-not-allowed',
                )}
              >
                {ta('resendCode')}
              </button>
            </div>

            {fpError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded mb-4">{fpError}</div>
            )}

            <button onClick={handleVerifyOtp} disabled={fpLoading || fpOtp.join('').length !== 6} className={btnPrimary}>
              {fpLoading ? '...' : 'Tasdiqlash'}
            </button>

            <button
              type="button"
              onClick={() => { setForgotStep(1); setFpError(''); setFpOtp(['', '', '', '', '', '']); }}
              className="mt-4 w-full text-sm text-gray-500 hover:text-gray-700"
            >
              ← {ta('back')}
            </button>
          </div>

        /* ── Forgot step 3: new password ── */
        ) : forgotStep === 3 ? (
          <div className="bg-white rounded shadow-md p-8">
            <h2 className="text-base font-semibold text-gray-800 mb-1">Yangi parol o'rnating</h2>
            <p className="text-sm text-gray-500 mb-5">Kamida 8 ta belgi</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{ta('newPassword')}</label>
                <div className="relative">
                  <input
                    type={fpShowNew ? 'text' : 'password'}
                    value={fpNewPassword}
                    onChange={(e) => setFpNewPassword(e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, () => fpConfirmRef.current?.focus(), () => setForgotStep(2))}
                    className={cn(inputCls, 'pr-10')}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setFpShowNew((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {fpShowNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{ta('confirmPassword')}</label>
                <div className="relative">
                  <input
                    ref={fpConfirmRef}
                    type={fpShowConfirm ? 'text' : 'password'}
                    value={fpConfirm}
                    onChange={(e) => setFpConfirm(e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, handleResetPassword, () => setForgotStep(2))}
                    className={cn(inputCls, 'pr-10')}
                  />
                  <button
                    type="button"
                    onClick={() => setFpShowConfirm((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {fpShowConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {fpError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded">{fpError}</div>
              )}

              <button onClick={handleResetPassword} disabled={fpLoading} className={btnPrimary}>
                {fpLoading ? '...' : 'Saqlash'}
              </button>
            </div>
          </div>

        /* ── Login form (default) ── */
        ) : (
          <div className="bg-white rounded shadow-md p-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Phone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('phone')}</label>
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
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-gray-700">{t('password')}</label>
                  <button
                    type="button"
                    onClick={() => { setForgotStep(1); setFpPhone(phone); setFpError(''); }}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    {ta('forgotPasswordQ')}
                  </button>
                </div>
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
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded">{error}</div>
              )}

              {/* Submit */}
              <button type="submit" disabled={loading} className={btnPrimary}>
                {loading ? '...' : t('submit')}
              </button>
            </form>
          </div>
        )}

        {/* Language switcher */}
        <div className="flex justify-center gap-3 mt-6">
          {(['uz', 'ru', 'en'] as const).map((l) => (
            <a
              key={l}
              href={`/${l}/login`}
              className={cn(
                'text-sm px-3 py-1 rounded',
                locale === l ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-700',
              )}
            >
              {l.toUpperCase()}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
