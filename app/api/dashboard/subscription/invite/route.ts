// app/api/dashboard/subscription/invite/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "../../../../../lib/supabase/server";
import { getTranslations } from "next-intl/server";
export const dynamic = "force-dynamic";
import { APP_DOMAINS, BRAND, MAIL } from "../../../../../lib/config/appEnv";
function resolveOriginForEmail(host?: string | null) {
  const h = (host || "").toLowerCase();
    const allowedCsv =
     process.env.RESEND_ALLOWED_DOMAINS ||
     [APP_DOMAINS.primary, APP_DOMAINS.en].filter(Boolean).join(",");
   const allowed = allowedCsv
     .split(",")
     .map(s => s.trim().toLowerCase())
     .filter(Boolean);

  const isAllowed = allowed.some(d => h.endsWith(d));

  if (isAllowed) {
     if (APP_DOMAINS.primary && h.endsWith(APP_DOMAINS.primary)) {
       return `https://${APP_DOMAINS.primary}`;
     }
     if (APP_DOMAINS.en && h.endsWith(APP_DOMAINS.en)) {
       return `https://${APP_DOMAINS.en}`;
     }
  }

  // Optional override
  if (process.env.NEXT_PUBLIC_BASE_URL_TR) return process.env.NEXT_PUBLIC_BASE_URL_TR as string;

  // Fallbacks
  if (h.startsWith("localhost")) return "http://localhost:3000";
  return `https://${APP_DOMAINS.primary}`;
}

function pickFromAddress(host?: string | null) {
  const h = (host || "").toLowerCase();
   const fromTR =
     process.env.RESEND_FROM_TR ||
     process.env.MAIL_FROM ||
     `${BRAND.nameTR} <${MAIL.fromEmail}>`;
   const fromEN =
     process.env.RESEND_FROM_EN ||
     `${BRAND.nameEN} <${MAIL.fromEmail}>`;
   if (APP_DOMAINS.en && h.endsWith(APP_DOMAINS.en)) return fromEN;
  return fromTR; // default TR
}

async function sendResendEmail(to: string, subject: string, html: string, text: string, fromAddr: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, reason: "no_api_key" };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: fromAddr,
      to: [to],
      subject,
      html,
      text
    })
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

export async function POST(req: Request) {
  try {
    const supabase = await supabaseServer();
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes?.user) return NextResponse.json({ ok:false, error:"unauthorized" }, { status: 401 });

    const payload = await req.json();
    const email = String(payload?.email || "").trim().toLowerCase();
    if (!email) return NextResponse.json({ ok:false, error:"email_required" }, { status: 400 });

    // OWNER org (RLS-safe)
    const { data: orgId, error: ownerErr } = await supabase.rpc("rpc_org_owner_org_id");
    if (ownerErr || !orgId) {
      const msg = (ownerErr?.message || "").toLowerCase();
      if (msg.includes("unauthorized")) return NextResponse.json({ ok:false, error:"unauthorized" }, { status: 401 });
      if (msg.includes("owner_required") || !orgId) return NextResponse.json({ ok:false, error:"owner_required" }, { status: 403 });
      return NextResponse.json({ ok:false, error:"org_lookup_failed", detail: ownerErr?.message }, { status: 500 });
    }

    // Kullanıcı bul (RLS-safe)
    const { data: targetUserId, error: uerr } = await supabase.rpc("rpc_user_id_by_email", { p_email: email });
    if (uerr) return NextResponse.json({ ok:false, error:"user_lookup_failed", detail: uerr.message }, { status: 500 });
    if (!targetUserId) return NextResponse.json({ ok:false, error:"user_not_found" }, { status: 404 });

    // Profil garanti
    await supabase.rpc("rpc_profiles_upsert_for_user", {
      p_user_id: targetUserId as string,
      p_email: email,
      p_full_name: null
    });

    // Üyelik upsert (RLS recursion-free)
    const { data: ok, error: upErr } = await supabase.rpc("rpc_org_member_upsert", {
      p_org_id: orgId as string,
      p_user_id: targetUserId as string,
      p_role: "member",
      p_status: "active"
    });
    if (upErr || ok !== true) {
      const msg = (upErr?.message || "").toLowerCase();
      if (msg.includes("owner_required")) return NextResponse.json({ ok:false, error:"owner_required" }, { status: 403 });
      return NextResponse.json({ ok:false, error:"upsert_failed", detail: upErr?.message }, { status: 500 });
    }

    // İçerik ve tek RPC ile ticket + message + (kendi email kuyruğu)
    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", orgId as string)
      .maybeSingle();
    let orgName = org?.name;
// Resolve locale from URL param or host
const urlObj = new URL(req.url);
const qLocale = urlObj.searchParams.get("locale");
const host = urlObj.hostname;
const hostLocale = (APP_DOMAINS.en && host.toLowerCase().endsWith(APP_DOMAINS.en)) ? "en" : "tr";
const locale = (qLocale === "en" || qLocale === "tr") ? qLocale : hostLocale;

// i18n handle for emails
const t = await getTranslations({ locale, namespace: "emails.orgAuthorize" });
orgName = orgName || t("yourCompany");
    const reqHost = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
    const base = resolveOriginForEmail(reqHost);
    const ctaUrl = `${base}/ask/new?scope=org`;
    const subject = t("subject", { orgName });
    const bodyMd = t("bodyMd", { orgName });

    await supabase.rpc("rpc_contact_notify_new_message", {
      p_user_id: targetUserId as string,
      p_subject: subject,
      p_body_md: bodyMd,
      p_cta_url: ctaUrl
    });

    // --- SADECE MAIL --- (Resend ile anında gönder)
    const fromAddr = pickFromAddress(host);
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#111">
        <p>${t("bodyMd", { orgName })}</p>
        <p>
          <a href="${ctaUrl}" style="display:inline-block;padding:10px 16px;text-decoration:none;border-radius:8px;background:#111;color:#fff">
           ${t("ctaLabel")}
          </a>
        </p>
      </div>`;
    const text = t("bodyText", { orgName, ctaUrl });

    const send = await sendResendEmail(email, subject, html, text, fromAddr);

    // Audit only on failure; akışı bozmayalım
    if (!send.ok) {
      try {
        await supabase.from("audit_logs").insert({
          action: "email_send_failed",
          event: "contact.new_message.email.failed",
          resource_type: "user",
          resource_id: targetUserId as string,
          payload: { to: email, reason: send.reason || send.status, resp: send.json || null }
        });
      } catch {}
    }

    return NextResponse.json({ ok:true });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error:"internal_error", detail: e?.message }, { status: 500 });
  }
}
