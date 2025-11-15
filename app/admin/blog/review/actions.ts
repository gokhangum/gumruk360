"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { supabaseServer } from "../../../../lib/supabase/server";
/** Resolve a Supabase admin client across project variants */
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

type Status =
  | "in_review"
  | "scheduled"
  | "draft"
  | "published"
  | "archived";

type ReviewFilters = {
  lang?: string;
  tenant?: string;
  status?: Status | "all" | "";
  q?: string;
  from?: string;
  to?: string;
};

export async function listReviewPosts(filters: ReviewFilters = {}) {
  const sb = await getAdminClient();
  // SAFE column set
  let q = sb
    .from("blog_posts")
    .select("id, slug, lang, title, status, scheduled_at, updated_at, created_at")
    .order("updated_at", { ascending: false })
    .limit(500);

  const status = (filters.status === "all" || filters.status === "") ? undefined : filters.status;

  if (status) q = q.eq("status", status);
  if (filters.lang)   q = q.eq("lang", filters.lang);
  // tenant best-effort
    // Tenant filtresi (UUID ise tenant_id; değilse code/primary_domain'dan id çöz)
  if (filters.tenant) {
    const t = String(filters.tenant).trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(t);
    let tenantId = isUuid ? t : undefined;
    if (!tenantId) {
      const { data: tRow } = await sb
        .from("tenants")
        .select("id")
        .or(`code.eq.${t},primary_domain.eq.${t}`)
        .maybeSingle();
      tenantId = tRow?.id;
    }
    if (tenantId) {
      q = q.eq("tenant_id", tenantId);
    }
    // tenantId bulunamazsa filtre uygulamıyoruz (hata yerine boş sonuç riskini azaltır)
  }
   if (filters.q && filters.q.trim() !== "") {
    const term = filters.q.trim().replaceAll(",", " "); // or() ayracı virgül; bozmasın
    q = q.or(`title.ilike.%${term}%,slug.ilike.%${term}%`);
  }
  if (filters.from)   q = q.gte("updated_at", filters.from);
  if (filters.to)     q = q.lte("updated_at", filters.to);

  const { data, error } = await q;
  if (error) {
   console.error("listReviewPosts error:", {
      message: (error as any)?.message,
      details: (error as any)?.details,
      hint: (error as any)?.hint,
      code: (error as any)?.code,
    });
    return [];
  }
  return data || [];
}

function revalidateAll(slug?: string) {
  revalidateTag("blog");
  revalidatePath("/blog");
  if (slug) revalidatePath(`/blog/${slug}`);
  revalidatePath("/sitemap-blog.xml");
  revalidatePath("/blog/rss");
}

export async function publishOne(id: string, slug: string) {
  const sb = await supabaseServer();
  const { error } = await sb.rpc("fn_blog_admin_publish", { p_id: id, p_published_at: null });
  if (error) throw new Error(error.message || JSON.stringify(error));
  revalidateAll(slug);
  return { ok: true };
}

export async function archiveOne(id: string) {
  const sb = await supabaseServer();
  const { error } = await sb.rpc("fn_blog_admin_archive", { p_id: id });
  if (error) throw new Error(error.message || JSON.stringify(error));
  revalidateAll();
  return { ok: true };
}

export async function scheduleOne(id: string, isoDate: string) {
  const when = isoDate || new Date(Date.now() + 60_000).toISOString();
  const sb = await supabaseServer();
  const { error } = await sb.rpc("fn_blog_admin_schedule", { p_id: id, p_scheduled_at: when });
  if (error) throw new Error(error.message || JSON.stringify(error));
  revalidateAll();
  return { ok: true, scheduled_at: when };
}
export async function unpublishToReviewOne(id: string) {
  const sb = await supabaseServer();
  const { error } = await sb.rpc("fn_blog_admin_unpublish_to_review", { p_id: id });
  if (error) throw new Error(error.message || JSON.stringify(error));
  revalidateAll();
  return { ok: true };
}
export async function deleteOne(id: string) {
 const sb = await supabaseServer();
  try {
    const { error } = await sb.rpc("fn_blog_admin_delete", { p_post_id: id });
    if (!error) { revalidateAll(); return { ok: true }; }
  } catch {}
  const { error } = await sb.from("blog_posts").delete().eq("id", id);
  if (error) throw new Error(error.message || JSON.stringify(error));
  revalidateAll();
  return { ok: true };
}

/** ---- MISSING BULK EXPORTS (restored) ---- */
export async function bulkPublish(ids: string[], slugs?: string[]) {
  const sb = await supabaseServer();
  for (const id of ids) {
    const { error } = await sb.rpc("fn_blog_admin_publish", { p_id: id, p_published_at: null });
    if (error) throw new Error(error.message || JSON.stringify(error));
  }
  revalidateAll();
  return { ok: true, count: ids.length };
}

export async function bulkArchive(ids: string[]) {
  const sb = await supabaseServer();
  for (const id of ids) {
    const { error } = await sb.rpc("fn_blog_admin_archive", { p_id: id });
    if (error) throw new Error(error.message || JSON.stringify(error));
  }
  revalidateAll();
  return { ok: true, count: ids.length };
}
export async function bulkUnpublishToReview(ids: string[]) {
  const sb = await supabaseServer();
  for (const id of ids) {
    const { error } = await sb.rpc("fn_blog_admin_unpublish_to_review", { p_id: id });
    if (error) throw new Error(error.message || JSON.stringify(error));
  }
  revalidateAll();
  return { ok: true, count: ids.length };
}
export async function bulkSchedule(ids: string[], isoDate: string) {
  const when = isoDate || new Date(Date.now() + 60_000).toISOString();
  const sb = await supabaseServer();
  for (const id of ids) {
    const { error } = await sb.rpc("fn_blog_admin_schedule", { p_id: id, p_scheduled_at: when });
    if (error) throw new Error(error.message || JSON.stringify(error));
  }
  revalidateAll();
  return { ok: true, count: ids.length, scheduled_at: when };
}
