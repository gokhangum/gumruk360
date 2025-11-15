import { NextRequest, NextResponse } from "next/server"
import { Resend } from "resend"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { BRAND, MAIL } from "@/lib/config/appEnv";
function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createAdminClient(url, key, { auth: { persistSession: false } })
}

const resendKey = process.env.RESEND_API_KEY!
const resend = new Resend(resendKey)

function getBrandAndBaseUrl(lang: "tr" | "en") {
  const brand = lang === "en" ? BRAND.nameEN : BRAND.nameTR
  const baseUrl =
    lang === "en"
      ? process.env.APP_BASE_URL_EN || "http://127.0.0.1:3000"
      : process.env.APP_BASE_URL_TR || "http://localhost:3000"

   const fromEmail =
     process.env.MAIL_FROM ||        // tam "İsim <email@...>" verebilirsiniz
     process.env.EMAIL_FROM ||       // veya sadece email adresi
     MAIL.fromEmail                  // ENV: MAIL_FROM_EMAIL

  return { brand, baseUrl, fromEmail }
}

// Signed URL → attachments (Resend 'path' destekler)
async function attachmentsFromPayload(a: ReturnType<typeof admin>, payload: any) {
  const items = Array.isArray(payload?.attachments) ? payload.attachments : []
  if (!items.length) return []

  const out: Array<{ path: string; filename?: string }> = []
  for (const att of items) {
    const path = String(att?.path || "")
    if (!path) continue
    const fileName = String(att?.file_name || path.split("/").pop() || "file")
    const { data: signed } = await a.storage.from("attachments").createSignedUrl(path, 60 * 10)
    if (signed?.signedUrl) out.push({ path: signed.signedUrl, filename: fileName })
  }
  return out
}

