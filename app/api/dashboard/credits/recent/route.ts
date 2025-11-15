import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabase/serverAdmin";
import { headers as nextHeaders } from "next/headers";

function getQuery(req: Request, key: string): string | null {
  try { return new URL(req.url).searchParams.get(key); } catch { return null; }
}

async function resolveUid(req: Request): Promise<string | null> {
  const q = getQuery(req, "user_id") || getQuery(req, "uid");
  if (q) return q;
  try {
    const s = await supabaseServer();
    const { data: { user } } = await s.auth.getUser();
    if (user?.id) return user.id as string;
  } catch {}
  const h = await nextHeaders();
  const x = h.get("x-user-id") || h.get("X-User-Id");
  if (x) return x;
  return null;
}

export async function GET(req: Request) {
  try {
    const uid = await resolveUid(req);
    if (!uid) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });

    const { data: rows, error } = await supabaseAdmin
      .from("orders")
      .select("id, status, amount, currency, meta, paid_at, created_at")
      .eq("status", "paid")
      .or(`user_id.eq.${uid},meta->>scope_id.eq.${uid}`)
      .order("paid_at", { ascending: false, nullsFirst: false })
      .limit(10);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const items = (rows || [])
      .filter((o: any) => {
        const k = (o?.meta?.kind || o?.meta?.type || "").toString();
        return k === "credit_purchase" || k === "credits";
      })
      .map((o: any) => {
        const credits = Number(o?.meta?.credits ?? 0) || null;
        const unit = Number(o?.meta?.unit_price_lira ?? 0) || null;
        return {
          order_id: o.id,
          paid_at: o.paid_at,
          amount: o.amount,
          currency: o.currency || "TRY",
          credits,
          unit_price_lira: unit,
          total_lira: unit && credits ? unit * credits : null,
        };
      });

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "internal_error" }, { status: 500 });
  }
}
