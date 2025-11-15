"use server";

import { headers } from "next/headers";

/** Get a user-scoped Supabase client (RLS on) */
async function getServerClient() {
  // Try both common paths in your project, ama her zaman fonksiyonu çağır
 try {
  const mod = await import("@/lib/supabase/server");
    if (typeof mod.supabaseServer === "function") {
     return await mod.supabaseServer();
 }
  } catch {}
  try {
    const mod = await import("@/lib/supabaseServer");
    if (typeof mod.supabaseServer === "function") {
      return await mod.supabaseServer();
    }
   } catch {}

   throw new Error(
    "Could not resolve supabaseServer() — expected a function export from '@/lib/supabase/server' or '@/lib/supabaseServer'."
  );
 }

type Params = {
  lang?: string;
  tenant?: string;
  tag?: string;
  q?: string;
  page?: number;
  pageSize?: number;
};

/** Public blog listing with robust RPC + fallback */
export async function listPublicPosts(params: Params) {
  const sb = await getServerClient();

  const page = Math.max(1, params.page || 1);
  const pageSize = Math.min(Math.max(params.pageSize || 10, 1), 50);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // Prefer RPC if available
  try {
    const { data, error } = await sb.rpc("fn_blog_list_public", {
      p_lang: params.lang || null,
      p_tenant: params.tenant || null,
      p_tag: params.tag || null,
      p_q: params.q || null,
      p_page: page,
      p_page_size: pageSize,
    });
    if (!error && data) {
      // Expecting shape: { items: [...], total: number }
      if (Array.isArray(data.items) && typeof data.total === "number") {
        return data as any;
      }
      // Some versions may return a flat array; infer total if needed
      if (Array.isArray(data)) {
        return { items: data, total: data.length };
      }
    }
  } catch {}

  // Fallback: direct select from blog_posts (status='published')
  let q = sb
    .from("blog_posts")
    .select("id, slug, lang, title, summary, status, tags, updated_at, created_at", { count: "exact" })
    .eq("status", "published")
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (params.lang)   q = q.eq("lang", params.lang);
  // best-effort tenant filter (either tenant_code or derived from host)
  if (params.tenant) {
    try { q = q.eq("tenant_code", params.tenant); } catch {}
  }
  if (params.tag)    q = q.contains("tags", [params.tag]);
  if (params.q)      q = q.ilike("title", `%${params.q}%`);

  const { data, error, count } = await q;
  if (error && Object.keys(error || {}).length) {
    // graceful empty result on opaque errors
    return { items: [], total: 0 };
  }
  return { items: data || [], total: typeof count === "number" ? count : (data?.length || 0) };
}
