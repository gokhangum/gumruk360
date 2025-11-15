import { NextResponse } from "next/server";

/** Projedeki admin client export adını güvenle resolve eder */
async function getAdminClient() {
  let adminMod: any = null;
  let serverAdminMod: any = null;
  try { adminMod = await import("@/lib/supabase/admin"); } catch {}
  try { serverAdminMod = await import("@/lib/supabase/serverAdmin"); } catch {}

  const cand =
    adminMod?.supabaseAdmin ??
    serverAdminMod?.supabaseAdmin ??
    adminMod?.createAdminClient ??
    serverAdminMod?.createAdminClient ??
    null;

  if (!cand) throw new Error("Admin client export not found");
  // Hem instance hem factory’yi destekle
  return typeof cand === "function" ? await cand() : cand;
}

export async function POST(req: Request) {
  try {
    const { id, author_id } = await req.json();
    if (!id || !author_id) {
      return NextResponse.json({ ok: false, error: "ID_AND_AUTHOR_ID_REQUIRED" }, { status: 400 });
    }

    const supabase = await getAdminClient();

    const { error } = await supabase
      .from("blog_posts")
      .update({ author_id, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "ERR" }, { status: 500 });
  }
}
