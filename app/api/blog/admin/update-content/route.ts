import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { id, title, content_json } = body || {};
    if (!id) return NextResponse.json({ ok: false, error: "ID_REQUIRED" }, { status: 400 });

    const supabase = supabaseAdmin;
    const upd = await supabase.from("blog_posts")
      .update({ title: title ?? null, content_json: content_json ?? null, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (upd.error) {
      return NextResponse.json({ ok: false, error: upd.error.message }, { status: 400 });
    }
    if (!upd.data) {
      return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "UPDATE_ERROR" }, { status: 500 });
  }
}
