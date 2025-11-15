// app/api/blog/cover/set/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { postId, objectName } = await req.json();
    if (!postId || !objectName) {
      return NextResponse.json({ ok: false, error: "postId and objectName are required" }, { status: 400 });
    }

    const supabase = await supabaseServer();
    const { error } = await supabase.rpc("fn_blog_set_cover", {
      p_post_id: postId,
      p_object_name: objectName,
    });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e:any) {
    return NextResponse.json({ ok: false, error: e?.message || "ERR" }, { status: 500 });
  }
}
