import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("worker_cv_profiles")
    .select("*")
    .eq("worker_user_id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, data });
}

export async function PUT(req: Request) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const payload = await req.json();

  // Fetch existing profile id
  const { data: existing, error: e0 } = await supabase
    .from("worker_cv_profiles")
    .select("id")
    .eq("worker_user_id", user.id)
    .maybeSingle();
  if (e0) return NextResponse.json({ ok: false, error: e0.message }, { status: 400 });

  const allowed = {
    display_name: payload.display_name ?? null,
    title_tr: payload.title_tr ?? null,
    title_en: payload.title_en ?? null,
    tags: Array.isArray(payload.tags) ? payload.tags : [],
  };

  let q = supabase.from("worker_cv_profiles");
  let resp;
  if (existing?.id) {
    resp = await q.update(allowed).eq("worker_user_id", user.id).select("*").maybeSingle();
  } else {
    resp = await q.insert({ worker_user_id: user.id, ...allowed }).select("*").maybeSingle();
  }
  const { data, error } = resp as any;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  await supabase.from("audit_logs").insert({
    actor_user_id: user.id,
    actor_role: "worker",
    action: "worker_cv_profile_update_public_fields",
    resource_type: "worker_cv_profiles",
    resource_id: data?.id,
    payload: { worker_user_id: user.id }
  });

  return NextResponse.json({ ok: true, data });
}