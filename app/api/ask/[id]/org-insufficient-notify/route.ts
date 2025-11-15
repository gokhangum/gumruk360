import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { Resend } from "resend";
import { createServerClient as createSSRClient } from "@supabase/ssr";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { getTranslations } from "next-intl/server";
import { APP_DOMAINS, BRAND, MAIL } from "@/lib/config/appEnv";
type Json = Record<string, any>;
function j(data: Json, status = 200) { return NextResponse.json(data, { status }); }

function resolveBaseUrl() {
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  const vercel = process.env.VERCEL_URL;
  if (site) return site.replace(/\/$/, "");
  if (vercel) return `https://${vercel}`.replace(/\/$/, "");
  return "http://localhost:3000";
}
function resolveLocale(req: Request) {
   const hdr = (req.headers.get("x-language") || req.headers.get("accept-language") || "").toLowerCase();
   try {
     const host = new URL(req.url).host.toLowerCase();
     if (APP_DOMAINS.en && host.endsWith(APP_DOMAINS.en)) return "en";
   } catch {}
   if (hdr.startsWith("en") || hdr.includes("en")) return "en";
   return "tr";
}

 function resolveBrandByLocale(locale: string) {
  return locale === "en"
     ? BRAND.nameEN
     : BRAND.nameTR;
 }

async function resolveUserClient() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return createSSRClient(url, anon, {
    cookies: {
      get(name: string) { return cookieStore.get(name)?.value; },
      set() {},
      remove() {},
    },
  }) as any;
}

function resolveAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) return null;
  return createAdminClient(url, service, { auth: { persistSession: false } }) as any;
}

