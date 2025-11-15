import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabaseServer";
import { headers as nextHeaders } from "next/headers";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
const supabase = createClient(url, service, { auth: { persistSession: false } });
// 0.1 hassasiyete yuvarlar: 21.44→21.4, 21.47→21.5
const round1 = (n: number | null | undefined) =>
  n == null ? null : Math.round(n * 10) / 10;
export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const scope_type = (u.searchParams.get('scope_type') === 'org') ? 'org' : 'user';
    const credits = Number(u.searchParams.get('credits') || 0);
// —— Para birimini çöz ——
const headerList = await nextHeaders();
const host = headerList.get("host") || "localhost:3000";

let currencyCode: string = "TRY";

try {
  // Oturumdaki kullanıcıyı al
  const s = await supabaseServer();
  const { data: { user } } = await s.auth.getUser();

  if (user?.id) {
    // profiles.tenant_key → tenants.currency
    const { data: prof } = await supabase
      .from("profiles")
      .select("tenant_key")
      .eq("id", user.id)
      .maybeSingle();

    const tenantKey = prof?.tenant_key ? String(prof.tenant_key) : null;
    if (tenantKey) {
      const { data: tenant } = await supabase
        .from("tenants")
        .select("currency")
        .eq("code", tenantKey)
        .maybeSingle();
      if (tenant?.currency) currencyCode = String(tenant.currency).toUpperCase();
    }
  }
} catch { /* sessiz geç */ }

// —— TCMB kuru (base=currencyCode, quote=TRY) ——
let fxRateTRYPerCCY: number | null = null;
if (currencyCode && currencyCode !== "TRY") {
  // Yerel geliştirme: localhost, 127.0.0.1 ve ::1 için HTTP kullan
  const isLocalHost =
    /^localhost(:\d+)?$/i.test(host) ||
     /^127\.0\.0\.1(:\d+)?$/i.test(host) ||
   /^\[?::1\]?(:\d+)?$/i.test(host);
  const proto = isLocalHost ? "http" : "https";
  const fxUrl = `${proto}://${host}/api/fx/tcmb?base=${currencyCode}`;
  try {
    const resFx = await fetch(fxUrl, { cache: "no-store" });
    const j = await resFx.json();
    if (resFx.ok && j?.ok && Number.isFinite(j.rate)) {
      fxRateTRYPerCCY = Number(j.rate); // örn: USD/TRY = 34.00
    }
  } catch { /* sessiz geç */ }

}

    if (credits > 0) {
      const { data, error } = await supabase.rpc('fn_total_for_purchase', {
        p_scope: scope_type, p_credits: credits
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
    const unit_lira = Number(row?.unit_price_lira ?? 0);
     const total_lira = Number(row?.total_lira ?? 0);
     const useFx = currencyCode !== "TRY" && Number.isFinite(fxRateTRYPerCCY) && Number(fxRateTRYPerCCY) > 0;
      const unit_ccy  = useFx ? round1(unit_lira / Number(fxRateTRYPerCCY)) : null;
     const total_ccy = useFx ? round1(total_lira / Number(fxRateTRYPerCCY)) : null;

      return NextResponse.json({
        scope_type,
        credits,
        currency: currencyCode,            // "TRY" | "USD" | ...
        unit_price_lira: unit_lira,        // TL baz
       total_lira: total_lira,            // TL baz
        unit_price_ccy: unit_ccy,          // TL dışı ise dönüşmüş
        total_ccy: total_ccy               // TL dışı ise dönüşmüş
      });
    }

    const { data, error } = await supabase
      .from('subscription_settings')
      .select('credit_price_lira')
      .eq('id','default')
      .single();
    if (error) throw error;
 const unit_lira = Number(data?.credit_price_lira ?? 0);
    const useFx = currencyCode !== "TRY" && Number.isFinite(fxRateTRYPerCCY) && Number(fxRateTRYPerCCY) > 0;
    const unit_ccy = useFx ? round1(unit_lira / Number(fxRateTRYPerCCY)) : null;
    return NextResponse.json({
      currency: currencyCode,
      credit_price_lira: unit_lira,
     credit_price_ccy: unit_ccy
    });
  } catch (e:any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
