// app/debug/user-id/page.tsx
 import { cookies, headers } from "next/headers";
 import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { getTranslations, getLocale } from "next-intl/server";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Tier = {
  id: string;
  scope_type: "org" | "user";
  credits_range: string | null;
  unit_price_lira: number | null;
  active: boolean | null;
};

function parseLowerBoundFromRange(r: string | null): number {
  if (!r) return Infinity;
  const m = r.match(/^\s*[\[\(]\s*([0-9]+)(?:\.[0-9]+)?\s*,/);
  if (!m) return Infinity;
  const v = Number(m[1]);
  return Number.isFinite(v) ? v : Infinity;
}

function formatCreditsRangeTR(r: string | null | undefined): string {
  if (!r) return "—";
  const m = r.match(
    /^([\[\(])\s*([0-9]+)(?:\.[0-9]+)?\s*,\s*([0-9]+|infinity)(?:\.[0-9]+)?\s*([\]\)])$/i
  );
  if (!m) return r;
  const open = m[1];
  let low = m[2] === "infinity" ? Infinity : Number(m[2]);
  let high = m[3] === "infinity" ? Infinity : Number(m[3]);
  if (!Number.isFinite(low)) return "—";
  if (open === "(") low = (low as number) + 1;
  if (m[4] === ")") high = (high as number) - 1;
  if (!Number.isFinite(high)) return `${low}+ adet alımlar`;
  return `${low} - ${high} adet arası alımlar`;
}
// 0.1 hassasiyet (21.44→21.4, 21.47→21.5)
const round1 = (n: number) => Math.round(n * 10) / 10;
 export default async function Page() {
   const supabase = createServerClient(
     process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
     {
        cookies: {
         get: async (name: string) => (await cookies()).get(name)?.value,
       set: async (name: string, value: string, options?: CookieOptions) => {
           const c = await cookies();
        c.set(name, value, options as any);
         },
          remove: async (name: string, options?: CookieOptions) => {
          const c = await cookies();
         c.set(name, "", { ...(options as any), maxAge: 0 });
        },
       },
      }
  );
const headerList = await headers();

  // 1) user-id
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const locale = await getLocale();
const t = await getTranslations("creditPricing");
  const supabaseAdmin = createSupabaseAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // server env
  { auth: { persistSession: false } }
);
  // 1.1) Kullanıcının tenant_key'ini ve tenant.currency'sini bul
  let currencyCode: string | null = null;

let fxRateTRYPerCCY: number | null = null;
  

  if (user?.id) {
    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("tenant_key")
      .eq("id", user.id)
      .single();

    const tenantKey = prof?.tenant_key ?? null;
	
    if (tenantKey) {
const { data: tenantRows, error: tenantErr } = await supabaseAdmin
  .from("tenants")
  .select("currency")
  .eq("code", tenantKey)
  .limit(1);

const tenant = Array.isArray(tenantRows) ? tenantRows[0] : null;
 currencyCode = tenant?.currency ? String(tenant.currency).toUpperCase() : null; // örn: "USD","AED"

    }
// FX'i TCMB'den oku (USD/TL gibi: base=currencyCode)
if (currencyCode) {
  const base = String(currencyCode).toUpperCase();

  if (base === "TRY") {
    fxRateTRYPerCCY = 1;
  } else {
    try {
      // Aynı origin'den RSC relative fetch
	  const proto = headerList.get("x-forwarded-proto") ?? "http";
const host = headerList.get("host") ?? "localhost:3000";
const fxUrl = `${proto}://${host}/api/fx/tcmb?base=${base}`;
      const res = await fetch(fxUrl, { cache: "no-store" });
      const j = await res.json();
      if (res.ok && j?.ok !== false && typeof j?.rate === "number") {
        fxRateTRYPerCCY = j.rate; // Örn: USD/TL=50
      } else {
    
      }
    } catch (e: any) {
  
    }
  }


}

  }
  // Kullanıcının organization owner olup olmadığını kontrol et
let isOwner = false;
if (user?.id) {
  const { data: omRows } = await supabaseAdmin
    .from("organization_members")
    .select("org_role")
    .eq("user_id", user.id)
    
    .limit(20);
  isOwner = Array.isArray(omRows) && omRows.some(r => String(r.org_role || "").toLowerCase().trim() === "owner");
}
  // 2) Kredi fiyatlaması (popup’taki veri)
  const { data: tiersRaw, error } = await supabase
    .from("credit_price_tiers")
    .select("id, scope_type, credits_range, unit_price_lira, active")
    .eq("scope_type", isOwner ? "org" : "user")
    .eq("active", true);

  const tiers = (tiersRaw ?? [])
    .slice()
    .sort((a: Tier, b: Tier) => {
      const an = parseLowerBoundFromRange(a.credits_range ?? null);
      const bn = parseLowerBoundFromRange(b.credits_range ?? null);
      return an - bn;
    });

  const nf = new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  return (
  
    <div style={{ padding: 16, fontFamily: "ui-sans-serif, system-ui" }}>
	
     

      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
        {t(isOwner ? "heading.org" : "heading.user")}
      </h2>

      {error ? (
        <div style={{ color: "#b91c1c" }}>
          {t("loadError")}
        </div>
      ) : tiers.length === 0 ? (
        <div style={{ color: "#4b5563" }}>{t("empty")}</div>
      ) : (
        <div style={{ overflowX: "auto", display: "inline-block", border: "1px solid #cbd5e1", borderRadius: 8, padding: 8 }}>
          <table
            style={{
              width: "auto",
              borderCollapse: "collapse",
              fontSize: 14,
            }}
          >
            <thead>
               <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", backgroundColor: "#1d4ed8", color: "#000000", fontWeight: 700 }}>
              <th style={{ padding: "6px 10px" }}>{t("range")}</th>
              
  <th style={{ padding: "6px 10px" }}>
   {t("unitPrice", { ccy: (currencyCode ?? "").toUpperCase() })}
  </th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "8px 12px" }}>
                    {formatCreditsRangeTR(r.credits_range)}
                  </td>
                 
				  <td style={{ padding: "8px 12px" }}>
  {r.unit_price_lira == null || !currencyCode || !fxRateTRYPerCCY
    ? "—"
    : nf.format(round1(Number(r.unit_price_lira) / Number(fxRateTRYPerCCY)))
  }
</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
