import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { resolveTenantFromHeaders } from "@/lib/tenant/resolve";
import { supabaseAdmin } from "@/lib/supabase/admin";
export const dynamic = "force-dynamic";
async function getServerClient() {
  const mod = await import("@/lib/supabase/server");
  const supabaseServer = mod.supabaseServer as () => Promise<any>;
 if (typeof supabaseServer !== "function") {
     throw new Error("supabaseServer not found");
 }
   return await supabaseServer();
 }

async function resolveTenantIdFromHost(): Promise<string | null> {
  const h = await headers();
  const host = (h.get("x-forwarded-host") || h.get("host") || "").toLowerCase();
  if (!host) return null;

  // Service role ile RLS'e takılmadan host→tenant eşleşmesi
  const admin = supabaseAdmin;
  const { data } = await admin
    .from("tenant_domains")
    .select("tenants!inner(id), host")
    .eq("host", host)
    .limit(1)
    .maybeSingle();

  // tenant_domains.tenants.id dönerse al; yoksa null
  // @ts-ignore – tip sadeleştirildi
  return data?.tenants?.id || null;
}

async function getBaseUrl() {
  const h = await headers();
  const host = (h.get("x-forwarded-host") || h.get("host") || "").toLowerCase();
  const proto = (h.get("x-forwarded-proto") || "https").toLowerCase();
  if (!host) return "https://gumruk360.com";
  const isLocal = host.includes("localhost") || host.includes("127.0.0.1") || host.endsWith(".local");
  return `${isLocal ? "http" : proto}://${host}`;
}
async function resolveHostTenantId(): Promise<string | null> {
 const h = await headers();
  const host = (h.get("x-forwarded-host") || h.get("host") || "").split(":")[0];
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

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
 const t = await resolveTenantFromHeaders();
  const base = t.baseUrl;
const hostTenantId = await resolveHostTenantId();
  // Minimal skeleton — expand with real routes (ISR/SSG) later
  const now = new Date();

   // Blog yazılarını doğrudan DB'den çek (RLS: published & published_at not null)
  let blogUrls: MetadataRoute.Sitemap = [];
  try {
     const sb = await getServerClient();
    // Not: tenant/lang kısıtını eklemek istersen headers() ile tespit edip .or(...) kullan
   let q = sb
     .from("blog_posts")
      .select("slug, published_at, updated_at, created_at, status, tenant_id, lang")
       .eq("status", "published")
      .not("published_at", "is", null);

     // Tenant: (tenant_id IS NULL) OR (tenant_id = hostTenantId)
     if (hostTenantId) {
       q = q.or(`tenant_id.is.null,tenant_id.eq.${hostTenantId}`);
     } else {
       q = q.is("tenant_id", null);
     }
 
     q = q.order("published_at", { ascending: false }).limit(500);
    const { data } = await q;
     const rows = Array.isArray(data) ? data : [];
     blogUrls = rows
       .filter((p: any) => p?.slug)
       .map((p: any) => ({
         url: `${base}/blog/${p.slug}`,
        lastModified: new Date(p.published_at || p.updated_at || p.created_at || now),
        changeFrequency: "weekly" as const,
        priority: 0.7,
      }));
 } catch {}


  // News (site_news) – published & date koşulları
 let newsUrls: MetadataRoute.Sitemap = [];
  try {
    const sb = await getServerClient();
    let nq = sb
      .from("site_news")
      .select("slug, published_at, updated_at, created_at, is_published, tenant_id")
      .eq("is_published", true)
      .not("published_at", "is", null)
      .lte("published_at", new Date().toISOString())
      .or("expires_at.is.null,expires_at.gt.now()");

    // BLOG ile aynı tenant davranışı:
    // hostTenantId varsa: (tenant_id IS NULL) OR (tenant_id = hostTenantId)
    // yoksa: yalnızca tenant_id IS NULL
    if (hostTenantId) {
      nq = nq.or(`tenant_id.is.null,tenant_id.eq.${hostTenantId}`);
    } else {
      nq = nq.is("tenant_id", null);
    }

    const { data: nrows } = await nq;
    newsUrls = (Array.isArray(nrows) ? nrows : [])
      .filter((r: any) => r?.slug)
      .map((r: any) => ({
        url: `${base}/news/${r.slug}`,
        lastModified: new Date(r.published_at || r.updated_at || r.created_at || now),
        changeFrequency: "weekly" as const,
        priority: 0.7,
      }));
 } catch {}


  const routes: MetadataRoute.Sitemap = [
    {
      url: `${base}/`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1.0,
    },
     {
       url: `${base}/blog`,
      lastModified: now,
      changeFrequency: "hourly",
      priority: 0.8,
    },
	     {
       url: `${base}/news`,
      lastModified: now,
      changeFrequency: "hourly",
      priority: 0.8,
    },
	 {
      url: `${base}/about`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${base}/contact`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },

    {
      url: `${base}/legal/privacy`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${base}/legal/terms`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
	    {
      url: `${base}/legal/cookies`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
		    {
      url: `${base}/how-it-works/individual`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
		    {
      url: `${base}/how-it-works/corporate`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
	...newsUrls,
	...blogUrls,
  ];

  return routes;
}
