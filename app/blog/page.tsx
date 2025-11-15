export const runtime = "nodejs";

import type { Metadata } from "next";

import { absUrl, getListTitle, getListDescription, itemListJsonLd } from "./seo";
import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server"; // fallback için doğrudan sorgu
import AuthorBlock from "@/components/blog/AuthorBlock";
import { getTranslations, getLocale } from "next-intl/server";
// import { listPublicPosts } from "./server"; // Artık gerek yok

async function absFetchPath(path: string) {
  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") || hdrs.get("host") || "localhost:3000";
  const proto = hdrs.get("x-forwarded-proto") || (/^(localhost|127\.0\.0\.1)/i.test(host) ? "http" : "https");
  const base = `${proto}://${host}`;
  return new URL(path, base).toString();
}

type Search = { [key: string]: string | string[] | undefined };
const val = (sp: Search, k: string) => { const v = Array.isArray(sp[k]) ? (sp[k] as string[])[0] : (sp[k] as string | undefined); return typeof v === "string" ? v.trim() : v; };

export const revalidate = 60;

export async function generateMetadata({ searchParams }: { searchParams: Promise<Search> }): Promise<Metadata> {
  const sp = await searchParams;
  const t = await getTranslations("BlogIndex");
  const q      = val(sp, "q");
  const tag    = val(sp, "tag");
  const page   = Number(val(sp, "page") ?? "1") || 1;

 const rawTitle = await getListTitle();
 const title = (rawTitle && rawTitle.trim().length > 0)
     ? rawTitle.trim()
     : `${t("siteName")} – ${t("fallbackListTitle", { default: "Blog" })}`;
 const description = await getListDescription();
const canonical = await absUrl("/blog" + buildQuery({ q, tag, page: page > 1 ? page : undefined }));


  const robots = (q || tag)
     ? { index: false, follow: true }  // arama & etiket sonuçları noindex
     : { index: true, follow: true };  // normal liste + sayfalandırma index

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      siteName: t("siteName"),
      title,
      description,
      url: canonical,
      type: "website",
      locale: "tr_TR",
      images: [{
        url: await absUrl("/twitter-image"),
        alt: t("ogImageAlt", { siteName: t("siteName") }),
        width: 1200,
        height: 630,
      }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [await absUrl("/twitter-image")],
    },
    robots,
  };

}

function buildQuery(obj: Record<string, any>) {
  const params = new URLSearchParams();
  const entries = Object.entries(obj)
    .filter(([_, v]) => v != null && v !== "")
    .sort(([a], [b]) => a.localeCompare(b)); // deterministik

  for (const [k, v] of entries) params.set(k, String(v)); // tek kez yaz
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}


async function resolveTenantIdFromHost(): Promise<string | null> {
const hdrs = await headers();
const host = (hdrs.get("x-forwarded-host") || hdrs.get("host") || "").split(":")[0];
if (!host) return null;

  // Dev ortamda kaydı yoksa null döner (sadece global postlar listelenir)
  const admin = supabaseAdmin;
  const { data, error } = await admin
    .from("tenant_domains")
    .select("tenant_id")
    .eq("host", host)
    .maybeSingle();
  if (error) {
    console.error("[blog] tenant_domains lookup error:", error);
    return null;
  }
  return data?.tenant_id ?? null;
}
 function resolvePublicUrl(path?: string | null) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/,"");
  const clean = String(path).replace(/^\/+/, "");
   const [first, ...rest] = clean.split("/");
  const known = new Set(["blog", "authors", "workers-cv"]);
  const bucket = known.has(first) ? first : "blog";
 const key = known.has(first) ? rest.join("/") : clean;
  const urlPath = `/storage/v1/object/public/${bucket}/${key}`;
   return base ? `${base}${urlPath}` : urlPath;
 }
 
 async function getTenantLocale(supabase: any, tenantId: string | null): Promise<string> {
   if (!tenantId) return "tr-TR";
   const { data } = await supabase
     .from("tenants")
     .select("locale")
     .eq("id", tenantId)
     .maybeSingle();
   return data?.locale || "tr-TR";
 }

 // [DEĞİŞTİ] /blog/[slug]/page.tsx ile birebir aynı mantık
