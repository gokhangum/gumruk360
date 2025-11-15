export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    // Required: title, slug, lang, content_json
    const required = ["title","slug","lang","content_json"];
    for (const k of required) {
      if (!body?.[k]) {
        return NextResponse.json({ ok:false, error:`Missing field: ${k}` }, { status: 400 });
      }
    }
    // Default published true; allow toggling
    const payload = {
      tenant_id: body.tenant_id ?? null,
      lang: body.lang,
      title: body.title,
      slug: body.slug,
      summary: body.summary ?? null,
      content_json: body.content_json,
      cover_image_path: body.cover_image_path ?? null,
      is_published: body.is_published ?? true,
      published_at: body.published_at ?? null,
      expires_at: body.expires_at ?? null,
      is_pinned: body.is_pinned ?? false,
      seo_title: body.seo_title ?? null,
      seo_description: body.seo_description ?? null,
      keywords: body.keywords ?? null,
      created_by: body.created_by ?? null,
      updated_by: body.updated_by ?? null,
    };

    const supa = supabaseAdmin;
    const { data, error } = await supa.from("site_news").insert(payload).select().single();
    if (error) {
      return NextResponse.json({ ok:false, error: error.message }, { status: 400 });
    }
    revalidateTag("news");
    return NextResponse.json({ ok:true, data });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message || "Unexpected error" }, { status: 500 });
  }
}