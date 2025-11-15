// app/api/blog/submit-for-review/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { Resend } from "resend"; // [4] EKLENDI
import { renderBrandedHtmlWithInnerHtml } from "@/lib/email/template"; // [5] EKLENDI
import { APP_DOMAINS, BRAND, MAIL } from "@/lib/config/appEnv"; // [6] EKLENDI

export const runtime = "nodejs";

function resolveLocaleFromRequest(req: Request): "tr" | "en" { // [10-14] EKLENDI
  try {
    const host = new URL(req.url).host.toLowerCase();
    if (APP_DOMAINS.en && host.endsWith(APP_DOMAINS.en)) return "en";
  } catch {}
  return "tr";
}

function resolveFrom(locale: "tr" | "en") { // [16-28] EKLENDI
  const FROM_TR = process.env.RESEND_FROM_TR;
  const FROM_EN = process.env.RESEND_FROM_EN;
  const MAIL_FROM = process.env.RESEND_FROM ||
    process.env.MAIL_FROM ||
    `${MAIL.fromName} <${MAIL.fromEmail}>`;

  if (locale === "en" && FROM_EN) return FROM_EN;
  if (locale === "tr" && FROM_TR) return FROM_TR;
  return MAIL_FROM;
}

function adminReviewUrl() { // [30-35] EKLENDI
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `https://${APP_DOMAINS.primary}`);
  return `${base}/admin/blog/review`;
}

export async function POST(req: Request) { // [37] DEVAM
  try {
    const { id } = await req.json(); // [39]
    const supabase = await supabaseServer(); // [40]

    // 1) RPC: status -> in_review
    const { error } = await supabase.rpc("fn_blog_submit_for_review", { p_id: id }); // [43]
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 }); // [44]

    // 2) Post detaylarını çek (başlık, slug, dil, tenant) — RLS altında çalışır
    const { data: postRow } = await supabase // [47-55]
      .from("blog_posts")
      .select("id, title, slug, lang, tenant_id")
      .eq("id", id)
      .limit(1)
      .maybeSingle();

    // 3) E-posta hazırlığı
    const locale = resolveLocaleFromRequest(req); // [58]
    const subject =
      locale === "en"
        ? `Blog submission for review: ${postRow?.title || id}`
        : `İncelemeye gönderildi: ${postRow?.title || id}`; // [61-63]
    const reviewLink = adminReviewUrl(); // [64]
    const editLink = `${reviewLink.replace(/\/review$/, "")}/edit/${id}`; // [65]

    const innerHtml =
      locale === "en"
        ? `
          <p>A new blog post has been submitted for review.</p>
          <ul>
            <li><b>Title:</b> ${postRow?.title || "-"}</li>
            <li><b>Slug:</b> ${postRow?.slug || "-"}</li>
            <li><b>Lang:</b> ${postRow?.lang || "-"}</li>
          </ul>
          <p>
            <a href="${reviewLink}">Open Review Queue</a> •
            <a href="${editLink}">Open Editor</a>
          </p>
        `
        : `
          <p>Yeni bir blog yazısı incelemeye gönderildi.</p>
          <ul>
            <li><b>Başlık:</b> ${postRow?.title || "-"}</li>
            <li><b>Slug:</b> ${postRow?.slug || "-"}</li>
            <li><b>Dil:</b> ${postRow?.lang || "-"}</li>
          </ul>
          <p>
            <a href="${reviewLink}">İnceleme Kuyruğunu Aç</a> •
            <a href="${editLink}">Editörü Aç</a>
          </p>
        `; // [66-92]

    const html = renderBrandedHtmlWithInnerHtml({ // [94-100]
      locale,
      title: subject,
      innerHtml,
      ctaUrl: reviewLink,
      brand: locale === "en" ? BRAND.nameEN : BRAND.nameTR,
    });

    // 4) Resend — env.local'dan okur
    const resendApiKey = process.env.RESEND_API_KEY || ""; // [103]
    const resend = new Resend(resendApiKey); // [104]
    const from = resolveFrom(locale); // [105]
    const to = (MAIL.adminNotify || []).filter(Boolean); // ADMIN_NOTIFY_EMAILS // [106]

    if (resendApiKey && from && to.length > 0) { // [108]
      await resend.emails.send({
        from,
        to,
        subject,
        html,
      });
    }

    return NextResponse.json({ ok: true, notified: to.length > 0 }); // [118]
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "ERR" }, { status: 500 }); // [120]
  }
}
