// app/api/admin/payments/bulk-delete/list/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/serverAdmin";

export const runtime = "nodejs";

export async function GET() {
  // Return ALL payments; NO filters that would hide null order_id/question_id
  const pRes = await supabaseAdmin
    .from("payments")
    .select("id, created_at, order_id, question_id")
    .order("created_at", { ascending: false });

  if (pRes.error) {
    return NextResponse.json({ ok: false, stage: "payments", error: pRes.error.message }, { status: 500 });
  }

  const rows = pRes.data ?? [];

  const items = rows.map((p) => ({
    id: (p as any).id as string,
    created_at: (p as any).created_at as string,
    order_id: ((p as any).order_id as string | null) ?? null,
    question_id: ((p as any).question_id as string | null) ?? null,
    order_ref_count: (((p as any).order_id ? 1 : 0) + ((p as any).question_id ? 1 : 0)),
  }));

  return NextResponse.json({ ok: true, items });
}
