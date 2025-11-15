// app/api/blog/admin/schedule/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { id, iso } = await req.json();
    const supabase = await supabaseServer();
    const { error } = await supabase.rpc("fn_blog_admin_schedule", {
      p_id: id,
      p_scheduled_at: iso,
    });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "ERR" }, { status: 500 });
  }
}
