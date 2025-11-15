import "server-only";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/serverAdmin";

type TierRow = { min?: number|null; max?: number|null; unit_price_lira: number; active?: boolean; id?: string };

function parseNumrange(r: string | null): { min: number|null; max: number|null } {
  if (!r) return { min: null, max: null };
  // examples: "[30,100)", "[300,1000)"
  const m = r.match(/[\[\(]([^,]*),([^\]\)]*)[\]\)]/);
  if (!m) return { min: null, max: null };
  const lo = m[1].trim();
  const hi = m[2].trim();
  const min = lo === "" || lo.toLowerCase() === "infinity" ? null : Number(lo);
  const max = hi === "" || hi.toLowerCase() === "infinity" ? null : Number(hi);
  return { min: Number.isFinite(min as number) ? (min as number) : null, max: Number.isFinite(max as number) ? (max as number) : null };
}

function toNumrange(min: number|null|undefined, max: number|null|undefined): string {
  const lo = (min==null || !Number.isFinite(Number(min))) ? "" : String(min);
  const hi = (max==null || !Number.isFinite(Number(max))) ? "" : String(max);
  // closed-open range [min,max)
  return `[${lo},${hi})`;
}

export async function GET() {
  // base settings
  const { data: ss, error: err1 } = await supabaseAdmin
    .from("subscription_settings")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (err1) return NextResponse.json({ ok:false, error: err1.message }, { status: 500 });

  // tiers: user
  const { data: tUser, error: tErrU } = await supabaseAdmin
    .from("credit_price_tiers")
    .select("id, scope_type, credits_range, unit_price_lira, active")
    .eq("scope_type", "user")
    .order("created_at", { ascending: true });
  if (tErrU) return NextResponse.json({ ok:false, error: tErrU.message }, { status: 500 });

  // tiers: org
  const { data: tOrg, error: tErrO } = await supabaseAdmin
    .from("credit_price_tiers")
    .select("id, scope_type, credits_range, unit_price_lira, active")
    .eq("scope_type", "org")
    .order("created_at", { ascending: true });
  if (tErrO) return NextResponse.json({ ok:false, error: tErrO.message }, { status: 500 });

  const tiers_user: TierRow[] = (tUser ?? []).map((r:any) => ({
    id: r.id,
    unit_price_lira: Number(r.unit_price_lira ?? 0),
    active: r.active !== false,
    ...parseNumrange(r.credits_range ?? null),
  }));

  const tiers_org: TierRow[] = (tOrg ?? []).map((r:any) => ({
    id: r.id,
    unit_price_lira: Number(r.unit_price_lira ?? 0),
    active: r.active !== false,
    ...parseNumrange(r.credits_range ?? null),
  }));

  return NextResponse.json({
    ...ss,
    tiers_user,
    tiers_org,
  });
}

export async function POST(req: Request) {
  const payload = await req.json();

  // Update base settings (only known fields; ignore unknowns)
  const up: any = {
    credits_per_point: Number(payload.credits_per_point ?? 10),
    low_balance_threshold_user: Number(payload.low_balance_threshold_user ?? 0),
    low_balance_threshold_org: Number(payload.low_balance_threshold_org ?? 0),
    credit_price_lira: Number(payload.credit_price_lira ?? 0),
    credit_discount_user: Number(payload.credit_discount_user ?? 0),
    credit_discount_org: Number(payload.credit_discount_org ?? 0),
    notify_emails: Array.isArray(payload.notify_emails) ? payload.notify_emails : [],
    min_user_purchase_credits: Number(payload.min_user_purchase_credits ?? 0),
    min_org_purchase_credits: Number(payload.min_org_purchase_credits ?? 0),
    updated_at: new Date().toISOString(),
  };

  const { error: upErr } = await supabaseAdmin
    .from("subscription_settings")
    .update(up)
    .eq("id","default");
  if (upErr) return NextResponse.json({ ok:false, error: upErr.message }, { status: 500 });

  // Handle tiers if provided
  const tiers_user: TierRow[] = Array.isArray(payload.tiers_user) ? payload.tiers_user : [];
  const tiers_org: TierRow[] = Array.isArray(payload.tiers_org) ? payload.tiers_org : [];

  // Replace strategy: delete then insert
  // USER
  if (tiers_user) {
    const { error: delU } = await supabaseAdmin.from("credit_price_tiers")
      .delete()
      .eq("scope_type","user");
    if (delU) return NextResponse.json({ ok:false, error: delU.message }, { status: 500 });
    if (tiers_user.length > 0) {
      const rows = tiers_user.map(r => ({
        scope_type: "user",
        credits_range: toNumrange(r.min ?? null, r.max ?? null),
        unit_price_lira: Number(r.unit_price_lira ?? 0),
        active: r.active !== false,
      }));
      const { error: insU } = await supabaseAdmin.from("credit_price_tiers").insert(rows);
      if (insU) return NextResponse.json({ ok:false, error: insU.message }, { status: 500 });
    }
  }

  // ORG
  if (tiers_org) {
    const { error: delO } = await supabaseAdmin.from("credit_price_tiers")
      .delete()
      .eq("scope_type","org");
    if (delO) return NextResponse.json({ ok:false, error: delO.message }, { status: 500 });
    if (tiers_org.length > 0) {
      const rows = tiers_org.map(r => ({
        scope_type: "org",
        credits_range: toNumrange(r.min ?? null, r.max ?? null),
        unit_price_lira: Number(r.unit_price_lira ?? 0),
        active: r.active !== false,
      }));
      const { error: insO } = await supabaseAdmin.from("credit_price_tiers").insert(rows);
      if (insO) return NextResponse.json({ ok:false, error: insO.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok:true });
}
