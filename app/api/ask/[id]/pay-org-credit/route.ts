function resolveBaseUrl(req: Request) {
  // Tercihen request URL'den origin al
  try {
    const url = new URL((req as any).url ?? "");
    return `${url.protocol}//${url.host}`.replace(/\/$/, "");
  } catch {
    // Fallback: env değişkenleri
    const site = process.env.NEXT_PUBLIC_SITE_URL;
    if (site) return site.replace(/\/$/, "");
    const vercel = process.env.VERCEL_URL;
    if (vercel) return `https://${vercel}`.replace(/\/$/, "");
    return "http://localhost:3000";
  }
// Notify ORG OWNER(s) via /dashboard/support by inserting contact_tickets + contact_messages
// when a MEMBER uses corporate credits. Email still sent (best-effort).
// Scope-limited: only this file changed.
import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { supabaseServer } from "../../../../../lib/supabase/server";
import { supabaseAdmin } from "../../../../../lib/supabase/serverAdmin";
import { APP_DOMAINS, BRAND, MAIL } from "../../../../../lib/config/appEnv";
import { resolveTenantCurrency } from "../../../../../lib/fx/resolveTenantCurrency";
 function resolveLocale(req: Request) {
   const hdr = (req.headers.get("x-language") || req.headers.get("accept-language") || "").toLowerCase();
   // Host tabanlı kontrol: EN domaininden geliyorsa 'en'
   try {
     const host = new URL((req as any).url ?? "").host.toLowerCase();
     if (APP_DOMAINS.en && host.endsWith(APP_DOMAINS.en)) return "en";
   } catch {}
   // Header tabanlı kontrol: EN belirtilmişse 'en'
   if (hdr.startsWith("en") || hdr.includes("en")) return "en";
   return "tr";
 }

function resolveBrandByLocale(locale: string) {
  return locale === "en" ? BRAND.nameEN : BRAND.nameTR;
}

async function sendResendEmail(to: string, subject: string, html: string, from: string) {
  try {
    const apiKey = process.env.RESEND_API_KEY;
   
    if (!apiKey) return false;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ to, from, subject, html }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
	const locale = resolveLocale(req);
const t = await getTranslations({ locale, namespace: "payOrgCredit" });
const brand = resolveBrandByLocale(locale);
const from =
  locale === "en"
    ? (process.env.RESEND_FROM_EN || `${BRAND.nameEN} <${MAIL.fromEmail}>`)
    : (process.env.RESEND_FROM_TR || `${BRAND.nameTR} <${MAIL.fromEmail}>`);

  try {
    const { id } = await ctx.params;
    const supabase = await supabaseServer();

    // Auth
    const { data: authRes, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authRes?.user) return NextResponse.json({ ok:false, error:"unauthorized" }, { status: 401 });
    const uid = authRes.user.id;

    // Soru
    const { data: q, error: qErr } = await supabase
      .from("questions")
      .select("id,user_id,price_final_tl,price_tl,status,title")
      .eq("id", id)
      .maybeSingle();
    if (qErr || !q) return NextResponse.json({ ok:false, error:"question_not_found" }, { status: 404 });
    if ((q as any).user_id !== uid) return NextResponse.json({ ok:false, error:"forbidden" }, { status: 403 });

    // Aktif org üyeliği (admin)
 const { data: mem, error: memErr } = await supabaseAdmin
       .from("organization_members")
       .select("org_id,status,org_role")
       .eq("user_id", uid)
       .or("status.is.null,status.eq.active")
       .order("org_role", { ascending: true }) // "member" (m) alfabetik olarak "owner" (o)'dan önce gelir
       .limit(1)
       .maybeSingle();
     if (memErr) return NextResponse.json({ ok:false, error:"org_lookup_failed", detail: memErr.message }, { status: 500 });
   
    if (!mem) return NextResponse.json({ ok:false, error:"no_active_org" }, { status: 400 });
     const orgId = mem.org_id as string;
     const actorOrgRole = String((mem as any).org_role ?? "").trim().toLowerCase() as "owner" | "member" | "";
    const isOwner = actorOrgRole === "owner";
    const redirectPath = isOwner ? "/dashboard/subscription" : "/dashboard/questions";
const redirectTo = `${resolveBaseUrl(req)}${redirectPath}`;
    // Ayarlar (admin)
    const { data: ss } = await supabaseAdmin
      .from("subscription_settings")
      .select("credit_price_lira, credit_discount_org")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!ss) return NextResponse.json({ ok:false, error:"subscription_settings_missing" }, { status: 500 });

    const price = Number((q as any).price_final_tl ?? (q as any).price_tl ?? 0);
    const creditPrice = Number((ss as any).credit_price_lira ?? 1);
    const discountOrg = Number((ss as any).credit_discount_org ?? 0);
    const d = discountOrg > 1 ? discountOrg / 100 : discountOrg;
    let requiredCredits = Math.round((price * (1 - d)) / (creditPrice || 1));
     // Kullanıcının tenant'ına göre pricing_multiplier uygula
    let host = "";
     try { host = new URL((req as any).url ?? "").host.toLowerCase(); } catch {}
     const resolved = await resolveTenantCurrency({ userId: uid, host });
	 const currency = String(resolved?.currency || "TRY");
     const pricingMultiplier = Number(resolved?.pricing_multiplier ?? 1);
     requiredCredits = Math.round(requiredCredits * (pricingMultiplier > 0 ? pricingMultiplier : 1));
    if (!Number.isFinite(requiredCredits) || requiredCredits <= 0) {
      return NextResponse.json({ ok:false, error:"invalid_required_credits" }, { status: 400 });
    }

    // Org bakiyesi (admin)
    const { data: orgRowBef } = await supabaseAdmin
      .from("organizations")
      .select("credit_balance")
      .eq("id", orgId)
      .maybeSingle();
    const orgBalanceBefore = Number((orgRowBef as any)?.credit_balance ?? 0);
    if (orgBalanceBefore < requiredCredits) {
      return NextResponse.json({ ok:false, error:"insufficient_org_credits", balance: orgBalanceBefore, needed: requiredCredits }, { status: 400 });
    }

    // Debit (prefer wrapper to avoid overload)
    let debitErr: any = null;
    const { error: err1 } = await supabase.rpc("fn_credit_debit_org_wrapper", {
      p_org_id: orgId,
      p_amount: Number(-requiredCredits),
      p_reason: "question_debit",
      p_question_id: id
    });
    if (err1 && /function fn_credit_debit_org_wrapper/.test(err1.message || "")) {
      const { error: err2 } = await supabase.rpc("fn_credit_debit", {
        p_scope_type: "org",
        p_scope_id: orgId,
        p_amount: Number(-requiredCredits),
        p_reason: "question_debit",
        p_question_id: id
      });
      debitErr = err2;
    } else {
      debitErr = err1;
    }
    if (debitErr) return NextResponse.json({ ok:false, error:"debit_failed", detail: debitErr.message }, { status: 500 });

    // Soru approved
    const { error: updErr } = await supabase
      .from("questions")
      .update({ status: "approved", approved_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", uid);

    // Bakiye sonrası (admin)
    const { data: orgRowAft } = await supabaseAdmin
      .from("organizations")
      .select("credit_balance")
      .eq("id", orgId)
      .maybeSingle();
    const orgBalanceAfter = Number((orgRowAft as any)?.credit_balance ?? orgBalanceBefore - requiredCredits);

    // === Notifications to ORG OWNERs (via contact_tickets + contact_messages) ===
    try {
      // Owners
      const { data: owners } = await supabaseAdmin
        .from("organization_members")
        .select("user_id")
        .eq("org_id", orgId)
        .eq("org_role", "owner")
        .or("status.is.null,status.eq.active");
      const ownerIds = (owners || []).map((r: any) => r.user_id);

      // Actor + owners profiles
      const { data: actorProf } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name, email")
        .eq("id", uid)
        .maybeSingle();
      const { data: ownerProfs } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ownerIds);

      const actorName = (actorProf as any)?.full_name || (actorProf as any)?.email || t("common.unknown");
      const qTitle = (q as any)?.title || t("common.untitled");
      const subject = t("ownerNotice.subject", { brand });
      const bodyLines = [
        t("ownerNotice.heading", { brand }),
        t("ownerNotice.intro"),
        "",
        `${t("ownerNotice.userFullName")}: ${actorName}`,
        `${t("ownerNotice.questionId")}: ${id}`,
        `${t("ownerNotice.questionTitle")}: ${qTitle}`,
        "",
        `${t("ownerNotice.creditsUsed")}: ${requiredCredits}`,
        `${t("ownerNotice.creditsBalance")}: ${orgBalanceAfter}`,
        "",
        t("ownerNotice.regards"),
t("ownerNotice.team", { brand }),
      ];
      const body = bodyLines.join("\n");
      const html = body.replace(/\n/g, "<br/>");

      // For each owner → create ticket + initial message
      for (const ownerId of ownerIds) {
        // 1) ticket
        const { data: tIns, error: tErr } = await supabaseAdmin
          .from("contact_tickets")
          .insert({ user_id: ownerId, subject, status: "open", question_id: id })
          .select("id")
          .single();
        const ticketId = tIns?.id as string | undefined;
        if (!tErr && ticketId) {
          // 2) first message from system
          await supabaseAdmin
            .from("contact_messages")
            .insert({ ticket_id: ticketId, sender_role: "system", body });
        }
      }

      // Emails (best-effort per owner)
      for (const op of (ownerProfs || [])) {
        const to = op.email;
        if (to) await sendResendEmail(to, subject, html, from);
      }
    } catch {}

    if (updErr) {
      return NextResponse.json({ ok:true, warning:"approved_update_failed", detail: updErr.message, paidWith:"org_credits", orgId, requiredCredits, balance: orgBalanceAfter });
    }

    
    // Send worker assignment email (org credits)
    try {
      const { data: qSel } = await supabaseAdmin.from("questions").select("id,title,assigned_to").eq("id", id).maybeSingle();
      const wid = qSel?.assigned_to || null;
      let workerEmail = "";
      if (wid) {
        const pr = await supabaseAdmin.from("profiles").select("email").eq("id", wid).maybeSingle();
        if (!pr.error && pr.data?.email) workerEmail = pr.data.email;
        if (!workerEmail) {
          const au = await supabaseAdmin.auth.admin.getUserById(wid as any).catch(() => null);
          const u = (au && (au.data as any)?.user) || null;
          if (u && u.email) workerEmail = u.email;
        }
      }
      if (qSel && workerEmail) {
        const baseUrl = resolveBaseUrl();
        const askLink = `${baseUrl}/worker/editor/${qSel.id}`;
        const panelLink = `${baseUrl}/worker`;
        const subject = t("assign.subject", { brand });
        const html = `
          <div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#111">
            <h2 style="margin:0 0 12px">${t("assign.heading", { brand })}</h2>
            <p><b>${t("assign.questionId")}:</b> <a href="${askLink}" style="color:#2563eb;text-decoration:none">${qSel.id}</a></p>
            <p><b>${t("assign.paymentAmount")}:</b> ${t("assign.amountWithCurrency", { amount: 0, currency })}</p>
            <p><b>${t("assign.creditAmount")}:</b> ${requiredCredits}</p>
            <p><b>${t("assign.paymentMethod")}:</b> ${t("assign.paymentMethodCredits")}</p>
            <div style="margin-top:16px">
              <a href="${panelLink}" style="display:inline-block;padding:10px 14px;background:#0ea5e9;color:#fff;border-radius:8px;text-decoration:none;margin-right:8px">${t("assign.panelCta")}</a>
              <a href="${askLink}" style="display:inline-block;padding:10px 14px;background:#10b981;color:#fff;border-radius:8px;text-decoration:none">${t("assign.openQuestionCta")}</a>
            </div>
            <p style="margin-top:16px">${t("assign.signoff")}</p>
          </div>`;
        const ok = await sendResendEmail(workerEmail, subject, html, from);
		        // Admin bildirimi (kredi ödemesi sonrası)
       try {
           const adminList = (process.env.PAYMENT_ADMIN_EMAILS || "")
             .split(/[;,\s]+/)
             .map(s => s.trim())
             .filter(Boolean);
           for (const adminEmail of adminList) {
            await sendResendEmail(adminEmail, subject, html, from);
           }
         } catch {}
        try { await supabaseAdmin.from("notification_logs").insert({ event: "worker.assignment.payment", to_email: workerEmail, subject, template: "worker_assignment", status: ok ? "sent" : "failed", payload: { question_id: qSel.id, method: "org_credits", credits: requiredCredits } as any }); } catch {}
      }
    } catch {}
   return NextResponse.json({ ok: true, paidWith: "org_credits", orgId, requiredCredits, balance: orgBalanceAfter, redirectTo });
  } catch (err:any) {
    return NextResponse.json({ ok:false, error:"unexpected", detail: err?.message ?? String(err) }, { status: 500 });
  }
}
