export const runtime = "nodejs";

import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { supabaseServer } from "../../../../lib/supabase/server";
import { Resend } from "resend";
import AttachmentsPicker from "../../contact/AttachmentsPicker";
import MessageBodySmart from "../components/MessageBodySmart";
import { getMessages } from "next-intl/server";
import { MAIL } from "../../../../lib/config/appEnv";
// 12. satırdan itibaren yapıştır
// Dot-notation ile güvenli mesaj erişimi: eksik anahtar/namespace patlatmaz.
// Bulamazsa doğrudan anahtarı döndürür (UI hiçbir zaman kırılmaz).
function dotGet(obj: any, path: string) {
  return path.split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), obj);
}

async function getTSafe(ns: string) {
  try {
    const msgs = (await getMessages()) as any; // Tüm locale mesajları
    const nsObj = msgs?.[ns] ?? {};
    return ((key: string, values?: Record<string, any>) => {
      const raw = dotGet(nsObj, key);
      if (typeof raw === "string") {
        // Basit değişken yerleştirme: "Hello {name}"
        return raw.replace(/\{(\w+)\}/g, (_m, v) => (values && v in values ? String(values[v]) : `{${v}}`));
      }
      // String değilse ya da bulunamadıysa anahtarı göster
      return `${ns}.${key}`;
    }) as unknown as (k: string, values?: Record<string, any>) => string;
  } catch {
    // getMessages erişilemezse bile fallback döndür
    return ((key: string) => `${ns}.${key}`) as unknown as (k: string) => string;
  }
}


function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createAdminClient(url, key, { auth: { persistSession: false } });
}

function isImage(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return ["jpg","jpeg","png","gif","webp","bmp","svg","heic","avif"].includes(ext);
}
const resendKey = process.env.RESEND_API_KEY || "";
const resend = resendKey ? new Resend(resendKey) : null;

function fileIcon(name: string) {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (["jpg","jpeg","png","gif","webp","bmp","svg","heic","avif"].includes(ext)) return "🖼️";
  if (["pdf"].includes(ext)) return "📕";
  if (["doc","docx","rtf","odt","pages"].includes(ext)) return "📄";
  if (["xls","xlsx","csv","ods","numbers"].includes(ext)) return "📊";
  if (["ppt","pptx","key","odp"].includes(ext)) return "📽️";
  if (["zip","rar","7z","tar","gz","bz2"].includes(ext)) return "🗜️";
  if (["txt","md","log"].includes(ext)) return "📄";
  if (["json","yaml","yml","xml"].includes(ext)) return "🧾";
  if (["mp4","mov","avi","mkv","webm"].includes(ext)) return "🎞️";
  if (["mp3","wav","flac","m4a","ogg"].includes(ext)) return "🎵";
  return "📎";
}

