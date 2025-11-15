export const runtime = "nodejs";

import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "../../../../lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import FilePicker from "./FilePicker";
import L2InfoSectionServer from "@/app/(dashboard)/ask/[id]/L2InfoSectionServer";
import { supabaseAdmin } from '@/lib/supabase/serverAdmin'
import { getTranslations, getLocale } from "next-intl/server"
import { APP_DOMAINS, MAIL } from "@/lib/config/appEnv";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
function detectDomain(h: Headers) {
  const host = h.get('x-forwarded-host') || h.get('host') || ''
  return (host || '').split(':')[0] || APP_DOMAINS.primary
}

async function getL2Strictness(domain: string, locale: 'tr'|'en') {
  const { data } = await supabaseAdmin
    .from('gpt_precheck_settings')
    .select('l2_strictness')
    .eq('domain', domain)
    .eq('locale', locale)
    .maybeSingle()
  const raw = data?.l2_strictness
  return (typeof raw === 'number') ? Math.max(0, Math.min(3, Math.floor(raw))) : 1
}

/** strictness=0 ise hiç göstermeyen sarmalayıcı */
async function L2InfoMaybe({ id }: { id: string }) {
  const h = await headers()
  const domain = detectDomain(h)
     const locale: 'tr'|'en' =
    (APP_DOMAINS.en && domain.endsWith(APP_DOMAINS.en)) ? 'en' : 'tr'
  const strict = await getL2Strictness(domain, locale)
  if (strict === 0) return null
  return <L2InfoSectionServer id={id} locale={locale} />
}
/* ---------- ADMIN (service role) client ---------- */
function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createAdminClient(url, key, { auth: { persistSession: false } });
}

/* ---------- Resend (mail) ---------- */
const resendKey = process.env.RESEND_API_KEY || "";
const resend = resendKey ? new Resend(resendKey) : null;

async function absoluteBaseUrl() {
  const h = await headers();
  const host = (h.get("x-forwarded-host") || h.get("host") || "localhost:3000").toLowerCase();
  const proto = (h.get("x-forwarded-proto") || "http").toLowerCase();
  return `${proto}://${host}`;
}

function mailFrom() {
  return (
    process.env.MAIL_FROM ||
    process.env.EMAIL_FROM ||
    `${MAIL.fromName} <${MAIL.fromEmail}>`
  );
}

function collectAdminRecipients(adminEmailsFromDb: string[] = []) {
  const set = new Set<string>();
  for (const e of adminEmailsFromDb) if (e) set.add(e);
  if (process.env.SUPPORT_EMAIL) set.add(process.env.SUPPORT_EMAIL);
  if (process.env.ADMIN_EMAILS) set.add(process.env.ADMIN_EMAILS);
  if (process.env.ADMIN_NOTIFY_EMAILS) {
    for (const e of process.env.ADMIN_NOTIFY_EMAILS.split(",").map(s => s.trim()).filter(Boolean)) {
      set.add(e);
    }
  }
  if (set.size === 0) set.add(MAIL.adminNotify?.[0] || MAIL.fromEmail);
  return Array.from(set);
}


/* ---------- ORGANIZATION ACCESS HELPERS ---------- */
async function canOrgOwnerSeeUser(a: ReturnType<typeof admin>, ownerId: string, memberUserId: string): Promise<boolean> {
  if (!ownerId || !memberUserId || ownerId === memberUserId) return ownerId === memberUserId;
  // Owner'ın aktif owner olduğu org'ları bul
  const { data: ownerOrgs } = await a
    .from("organization_members")
    .select("org_id")
    .eq("user_id", ownerId)
    .eq("org_role", "owner")
    .eq("status", "active")
    .limit(1000);
  const orgIds = (ownerOrgs ?? []).map((r:any) => r.org_id).filter(Boolean);
  if (orgIds.length === 0) return false;
  // Üyenin de bu org'lardan birinde aktif olup olmadığına bak
  const { data: mem } = await a
    .from("organization_members")
    .select("org_id")
    .in("org_id", orgIds.length ? orgIds : ["00000000-0000-0000-0000-000000000000"])
    .eq("user_id", memberUserId)
    .eq("status", "active")
    .limit(1);
  return !!(mem && mem.length > 0);
}


