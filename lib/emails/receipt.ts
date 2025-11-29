// lib/emails/receipt.ts
// Makbuz (ödeme alındı) e-postası — TR/EN yerelleştirme destekli.
// Gönderen (from): tenantFrom -> MAIL_FROM -> RESEND_FROM -> onboarding@resend.dev
import { createTranslator } from "next-intl";
import { APP_DOMAINS, MAIL } from "../config/appEnv";
export type Locale = "tr" | "en";

async function loadReceiptMessages(locale: Locale) {
  const localeTag = locale === "en" ? "en-US" : "tr-TR";
  const messages =
    localeTag === "en-US"
      ? (await import("@/i18n/messages/en.json")).default
      : (await import("@/i18n/messages/tr.json")).default;

  const t = createTranslator({
    locale: localeTag,
    namespace: "email.receipt",
    messages,
  });

  return { t, localeTag };
}

type ReceiptEmailOptions = {
  to: string;
  amount: number;
  currency: string; // "TRY", "USD", "EUR"...
  paymentProvider?: string | null; // Örn: "PayTR", "Paddle"
  orderId: string;
  questionId?: string | null;
  fullName?: string | null;
  tenantFrom?: string; // Örn: 'Gumruk360 <noreply@gumruk360.com>'
  dashboardBaseUrl?: string; // Örn: https://gumruk360.com
  locale?: Locale; // Opsiyonel — gelmezse domain’den tespit edilir.
};

// ------------------------------- Locale helpers -------------------------------

function inferLocaleFromBase(base?: string | null): Locale {
  if (!base) return "tr";
  const lower = String(base).toLowerCase();
  // Proje kuralı: gumruk360.com = TR, tr.easycustoms360.com = EN
  if (APP_DOMAINS.en && (lower === APP_DOMAINS.en || lower.endsWith(APP_DOMAINS.en)))
    return "en";
  if (APP_DOMAINS.primary && (lower === APP_DOMAINS.primary || lower.endsWith(APP_DOMAINS.primary)))
    return "tr";
  // Varsayılan: TR
  return "tr";
}

function normalizeCurrency(code: string): string {
  return (code || "").toUpperCase();
}

function localeToIntl(locale: Locale): string {
  return locale === "en" ? "en-US" : "tr-TR";
}

function fmtAmount(amount: number, currency: string, locale: Locale): string {
  // amount şu an kuruş/cents cinsinden geliyor → ana para birimine çevir
  const major = Math.round((amount || 0) / 100);

  const intl = new Intl.NumberFormat(localeToIntl(locale), {
    style: "currency",
    currency: normalizeCurrency(currency),
    maximumFractionDigits: 0, // virgülden sonrası görünmesin
    minimumFractionDigits: 0,
    currencyDisplay: "symbol",
  });

  return intl.format(major);
}

// ------------------------------- Resend client -------------------------------

let cachedClient: any = null;

async function getClient() {
  if (cachedClient !== null) return cachedClient;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[receipt-email] RESEND_API_KEY yok, mock moda geçiliyor.");
    cachedClient = null;
    return cachedClient;
  }

  const { Resend } = await import("resend");
  cachedClient = new Resend(apiKey);
  return cachedClient;
}

// -------------------------------- HTML builder --------------------------------

