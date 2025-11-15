import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { resolveTenantFromHeaders } from "@/lib/tenant/resolve";
export const dynamic = "force-dynamic";

async function getBaseUrl() {
 const h = await headers();
  const host = (h.get("x-forwarded-host") || h.get("host") || "").toLowerCase();
  const proto = (h.get("x-forwarded-proto") || "https").toLowerCase();
  if (!host) return "https://gumruk360.com";
  // Prefer http for localhost
  const isLocal = host.includes("localhost") || host.includes("127.0.0.1") || host.endsWith(".local");
  return `${isLocal ? "http" : proto}://${host}`;
}
 
 function isStagingHost(host: string) {
   const h = host.toLowerCase();
 return (
  h.includes("localhost") ||
  h.includes("127.0.0.1") ||
  h.endsWith(".local") ||
  h.endsWith(".vercel.app") ||
  h.endsWith(".netlify.app") ||
  h.startsWith("staging.")
);
 }
 
 export default async function robots(): Promise<MetadataRoute.Robots> {
  const t = await resolveTenantFromHeaders();
  const base = t.baseUrl;
  const host = t.host;
 
   // Ortak engeller (prod/dev)
   const disallowCommon = [
   "/api",
   "/admin",
  "/worker",
  "/dashboard",
  "/editor",
   "/ask/checkout",
  "/blog/_data",
  "/storage",
  "/assets",
   "/_next",
  "/static",
   ];
 
   const staging = isStagingHost(host);
 
  // Global no-index bayrağı (Vercel ENV)
  const noindex =
    process.env.disable_indexing === "1" || process.env.DISABLE_INDEXING === "1";

  if (noindex || staging) {
    // Tamamen kapat (disallow all)
    return {
      rules: [{ userAgent: "*", disallow: ["/"] }],
      sitemap: `${t.primaryBaseUrl}/sitemap.xml`,
      host: t.primaryBaseUrl,
    };
  }

  // PROD/DEV: site açık, bazı yollar yasak
  return {
    rules: [{ userAgent: "*", allow: ["/"], disallow: disallowCommon }],
    sitemap: `${t.primaryBaseUrl}/sitemap.xml`,
    host: t.primaryBaseUrl,
  };
}


