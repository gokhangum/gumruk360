// app/api/admin/questions/bulk-delete/list/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/serverAdmin";

export const runtime = "nodejs";

const CHUNK = 200; // number of ids per IN() batch

async function fetchAllIds<T extends { question_id: string }>(
  table: string,
  ids: string[],
  stage: string
): Promise<{ ok: true; rows: T[] } | { ok: false; stage: string; error: string; chunk: number }> {
  const rows: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK);
    const { data, error } = await supabaseAdmin
      .from(table)
      .select("question_id")
      .in("question_id", part);
    if (error) {
      return { ok: false, stage, error: error.message, chunk: i / CHUNK };
    }
    rows.push(...(data as T[] || []));
  }
  return { ok: true, rows };
}

/**
 * Lists ALL questions with metadata (blockers, attachments).
 * Uses chunked IN() queries to avoid network errors with long URLs.
 */
export async function GET() {
  try {
    // 1) All questions
    const qRes = await supabaseAdmin
      .from("questions")
      .select("id, title, created_at")
      .order("created_at", { ascending: true });

    if (qRes.error) {
      return NextResponse.json({ ok: false, stage: "questions", error: qRes.error.message }, { status: 502 });
    }
    const items = qRes.data || [];
    if (!items.length) return NextResponse.json({ ok: true, items: [] });
    const ids = items.map((q) => q.id);

    // 2) Blockers (RESTRICT) - chunked
    const b = await fetchAllIds<{ question_id: string }>("payment_request_items", ids, "blockers");
    if (!b.ok) {
      return NextResponse.json(b, { status: 502 });
    }
    const blockedCountByQ: Record<string, number> = {};
    for (const row of b.rows) {
      const k = row.question_id;
      blockedCountByQ[k] = (blockedCountByQ[k] ?? 0) + 1;
    }

    // 3) Attachments - chunked
    const a = await fetchAllIds<{ question_id: string }>("attachments", ids, "attachments");
    if (!a.ok) {
      return NextResponse.json(a, { status: 502 });
    }
    const attCountByQ: Record<string, number> = {};
    for (const row of a.rows) {
      const k = row.question_id;
      attCountByQ[k] = (attCountByQ[k] ?? 0) + 1;
    }

    const enriched = items.map((q) => ({
      id: q.id,
      title: q.title,
      created_at: q.created_at,
      blockers: blockedCountByQ[q.id] ?? 0,
      attachments: attCountByQ[q.id] ?? 0,
      has_attachments: (attCountByQ[q.id] ?? 0) > 0,
    }));

    return NextResponse.json({ ok: true, items: enriched });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, stage: "exception", error: String(e?.message || e) },
      { status: 502 }
    );
  }
}
