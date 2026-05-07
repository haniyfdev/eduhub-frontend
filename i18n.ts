import { getRequestConfig } from 'next-intl/server';

export default getRequestConfig(async ({ requestLocale }) => {
  const locale = await requestLocale;
  return {
    locale: locale ?? 'uz',
    messages: (await import(`./messages/${locale ?? 'uz'}.json`)).default,
  };
});
