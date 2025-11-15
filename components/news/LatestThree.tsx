// components/news/LatestThree.tsx
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
  const known = new Set(["news", "blog", "authors", "workers-cv"]); // news eklendi
  const bucket = known.has(first) ? first : "news";
  const key = known.has(first) ? rest.join("/") : clean;
  return base
    ? `${base}/storage/v1/object/public/${bucket}/${key}`
    : `/storage/v1/object/public/${bucket}/${key}`;
}

type Props = {
  title?: string; // opsiyonel başlık override; verilmezse i18n'den gelir
};

export default async function LatestThree({ title }: Props) {
  const supa = await supabaseServer();
  const activeTenantId = await getCurrentTenantId();
  const t = await getTranslations("NewsLatestThree");

  // Yayında olan + yayın tarihi şimdi/öncesi + aktif tenant veya global (NULL) + en yeni 3 haber
  let q = supa
    .from("site_news")
    .select("id, slug, title, summary, cover_image_path, published_at, tenant_id")
    .eq("is_published", true)
    .not("published_at", "is", null)
    .lte("published_at", new Date().toISOString())
    .order("published_at", { ascending: false })
    .limit(3);

  if (activeTenantId) {
    q = q.or(`tenant_id.eq.${activeTenantId},tenant_id.is.null`);
  } else {
    // Tenant yoksa sadece global (NULL) haberleri al
    q = q.is("tenant_id", null);
  }

  const { data: posts, error } = await q;
  if (error || !posts || posts.length === 0) {
    return null; // Gösterilecek içerik yoksa bölümü gizle
  }

  return (
    <section className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">{title ?? t("heading")}</h2>
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
  <Link href={`/news/${p.slug}`}>
    <SupaImage
      src={img}
     alt={p.title || t("coverAlt")}
    width={640}
      height={400} // önceki toplam yükseklik korunur
      className="h-64 w-full object-contain bg-gray-50 rounded-t-2xl transition-transform hover:scale-[1.01]"
      priority={false}
     />
   </Link>
 )}


            </article>
          );
        })}
      </div>

      <div className="mt-6 text-right">
        <Link
          href="/news"
          className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          {t("viewAll")}
        </Link>
      </div>
    </section>
  );
}
