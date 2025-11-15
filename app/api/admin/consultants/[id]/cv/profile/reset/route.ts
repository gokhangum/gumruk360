import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const { data: pv, error: e1 } = await supabase
    .from("pricing_versions")
    .select("base_hourly_rate")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (e1) return NextResponse.json({ ok: false, error: e1.message }, { status: 400 });
  const base = Number(pv?.base_hourly_rate ?? 0);
  if (!base) return NextResponse.json({ ok: false, error: "Aktif taban ücret bulunamadı." }, { status: 400 });

  const { data, error } = await supabase
    .from("worker_cv_profiles")
    .upsert({ worker_user_id: id, hourly_rate_tl: base }, { onConflict: "worker_user_id" })
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  await supabase.from("audit_logs").insert({
    actor_user_id: user.id,
    actor_role: "admin",
    action: "admin_cv_profile_reset_hourly",
    resource_type: "worker_cv_profiles",
    resource_id: data?.id,
    payload: { worker_user_id: id, hourly_rate_tl: base }
  });

  return NextResponse.json({ ok: true, hourly_rate_tl: base });
}