async function buildWorkerAuthorRow(
  admin: any,
  w: any,
  workerUserId: string,
  tenantId: string | null,
  tenantLocale: string
) {
  const isTr = String(tenantLocale || "").toLowerCase().startsWith("tr");
  const title = isTr ? (w?.title_tr ?? w?.title_en ?? null) : (w?.title_en ?? w?.title_tr ?? null);

  // Foto yolu kovasız gelebilir; "workers-cv/" ön ekini ekle
  const rawPath = w?.photo_object_path ?? null;
  const rawIsAbsolute = !!rawPath && /^https?:\/\//i.test(rawPath);
  const withBucket =
    rawPath && !/^(?:https?:\/\/|blog\/|authors\/|workers-cv\/|public\/|storage\/v1\/object\/public\/)/i.test(String(rawPath))
      ? `workers-cv/${String(rawPath).replace(/^\//, "")}`
      : (rawPath || null);

  let avatarUrl: string | null = null;

  if (rawIsAbsolute) {
    // Zaten imzalı/tam URL verilmişse dokunma
    avatarUrl = rawPath as string;
  } else if (withBucket && /^workers-cv\//i.test(withBucket)) {
    // Private bucket → signed URL üret
    const key = withBucket.replace(/^workers-cv\//i, "");
    const { data: signed, error: signErr } = await admin.storage
      .from("workers-cv")
      .createSignedUrl(key, 60 * 10); // 10 dk geçerli
    // signErr olursa public resolver'a düş
    avatarUrl = signed?.signedUrl ?? resolvePublicUrl(withBucket);
  } else if (withBucket) {
    // Diğer (public) kovalar aynen public URL
    avatarUrl = resolvePublicUrl(withBucket);
  } else {
    avatarUrl = null;
  }

  return {
    name: w?.display_name ?? null,
    title,
    bio: null,
    avatar_url: avatarUrl,
    // /blog/[slug] ile aynı alias'lar:
    avatar: avatarUrl,
    image: avatarUrl,
    photo: avatarUrl,
  };
}

async function fetchList(sp: Search) {
  const q      = val(sp, "q");
  const tag    = val(sp, "tag");
  const page   = Number(val(sp, "page") ?? "1") || 1;
  const limit  = Math.min(Math.max(Number(val(sp, "limit") ?? "10"), 1), 50);
  const lang   = val(sp, "lang") || "tr-TR";

  // Tenant paramını URL ile override etmek istersen destekli; yoksa host'tan çöz.
  const urlTenant = val(sp, "tenant") || undefined;
  const hostTenant = await resolveTenantIdFromHost();
  const effectiveTenant = urlTenant ?? hostTenant ?? null;

  // 1) Data route (JSON) — tenant bilgisini daima gönder
  try {
    const qs = new URLSearchParams();
    qs.set("page", String(page));
    qs.set("limit", String(limit));
    if (q) qs.set("q", q);
    if (tag) qs.set("tag", tag);
    if (lang) qs.set("lang", lang);
    if (effectiveTenant) qs.set("tenant", effectiveTenant); // host’a uygun tenant
    qs.set("global", "1"); // data route için ipucu (global + tenant birlikte)

    const url = await absFetchPath(`/blog/data?${qs.toString()}`);
    const res = await fetch(url, { next: { tags: ["blog"] } });

    const ctype = res.headers.get("content-type") || "";
    if (!res.ok || !ctype.includes("application/json")) {
      throw new Error(`Unexpected response: status ${res.status}, ctype ${ctype}`);
    }

    const json = await res.json();
    return { items: json.items || [], total: json.total || 0, page, limit };
  } catch {
    // 2) Fallback: Supabase ile doğrudan sorgu (global + tenant OR)
    const sb = await supabaseServer();

    let query = sb
      .from("blog_posts")
      .select("id, slug, title, summary, lang, published_at, updated_at, tags, tenant_id, status", { count: "exact" })
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (lang) query = query.eq("lang", lang);
    if (q)     query = query.ilike("title", `%${q}%`);
    if (tag)   query = query.contains("tags", [tag]);

    if (effectiveTenant) {
      // (tenant_id IS NULL) OR (tenant_id = :id)
      query = query.or(`tenant_id.is.null,tenant_id.eq.${effectiveTenant}`);
    } else {
      // sadece global
      query = query.is("tenant_id", null);
    }

    const { data, error, count } = await query;
    if (error) {
      console.error("[blog] fallback list error:", error);
      return { items: [], total: 0, page, limit };
    }
    return { items: data || [], total: count || 0, page, limit };
  }
}

export default async function BlogIndexPage({ searchParams }: { searchParams: Promise<Search> }) {
 const sp = await searchParams;
 const t = await getTranslations("BlogIndex");
const locale = await getLocale();
  const base = await absUrl("/");
  const { items, total, page, limit } = await fetchList(sp);
  const listTitleStr = await getListTitle();
const listDescriptionStr = await getListDescription();
  const ld = itemListJsonLd({
   title: listTitleStr,
   description: listDescriptionStr,
  items: (Array.isArray(items) ? items : []).map((p: any) => ({
     url: new URL(`/blog/${p.slug}`, base).toString(),
   name: p.title,
    datePublished: p.published_at ?? undefined,
  })),
inLanguage: (val(sp, "lang") || "tr-TR"),
 });
 const urlForJsonLd = page > 1
  ? await absUrl("/blog" + buildQuery({ q: val(sp,"q"), tag: val(sp,"tag"), page }))
  : await absUrl("/blog" + buildQuery({ q: val(sp,"q"), tag: val(sp,"tag") }));

  const totalPages = Math.max(1, Math.ceil(total / limit));
const list = Array.isArray(items) ? items : [];
const listWithKeys = list.map((p: any, i: number) => ({ ...p, __key: p?.id ?? p?.slug ?? `row-${i}` }));
  // Sağ blok: sadece bu sayfadaki yazıların yazarları
   const slugs = list.map((p: any) => p.slug).filter(Boolean);
  let uniqueAuthors: { id: string; author: any; workerId: string | null }[] = [];
  let __uiLocale: "tr" | "en" = "tr";

  if (slugs.length) {
	     const supa = await supabaseServer();
  // [EKLE] Aktif tenant ve dil:
     const activeTenantId = await resolveTenantIdFromHost();
    const currentLang = val(sp, "lang") || "tr-TR";


   // [DEĞİŞTİR] Yalnızca aktif tenant (veya global) + currentLang eşleşen postlar
    let pm = supa
       .from("blog_posts")
      .select("slug, id, author_id, tenant_id, status, lang")
       .in("slug", slugs)
       .eq("status", "published")
      .eq("lang", currentLang);

   if (activeTenantId) {
       pm = pm.or(`tenant_id.is.null,tenant_id.eq.${activeTenantId}`);
    } else {
       pm = pm.is("tenant_id", null);
     }

  const { data: postMeta } = await pm;


     const authorIds = Array.from(new Set((postMeta ?? []).map((r: any) => r.author_id).filter(Boolean)));

    if (authorIds.length) {
     const admin = supabaseAdmin;
      const tenantLocale = await getTenantLocale(admin, activeTenantId);
      __uiLocale = String(tenantLocale || "").toLowerCase().startsWith("en") ? "en" : "tr";
 
     // 1) Klasik authors
      const { data: blogAuthors } = await admin
        .from("blog_authors")
       .select("id, name, title, bio, avatar_path")
        .in("id", authorIds);

     const blogAuthorMap = new Map<string, any>();
      for (const a of blogAuthors ?? []) {
  const resolvedAvatar =
    (a as any)?.avatar_url
    || (a as any)?.avatarUrl
    || (a as any)?.avatar
    || (a as any)?.image
    || (a as any)?.photo
    || (a as any)?.avatar_path
    || null;

  blogAuthorMap.set(a.id, {
    name: a?.name ?? null,
    title: a?.title ?? null,
    bio: a?.bio ?? null,
    avatar_url: resolvePublicUrl(resolvedAvatar),
    // [EKLENDİ] slug/page ile aynı fallback zinciri için alias’lar:
    avatar: resolvePublicUrl(resolvedAvatar),
    image: resolvePublicUrl(resolvedAvatar),
    photo: resolvePublicUrl(resolvedAvatar),
  });

       }

 // 2) Worker tabanlı yazarlar (blog_authors’da olmayanlar **VEYA** avatarı boş olanlar)
const needWorkerIds = authorIds.filter((id: string) => {
  const ba = blogAuthorMap.get(id);
  return !ba || !ba.avatar_url; // blog_authors yoksa ya da avatarı yoksa worker'dan çek
});

const workerMap = new Map<string, any>();
if (needWorkerIds.length) {
  const { data: workers } = await admin
    .from("worker_cv_profiles")
    .select("worker_user_id, display_name, title_tr, title_en, photo_object_path")
    .in("worker_user_id", needWorkerIds);

  for (const w of workers ?? []) {
    const row = await buildWorkerAuthorRow(admin, w, w.worker_user_id, activeTenantId, tenantLocale);
    workerMap.set(w.worker_user_id, row);
  }
}


      // 3) İlk görünüş sırasına göre benzersiz dizi
     const seen = new Set<string>();
     for (const p of postMeta ?? []) {
      const id = (p as any).author_id as string | null;
       if (!id || seen.has(id)) continue;
      seen.add(id);
         const ba = blogAuthorMap.get(id) || null;
const wa = workerMap.get(id) || null;
// blog_authors varsa ama avatar'ı yoksa worker'ı tercih et
const a = (ba && ba.avatar_url) ? ba : (wa || ba);
       const workerId = workerMap.has(id) ? id : null;
        if (a) uniqueAuthors.push({ id, author: a, workerId });
    }
    }
   }

  return (
   
       <div className="px-1 md:px-1 pt-1 md:pt-1 pb-1 md:pb-1">
      <h1 id="page-title" className="sr-only">
  {listTitleStr}
</h1>
         <div className="card-surface shadow-colored p-3 md:p-3 w-full max-w-none md:mx-auto md:max-w-[clamp(320px,90vw,1100px)]">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-10">
           {/* SOL: Liste */}
           <section className="md:col-span-2" id="main-content" aria-labelledby="page-title" role="region">

          {/* JSON-LD: ItemList */}
      <script
            type="application/ld+json"
            suppressHydrationWarning
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "CollectionPage",
                  name: listTitleStr,
                description: listDescriptionStr,
                inLanguage: (val(sp, "lang") || "tr-TR"),
url: urlForJsonLd,
              }),
            }}
          />
		  <script
  type="application/ld+json"
  dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
