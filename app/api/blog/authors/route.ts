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
    const body = await req.json().catch(() => ({}));
    const name = (body?.name ?? "").trim();
    const title = (body?.title ?? "").trim() || null;
    const bio = (body?.bio ?? "").trim() || null;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const supabase = await getAdminClient();

    const { data, error } = await supabase
      .from("blog_authors")
      .insert({ name, title, bio })
      .select("id, name, title")
      .single();

    if (error) throw error;

    return NextResponse.json({ author: data });
  } catch (e: any) {
    return new NextResponse(JSON.stringify({ error: e?.message || "Unknown error" }), { status: 500 });
  }
}