// app/api/blog/upload/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

function slugifyName(name: string) {
  return name
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9.\-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

export async function POST(req: Request) {
  try {
    const supabase = await supabaseServer();

    // (opsiyonel) yetki kontrolü
    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userRes?.user?.id) {
      return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }

    const form = await req.formData();
    const postId = String(form.get("postId") || "");
    const setAsCover = String(form.get("setAsCover") || "") === "true";
    const file = form.get("file") as File | null;

    if (!postId || !file) {
      return NextResponse.json({ ok: false, error: "postId and file required" }, { status: 400 });
    }

    const orig = file.name || "upload.bin";
    const name = `${Date.now()}-${slugifyName(orig)}`;
    const path = `${postId}/${name}`; // bucket-relative

    // 1) Upload
    const buf = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await supabase.storage
      .from("blog")
      .upload(path, buf, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
    if (upErr) {
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 400 });
    }

    // 2) (opsiyonel) blog_assets kaydı — trigger varsa zaten ekler, ama zarar vermez
    // Hata verse bile akışı kesmek istemiyorsan ayrı try-catch kullan:
    try {
      const { error: assetErr } = await supabase.rpc("fn_blog_asset_add", {
        p_post_id: postId,
        p_file_path: path,
        p_alt_text: null,
        p_mime: file.type || null,
        p_width: null,
        p_height: null,
        p_kind: "inline",
        p_position: null,
      });
      // assetErr olursa görmezden gelebilirsin; trigger bunu zaten yapıyor olabilir
    } catch { /* no-op */ }

    // 3) Kapak: setAsCover=true ise kapağı direkt yaz; değilse boşsa yaz
    if (setAsCover) {
      const { error: coverErr } = await supabase.rpc("fn_blog_update_mine", {
        p_id: postId,
        p_cover_image_path: path,
      });
      if (coverErr) {
        // kritik değil; 207 ile bilgi verebilirsin
        return NextResponse.json({
          ok: true,
          path,
          warning: `cover not updated: ${coverErr.message}`
        }, { status: 207 });
      }
    } else {
      const { error: coverNullErr } = await supabase.rpc("fn_blog_set_cover_if_null", {
        p_post_id: postId,
        p_object_name: path,
      });
      // coverNullErr olursa da kritik değil; devam
    }

    // 4) Public URL
    const { data: pub } = supabase.storage.from("blog").getPublicUrl(path);
    return NextResponse.json({ ok: true, path, publicUrl: pub.publicUrl });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "UPLOAD_ERROR" }, { status: 500 });
  }
}
