// components/blog/LatestThree.tsx
export const runtime = "nodejs";

import Link from "next/link";
import SupaImage from "@/components/blog/SupaImage";
import { supabaseServer } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/tenant/current";
import { getTranslations } from "next-intl/server";
// Supabase public URL resolver (tam URL ise aynen döner; değilse public bucket yolu kurar)
function resolvePublicUrl(path?: string | null) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
  const clean = String(path).replace(/^\/+/, "");
  const [first, ...rest] = clean.split("/");
  const known = new Set(["authors", "workers-cv", "blog"]);
  const bucket = known.has(first) ? first : "blog";
  const key = known.has(first) ? rest.join("/") : clean;
  return base
    ? `${base}/storage/v1/object/public/${bucket}/${key}`
    : `/storage/v1/object/public/${bucket}/${key}`;
}

export default async function LatestThree() {
  const supa = await supabaseServer();
  const activeTenantId = await getCurrentTenantId();
const t = await getTranslations("LatestThree");
  // Aktif tenant veya global (NULL) + yayımlanmış + en yeni 3 yazı
  let q = supa
    .from("blog_posts")
    .select("id, slug, title, summary, cover_image_path, published_at")
    .eq("status", "published")
    .lte("published_at", new Date().toISOString())
    .order("published_at", { ascending: false })
    .limit(3);

  if (activeTenantId) {
    q = q.or(`tenant_id.eq.${activeTenantId},tenant_id.is.null`);
  } else {
    // Tenant yoksa sadece global (NULL) yazıları al
    q = q.is("tenant_id", null);
  }

  const { data: posts, error } = await q;
  if (error || !posts || posts.length === 0) {
    return null; // Gösterilecek içerik yoksa bölümü gizle
  }

  return (
    <section className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">{t("heading")}</h2>

      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((p) => {
          const img = resolvePublicUrl(p.cover_image_path) || undefined;
          return (
            <article
              key={p.id}
              className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden"
            >

  {img && (
   <Link href={`/blog/${p.slug}`}>
   <SupaImage
      src={img}
      alt={p.title || t("coverAlt")}
    width={640}
       height={250}
     className="h-40 w-full object-contain bg-slate-50"
      priority={false}
   />
   </Link>
  )}


              <div className="p-4">
                <h3 className="line-clamp-2 text-base font-semibold">
                  <Link href={`/blog/${p.slug}`} className="hover:underline">
                    {p.title}
                  </Link>
                </h3>
                {p.summary && (
                  <p className="mt-2 line-clamp-3 text-sm text-gray-600">
                    {p.summary}
                  </p>
                )}
                <div className="mt-4">
                  <Link
                    href={`/blog/${p.slug}`}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    {t("readMore")}
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="mt-6 text-right">
        <Link
          href="/blog"
          className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          {t("viewAll")}
        </Link>
      </div>
    </section>
  );
}
