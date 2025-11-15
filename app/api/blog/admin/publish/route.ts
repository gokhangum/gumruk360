// app/api/blog/admin/publish/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { slugifyTr as slugify } from "@/lib/slug";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { id, publishedAt, slug, title } = await req.json();
 const supabase = await supabaseServer();
     // (Opsiyonel) slug normalizasyonu: body.slug varsa onu, yoksa title'dan üret
     const rawSlug = (slug ?? "").toString().trim();
     const normalizedSlug = rawSlug
      ? slugify(rawSlug)
       : (title ? slugify(String(title)) : null);
    if (normalizedSlug) {
      const { error: updErr } = await supabase
        .from("blog_posts")
       .update({ slug: normalizedSlug })
       .eq("id", id);
      if (updErr) {
      return NextResponse.json({ ok: false, error: updErr.message }, { status: 400 });
       }
    }
    const { error } = await supabase.rpc("fn_blog_admin_publish", {
      p_id: id,
      p_published_at: publishedAt ?? null,
    });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, id, slug: normalizedSlug ?? slug ?? null });

  } catch (e: any) {
    const msg = e?.message || "Unexpected error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
