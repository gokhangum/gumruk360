import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {

  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { id } = await context.params;

  const body = await request.json();


  const update = {
    lang: body.lang,
    block_type: body.block_type,
    body_rich: body.body_rich,
    order_no: Number(body.order_no ?? 0),
    is_visible: body.is_visible
  };

  const { data, error } = await supabase
    .from("worker_cv_blocks")
    .update(update)
    .eq("id", id)
    .eq("worker_user_id", user.id)
    .select("*")
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  await supabase.from("audit_logs").insert({
    actor_user_id: user.id,
    actor_role: "worker",
    action: "cv_block_update",
    resource_type: "worker_cv_blocks",
    resource_id: id,
    payload: update
  });

  return NextResponse.json({ ok: true, data });
}

// DELETE is not exposed for worker (per requirement). Admin-only deletion could be added under /api/admin if needed.
