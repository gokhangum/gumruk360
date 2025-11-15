// app/api/admin/assignment-requests/[id]/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/serverAdmin";
import { assertAdmin } from "@/lib/auth/requireAdmin";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
	const { id } = await context.params;
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");
assertAdmin(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "").toLowerCase();

    if (action !== "approve" && action !== "reject") {
      return NextResponse.json({ ok: false, error: "invalid action" }, { status: 400 });
    }

    // Talebi çek
    const { data: reqRow, error: gErr } = await supabaseAdmin
      .from("assignment_requests")
      .select("id, status, question_id, worker_id")
      .eq("id", id)
      .maybeSingle();
    if (gErr) throw gErr;
    if (!reqRow) {
      return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    }

    if (action === "reject") {
      const { error: rErr } = await supabaseAdmin
        .from("assignment_requests")
        .update({ status: "rejected" })
        .eq("id", id);
      if (rErr) throw rErr;
      return NextResponse.json({ ok: true });
    }

    // approve
    // 1) Soruyu workere assign et
    const { error: aErr } = await supabaseAdmin
      .from("questions")
      .update({ assigned_to: reqRow.worker_id })
      .eq("id", reqRow.question_id);
    if (aErr) throw aErr;

    // 2) Bu talebi approved yap
    const { error: uErr } = await supabaseAdmin
      .from("assignment_requests")
      .update({ status: "approved" })
      .eq("id", id);
    if (uErr) throw uErr;

    // 3) Aynı sorudaki diğer pending talepleri reddet
    const { error: oErr } = await supabaseAdmin
      .from("assignment_requests")
      .update({ status: "rejected" })
      .eq("question_id", reqRow.question_id)
      .neq("id", id)
      .eq("status", "pending");
    if (oErr) throw oErr;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "unknown error" },
      { status: 500 }
    );
  }
}
