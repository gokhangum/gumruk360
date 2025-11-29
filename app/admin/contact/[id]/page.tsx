
export const runtime = "nodejs";

import Link from "next/link"
import { notFound } from "next/navigation"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { supabaseServer } from "../../../../lib/supabase/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { Resend } from "resend"
import AttachmentsPicker from "../../../dashboard/contact/AttachmentsPicker"
import { MAIL } from "../../../../lib/config/appEnv";
import { getTranslations } from "next-intl/server";
function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createAdminClient(url, key, { auth: { persistSession: false } })
}

 async function mailFrom() {
   const h = await headers();
   const host = (h.get("x-forwarded-host") || h.get("host") || "").toLowerCase();
   const fromTR = process.env.RESEND_FROM_TR || `${MAIL.fromName} <${MAIL.fromEmail}>`;
   const fromEN = process.env.RESEND_FROM_EN || `${MAIL.fromName} <${MAIL.fromEmail}>`;
   const isEN = host.includes("easycustoms360"); // easycustoms360* alan adları → EN
   return isEN ? fromEN : fromTR;
 }


async function absoluteBaseUrl() {
  const h = await headers()
  const host = (h.get("x-forwarded-host") || h.get("host") || "localhost:3000").toLowerCase()
  const proto = (h.get("x-forwarded-proto") || "http").toLowerCase()
  return `${proto}://${host}`
}

const resendKey = process.env.RESEND_API_KEY || ""
const resend = resendKey ? new Resend(resendKey) : null

