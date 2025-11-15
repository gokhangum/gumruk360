import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";


export const dynamic = "force-dynamic";

function serverClient() {
  return (async () => {
    
  const supabase = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    cookies: {
      get: async (name: string) => (await cookies()).get(name)?.value,
      set: async (name: string, value: string, options?: CookieOptions) => {
        const c = await cookies();
        c.set(name, value, options as any);
      },
      remove: async (name: string, options?: CookieOptions) => {
        const c = await cookies();
        c.set(name, "", { ...(options as any), maxAge: 0 });
      },
    },
  }
);

    return supabase;
  })();
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!id) return NextResponse.json({ ok: false, display: "missing_question_id" }, { status: 400 });

    const supabase = await serverClient();

    // Auth: get current user
    const { data: u, error: uErr } = await supabase.auth.getUser();
    if (uErr || !u?.user) {
      return NextResponse.json({ ok: false, display: "unauthorized" }, { status: 401 });
    }
    const userId = u.user.id;

    // Check question with RLS (worker must be authorized to see this question)
    const { data: q, error: qErr, status: qStatus } = await supabase
      .from("questions")
      .select("id")
      .eq("id", id)
      .maybeSingle();

    if (qErr && qStatus === 401) {
      return NextResponse.json({ ok: false, display: "unauthorized" }, { status: 401 });
    }
    if (!q) {
      return NextResponse.json({ ok: false, display: "question_not_found" }, { status: 404 });
    }

    // compute next version from existing drafts (RLS-protected)
    let nextVersion = 1;
    const { data: lastDraft } = await supabase
      .from("answer_drafts")
      .select("version")
      .eq("question_id", id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastDraft?.version && Number.isFinite(Number(lastDraft.version))) {
      nextVersion = Number(lastDraft.version) + 1;
    }

    // fallback content from latest revision (optional)
    let draftContent: string | null = null;
    try {
      const { data: lastRev } = await supabase
        .from("revisions")
        .select("content")
        .eq("question_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastRev?.content) draftContent = String(lastRev.content);
    } catch {}

    // Insert new draft (created_by NOT NULL)
    const insertRes = await supabase
      .from("answer_drafts")
      .insert({
        question_id: id,
        version: nextVersion,
        content: draftContent ?? "",
        model: "worker/manual",
        created_by: userId,
      })
      .select("id, version, created_at")
      .maybeSingle();

    if (insertRes.error) {
      // Common causes: RLS insert denied, missing columns
      return NextResponse.json({ ok: false, display: "insert_failed", error: insertRes.error?.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data: insertRes.data }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, display: "unexpected_error", error: String(e?.message || e) }, { status: 500 });
  }
}
