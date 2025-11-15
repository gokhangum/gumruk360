import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const { data: workerProfiles, error: e1 } = await supabase
    .from("profiles")
    .select("id, email, role")
    .in("role", ["worker", "worker360"])
    .limit(500);

  if (e1) return NextResponse.json({ ok: false, error: e1.message }, { status: 400 });

  const ids = (workerProfiles || []).map((p: any) => p.id);
  let cvByWorker: Record<string, any> = {};

  if (ids.length > 0) {
    const { data: cvs } = await supabase
      .from("worker_cv_profiles")
      .select("id, worker_user_id, status, display_name, hourly_rate_tl, hourly_rate_currency, languages, tags, updated_at")
      .in("worker_user_id", ids);

    if (cvs) {
      for (const c of cvs) cvByWorker[c.worker_user_id] = c;
    }
  }

  const rows = (workerProfiles || []).map((p: any) => ({
    profile_id: p.id,
    email: p.email ?? null,
    role: p.role ?? null,
    cv: cvByWorker[p.id] ?? null
  }));

  return NextResponse.json({ ok: true, data: rows });
}