async function replyAction(formData: FormData) {
  "use server"

  const a = admin()
  const s = await supabaseServer()
  const base = await absoluteBaseUrl()

  // Oturumdaki admin id
  const { data: userRes, error: userErr } = await s.auth.getUser()
  if (userErr || !userRes?.user?.id) throw new Error("Oturum bulunamadı.")
  const adminId = userRes.user.id

  const ticketId = String(formData.get("ticketId") || "")
  const body = String(formData.get("body") || "").trim()
  const files = formData.getAll("attachments") as File[]
  if (!ticketId || !body) throw new Error("Eksik alan")

  const { data: ticket, error: tErr } = await a
    .from("contact_tickets")
    .select("id,user_id,question_id")
    .eq("id", ticketId)
    .single()
  if (tErr || !ticket) throw new Error("Ticket bulunamadı")

  const { data: owner } = await a
    .from("profiles")
    .select("id,email,full_name,tenant_key,role")
    .eq("id", ticket.user_id)
    .single()

 // --- Kullanıcının tenant locale'ini çek → e-posta dili
 let tenantLocale: string | null = null;
 let emailIsEN = false;
 if ((owner as any)?.tenant_key) {
   const { data: tRow } = await a
     .from("tenants")
     .select("locale")
     .eq("code", (owner as any).tenant_key)
     .single();
   tenantLocale = tRow?.locale ?? null;
   const userLocale = (tenantLocale || "").toLowerCase();
   emailIsEN = userLocale.startsWith("en");
}

  // İlgili sorunun başlığını al
  const { data: q } = await a
    .from("questions")
    .select("id,title")
    .eq("id", ticket.question_id)
    .maybeSingle()

  // Kullanıcının göreceği soru linki
  const publicQuestionUrl = ticket.question_id ? `${base}/ask/${ticket.question_id}` : null

  // 1) Mesaj (admin)
  const { data: msgIns, error: insMsgErr } = await a
    .from("contact_messages")
    .insert({ ticket_id: ticketId, sender_role: "admin", body })
    .select("id")
    .single()
  if (insMsgErr) throw new Error("Mesaj insert hatası: " + insMsgErr.message)

  // 2) Ekler → storage + meta + e-posta ekleri
  const payloadAttachments: Array<{ path: string; file_name?: string; mime?: string }> = []
  const attachmentsForEmail: Array<{ filename: string; content: Buffer; type?: string }> = []
   const validFiles = (files || []).filter((f: any) =>
     f &&
     typeof f.arrayBuffer === "function" &&
     typeof f.name === "string" && f.name.trim() &&
     typeof (f as any).size === "number" && (f as any).size > 0
   )
  if (validFiles.length > 0) {
    for (const file of validFiles) {
      if (!file || typeof file.arrayBuffer !== "function") continue
      const buf = Buffer.from(await file.arrayBuffer())
      const ext = (file.name.split(".").pop() || "bin").toLowerCase()
      const key = `attachments/contact/${ticketId}/${crypto.randomUUID()}.${ext}`

      const upload = await s.storage
        .from("attachments")
        .upload(key, buf, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        })
      if (upload.error) throw new Error("Upload hatası: " + upload.error.message)

      const { error: metaErr } = await a.from("contact_attachments").insert({
        ticket_id: ticketId,
        object_path: key,
        file_name: file.name,
        mime: file.type,
        size: (file as any).size ?? null,
        uploaded_by: adminId,
      })
      if (metaErr) throw new Error("Ek meta insert hatası: " + metaErr.message)

      payloadAttachments.push({ path: key, file_name: file.name, mime: file.type })
      attachmentsForEmail.push({ filename: file.name, content: buf, type: file.type || undefined })
    }
  }

  // 3) Kullanıcıya e-posta (yalnızca cevap) + log
  if (owner?.email && resend) {
     // Konu ve metinler: kullanıcının tenant locale'ine göre EN/TR
     const subject = q?.title
       ? (emailIsEN ? `Your Answer: ${q.title}` : `Yanıtınız: ${q.title}`)
       : (emailIsEN ? "Support Reply" : "Destek Yanıtı");
      const isWorker = (owner as any)?.role === "worker";
   const supportUrl = `${base}${isWorker ? "/worker" : "/dashboard"}/support/${ticketId}`;
 
     // Gövde: admin cevabının altına soru başlığı + link
     const extras = publicQuestionUrl
        ? `<hr style="margin:16px 0;border:none;border-top:1px solid #e5e7eb;" />
         <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5">
            <div><strong>${emailIsEN ? "Question" : "Soru"}:</strong> ${q?.title ? q.title : (ticket.question_id || "")}</div>
            
           </div>`
       : "";
 
      const html = `
        <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;font-size:14px">${body}</div>
        <div style="margin-top:12px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5">
         <a href="${supportUrl}" target="_blank" rel="noopener noreferrer"
             style="display:inline-block;padding:10px 14px;background:#2563eb;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600">
            ${emailIsEN ? "View your request here" : "Talebinizi buradan görüntüleyin"}
         </a>
       </div>
        ${extras}
      `;
     // --- Gönderen adresi: tenant locale → ENV'den seç (genişletilebilir yapı)
 const lang = (tenantLocale || (emailIsEN ? "en" : "tr")).split("-")[0].toLowerCase();
   const envKey = `RESEND_FROM_${lang.toUpperCase()}` as const; // örn: RESEND_FROM_EN, RESEND_FROM_TR

    // ENV öncelik sırası:
    // 1) RESEND_FROM_<LANG> (örn: RESEND_FROM_EN, RESEND_FROM_TR)
     // 2) RESEND_FROM_DEFAULT
     // 3) Dil bazlı fallback (EN için RESEND_FROM_EN -> TR; TR için RESEND_FROM_TR -> EN)
     // 4) Hardcoded son çare (projeyi kilitlememek için)
     const fromAddress =
      (process.env as any)[envKey]
       || process.env.RESEND_FROM_DEFAULT
      || (emailIsEN ? (process.env.RESEND_FROM_EN ?? process.env.RESEND_FROM_TR)
                     : (process.env.RESEND_FROM_TR ?? process.env.RESEND_FROM_EN))
       || (emailIsEN ? "Easycustoms360 <noreply@mail.gumruk360.com>"
                     : "Gümrük360 <bildirim@mail.gumruk360.com>");
const emailPayload: any = {
       from: fromAddress,
       to: owner.email,
       subject,
       html,
     }
	 const safeEmailAttachments =
   (attachmentsForEmail ?? []).filter((a: any) =>
     a &&
     typeof a.filename === "string" &&
     a.filename.trim() &&
     a.filename.toLowerCase() !== "undefined" &&
     a.content &&
     (Buffer.isBuffer(a.content) ? (a.content as Buffer).length > 0 : true)
   );
     if (safeEmailAttachments.length) emailPayload.attachments = safeEmailAttachments
     const resp = await resend.emails.send(emailPayload)
    const ok = !(resp as any)?.error

    await a.from("notification_logs").insert({
      event: "ticket.reply",
      to_email: owner.email,
      subject,
      template: "ticket-reply",
      provider: "resend",
      status: ok ? "sent" : "queued",
      entity_type: "ticket",
      entity_id: ticketId,
      payload: (() => {
         const p: any = {
           ticket_id: ticketId,
           lang: "tr",
           question_id: ticket.question_id || null,
           question_title: q?.title || null,
           question_url: publicQuestionUrl || null,
           support_url: supportUrl,
         }
        if (payloadAttachments.length) p.attachments = payloadAttachments
         return p
      })(),
    })
  }

  // 4) Ticket durumu → admin mesajı geldi: ANSWERED
  await a.from("contact_tickets").update({ status: "answered" }).eq("id", ticketId)

  revalidatePath(`/admin/contact/${ticketId}`)
}

