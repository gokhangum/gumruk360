// lib/tenant.ts
import { createClient } from "@supabase/supabase-js";
type Code = "tr" | "en";

/** "127.0.0.1:3000" -> "127.0.0.1", "[::1]:3000" -> "::1", "www.site.com" -> "site.com" */
function normalizeHost(input?: string | null): string {
  if (!input) return "";
  let h = input.trim().toLowerCase();

  // IPv6 köşeli ayracı kaldır: "[::1]:3000" -> "::1]:3000"
  if (h.startsWith("[") && h.includes("]")) {
    const end = h.indexOf("]");
    h = h.slice(1, end) + h.slice(end + 1);
  }
// Birden fazla değer geldiyse ilkini al (x-forwarded-host: "a.com, b.com")
  if (h.includes(",")) h = h.split(",")[0].trim();
  // Portu at: "host:3000" -> "host"
  const colon = h.lastIndexOf(":");
  if (colon !== -1) {
    // IPv6 adreslerinde birden çok ":" olabilir; eğer IPv6 değilse ilk ":" porttur.
    // Dev ortamında gelen değer genelde "127.0.0.1:3000" veya "localhost:3000"
    const after = h.slice(colon + 1);
    // numeric ise port varsay
    if (/^\d+$/.test(after)) {
      h = h.slice(0, colon);
    }
  }

  // www. ön ekini kaldır
  if (h.startsWith("www.")) h = h.slice(4);

  // sonda nokta varsa kaldır (DNS FQDN)
  if (h.endsWith(".")) h = h.slice(0, -1);

  return h;
}

/** .env.local içindeki TENANT_HOST_MAP'i sözlüğe çevirir. */
function parseTenantMap(): Record<string, Code> {
  const mapEnv = process.env.TENANT_HOST_MAP ?? "";
  const pairs = mapEnv.split(",").map(s => s.trim()).filter(Boolean);

  const map: Record<string, Code> = {};
  for (const p of pairs) {
    const [rawHost, rawCode] = p.split(":").map(s => (s ?? "").trim());
    if (!rawHost || !rawCode) continue;

    const host = normalizeHost(rawHost);
    const code = rawCode.toLowerCase().startsWith("en") ? "en" : "tr";
    if (host) map[host] = code;
  }
  return map;
}

export function resolveTenantFromHost(host?: string): { code: Code } {
  const normalized = normalizeHost(host);
  const map = parseTenantMap();

  // Doğrudan eşleşme
  if (normalized && map[normalized]) {
    return { code: map[normalized] };
  }

  // Ek yardımcı sezgiler (dev kolaylığı): localhost ↔ 127.0.0.1 aynası
  if (normalized === "localhost" && map["127.0.0.1"]) {
    return { code: map["127.0.0.1"] };
  }
  if (normalized === "127.0.0.1" && map["localhost"]) {
    return { code: map["localhost"] };
  }

  // Fallback
  const fallback = (process.env.DEFAULT_TENANT_CODE || "tr").toLowerCase();
  const code: Code = fallback.startsWith("en") ? "en" : "tr";
  return { code };
}
// DB tabanlı çözüm: tenant_domains(host) -> tenants(id, code, locale)
export async function getTenantByHost(host?: string): Promise<{ code: Code; locale?: string }> {
  // Önce mevcut mantıkla normalize et
  const normalized = normalizeHost(host);
  // Supabase server-side client (service role veya RLS-safe view ile anon key)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Ortam değişkeni yoksa, eski fallback mantığına dön (projeyi kırmamak için)
  if (!supabaseUrl || !serviceKey) {
    const { code } = resolveTenantFromHost(normalized);
    return { code, locale: code === "en" ? "en-GB" : "tr-TR" };
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // Şemana uygun JOIN: tenant_domains.tenant_id -> tenants.id
  const { data, error } = await supabase
    .from("tenant_domains")
    .select("tenants:tenant_id ( code, locale )")
    .eq("host", normalized)
    .limit(1)
    .maybeSingle();

  if (error) {
    // Bir sorun varsa kırmadan mevcut fallback’e dön
    const { code } = resolveTenantFromHost(normalized);
    return { code, locale: code === "en" ? "en-GB" : "tr-TR" };
  }

  const t = (data as any)?.tenants as { code?: string; locale?: string } | null;

  // DB’den gelmemişse yine fallback
  const code = (t?.code ?? resolveTenantFromHost(normalized).code) as Code;
  const locale = t?.locale ?? (code === "en" ? "en-GB" : "tr-TR");
  return { code, locale };
}

// Kısa locale gerekli ise:
export function toShortLocale(locale?: string): "tr" | "en" {
  if (!locale) return "tr";
  return (locale.split("-")[0] as "tr" | "en");
}
