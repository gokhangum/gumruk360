// app/blog/[slug]/page.tsx
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Image from "next/image";
import { supabaseServer } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/tenant/current";
import ImageWithLightbox from "@/components/blog/ImageWithLightbox";
import AuthorBlock from "@/components/blog/AuthorBlock";
import BlogContentBridge from "@/components/blog/BlogContentBridge";
import { absUrl, blogPostingJsonLd } from "../seo";
import { resolvePublicUrl } from "@/lib/storage/resolvePublicUrl";
// Admin client'ı proje varyantlarına göre resolve eder
async function getAdminClient() {
  let adminMod: any = null;
  let serverAdminMod: any = null;
  try { adminMod = await import("@/lib/supabase/admin"); } catch {}
  try { serverAdminMod = await import("@/lib/supabase/serverAdmin"); } catch {}

  const cand =
    adminMod?.supabaseAdmin ??
    serverAdminMod?.supabaseAdmin ??
    adminMod?.createAdminClient ??
    serverAdminMod?.createAdminClient ??
    null;

  if (!cand) throw new Error("Admin client export not found");
  return typeof cand === "function" ? await cand() : cand;
}

export const runtime = "nodejs";
export const revalidate = 1800;
  
// Tenant locale: tenants.locale (örn: tr-TR | en-US)
// tenant yoksa tr-TR kabul ediyoruz.
async function getTenantLocale(supabase: any, tenantId: string | null): Promise<string> {
  if (!tenantId) return "tr-TR";
  const { data, error } = await supabase
    .from("tenants")
    .select("locale")
    .eq("id", tenantId)
    .maybeSingle();
  return (!error && data?.locale) ? data.locale : "tr-TR";
}

async function buildWorkerAuthorRow(admin: any, w: any, workerUserId: string, tenantId: string | null, tenantLocale: string) {
  const isTr = String(tenantLocale || "").toLowerCase().startsWith("tr");
  const title = isTr ? (w?.title_tr ?? w?.title_en ?? null) : (w?.title_en ?? w?.title_tr ?? null);
  const href = `/ask?worker=${encodeURIComponent(workerUserId)}${tenantId ? `&tenant=${encodeURIComponent(tenantId)}` : ""}&open=cv&locale=${encodeURIComponent(isTr ? "tr" : "en")}`;

  // Foto yolu kovasız gelebilir; "workers-cv/" ön ekini ekle
  const rawPath = w?.photo_object_path ?? null;
  const rawIsAbsolute = !!rawPath && /^https?:\/\//i.test(rawPath);
 const withBucket =
  rawPath && !/^(?:https?:\/\/|blog\/|authors\/|workers-cv\/|public\/|storage\/v1\/object\/public\/)/i.test(rawPath)
    ? `workers-cv/${rawPath}`
    : rawPath;
   let avatarUrl: string | null = null;
  if (rawIsAbsolute) {
    // Zaten imzalı/tam URL verilmişse dokunma
    avatarUrl = rawPath;
  } else if (withBucket && withBucket.startsWith("workers-cv/")) {
    // Private bucket → signed URL üret
    const key = withBucket.replace(/^workers-cv\//, "");
    const { data: signed } = await admin.storage
      .from("workers-cv")
      .createSignedUrl(key, 60 * 10); // 10 dk geçerli
    avatarUrl = signed?.signedUrl ?? resolvePublicUrl(withBucket);
  } else {
    // Diğer (public) kovalar aynen public URL
    avatarUrl = resolvePublicUrl(withBucket);
  }


  return {
    name: w?.display_name ?? null,
    title,
    bio: null,

    // Ham kolonları da koru:
    photo_object_path: rawPath,      // imzalı tam URL olabilir
    avatar_path: withBucket,         // kovalı/path formu

    // URL'ler (mutlak):
    avatar_url: rawIsAbsolute ? rawPath : avatarUrl,
    avatar:      rawIsAbsolute ? rawPath : avatarUrl,
    avatarUrl:   rawIsAbsolute ? rawPath : avatarUrl,
    image:       rawIsAbsolute ? rawPath : avatarUrl,
    photo:       rawIsAbsolute ? rawPath : avatarUrl,

    // CV linki
    _worker_link: href,
  };

}

type PostRow = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  cover_image_path: string | null;
  content_json: any;
  lang: string | null;
  status: "published" | "draft" | "in_review" | "scheduled" | "archived";
  tenant_id: string | null;
  published_at: string | null;
  updated_at: string | null;
  author_id: string | null;
  tags: string[] | null;
    author?: {
    name: string | null;
    title: string | null;
    bio: string | null;
    avatar_path: string | null;
  } | null;
};