export default async function AdminContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await supabaseServer()
  const a = admin()
  const base = await absoluteBaseUrl()
  const { id } = await params
const t = await getTranslations("admin.contact.detail");
  const { data: ticket } = await a
    .from("contact_tickets")
    .select("id, created_at, subject, status, question_id, user_id")
    .eq("id", id)
    .single()

  if (!ticket) return notFound()

  const { data: owner } = await a
    .from("profiles")
    .select("id,email,full_name")
    .eq("id", ticket.user_id)
    .single()

  const { data: msgs } = await a
    .from("contact_messages")
    .select("id, created_at, sender_role, body")
    .eq("ticket_id", id)
    .order("created_at", { ascending: true })

  const { data: atts } = await a
    .from("contact_attachments")
    .select("object_path,file_name,uploaded_by,created_at")
    .eq("ticket_id", id)
  // --- SAFE FILTER: geçersiz/boş/undefined isimli veya path'siz kayıtları gösterme
  const safeAtts = (atts || []).filter((f) => {
    const name = String((f as any)?.file_name ?? "").trim().toLowerCase()
    const path = String((f as any)?.object_path ?? "").trim()
    return path && name && name !== "undefined"
  })
  const links: Array<{ name: string; url: string; at: string }> = []

  function splitBucketAndPath(objectPath: string): { bucket: string; path: string } {
    const p = String(objectPath || "");
    if (p.startsWith("attachments/")) return { bucket: "attachments", path: p.substring("attachments/".length) };
    if (p.startsWith("attachment/")) return { bucket: "attachment", path: p.substring("attachment/".length) };
    // no prefix → assume default bucket "attachments"
    return { bucket: "attachments", path: p };
  }

  for (const f of safeAtts) {
    const { bucket, path } = splitBucketAndPath(String(f.object_path || ""));

    // Prefer admin client 'a' to sign URLs (service role, no RLS surprises)
    let signedUrl: string | null = null;
    {
      const { data: s1 } = await a.storage.from(bucket).createSignedUrl(path, 600);
      if (s1?.signedUrl) signedUrl = s1.signedUrl;
    }

    // Fallback: try as-is on default 'attachments' bucket
    if (!signedUrl) {
      const { data: s2 } = await a.storage.from("attachments").createSignedUrl(String(f.object_path || ""), 600);
      if (s2?.signedUrl) signedUrl = s2.signedUrl;
    }

    if (signedUrl) {
      const rawName = String((f as any)?.file_name ?? "").trim()
      const displayName = rawName && rawName.toLowerCase() !== "undefined" ? rawName : t("attachments.fallback")
      links.push({
        name: displayName,
        url: signedUrl,
        at: new Date(f.created_at as string).toLocaleString(),
      });
    }
  }

  const questionHref = ticket.question_id
    ? `${base}/admin/request/${ticket.question_id}?email=${encodeURIComponent(owner?.email || "")}`
    : null
