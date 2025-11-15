import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Revize Tamamla
 * - Sadece `revisions` tablosuna insert (content + content_html + summary)
 * - `questions.answer_status = 'completed'`
 * - Next.js 15.5.2 (Turbopack) için params await uyumlu
 */

type CtxParams = { params: { id: string } } | { params: Promise<{ id: string }> };

function stripHtml(input: string | null | undefined): string {
  if (!input) return "";
  // basit HTML temizleyici
  const noTags = String(input).replace(/<[^>]*>/g, " ");
  return noTags.replace(/\s+/g, " ").trim();
}

export async function POST(req: Request, ctx: CtxParams) {
  try {
    // params güvenli çöz
    const p: any = (ctx as any)?.params;
    const resolved = typeof p?.then === "function" ? await p : p;
    const questionId: string | undefined = resolved?.id;
    if (!questionId) {
      return NextResponse.json({ ok: false, error: "Missing question id" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const content: string | null = body?.content ?? null;
    const content_html: string | null = body?.content_html ?? null;
    let summary: string | null = body?.summary ?? null;
    const source: string = "editor";

    // Eğer summary gelmemişse otomatik üret
    if (!summary || String(summary).trim().length === 0) {
      const basis = (content_html && String(content_html).trim().length > 0)
        ? stripHtml(content_html)
        : (content ?? "");
      const auto = stripHtml(basis).slice(0, 400);
      summary = auto || null;
    }

    // Supabase admin
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!url || !serviceKey) {
      return NextResponse.json({ ok: false, error: "Supabase env missing" }, { status: 500 });
    }
    const supabaseAdmin = createClient(url, serviceKey, { auth: { persistSession: false } });

    // Question fetch -> created_by
    const { data: qRow, error: qErr } = await supabaseAdmin
      .from("questions")
      .select("assigned_to, answer_status")
      .eq("id", questionId)
      .single();
    if (qErr) {
      return NextResponse.json({ ok: false, error: `Question fetch error: ${qErr.message}` }, { status: 500 });
    }
    const created_by: string | null =
      (qRow?.assigned_to as string | null) ?? process.env.DEFAULT_DRAFT_OWNER_ID ?? null;

    // next revision_no
    const { data: lastRev, error: lastErr } = await supabaseAdmin
      .from("revisions")
      .select("revision_no")
      .eq("question_id", questionId)
      .order("revision_no", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastErr && lastErr.code !== "PGRST116") {
      return NextResponse.json({ ok: false, error: `Revision fetch error: ${lastErr.message}` }, { status: 500 });
    }
    const nextRevisionNo = ((lastRev?.revision_no as number | null) ?? 0) + 1;

    // insert to revisions
    const insertPayload: any = {
      question_id: questionId,
      content,
      content_html,
      summary,
      source,
      revision_no: nextRevisionNo,
      created_by,
    };
    const { data: ins, error: insErr } = await supabaseAdmin
      .from("revisions")
      .insert(insertPayload)
      .select("id, revision_no, summary")
      .single();
    if (insErr) {
      return NextResponse.json({ ok: false, error: `Revision insert error: ${insErr.message}` }, { status: 500 });
    }

    // mark question completed
    const { error: upErr } = await supabaseAdmin
      .from("questions")
      .update({ answer_status: "completed" })
      .eq("id", questionId);
    if (upErr) {
      return NextResponse.json({ ok: false, error: `Question update error: ${upErr.message}` }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      mode: "revisions_only",
      draft_id: null,
      version: null,
      revision_ingested: true,
      revision_no: ins?.revision_no ?? nextRevisionNo,
      summary: ins?.summary ?? summary ?? null,
      status: "completed",
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? "Unhandled error" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
export const revalidate = 0;
