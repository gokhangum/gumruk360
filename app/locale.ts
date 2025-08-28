import { headers } from 'next/headers';

export type Locale = 'tr' | 'en';

export async function getActiveLocale(): Promise<Locale> {
  const h = await headers();              // ← await
  const host = h.get('host') || '';

  // İngilizce site: tr.easycustoms360.com
  if (host.includes('tr.easycustoms360.com')) return 'en';

  // Varsayılan: gumruk360.com → Türkçe
  return 'tr';
}
