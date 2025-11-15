import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function PUT(req: Request, ctx: { params: Promise<{ id: string; blockId: string }> }) {
  const { id, blockId } = await ctx.params;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const payload = await req.json();
  const upd = {
    lang: payload.lang ?? "tr",
    block_type: payload.block_type ?? null,
    body_rich: payload.body_rich ?? { type: "doc", content: [] },
    order_no: Number(payload.order_no ?? 0),
    is_visible: true
  };

  const { data, error } = await supabase
    .from("worker_cv_blocks")
    .update(upd)
    .eq("id", blockId)
    .eq("worker_user_id", id)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  await supabase.from("audit_logs").insert({
    actor_user_id: user.id,
    actor_role: "admin",
    action: "admin_cv_block_update",
    resource_type: "worker_cv_blocks",
    resource_id: data?.id,
    payload: { worker_user_id: id, block_id: blockId }
  });

  return NextResponse.json({ ok: true, data });
}

export async function DELETE(_: Request, ctx: { params: Promise<{ id: string; blockId: string }> }) {
  const { id, blockId } = await ctx.params;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const { data, error } = await supabase
    .from("worker_cv_blocks")
    .delete()
    .eq("id", blockId)
    .eq("worker_user_id", id)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  await supabase.from("audit_logs").insert({
    actor_user_id: user.id,
    actor_role: "admin",
    action: "admin_cv_block_delete",
    resource_type: "worker_cv_blocks",
    resource_id: data?.id,
    payload: { worker_user_id: id, block_id: blockId }
  });

  return NextResponse.json({ ok: true });
}
