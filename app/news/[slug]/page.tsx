// app/news/[slug]/page.tsx
export const runtime = "nodejs";

import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/tenant/current";
import type { Metadata } from "next";
import { absUrl } from "@/app/blog/seo";
import BlogContentBridge from "@/components/blog/BlogContentBridge";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
 export async function generateMetadata(
   { params }: { params: Promise<{ slug: string }> }
 ): Promise<Metadata> {
   const { slug } = await params;
const [supa, tenantId] = await Promise.all([supabaseServer(), getCurrentTenantId()]);

const dataPromise = supa

     .from("site_news")
     .select("title, summary, content_json, cover_image_path, slug, lang, published_at, updated_at, tenant_id")
     .eq("slug", slug)
     .eq("is_published", true)
     .not("published_at", "is", null)
     .lte("published_at", new Date().toISOString())
     .or("expires_at.is.null,expires_at.gt.now()")
       .maybeSingle();

const { data } = await dataPromise;

   if (!data) return { robots: { index: false, follow: true } };

    const canon = await absUrl(`/news/${data.slug}`);
const rawImg = resolvePublicUrl(data.cover_image_path || undefined) || undefined;
// updated_at > published_at > now → sürüm paramı; uzun TTL’de güncellemeler anında yakalansın
const img = rawImg
  ? `${rawImg}?v=${new Date((data.updated_at as string) || (data.published_at as string) || Date.now()).getTime()}`
  : undefined;

const host = new URL(canon).host;
const siteName = process.env.NEXT_PUBLIC_SITE_NAME || host;

    const mapLocale = (l?: string) => (l === "tr" || l === "tr-TR" ? "tr_TR" : "en_US");
    const currentOgLocale = mapLocale(data.lang);
    const twitterSite = process.env.NEXT_PUBLIC_TWITTER_SITE || undefined;     // örn: "@easycustoms360"
    const twitterCreator = process.env.NEXT_PUBLIC_TWITTER_CREATOR || undefined; // örn: "@brand_owner"


const siblingsPromise = supa
  .from("site_news")
  .select("lang, slug")
  .eq("slug", slug)
  .eq("is_published", true);
const { data: siblings } = await siblingsPromise;

   const languages: Record<string, string> = {};
   if (Array.isArray(siblings)) {
     for (const s of siblings) {
       if (s?.lang && s?.slug) {
         // Not: host-bazlı canonical; hangi host’ta çağrılırsa ona göre absUrl döner
         languages[String(s.lang)] = await absUrl(`/news/${s.slug}`);
       }
     }
     // X-Default olarak geçerli canonical
     languages["x-default"] = canon;
   }

// TipTap JSON içinden düz metin çıkar (çok hafif)
const extractPlain = (json: any): string | null => {
  if (!json) return null;
  const out: string[] = [];
  const walk = (n: any) => {
    if (!n) return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (typeof n === "object") {
      if (n.type === "text" && typeof n.text === "string") out.push(n.text);
      if (n.content) walk(n.content);
    }
  };
  walk(json);
  const text = out.join(" ").replace(/\s+/g, " ").trim();
  return text || null;
};

const title = data.title;
// Özet → içerik → başlık sıralı fallback + 160 karakter (… ile)
const rawDesc = (data.summary?.trim())
  || extractPlain((data as any).content_json)
  || data.title;
const description = rawDesc.length > 160 ? `${rawDesc.slice(0, 160)}…` : rawDesc;


       return {
      title,
      description,
      robots: {
        index: true,
        follow: true,
        "max-image-preview": "large",
      },
      alternates: {
        canonical: canon,
        languages: Object.keys(languages).length ? languages : undefined,
        // RSS keşif linki: <link rel="alternate" type="application/rss+xml" ...>
        types: { "application/rss+xml": await absUrl("/news/rss.xml") },
      },
      openGraph: {
        type: "article",
        siteName,
        url: canon,
        title,
        description,
        images: img ? [img] : undefined,
        locale: currentOgLocale,
        alternateLocale: Object.keys(languages).length
          ? Object.keys(languages)
              .filter((l) => l !== "x-default" && l !== (data.lang || "en"))
              .map(mapLocale)
          : undefined,
        publishedTime: data.published_at || undefined,
        modifiedTime: (data.updated_at as string) || (data.published_at as string) || undefined,
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: img ? [img] : undefined,
        site: twitterSite,
        creator: twitterCreator,
      },
    };

 }

/** Storage path → public URL (her zaman news bucket'ı) */
function resolvePublicUrl(path?: string | null) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const raw = String(path).replace(/^\/+/, "");
  const stripped = raw.startsWith("news/") ? raw.slice(5) : raw; // path başında 'news/' varsa temizle
  const key = stripped.split("/").map(encodeURIComponent).join("/");
  if (!key) return null;
  // base yoksa da relative verelim ama normalde NEXT_PUBLIC_SUPABASE_URL olmalı
  return base
    ? `${base}/storage/v1/object/public/news/${key}`
    : `/storage/v1/object/public/news/${key}`;
}

