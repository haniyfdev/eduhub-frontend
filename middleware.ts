import createMiddleware from 'next-intl/middleware';

export default createMiddleware({
  locales: ['uz', 'ru', 'en'],
  defaultLocale: 'uz',
});

export const config = {
  matcher: ['/((?!api|_next|.*\\..*).*)'],
};
