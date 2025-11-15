export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const targetPath = String(form.get("path") || "");
    if (!file) return NextResponse.json({ ok:false, error: "No file" }, { status: 400 });
    if (!targetPath) return NextResponse.json({ ok:false, error: "Missing path" }, { status: 400 });

    const arrayBuffer = await file.arrayBuffer();
    const supa = supabaseAdmin;
    const { data, error } = await supa.storage.from("news").upload(targetPath, Buffer.from(arrayBuffer), {
      upsert: true,
      contentType: file.type || "application/octet-stream",
    });
    if (error) return NextResponse.json({ ok:false, error: error.message }, { status: 400 });

    const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/${data?.path}`
      : `/storage/v1/object/public/${data?.path}`;

    return NextResponse.json({ ok:true, path: data?.path, publicUrl });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message || "Unexpected error" }, { status: 500 });
  }
}