/** Çok basit: TipTap JSON içinden düz metin çıkar, <p> paragraflarına böl */
function renderPlainFromTiptap(json: any) {
  if (!json) return null;
  const out: string[] = [];
  const walk = (n: any) => {
    if (!n) return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (typeof n === "object") {
      if (n.type === "text" && typeof n.text === "string") out.push(n.text);
      if (n.type === "hardBreak") out.push("\n");
      if (n.content) walk(n.content);
    }
  };
  walk(json);
  const text = out.join("").replace(/\r/g, "").trim();
  if (!text) return null;
  const parts = text.split(/\n{2,}/); // iki ve üzeri satır boşluklarını paragraf kabul et
  return (
    <>
      {parts.map((p, i) => (
        <p key={i} className="leading-relaxed">{p.trim()}</p>
      ))}
    </>
  );
}

/** TipTap JSON içinden düz metin çıkarıp yaklaşık kelime sayısını döndürür */
function getWordCountFromTiptap(json: any): number | null {
  if (!json) return null;
  const buf: string[] = [];
  const walk = (n: any) => {
    if (!n) return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (typeof n === "object") {
      if (n.type === "text" && typeof n.text === "string") buf.push(n.text);
      if (n.content) walk(n.content);
    }
  };
  walk(json);
  const text = buf.join(" ").replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.split(" ").filter(Boolean).length;
}

export default async function NewsDetailPage(

  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params; // Next.js 15: params bir Promise
const [supa, tenantId] = await Promise.all([supabaseServer(), getCurrentTenantId()]);


  // Haber detayı
  const { data, error } = await supa
    .from("site_news")
    .select("*")
    .eq("slug", slug)
    .eq("is_published", true)
    .not("published_at", "is", null)
    .lte("published_at", new Date().toISOString())
    .or("expires_at.is.null,expires_at.gt.now()")
    .limit(1)
    .maybeSingle();

  if (error || !data) return notFound();

  // Tenant uyumu: farklı tenant'a aitse 404
  if (tenantId && data.tenant_id && data.tenant_id !== tenantId) return notFound();

const coverUrlRaw = resolvePublicUrl(data.cover_image_path || undefined);
const coverUrl = coverUrlRaw
  ? `${coverUrlRaw}?v=${new Date((data.updated_at as string) || (data.published_at as string) || Date.now()).getTime()}`
  : null;

const docStr = JSON.stringify(data.content_json ?? null);
const canon = await absUrl(`/news/${data.slug}`);

  const pageUrl = new URL(canon);
  const siteName = process.env.NEXT_PUBLIC_SITE_NAME || pageUrl.host;
  const wordCount = getWordCountFromTiptap(data.content_json);
const t = await getTranslations("news.detail");
 const jsonLd = {

  "@context": "https://schema.org",
  "@type": "NewsArticle",
  "mainEntityOfPage": { "@type": "WebPage", "@id": canon },
  "url": canon,
  "inLanguage": (data.lang as string) || (process.env.NEXT_PUBLIC_DEFAULT_LANG || "en"),
  "headline": data.title,
  "description": data.summary || data.title,
  "image": coverUrl ? [coverUrl] : undefined,

  // ✔ yeni alanlar
  "isAccessibleForFree": true,
  "articleSection": t("articleSection"),
  "thumbnailUrl": coverUrl || undefined,
  "wordCount": typeof wordCount === "number" ? wordCount : undefined,

  "datePublished": data.published_at || null,
  "dateModified": data.updated_at || data.published_at || null,

  // author: Organization + url ile zenginleştirildi
  "author": { "@type": "Organization", "name": siteName, "url": pageUrl.origin },

  "publisher": {
    "@type": "Organization",
    "name": siteName,
    "logo": {
      "@type": "ImageObject",
      "url": `${pageUrl.origin}/images/logo.png`,
      "width": 256,
      "height": 256
    }
  }
};

    return (
   <div className="bg-gradient-to-b from-white to-slate-0 py-1">
      <div className="px-3 md:px-5 pt-2 md:pt-3 pb-3 md:pb-5">
     
         <article className="card-surface shadow-colored p-5 md:p-6 space-y-5 max-w-3xl mx-auto">
          <div className="text-sm text-gray-500">
           {data.published_at ? new Date(data.published_at).toLocaleString(data.lang || undefined) : ""}
          </div>
 
           <h1 className="text-3xl font-bold">{data.title}</h1>
 
 
          {data.summary && (
           <p className="text-gray-700">{data.summary}</p>
         )}

         <div className="prose max-w-none">
            <BlogContentBridge docStr={docStr} />
          </div>

          <script
           type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
          />
       </article>
       </div>
   </div>
   );

}
