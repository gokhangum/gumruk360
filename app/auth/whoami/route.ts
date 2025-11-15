// app/api/auth/whoami/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET() {
  try {
    const s = await supabaseServer();
    const { data: { user }, error } = await s.auth.getUser();
    return NextResponse.json({ ok: true, user, error: error?.message ?? null });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message || "unknown" }, { status: 500 });
  }
}
