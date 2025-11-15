// app/api/admin/cleanup/order-payment/list/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/serverAdmin";

export const runtime = "nodejs";

const CHUNK = 200;

async function chunkedIn<T>(
  table: string,
  columns: string,
  field: string,
  ids: string[]
): Promise<{ ok: true; rows: T[] } | { ok: false; error: string; chunk: number }> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK);
    const { data, error } = await supabaseAdmin.from(table).select(columns).in(field, part);
    if (error) return { ok: false, error: error.message, chunk: Math.floor(i / CHUNK) };
    out.push(...((data as T[]) || []));
  }
  return { ok: true, rows: out };
}

export async function GET() {
  // 1) All orders (include question_id)
  const oRes = await supabaseAdmin
    .from("orders")
    .select("id, created_at, question_id")
    .order("created_at", { ascending: true });

  if (oRes.error) {
    return NextResponse.json({ ok: false, stage: "orders", error: oRes.error.message }, { status: 500 });
  }

  const orders = oRes.data || [];
  if (!orders.length) return NextResponse.json({ ok: true, items: [] });

  const orderIds = orders.map((o) => o.id as string);

  // 2) Payments by order (id, order_id, question_id)
  const p = await chunkedIn<{ id: string; order_id: string; question_id: string | null }>(
    "payments",
    "id, order_id, question_id",
    "order_id",
    orderIds
  );
  if (!p.ok) {
    return NextResponse.json({ ok: false, stage: "payments", error: p.error, chunk: p.chunk }, { status: 500 });
  }

  // Map payments per order and collect orphan payment IDs
  const byOrder: Record<string, { id: string; question_id: string | null }[]> = {};
  for (const row of p.rows) {
    if (!byOrder[row.order_id]) byOrder[row.order_id] = [];
    byOrder[row.order_id].push({ id: row.id, question_id: row.question_id });
  }

  // 3) Verify that orders.question_id exists in questions; else force NULL
  const qids = Array.from(new Set(orders.map((o) => o.question_id).filter((x): x is string => !!x)));
  const existingQ = new Set<string>();
  for (let i = 0; i < qids.length; i += CHUNK) {
    const part = qids.slice(i, i + CHUNK);
    const { data, error } = await supabaseAdmin.from("questions").select("id").in("id", part);
    if (error) {
      return NextResponse.json({ ok: false, stage: "questions_lookup", error: error.message }, { status: 500 });
    }
    for (const row of data || []) existingQ.add(row.id as string);
  }

  // 4) Build response
  const items = orders.map((o) => {
    const arr = byOrder[o.id] || [];
    const payment_ids = arr.map((r) => r.id);
    const orphan_payment_ids = arr.filter((r) => r.question_id == null).map((r) => r.id);
    const qid = o.question_id && existingQ.has(o.question_id) ? o.question_id : null;

    return {
      order_id: o.id,
      created_at: o.created_at,
      payments: payment_ids.length ? payment_ids : null,
      question_id: qid,           // only if exists in questions, else NULL
      orphan_payment_ids,
    };
  });

  return NextResponse.json({ ok: true, items });
}
