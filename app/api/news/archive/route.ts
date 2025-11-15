import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const supa = supabaseAdmin;

    let id: string | null = null;
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const body = await req.json().catch(() => ({}));
      id = body?.id ?? null;
    } else if (ct.includes("form")) {
      const fd = await req.formData();
      id = String(fd.get("id") || "");
    }

    if (!id) {
      return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
    }

    const { error } = await supa
      .from("site_news")
      .update({ is_published: false, expires_at: null })
      .eq("id", id);

    if (error) throw error;
   if (ct.includes("form")) {
     // Formdan gelindiyse aynı liste sayfasına dön
    return NextResponse.redirect(new URL("/admin/news", req.url));
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message || "Archive failed" }, { status: 500 });
  }
}
