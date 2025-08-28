import { headers } from 'next/headers';
import type { Locale } from './i18n';

export function getActiveLocale(): Locale {
  // Next.js i18n + domain eşleşmesinde, aktif locale route paramından gelir:
  // App Router'da alternatifi: request headers içindeki 'x-next-intl-locale' / 'next-url' vs.
  // En stabil yaklaşım: pathname’den locale paramı yoksa defaultLocale kabul edilir.
  // Domain-based i18n'de Next, doğru locale'i zaten resolve eder.
  // Biz yine de bir güvenli varsayılan bırakalım.
  try {
    const h = headers();
    const locale = h.get('x-next-locale') || h.get('next-locale') || 'tr';
    return (locale === 'en' ? 'en' : 'tr');
  } catch {
    return 'tr';
  }
}
