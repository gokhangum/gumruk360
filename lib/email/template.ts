// lib/email/template.ts
type Locale = 'tr' | 'en';
import { BRAND } from "@/lib/config/appEnv";
export type AnswerEmailParams = {
  locale: Locale;
  title?: string | null;
  bodyText: string;
  ctaUrl: string;
  brand?: string;
};

const dict = {
  tr: {
    genericTitle: `${BRAND.nameTR} Yanıtı`,
    viewFull: 'Panelde Görüntüle',
    question: 'Soru',
    help: 'Bu e-postayı yanıtlayabilir veya panelden bize ulaşabilirsiniz.',
    copyright: (y: number) => `© ${y} ${BRAND.nameTR} | Tüm hakları saklıdır.`,
    brandName: `${BRAND.nameTR}`,
  },
  en: {
    genericTitle: `${BRAND.nameEN} Answer`,
    viewFull: 'View in Dashboard',
    question: 'Question',
    help: 'You can reply to this email or reach us via your dashboard.',
    copyright: (y: number) => `© ${y} ${BRAND.nameEN} | All rights reserved.`,
    brandName: `${BRAND.nameEN}`,
  }
} as const;

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function textToParagraphs(text: string): string {
  const blocks = text.trim().split(/\n\s*\n/);
  return blocks.map(b => {
    const inner = escapeHtml(b).replace(/\n/g, '<br/>');
    return `<p style="margin:0 0 12px 0; line-height:1.6; font-size:14px;">${inner}</p>`;
  }).join('\n');
}

function shell({ locale, title, ctaUrl, brand, innerHtml } : { locale: Locale, title: string, ctaUrl: string, brand?: string, innerHtml: string }) {
  const t = dict[locale] || dict.tr;
  const y = new Date().getFullYear();
  const headerName = t.brandName;
  const headerColor = locale === 'en' ? '#143dcd' : '#0c7cff';

  return `<!doctype html>
<html lang="${locale}">
<head>
  <meta charSet="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0; padding:0; background:#f5f7fb;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f5f7fb; padding:24px 0;">
    <tr>
      <td align="center">
        <table width="640" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 2px 8px rgba(16,24,40,0.08);">
          <!-- Header (BLUE STRIP) -->
          <tr>
            <td style="background:${headerColor}; padding:14px 22px; color:#fff; font-weight:700; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif; font-size:14px; letter-spacing:.3px;">
              ${headerName}
            </td>
          </tr>
          <!-- Title -->
          <tr>
            <td style="padding:22px 24px 6px 24px; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;">
              <div style="font-size:20px; font-weight:700; color:#0f172a; margin-bottom:6px;">${escapeHtml(title)}</div>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:4px 24px 6px 24px; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif; color:#0f172a;">
              ${innerHtml}
            </td>
          </tr>
          <!-- CTA -->
          <tr>
            <td style="padding:6px 24px 16px 24px;">
              <a href="${ctaUrl}" style="display:inline-block; text-decoration:none; font-weight:600; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif; font-size:14px; padding:10px 16px; border-radius:8px; background:${headerColor}; color:#ffffff;">
                ${t.viewFull}
              </a>
            </td>
          </tr>
          <!-- Help -->
          <tr>
            <td style="padding:0 24px 22px 24px; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;">
              <div style="font-size:12px; color:#475569;">${t.help}</div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb; border-top:1px solid #eef2f7; padding:12px 24px; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif; color:#64748b; font-size:12px;">
              ${t.copyright(y)}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function renderAnswerEmailHtml(params: AnswerEmailParams): string {
  const { locale, title, bodyText, ctaUrl, brand } = params;
  const t = dict[locale] || dict.tr;
  const safeTitle = title || t.genericTitle;
  const bodyHtml = textToParagraphs(bodyText || '');
  return shell({ locale, title: safeTitle, ctaUrl, innerHtml: bodyHtml });
}

// Backward-compatible wrapper (older routes)
export function renderAnswerEmailHTML(
  locale: Locale = 'tr',
  title: string,
  bodyText: string,
  ctaUrl: string = '#',
  brand?: string
): string {
  return renderAnswerEmailHtml({
  locale,
    title,
   bodyText,
    ctaUrl,
    brand
  });
}

// NEW: branded wrapper that accepts raw editor HTML
export function renderBrandedHtmlWithInnerHtml(params: { locale: Locale, title?: string|null, innerHtml: string, ctaUrl: string, brand?: string }) {
  const { locale, title, innerHtml, ctaUrl, brand } = params;
  const t = dict[locale] || dict.tr;
  const safeTitle = title || t.genericTitle;
  return shell({ locale, title: safeTitle, ctaUrl, innerHtml });
}
