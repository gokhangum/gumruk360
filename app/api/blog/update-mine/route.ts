// app/api/blog/update-mine/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { slugifyTr as slugify } from "@/lib/slug";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    // slug normalizasyonu: varsa slug'ı, yoksa title'ı kullan
   const rawSlug = (body?.slug ?? "").toString().trim();
   const normalizedSlug = rawSlug
     ? slugify(rawSlug)
     : (body?.title ? slugify(String(body.title)) : null);
    const supabase = await supabaseServer();

    const { error } = await supabase.rpc("fn_blog_update_mine", {
      p_id: body.id,
      p_title: body.title ?? null,
       p_slug: normalizedSlug ?? null,
      p_summary: body.summary ?? null,
      p_content_json: body.content_json ?? null,
      p_tags: body.tags ?? null,
      p_keywords: body.keywords ?? null,
      p_seo_title: body.seo_title ?? null,
      p_seo_description: body.seo_description ?? null,
      p_canonical_url_override: body.canonical_url_override ?? null,
      p_lang: body.lang ?? null,
      p_tenant_id: body.tenant_id ?? null,
      p_cover_image_path: body.cover_image_path ?? null,
    });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "ERR" }, { status: 500 });
  }
}
