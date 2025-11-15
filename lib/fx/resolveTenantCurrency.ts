import { createClient as createAdminClient } from "@supabase/supabase-js";

export type ResolvedTenant = {
  currency: string;            // TRY | USD | EUR | GBP | AED | ...
  pricing_multiplier: number;  // numeric(10,4) → number
};

// İstersen bu listeyi admin tarafında kullandığınla uyumlu tut.
const ALLOWED_CURRENCIES = ["TRY", "USD", "EUR", "GBP", "AED"];

function admin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

/**
 * 1) profiles.tenant_key -> tenants.code (öncelik)
 * 2) host -> tenants.primary_domain (fallback)
 * Dönen currency UPPERCASE normalleştirilir ve multiplier number’a çevrilir.
 */
export async function resolveTenantCurrency(params: {
  userId?: string | null;
  host?: string | null;
}): Promise<ResolvedTenant | null> {
  const a = admin();

  // 1) user -> profiles.tenant_key -> tenants.code
  if (params.userId) {
    const { data: prof } = await a
      .from("profiles")
      .select("tenant_key")
      .eq("id", params.userId)
      .maybeSingle();

    const tkey = prof?.tenant_key ?? null;
    if (tkey) {
      const { data: t } = await a
        .from("tenants")
        .select("currency, pricing_multiplier")
        .eq("code", tkey)
        .maybeSingle();

      if (t) {
        const cur = (t.currency ?? "TRY").toUpperCase();
        const mult = Number(t.pricing_multiplier ?? 1);
        return {
          currency: ALLOWED_CURRENCIES.includes(cur) ? cur : "TRY",
          pricing_multiplier: Number.isFinite(mult) && mult > 0 ? mult : 1,
        };
      }
    }
  }

  // 2) host -> tenants.primary_domain
  if (params.host) {
    const { data: t } = await a
      .from("tenants")
      .select("currency, pricing_multiplier")
      .eq("primary_domain", params.host)
      .maybeSingle();

    if (t) {
      const cur = (t.currency ?? "TRY").toUpperCase();
      const mult = Number(t.pricing_multiplier ?? 1);
      return {
        currency: ALLOWED_CURRENCIES.includes(cur) ? cur : "TRY",
        pricing_multiplier: Number.isFinite(mult) && mult > 0 ? mult : 1,
      };
    }
  }

  return null;
}

/**
 * TCMB today.xml tabanlı kur: 1 BASE = ? TRY
 * BASE=TRY ise 1 döner. Diğer tüm destekli para birimleri için /api/fx/tcmb?base=BASE çağrılır.
 */
export async function fxBaseTry(base: string): Promise<{ rate: number; asof: string | null }> {
  const BASE = (base || "TRY").toUpperCase();
  if (BASE === "TRY") {
    const today = new Date().toISOString().slice(0, 10);
    return { rate: 1, asof: today };
  }
   // TCMB today.xml doğrudan çekilir; iç API'ye bağımlılık yok.
   const tcmbUrl = "https://www.tcmb.gov.tr/kurlar/today.xml";
   const res = await fetch(tcmbUrl, { cache: "no-store" });
   if (!res.ok) throw new Error(`tcmb_fetch_failed:${res.status}`);
   const xml = await res.text();

   // Tarih (ör. <Tarih_Date Date="2025-10-09"...>)
   const dateMatch = xml.match(/<Tarih_Date[^>]*\sDate="([^"]+)"/i);
   const asof = dateMatch?.[1] ?? null;

   // İstenen BASE için <Currency CurrencyCode="BASE"> bloğunu bul
   const block = xml.match(
     new RegExp(`<Currency[^>]*CurrencyCode="${BASE}"[^>]*>[\\s\\S]*?<\\/Currency>`, "i")
   )?.[0];
   if (!block) throw new Error(`currency_block_not_found:${BASE}`);

   // ForexSelling rakamını yakala
   const fsMatch = block.match(/<ForexSelling>([\d.,]+)<\/ForexSelling>/i);
   if (!fsMatch) throw new Error("forex_selling_not_found");

   // "48,4575" | "48.4575" | "1.234,56" | "1,234.56" → number
   const parse = (s: string): number => {
     const hasComma = s.includes(",");
     const hasDot = s.includes(".");
     if (hasComma && hasDot) return Number(s.replace(/\./g, "").replace(",", "."));
     if (hasComma) return Number(s.replace(",", "."));
     return Number(s);
   };

   const rate = parse(fsMatch[1]);
   if (!isFinite(rate) || rate <= 0) throw new Error("invalid_rate");

   return { rate, asof };

}

/**
 * TL → BASE para birimine dönüştürüp multiplier uygular.
 * Not: Senin kararın gereği “kilit” tutarlılığı için sonuç **tam sayıya** yuvarlanır (ör. USD/EUR vb. hepsi int).
 */
export function computeLockedFromTRY(params: {
  tryAmount: number;           // TL tutar (number)
  baseCurrency: string;        // ör. "USD" | "EUR" | "TRY" | ...
  fxRateBaseTry: number;       // 1 BASE = ? TRY
  multiplier: number;          // tenants.pricing_multiplier
}): number {
  const base = (params.baseCurrency || "TRY").toUpperCase();
  const m = Number(params.multiplier || 1);
  const rate = Number(params.fxRateBaseTry || (base === "TRY" ? 1 : NaN));

  if (!Number.isFinite(params.tryAmount)) throw new Error("tryAmount invalid");
  if (!Number.isFinite(m) || m <= 0) throw new Error("multiplier invalid");
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("fxRate invalid");

  if (base === "TRY") {
    // TRY → TRY: sadece multiplier uygula
    return Math.round(params.tryAmount * m);
  }
  // TL → BASE: (TL / (BASE→TRY)) × multiplier
  const baseFloat = (params.tryAmount / rate) * m;
  return Math.round(baseFloat); // int kilit
}
