// lib/emails/receipt.ts
// Makbuz (ödeme alındı) e-postası — TR/EN yerelleştirme destekli.
// Gönderen (from): tenantFrom -> MAIL_FROM -> RESEND_FROM -> onboarding@resend.dev
import { getTranslations } from "next-intl/server";
import { APP_DOMAINS, MAIL } from "../config/appEnv";
import { logAudit } from "../audit";
export type Locale = "tr" | "en";

 type ReceiptEmailOptions = {
   to: string;
  amount: number;
   currency: string;          // "TRY", "USD", "EUR"...
  paymentProvider?: string | null; // Örn: "PayTR", "Paddle"
  orderId: string;
  questionId?: string | null;
  fullName?: string | null; 
   tenantFrom?: string;       // Örn: 'Gumruk360 <noreply@gumruk360.com>'
  dashboardBaseUrl?: string; // Örn: https://gumruk360.com
  locale?: Locale;           // Opsiyonel — gelmezse domain’den tespit edilir.
};
// ------------------------------- Locale helpers -------------------------------

function inferLocaleFromBase(base?: string | null): Locale {
  if (!base) return "tr";
  const lower = String(base).toLowerCase();
  // Proje kuralı: gumruk360.com = TR, tr.easycustoms360.com = EN
  if (APP_DOMAINS.en && (lower === APP_DOMAINS.en || lower.endsWith(APP_DOMAINS.en))) return "en";
  if (APP_DOMAINS.primary && (lower === APP_DOMAINS.primary || lower.endsWith(APP_DOMAINS.primary))) return "tr";
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
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (cachedClient) return cachedClient;

  const mod = await import("resend");
  const Resend = (mod as any).Resend;
  cachedClient = new Resend(key);
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

 const t = await getTranslations({ locale: opts.locale, namespace: "email.receipt" });
  const amountStr = fmtAmount(opts.amount, opts.currency, opts.locale);

  // KDV hesapları (varsayılan %20)
  const grossMajor = Math.round((opts.amount || 0) / 100); // toplam (brüt)
   const netMajor = Math.round(grossMajor / 1.2);           // KDV hariç
 const vatMajor = grossMajor - netMajor;

   const netAmountStr = fmtAmount(netMajor * 100, opts.currency, opts.locale);
  const vatAmountStr = fmtAmount(vatMajor * 100, opts.currency, opts.locale);

  const orderLink = opts.base ? `${opts.base}/dashboard/orders/${opts.orderId}` : "#";
  const questionLink = opts.base && opts.questionId ? `${opts.base}/dashboard/questions/${opts.questionId}` : null;
  return `
  <div style="max-width:600px;margin:0 auto;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.55;color:#111;padding:24px">
    <h2 style="margin:0 0 16px 0;font-weight:700;font-size:20px">${t("title")}</h2>
   ${opts.fullName
    ? '<p style="margin:0 0 8px 0">' +
        t("greeting", { name: opts.fullName }) +
      "</p>"
   : ""
   }
    <p style="margin:0 0 16px 0">${t("thanks")}</p>

  <div style="border:1px solid #eee;border-radius:12px;padding:16px;margin:16px 0">
     <table role="presentation" width="100%" style="border-collapse:collapse">
        <tr>
         <td style="padding:6px 0;font-weight:600;width:140px">${t("orderId")}</td>
          <td style="padding:6px 0">${opts.orderId}</td>
       </tr>
        ${opts.questionId ? `
        <tr>
          <td style="padding:6px 0;font-weight:600;width:140px">${t("questionId")}</td>
          <td style="padding:6px 0">${opts.questionId}</td>
         </tr>` : ``}
        <tr>
        <td style="padding:6px 0;font-weight:600;width:140px">${t("amount")}</td>
         <td style="padding:6px 0">${amountStr}</td>
        </tr>
        ${opts.paymentProvider ? `
       <tr>
          <td style="padding:6px 0;font-weight:600;width:140px">${t("paymentMethod")}</td>
         <td style="padding:6px 0">${opts.paymentProvider}</td>
        </tr>` : ``}
     </table>
    </div>
  <div style="border:1px solid #eee;border-radius:12px;padding:16px;margin:16px 0">
     <div style="background:#f4f4f5;padding:2px 12px;border-radius:8px;font-weight:600;margin-bottom:8px">
        ${t("productNameLabel")}: ${t("productNameValue")}
    </div>
    <table role="presentation" width="100%" style="border-collapse:collapse">
       <tr>
         <td style="padding:4px 0;width:160px;font-weight:600">${t("serviceNetLabel")}</td>
         <td style="padding:4px 0">${netAmountStr}</td>
       </tr>
       <tr>
         <td style="padding:4px 0;width:160px;font-weight:600">${t("serviceVatLabel")}</td>
        <td style="padding:4px 0">${vatAmountStr}</td>
       </tr>
        <tr>
         <td style="padding:4px 0;width:160px;font-weight:600">${t("serviceTotalLabel")}</td>
         <td style="padding:4px 0">${amountStr}</td>
        </tr>
      </table>
    </div>

   <div style="margin:20px 0">
      <a href="${orderLink}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 14px;border-radius:10px">${t("viewOrder")}</a>
     ${questionLink ? ` <a href="${questionLink}" style="display:inline-block;background:#f4f4f5;color:#111;text-decoration:none;padding:10px 14px;border-radius:10px;margin-left:8px">${t("viewQuestion")}</a>` : ``}
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
  // From önceliği: tenantFrom -> MAIL_FROM -> RESEND_FROM -> default
   const from =
    opts.tenantFrom ||
    process.env.MAIL_FROM ||
     process.env.RESEND_FROM ||
     `${MAIL.fromName} <${MAIL.fromEmail}>`;

// Base URL ve locale tespiti
  const base =
   opts.dashboardBaseUrl ||
    process.env.APP_BASE_URL_TR ||
    process.env.APP_BASE_URL_EN ||
     `https://${APP_DOMAINS.primary}`;

   // Gönderilen locale (webhook vs.) + fallback
   const locale: Locale = opts.locale ?? "tr";
   const t = await getTranslations({ locale, namespace: "email.receipt" });

  // Örnek subject / title (hangi dilde çözüldüğünü görmek için)
 const debugSubject = t("subject", { orderId: opts.orderId });
  const debugTitle = t("title");
 
   // AUDIT: webhook'tan ne geldi, burada ne kullanıyoruz?
   try {
    await logAudit({
     question_id: opts.questionId ?? null,
      action: "email.receipt.debug",
      payload: {
       to: opts.to,
       orderId: opts.orderId,
        paymentProvider: opts.paymentProvider ?? null,
         currency: opts.currency,
        // webhook'tan gelenler
         dashboardBaseUrl: opts.dashboardBaseUrl ?? null,
         localeFromOpts: opts.locale ?? null,
        // bu fonksiyon içinde hesaplananlar
       base,
        resolvedLocale: locale,
       debugSubject,
        debugTitle,
      },
    });
  } catch (e) {
    // Audit hata verirse mail'i bloklamayalım
     console.error("[email.receipt.debug.error]", e);
  }

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
