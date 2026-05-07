'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { isAuthenticated } from '@/lib/auth';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const locale = useLocale();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (!isAuthenticated()) {
      router.replace(`/${locale}/login`);
    }
  }, [locale, router]);

  // Don't render anything until client has mounted — prevents SSR/client hydration mismatch
  if (!mounted) return null;
  if (!isAuthenticated()) return null;
  return <>{children}</>;
}