/* ---------- Server Action: Soru hakkında iletişime geç ---------- */
export async function contactForQuestionAction(formData: FormData) {
  "use server";
const tErr = await getTranslations("questions.detail.errors")
const tMail = await getTranslations("questions.email")
const localeForMail = await getLocale()
const isTrMail = localeForMail.startsWith("tr")
  const s = await supabaseServer();
  const a = admin();

  // 1) Kullanıcı kim?
  const { data: u, error: uErr } = await s.auth.getUser();
  if (uErr || !u?.user?.id) throw new Error(tErr("loginRequired"));
  const userId = u.user.id;

  // 2) Form verileri
  const questionId = String(formData.get("questionId") || "").trim();
  const messageText = String(formData.get("message") || "").trim();
  const files = formData.getAll("attachments").filter(Boolean) as File[];
  if (!questionId || !messageText) throw new Error(tErr("missingFields"));

  // 3) Soru sahibi kontrolü
  const { data: q } = await a
    .from("questions")
    .select("id,title,user_id")
    .eq("id", questionId)
    .maybeSingle();
  if (!q) throw new Error(tErr("unauthorized"));
  const canSee2 = q.user_id === userId || await canOrgOwnerSeeUser(a, userId, q.user_id);
  if (!canSee2) throw new Error(tErr("unauthorized"));

  // Gönderen bilgisi
  const { data: prof } = await a
    .from("profiles")
    .select("full_name,email")
    .eq("id", userId)
    .maybeSingle();
  const senderName = prof?.full_name || u.user.user_metadata?.full_name || u.user.email || tErr("fallbackUser");

  const senderEmail = prof?.email || u.user.email || "";

  // 4) Aynı soru için mevcut ticket var mı?
  const { data: existing } = await a
    .from("contact_tickets")
    .select("id,status")
    .eq("user_id", userId)
    .eq("question_id", questionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let ticketId: string;
  if (existing?.id) {
    ticketId = existing.id;
  } else {
const subjectAuto = (q.title
  ? tMail("subjectWithTitle", { title: q.title })
  : tMail("subjectGeneric")
).slice(0, 140);
    const { data: tIns, error: tErr } = await a
      .from("contact_tickets")
      .insert({
        user_id: userId,
        question_id: questionId,
        subject: subjectAuto,
        status: "open",
      })
      .select("id")
      .single();
    if (tErr || !tIns) throw new Error(tErr?.message || "ticketCreateFailed");
    ticketId = tIns.id as string;
  }

  // 5) Kullanıcı mesajı (CHECK kısıtı için 'customer' → olmazsa 'user')
  async function insertMsg(role: "customer" | "user") {
    return a.from("contact_messages").insert({
      ticket_id: ticketId,
      sender_role: role,
      body: messageText,
    }).select("id").single();
  }
  let mIns, mErr;
  {
    const r1 = await insertMsg("customer");
    mIns = r1.data; mErr = r1.error;
    if (mErr) {
      const r2 = await insertMsg("user");
      mIns = r2.data; mErr = r2.error;
    }
  }
 if (mErr || !mIns) throw new Error(tErr("messageCreateFailed"));


  // 6) Ek(ler) → storage + meta + e-posta ekleri
  const payloadAttachments: Array<{ path: string; file_name?: string; mime?: string }> = [];
  const attachmentsForEmail: Array<{ filename: string; content: Buffer; type?: string }> = [];

  if (files.length) {
    for (const f of files) {
      if (!("size" in f) || f.size === 0) continue;

      const buf = Buffer.from(await f.arrayBuffer());
      const ext = (f.name.split(".").pop() || "bin").toLowerCase();
      const key = `attachments/contact/${ticketId}/${crypto.randomUUID()}.${ext}`;

      const up = await s.storage.from("attachments").upload(key, buf, {
        contentType: f.type || "application/octet-stream",
        upsert: false,
      });
      if (up.error) throw new Error(tErr("uploadFailed", { detail: up.error.message }));

      const { error: metaErr } = await a.from("contact_attachments").insert({
        ticket_id: ticketId,
        object_path: key,
        file_name: f.name,
        mime: f.type,
        size: (f as any).size ?? null,
        uploaded_by: userId,
      });
      if (metaErr) throw new Error(tErr("metaInsertFailed", { detail: metaErr.message }));

      payloadAttachments.push({ path: key, file_name: f.name, mime: f.type });
      attachmentsForEmail.push({ filename: f.name, content: buf, type: f.type || undefined });
    }
  }

  // 7) Ticket durumu: kullanıcı mesajı → OPEN
  await a.from("contact_tickets").update({ status: "open" }).eq("id", ticketId);

  // 8) Adminlere e-posta (BİLDİRİM) + log
  const base = await absoluteBaseUrl();
  const qLink = `${base}/admin/request/${q.id}?email=${encodeURIComponent(senderEmail)}`;

  const { data: admins } = await a
    .from("profiles")
    .select("email")
    .eq("role", "admin")
    .not("email", "is", null);

  const toList = collectAdminRecipients((admins || []).map((p: any) => p.email).filter(Boolean));

  if (resend && toList.length) {
    const subject = tMail("adminEmailSubject", { shortId: q.id.slice(0, 8) });
 const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;font-size:14px">
    <div style="color:#6b7280;font-size:12px;margin-bottom:8px">${tMail("newMessageBanner")}</div>
    <div style="margin-bottom:8px"><strong>${tMail("questionId")}:</strong>
      <a href="${qLink}" target="_blank" rel="noopener noreferrer">${q.id}</a>
    </div>
    <div style="margin-bottom:12px"><strong>${tMail("sender")}:</strong> ${senderName} &lt;${senderEmail}&gt;</div>
    <div style="white-space:pre-wrap">${messageText}</div>
  </div>
`;
    const resp = await resend.emails.send({
      from: mailFrom(),
      to: toList,
      subject,
      html,
      attachments: attachmentsForEmail.length ? attachmentsForEmail : undefined,
    });
    const ok = !(resp as any)?.error;

    const rows = toList.map((to) => ({
      event: "ticket.new",
      to_email: to,
      subject,
      template: "ticket-new",
      provider: "resend",
      status: ok ? "sent" : "queued",
      entity_type: "ticket",
      entity_id: ticketId,
      payload: {
        ticket_id: ticketId,
        lang: isTrMail ? "tr" : "en",
        sender_name: senderName,
        sender_email: senderEmail,
        question_id: q.id,
        attachments: payloadAttachments,
      },
    }));
    await a.from("notification_logs").insert(rows);
  }

  // 9) Audit Log (ekstra)
  try {
    await a.from("audit_logs").insert({
      action: "contact.message_sent",
      resource_type: "contact_ticket",
      resource_id: ticketId,
      actor_id: userId,
      payload: {
        question_id: q.id,
        message_length: messageText.length,
        attachments_count: files.length,
      },
    });
  } catch {}

  revalidatePath(`/dashboard/questions/${q.id}`);
  redirect(`/dashboard/support/${ticketId}`);
}

/* ---------- Sayfa ---------- */
export default async function QuestionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await supabaseServer();
  const a = admin();

const locale = await getLocale()
const isTr = locale.startsWith("tr")
const t = await getTranslations("questions.detail")
const tCommon = await getTranslations("common")
const tStatus = await getTranslations("questions.status");
const tAnswer = await getTranslations("questions.answerStatus");

  // Kullanıcı
  const { data: userRes } = await s.auth.getUser();
  if (!userRes?.user) {
    redirect(`/login?next=${encodeURIComponent(`/dashboard/questions/${id}`)}`);
  }

  // Soru
  const { data: q } = await a
    .from("questions")
    .select("id,title,description,created_at,user_id,status,answer_status,assigned_to")
    .eq("id", id)
    .maybeSingle();

  if (!q) redirect("/dashboard/questions");
  const canSee = q.user_id === userRes.user.id || await canOrgOwnerSeeUser(a, userRes.user.id, q.user_id);
  if (!canSee) redirect("/dashboard/questions");
 let consultantDisplay: string | null = null;
 let assignedTo: string | null = null;
// Atanan danışmanı göster: questions.assigned_to -> worker_cv_profiles.display_name
try {
  const workerId = (q as any)?.assigned_to as string | null;
  if (workerId) {
    const { data: w } = await a
      .from("worker_cv_profiles")
      .select("display_name")
      .eq("worker_user_id", workerId)
      .maybeSingle();
    const dn = (w?.display_name || "").trim();
    if (dn) {
      consultantDisplay = dn;
    } else {
      const { data: p } = await a
        .from("profiles")
        .select("full_name")
        .eq("id", workerId)
        .maybeSingle();
      consultantDisplay = (p?.full_name || "").trim() || null;
    }
  }
} catch {}


  // 🔴 CEVAP: SADECE answer_status='sent' ise ve SADECE answer_drafts'tan (son versiyon)
  let answerContent: string | null = null;
  if ((q.answer_status || "").toLowerCase() === "sent") {
    const { data: d } = await a
      .from("revisions")
      .select("content_html, content, revision_no")
      .eq("question_id", q.id)
      .order("revision_no", { ascending: false })
      .limit(1)
      .maybeSingle();
    answerContent = d?.content_html || d?.content || null;
  }

  // Soru ve Cevap ekleri (Storage: attachments bucket)
  function isImage(name: string) {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    return ['jpg','jpeg','png','gif','webp','bmp','svg'].includes(ext);
  }

  function fileIcon(name: string) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (['jpg','jpeg','png','gif','webp','bmp','svg','heic','avif'].includes(ext)) return '🖼️';
    if (['pdf'].includes(ext)) return '📕';
    if (['doc','docx','rtf','odt','pages'].includes(ext)) return '📄';
    if (['xls','xlsx','csv','ods','numbers'].includes(ext)) return '📊';
    if (['ppt','pptx','key','odp'].includes(ext)) return '📽️';
    if (['zip','rar','7z','tar','gz','bz2'].includes(ext)) return '🗜️';
    if (['txt','md','log'].includes(ext)) return '📄';
    if (['json','yaml','yml','xml'].includes(ext)) return '🧾';
    if (['mp4','mov','avi','mkv','webm'].includes(ext)) return '🎞️';
    if (['mp3','wav','flac','m4a','ogg'].includes(ext)) return '🎵';
    return '📎';
  }

  type FileItem = { name: string; url: string };

  const questionPrefix = `${q.id}/`; // attachments/<questionId>/
  const answerPrefix   = `${q.id}/answers/`; // attachments/<questionId>/answers/

  // List question files
  const qListResp = await a.storage.from('attachments').list(questionPrefix, { limit: 100, sortBy: { column: 'name', order: 'asc' } });
  const aListResp = await a.storage.from('attachments').list(answerPrefix,   { limit: 100, sortBy: { column: 'name', order: 'asc' } });

  const questionFiles: FileItem[] = [];
  const answerFiles: FileItem[] = [];

  if (!qListResp.error && Array.isArray(qListResp.data)) {
    const signed = await Promise.all(qListResp.data.filter(f => !f.name.endsWith('/')).map(async (f) => {
      const fullPath = `${questionPrefix}${f.name}`;
      const { data: s } = await a.storage.from('attachments').createSignedUrl(fullPath, 60 * 60);
      return s?.signedUrl ? { name: f.name, url: s.signedUrl } : null;
    }));
    for (const it in signed) { if (signed[it]) questionFiles.push(signed[it] as FileItem); }
  }

  if (!aListResp.error && Array.isArray(aListResp.data)) {
    const signed2 = await Promise.all(aListResp.data.filter(f => !f.name.endsWith('/')).map(async (f) => {
      const fullPath = `${answerPrefix}${f.name}`;
      const { data: s } = await a.storage.from('attachments').createSignedUrl(fullPath, 60 * 60);
      return s?.signedUrl ? { name: f.name, url: s.signedUrl } : null;
    }));
    for (const it in signed2) { if (signed2[it]) answerFiles.push(signed2[it] as FileItem); }
  }

  // 🔵 İletişim (ticket) ekleri — yalnızca listeleme
  let contactTicketId: string | null = null;
  {
    const { data: t } = await a
      .from("contact_tickets")
      .select("id")
      .eq("user_id", userRes.user.id)
      .eq("question_id", q.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    contactTicketId = t?.id || null;
  }

  const contactFiles: FileItem[] = [];
  if (contactTicketId) {
    const contactPrefix = `attachments/contact/${contactTicketId}/`;
    const cListResp = await a.storage.from("attachments").list(contactPrefix, { limit: 100, sortBy: { column: "name", order: "asc" } });
    if (!cListResp.error && Array.isArray(cListResp.data)) {
      const signed3 = await Promise.all(cListResp.data.filter(f => !f.name.endsWith("/")).map(async (f) => {
        const fullPath = `${contactPrefix}${f.name}`;
        const { data: s } = await a.storage.from("attachments").createSignedUrl(fullPath, 60 * 60);
        return s?.signedUrl ? { name: f.name, url: s.signedUrl } : null;
      }));
      for (const it in signed3) { if (signed3[it]) contactFiles.push(signed3[it] as FileItem); }
    }
  }

  const createdAtText = q.created_at ? new Date(q.created_at).toLocaleString(locale) : "";
  const statusKey = (q.status || "").toLowerCase();
  const showOfferLink = statusKey === "rejected" || statusKey === "submitted";

    return (
   
    <div className="px-0 md:px-5 pt-2 md:pt-3 pb-3 md:pb-5">
       <div className="card-surface shadow-colored rounded-none md:rounded-xl">
          <div className="px-5 py-4 border-b border-slate-100">
		  <div className="rounded-xl bg-blue-50/80 border border-blue-200/60 px-4 py-3 mb-4 flex items-center gap-3">
            <h1 className="text-xl md:text-2xl font-semibold break-words whitespace-normal leading-snug">
              {q.title || t("loadingTitle")}
            </h1>
            <div className="text-xs text-gray-500">{createdAtText}</div>
          </div>  </div>

          <div className="p-5 space-y-5">
            {/* Soru açıklaması */}
            {q.description && (
              <div
               className="card-surface p-4 prose max-w-none edge-underline edge-blue edge-taper edge-rise-2mm"
                dangerouslySetInnerHTML={{ __html: q.description }}
              />
            )}

            {/* Soru Ekleri */}
            {questionFiles.length > 0 && (
              <div className="card-surface p-4">
              <div className="mb-2">
  <div className="text-sm font-medium">{t("questionAttachments")}</div>
  
</div>
                <div className="flex flex-wrap gap-3">
                  {questionFiles.map((f) => (
                    <a
                      key={f.name}
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded p-2 hover:bg-gray-50 max-w-[200px]"
                      title={f.name}
                    >
                      {isImage(f.name) ? (
                        <div className="flex flex-col items-start">
                          {/* eslint-disable @next/next/no-img-element */}
                          <img src={f.url} alt={f.name} className="max-h-28 max-w-[180px] object-cover rounded" />
                          <div className="mt-1 text-[11px] font-mono break-all max-w-[180px] flex items-center gap-1">
                            <span aria-hidden="true">{fileIcon(f.name)}</span>
                            <span className="truncate">{f.name}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs font-mono break-all max-w-[180px] flex items-center gap-1">
                          <span aria-hidden="true">{fileIcon(f.name)}</span>
                          <span className="truncate">{f.name}</span>
                        </div>
                      )}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Cevap içeriği — yalnızca answer_status='sent' ise */}
            {answerContent && (
              <div className="card-surface p-4 text-sm whitespace-pre-wrap bg-gray-50 edge-underline edge-blue edge-taper edge-rise-2mm">
           <div className="mb-2">
<div className="text-sm md:text-base font-semibold mb-1">{t("answerHeader")}</div>
  
</div>
                <div
                  className="prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: answerContent }}
                />
              </div>
            )}

            {/* Cevap Ekleri */}
            {answerFiles.length > 0 && (
              <div className="card-surface p-4 edge-underline edge-blue edge-taper edge-rise-2mm">
                <div className="mb-2">
  <div className="text-sm md:text-base font-semibold mb-1">{t("answerAttachments")}</div>
  
</div>
                <div className="flex flex-wrap gap-3">
                  {answerFiles.map((f) => (
                    <a
                      key={f.name}
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded p-2 hover:bg-gray-50 max-w-[200px]"
                      title={f.name}
                    >
                      {isImage(f.name) ? (
                        <div className="flex flex-col items-start">
                          {/* eslint-disable @next/next/no-img-element */}
                          <img src={f.url} alt={f.name} className="max-h-28 max-w-[180px] object-cover rounded" />
                          <div className="mt-1 text-[11px] font-mono break-all max-w-[180px] flex items-center gap-1">
                            <span aria-hidden="true">{fileIcon(f.name)}</span>
                            <span className="truncate">{f.name}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs font-mono break-all max-w-[180px] flex items-center gap-1">
                          <span aria-hidden="true">{fileIcon(f.name)}</span>
                          <span className="truncate">{f.name}</span>
                        </div>
                      )}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Durum + Cevap Durumu + Danışman */}
            <div className="card-surface grid grid-cols-1 md:grid-cols-[auto_1fr_auto] items-start gap-2 md:gap-3 text-sm px-4 md:px-5 py-3 pb-4">
			<div className="col-span-full px-1">

</div>
              {/* Sol: Soru durumu (rozet) */}
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-gray-500">{t("status")}</span>
                {(() => {
                  const key = String(q.status || "").toLowerCase();
                  const known = ["new","submitted","approved","rejected","paid","pending","priced","closed"];
                  const label = known.includes(key) ? tStatus(key) : (q.status || "-");
                  const tone =
                    key === "approved" || key === "paid" || key === "closed"
                      ? "success"
                      : key === "pending" || key === "submitted"
                      ? "warning"
                      : key === "rejected"
                      ? "danger"
                      : key === "priced"
                      ? "info"
                      : "muted";
                  return <Badge tone={tone as any} className="whitespace-nowrap">{label}</Badge>;
                })()}
              </div>

              {/* Orta: Cevap Durumu */}
              <div className="justify-self-stretch md:justify-self-center text-slate-700 text-sm text-left min-w-0 flex flex-row flex-wrap items-center gap-2">
                <span className="text-gray-500 mr-1 whitespace-nowrap">{t("answerStatus")}:</span>
                <span className="font-medium">
                  {(() => {
                    const key = String(q.answer_status || "").toLowerCase();
                    const known = ["drafting","in_review","completed","sent","reopened"];
                    return known.includes(key) ? tAnswer(key) : (q.answer_status || "-");
                  })()}
                </span>
              </div>

              {/* Sağ: Atanan Danışman + Teklife Git */}
              <div className="justify-self-end flex items-center gap-3 whitespace-nowrap">
                {consultantDisplay && (
                  <span>
                    <span className="text-red-600">{t("assignedConsultant")}:</span>
                    <span className="font-medium ml-1">{consultantDisplay}</span>
                  </span>
                )}
                {showOfferLink && (
                  <Link
                    href={`/ask/${q.id}`}
                    className="btn btn--outline text-xs sm:text-sm whitespace-nowrap"
                    title={t("goToOfferTitle")}
                    aria-label={t("goToOfferAria")}
                  >
                    <span>{t("goToOfferCta")}</span>
                  </Link>
                )}
              </div>
            </div>
          </div>{/* /p-5 */}

        </div>{/* /card-surface */}

{/* L2 bilgi kutusu */}
<div className="card-surface mt-4">
  <L2InfoMaybe id={id} />
</div>

{/* İletişim formu (soru hakkında) */}
<div className="card-surface rounded-xl overflow-hidden mt-6 md:mt-8 edge-underline edge-blue edge-taper edge-rise-2mm">
  <div className="px-5 py-3 border-b border-slate-100">
    <div className="text-sm font-medium">{t("contactHeader")}</div>
  
</div>

        <form action={contactForQuestionAction} className="p-5 space-y-4">
          <input type="hidden" name="questionId" value={q.id} />
           <div>
           <label className="block text-sm mb-1">{t("yourMessage")}</label>
         <textarea
              name="message"
             rows={4}
              className="input w-full msg-field"
             placeholder={t("messagePlaceholder")}
              required
              />
           </div>

        <div>
             <FilePicker
               name="attachments"
                inputId="file_input_775225"
                labelText={t("filePicker.label")}
                buttonText={t("filePicker.choose")}
                helperId="file_input_775225_helper"
                multiple
              />
            </div>

            <div>
           <Button type="submit" variant="primary">
  {tCommon("send")}
</Button>
            </div>
          </form>

          {/* İletişim Ekleri Liste */}
		  
        {contactFiles.length > 0 && (
		
  <div className="border-t px-5 py-4">
    <div className="text-sm font-medium mb-2">
      {t("contactAttachments")}
    </div>
              <div className="flex flex-wrap gap-3">
                {contactFiles.map((f) => (
                  <a
                    key={f.name}
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded p-2 hover:bg-gray-50 max-w-[200px]"
                    title={f.name}
                  >
                    {isImage(f.name) ? (
                      <div className="flex flex-col items-start">
                        {/* eslint-disable @next/next/no-img-element */}
                        <img src={f.url} alt={f.name} className="max-h-28 max-w-[180px] object-cover rounded" />
                        <div className="mt-1 text-[11px] font-mono break-all max-w-[180px] flex items-center gap-1">
                          <span aria-hidden="true">{fileIcon(f.name)}</span>
                          <span className="truncate">{f.name}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs font-mono break-all max-w-[180px] flex items-center gap-1">
                        <span aria-hidden="true">{fileIcon(f.name)}</span>
                        <span className="truncate">{f.name}</span>
                      </div>
                    )}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
   
  );
}
