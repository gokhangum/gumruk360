// i18n/request.ts
// Next.js 15: headers() async, await gerekli.
// next-intl: bu dosya MUTLAKA default export (getRequestConfig) döndürmeli.

import { headers, cookies } from "next/headers";
import { APP_DOMAINS } from "@/lib/config/appEnv";
export async function resolveLangFromHost(): Promise<"en" | "tr"> {
  const h = await headers();
  const host = (h.get("x-forwarded-host") || h.get("host") || "").toLowerCase();

  // Host → dil kuralı
  if (
     host.includes("127.0.0.1") || // local EN
     (APP_DOMAINS.en && (host === APP_DOMAINS.en || host.endsWith(APP_DOMAINS.en))) || // prod EN (ENV)
     host.startsWith("en.")        // subdomain EN
  ) {
    return "en";
  }
  return "tr"; // localhost:3000 & gumruk360.com → TR
}

// next-intl getRequestConfig (DEFAULT EXPORT ZORUNLU)
export default async function getRequestConfig() {
  // 1) Cookie → preferred_lang (async cookies KURAL)
  const ck = await cookies();
  const cookieLang = ck.get("preferred_lang")?.value as "tr" | "en" | undefined;

  // 2) Host fallback
  const hostLang = await resolveLangFromHost();

  // 3) Nihai locale
  const locale: "tr" | "en" = (cookieLang === "tr" || cookieLang === "en") ? cookieLang : hostLang;

  // 4) Mesaj sözlükleri
  const dictionaries: Record<"tr"|"en", () => Promise<any>> = {
    tr: () => import("./messages/tr.json").then((m) => m.default),
    en: () => import("./messages/en.json").then((m) => m.default),
  };

  const messages = await dictionaries[locale]().catch(() => ({}));

  return {
    locale,
    messages,
    // İstersen:
    // now: () => new Date(),
    // timeZone: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

