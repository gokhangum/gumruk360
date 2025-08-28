export const dynamic = 'force-dynamic';

import { getActiveLocale } from './locale';
import { getDictionary } from './i18n';

export default function Home() {
  const locale = getActiveLocale();
  const dict = getDictionary(locale);

  return (
    <div className="font-sans grid grid-rows-[20px_1fr_20px] min-h-screen p-8 pb-20 gap-16 sm:p-20">
      <main className="flex flex-col gap-6 row-start-2 max-w-3xl mx-auto">
        <h1 className="text-3xl sm:text-4xl font-bold">
          {dict.brand}
        </h1>
        <p className="text-base sm:text-lg">
          {dict.lead}
        </p>
        <div className="flex gap-4">
          <a
            href="/ask"
            className="rounded-xl border px-5 py-3 text-sm sm:text-base font-medium"
          >
            {dict.ctaAsk}
          </a>
        </div>
      </main>
      <footer className="row-start-3 flex items-center justify-center text-sm opacity-70">
        {locale === 'tr'
          ? '© 2025 Gümrük360 — Tüm hakları saklıdır.'
          : '© 2025 EasyCustoms360 — All rights reserved.'}
      </footer>
    </div>
  );
}
