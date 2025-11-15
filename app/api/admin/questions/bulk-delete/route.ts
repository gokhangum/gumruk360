// app/api/admin/questions/bulk-delete/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/serverAdmin";

export const runtime = "nodejs";

const CHUNK = 200;

type Req = { ids: string[]; dryRun?: boolean };

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
    rows.push(...((data as T[]) || []));
  }
  return { ok: true, rows };
}

/**
 * Bulk delete endpoint.
 * - Detect RESTRICT blockers (payment_request_items). Blocked questions are reported and skipped.
 * - For deletable questions: remove attachment files from Storage, then delete questions (DB cascades handle dependents).
 * - dryRun=true -> no deletion, returns preview/report.
 */
export async function POST(req: Request) {
  try {
    // TODO: enforce admin/owner guard if your project requires it.
    const body = (await req.json()) as Req;
    const ids = Array.isArray(body.ids) ? body.ids : [];
    const dryRun = !!body.dryRun;

    if (!ids.length) {
      return NextResponse.json({ ok: false, error: "ids[] boş." }, { status: 400 });
    }

    // 1) Blockers (payment_request_items -> RESTRICT), chunked
    const b = await fetchAllIds<{ question_id: string }>("payment_request_items", ids, "blockers");
    if (!b.ok) {
      return NextResponse.json(b, { status: 502 });
    }

    const blockedSet = new Set<string>();
    const counts: Record<string, number> = {};
    for (const row of b.rows) {
      counts[row.question_id] = (counts[row.question_id] ?? 0) + 1;
    }
    const blockDetails: { id: string; reason: string; count: number }[] = [];
    for (const [qid, c] of Object.entries(counts)) {
      if (c > 0) {
        blockedSet.add(qid);
        blockDetails.push({ id: qid, reason: "payment_request_items RESTRICT", count: c });
      }
    }

    const deletable = ids.filter((id) => !blockedSet.has(id));
    if (!deletable.length) {
      return NextResponse.json({
        ok: true,
        dryRun,
        requested: ids.length,
        deletable: 0,
        deleted: 0,
        storageRemoved: 0,
        blocked: blockDetails,
        note: "Seçilenlerin tamamı RESTRICT nedeniyle bloklu.",
      });
    }

    // 2) Files (bucket/object_path) for deletable questions
    const { data: files, error: fErr } = await supabaseAdmin
      .from("attachments")
      .select("bucket, object_path, question_id")
      .in("question_id", deletable);

    if (fErr) {
      return NextResponse.json({ ok: false, error: fErr.message, stage: "attachments" }, { status: 500 });
    }

    if (dryRun) {
      const storagePreviewByBucket: Record<string, number> = {};
      for (const f of files ?? []) {
        storagePreviewByBucket[f.bucket] = (storagePreviewByBucket[f.bucket] ?? 0) + 1;
      }
      return NextResponse.json({
        ok: true,
        dryRun: true,
        requested: ids.length,
        deletable: deletable.length,
        blocked: blockDetails,
        storagePreviewByBucket,
        sampleFiles: (files ?? []).slice(0, 10),
      });
    }

    // 3) Remove from Storage (grouped by bucket)
    let storageRemoved = 0;
    const storageErrors: { bucket: string; error: string }[] = [];
    const byBucket = new Map<string, string[]>();
    for (const f of files ?? []) {
      if (!byBucket.has(f.bucket)) byBucket.set(f.bucket, []);
      byBucket.get(f.bucket)!.push(f.object_path);
    }

    for (const [bucket, paths] of byBucket.entries()) {
      if (!paths.length) continue;
      const { error } = await supabaseAdmin.storage.from(bucket).remove(paths);
      if (error) {
        storageErrors.push({ bucket, error: error.message });
      } else {
        storageRemoved += paths.length;
      }
    }

    // 4) Delete questions from DB (cascades / set null will apply)
    const { error: dErr, count } = await supabaseAdmin
      .from("questions")
      .delete({ count: "exact" })
      .in("id", deletable);

    if (dErr) {
      return NextResponse.json({
        ok: false,
        error: `DB delete failed: ${dErr.message}`,
        storageRemoved,
        blocked: blockDetails,
        storageErrors,
      }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      requested: ids.length,
      deletable: deletable.length,
      deleted: count ?? 0,
      storageRemoved,
      blocked: blockDetails,
      storageErrors,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, stage: "exception", error: String(e?.message || e) },
      { status: 502 }
    );
  }
}
