// app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { NextIntlClientProvider } from "next-intl";
import { headers } from "next/headers";
import { unstable_setRequestLocale, getMessages, getTranslations } from "next-intl/server";
import { resolveTenantFromHost } from "@/lib/tenant";
import { tenantFromHost, brandName as tenantBrandName } from "@/lib/brand";
import PageContextTracker from "@/components/analytics/PageContextTracker";
import ConsentBootstrap from "@/components/analytics/ConsentBootstrap";
import { GtmHead } from "@/components/analytics/GtmHead";
import CookieBanner from "@/components/cookies/CookieBanner";
import { isLikelyStagingHost, getAnalyticsConfigFromEnv } from "@/lib/analytics";
import StructuredData from "@/components/StructuredData";
import PerfHead from "@/components/perf/PerfHead";
import { getTenantByHost, toShortLocale } from "@/lib/tenant";
import { supabaseAdmin } from "@/lib/supabase/serverAdmin";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  preload: true,
 display: "swap",
});
const geistMono = Geist_Mono({
   variable: "--font-geist-mono",
  subsets: ["latin"],
 preload: true,
  display: "swap",
 });

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();

  // Host'u porttan arındır (dev ortamında tutarlılık için)
  const rawHost = (h.get("x-forwarded-host") || h.get("host") || "").toLowerCase();
  const host = rawHost.split(":")[0];

  // Tenant ve locale (kısa + tam) çözümle
  const { code, locale: resolvedLocale } = await getTenantByHost(host || undefined);
  const shortLocale = toShortLocale(resolvedLocale) || (code?.toLowerCase().startsWith("en") ? "en" : "tr");
  const fullLocale = (resolvedLocale as string | undefined) || (shortLocale === "en" ? "en-US" : "tr-TR");

  // i18n fallback başlık/açıklama
  const t = await getTranslations({ locale: shortLocale, namespace: "meta" });
  const self = h.get("x-canonical-url") || undefined;
  const titleDefault = t("title");
  const descriptionDefault = t("description");

  const baseUrl = host ? `${(h.get("x-forwarded-proto") || "http").toLowerCase()}://${host}` : undefined;
  const tenantForBrand = tenantFromHost(host || undefined);
 const brandName = tenantBrandName(tenantForBrand);
  const faviconPath =
  shortLocale === "en"
     ? "/brand/easycustoms360.ico"
      : "/brand/gumruk360.ico";
  // ---- Wildcard SEO kaydını çek (tenant_seo, route="*", is_active=true) ----
  let wildcard: {
    title?: string | null;
    description?: string | null;
    keywords?: string[] | null;
    og_image_url?: string | null;
    is_active?: boolean | null;
    route?: string | null;
  } | null = null;

  if (code && fullLocale) {
    const { data: rows } = await supabaseAdmin
      .from("tenant_seo")
      .select("route, title, description, keywords, og_image_url, is_active")
      .eq("tenant_code", code)
      .eq("locale", fullLocale);

    wildcard = (rows || []).find(r => r.route === "*" && r.is_active) ?? null;
  }

  // ---- Base metadata (i18n) ----
  const meta: Metadata = {
    title: titleDefault,
    description: descriptionDefault,
    alternates: self ? { canonical: self } : undefined,
    metadataBase: baseUrl ? new URL(baseUrl) : undefined,
  icons: {
    icon: faviconPath,
     shortcut: faviconPath,
    },
    openGraph: {
      title: titleDefault,
      description: descriptionDefault,
      url: self || baseUrl,
      type: "website",
      siteName: brandName,
      images: ["/opengraph-image"],
    },
    twitter: {
      card: "summary_large_image",
      title: titleDefault,
      description: descriptionDefault,
      images: ["/twitter-image"],
    },
  };

  // ---- Wildcard alanlarını uygula (sadece olanları override et) ----
  if (wildcard) {
    if (wildcard.title) {
      meta.title = wildcard.title;
      if (meta.openGraph) meta.openGraph.title = wildcard.title;
      if (meta.twitter) meta.twitter.title = wildcard.title;
    }
    if (wildcard.description) {
      meta.description = wildcard.description;
      if (meta.openGraph) meta.openGraph.description = wildcard.description;
      if (meta.twitter) meta.twitter.description = wildcard.description;
    }
    if (Array.isArray(wildcard.keywords) && wildcard.keywords.length) {
      // Next Metadata'da keywords: string | string[]
      // Biz doğrudan dizi veriyoruz
      (meta as any).keywords = wildcard.keywords;
    }
    if (wildcard.og_image_url) {
      if (!meta.openGraph) meta.openGraph = {};
      meta.openGraph.images = [{ url: wildcard.og_image_url }];
      // Not: (marketing) layout’a paralel olarak burada yalnızca OpenGraph görselini set ediyoruz.
      // Twitter görselini i18n default’ta bırakıyoruz.
    }
  }

  return meta;
}
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Next.js 15+: headers() async — await etmeliyiz
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "";
const { code, locale: resolvedLocale } = await getTenantByHost(host || undefined);
const locale = toShortLocale(resolvedLocale) || (code?.toLowerCase().startsWith("en") ? "en" : "tr");
 const fullLocale = (resolvedLocale as string | undefined) || (locale === "en" ? "en-US" : "tr-TR");

  const proto = (h.get("x-forwarded-proto") || "http").toLowerCase();
 const isLocal = host.includes("localhost") || host.includes("127.0.0.1");
 const baseUrl = host ? `${isLocal ? "http" : proto}://${host}` : undefined;
  const { gtmId } = getAnalyticsConfigFromEnv();
  const disabledGtm = isLikelyStagingHost(host);


  unstable_setRequestLocale(locale);

  // i18n/request.ts içindeki messages yüklenir (plugin sayesinde)
  const messages = await getMessages();

  return (
    <html lang={locale}>
	 <head>
<ConsentBootstrap />
        <GtmHead gtmId={gtmId ?? undefined} disabled={disabledGtm} />
		<StructuredData />
		<PerfHead gtmEnabled={!isLikelyStagingHost(host)} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <NextIntlClientProvider locale={locale} messages={messages}>
  <PageContextTracker
    host={host}
    tenant={code}
    locale={fullLocale}
  />
          {children}
          <footer className="">
       
           </footer>
		   <CookieBanner />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