export async function buildHtml(
  opts: Required<Pick<ReceiptEmailOptions, "orderId" | "amount" | "currency">> & {
    base: string;
    questionId?: string | null;
    locale: Locale;
    fullName?: string | null;
    paymentProvider?: string | null;
  },
) {
  const { t } = await loadReceiptMessages(opts.locale);
  const amountStr = fmtAmount(opts.amount, opts.currency, opts.locale);

  // KDV hesapları (varsayılan %20)
  const grossMajor = Math.round((opts.amount || 0) / 100); // toplam (brüt)
  const netMajor = Math.round(grossMajor / 1.2); // KDV hariç
  const vatMajor = grossMajor - netMajor;

  const netAmountStr = fmtAmount(netMajor * 100, opts.currency, opts.locale);
  const vatAmountStr = fmtAmount(vatMajor * 100, opts.currency, opts.locale);

  const orderLink = opts.base ? `${opts.base}/dashboard/orders/${opts.orderId}` : "#";
  const questionLink =
    opts.base && opts.questionId ? `${opts.base}/dashboard/questions/${opts.questionId}` : null;

  return `
  <div style="max-width:600px;margin:0 auto;font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.55;color:#111;padding:24px">
    <h1 style="font-size:20px;margin:0 0 12px">${t("title")}</h1>
    ${
      opts.fullName
        ? `<p style="margin:0 0 12px">${t("greeting", { name: opts.fullName })}</p>`
        : ""
    }
    <p style="margin:0 0 16px">${t("thanks")}</p>

    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tbody>
        <tr>
          <td style="padding:4px 0;font-weight:600">${t("orderId")}:</td>
          <td style="padding:4px 0">${opts.orderId}</td>
        </tr>
        ${
          opts.questionId
            ? `<tr>
          <td style="padding:4px 0;font-weight:600">${t("questionId")}:</td>
          <td style="padding:4px 0">${opts.questionId}</td>
        </tr>`
            : ""
        }
        <tr>
          <td style="padding:4px 0;font-weight:600">${t("amount")}:</td>
          <td style="padding:4px 0">${amountStr}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-weight:600">Net (${normalizeCurrency(
            opts.currency,
          )}):</td>
          <td style="padding:4px 0">${netAmountStr}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-weight:600">KDV (%20):</td>
          <td style="padding:4px 0">${vatAmountStr}</td>
        </tr>
        ${
          opts.paymentProvider
            ? `<tr>
          <td style="padding:4px 0;font-weight:600">${t("paymentMethod")}:</td>
          <td style="padding:4px 0">${opts.paymentProvider}</td>
        </tr>`
            : ""
        }
      </tbody>
    </table>

    <div style="margin:16px 0">
      ${
        orderLink
          ? `<a href="${orderLink}" style="display:inline-block;margin-right:8px;padding:8px 12px;background:#111;color:#fff;border-radius:4px;text-decoration:none;font-size:14px">${t(
              "viewOrder",
            )}</a>`
          : ""
      }
      ${
        questionLink
          ? `<a href="${questionLink}" style="display:inline-block;padding:8px 12px;border:1px solid #111;color:#111;border-radius:4px;text-decoration:none;font-size:14px">${t(
              "viewQuestion",
            )}</a>`
          : ""
      }
    </div>
  <div style="border:1px solid #22c55e;background:#ecfdf3;border-radius:10px;padding:12px 14px;margin-top:16px;color:#166534;font-size:14px">
      ${t("invoiceNotice")}
   </div>
    <p style="color:#666;font-size:12px;margin-top:24px">${t("footer")}</p>
  </div>
  `;
}

// --------------------------------- Main API ----------------------------------

export async function sendPaymentReceiptEmail(opts: ReceiptEmailOptions) {
  // Base URL
  const base =
    opts.dashboardBaseUrl ||
    process.env.APP_BASE_URL_TR ||
    process.env.APP_BASE_URL_EN ||
    `https://${APP_DOMAINS.primary}`;

  // Locale: Önce parametre, yoksa domain'den tespit
  const locale: Locale = opts.locale ?? inferLocaleFromBase(base);

  const { t } = await loadReceiptMessages(locale);

  // From önceliği:
  // 1) tenantFrom
  // 2) MAIL_FROM (override)
  // 3) Dil bazlı default (RESEND_FROM_TR / RESEND_FROM_EN)
  // 4) Genel RESEND_FROM
  // 5) MAIL.fromName / MAIL.fromEmail fallback
  const localeDefaultFrom =
    locale === "en"
      ? process.env.RESEND_FROM_EN || process.env.RESEND_FROM_TR || process.env.RESEND_FROM
      : process.env.RESEND_FROM_TR || process.env.RESEND_FROM_EN || process.env.RESEND_FROM;

  const from =
    opts.tenantFrom ||
    localeDefaultFrom ||
    process.env.MAIL_FROM ||
    process.env.RESEND_FROM ||
    `${MAIL.fromName} <${MAIL.fromEmail}>`;



  // Konu
  const subject = t("subject", { orderId: opts.orderId });

  // HTML
  const html = await buildHtml({
    orderId: opts.orderId,
    amount: opts.amount,
    currency: opts.currency,
    base,
    questionId: opts.questionId ?? null,
    locale,
    fullName: opts.fullName ?? null,
    paymentProvider: opts.paymentProvider ?? null,
  });

  // Resend client (yoksa MOCK)
  const client = await getClient();
  if (!client) {
    return { sent: false as const, provider: "mock" as const, locale, from };
  }

  await client.emails.send({ from, to: opts.to, subject, html });
  return { sent: true as const, provider: "resend" as const, locale, from };
}