/** Slug’a göre tek yazıyı getirir; tenant filtresi uygular */
async function getPost(slug: string): Promise<PostRow | null> {
  const supabase = await supabaseServer();
  const admin = await getAdminClient();
  const tenantId = await getCurrentTenantId(); // aktif tenant (veya null: global)

  // Temel sorgu
  let q = supabase
    .from("blog_posts")
     .select(`
      id, slug, title, summary, cover_image_path, content_json, lang, status,
      tenant_id, published_at, updated_at, author_id, tags
    `)
    .eq("slug", slug)
    .eq("status", "published")
    .not("published_at", "is", null);

  // Tenant filtresi (koşullu)
  if (tenantId) {
    // aktif tenant'a ait veya global (null)
    q = q.or(`tenant_id.eq.${tenantId},tenant_id.is.null`);
  } else {
    // aktif tenant yoksa sadece global yazılar
    q = q.is("tenant_id", null);
  }

  const { data, error } = await q.maybeSingle();
 
   if (error) {
     console.error("[blog detail] getPost error:", (error as any)?.message || error);
     return null;
  }

  // --- Author fetch & merge ---
 let author: any = null;

  // 4.1) Önce klasik blog_authors
  if (data?.author_id) {
    const { data: a, error: ae } = await admin
      .from("blog_authors")
      .select("name, title, bio, avatar_path")
      .eq("id", data.author_id)
      .maybeSingle();
    if (!ae && a) author = a;
  }

  // 4.2) blog_authors yoksa: author_id'yi worker kabul et → worker_cv_profiles'tan doldur
  if (!author && data?.author_id) {
       // Tenant dilini admin client ile al (RLS'e takılmasın)
const tenantLocale = await getTenantLocale(admin, data.tenant_id ?? null);
const { data: w, error: we } = await admin
  .from("worker_cv_profiles")
  .select("display_name, title_tr, title_en, photo_object_path")
  .eq("worker_user_id", data.author_id)
  .maybeSingle();
if (!we && w) {
  author = await buildWorkerAuthorRow(admin, w, data.author_id, data.tenant_id, tenantLocale);
}
  }

  // Post objesine author’u ekleyip döndür
  return data ? ({ ...(data as any), author } as PostRow) : null;

  if (error) {
    console.error("[blog detail] getPost error:", (error as any)?.message || error);
    return null;
  }
  return data ?? null;
}

/** SEO: dinamik meta */
export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return { title: "Blog | Gümrük360" };

  const title = `${post.title} | Gümrük360`;
  const description = (post.summary ?? post.title)?.slice(0, 300);
 const url = await absUrl(`/blog/${encodeURIComponent(post.slug)}`);
 const image = resolvePublicUrl(post.cover_image_path) ?? await absUrl("/images/og-default.png");
    const locale = (post.lang || 'tr-TR') as any;
  const isTr = String(locale).toLowerCase().startsWith('tr');
  const tenantBrand = isTr ? "Gümrük360" : "EasyCustoms360";
  const ogLocale = isTr ? "tr_TR" : "en_US";
// base URL'yi ENV'den çek (EN başlıyorsa EN, aksi TR)
const baseUrl = (String(locale).toLowerCase().startsWith('en')
  ? process.env.APP_BASE_URL_EN
  : process.env.APP_BASE_URL_TR) as string;

  return {
    title,
    description,
        alternates: {
      canonical: url,
      // Dil varyantlarınız varsa doldurun:
      languages: isTr
        ? { "tr-TR": url /*, "en": absUrl(`/en/blog/${encodeURIComponent(post.slug)}`) */ }
        : { "en": url /*, "tr-TR": absUrl(`/blog/${encodeURIComponent(post.slug)}`) */ },
    },

    openGraph: {
      type: "article",
      url,
      siteName: tenantBrand,
      title,
      description,
      images: image ? [{ url: image, alt: post.title }] : [],
      locale: ogLocale as any, // "tr_TR" | "en_US"
      publishedTime: post.published_at ?? undefined,
      modifiedTime: post.updated_at ?? undefined
    },

    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: image ? [image] : [],
      // varsa marka/hesapları ekleyin:
      // site: "@easycustoms360",
      // creator: "@yazarHesabi",
    }

  };
}

