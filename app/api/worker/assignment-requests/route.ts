// app/api/worker/assignment-requests/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/serverAdmin";
import { supabaseAuthServer as supabaseAuth } from "@/lib/supabaseAuth"

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const questionId = url.searchParams.get("questionId");
    if (!questionId) {
      return NextResponse.json(
        { ok: false, error: "questionId gerekli" },
        { status: 400 }
      );
    }

    const auth = await supabaseAuth();
    const { data: u } = await auth.auth.getUser();
    const me = u?.user;
    if (!me?.id) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    // Eğer daha önce reddedildiyse yeniden 'pending' yapar;
    // 'approved' ise tekrar başvuruya gerek yok (ok döner).
    const { data: existing } = await supabaseAdmin
      .from("assignment_requests")
      .select("id, status")
      .eq("question_id", questionId)
      .eq("worker_id", me.id)
      .maybeSingle();

    if (existing?.status === "approved") {
      return NextResponse.json({ ok: true, already: "approved" });
    }

    if (existing) {
      const { error: uErr } = await supabaseAdmin
        .from("assignment_requests")
        .update({ status: "pending" })
        .eq("id", existing.id);
      if (uErr) throw uErr;
    } else {
      const { error: iErr } = await supabaseAdmin
        .from("assignment_requests")
        .insert({ question_id: questionId, worker_id: me.id, status: "pending" });
      if (iErr) throw iErr;
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "unknown error" },
      { status: 500 }
    );
  }
}
