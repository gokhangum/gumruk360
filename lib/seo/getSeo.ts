import { headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export type TenantSeo = {
  tenant_code: string;
  locale: string;
  route: string;
  title: string | null;
  description: string | null;
  keywords: string[] | null;
  og_image_url: string | null;
  jsonld: any | null;
  is_active: boolean;
  updated_at: string;
};

function hostToTenant(host: string) {
  const h = host.toLowerCase();
  if (h.endsWith("gumruk360.com") || h.startsWith("tr.")) return { tenant: "TR", locale: "tr-TR" };
  if (h.startsWith("cn.")) return { tenant: "CN", locale: "zh-CN" };
  return { tenant: "EN", locale: "en-US" };
}

export async function getSeoFor(pathname: string) {
  const hdrs = await headers();
  const host = (hdrs.get("x-forwarded-host") || hdrs.get("host") || "").toLowerCase();
  const { tenant, locale } = hostToTenant(host);

  const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data } = await supa
    .from("tenant_seo")
    .select("*")
    .eq("tenant_code", tenant)
    .eq("locale", locale)
    .in("route", [pathname, "*"])
    .order("route", { ascending: false })
    .limit(1)
    .maybeSingle();

  return { host, tenant, locale, record: (data as TenantSeo | null) ?? null };
}