export default async function BlogDetailPage(
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return notFound();

  const cover = resolvePublicUrl(post.cover_image_path);
  const docStr = JSON.stringify(post.content_json ?? {});
  const url = await absUrl(`/blog/${encodeURIComponent(post.slug)}`);
   const authorRaw = (post as any)?.author ?? null;
  const resolvedAvatar =
    // 1) İmzalı tam URL doğrudan geldiyse onu kullan
    (typeof authorRaw?.photo_object_path === "string" && /^https?:\/\//i.test(authorRaw.photo_object_path))
      ? authorRaw.photo_object_path
      // 2) Diğer olası alanlar
      : (
          authorRaw?.avatar_url ??
          authorRaw?.avatar ??
          authorRaw?.avatarUrl ??
          authorRaw?.image ??
          authorRaw?.photo ??
          resolvePublicUrl(authorRaw?.avatar_path ?? null) ??
          null
        );

  const author = authorRaw
    ? {
        ...authorRaw,
        name: authorRaw.name ?? null,
        title: authorRaw.title ?? null,
        bio: authorRaw.bio ?? null,
        // Tüm olası anahtarları aynı URL ile doldur
        avatar_url: resolvedAvatar,
        avatar: resolvedAvatar,
        avatarUrl: resolvedAvatar,
        image: resolvedAvatar,
        photo: resolvedAvatar,
      }
    : null;
	const authorLink = (post as any)?.author?._worker_link ?? null;
  // JSON-LD — BlogPosting
  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") || hdrs.get("host") || "localhost:3000";
  const proto = hdrs.get("x-forwarded-proto") || (/^(localhost|127\.0\.0\.1)/i.test(host) ? "http" : "https");
  const base = `${proto}://${host}`.replace(/\/+$/, "");

   // JSON-LD alanları için yazar/marka bilgisi
  // Bu sayfa bağlamı için locale/marka
  const pageLocale = (post.lang ?? "tr-TR") as string;
  const pageIsTr = pageLocale.toLowerCase().startsWith("tr");
  const tenantBrand = pageIsTr ? "Gümrük360" : "EasyCustoms360";

  // JSON-LD author adı: varsa kişi adı, yoksa marka
  const authorName =
    (author?.name && String(author.name).trim().length > 0)
      ? String(author.name)
      : tenantBrand;


 const jsonLd = await blogPostingJsonLd({
  url,
  headline: post.title,
  description: post.summary ?? post.title,
  images: cover ? [cover] : [],
  datePublished: post.published_at ?? undefined,
  dateModified: post.updated_at ?? undefined,
  inLanguage: String(pageLocale || "tr-TR"),
  author: authorName, // Person adı varsa onu, yoksa marka
  publisher: {
    name: tenantBrand,
    logo: `${base}/images/logo.png`
  }
});


    const admin = await getAdminClient();
 const activeTenantId = await getCurrentTenantId(); // domain'den gelen aktif tenant
 const tenantLocaleFull = await getTenantLocale(admin, activeTenantId);
 const forcedLocale = tenantLocaleFull.toLowerCase().startsWith("en") ? "en" : "tr";
  // Yazarın diğer yazıları (aynı author_id, bu post hariç, aktif tenant filtresi)
 const supa = await supabaseServer();
 let oq = supa
   .from("blog_posts")
   .select("id, slug, title, cover_image_path, published_at")
   .eq("status", "published")
   .not("published_at", "is", null)
   .eq("author_id", post.author_id)
   .neq("id", post.id)
   .order("published_at", { ascending: false })
   .limit(6);
 if (activeTenantId) {
   // aktif tenant veya global
   oq = oq.or(`tenant_id.eq.${activeTenantId},tenant_id.is.null`);
 } else {
   // sadece global
   oq = oq.is("tenant_id", null);
 }
 const { data: otherPosts = [] } = await oq;
  return (
  <div className="bg-gradient-to-b from-white to-slate-0 py-1">
    <main className="w-full max-w-none md:max-w-[clamp(320px,90vw,928px)] md:mx-auto px-0 md:px-6 lg:px-8 py-6">
       
	   
    
      <article className="card-surface shadow-colored p-5 md:p-6 space-y-5 w-full max-w-[clamp(320px,80vw,928px)] mx-auto prose prose-slate max-w-none prose-img:my-0">
        <header className="mb-2">
		
		 {author && (
   <AuthorBlock
     author={{
       ...author,
       avatar_url: author.avatar_url || author.avatarUrl || author.avatar || author.image || author.photo || null,
     }}
	  workerId={post.author_id ?? null}
    locale={forcedLocale as "tr" | "en"}
   />
 )}
		
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{post.title}</h1>
			    {cover && (
  <div className="not-prose my-3 edge-underline edge-blue edge-taper edge-rise-2mm">
    <ImageWithLightbox
      className="block w-full"
       src={cover}
      alt={post.title}
    />
  </div>
 )}


          {post.summary && (
            <p className="mt-2 text-slate-600">{post.summary}</p>
          )}
        </header>



        <BlogContentBridge docStr={docStr} />
        {/* Yazarın diğer yazıları */}
        {Array.isArray(otherPosts) && otherPosts.length > 0 ? (
  <section className="not-prose mt-10">
    <div className="card-surface shadow-colored p-5 md:p-6">
      <h2 className="mb-3 text-base font-semibold text-slate-900">Yazarın diğer yazıları</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {otherPosts.map((p) => {
          const href = `/blog/${encodeURIComponent((p as any).slug)}`;
          const pcover = resolvePublicUrl((p as any).cover_image_path);
          return (
            <a
              key={(p as any).id}
              href={href}
              className="group block card-surface edge-underline edge-blue edge-taper edge-rise-2mm p-3"
            >
              {pcover ? (
                <div className="w-full rounded-lg mb-2 overflow-hidden" style={{ aspectRatio: "16/9" }}>
                  <Image
                    src={pcover}
                    alt={(p as any).title}
                    // CLS önlemi için sabit boyut + oran; tarafa göre boyutlanır
                    width={640}
                    height={360}
                    sizes="(max-width: 640px) 100vw, 50vw"
                    loading="lazy"
                    decoding="async"
                    fetchPriority="low"
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : null}
              <div className="text-sm font-medium leading-snug group-hover:underline">
                {(p as any).title}
              </div>
            </a>
          );
        })}
      </div>
    </div>
  </section>
) : null}




        {/* BlogPosting JSON-LD */}
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </article>
    </main></div>
  );
}
