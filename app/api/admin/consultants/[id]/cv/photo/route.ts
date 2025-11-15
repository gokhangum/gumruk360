import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const BUCKET = "workers-cv";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "file is required" }, { status: 400 });
  }

  const objectPath = `${id}/profile.jpg`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(objectPath, file, {
      upsert: true,
      contentType: file.type || "image/jpeg",
      cacheControl: "3600"
    });

  if (upErr) {
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 400 });
  }

  // Return a signed URL so client can persist preview immediately
  const { data, error: urlErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(objectPath, 60 * 60 * 24 * 365);

  if (urlErr || !data?.signedUrl) {
    return NextResponse.json({ ok: true }); // upload ok, but url couldn't be created
  }

  return NextResponse.json({ ok: true, url: data.signedUrl });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const objectPath = `${id}/profile.jpg`;
  const { error } = await supabase.storage.from(BUCKET).remove([objectPath]);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
