import type { ReactNode } from "react";
import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/serverAdmin";
import MarketingLayout from "@/components/layout/MarketingLayout";

/**
 * Marketing group layout: wraps all pages under app/(marketing)
* Adds tenant-aware default SEO (wildcard "*") merged from tenant_seo.
 */
 export async function generateMetadata() {
  const hdrs = await headers();
   const rawHost = (hdrs.get("x-forwarded-host") || hdrs.get("host") || "").toLowerCase();
 const host = rawHost.split(":")[0]; // strip port in dev

  // 1) Resolve tenant via tenant_domains(host) -> tenants(id, code, locale)
  const { data: dom } = await supabaseAdmin
    .from("tenant_domains")
    .select("tenant_id, host")
    .eq("host", host)
   .maybeSingle();

  if (!dom) {
   // No mapping -> return empty so page-level metadata stays intact
    return {};
   }

 const { data: ten } = await supabaseAdmin
   .from("tenants")
     .select("id, code, locale")
   .eq("id", dom.tenant_id)
     .maybeSingle();

  const tenant_code = ten?.code ?? "";
  const locale = (ten?.locale as string | null) ?? "";

   if (!tenant_code || !locale) {
     return {};
  }

 // 2) Fetch wildcard/default SEO for this tenant+locale
  const { data: rows } = await supabaseAdmin
     .from("tenant_seo")
     .select("route, title, description, keywords, og_image_url, jsonld, is_active")
    .eq("tenant_code", tenant_code)
    .eq("locale", locale);

 // Choose the most generic record that won't conflict with page-level SEO:
   // Prefer "*" (global). Avoid forcing "/" on non-home subpages.
   const wildcard = (rows || []).find(r => r.route === "*" && r.is_active);

  if (!wildcard) {
    return {};
   }

   const md: any = {};
  if (wildcard.title) md.title = wildcard.title;
if (wildcard.description) md.description = wildcard.description;
  if (Array.isArray(wildcard.keywords) && wildcard.keywords.length) {
    md.keywords = wildcard.keywords;
   }
   if (wildcard.og_image_url) {
     md.openGraph = {
      images: [{ url: wildcard.og_image_url }],
     };
    // Keep other OpenGraph fields from parent/page; only add image here.
  }
 
   // Do not inject JSON-LD from layout to avoid duplication.
 // Page-level implementations can include JSON-LD as needed.
 
  return md;
 }
 
 /**
  * This layout wraps every page under app/(marketing) with the shared MarketingLayout,
 * which already includes the sticky Header and Footer. No need to import Header per page.
  */
 export default async function MarketingGroupLayout({ children }: { children: ReactNode }) {
  return <MarketingLayout>{children}</MarketingLayout>;
 }
