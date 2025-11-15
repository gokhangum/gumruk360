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

// Return two lists: profiles (worker/worker360/admin) and blog_authors (custom authors)
export async function GET() {
  try {
    const supabase = await getAdminClient();

    const { data: profiles, error: pErr } = await supabase
      .from("profiles")
      .select("id, full_name, role")
      .in("role", ["worker", "worker360", "admin"])
      .order("full_name", { ascending: true });

    if (pErr) throw pErr;

    const { data: authors, error: aErr } = await supabase
      .from("blog_authors")
      .select("id, name, title")
      .order("name", { ascending: true });

    if (aErr) throw aErr;

    return NextResponse.json({ profiles: profiles ?? [], authors: authors ?? [] });
  } catch (e: any) {
    return new NextResponse(JSON.stringify({ error: e?.message || "Unknown error" }), { status: 500 });
  }
}