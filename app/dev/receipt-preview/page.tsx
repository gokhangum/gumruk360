// app/dev/receipt-preview/page.tsx
// Preview for payment receipt email (email.receipt).
// Uses the real buildHtml from lib/emails/receipt.ts so any change there
// is reflected here instantly.

import { buildHtml } from "@/lib/emails/receipt";

type Locale = "tr" | "en";
type SearchParams = { locale?: string };

function resolveBaseUrl(): string {
  // Only for preview; doesn't need to be perfect.
  if (process.env.APP_BASE_URL_TR) return process.env.APP_BASE_URL_TR.replace(/\/$/, "");
  if (process.env.APP_BASE_URL_EN) return process.env.APP_BASE_URL_EN.replace(/\/$/, "");
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  return "http://localhost:3000";
}

export default async function ReceiptPreviewPage(props: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await props.searchParams;
  const locale: Locale = params?.locale === "en" ? "en" : "tr";

  const base = resolveBaseUrl();

  const orderId = "TEST-ORDER-123";
  const questionId = "TEST-QUESTION-001";
  const amount = 49900; // kuruş / cents
  const currency = locale === "en" ? "USD" : "TRY";
  const fullName = locale === "en" ? "John Doe" : "Ahmet Yılmaz";
 const paymentProvider = locale === "en" ? "Paddle" : "PayTR";
 
  // buildHtml is async -> MUST be awaited, otherwise [object Promise] is rendered
  const html: string = await buildHtml({
     orderId,
     amount,
     currency,
     base,
    questionId,
     locale,
    fullName,
    paymentProvider,
  });


  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
