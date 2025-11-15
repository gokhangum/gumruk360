export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const path = body?.path as string | undefined;
    if (!path) return NextResponse.json({ ok:false, error: "Missing path" }, { status: 400 });

    const supa = supabaseAdmin;
    const { error } = await supa.storage.from("news").remove([path]);
    if (error) return NextResponse.json({ ok:false, error: error.message }, { status: 400 });

    return NextResponse.json({ ok:true });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message || "Unexpected error" }, { status: 500 });
  }
}