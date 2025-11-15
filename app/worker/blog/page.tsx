export const runtime = "nodejs";

import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "../../../lib/supabase/server";
import { getTranslations } from "next-intl/server";
/** Aktif worker'ın profile.id'sini bulur (id ya da user_id eşleşmesi) */
async function getMyAuthorId(): Promise<string | null> {
  const supabase = await supabaseServer();
  const { data: u } = await supabase.auth.getUser();
  const uid = u?.user?.id ?? null;
  if (!uid) return null;

  // 1) En yaygın kurulum: profiles.id = auth.uid
  {
    const { data, error } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", uid)
      .limit(1)
      .maybeSingle();

    if (!error && data?.id) return data.id as string;
  }

  // 2) Alternatif: profiles.user_id = auth.uid (bazı şemalarda böyle tutulur)
  {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, user_id")
      .eq("user_id", uid)
      .limit(1)
      .maybeSingle();

    if (!error && data?.id) return data.id as string;
  }

  // 3) Son çare: auth uid'i profil id'si olarak varsay (çoğu Supabase starter'ında böyle)
  return uid;
}

/** Çalışan kullanıcının "yazar olduğu" yazıları getirir */
async function getMyAuthorPosts() {
  const supabase = await supabaseServer();

  // Kimlik kontrolü
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user?.id) redirect("/login");

  const authorId = await getMyAuthorId();
  if (!authorId) return [];

  // Sadece bu worker'ın yazar olduğu yazılar
  const { data, error } = await supabase
    .from("blog_posts")
    .select("id, title, lang, status, updated_at, published_at, created_at, slug")
    .eq("author_id", authorId)
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) {
    // prod'da loglanabilir
    return [];
  }
  return data ?? [];
}

