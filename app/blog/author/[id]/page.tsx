export const runtime = "nodejs";
 
import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/tenant/current";
 import { supabaseAdmin } from "@/lib/supabase/admin";
 import { getTranslations, getLocale } from "next-intl/server";
function resolvePublicUrl(path?: string | null) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
  const clean = String(path).replace(/^\/+/, "");
  const [first, ...rest] = clean.split("/");
  const known = new Set(["authors", "workers-cv", "blog"]);
  const bucket = known.has(first) ? first : "blog";
  const key = known.has(first) ? rest.join("/") : clean;
  return base ? `${base}/storage/v1/object/public/${bucket}/${key}` : `/storage/v1/object/public/${bucket}/${key}`;
}

async function getAuthorInfo(id: string) {
const admin = typeof supabaseAdmin === "function" ? await (supabaseAdmin as any)() : supabaseAdmin;

  // Önce authors
  const { data: a } = await admin
    .from("blog_authors")
    .select("id, name, title, avatar_path")
    .eq("id", id)
    .maybeSingle();

  if (a) {
    return {
      id: a.id,
      name: a.name || "—",
      title: a.title || "",
      avatar: resolvePublicUrl(a.avatar_path),
    };
  }

  // Yoksa profiles
 const { data: p } = await admin
  .from("worker_cv_profiles")
  .select("worker_user_id, display_name, title, photo_object_path, title_tr, title_en")
  .eq("worker_user_id", id)
  .maybeSingle();

if (p) {
  return {
    id, // route param (author_id = profiles.id) ile eşleşen user id
    name: p.display_name || "—",
    title: p.title || "",
    avatar: resolvePublicUrl(p.photo_object_path),
  };
}

  return null;
}

async function getAuthorPosts(id: string, tenantId: string | null) {
  const supa = await supabaseServer();
   const { data, error } = await supa
    .from("blog_posts")
     .select("id, slug, title, summary, lang, status, cover_image_path, published_at, updated_at, created_at")
     .eq("author_id", id)
     .eq("status", "published")
    .or(tenantId ? `tenant_id.is.null,tenant_id.eq.${tenantId}` : "tenant_id.is.null")
    .order("published_at", { ascending: false })
     .limit(60);
  if (error) return [];
  return data ?? [];
}

export default async function AuthorPostsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

   const tenantId = await getCurrentTenantId();
 
  const [authorRaw, posts] = await Promise.all([
    getAuthorInfo(id),
    getAuthorPosts(id, tenantId),
  ]);

const author = authorRaw ?? { id, name: "—", title: "", avatar: null as string | null };
const t = await getTranslations("AuthorPosts");
const locale = await getLocale();
  return (

  <div className="px-3 md:px-5 pt-2 md:pt-3 pb-3 md:pb-5">
    <div className="card-surface shadow-colored rounded-xl">
        <div className="px-1 py-1 border-b border-slate-100">
        <div className="flex items-center justify-between">
    <main className="max-w-5xl mx-auto p-4 md:p-1">
        <h1 className="text-2xl md:text-3xl font-semibold mb-5">
   {author?.name ? t("headingByAuthor", { name: author.name }) : t("headingAll")}
  </h1>

      <div className="grid gap-4">
        {posts.map((p: any) => {
          const cover = resolvePublicUrl(p.cover_image_path);
          const when =
            p.published_at || p.updated_at || p.created_at || null;
          return (
            <article
              key={p.id}
              className="rounded-2xl border border-gray-200 bg-white p-4 md:p-5 shadow-sm"
            >
              <div className="flex gap-4">
                {cover ? (
                  <img
                    src={cover}
                    alt={t("coverAlt")}
                    className="w-32 h-20 md:w-40 md:h-24 object-cover rounded-lg border"
                  />
                ) : null}
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/blog/${p.slug}`}
                    className="text-lg md:text-xl font-semibold hover:underline"
                  >
                    {p.title || "—"}
                  </Link>
             <div className="mt-1 text-sm text-gray-500">
  {when ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(when)) : ""}
   </div>
                  {p.summary ? (
                    <p className="mt-2 text-sm text-gray-700 line-clamp-3">
                      {p.summary}
                    </p>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}

        {posts.length === 0 ? (
          <div className="text-sm text-gray-500">{t("noPosts")}</div>
        ) : null}
      </div>
    </main></div></div></div></div>
  );
}
