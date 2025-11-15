import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabaseServer"
import { supabaseAuthServer as supabaseAuth } from "@/lib/supabaseAuth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

type QRow = { id: string; user_id: string | null; tenant_id: string | null }

function getClientInfo(req: Request) {
  const ip =
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    null
  const user_agent = req.headers.get("user-agent") || null
  return { ip, user_agent }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params

    // Oturum
    const a = await supabaseAuth()
    const { data: ures } = await a.auth.getUser()
    const uid = ures?.user?.id || null
    if (!uid) return NextResponse.json({ ok:false, error:"auth_required" }, { status: 401 })

    // Soru & sahiplik
    const sb = await supabaseServer()
   const { data: q, error: qErr } = await sb
     .from("questions")
     .select("id,user_id,tenant_id")
     .eq("id", id)
     .maybeSingle<QRow>()

    if (qErr || !q) return NextResponse.json({ ok:false, error:"not_found" }, { status: 404 })
    if (q.user_id !== uid) return NextResponse.json({ ok:false, error:"forbidden" }, { status: 403 })

    // AUDIT: şartlar kabul edildi
    const { ip, user_agent } = getClientInfo(req)
    const auditRow: any = {
      action: "tos.accepted",
      event: "tos.accepted",
      resource_type: "question",     // NOT NULL
      resource_id: q.id,
      payload: {},
      tenant_id: q.tenant_id ?? null,
      user_id: uid,
      question_id: q.id,
      actor_role: "customer",
      actor_id: uid,
      actor_user_id: uid,
      ip,
      user_agent,
    }
    await sb.from("audit_logs").insert(auditRow)

    return NextResponse.json({ ok:true })
  } catch (e: any) {
    return NextResponse.json({ ok:false, error: String(e?.message || e) }, { status: 500 })
  }
}