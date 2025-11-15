// app/api/admin/payments/bulk-delete/run/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/serverAdmin";

export const runtime = "nodejs";

type Req = { payment_ids?: string[]; dry?: boolean };

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Req;
    const ids = Array.isArray(body.payment_ids) ? [...new Set(body.payment_ids)].filter(Boolean) : [];
    const dry = !!body.dry;

    if (!ids.length) {
      return NextResponse.json({ ok: false, requested: 0, error: "Geçerli payment ID listesi yok." }, { status: 400 });
    }

    // Load the payments to see if they are linked
    const pRes = await supabaseAdmin
      .from("payments")
      .select("id, order_id, question_id")
      .in("id", ids);
    if (pRes.error) return NextResponse.json({ ok: false, stage: "payments", error: pRes.error.message }, { status: 500 });

    const found = (pRes.data || []).map((r) => r.id as string);
    const missing = ids.filter((id) => !found.includes(id));

    // Blockers: if payment has order_id or question_id not null, block deletion
    const blockers: Record<string, { reason: string }[]> = {};
    for (const row of (pRes.data || [])) {
      if (row.order_id || row.question_id) {
        blockers[row.id as string] = [{ reason: "Bu ödeme bir order/question ile bağlı." }];
      }
    }

    const deletable = found.filter((pid) => !blockers[pid]);

    if (dry) {
      return NextResponse.json({
        ok: true,
        requested: ids.length,
        deletable_count: deletable.length,
        blockers,
        missing,
      });
    }

    // Non-dry: delete deletable payments
    let deleted = 0;
    if (deletable.length) {
      const del = await supabaseAdmin
        .from("payments")
        .delete()
        .in("id", deletable);
      if (del.error) {
        return NextResponse.json({ ok: false, stage: "delete", error: del.error.message }, { status: 500 });
      }
      deleted = del.count ?? deletable.length;
    }

    return NextResponse.json({
      ok: true,
      requested: ids.length,
      deletable_count: deletable.length,
      deleted_count: deleted,
      blockers,
      missing,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e), stage: "exception" }, { status: 500 });
  }
}
