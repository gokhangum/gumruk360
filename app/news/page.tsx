export const runtime = "nodejs";
export const revalidate = 300; // 5 dk: haber listesi sık değişmiyorsa iyi bir denge

import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { getCurrentTenantId } from "@/lib/tenant/current";
import { supabaseServer } from "@/lib/supabase/server";
import { absUrl } from "@/app/blog/seo"; // reuse helper if present
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
 function resolvePublicUrl(path?: string | null) {
   if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
 // Supabase base URL (admin’deki gibi)
 const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/+$/, "");
   // DB’de yanlışlıkla 'news/' ile başlamışsa strip et; baştaki slash’ları da temizle
   const raw = String(path).replace(/^\/+/, "");
   const stripped = raw.startsWith("news/") ? raw.slice(5) : raw;
 const key = stripped.split("/").map(encodeURIComponent).join("/");
  // Tam URL dön; relative dönersek localhost’ta 404’a düşüyor
   if (!base) return `/storage/v1/object/public/news/${key}`;
  return `${base}/storage/v1/object/public/news/${key}`;
 }
 // TipTap JSON'dan kısaca düz metin çıkar (hafif)
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

export async function generateMetadata(): Promise<Metadata> {
  const supa = await supabaseServer();
const t = await getTranslations("news.list");
  // Son yayınlanan birkaç haber → description için özet
  const { data: latest } = await supa
    .from("site_news")
    .select("title, summary, content_json, slug, lang, published_at, cover_image_path")
    .eq("is_published", true)
    .not("published_at", "is", null)
    .lte("published_at", new Date().toISOString())
    .order("published_at", { ascending: false })
    .limit(3);

 const canon = await absUrl("/news");
  const tSeo = await getTranslations("Seo");
  const siteName = tSeo("siteName");

  // Description: summary -> content -> başlık; 160 karaktere kısalt
  const candidate =
    latest?.[0]?.summary?.trim()
    || extractPlain((latest?.[0] as any)?.content_json)
    || `${siteName} ${t("suffix")}`;

  const description = candidate.length > 160 ? `${candidate.slice(0, 160)}…` : candidate;

  // OG/Twitter görseli (varsa ilk haberin kapağı)
  const ogImg = latest?.[0]?.cover_image_path
    ? resolvePublicUrl(latest[0].cover_image_path)
    : null;

  return {
    title: `${siteName} ${t("suffix")}`,
    description,
    robots: {
      index: true,
      follow: true,
      "max-image-preview": "large",
    },
    alternates: {
      canonical: canon,
      types: { "application/rss+xml": await absUrl("/news/rss.xml") },
    },
    openGraph: {
      type: "website",
      siteName,
      url: canon,
      title: `${siteName} ${t("suffix")}`,
      description,
      images: ogImg ? [ogImg] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: `${siteName} ${t("suffix")}`,
      description,
      images: ogImg ? [ogImg] : undefined,
      site: process.env.NEXT_PUBLIC_TWITTER_SITE || undefined,
      creator: process.env.NEXT_PUBLIC_TWITTER_CREATOR || undefined,
    },
  };
}



export default async function NewsListPage() {
  const supa = await supabaseServer();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supa
    .from("site_news")
    .select("id, title, slug, lang, summary, cover_image_path, is_pinned, published_at, updated_at, tenant_id, is_published, expires_at")

    .or(`tenant_id.is.null,tenant_id.eq.${tenantId || "00000000-0000-0000-0000-000000000000"}`)
.eq("is_published", true)
.not("published_at", "is", null)   // <— eklendi
.lte("published_at", new Date().toISOString())
.or("expires_at.is.null,expires_at.gt.now()")
    .order("is_pinned", { ascending: false })
    .order("published_at", { ascending: false })
    .limit(50);

  if (error) return notFound();
  const t = await getTranslations("news.list");
  // JSON-LD için ilk 10 öğeyi hazırla (SSR)
  const listForJsonLd = (data || []).slice(0, 10);
  const itemListElement = await Promise.all(
    listForJsonLd.map(async (it: any, i: number) => {
      const url = await absUrl(`/news/${it.slug}`);
      const img = it.cover_image_path ? resolvePublicUrl(it.cover_image_path) : undefined;
      return {
        "@type": "ListItem",
        position: i + 1,
        url,
        item: {
          "@type": "NewsArticle",
          mainEntityOfPage: { "@type": "WebPage", "@id": url },
          headline: it.title,
          datePublished: it.published_at || null,
          image: img ? [img] : undefined,
          isAccessibleForFree: true,
          articleSection: t("articleSection")
        }
      };
    })
  );

  const canon = await absUrl("/news");
  const siteName = process.env.NEXT_PUBLIC_SITE_NAME || new URL(canon).host;
  const jsonLdList = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${siteName} ${t("suffix")}`,
    isAccessibleForFree: true,
    hasPart: {
      "@type": "ItemList",
      itemListElement
    }
  };

  return (
     <div className="bg-gradient-to-b from-white to-slate-0 py-1">
      <div className="px-3 md:px-5 pt-2 md:pt-3 pb-3 md:pb-5">
       <div className="rounded-xl bg-blue-50/80 border border-blue-200/60 px-4 py-3 mb-4 flex items-center gap-3">
           <button type="button" className="btn btn--primary btn--cta">
           {t("pageH1")}
          </button>

     </div>
        <div className="card-surface shadow-colored p-5 md:p-6 space-y-5">
   
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(data || []).map((n:any)=>{
  const href = `/news/${n.slug}`;
  const raw = resolvePublicUrl(n.cover_image_path || undefined);
  const v = new Date((n.updated_at as string) || (n.published_at as string) || Date.now()).getTime();
  const img = raw ? `${raw}?v=${v}` : null;
  return (
    <Link key={n.id} href={href} className="card-surface overflow-hidden relative group">
       <div className="relative w-full h-80">
        {img ? (
          <>
           <img
             src={img}
              alt={n.title}
              className="absolute inset-0 w-full h-full object-cover opacity-99 blur-[0px]"
               loading="lazy"
              decoding="async"
              fetchPriority="low"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 33vw, 320px"
             />
             <div className="absolute inset-0 bg-black/30" />
         </>
        ) : (
           <div className="absolute inset-0 bg-gradient-to-br from-slate-200 to-slate-300" />
         )}
                 <div className="absolute inset-x-0 bottom-0 p-5">
       <div className="pointer-events-none relative">
            {/* Arka plan (hafif gri, hover’da az yukarı kayan) */}
          <div className="absolute -inset-3 rounded-xl bg-slate-50/90 shadow-sm translate-y-0 transition-transform duration-300 ease-out group-hover:-translate-y-1" />
            {/* Metin içerik */}
          <div className="relative">
             <div className="text-slate-900 text-lg font-semibold leading-snug line-clamp-2">{n.title}</div>
              {n.summary ? (
                <p className="mt-2 text-slate-700 text-sm leading-relaxed line-clamp-3">{n.summary}</p>
              ) : null}
            </div>
         </div>
        </div>
     </div>


            </Link>
          );
        })}
      </div>
	        {/* CollectionPage + ItemList JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdList) }}
      />

    </div> </div> </div>
  );
}