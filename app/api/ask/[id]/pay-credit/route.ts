async function sendResendEmail(
   to: string | string[],
  subject: string,
  html: string,
   from: string
 ): Promise<boolean> { try { const apiKey = process.env.RESEND_API_KEY; if (!apiKey) return false; const res = await fetch("https://api.resend.com/emails", { method:"POST", headers:{ "Authorization":`Bearer ${apiKey}`, "Content-Type":"application/json" }, body: JSON.stringify({ from, to, subject, html }) }); return res.ok } catch(e){ return false } }

function resolveBaseUrl(){const site=process.env.NEXT_PUBLIC_SITE_URL;const vercel=process.env.VERCEL_URL;if(site)return site.replace(/\/$/,"");if(vercel)return `https://${vercel}`.replace(/\/$/,"");return "http://localhost:3000";}
// ⓘ Patch: subscription_settings via supabaseAdmin to avoid RLS; same calc as offer page
import { NextResponse } from "next/server";
import { supabaseServer } from "../../../../../lib/supabase/server";
import { supabaseAdmin } from "../../../../../lib/supabase/serverAdmin";
import { getTranslations } from "next-intl/server";
import { APP_DOMAINS, BRAND, MAIL } from "../../../../../lib/config/appEnv";
 import { resolveTenantCurrency } from "../../../../../lib/fx/resolveTenantCurrency"
 import { headers } from "next/headers"
 function resolveLocale(req: Request) {
   const hdr = (req.headers.get("x-language") || req.headers.get("accept-language") || "").toLowerCase();
   try {
     const host = new URL((req as any).url ?? "").host.toLowerCase();
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

function computeCredits(price: number, creditPrice: number, discount: number) {
  const d = discount > 1 ? (discount / 100) : discount;
  const base = price * (1 - d);
  const cp = creditPrice || 1;
  return base / cp;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
	  const locale = resolveLocale(req);
const t = await getTranslations({ locale, namespace: "payCredit" });
const brand = resolveBrandByLocale(locale);
const from =
   locale === "en"
     ? (process.env.RESEND_FROM_EN || `${BRAND.nameEN} <${MAIL.fromEmail}>`)
     : (process.env.RESEND_FROM_TR || `${BRAND.nameTR} <${MAIL.fromEmail}>`);

    const { id } = await ctx.params;
    const supabase = await supabaseServer();

    // Auth
    const { data: authRes, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authRes?.user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    const uid = authRes.user.id;

    // Question
    const { data: q, error: qErr } = await supabase
      .from("questions")
      .select("id,user_id,price_final_tl,price_tl,status")
      .eq("id", id)
      .maybeSingle();
    if (qErr || !q) return NextResponse.json({ ok: false, error: "question_not_found" }, { status: 404 });
    if (q.user_id !== uid) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

    // subscription_settings (Admin – bypass RLS)
    const { data: ss, error: ssErr } = await supabaseAdmin
      .from("subscription_settings")
      .select("credit_price_lira, credit_discount_user")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ssErr || !ss) return NextResponse.json({ ok: false, error: "subscription_settings_missing", detail: ssErr?.message }, { status: 500 });

    // Compute required credits (user discount)
    const price = Number((q as any).price_final_tl ?? (q as any).price_tl ?? 0);
    const creditPrice = Number(ss.credit_price_lira ?? 1);
    const discountUser = Number(ss.credit_discount_user ?? 0);
    let requiredCredits = computeCredits(price, creditPrice, discountUser);
	 // Kullanıcının tenant'ına göre multiplier uygula (ledger de aynı tutarı düşsün)
     const host = (await headers()).get("host") ?? null;
     const resolved = await resolveTenantCurrency({ userId: uid, host });
     const pricingMultiplier = Number(resolved?.pricing_multiplier ?? 1);
     requiredCredits = Math.round(requiredCredits * (pricingMultiplier > 0 ? pricingMultiplier : 1));
    if (requiredCredits <= 0) return NextResponse.json({ ok: false, error: "invalid_required_credits" }, { status: 400 });

    // Balance check via admin SUM(credit_ledger.change) to mirror dashboard
    const { data: uRows, error: uErr } = await supabaseAdmin
      .from("credit_ledger")
      .select("change")
      .eq("scope_type", "user")
      .eq("scope_id", uid)
      .limit(50000);
    if (uErr) return NextResponse.json({ ok: false, error: "user_balance_failed", detail: uErr.message }, { status: 500 });
    const userBalance = (uRows || []).reduce((acc:number, r:any) => acc + Number(r.change || 0), 0);
    if (userBalance < requiredCredits) return NextResponse.json({ ok: false, error: "insufficient_credits" }, { status: 400 });

    // Debit
    const { error: debitErr } = await supabase.rpc("fn_credit_debit", {
      p_scope_type: "user",
      p_scope_id: uid,
      p_amount: -requiredCredits,
      p_reason: "question_debit",
      p_question_id: id
    });
    if (debitErr) return NextResponse.json({ ok: false, error: "debit_failed", detail: debitErr.message }, { status: 500 });

    // Mark approved
    const { error: updErr } = await supabase
      .from("questions")
      .update({ status: "approved", approved_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", uid);
    if (updErr) {
      return NextResponse.json({ ok: true, warning: "approved_update_failed", detail: updErr.message, requiredCredits });
    }

    
    // send worker assignment email
    try{
      const { data: qSel } = await (await supabaseServer()).from("questions").select("id,title,assigned_to").eq("id", id).maybeSingle();
      const wid = qSel?.assigned_to || null;
      let workerEmail = "";
      if (wid){
        const pr = await (await supabaseServer()).from("profiles").select("email").eq("id", wid).maybeSingle();
        if (!pr.error && pr.data?.email) workerEmail = pr.data.email;
        if (!workerEmail){
          const au = await (await supabaseServer()).auth.getUser(wid as any).catch(()=>null);
        }
      }
      if (wid){
        // fallback to admin to fetch auth email
        if (!workerEmail){
          const au = await supabaseAdmin.auth.admin.getUserById(wid as any).catch(()=>null);
          const u = (au && (au.data as any)?.user) || null;
          if (u && u.email) workerEmail = u.email;
        }
      }
      if (qSel && workerEmail){
        const baseUrl = resolveBaseUrl();
        const askLink = `${baseUrl}/worker/editor/${qSel.id}`;
        const panelLink = `${baseUrl}/worker`;
        const subject = t("assign.subject", { brand });
        const html = `
          <div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#111">
            <h2 style="margin:0 0 12px">${t("assign.heading", { brand })}</h2>
            <p><b>${t("assign.questionId")}:</b> <a href="${askLink}" style="color:#2563eb;text-decoration:none">${qSel.id}</a></p>
            <p><b>${t("assign.paymentAmount")}:</b> 0 TL</p>
            <p><b>${t("assign.creditAmount")}:</b> ${requiredCredits}</p>
            <p><b>${t("assign.paymentMethod")}:</b> ${t("assign.creditMethod")}</p>
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
        try { await (await supabaseServer()).from("notification_logs").insert({ event: "worker.assignment.payment", to_email: workerEmail, subject, template: "worker_assignment", status: ok ? "sent" : "failed", payload: { question_id: qSel.id, method: "credit", credits: requiredCredits } as any }); } catch {}
      }
    }catch{}
    
    return NextResponse.json({ ok: true, paidWith: "user_credits", requiredCredits });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: "unexpected", detail: err?.message ?? String(err) }, { status: 500 });
  }
}
