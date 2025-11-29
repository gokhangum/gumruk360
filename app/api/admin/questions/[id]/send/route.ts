import { NextRequest, NextResponse } from "next/server"
import { Resend } from "resend"
import { renderAnswerEmailHtml, renderBrandedHtmlWithInnerHtml } from "@/lib/email/template"
import { APP_DOMAINS, BRAND, MAIL } from "@/lib/config/appEnv";
import { supabaseAdmin } from "@/lib/supabase/serverAdmin"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function resolveLocaleFromRequest(req: Request): "tr" | "en" {
  try {
    const host = (new URL(req.url)).host.toLowerCase()
    if (APP_DOMAINS.en && host.endsWith(APP_DOMAINS.en)) return "en"
  } catch {}
  try {
    const enEnv = (process.env.APP_BASE_URL_EN || process.env.NEXT_PUBLIC_SITE_URL_EN || "").toLowerCase()
    if (APP_DOMAINS.en && enEnv.includes(APP_DOMAINS.en)) return "en"
  } catch {}
  return "tr"
}

function resolveFromAddress(locale: "tr" | "en"): string {
  const FROM_TR = process.env.RESEND_FROM_TR
  const FROM_EN = process.env.RESEND_FROM_EN
  const MAIL_FROM =
     process.env.MAIL_FROM ||
     process.env.RESEND_FROM ||
     `${locale === "en" ? BRAND.nameEN : BRAND.nameTR} <${MAIL.fromEmail}>`
  if (locale === "en" && FROM_EN) return FROM_EN
  if (locale === "tr" && FROM_TR) return FROM_TR
  return MAIL_FROM
}

const BUCKET = "attachments";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env eksik (URL veya SERVICE_ROLE_KEY yok).");
  const { createClient } = require("@supabase/supabase-js");
  return createClient(url, key, { auth: { persistSession: false } });
}
// (EKLE — 42–60 arası yeni satırlar)
async function resolveLocaleByUserId(userId: string): Promise<"tr" | "en"> {
  try {
    const sb = getAdminClient();

    // 1) profiles → tenant_key (hem id hem user_id olasılığına karşı)
    let tenantKey: string | null = null;
     // 1a) id ile dene
     const p1 = await sb.from("profiles").select("tenant_key").eq("id", userId).maybeSingle();
     if (p1?.data?.tenant_key) {
       tenantKey = String(p1.data.tenant_key);
     } else {
      // 1b) yoksa user_id ile dene
       const p2 = await sb.from("profiles").select("tenant_key").eq("user_id", userId).maybeSingle();
       if (p2?.data?.tenant_key) {
         tenantKey = String(p2.data.tenant_key);
       }
     }
     if (!tenantKey) return "tr";

    // 2) tenants.code = tenant_key → tenants.locale
    const { data: tenant, error: tErr } = await sb
      .from("tenants")
      .select("locale")
      .eq("code", tenantKey)
      .maybeSingle();

    const raw = tErr ? null : (tenant?.locale || "");
    const lc = String(raw).toLowerCase();

    if (lc.startsWith("en")) return "en";
    if (lc.startsWith("tr")) return "tr";
    return "tr";
  } catch {
    return "tr";
  }
}

 async function collectAttachmentsExact(
   questionId: string
 ): Promise<Array<{ filename: string; content: Buffer }>> {

  try {
    const admin = getAdminClient();
    const bucket = admin.storage.from(BUCKET);
    const prefix = `${questionId}/answers/`;
    const listed = await bucket.list(prefix, { limit: 100 });
    const list = listed?.data || [];
    const attachments = [];
    for (const it of list) {
      if (!it || !it.name || it.name.endsWith("/")) continue;
      const key = `${prefix}${it.name}`;
      const dl = await bucket.download(key);
      if (!dl || !dl.data) continue;
      const buf = Buffer.from(await dl.data.arrayBuffer());
      attachments.push({ filename: it.name, content: buf });
    }
    return attachments;
  } catch {
    return [];
  }
}

