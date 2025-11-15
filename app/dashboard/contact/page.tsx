import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { supabaseServer } from "../../../lib/supabase/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { Resend } from "resend"
import React from "react"
import AttachmentsPicker from "./AttachmentsPicker"
import { getTranslations, getLocale } from "next-intl/server";
import { MAIL } from "../../../lib/config/appEnv";
function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createAdminClient(url, key, { auth: { persistSession: false } })
}

function mailFrom() {
   return (
     process.env.MAIL_FROM ||          // "İsim <email@...>" tam değer verdiyse öncelik
     process.env.EMAIL_FROM ||         // yalnız e-posta verdiyse
     `${MAIL.fromName} <${MAIL.fromEmail}>`  // ENV: MAIL_FROM_NAME + MAIL_FROM_EMAIL
   )
}

const resendKey = process.env.RESEND_API_KEY || ""
const resend = resendKey ? new Resend(resendKey) : null

async function submitAction(formData: FormData) {
	"use server"
	const t = await getTranslations("contact");
	const locale = await getLocale();
  const s = await supabaseServer()
  const a = admin()

  const { data: u, error: uErr } = await s.auth.getUser()
  if (uErr || !u?.user?.id) throw new Error(t("errors.loginRequired"))
  const userId = u.user.id

  const subject = String(formData.get("subject") || "").trim()
  const body = String(formData.get("body") || "").trim()
  const files = formData.getAll("attachments") as File[]
  if (!subject || !body) throw new Error(t("errors.subjectMessageRequired"))

  const { data: prof } = await a.from("profiles").select("full_name,email").eq("id", userId).single()
  const senderName = prof?.full_name || ""
  const senderEmail = prof?.email || ""

  const { data: ins, error: tErr } = await a
    .from("contact_tickets")
    .insert({ user_id: userId, subject, status: "open" })
    .select("id")
    .single()
  if (tErr || !ins) throw new Error(t("errors.ticketCreateFailed"))

  const ticketId = ins.id as string

  async function insertMsg(role: "customer" | "user") {
    return a.from("contact_messages").insert({
      ticket_id: ticketId,
      sender_role: role,
      body,
    }).select("id").single()
  }
  let mIns, mErr
  {
    const r1 = await insertMsg("customer")
    mIns = r1.data; mErr = r1.error
    if (mErr) {
      const r2 = await insertMsg("user")
      mIns = r2.data; mErr = r2.error
    }
  }
  if (mErr || !mIns) throw new Error(t("errors.messageCreateFailed") + (mErr?.message ? (": " + mErr.message) : ""))

  const payloadAttachments: Array<{ path: string; file_name?: string; mime?: string }> = []
  const attachmentsForEmail: Array<{ filename: string; content: Buffer; type?: string }> = []

  if (files && files.length) {
    for (const f of files) {
      if (!f || typeof f.arrayBuffer !== "function") continue
      const buf = Buffer.from(await f.arrayBuffer())
      const ext = (f.name.split(".").pop() || "bin").toLowerCase()
      const key = `attachments/contact/${ticketId}/${crypto.randomUUID()}.${ext}`
      const up = await s.storage.from("attachments").upload(key, buf, {
        contentType: f.type || "application/octet-stream",
        upsert: false,
      })
      if (up.error) throw new Error(t("errors.attachmentUploadFailed") + ": " + up.error.message)

      const { error: metaErr } = await a.from("contact_attachments").insert({
        ticket_id: ticketId,
        object_path: key,
        file_name: f.name,
        mime: f.type,
        size: (f as any).size ?? null,
        uploaded_by: userId,
      })
      if (metaErr) throw new Error(t("errors.attachmentMetaFailed") + ": " + metaErr.message)

      payloadAttachments.push({ path: key, file_name: f.name, mime: f.type })
      attachmentsForEmail.push({ filename: f.name, content: buf, type: f.type || undefined })
    }
  }

  const { data: admins } = await a
    .from("profiles")
    .select("email")
    .eq("role", "admin")
    .not("email", "is", null)

  const adminEmails = (admins || []).map((p: any) => p.email).filter(Boolean)
  if (adminEmails.length && resend) {
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;font-size:14px">
        <div style="color:#6b7280;font-size:12px;margin-bottom:8px">${t("email.newRequestPreheader")}</div>
        <div style="font-size:16px;font-weight:600;margin-bottom:8px">${subject}</div>
        <div>${body}</div>
      </div>`
    const resp = await resend.emails.send({
      from: mailFrom(),
      to: adminEmails,
      subject: t("email.newRequestSubject"),
      html,
      attachments: attachmentsForEmail.length ? attachmentsForEmail : undefined,
    })
    const ok = !(resp as any)?.error

    const rows = adminEmails.map((to) => ({
      event: "ticket.new",
      to_email: to,
      subject: t("email.newRequestSubject"),
      template: "ticket-new",
      provider: "resend",
      status: ok ? "sent" : "queued",
      entity_type: "ticket",
      entity_id: ticketId,
      payload: {
        ticket_id: ticketId,
        lang: locale,
        sender_name: senderName,
        sender_email: senderEmail,
        attachments: payloadAttachments
      },
    }))
    await a.from("notification_logs").insert(rows)
  }

  revalidatePath("/admin/contact")
  redirect("/dashboard/support")
}

export default async function ContactPage() {
	const t = await getTranslations("contact");
  return (

   <div className="w-full max-w-none md:max-w-[clamp(320px,90vw,928px)] -mx-2 md:mx-0 px-0 md:px-5 pt-2 md:pt-3 pb-3 md:pb-5">
     <div className="card-surface shadow-colored p-5 md:p-6 space-y-5">
  	  	<div className="rounded-xl bg-blue-50/80 border border-blue-200/60 px-4 py-3 mb-4 flex items-center gap-3">
              <h1 className="text-xl md:text-2xl font-semibold">{t("title")}</h1>
			  </div>

    <div className="card-surface shadow-colored rounded-xl">


      <div className="p-5">
        <form action={submitAction} className="space-y-4">
        <div>
           <label className="block text-sm mb-1">{t("subject")}</label>
          <input name="subject" className="w-full rounded px-3 py-2 bg-white/90 ring-1 ring-slate-200 focus:ring-2 focus:ring-blue-300 outline-none" placeholder={t("subjectPlaceholder")} required />
        </div>
        <div>
          <label className="block text-sm mb-1">{t("message")}</label>
          <textarea name="body" required rows={8} className="w-full rounded px-3 py-2 border border-slate-300 bg-white shadow-sm outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500 min-h-[200px] md:min-h-[300px]" placeholder={t("messagePlaceholder")} />
        </div>

        {/* Sadece görünür önizleme eklendi */}
        <AttachmentsPicker name="attachments" inputId="attachments" />

        <div className="flex gap-2">
          <button className="btn btn--primary btn--cta" type="submit">{t("send")}</button>
          <a href="/dashboard" className="btn btn--ghost">{t("cancel")}</a>
        </div>
       </form>
      </div> 
    </div>   
  </div>        </div>  
    
  )
}
