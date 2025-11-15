export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const id = body?.id;
    if (!id) return NextResponse.json({ ok:false, error:"Missing id" }, { status: 400 });

    const patch = { ...body };
    delete patch.id;

    const supa = supabaseAdmin;
    const { data, error } = await supa.from("site_news").update(patch).eq("id", id).select().single();
    if (error) {
      return NextResponse.json({ ok:false, error: error.message }, { status: 400 });
    }
    revalidateTag("news");
    return NextResponse.json({ ok:true, data });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message || "Unexpected error" }, { status: 500 });
  }
}