function wrap(heading: string, html: string, brand: string) {
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f6f7f9;padding:24px">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:auto;background:#fff;border:1px solid #e5e7eb;border-radius:8px">
    <tr><td style="padding:20px 24px;border-bottom:1px solid #e5e7eb">
      <div style="font-size:18px;font-weight:600">${brand}</div>
    </td></tr>
    <tr><td style="padding:20px 24px">${html}</td></tr>
    <tr><td style="padding:14px 24px;color:#6b7280;font-size:12px;border-top:1px solid #e5e7eb">© ${new Date().getFullYear()} ${brand}</td></tr>
  </table></body></html>`
}

function emailAnnouncement(brand: string, lang: "tr" | "en", title: string, bodyHtml: string, url: string) {
  const head = lang === "en" ? "Announcement" : "Duyuru"
  const btn = lang === "en" ? "View in Dashboard" : "Panoda görüntüle"
  const html = `
    <div style="color:#6b7280;font-size:12px;margin-bottom:8px">${head}</div>
    <div style="font-size:18px;font-weight:600;margin-bottom:12px">${title}</div>
    <div style="font-size:14px;line-height:1.6">${bodyHtml}</div>
    <div style="margin-top:20px"><a href="${url}" style="display:inline-block;padding:10px 16px;background:#111827;color:#fff;text-decoration:none;border-radius:6px;font-size:14px">${btn}</a></div>`
  return wrap(head, html, brand)
}

function emailTicketReply(brand: string, lang: "tr" | "en", bodyHtml: string, url: string) {
  const head = lang === "en" ? "Support reply" : "Destek yanıtı"
  const btn = lang === "en" ? "Open ticket" : "Talebi aç"
  const html = `
    <div style="color:#6b7280;font-size:12px;margin-bottom:8px">${head}</div>
    <div style="font-size:14px;line-height:1.6">${bodyHtml}</div>
    <div style="margin-top:20px"><a href="${url}" style="display:inline-block;padding:10px 16px;background:#111827;color:#fff;text-decoration:none;border-radius:6px;font-size:14px">${btn}</a></div>`
  return wrap(head, html, brand)
}

function emailTicketNewForAdmins(brand: string, lang: "tr" | "en", ticketUrl: string, sender: string, senderEmail: string, bodyHtml: string, questionId?: string) {
  const head = lang === "en" ? "New contact request" : "Yeni iletişim talebi"
  const q = questionId
    ? `<div style="margin-bottom:6px"><strong>${lang === "en" ? "Question ID" : "Soru ID"}:</strong> <a href="${ticketUrl}" style="color:#1d4ed8;text-decoration:underline">${questionId}</a></div>`
    : `<div style="margin-bottom:6px"><a href="${ticketUrl}" style="color:#1d4ed8;text-decoration:underline">${lang === "en" ? "Open ticket" : "Talebi aç"}</a></div>`
  const senderLine = `<div style="margin-bottom:12px"><strong>${lang === "en" ? "Sender" : "Gönderen"}:</strong> ${sender || ""}${sender && senderEmail ? " • " : ""}${senderEmail || ""}</div>`
  const html = `
    <div style="color:#6b7280;font-size:12px;margin-bottom:8px">${head}</div>
    ${q}
    ${senderLine}
    <div style="font-size:14px;line-height:1.6">${bodyHtml}</div>`
  return wrap(head, html, brand)
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET || "dev"
  const provided = req.nextUrl.searchParams.get("key") || req.headers.get("x-cron-secret")
  if (secret && provided !== secret) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
  if (!resendKey) return NextResponse.json({ ok: false, error: "RESEND_API_KEY missing" }, { status: 500 })

  const a = admin()

  const { data: logs, error: qErr } = await a
    .from("notification_logs")
    .select("id,event,to_email,subject,template,entity_type,entity_id,payload")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(50)
  if (qErr) return NextResponse.json({ ok: false, error: qErr.message }, { status: 500 })
  if (!logs?.length) return NextResponse.json({ ok: true, processed: 0 })

  let sent = 0, failed = 0
  for (const log of logs as any[]) {
    try {
      const ev = log.event as string
      const lang = (log?.payload?.lang === "en" ? "en" : "tr") as "tr" | "en"
      const { brand, baseUrl, fromEmail } = getBrandAndBaseUrl(lang)
      let html = ""
      let subject = log.subject as string
      let attachments: any[] = []

      if (ev === "announcement.published" && log.entity_type === "announcement") {
        const { data: ann } = await a.from("announcements").select("title, body, lang").eq("id", log.entity_id).single()
        const url = `${baseUrl}/dashboard/announcements`
       html = emailAnnouncement(brand ?? "Gümrük360", (lang ?? "tr"), ann?.title || "", ann?.body || "", url)
        if (!subject) subject = (lang === "en") ? `New announcement: ${ann?.title}` : `Yeni duyuru: ${ann?.title}`
        attachments = await attachmentsFromPayload(a, log.payload)
      } else if (ev === "ticket.reply" && log.entity_type === "ticket") {
        const ticketId = log?.payload?.ticket_id as string
        const { data: msg } = await a
          .from("contact_messages")
          .select("body")
          .eq("ticket_id", ticketId)
          .eq("sender_role", "admin")
          .order("created_at", { ascending: false })
          .limit(1)
          .single()
        const url = `${baseUrl}/dashboard/support/${ticketId}`
        html = emailTicketReply(brand ?? "Gümrük360", lang ?? "tr", msg?.body || "", url)
        if (!subject) subject = lang === "en" ? "Support reply" : "Destek Yanıtı"
        attachments = await attachmentsFromPayload(a, log.payload)
      } else if (ev === "ticket.new" && log.entity_type === "ticket") {
        const ticketId = log?.payload?.ticket_id as string
        const senderName = String(log?.payload?.sender_name || "")
        const senderEmail = String(log?.payload?.sender_email || "")
        const { data: firstMsg } = await a
          .from("contact_messages")
          .select("body")
          .eq("ticket_id", ticketId)
          .eq("sender_role", "user")
          .order("created_at", { ascending: true })
          .limit(1)
          .single()
        const url = `${baseUrl}/admin/contact/${ticketId}`
        const questionId = log?.payload?.question_id as string | undefined
        html = emailTicketNewForAdmins(brand ?? "Gümrük360", lang ?? "tr", url, senderName, senderEmail, firstMsg?.body || "", questionId)
        if (!subject) subject = lang === "en" ? "New contact request" : "Yeni iletişim talebi"
        attachments = await attachmentsFromPayload(a, log.payload)
      } else {
        await a.from("notification_logs").update({ status: "failed" }).eq("id", log.id)
        failed++
        continue
      }

      const resp = await resend.emails.send({
        from: fromEmail,
        to: log.to_email,
        subject,
        html,
        attachments: attachments.length ? attachments : undefined,
      })
      if ((resp as any)?.error) throw new Error((resp as any).error?.message || "send error")

      await a.from("notification_logs").update({ status: "sent" }).eq("id", log.id)
      sent++
    } catch {
      await a.from("notification_logs").update({ status: "failed" }).eq("id", log.id)
      failed++
    }
  }

  return NextResponse.json({ ok: true, processed: logs.length, sent, failed })
}

export const POST = GET