/>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "BreadcrumbList",
                "itemListElement": [
                 { "@type": "ListItem", "position": 1, "name": t("breadcrumbHome"), "item": await absUrl("/") },
{ "@type": "ListItem", "position": 2, "name": listTitleStr, "item": urlForJsonLd }
                 ]
              })
            }}
          />
          <h1 id="page-title" className="text-2xl md:text-3xl font-semibold tracking-tight">
          {listTitleStr}
         </h1>
         <form action="/blog" method="get" role="search" aria-label={t("searchAria")} className="card-surface edge-underline edge-blue edge-taper p-3 mb-4 grid gap-2 md:grid-cols-[1fr_200px_120px]">
            <input type="search" name="q" defaultValue={val(sp,"q")} placeholder={t("searchPlaceholder")} className="input border rounded-md px-3 py-2" aria-label={t("searchInputAria")} autoComplete="off" />
            <input type="text" name="tag" defaultValue={val(sp,"tag")} placeholder={t("tagPlaceholder")} className="input border rounded-md px-3 py-2" aria-label={t("tagInputAria")} autoComplete="off" />
           <button className="btn bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-2">{t("apply")}</button>
        </form>

          {items.length === 0 && (
          <div className="card-surface text-sm text-gray-600 p-6">{t("noPosts")}</div>
          )}
 
           <ul className="grid gap-4">
           {listWithKeys.map((p: any) => (
             <li key={p.__key} className="card-surface p-4 hover:shadow-colored transition">
                <a href={`/blog/${p.slug}`} className="block">
                  <div className="text-lg font-medium">{p.title}</div>
   <div className="text-xs text-gray-500 mt-1">
  {p.lang ? <>{p.lang} • </> : null}
  {p.updated_at ?? p.published_at
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(p.updated_at ?? p.published_at))
    : "—"}
  {Array.isArray(p.tags) && p.tags.length ? <> • {p.tags.slice(0,4).join(", ")}</> : null}
</div>
                  {p.summary && <p className="text-sm text-gray-700 mt-2 line-clamp-3">{p.summary}</p>}
                 </a>
           </li>
             ))}
           </ul>

           {totalPages > 1 && (
            <nav className="flex items-center justify-between mt-6">
              <PaginationLink
               disabled={page <= 1}
               href={`/blog?${buildQS(
                  { q: (Array.isArray(sp.q)? sp.q[0]: sp.q), tag: (Array.isArray(sp.tag)? sp.tag[0]: sp.tag), lang: (Array.isArray(sp.lang)? sp.lang[0]: sp.lang), limit: (Array.isArray(sp.limit)? sp.limit[0]: sp.limit) },
                 { page: page - 1 }
               )}`}
              rel="prev" ariaLabel={t("prevPageAria")}>
              {t("prevPage")}
           </PaginationLink>

            <div className="text-sm text-gray-600">{t("pageStatus", { page, total: totalPages })}</div>

             <PaginationLink
                 disabled={page >= totalPages}
                href={`/blog?${buildQS(
                   { q: (Array.isArray(sp.q)? sp.q[0]: sp.q), tag: (Array.isArray(sp.tag)? sp.tag[0]: sp.tag), lang: (Array.isArray(sp.lang)? sp.lang[0]: sp.lang), limit: (Array.isArray(sp.limit)? sp.limit[0]: sp.limit) },
                  { page: page + 1 }
                )}`}
              rel="next" ariaLabel={t("nextPageAria")}>
                {t("nextPage")}
             </PaginationLink>
           </nav>
        )}
      </section>

     {/* SAĞ: Yazarlar */}
        {uniqueAuthors && uniqueAuthors.length > 0 ? (
          <aside className="md:col-span-1 w-full">
             <div className="card-surface shadow-colored p-4 md:p-5 edge-underline edge-blue edge-taper">
               <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">{t("authors")}</h3>
               <div className="space-y-3">
              {uniqueAuthors.map((row) => (
  <div key={row.id} className="group rounded-xl hover:edge-rise-2mm transition">
   <AuthorBlock
  author={{
    ...row.author,
    // [/blog/[slug]] ile birebir aynı fallback:
    avatar_url:
      (row.author as any)?.avatar_url
      || (row.author as any)?.avatarUrl
      || (row.author as any)?.avatar
      || (row.author as any)?.image
      || (row.author as any)?.photo
      || null,
  }}
  workerId={row.workerId}
  authorId={row.id}
  locale={__uiLocale as "tr" | "en"}
/>

   
  </div>
))}

               </div>
            </div>
          </aside>
         ) : null}
      </div>
</div></div>
        
  );
}

function buildQS(base: Record<string, any>, patch: Record<string, any>) {
  const u = new URL("http://x.local/blog");
  // base ⇒ sıradan POJO (searchParams değil)
  for (const [k, v] of Object.entries(base)) {
    if (v != null && v !== "") u.searchParams.set(k, String(v));
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v == null || v === "") u.searchParams.delete(k);
    else u.searchParams.set(k, String(v));
  }
  return u.searchParams.toString();
}


function PaginationLink({
   href, disabled, children, rel, ariaLabel
 }: { href: string; disabled?: boolean; children: any; rel?: "prev" | "next"; ariaLabel?: string }) {
   if (disabled) return <span className="text-gray-400 text-sm">{children}</span>;
   return (
    <a href={href} rel={rel} aria-label={ariaLabel} className="text-blue-700 hover:underline">
       {children}
    </a>
  );
 }