function htmlToText(html: string): string {
  if (!html) return "";
  html = String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "");
  html = html
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
  return html.trim();
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const sb = getAdminClient();
  const { id } = await context.params;

  // Question + user
  const { data: q } = await sb.from("questions").select("id, title, user_id").eq("id", id).maybeSingle();
  if (!q) return NextResponse.json({ ok: false, error: "question_not_found" }, { status: 404 });
  const { data: prof } = await sb.from("profiles").select("email").eq("id", q.user_id).maybeSingle();
  if (!prof?.email) return NextResponse.json({ ok: false, error: "user_email_not_found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const locale = await resolveLocaleByUserId(q.user_id);
    const brand = (locale === "en" ? BRAND.nameEN : BRAND.nameTR);
  const FROM = resolveFromAddress(locale);
  const APP_URL =
    locale === "en"
      ? (process.env.APP_BASE_URL_EN || `https://${APP_DOMAINS.en || APP_DOMAINS.primary}`)
      : (process.env.APP_BASE_URL_TR || `https://${APP_DOMAINS.primary}`);
  const ctaUrl = `${APP_URL}/dashboard/questions/${q.id}`;
  const title = q.title || (locale === "tr" ? `${BRAND.nameTR} Yanıtı` : `${BRAND.nameEN} Answer`);
  const subject = (locale === "tr")
     ? `${BRAND.nameTR} Yanıtı – ${q.title || "Sorunuz"}`
     : `${BRAND.nameEN} Answer – ${q.title || "Your Question"}`;

  // Prefer editor HTML (body.htmlOverride or latest drafts.content_html)
  let htmlOverride = body?.htmlOverride != null ? String(body.htmlOverride) : null;
  if (!htmlOverride) {
    try {
      const dr = await sb
        .from("revisions")
        .select("content_html, content")
        .eq("question_id", q.id)
        .order("revision_no", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (dr?.data?.content_html) htmlOverride = String(dr.data.content_html);
    } catch {}
  }

  let htmlBody = "";
  if (htmlOverride) {
    // brand shell + CTA with raw editor HTML
    htmlBody = renderBrandedHtmlWithInnerHtml({ locale, title, innerHtml: htmlOverride, ctaUrl, brand });
  } else {
    // fallback to text template
    let finalText = String(body?.text || "");
    if (!finalText.trim()) {
      try {
        const ans = await sb.from("answers").select("content_md").eq("question_id", q.id).order("version", { ascending: false }).limit(1).maybeSingle();
        if (ans?.data?.content_md) finalText = String(ans.data.content_md);
        else {
          const dr2 = await sb.from("revisions").select("content_html, content").eq("question_id", q.id).order("revision_no", { ascending: false }).limit(1).maybeSingle();
          if (dr2?.data?.content_html) finalText = htmlToText(String(dr2.data.content_html));
          else if (dr2?.data?.content) finalText = String(dr2.data.content);
        }
      } catch {}
    }
    htmlBody = renderAnswerEmailHtml({ locale, title, bodyText: finalText || "", ctaUrl, brand });
  }

  // Attachments from attachments bucket at `${id}/answers/`
  const attFlag = new URL(request.url).searchParams.get("includeAttachments");
  const attachments = (attFlag === "0") ? [] : await collectAttachmentsExact(q.id);

  // Dry-run
  const isTest = new URL(request.url).searchParams.get("test") === "1";
  if (isTest) {
    return NextResponse.json({ ok: true, status: "test", payload: { to: prof.email, subject, hasHtmlOverride: !!htmlOverride, attachmentsCount: attachments.length } });
  }

  // Send via Resend
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { data, error } = await resend.emails.send({ from: FROM, to: [prof.email], subject, html: htmlBody, attachments });

  if (error) {
    return NextResponse.json({ ok: false, status: "failed", error: String(error?.message || error) }, { status: 502 });
  }
await sb.from("questions").update({ answer_status: "sent" }).eq("id", id)
  return NextResponse.json({ ok: true, status: "sent", id: data?.id || null });
}
