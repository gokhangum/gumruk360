import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const { data, error } = await supabase
    .from("worker_cv_blocks")
    .select("*")
    .eq("worker_user_id", id)
    .order("order_no", { ascending: true });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, data });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const payload = await req.json();
  const row = {
    worker_user_id: id,
    lang: payload.lang ?? "tr",
    block_type: payload.block_type ?? "custom",
    body_rich: payload.body_rich ?? {},
    order_no: Number(payload.order_no ?? 0),
    is_visible: payload.is_visible ?? true,
  };

  const { data, error } = await supabase
    .from("worker_cv_blocks")
    .insert(row)
    .select("*")
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  await supabase.from("audit_logs").insert({
    actor_user_id: user.id,
    actor_role: "admin",
    action: "admin_cv_block_insert",
    resource_type: "worker_cv_blocks",
    resource_id: data?.id,
    payload: { worker_user_id: id }
  });

  return NextResponse.json({ ok: true, data });
}
