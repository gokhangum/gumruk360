// lib/mailer.ts


export type SendEmailInput = {
  to: string;
  subject: string;
  text?: string | null;
  html?: string | null;
  from?: string | null;    // opsiyonel from override
  locale?: string | null;  // 'tr', 'en-US' vb.
  replyTo?: string | null; // opsiyonel reply-to override
};

function getFromAddress(locale?: string | null) {
  const l = (locale || "").toLowerCase();
  const fromTR = process.env.RESEND_FROM_TR;
  const fromEN = process.env.RESEND_FROM_EN;
  // locale 'tr' ile başlıyorsa TR, aksi halde EN tercih et
  const byLocale =
    l.startsWith("tr") ? (fromTR || fromEN) :
    l ? (fromEN || fromTR) : null;
  return (
    byLocale ||
    process.env.MAIL_FROM ||
    process.env.RESEND_FROM ||
    "no-reply@gumruk360.com"
  );
}

// Basit e-posta adresi kontrolü (çok katı değil, yeterli)
function isValidEmail(addr: string) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr);
}

export async function sendSystemEmail(input: SendEmailInput): Promise<{ ok: boolean; provider?: string; id?: string; error?: string }> {
  const to = (input.to || "").trim();
  if (!isValidEmail(to)) {
    return { ok: false, error: "invalid_to_address" };
  }
  const subject = input.subject?.toString().slice(0, 255) || "(no subject)";
  const text = input.text || undefined;
  const html = input.html || undefined;
  const from = (input.from || getFromAddress(input.locale)).trim();
  const replyTo =
    (input.replyTo || process.env.RESEND_REPLY_TO || process.env.SUPPORT_EMAIL || "").trim() || undefined;

  // 1) RESEND
  const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
  if (RESEND_API_KEY) {
    try {
      const { Resend } = await import("resend");
      const resend = new Resend(RESEND_API_KEY);
     const res = await resend.emails.send({
        from,
       to: [to],
         subject,
        text,
       html,
       // Resend alan adı: reply_to
      ...(replyTo ? { reply_to: replyTo } : {}),
      } as any);

      if ((res as any)?.error) {
        return { ok: false, provider: "resend", error: String((res as any).error?.message || (res as any).error || "send_failed") };
      }
      return { ok: true, provider: "resend", id: (res as any)?.data?.id };
    } catch (e: any) {
      return { ok: false, provider: "resend", error: String(e?.message || e) };
    }
  }


   // RESEND_API_KEY yoksa net hata
   console.warn("[mailer] RESEND_API_KEY not set. Email not sent.", { to, subject });
   return { ok: false, error: "no_resend_api_key" };
}
