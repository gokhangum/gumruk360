// app/api/admin/questions/[id]/revisions/ingest-draft/route.ts
import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { isAdmin } from "@/lib/auth/requireAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };;

const badRequest = (m: string) => NextResponse.json({ ok: false, error: m }, { status: 400 });
const unauthorized = () => NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
const notFound = (m = "draft not found") =>
  NextResponse.json({ ok: false, error: m }, { status: 404 });

function isUuidLike(s: any) {
  return typeof s === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

async function getDraftById(questionId: string, draftId: string) {
  return await supabaseAdmin
    .from("answer_drafts")
    .select("id, question_id, content, created_by")
    .eq("id", draftId)
    .eq("question_id", questionId)
    .maybeSingle();
}

async function getLatestDraft(questionId: string) {
  const { data, error } = await supabaseAdmin
    .from("answer_drafts")
    .select("id, question_id, content, created_by")
    .eq("question_id", questionId)
    .order("id", { ascending: false })
    .limit(1);

  return { data: (data && data[0]) ?? null, error };
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const ok = await isAdmin(req);
    if (!ok) return unauthorized();

    const { id: questionId } = await params;
    if (!questionId) return badRequest("id (questionId) gerekli");

    const body = await req.json().catch(() => ({}));
    const draftId = isUuidLike(body?.draftId) ? String(body.draftId) : undefined;

    let draftRow: any | null = null;

    if (draftId) {
      const { data, error } = await getDraftById(questionId, draftId);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      if (!data) return notFound();
      draftRow = data;
    } else {
      const { data, error } = await getLatestDraft(questionId);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      if (!data) return notFound("no drafts for this question");
      draftRow = data;
    }

    if (!draftRow?.content) return badRequest("draft content boş");

    const createdBy =
      typeof draftRow?.created_by === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        draftRow.created_by
      )
        ? draftRow.created_by
        : null;

    const { data: rev, error: insErr } = await supabaseAdmin
      .from("answer_revisions")
      .insert({
        question_id: questionId,
        content: String(draftRow.content),
        summary: `imported from draft ${draftRow.id}`,
        source: "import",
        created_by: createdBy,
      })
      .select("id, question_id, revision_no, summary, source, created_by, created_at")
      .single();

    if (insErr) {
      return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data: rev });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "ingest draft failed" },
      { status: 500 }
    );
  }
}
