import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import { createTranslator } from "next-intl";
import { BRAND, MAIL, APP_DOMAINS } from "@/lib/config/appEnv";
// From adreslerini ayrı tut: TR ve EN
const FROM_TR =
  process.env.RESEND_FROM_TR ||
  process.env.MAIL_FROM ||
  `${MAIL.fromName} <${MAIL.fromEmail}>`;

const FROM_EN =
  process.env.RESEND_FROM_EN ||
  process.env.MAIL_FROM ||
  `${MAIL.fromName} <${MAIL.fromEmail}>`;

const SITE = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
const resendApiKey = process.env.RESEND_API_KEY || "";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

type Method = "Paytr" | "Paddle" | "Kredi";


export async function notifyWorkerOnAssignment(opts: {
  questionId: string;
  method: Method;
  amountCents?: number;
  creditAmount?: number;
  tenantId?: string | null;
  force?: boolean; // NEW: bypass idempotency
}) {
  const payload = {
    method: opts.method,
    amount_cents: opts.amountCents ?? 0,
    credit_amount: opts.creditAmount ?? 0,
    site: SITE,
    force: !!opts.force
  };

  // pre-log
  const { data: preLog } = await supabase
    .from("notification_logs")
    .insert({
      event: "worker.assignment.payment",
      status: "queued",
      provider: "resend",
      payload,
      entity_type: "question",
      entity_id: opts.questionId,
      tenant_id: opts.tenantId ?? null
    })
    .select("id")
    .single();

  try {
    // If not forcing, only skip if there is a SENT notification in last 24h
    if (!opts.force) {
      const since = new Date(Date.now() - 1000*60*60*24).toISOString();
      const { data: alreadySent, error: aErr } = await supabase
        .from("notification_logs")
        .select("id")
        .eq("event", "worker.assignment.payment")
        .eq("entity_type", "question")
        .eq("entity_id", opts.questionId)
        .eq("status", "sent")
        .gte("created_at", since)
        .limit(1);
      if (aErr) throw new Error("select notification_logs failed: " + aErr.message);
      if (alreadySent && alreadySent.length) {
        await supabase.from("notification_logs").update({
          status: "skipped",
          error: "already-sent-24h"
        }).eq("id", preLog?.id || "");
        return { skipped: true, reason: "already-sent-24h" };
      }
    }

    // question & assigned worker
    const { data: q, error: qErr } = await supabase
      .from("questions")
      .select("assigned_to")
      .eq("id", opts.questionId)
      .maybeSingle();
    if (qErr) throw new Error("select questions failed: " + qErr.message);
    if (!q?.assigned_to) throw new Error("no-assigned-worker");

    // Get email via Auth Admin API (requires service role)
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    const userRes = await admin.auth.admin.getUserById(q.assigned_to as string);
    if (userRes.error) throw new Error("auth.admin.getUserById failed: " + userRes.error.message);
    const to = userRes.data?.user?.email || null;
    if (!to) throw new Error("no-email");

    // compose (worker tenant_key → locale/brand)
// Önce id ile dene; bulunamazsa user_id ile fallback
let prof: { tenant_key?: string | null } | null = null;
{
  const p1 = await supabase.from("profiles")
    .select("tenant_key")
    .eq("id", q.assigned_to as string)
    .maybeSingle();
  if (p1?.data?.tenant_key != null) {
    prof = p1.data;
  } else {
    const p2 = await supabase.from("profiles")
      .select("tenant_key")
      .eq("user_id", q.assigned_to as string)
      .maybeSingle();
    prof = p2?.data ?? null;
  }
}
// DİL TESPİTİ (yalnızca): profiles.tenant_key -> tenants.code -> tenants.locale ("tr-TR" | "en-US" | "en_US")
// Hiçbir fallback YOK.
const workerTenantKey = (prof?.tenant_key || "").trim();

// DEBUG: profil ve tenant_key
console.log("[notifyWorkerOnAssignment] profile.tenant_key:", workerTenantKey, "assigned_to:", q.assigned_to);

let tenantsRow: { locale?: string | null } | null = null;
if (workerTenantKey) {
  const t1 = await supabase
    .from("tenants")
    .select("locale")
    .eq("code", workerTenantKey)
    .maybeSingle();
  tenantsRow = t1?.data ?? null;
}

// DEBUG: tenants satırı ve locale
console.log("[notifyWorkerOnAssignment] tenantsRow:", tenantsRow);

// Sadece tenants.locale baz alınır; normalize et ("tr-TR" | "en-US")
const rawLocale = String(tenantsRow?.locale || "").trim();            // ör: "en-US" | "en_US" | "tr-TR"
const localeStr = rawLocale.replace("_", "-").toLowerCase();          // "en-us" | "tr-tr"

// getTranslations için TAM locale etiketi gerekli
const localeTag =
  localeStr === "en-us" ? "en-US" :
  localeStr === "tr-tr" ? "tr-TR" :
  "tr-TR"; // (beklenmeyen durumda bile boş kalmasın diye)

const lang: "tr" | "en" = localeTag.startsWith("en") ? "en" : "tr";

// Base URL: local test için ENV’ler
const baseUrl =
  lang === "en"
    ? (process.env.APP_BASE_URL_EN || "http://127.0.0.1:3000")
    : (process.env.APP_BASE_URL_TR || "http://localhost:3000");

// DEBUG: son karar (tam localeTag ile)
console.log("[notifyWorkerOnAssignment] resolved", { rawLocale, localeTag, lang, baseUrl });
// Locale'a göre dinamik From
const fromAddr = localeTag === "en-US" ? FROM_EN : FROM_TR;
console.log("[notifyWorkerOnAssignment] mail.from", { fromAddr });

const brand = lang === "en" ? BRAND.nameEN : BRAND.nameTR;

// *** KRİTİK DÜZELTME: getTranslations artık tam locale etiketiyle çağrılıyor
// *** KRİTİK DÜZELTME: request context yok; mesajları dosyadan yükleyip createTranslator kullan
const messages =
  localeTag === "en-US"
    ? (await import("@/i18n/messages/en.json")).default
    : (await import("@/i18n/messages/tr.json")).default;

// DEBUG: yüklenen namespace ve anahtarlar
console.log("[notifyWorkerOnAssignment] i18n load", {
  localeTag,
  ns: "email.workerAssign",
  keys: Object.keys((messages as any)?.["email.workerAssign"] || {})
});

const t = createTranslator({
  locale: localeTag,
  namespace: "email.workerAssign",
  messages
});




    const questionUrl = `${baseUrl}/worker/editor/${opts.questionId}`;
   const panelUrl = `${baseUrl}/worker`;

// === ÖDEME BİLGİSİ (PayTR / Paddle / Kredi) ===
// 1) Varsayılanlar (çağrıdan gelen)
let payMethod: Method = opts.method;
// Küçük birim (cents/kuruş) olarak çalışalım
let amountMinor = opts.amountCents ?? 0;
// Varsayılan para birimi (yönteme göre tahmin)
let currency = (payMethod === "Paddle") ? "USD" : "TRY";

// 2) DB'den (orders) doğrula/override et —> amount & currency
const { data: ord, error: ordErr } = await supabase
  .from("orders")
  .select("provider, amount, currency")
  .eq("question_id", opts.questionId)
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();

if (ordErr) {
  console.warn("[notifyWorkerOnAssignment] orders fetch error:", ordErr.message);
}

if (ord) {
  const prov = String(ord.provider || "").toLowerCase(); // "paddle" | "paytr" | "credits"
  if (prov === "paddle") {
    payMethod = "Paddle";
    amountMinor = typeof ord.amount === "number" ? ord.amount : amountMinor;
    currency = (ord.currency || "USD").toUpperCase();
  } else if (prov === "paytr") {
    payMethod = "Paytr";
    amountMinor = typeof ord.amount === "number" ? ord.amount : amountMinor;
    currency = (ord.currency || "TRY").toUpperCase();
  } else if (prov === "credits") {
    payMethod = "Kredi";
    // credits'te para tahsilatı yok → amount 0
    amountMinor = 0;
    currency = "TRY";
  }
}

// 3) Son bayraklar
const isPaytr = payMethod === "Paytr";
const isPaddle = payMethod === "Paddle";
const isCredit = payMethod === "Kredi";

// 4) Para formatı (amount sütunu küçük birim; 100'e böl)
const currencyLabel = (String(currency || "").toUpperCase() === "USD") ? "USD" : "TL";
const formattedAmount = isCredit
  ? "0 TL"
  : `${(amountMinor / 100).toFixed(2)} ${currencyLabel}`;

// 5) Kredi miktarı (sadece kredi yöntemi için)
const krediTutari = isCredit ? String(opts.creditAmount ?? 0) : "0";

// 6) Dil'e göre yöntem etiketi
const paymentMethodLabel = lang === "en"
  ? (isPaytr ? "PayTR" : isPaddle ? "Paddle" : "Credits")
  : (isPaytr ? "PayTR" : isPaddle ? "Paddle" : "Kredi");

// DEBUG
console.log("[notifyWorkerOnAssignment] payment", {
  questionId: opts.questionId,
  provider: ord?.provider || "(from opts)",
  currencyFromDB: ord?.currency || null,
  methodInMail: payMethod,
  amountMinor,
  formattedAmount,
  creditAmount: opts.creditAmount ?? 0,
  paymentMethodLabel
});



    const subject = t("subject", { brand });
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6">
        <p><strong>${t("questionId")}:</strong> <a href="${questionUrl}">${opts.questionId}</a></p>
       <p><strong>${t("paymentAmount")}:</strong> ${formattedAmount}</p>
        <p><strong>${t("creditAmount")}:</strong> ${krediTutari}</p>
        <p><strong>${t("paymentMethod")}:</strong> ${paymentMethodLabel}</p>
        <p style="margin-top:16px">
          <a href="${panelUrl}" style="display:inline-block;padding:10px 14px;border-radius:8px;background:#0ea5e9;color:#fff;text-decoration:none">${t("goToPanel")}</a>
          &nbsp;&nbsp;
          <a href="${questionUrl}" style="display:inline-block;padding:10px 14px;border-radius:8px;background:#10b981;color:#fff;text-decoration:none">${t("goToQuestion")}</a>
        </p>
        <p style="margin-top:24px">${t("bestRegards")}</p>
      </div>
    `;

    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY missing");
    }

    const resend = new Resend(resendApiKey);
    const sent = await resend.emails.send({ from: fromAddr, to, subject, html });


    await supabase.from("notification_logs").update({
      status: "sent",
      to_email: to,
      subject,
      provider_id: (sent as any)?.id || null
    }).eq("id", preLog?.id || "");

    return { sent: true };
  } catch (err: any) {
    await supabase.from("notification_logs").update({
      status: "failed",
      error: String(err?.message || err)
    }).eq("id", preLog?.id || "");
    return { sent: false, error: String(err?.message || err) };
  }
}
