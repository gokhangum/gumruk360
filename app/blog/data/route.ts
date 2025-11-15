export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { headers } from "next/headers";
import { resolveTenantFromHeaders } from "@/lib/tenant/resolve";

/** Projedeki admin client export adını güvenle resolve eder */
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

// rss.xml/route.ts ile aynı tenant eşleme: header'daki host'u bire bir eşle
async function resolveHostTenantId(db: any): Promise<string | null> {
  const h = await headers();
  const host = (h.get("x-forwarded-host") || h.get("host") || "")
    .split(":")[0]
    .toLowerCase();
  if (!host) return null;

  const { data, error } = await db
    .from("tenant_domains")
    .select("tenant_id")
    .eq("host", host)
    .maybeSingle();

  if (error) {
    console.error("[blog/data] tenant_domains lookup error:", error);
    return null;
  }
  return data?.tenant_id ?? null;
}

export async function GET(req: Request) {
  try {
    const admin = await getAdminClient();

    // Base URL ve locale için resolveTenantFromHeaders (rss ile aynı kaynak)
    const tctx = await resolveTenantFromHeaders();
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim();
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 100);

    const hostTenantId = await resolveHostTenantId(admin);

    let qb = admin
      .from("blog_posts")
      .select("slug, title, summary, published_at, updated_at, status, tenant_id")
      .not("published_at", "is", null)
      // (tenant_id IS NULL) ∪ (tenant_id = hostTenantId) — rss ile aynı
      .or(hostTenantId ? `tenant_id.is.null,tenant_id.eq.${hostTenantId}` : "tenant_id.is.null")
      .order("published_at", { ascending: false })
      .limit(limit);

    if (q.length >= 3) {
      const qParam = q.replace(/[%_]/g, ""); // basic sanitize
      qb = qb.or(
        `title.ilike.*${qParam}*,summary.ilike.*${qParam}*,slug.ilike.*${qParam}*`
      );
    }

    const { data, error } = await qb;
    if (error) {
      console.error("[blog/data] blog_posts query error:", error);
      return new Response(
        JSON.stringify({ items: [], total: 0, error: "query_failed" }),
        { status: 500, headers: { "Content-Type": "application/json; charset=utf-8" } }
      );
    }

    const rows = Array.isArray(data) ? data : [];
    return new Response(
      JSON.stringify({
        items: rows.map((p: any) => ({
          slug: p.slug,
          title: p.title,
          summary: p.summary,
          published_at: p.published_at,
          updated_at: p.updated_at,
          status: p.status,
          tenant_id: p.tenant_id,
          // frontend base url için istenirse:
          baseUrl: tctx.baseUrl,
        })),
        total: rows.length,
      }),
      { headers: { "Content-Type": "application/json; charset=utf-8" } }
    );
  } catch (err) {
    console.error("[blog/data] handler error:", err);
    return new Response(
      JSON.stringify({ items: [], total: 0, error: "server_error" }),
      { status: 500, headers: { "Content-Type": "application/json; charset=utf-8" } }
    );
  }
}
