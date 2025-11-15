// lib/tenant/current.ts
import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Production proxy/CDN'lerde host bilgisi `x-forwarded-host` ile gelir.
 * Next.js 15+ 'headers()' artık async kabul edilir -> 'await headers()' zorunlu.
 */
export async function getCurrentTenantId(): Promise<string | null> {
  const hdrs = await headers(); // <-- IMPORTANT
  const host = hdrs.get("x-forwarded-host") || hdrs.get("host") || "";
  if (!host) return null;

  const domain = host.split(":")[0].toLowerCase();

  // Burada kendi şemanıza göre domain -> tenant eşlemesi yapın.
  // Aşağıdaki örnek, tenant_domains(domain)->tenant_id ve tenants(primary_domain) varsayar.
const { data, error } = await supabaseAdmin
    .from("tenant_domains")
    .select("tenant_id")
    .eq("host", domain)
    .maybeSingle();

  if (error) {
    // Sessizce null döndür; index sayfalarında global içerik gösterilebilir.
    return null;
  }
  return (data as any)?.tenant_id ?? null;
}
