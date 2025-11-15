// app/api/cron/publish/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.rpc("fn_blog_publish_scheduled");
    if (error) throw error;
    return NextResponse.json({ ok: true, published: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "ERR" }, { status: 500 });
  }
}
