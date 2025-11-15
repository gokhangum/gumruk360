export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
const ct = req.headers.get("content-type") || "";
let id: string | null = null;

if (ct.includes("application/json")) {
  const body = await req.json().catch(() => ({}));
  id = body?.id ?? null;
} else if (ct.includes("form")) {
  const fd = await req.formData();
  id = String(fd.get("id") || "");
}

if (!id) return NextResponse.json({ ok:false, error:"Missing id" }, { status:400 });


    const supa = supabaseAdmin;
    const { error } = await supa.from("site_news").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ ok:false, error: error.message }, { status: 400 });
    }
    revalidateTag("news");
   if (ct.includes("form")) {
     // Form gönderimlerinden sonra /admin/news sayfasına geri dön
    return NextResponse.redirect(new URL("/admin/news", req.url));
   }
    // JSON çağrıları için eski davranışı koru
    return NextResponse.json({ ok:true });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message || "Unexpected error" }, { status: 500 });
  }
}