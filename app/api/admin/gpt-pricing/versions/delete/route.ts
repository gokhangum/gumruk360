import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

async function makeSupabase() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createServerClient(url, key, {
   cookies: {
  get: async (name) => (await cookies()).get(name)?.value, // ← sona VİRGÜL eklendi
  set: async (name, value, options?: CookieOptions) => {
    const c = await cookies();
    c.set(name, value, options as any);
  },
  remove: async (name, options?: CookieOptions) => {
    const c = await cookies();
    c.set(name, "", { ...options, maxAge: 0 });
  }
} // ← cookies objesini kapat
}); // ← createServerClient(...) çağrısını kapat

}

export async function POST(req: NextRequest) {
  const supabase = await makeSupabase();
  const { version_id } = await req.json();

  if (!version_id) return NextResponse.json({ error: "version_id gerekli" }, { status: 400 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { data: v } = await supabase.from("pricing_versions").select("*").eq("id", version_id).single();
  if (!v) return NextResponse.json({ error: "versiyon bulunamadı" }, { status: 404 });
  if (v.is_active) return NextResponse.json({ error: "aktif versiyon silinemez" }, { status: 400 });

  try {
    // ilişkili öğeleri sil
    await supabase.from("pricing_version_items").delete().eq("version_id", version_id);
    await supabase.from("pricing_ext_config").delete().eq("version_id", version_id);
    // versiyonu sil
    await supabase.from("pricing_versions").delete().eq("id", version_id);

    await supabase.from("audit_logs").insert({
      actor_id: user.id,
      actor_role: "admin",
      action: "delete",
      event: "pricing.version_deleted",
      resource_type: "pricing_version",
      resource_id: version_id
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
