 import { NextResponse } from "next/server";
 
 /** Resolve a Supabase admin client across project variants */
 async function getAdminClient() {
   let adminMod: any = null;
   let serverAdminMod: any = null;
   try { adminMod = await import("@/lib/supabase/admin"); } catch {}
   try { serverAdminMod = await import("@/lib/supabase/serverAdmin"); } catch {}

  const cand =
    (adminMod as any)?.supabaseAdmin ??
    (serverAdminMod as any)?.supabaseAdmin ??
    (adminMod as any)?.createAdminClient ??
  (serverAdminMod as any)?.createAdminClient ??
    null;
 
 if (!cand) throw new Error("Admin client export not found");
  return typeof cand === "function" ? await cand() : cand;
 }

 export async function POST(req: Request) {
   try {
     const form = await req.formData();
    const authorId = String(form.get("authorId") || "");
   const file = form.get("file") as File | null;

     if (!authorId) return new NextResponse(JSON.stringify({ error: "authorId required" }), { status: 400 });
     if (!file) return new NextResponse(JSON.stringify({ error: "file required" }), { status: 400 });

    const supabase = await getAdminClient();

   const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const filename = `avatar_${Date.now()}.${ext}`;
     const storageName = `authors/${authorId}/${filename}`; // bucket-relative path (NO leading 'blog/')

    // Upload to storage bucket 'blog'
    const arrayBuf = await file.arrayBuffer();
     const { error: upErr } = await supabase.storage.from("blog").upload(storageName, new Uint8Array(arrayBuf), {
      contentType: file.type || "image/jpeg",
      upsert: true,
    });
    if (upErr) throw upErr;

    const fullPath = `blog/${storageName}`; // we keep 'blog/' prefix in DB for consistency

    const { error: updErr } = await supabase
     .from("blog_authors")
     .update({ avatar_path: fullPath })
     .eq("id", authorId);
    if (updErr) throw updErr;

    // Optional public URL (if using public read)
    const { data: pub } = supabase.storage.from("blog").getPublicUrl(storageName);

    return NextResponse.json({ ok: true, path: fullPath, publicUrl: pub?.publicUrl || null });
  } catch (e: any) {
    return new NextResponse(JSON.stringify({ error: e?.message || "Unknown error" }), { status: 500 });
  }
 }