function fmtDate(d?: string | null) {
  if (!d) return "-";
  try {
    const dt = new Date(d);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const day = String(dt.getDate()).padStart(2, "0");
    const hh = String(dt.getHours()).padStart(2, "0");
    const mm = String(dt.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${day} ${hh}:${mm}`;
  } catch {
    return d;
  }
}

function StatusBadge({
  status,
  labels,
}: {
  status?: string | null;
  labels: Record<string, string>;
}) {
  const s = (status || "").toLowerCase();
  const color =
    s === "published" ? "bg-emerald-100 text-emerald-800 border-emerald-200" :
    s === "scheduled" ? "bg-violet-100 text-violet-800 border-violet-200" :
    s === "in_review" ? "bg-amber-100 text-amber-800 border-amber-200" :
    s === "draft" ? "bg-gray-100 text-gray-800 border-gray-200" :
    s === "archived" ? "bg-red-100 text-red-800 border-red-200" :
    "bg-gray-100 text-gray-800 border-gray-200";
  const label =
    s === "published" ? labels["published"] :
    s === "scheduled" ? labels["scheduled"] :
    s === "in_review" ? labels["in_review"] :
    s === "draft" ? labels["draft"] :
    s === "archived" ? labels["archived"] : (status || "-");

  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}

export default async function WorkerBlogListPage() {
  const posts = await getMyAuthorPosts();
const t = await getTranslations("WorkerBlogList");

// Status etiketleri için i18n haritası:
const statusLabels: Record<string, string> = {
  published: t("status.published"),
  scheduled: t("status.scheduled"),
  in_review: t("status.in_review"),
  draft: t("status.draft"),
  archived: t("status.archived"),
};
  return (
  <div className="bg-gradient-to-b from-white to-slate-0 py-1">
  <div className="px-3 md:px-5 pt-2 md:pt-3 pb-3 md:pb-5">
    <div className="card-surface shadow-colored rounded-xl">
        <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("heading")}</h1>
        <Link
          href="/worker/blog/new"
          className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 text-sm"
        >
           {t("newPost")}
        </Link>
      </div></div></div>

      <div className="rounded-2xl border border-gray-200 shadow-sm bg-white overflow-hidden mt-3 md:mt-4">
      {/* === Mobile stacked list === */}
      <div className="md:hidden">
      {posts.length === 0 ? (
          <div className="px-4 py-8 text-sm text-gray-500 text-center">{t("empty")}</div>
         ) : (
           posts.map((p) => {
            const updated = p.updated_at || p.published_at || p.created_at || null;
            const canViewPublic = Boolean(p.slug);
             return (
              <div key={p.id} className="border-b px-4 py-3">
                {/* Başlık + slug */}
               <div className="text-sm font-medium text-gray-900 break-words">{p.title || "-"}</div>
                <div className="text-xs text-gray-500 break-all">{p.slug ? `/blog/${p.slug}` : ""}</div>
 
                {/* Dil */}
               <div className="mt-2 flex items-center gap-2">
                 <span className="text-[11px] text-slate-500">{t("thLang")}</span>
                  <span className="text-sm">{p.lang || "-"}</span>
                 </div>

              {/* Durum */}
                <div className="mt-1 flex items-center gap-2">
                 <span className="text-[11px] text-slate-500">{t("thStatus")}</span>
                 <span className="text-sm"><StatusBadge status={p.status} labels={statusLabels} /></span>
                </div>

                {/* Güncelleme */}
               <div className="mt-1 flex items-center gap-2">
                  <span className="text-[11px] text-slate-500">{t("thUpdated")}</span>
                 <span className="text-sm">{fmtDate(updated)}</span>
               </div>
 
                {/* Aksiyonlar */}
                <div className="mt-2 flex flex-wrap gap-2">
                   <Link
                     href={canViewPublic ? `/blog/${p.slug}` : "#"}
                     className={`rounded-lg border px-3 py-1.5 text-xs md:text-sm ${
                     canViewPublic
                        ? "border-gray-200 hover:bg-gray-50 text-gray-700"
                        : "border-gray-200 text-gray-400 pointer-events-none"
                    }`}
                   >
                   {t("btnPublicView")}
                 </Link>
                  <Link
                    href={`/worker/blog/${p.id}/edit`}
                    className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 text-xs md:text-sm"
                 >
                    {t("btnEdit")}
                  </Link>
                </div>
              </div>
             );
          })
         )}
      </div>

      {/* === Desktop table (unchanged) === */}
      <div className="hidden md:block">
       <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left text-sm font-semibold text-gray-700">
              <th className="px-4 py-3">{t("thTitle")}</th>
           <th className="px-4 py-3 w-28">{t("thLang")}</th>
              <th className="px-4 py-3 w-36">{t("thStatus")}</th>
              <th className="px-4 py-3 w-44">{t("thUpdated")}</th>
              <th className="px-4 py-3 w-52 text-right">{t("thActions")}</th>
           </tr>
         </thead>
         <tbody className="divide-y divide-gray-100">
           {posts.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-sm text-gray-500 text-center">
               {t("empty")}
             </td>
               </tr>
            ) : (
              posts.map((p) => {
                const updated = p.updated_at || p.published_at || p.created_at || null;
                const canViewPublic = Boolean(p.slug);
               return (
                 <tr key={p.id} className="text-sm">
                   <td className="px-4 py-3">
                     <div className="font-medium text-gray-900 max-w-[28rem] line-clamp-2 break-words">{p.title || "-"}</div>
                     
                   </td>
                    <td className="px-4 py-3">{p.lang || "-"}</td>
                   <td className="px-4 py-3">
                     <StatusBadge status={p.status} labels={statusLabels} />
                     </td>
                  <td className="px-4 py-3">{fmtDate(updated)}</td>
                    <td className="px-4 py-3">
                     <div className="flex items-center justify-end gap-2">
                     <Link
                          href={canViewPublic ? `/blog/${p.slug}` : "#"}
                         className={`rounded-lg border px-3 py-1.5 text-sm ${
                           canViewPublic
                             ? "border-gray-200 hover:bg-gray-50 text-gray-700"
                              : "border-gray-200 text-gray-400 pointer-events-none"
                         }`}
                       >
                          {t("btnPublicView")}
                        </Link>
                        <Link
                          href={`/worker/blog/${p.id}/edit`}
                           className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 text-sm"
                        >
                          {t("btnEdit")}
                       </Link>
                      </div>
                    </td>
                 </tr>
              );
              })
             )}
         </tbody>
       </table>
     </div>

	</div>
    </div>
	</div>

  );
}
