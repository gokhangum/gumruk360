// app/rss.xml/route.ts
export const runtime = "nodejs";
import { resolveTenantFromHeaders } from "@/lib/tenant/resolve";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
async function getServerClient() {
  const mod = await import("@/lib/supabase/server");
  if (typeof mod.supabaseServer === "function") return await mod.supabaseServer();
  if (mod.supabaseServer) return mod.supabaseServer;
  throw new Error("supabaseServer not found");
}
/** Projedeki admin client export adını otomatik çözer */
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
 async function resolveHostTenantId(db: any): Promise<string | null> {
   const h = await headers();
   const host = (h.get("x-forwarded-host") || h.get("host") || "").split(":")[0].toLowerCase();
   if (!host) return null;
 
   const { data, error } = await db
     .from("tenant_domains")
     .select("tenant_id")
     .eq("host", host)
     .maybeSingle();
 
   if (error) {
     console.error("[rss] tenant_domains lookup error:", error);
     return null;
   }
   return data?.tenant_id ?? null;
 }

export async function GET() {
  const t = await resolveTenantFromHeaders();
  const tRss = await getTranslations("rss");
  const db = await getAdminClient();
  // Host'tan tenant_id çöz; yerelde prod hosta map et
const base = t.baseUrl;
const hostTenantId = await resolveHostTenantId(db);

  const { data: rows } = await db
    .from("blog_posts")
    .select("slug, title, summary, published_at, updated_at, created_at, tenant_id, status")
    .eq("status", "published")
    .not("published_at", "is", null)
.or(hostTenantId ? `tenant_id.is.null,tenant_id.eq.${hostTenantId}` : "tenant_id.is.null")
    .order("published_at", { ascending: false })
    .limit(50);

  const items = (rows || []).map((p: any) => {
   const url = `${base}/blog/${p.slug}`;
    const pub = new Date(p.published_at || p.updated_at || p.created_at || Date.now()).toUTCString();
    return `<item>
<title><![CDATA[${p.title}]]></title>
<link>${url}</link>
<guid>${url}</guid>
<description><![CDATA[${p.summary || ""}]]></description>
<pubDate>${pub}</pubDate>
</item>`;
  }).join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>${tRss("title")}</title>
<link>${base}</link>
<description>${tRss("description")}</description>
${items}
</channel>
</rss>`;

  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" }});
}
