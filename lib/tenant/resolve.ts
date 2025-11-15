// lib/tenant/resolve.ts
import { headers } from "next/headers";

type TenantRow = {
  id: string;
  code: string | null;
  primary_domain: string | null;
  default_lang: string | null;
};

export type TenantCtx = {
  tenantId: string | null;
  code: string | null;
  lang: string;           // "tr-TR" gibi
  host: string;
  baseUrl: string;        // https://<host>
  primaryBaseUrl: string; // https://<primary_domain> (yoksa baseUrl)
};

 async function supabaseServerClient() {
   const { supabaseServer } = await import("@/lib/supabase/server");
  return await supabaseServer();
 }


export async function resolveTenantFromHeaders(): Promise<TenantCtx> {
  const h = await headers();
  const host = (h.get("x-forwarded-host") || h.get("host") || "").toLowerCase();
  const proto = (h.get("x-forwarded-proto") || "https").toLowerCase();
  const isLocal = host.includes("localhost") || host.includes("127.0.0.1") || host.endsWith(".local");
  const baseUrl = `${isLocal ? "http" : proto}://${host}`;

  // host -> tenant_domains -> tenants
  const sb = await supabaseServerClient();
  const { data: td } = await sb
    .from("tenant_domains")
    .select("tenant_id, host")
    .eq("host", host)
    .maybeSingle();

  let tenant: TenantRow | null = null;
  if (td?.tenant_id) {
    const { data } = await sb
      .from("tenants")
      .select("id, code, primary_domain, default_lang")
      .eq("id", td.tenant_id)
      .maybeSingle();
    tenant = (data as any) || null;
  }

  const lang = tenant?.default_lang || "tr-TR";
  const primaryBaseUrl =
    tenant?.primary_domain ? `${proto}://${tenant.primary_domain}` : baseUrl;

  return {
    tenantId: tenant?.id || null,
    code: tenant?.code || null,
    lang,
    host,
    baseUrl,
    primaryBaseUrl,
  };
}