const statusLabel =
  ticket.status === "open" ? t("status.open")
  : ticket.status === "answered" ? t("status.answered")
  : t("status.closed");
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
         <Link href="/admin/contact" className="text-sm underline">{t("back")}</Link>
      </div>

      <div className="space-y-1 text-sm">
        <div><span className="font-medium">{t("labels.ticketId")}:</span> {ticket.id}</div>
        <div>
          <span className="font-medium">{t("labels.sender")}:</span>{" "}
          {owner?.full_name ? `${owner.full_name} (${owner.email})` : owner?.email || "—"}
        </div>
        <div>
          <span className="font-medium">{t("labels.question")}:</span>{" "}
          {questionHref ? (
            <a className="text-blue-700 underline" href={questionHref} target="_blank" rel="noopener noreferrer">
              {ticket.question_id}
            </a>
          ) : "—"}
        </div>
        <div><span className="font-medium">{t("labels.subject")}:</span> {ticket.subject}</div>
       <div><span className="font-medium">{t("labels.status")}:</span> {statusLabel}</div>
         <div><span className="font-medium">{t("labels.date")}:</span> {new Date(ticket.created_at).toLocaleString()}</div>
      </div>

      <div className="border rounded">
        <div className="border-b px-3 py-2 bg-gray-50 text-sm font-medium">{t("sections.messages")}</div>
        <div className="p-3 space-y-3">
          {(msgs || []).map((m) => (
            <div key={m.id} className="rounded border p-3">
              <div className="text-xs text-gray-500 mb-1 flex items-center gap-2">
                <span className="uppercase">{m.sender_role}</span>
                <span>•</span>
                <span>{new Date(m.created_at).toLocaleString()}</span>
              </div>
              <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: m.body }} />
            </div>
          ))}
          {(!msgs || msgs.length === 0) && (
            <div className="text-gray-500 text-sm">{t("empty.noMessages")}</div>
          )}
        </div>
      </div>

      {/* Ekler */}
      <div className="border rounded">
       <div className="border-b px-3 py-2 bg-gray-50 text-sm font-medium">{t("sections.attachments")}</div>
        <div className="p-3 space-y-2">
          {links.length ? links.map((f, i) => (
            <div key={i}>
              <a className="text-blue-700 underline" href={f.url} target="_blank" rel="noreferrer">
                {f.name}
              </a>
              <span className="text-xs text-gray-500"> • {f.at}</span>
            </div>
         )) : <div className="text-gray-500 text-sm">{t("empty.noAttachments")}</div>}
        </div>
      </div>

      <form action={replyAction} className="space-y-3">
        <input type="hidden" name="ticketId" value={ticket.id} />
        <div>
          <label className="block text-sm mb-1">{t("form.body.label")}</label>
          <textarea
            name="body"
            className="w-full border rounded px-3 py-2 min-h-[140px]"
            placeholder={t.raw("form.body.placeholder")}
            required
          />
        </div>
        <div>
          <AttachmentsPicker name="attachments" inputId="admin-attachments" />
        </div>
        <div>
          <button className="px-4 py-2 rounded bg-black text-white hover:opacity-90" type="submit">
            {t("form.submit")}
          </button>
        </div>
      </form>
    </div>
  )
}
