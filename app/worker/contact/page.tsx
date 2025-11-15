import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { supabaseServer } from "../../../lib/supabase/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { Resend } from "resend"
import FilePicker from "./FilePicker"
import { getTranslations } from "next-intl/server"
import { MAIL } from "../../../lib/config/appEnv";
function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createAdminClient(url, key, { auth: { persistSession: false } })
}

function mailFrom() {
  return (
    process.env.MAIL_FROM ||
    process.env.EMAIL_FROM ||
    `${MAIL.fromName} <${MAIL.fromEmail}>`
  )
}

const resendKey = process.env.RESEND_API_KEY || ""
const resend = resendKey ? new Resend(resendKey) : null

async function submitAction(formData: FormData) {
  "use server"
  const tErrors = await getTranslations("contact.errors")

const tEmail = await getTranslations("contact.email")
  const s = await supabaseServer()
  const a = admin()

  const { data: u, error: uErr } = await s.auth.getUser()
  if (uErr || !u?.user?.id) throw new Error(tErrors("loginRequired"))
  const userId = u.user.id

  const subject = String(formData.get("subject") || "").trim()
  const body = String(formData.get("body") || "").trim()
  const files = formData.getAll("attachments") as File[]
  if (!subject || !body) throw new Error(tErrors("subjectMessageRequired"))

  // Kullanıcı profil
  const { data: prof } = await a.from("profiles").select("full_name,email").eq("id", userId).single()
  const senderName = prof?.full_name || ""
  const senderEmail = prof?.email || ""

  // 1) ticket
  const { data: ins, error: tErr } = await a
    .from("contact_tickets")
    .insert({ user_id: userId, subject, status: "open" })
    .select("id")
    .single()
  if (tErr || !ins) throw new Error(tErrors("ticketCreateFailed"))

  const ticketId = ins.id as string

  // 2) ilk mesaj (user/customer)
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
  if (mErr || !mIns) throw new Error(tErrors("messageCreateFailed"))

  // 3) ekler → storage + meta + e-posta
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
      if (up.error) throw new Error(tErrors("attachmentUploadFailed"))

      const { error: metaErr } = await a.from("contact_attachments").insert({
        ticket_id: ticketId,
        object_path: key,
        file_name: f.name,
        mime: f.type,
        size: (f as any).size ?? null,
        uploaded_by: userId,
      })
      if (metaErr) throw new Error(tErrors("attachmentMetaFailed"))

      payloadAttachments.push({ path: key, file_name: f.name, mime: f.type })
      attachmentsForEmail.push({ filename: f.name, content: buf, type: f.type || undefined })
    }
  }

  // 4) admin’lere E-POSTA (anında)
  const { data: admins } = await a
    .from("profiles")
    .select("email")
    .eq("role", "admin")
    .not("email", "is", null)

  const adminEmails = (admins || []).map((p: any) => p.email).filter(Boolean)
  if (adminEmails.length && resend) {
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;font-size:14px">
        <div style="color:#6b7280;font-size:12px;margin-bottom:8px">${tEmail("newRequestPreheader")}</div>
        <div style="font-size:16px;font-weight:600;margin-bottom:8px">${subject}</div>
        <div>${body}</div>
      </div>`
    const resp = await resend.emails.send({
      from: mailFrom(),
      to: adminEmails,
      subject: tEmail("newRequestSubject"),
      html,
      attachments: attachmentsForEmail.length ? attachmentsForEmail : undefined,
    })
    const ok = !(resp as any)?.error

    // 5) Cron için log (ekleri payload’a bırakıyoruz)
    const rows = adminEmails.map((to) => ({
      event: "ticket.new",
      to_email: to,
      subject: tEmail("newRequestSubject"),
      template: "ticket-new",
      provider: "resend",
      status: ok ? "sent" : "queued",
      entity_type: "ticket",
      entity_id: ticketId,
      payload: {
        ticket_id: ticketId,
        lang: "tr",
        sender_name: senderName,
        sender_email: senderEmail,
        attachments: payloadAttachments
      },
    }))
    await a.from("notification_logs").insert(rows)
  }

  revalidatePath("/worker/contact")
  redirect("/worker")
}

export default async function ContactPage() {

const t = await getTranslations("contact")

const tQ = await getTranslations("questions.filePicker")
  return (
     <div className="bg-gradient-to-b from-white to-slate-0 py-1">
  <div className="px-3 md:px-5 pt-2 md:pt-3 pb-3 md:pb-5">
  	  	<div className="rounded-xl bg-blue-50/80 border border-blue-200/60 px-4 py-3 mb-4 flex items-center gap-3">
      <h1 className="text-2xl font-semibold mb-4">{t("title")}</h1>
 </div>
   <div className="card-surface shadow-colored rounded-xl">


      <div className="p-5">
      {/* Server action ile encType/method belirtmiyoruz */}
      <form action={submitAction} className="space-y-4">
        <div>
          <label className="block text-sm mb-1">{t("subject")}</label>
          <input name="subject" className="w-full rounded px-3 py-2 bg-white/90 ring-1 ring-slate-200 focus:ring-2 focus:ring-blue-300 outline-none" placeholder={t("subjectPlaceholder")} required />
        </div>
        <div>
          <label className="block text-sm mb-1">{t("message")}</label>
           <textarea name="body" className="w-full rounded px-3 py-2 bg-white/90 ring-1 ring-slate-200 focus:ring-2 focus:ring-blue-300 outline-none" placeholder={t("messagePlaceholder")} required />
        </div>
        <div><label className="block text-sm mb-1">{tQ("label")}</label><FilePicker /></div>
        <div className="flex gap-2">
          <button className="btn btn--primary btn--cta" type="submit">{t("send")}</button>
          <a href="/worker" className="btn btn--ghost">{t("cancel")}</a>
        </div>
      </form>
         </div> 
    </div>   
  </div>      
</div> 
  )
}