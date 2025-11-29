// lib/mailer/notifyUserOnPayment.ts
import { createClient } from "@supabase/supabase-js";
import { MAIL, APP_DOMAINS } from "@/lib/config/appEnv";
import { sendPaymentReceiptEmail } from "@/lib/emails/receipt";
// Burada kendi Database tipini import ediyorsan ekle:
// import type { Database } from "@/lib/supabase/types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const FROM_TR =
  process.env.RESEND_FROM_TR ||
  process.env.MAIL_FROM ||
  `${MAIL.fromName} <${MAIL.fromEmail}>`;

const FROM_EN =
  process.env.RESEND_FROM_EN ||
  process.env.MAIL_FROM ||
  `${MAIL.fromName} <${MAIL.fromEmail}>`;

export async function notifyUserOnPaymentSuccess(orderId: string) {
  const supabase = createClient<any>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 1) Order'ı çek
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select(
      "id, amount_cents, amount, currency, user_id, question_id, tenant_id"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (orderErr || !order || !order.user_id) {
    console.error("notifyUserOnPaymentSuccess: order not found", {
      orderId,
      orderErr,
    });
    return { sent: false as const, reason: "no_order_or_user" as const };
  }

  // 2) Kullanıcı profili
  const { data: prof, error: profErr } = await supabase
    .from("profiles")
    .select("email, full_name, tenant_key")
    .eq("id", order.user_id as string)
    .maybeSingle();

  if (profErr || !prof || !prof.email) {
    console.error("notifyUserOnPaymentSuccess: profile not found", {
      orderId,
      profErr,
    });
    return { sent: false as const, reason: "no_profile_or_email" as const };
  }

  const tenantKey = (prof.tenant_key || "").trim();

  // 3) Tenant -> locale & primary_domain
  let lang: "tr" | "en" = "tr";
  let dashboardBaseUrl: string =
    process.env.APP_BASE_URL_TR ||
    (APP_DOMAINS.primary ? `https://${APP_DOMAINS.primary}` : "http://localhost:3000");

  if (tenantKey) {
    const { data: tenant, error: tenErr } = await supabase
      .from("tenants")
      .select("locale, primary_domain")
      .eq("code", tenantKey)
      .maybeSingle();

    if (!tenErr && tenant) {
      const rawLocale = String(tenant.locale || "").trim().toLowerCase();
      if (rawLocale.startsWith("en")) lang = "en";
      else if (rawLocale.startsWith("tr")) lang = "tr";

      if (tenant.primary_domain) {
        const dom = String(tenant.primary_domain).trim();
        const isLocal =
          dom.includes("localhost") || dom.includes("127.0.0.1");
        const proto = isLocal ? "http" : "https";
        dashboardBaseUrl = `${proto}://${dom}`;
      }
    }
  }

  const from = lang === "en" ? FROM_EN : FROM_TR;

  // 4) Tutar / para birimi
  const amountCents =
    typeof order.amount_cents === "number" && order.amount_cents > 0
      ? order.amount_cents
      : typeof order.amount === "number" && order.amount > 0
      ? order.amount
      : 0;

  const currency = order.currency || "TRY";

  // 5) Receipt mailini gönder
  const res = await sendPaymentReceiptEmail({
    to: prof.email,
    amount: amountCents,
    currency,
    paymentProvider: "PayTR",
    orderId: order.id,
    questionId: order.question_id ?? null,
    fullName: prof.full_name ?? null,
    tenantFrom: from,
    dashboardBaseUrl,
    locale: lang,
  });

  return res;
}
