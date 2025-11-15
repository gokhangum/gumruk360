
// ⓘ Patch: requiredCredits uses ORG discount when user is an active corporate member.
// - Computes requiredUserCredits and requiredOrgCredits as before
// - If user has an active record in organization_members, requiredCredits = requiredOrgCredits
// - Org balance from organizations.credit_balance
// - User balance from admin SUM(credit_ledger.change) (same as dashboard)
import { NextResponse } from "next/server";
import { supabaseServer } from "../../../../../lib/supabase/server";
import { supabaseAdmin } from "../../../../../lib/supabase/serverAdmin";
import { resolveTenantCurrency } from "../../../../../lib/fx/resolveTenantCurrency"
import { headers } from "next/headers"
type OrgPick = { org_id: string; org_role: string; name: string | null };

function computeCredits(price: number, creditPrice: number, discount: number) {
  const d = discount > 1 ? (discount / 100) : discount;
  const base = price * (1 - d);
  const cp = creditPrice || 1;
  return base / cp;
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const supabase = await supabaseServer();

    // Auth
    const { data: authRes, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authRes?.user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    const uid = authRes.user.id;

    // Question price
    const { data: q } = await supabase
      .from("questions")
      .select("id,user_id,price_final_tl,price_tl")
      .eq("id", id)
      .maybeSingle();
    if (!q) return NextResponse.json({ ok: false, error: "question_not_found" }, { status: 404 });
    const price = Number((q as any).price_final_tl ?? (q as any).price_tl ?? 0);

    // subscription_settings via Admin
    const { data: ss } = await supabaseAdmin
      .from("subscription_settings")
      .select("credit_price_lira, credit_discount_user, credit_discount_org")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!ss) return NextResponse.json({ ok: false, error: "subscription_settings_missing" }, { status: 500 });
    const creditPrice  = Number(ss.credit_price_lira ?? 1);
     const discountUser = Number(ss.credit_discount_user ?? 0);
     const discountOrg  = Number(ss.credit_discount_org  ?? 0);
     let requiredUserCredits = computeCredits(price, creditPrice, discountUser);
     let  requiredOrgCredits  = computeCredits(price, creditPrice, discountOrg);
    // Kullanıcının tenant'ına göre multiplier uygula (yalnızca user credits)
     const host = (await headers()).get("host") ?? null;
     const resolved = await resolveTenantCurrency({ userId: uid, host });
     const pricingMultiplier = Number(resolved?.pricing_multiplier ?? 1);
    requiredUserCredits = Math.round(requiredUserCredits * (pricingMultiplier > 0 ? pricingMultiplier : 1));
requiredOrgCredits = Math.round(requiredOrgCredits * (pricingMultiplier > 0 ? pricingMultiplier : 1));

    // USER BALANCE (dashboard-like)
    const { data: uRows } = await supabaseAdmin
      .from("credit_ledger")
      .select("change")
      .eq("scope_type", "user")
      .eq("scope_id", uid)
      .limit(50000);
    const userBalance = (uRows || []).reduce((acc:number, r:any) => acc + Number(r.change || 0), 0);

    // ORG pick + balance
    let picked: OrgPick | null = null;
    let orgBalance: number | null = null;
    let hasActiveOrg = false;

    const { data: orgRows } = await supabaseAdmin
      .from("organization_members")
      .select("org_id,org_role,status")
      .eq("user_id", uid)
      .eq("status", "active")
      .limit(1000);
    if (orgRows?.length) {
      hasActiveOrg = true;
      // choose highest privilege (owner > admin > member)
      const rank = (r: string) => (r === "owner" ? 1 : r === "admin" ? 2 : 3);
      const chosen = orgRows.sort((a: any, b: any) => rank(a.org_role) - rank(b.org_role))[0];
      picked = { org_id: chosen.org_id, org_role: chosen.org_role, name: null };

      const { data: oRow } = await supabaseAdmin
        .from("organizations")
        .select("credit_balance, name")
        .eq("id", chosen.org_id)
        .maybeSingle();
      orgBalance = Number((oRow as any)?.credit_balance ?? 0);
      if (picked && (oRow as any)?.name) picked.name = (oRow as any).name;
    }

    // NEW: requiredCredits reflects membership
    const requiredCredits = hasActiveOrg ? requiredOrgCredits : requiredUserCredits;

    return NextResponse.json({
      ok: true,
      questionId: id,
      requiredCredits,
      requiredUserCredits,
      requiredOrgCredits,
      userBalance,
      canUserPay: userBalance >= requiredUserCredits && requiredUserCredits > 0,
      org: picked,
      orgBalance,
      canOrgPay: (orgBalance ?? 0) >= requiredOrgCredits && requiredOrgCredits > 0,
      meta: { creditPrice, discountUser, discountOrg, hasActiveOrg }
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: "unexpected", detail: err?.message ?? String(err) }, { status: 500 });
  }
}
