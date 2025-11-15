// app/blog/layout.tsx
import React from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";

import MarketingLayout from "@/components/layout/MarketingLayout";
import LightboxProvider from "@/components/blog/LightboxProvider";

import { getTenantByHost, toShortLocale } from "@/lib/tenant";
import { supabaseAdmin } from "@/lib/supabase/serverAdmin";
import { BRAND } from "@/lib/config/appEnv";

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();

  // Host'u porttan arındır
  const rawHost = (h.get("x-forwarded-host") || h.get("host") || "").toLowerCase();
  const host = rawHost.split(":")[0];

  // Tenant + locale (kısa ve tam)
  const { code, locale: resolvedLocale } = await getTenantByHost(host || undefined);
  const shortLocale = toShortLocale(resolvedLocale) || (code?.toLowerCase().startsWith("en") ? "en" : "tr");
  const fullLocale = (resolvedLocale as string | undefined) || (shortLocale === "en" ? "en-US" : "tr-TR");

  // i18n fallback başlık/açıklama
  const t = await getTranslations({ locale: shortLocale, namespace: "meta" });
  const titleDefault = t("title");
  const descriptionDefault = t("description");

  // Canonical / baseUrl
  const self = h.get("x-canonical-url") || undefined;
  const baseUrl = host ? `${(h.get("x-forwarded-proto") || "http").toLowerCase()}://${host}` : undefined;

const brandName =
   (shortLocale === "tr" ? BRAND?.nameTR : BRAND?.nameEN) ??
   (shortLocale === "tr" ? "Gümrük360" : "EasyCustoms360");

  // --- tenant_seo'dan wildcard ("*") seç ---
  let wildcard:
    | {
        route?: string | null;
        title?: string | null;
        description?: string | null;
        keywords?: string[] | null;
        og_image_url?: string | null;
        is_active?: boolean | null;
      }
    | null = null;

  if (code && fullLocale) {
    const { data: rows } = await supabaseAdmin
      .from("tenant_seo")
      .select("route, title, description, keywords, og_image_url, is_active")
      .eq("tenant_code", code)
      .eq("locale", fullLocale);

    // Blog için de layout seviyesinde sadece "*" kaydını uygula
    wildcard = (rows || []).find((r) => r.route === "*" && r.is_active) ?? null;
  }

  // --- Base (i18n) meta ---
  const meta: Metadata = {
    title: titleDefault,
    description: descriptionDefault,
    alternates: self ? { canonical: self } : undefined,
    metadataBase: baseUrl ? new URL(baseUrl) : undefined,
    openGraph: {
      title: titleDefault,
      description: descriptionDefault,
      url: self || baseUrl,
      type: "website",
      siteName: brandName,
      images: ["/opengraph-image"], // sayfa düzeyi image override edebilir
    },
    twitter: {
      card: "summary_large_image",
      title: titleDefault,
      description: descriptionDefault,
      images: ["/twitter-image"],
    },
  };

  // --- Wildcard alanlarını (varsa) override et ---
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
      (meta as any).keywords = wildcard.keywords;
    }
    if (wildcard.og_image_url) {
      if (!meta.openGraph) meta.openGraph = {};
      meta.openGraph.images = [{ url: wildcard.og_image_url }];
      // Twitter görselini i18n default'ta bırakıyoruz (sayfa isterse override eder).
    }
  }

  // JSON-LD'yi layout seviyesinde enjekte etmiyoruz; sayfa düzeyinde kullanılabilir.
  return meta;
}

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <MarketingLayout>
      <LightboxProvider>{children}</LightboxProvider>
    </MarketingLayout>
  );
}