/**
 * POST /api/ask/[id]/org-insufficient-notify
 * Body: { title?: string }
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const step: Json = { at: "" };
  try {
    step.at = "read_params";
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const questionTitle: string = body?.title ?? "";

    const baseUrl = resolveBaseUrl();
    const askUrl = `${baseUrl}/ask/${id}`;
    const subsUrl = `${baseUrl}/dashboard/subscription`;
const locale = resolveLocale(req);
const t = await getTranslations({ locale, namespace: "orgInsufficient" });
const brand = resolveBrandByLocale(locale);
const from =
   locale === "en"
     ? (process.env.RESEND_FROM_EN || `${BRAND.nameEN} <${MAIL.fromEmail}>`)
     : (process.env.RESEND_FROM_TR || `${BRAND.nameTR} <${MAIL.fromEmail}>`);

    // user-context client
    step.at = "sb_user_init";
    const sb = await resolveUserClient();
    if (!sb) return j({ ok: false, error: "supabase_user_client_unresolved", step }, 500);

    step.at = "get_user";
    const { data: userRes, error: userErr } = await sb.auth.getUser();
    if (userErr || !userRes?.user) return j({ ok: false, error: "unauthorized", step, detail: userErr?.message }, 401);
    const uid = userRes.user.id;

    step.at = "get_member_user_ctx";
    const { data: mem, error: memErr } = await sb
      .from("organization_members")
      .select("org_id, org_role, status")
      .eq("user_id", uid)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (memErr || !mem) return j({ ok: false, error: "no_active_org", step, detail: memErr?.message }, 404);
    const orgId = mem.org_id;

    // admin client (RLS bypass) for owners & RPC
    step.at = "sb_admin_init";
    const admin = resolveAdminClient();
    if (!admin) return j({ ok: false, error: "supabase_admin_client_unresolved", step }, 500);

    step.at = "get_owner_admin_ctx";
    const { data: owners, error: ownersErr } = await admin
      .from("organization_members")
      .select("user_id")
      .eq("org_id", orgId)
      .eq("org_role", "owner")
      .eq("status", "active");
    if (ownersErr) return j({ ok: false, error: "owner_fetch_error", step, detail: ownersErr.message }, 500);
    if (!owners || owners.length === 0) return j({ ok: false, error: "owner_not_found", step }, 404);
    const ownerIds = owners.map((o: any) => o.user_id);

    step.at = "get_profiles_user_ctx";
    const { data: currentProfile, error: cPErr } = await sb
      .from("profiles")
      .select("id, full_name, email")
      .eq("id", uid)
      .maybeSingle();
    if (cPErr) return j({ ok: false, error: "current_profile_error", step, detail: cPErr.message }, 500);
    const userFullName = currentProfile?.full_name ?? "";

    step.at = "get_question_title_user_ctx";
    let qTitle = questionTitle;
    if (!qTitle) {
      const { data: qrow, error: qErr } = await sb
        .from("questions")
        .select("id, title")
        .eq("id", id)
        .maybeSingle();
      if (qErr) return j({ ok: false, error: "question_fetch_error", step, detail: qErr.message }, 500);
      if (qrow?.title) qTitle = qrow.title;
    }

    // SINGLE message body (plain text). UI will make "Soru id" clickable; URL below is linkified.
    const singleBody = [
  t("subject", { brand }),
  "",
  t("intro"),
  `${t("userFullName")}: ${userFullName}`,
  `${t("questionId")}: ${id}`,
  `${t("questionTitle")}: ${qTitle}`,
  "",
  `${t("subsPage")}: ${subsUrl}`,
].join("\n");

    // Helper to send ONE RPC message for a given user
    async function sendOneMessage(forUserId: string) {
      const r = await admin.rpc("rpc_contact_notify_new_message", {
        p_user_id: forUserId,
        p_subject: t("subject", { brand }),
        p_body_md: singleBody,
        p_cta_url: askUrl, // keep CTA to the question; body contains subscription URL
      });
      if (r.error) return { ok: false, where: "rpc_msg", detail: r.error.message };
      return { ok: true };
    }

    step.at = "rpc_user_message";
    const rUser = await sendOneMessage(uid);
    if (!rUser.ok) return j({ ok: false, error: "rpc_user_failed", step, detail: rUser }, 500);

    step.at = "rpc_owner_message";
    for (const ownerId of ownerIds) {
      const r = await sendOneMessage(ownerId);
      if (!r.ok) return j({ ok: false, error: "rpc_owner_failed", step, detail: r }, 500);
    }

    // Owner emails (unchanged)
    step.at = "owner_emails_admin_ctx";
    const { data: ownerProfiles, error: profErr } = await admin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", ownerIds);
    if (profErr) return j({ ok: false, error: "owner_profiles_error", step, detail: profErr.message }, 500);
    const ownerEmails = (ownerProfiles || []).map((p: any) => p?.email).filter(Boolean);

    step.at = "send_email_admin_ctx";
    if (ownerEmails.length > 0) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      
      const html = `
        <div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">
          <p><strong>${t("email.heading")}</strong></p>
          <p>${t("email.intro")}</p>
          <p>
            <strong>${t("email.userFullName")}:</strong> ${userFullName}<br/>
      <strong>${t("email.questionId")}:</strong> <a href="${askUrl}">${id}</a><br/>
      <strong>${t("email.questionTitle")}:</strong> ${qTitle}
          </p>
          <p style="margin: 18px 0;">
            <a href="${askUrl}" style="display:inline-block;padding:8px 12px;border-radius:6px;background:#111827;color:#fff;text-decoration:none;margin-right:10px;">${t("email.openQuestionCta")}</a>
      <a href="${subsUrl}" style="display:inline-block;padding:8px 12px;border-radius:6px;background:#2563eb;color:#fff;text-decoration:none;">${t("email.buyCreditsCta")}</a>
          </p>
        </div>
      `;
      const resp: any = await resend.emails.send({
        from,
        to: ownerEmails,
        subject: t("subject", { brand }),
        html,
      });
      const msgId = resp?.id ?? resp?.data?.id ?? null;
      if (!msgId) return j({ ok: false, error: "email_send_failed", step, detail: resp }, 500);
    }

    return j({ ok: true, step });
  } catch (e: any) {
    return j({ ok: false, error: "server_error", step, detail: e?.message ?? String(e) }, 500);
  }
}
