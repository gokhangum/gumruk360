import { headers } from 'next/headers';

export type Locale = 'tr' | 'en';

export function getActiveLocale(): Locale {
  const host = headers().get('host') || '';

  // İngilizce site: tr.easycustoms360.com
  if (host.includes('tr.easycustoms360.com')) return 'en';

  // Varsayılan: gumruk360.com → Türkçe
  return 'tr';
}
