import { NextResponse } from "next/server"
import { supabaseAuthServer as supabaseAuth } from "@/lib/supabaseAuth"
import { supabaseServer } from "@/lib/supabaseServer"
import { logAudit } from "@/lib/audit"
import { Resend } from "resend"
import { MAIL, OWNER } from "@/lib/config/appEnv";

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

type QRow = { id: string; user_id: string; status: string | null }

const ALLOWED = new Set(["submitted", "approved", "rejected", "paid"])
function parseAdminEmailsFromEnv(): string[] {
   const raw =
     process.env.ADMIN_NOTIFY_EMAILS ||   // yeni anahtar (öncelikli)
     process.env.ADMIN_EMAILS ||          // geriye uyum
     process.env.PAYMENT_ADMIN_EMAILS ||  // geriye uyum
     ""
  return raw.split(/[;,]/g).map(s => s.trim()).filter(Boolean)
}

async function getAdminEmails(db: Awaited<ReturnType<typeof supabaseServer>>): Promise<string[]> {
  const fromEnv = parseAdminEmailsFromEnv()
  if (fromEnv.length) return fromEnv

  const { data, error } = await db
    .from("profiles")
    .select("email")
    .eq("role", "admin")
    .not("email", "is", null)

  if (error || !data) return []
    if (!error && data && data.length) {
    return (data as Array<{ email: string | null }>).map(r => r.email!).filter(Boolean)
  }
  // Config fallback: ENV -> config -> owner
  if (MAIL.adminNotify?.length) return MAIL.adminNotify as string[]
  if (OWNER.email) return [OWNER.email]
  return []
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    // Auth
    const auth = await supabaseAuth()
    const { data: u, error: ue } = await auth.auth.getUser()
    if (ue || !u?.user) return NextResponse.json({ ok:false, error:"auth_required" }, { status: 401 })
    const uid = u.user.id

    // Body
    const body = await req.json().catch(() => ({}))
    const next: string = String(body?.status || "").toLowerCase()
    if (!ALLOWED.has(next)) {
      return NextResponse.json({ ok:false, error:"invalid_status" }, { status: 400 })
    }

    // Kayıt & sahiplik
    const sb = await supabaseServer()
   const { data: q, error: qErr } = await sb
   .from("questions")
      .select("id,user_id,status")
     .eq("id", id)
     .maybeSingle<QRow>()

    if (qErr || !q) return NextResponse.json({ ok:false, error:"not_found" }, { status: 404 })
    if (q.user_id !== uid) return NextResponse.json({ ok:false, error:"forbidden" }, { status: 403 })

    // Güncelle
    const { error: upErr } = await sb.from("questions").update({ status: next }).eq("id", q.id)
    if (upErr) return NextResponse.json({ ok:false, error: upErr.message }, { status: 500 })
// ----- E-POSTA + NOTIFICATION (sadece rejected) -----
if (next === "rejected") {
  const FROM =
    process.env.MAIL_FROM ||
    process.env.RESEND_FROM ||
    `${MAIL.fromName} <${MAIL.fromEmail}>`

  const admins = await getAdminEmails(sb)

  // Admin listesi boşsa teşhis kaydı bırak
  if (!admins || admins.length === 0) {
    try {
      await sb.from("notification_logs").insert({
        event: "offer.rejected",
        to_email: "",
        subject: "SKIP: no admins",
        template: "offer_rejected_admin",
        provider: "resend",
        provider_id: null,
        status: "skipped_no_admin",
        error: null,
        payload: { reason: "no_admins", from: FROM },
        entity_type: "question",
        entity_id: q.id,
      } as any)
    } catch {}
  } else {
    // Kullanıcı e-postası (bilgi)
    let userEmail = ""
    try {
      const { data: prof } = await sb
        .from("profiles")
        .select("email")
        .eq("id", q.user_id)
        .maybeSingle()
      userEmail = (prof as any)?.email || ""
    } catch {}

    const origin = new URL(req.url).origin
    const adminUrl = `${origin}/admin/request/${q.id}`

    const subject = `Teklif reddedildi – Soru ${q.id} / Offer rejected – Question ${q.id}`
    const bodyText = [
      "Kullanıcı teklifimizi reddetti.",
      userEmail ? `Kullanıcı: ${userEmail}` : "",
      `Soru ID: ${q.id}`,
      `Önceki durum: ${q.status ?? "—"}`,
      `Yeni durum: ${next}`,
      "",
      `Yönetim bağlantısı: ${adminUrl}`,
    ].filter(Boolean).join("\n")

    // Basit HTML (template bağımlılığı olmadan)
    const html =
      `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;line-height:1.5">
         <h2 style="margin:0 0 12px 0">Teklif Reddedildi / Offer Rejected</h2>
         <pre style="white-space:pre-wrap;margin:0">${bodyText.replace(/</g,"&lt;")}</pre>
       </div>`

    let status: "sent" | "failed" = "failed"
    let provider_id: string | null = null
    let errorMsg: string | null = null

    try {
      const resend = new Resend(process.env.RESEND_API_KEY!)
      const { data, error } = await resend.emails.send({
        from: FROM,
        to: admins,
        subject,
        html,
        // Teşhis için tags'i şimdilik kapalı tutalım; gerekirse açarız.
        // tags: [
        //   { name: "event", value: "offer.rejected" },
        //   { name: "entity", value: "question" },
        //   { name: "entity_id", value: q.id },
        // ],
      })
      if (error) {
        status = "failed"
        errorMsg = String((error as any)?.message || error)
      } else {
        provider_id = data?.id ?? null
        status = "sent"
      }
    } catch (e:any) {
      status = "failed"
      errorMsg = String(e?.message || e)
    }

    try {
      await sb.from("notification_logs").insert({
        event: "offer.rejected",
        to_email: admins.join(","),
        subject,
        template: "offer_rejected_admin",
        provider: "resend",
        provider_id,
        status,
        error: errorMsg,
        payload: {
          question_id: q.id,
          user_id: q.user_id,
          prev_status: q.status,
          next_status: next,
          to: admins,
          admin_url: adminUrl,
          from: FROM,
        },
        entity_type: "question",
        entity_id: q.id,
      } as any)
    } catch {}
  }
}

    // Audit (UI’da göstermiyoruz; DB’de kalsın)
    const action =
      next === "approved" ? "question_approved" :
      next === "rejected" ? "question_rejected" :
      next === "paid"     ? "question_paid"     :
                            "question_marked_submitted"
    try { await logAudit({ user_id: uid, question_id: q.id, action }) } catch {}

    return NextResponse.json({ ok:true })
  } catch (e:any) {
    return NextResponse.json({ ok:false, error:"internal_error", detail:String(e?.message || e) }, { status: 500 })
  }
}
