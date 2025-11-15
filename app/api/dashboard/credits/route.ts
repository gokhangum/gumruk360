// app/api/dashboard/credits/route.ts
import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/serverAdmin"
import { supabaseServer } from "@/lib/supabaseServer"

type LedgerRow = {
  id: string
  scope_type: "user" | "org"
  scope_id: string
  change: number
  reason: string
  question_id?: string | null
  order_id?: string | null
  created_at: string
  meta?: any
}

async function getSessionUid(): Promise<string | null> {
  try {
    const s = await supabaseServer()
    const { data: { user } } = await s.auth.getUser()
    if (user?.id) return user.id as string
  } catch {}
  return null
}

// Robust resolver: only auth.users via admin API, iterate pages
async function resolveUidByEmailFromAuth(email: string): Promise<string | null> {
  const target = (email || "").trim().toLowerCase()
  if (!target) return null
  try {
    let page = 1
    const perPage = 200
    while (page <= 20) { // up to 4000 users scanned
      const res = await supabaseAdmin.auth.admin.listUsers({ page, perPage })
      const users = res?.data?.users || []
      if (!users.length) break
      const hit = users.find(u => (u.email || "").toLowerCase() === target)
      if (hit?.id) return hit.id as string
      if (users.length < perPage) break
      page += 1
    }
  } catch (e) {}
  return null
}

function toCsv(rows: LedgerRow[]): string {
  const header = ["id","scope_type","scope_id","change","reason","question_id","order_id","created_at"]
  const lines = [header.join(",")]
  for (const r of rows) {
    lines.push([
      r.id,
      r.scope_type,
      r.scope_id,
      Number(r.change).toFixed(4),
      (r.reason ?? "").replaceAll(",", " "),
      r.question_id ?? "",
      r.order_id ?? "",
      new Date(r.created_at).toISOString()
    ].join(","))
  }
  return lines.join("\n")
}

export async function GET(req: Request) {
  const trace: string[] = []
  try {
    const url = new URL(req.url)
    const format     = url.searchParams.get("format") || "json"
    const uidParam   = url.searchParams.get("user_id")
    const emailParam = url.searchParams.get("email")

    // 1) Session
    let uid = await getSessionUid()
    if (uid) trace.push("[uid] from session")

    // 2) ?user_id
    if (!uid && uidParam) {
      uid = uidParam
      trace.push("[uid] from query user_id")
    }

    // 3) ?email -> auth.users (admin API)
    if (!uid && emailParam) {
      trace.push("[uid] resolving by email via auth.admin.listUsers")
      uid = await resolveUidByEmailFromAuth(emailParam)
      if (uid) trace.push("[uid] resolved by email via auth.admin")
    }

    if (!uid) {
      return NextResponse.json({ ok:false, error:"auth_required", hint:"Provide ?user_id=<uuid> or ?email=<mail> (dev) or ensure session.", trace }, { status: 401 })
    }

    const { data: purchasesRaw, error: pErr } = await supabaseAdmin
      .from("credit_ledger")
      .select("id, change, created_at, reason, order_id, scope_type, scope_id")
      .eq("scope_type", "user")
      .eq("scope_id", uid)
      .gt("change", 0)
      .in("reason", ["purchase", "credit_purchase"])
      .order("created_at", { ascending: false })
      .limit(3)

    if (pErr) throw new Error(pErr.message)

    const { data: usageRaw, error: uErr } = await supabaseAdmin
      .from("credit_ledger")
      .select("id, change, created_at, reason, question_id, scope_type, scope_id")
      .eq("scope_type", "user")
      .eq("scope_id", uid)
      .lt("change", 0)
      .order("created_at", { ascending: false })
      .limit(20)

    if (uErr) throw new Error(uErr.message)

    // Fetch question titles for usage rows
    const qids = Array.from(new Set((usageRaw || []).map(r => r.question_id).filter(Boolean)));
    let qTitleMap: Record<string, string> = {};
    if (qids.length > 0) {
      const { data: qRows, error: qErr } = await supabaseAdmin
        .from("questions")
        .select("id, title")
        .in("id", qids as string[]);
      if (qErr) throw new Error(qErr.message);
      qTitleMap = Object.fromEntries((qRows || []).map((q: any) => [q.id, q.title]));
    }


    const purchases = (purchasesRaw ?? []).map(r => ({
      id: r.id, change: Number(r.change), created_at: r.created_at, reason: r.reason, order_id: r.order_id
    }))

    const usage = (usageRaw ?? []).map(r => ({
      id: r.id, change: Number(r.change), created_at: r.created_at, reason: r.reason, question_id: r.question_id,
      question_title: r.question_id ? qTitleMap[r.question_id] ?? null : null
    }))

    if (format === "csv") {
      const { data: allRows, error: aErr } = await supabaseAdmin
        .from("credit_ledger")
        .select("*")
        .eq("scope_type", "user")
        .eq("scope_id", uid)
        .order("created_at", { ascending: false })
        .limit(1000)

      if (aErr) throw new Error(aErr.message)

      const csv = toCsv((allRows ?? []) as any)
      return new Response(csv, {
        status: 200,
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": 'attachment; filename="credit_ledger.csv"'
        }
      })
    }

    return NextResponse.json({ ok:true, purchases, usage, scope: { type: "user", id: uid }, trace })
  } catch (e: any) {
    trace.push(`[error] ${e?.message || "internal_error"}`)
    return NextResponse.json({ ok:false, error: e?.message || "internal_error", trace }, { status: 500 })
  }
}