export async function replyTicketAction(formData: FormData) {
  "use server";
const t = await getTSafe("support");
  const s = await supabaseServer();
  const a = admin();

  const { data: u } = await s.auth.getUser();
  if (!u?.user?.id) throw new Error("auth_required");
  const userId = u.user.id;

  const ticketId = String(formData.get("ticketId") || "").trim();
  const messageText = String(formData.get("message") || "").trim();
  const files = formData.getAll("attachments").filter(Boolean) as File[];
  if (!ticketId || !messageText) throw new Error("missing_fields");

  // ownership
const { data: ticketRow } = await a
  .from("contact_tickets")
  .select("id,user_id,question_id")
  .eq("id", ticketId)
  .maybeSingle();

 if (!ticketRow || ticketRow.user_id !== userId) throw new Error("forbidden");


  // insert message
  async function insertMsg(role: "customer" | "user") {
    return a.from("contact_messages").insert({ ticket_id: ticketId, sender_role: role, body: messageText }).select("id").single();
  }
  let m = await insertMsg("customer").catch(() => null);
  if (!m?.data) m = await insertMsg("user");
  if (!m?.data) throw new Error("message_failed");

  // upload files
  if (files.length) {
    for (const f of files) {
      if (!("size" in f) || f.size === 0) continue;
      const buf = Buffer.from(await f.arrayBuffer());
      const ext = (f.name.split(".").pop() || "bin").toLowerCase();
      const key = `attachments/contact/${ticketId}/${crypto.randomUUID()}.${ext}`;
      const up = await s.storage.from("attachments").upload(key, buf, { contentType: f.type || "application/octet-stream", upsert: false });
      if (up.error) throw new Error("upload_failed: " + up.error.message);
      const { error: metaErr } = await a.from("contact_attachments").insert({
        ticket_id: ticketId,
        object_path: key,
        file_name: f.name,
        mime: f.type || null,
        size: (f as any).size ?? null,
        uploaded_by: userId,
      });
      if (metaErr) throw new Error("meta_failed: " + metaErr.message);
    }
  }

  await a.from("contact_tickets").update({ status: "open" }).eq("id", ticketId);

  // --- Email admins with support link ---
  try {
    const h = await headers();
    const host = (h.get("x-forwarded-host") || h.get("host") || "localhost:3000").toLowerCase();
    const proto = (h.get("x-forwarded-proto") || "http").toLowerCase();
    const base = `${proto}://${host}`;

const attachmentsForEmail: Array<{ filename: string; content: Buffer; type?: string }> = [];
for (const f of files) {
  try {
    // Adı yoksa ya da 0 baytsa gönderme
    const size = (f as any)?.size ?? 0;
    if (!f.name || f.name === "undefined" || size === 0) continue;

    const buf = Buffer.from(await f.arrayBuffer());
    attachmentsForEmail.push({ filename: f.name, content: buf, type: (f as any).type || undefined });
  } catch {}
}


    const adminTicketUrl = `${base}/admin/contact/${ticketId}`;

    const supportUrl = `${base}/dashboard/support/${ticketId}`;

    const { data: admins } = await a
      .from("profiles")
      .select("email")
      .eq("role", "admin")
      .not("email", "is", null);

    const adminEmails = (admins || []).map((p: any) => p.email).filter(Boolean);

    // ENV: ADMIN_EMAILS (comma-separated) ekle
    const envAdminEmails = (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const union = Array.from(new Set([...adminEmails, ...envAdminEmails]));
    const finalAdminEmails = union;

    if (finalAdminEmails.length && resend) {
const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;font-size:14px">
    <div style="color:#6b7280;font-size:12px;margin-bottom:8px">${t("adminEmail.userReply.subtitle")}</div>
    <div style="margin-top:8px;white-space:pre-wrap">${messageText}</div>
    <div style="margin-top:12px">
      <a href="${adminTicketUrl}" target="_blank" rel="noopener noreferrer">${t("adminEmail.userReply.linkAdmin")}</a>
    </div>
  </div>
`;
const resp = await resend.emails.send({
         from: process.env.MAIL_FROM || process.env.EMAIL_FROM || `${MAIL.fromName} <${MAIL.fromEmail}>`,
        to: finalAdminEmails,
        subject: t("adminEmail.userReply.subject"),
        html,
        attachments: attachmentsForEmail.length ? attachmentsForEmail : undefined,
      });

      const ok = !((resp as any)?.error);
      await a.from("notification_logs").insert({
        event: "ticket.user_reply",
        to_email: finalAdminEmails.join(","),
        subject: t("adminEmail.userReply.subject"),
        template: "ticket-user-reply",
        provider: "resend",
        status: ok ? "sent" : "queued",
        entity_type: "ticket",
        entity_id: ticketId,
        payload: {
          ticket_id: ticketId,
          support_url: `${base}/dashboard/support/${ticketId}`,
          admin_ticket_url: adminTicketUrl,
          attachments_count: files.length,
        },
      });
    }
  } catch {}
  
  try {
    await a.from("audit_logs").insert({
      action: "contact.user_replied",
      resource_type: "contact_ticket",
      resource_id: ticketId,
      actor_id: userId,
      payload: {
  message_length: messageText.length,
  attachments_count: files.length,
  question_id: ticketRow?.question_id || null
},

    });
  } catch {}

  revalidatePath(`/dashboard/support/${ticketId}`);
  redirect(`/dashboard/support/${ticketId}?sent=1`);
}


export async function markResolvedFromDetailAction(formData: FormData) {
  "use server";
const t = await getTSafe("support");
  const s = await supabaseServer();
  const a = admin();

  const { data: u } = await s.auth.getUser();
  if (!u?.user?.id) throw new Error("auth_required");
  const userId = u.user.id;

  const ticketId = String(formData.get("ticketId") || "").trim();
  if (!ticketId) throw new Error("missing_ticket");

  const { data: ticketRow } = await a
  .from("contact_tickets")
  .select("id,user_id,question_id")
  .eq("id", ticketId)
  .maybeSingle();


  if (!ticketRow || ticketRow.user_id !== userId) throw new Error("forbidden");

  await a.from("contact_tickets").update({ status: "closed" }).eq("id", ticketId);

  try {
    const h = await headers();
    const host = (h.get("x-forwarded-host") || h.get("host") || "localhost:3000").toLowerCase();
    const proto = (h.get("x-forwarded-proto") || "http").toLowerCase();
    const base = `${proto}://${host}`;

    const { data: me } = await a
      .from("profiles")
      .select("email,full_name")
      .eq("id", userId)
      .single();
    const senderEmail = me?.email || "";
    const senderName = me?.full_name || senderEmail || t("common.user");

  const qLink = ticketRow?.question_id
  ? `${base}/admin/request/${ticketRow.question_id}?email=${encodeURIComponent(senderEmail)}`
  : null;

    const cLink = `${base}/admin/contact/${ticketId}`;

    const { data: admins } = await a
      .from("profiles")
      .select("email")
      .eq("role", "admin")
      .not("email", "is", null);

    let toList = (admins || []).map((p: any) => p.email).filter(Boolean) as string[];
    const fallback = process.env.ADMIN_EMAIL || process.env.SUPPORT_EMAIL || process.env.MAIL_TO || "";
    if (!toList.length && fallback) toList = [fallback];

    // ENV: ADMIN_EMAILS (comma-separated) ekle
    const envAdminEmails2 = (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    toList = Array.from(new Set([...
      toList,
      ...envAdminEmails2,
    ]));

    if (toList.length && resend) {
      const subject = t("adminEmail.resolved.subject");
      const details = qLink
  ? `<p><strong>${t("adminEmail.resolved.questionIdLabel")}:</strong> <a href="${qLink}" target="_blank" rel="noopener noreferrer">${ticketRow?.question_id}</a></p>`
  : `<p><strong>${t("adminEmail.resolved.ticketLabel")}:</strong> <a href="${cLink}" target="_blank" rel="noopener noreferrer">${ticketId}</a></p>`;


      const html = `
        <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;font-size:14px">
          ${details}
          <p><strong>${t("adminEmail.resolved.reportedBy")}:</strong> ${senderName} &lt;${senderEmail}&gt;</p>
          <p>${t("adminEmail.resolved.body")}</p>
        </div>
      `;

      await resend.emails.send({
        from: process.env.MAIL_FROM || process.env.EMAIL_FROM || `${MAIL.fromName} <${MAIL.fromEmail}>`,
        to: toList,
        subject,
        html,
      });
    }
  } catch {}

  revalidatePath("/dashboard/support");
  revalidatePath(`/dashboard/support/${ticketId}`);
}
export default async function SupportDetailPage({ params }: { params: Promise<{ id: string }> }) {
const t = await getTSafe("support"); 
 const { id } = await params;
  const s = await supabaseServer();
  const a = admin();

  const { data: u } = await s.auth.getUser();
  if (!u?.user) redirect(`/login?next=/dashboard/support/${id}`);
  const userId = u.user.id;

  const { data: ticket } = await a
    .from("contact_tickets")
    .select("id, created_at, subject, status, user_id, question_id")
    .eq("id", id)
    .maybeSingle();
  // Soru başlığını önceliklendir
  let displayTitle = ticket?.subject || "";

  if (ticket?.question_id) {
    const { data: q } = await a
      .from("questions")
      .select("id,title")
      .eq("id", ticket.question_id)
      .maybeSingle();

    if (q?.title) {
      displayTitle = q.title;
    }
  }

  if (!displayTitle || typeof displayTitle !== "string") {
    displayTitle = t("ui.titleFallback");
  }

  if (!ticket || ticket.user_id !== userId) return notFound();

  const { data: msgs } = await a
    .from("contact_messages")
    .select("id, created_at, sender_role, body")
    .eq("ticket_id", id)
    .order("created_at", { ascending: true });

  // List attachment file names and build native-open URLs
    // DB'deki orijinal dosya adlarını ve boyutlarını al
  const { data: attachRows } = await a
    .from("contact_attachments")
    .select("object_path,file_name,size")
    .eq("ticket_id", id);

  // object_path => orijinal ad / boyut map
  const nameMap = new Map<string, string>((attachRows ?? []).map(r => [r.object_path, r.file_name]));
  const sizeMap = new Map<string, number | null>((attachRows ?? []).map(r => [r.object_path, r.size ?? null]));

const pushedIds = new Set<string>();
const contactPrefix = `attachments/contact/${id}/`;
const listResp = await a.storage.from("attachments").list(contactPrefix, { limit: 200, sortBy: { column: "name", order: "asc" } });
const contactFiles: Array<{ id: string; name: string; openUrl: string }> = [];
if (!listResp.error && Array.isArray(listResp.data)) {
  for (const f of listResp.data) {
    if (f.name.endsWith("/")) continue;
    // Tam path ile DB eşlemesi yap
        // Tam path benzersizdir; bunu id olarak kullan
    const fullPath = `${contactPrefix}${f.name}`;
    const id = fullPath;

    // Boyut tercih sırası: DB -> list() -> 0
    const sizeFromDb = sizeMap.get(fullPath);
    const sizeFromList =
      (f as any)?.metadata?.size ??
      (f as any)?.size ??
      0;
    const effectiveSize = (sizeFromDb ?? sizeFromList ?? 0) as number;

    // Orijinal görüntü adı
    const displayName = nameMap.get(fullPath) || f.name;

    // isimsiz/undefined veya 0 byte dosyaları gösterme
    if (!displayName || displayName === "undefined" || effectiveSize === 0) continue;

    // Aynı id ile tekrar eklemeyi engelle
    if (!pushedIds.has(id)) {
      pushedIds.add(id);
      // İndirme adını da orijinal ad yap
      const openUrl = `/api/attachments/open?bucket=attachments&path=${encodeURIComponent(fullPath)}&name=${encodeURIComponent(displayName)}`;
      contactFiles.push({ id, name: displayName, openUrl });
    }


  }
}

  const createdAtText = ticket.created_at ? new Date(ticket.created_at).toLocaleString() : "";
  

  return (
   
      <div className="w-full max-w-none md:max-w-[clamp(320px,90vw,928px)] -mx-2 md:mx-0 px-0 md:px-5 pt-2 md:pt-3 pb-3 md:pb-5">
        <div className="card-surface shadow-colored rounded-xl">
          <div className="px-5 py-4 border-b border-slate-100">
            <h1 className="text-xl md:text-2xl font-semibold"> {displayTitle}</h1>
			 <p className="text-sm text-blue-800">{createdAtText}</p>
          </div>

     <div className="p-3 overflow-x-auto">
<div className="card-surface p-4">
        <div><span className="font-medium">{t('detail.labels.ticketId')}:</span> {ticket.id}</div>
        <div><span className="font-medium">{t('detail.labels.subject')}:</span> {ticket.subject}</div>
        <div><span className="font-medium">{t('detail.labels.status')}:</span> 
		{ticket.status === "open"

? t('status.open')

: ticket.status === "answered"

? t('status.answered')

: t('status.closed')}
        <div><span className="font-medium">{t('detail.labels.date')}:</span> {new Date(ticket.created_at).toLocaleString()}</div>
        <div>
          <span className="font-medium">{t('detail.labels.question')}:</span>{" "}
          {ticket.question_id ? (
            <a className="text-blue-700 underline" href={`/dashboard/questions/${ticket.question_id}`}>{ticket.question_id}</a>
          ) : "—"}
        </div>
      </div>
</div></div>
      {/* Mesajlar */}

      {/* Messages */} <div className="p-3 overflow-x-auto">
<div className="card-surface p-4 space-y-2 edge-underline edge-blue edge-taper edge-rise-2mm">
        <div className="text-sm font-medium">{t("ui.messages")}</div>
        <div className="space-y-2">
          {(msgs || []).map((m, idx, arr) => {
          const isLast = idx === arr.length - 1;
          return (
            <div key={m.id} className="card-surface p-3 md:p-4">
          <div className="text-[11px] text-gray-500 mb-1 flex items-center gap-2">
  <span>
    {new Date(m.created_at).toLocaleString()} • {
      m.sender_role === "customer" ? t("common.customer")
      : m.sender_role === "user" ? t("common.user")
      : m.sender_role
    }
  </span>
                {isLast && (
                  <form action={markResolvedFromDetailAction} className="inline">
                    <input type="hidden" name="ticketId" value={ticket.id} />
                    <button
  type="submit"
  className="ml-2 btn btn--ghost text-xs"
  title={t("ui.markResolved.title")}
>
  {t("ui.markResolved.button")}
</button>
                  </form>
                )}
              </div>
              <div className="whitespace-pre-wrap text-sm"><MessageBodySmart text={m.body ?? ""} /></div>
            </div>
          );
        })}
        </div>
      </div>

      {/* Attachments */}
{contactFiles.length > 0 && (
<div className="card-surface p-4 space-y-2 mt-3 md:mt-3">
    <div className="text-sm font-medium mb-2">{t("ui.attachments")}</div>

    <div className="flex flex-wrap gap-3">
{contactFiles.map((f) => {
  return (
    <a
      key={f.id}
      href={f.openUrl || "#"}
      target="_blank"
            rel="noopener noreferrer"
            className="rounded p-2 hover:bg-gray-50 max-w-[220px]"
            title={f.name}
          >
            <div className="text-xs font-mono break-all max-w-[200px] flex items-center gap-1">
              <span aria-hidden="true">{fileIcon(f.name)}</span>
              <span className="truncate">{f.name}</span>
            </div>
          </a>
        );
      })}
    </div>
  </div>
)}


      {/* Reply form */}
     <div className="card-surface p-4 space-y-2 edge-underline edge-blue edge-taper edge-rise-2mm mt-3 md:mt-3">
<div className="text-sm font-medium">{t("ui.reply.title")}</div>
        <form action={replyTicketAction} className="space-y-3">
          <input type="hidden" name="ticketId" value={ticket.id} />
          <div>
            <label className="block text-sm mb-1">{t("ui.reply.messageLabel")}</label>
           <textarea
  name="message"
  className="w-full rounded px-3 py-2 min-h-[120px] bg-white/90 ring-1 ring-slate-200 focus:ring-2 focus:ring-blue-300 outline-none" placeholder={t("ui.reply.placeholder")} required />
          </div>
          <div>
            {/* Mevcut FilePicker bileşenini bozma: aynı isim/id ile kullan */}
            {/* Eğer sayfanda FilePicker farklıysa aynen koru */}
            <AttachmentsPicker name="attachments" inputId="support-attachments" /></div>
          <div>
            <button type="submit" className="btn btn--primary btn--cta">
              {t("ui.reply.send")}
            </button>
          </div>
        </form>
      </div>
    </div>
	    </div>   
  </div>     
  
  );
}
