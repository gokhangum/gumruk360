// lib/mail.ts — Resend via fetch (no SDK). Localized welcome + admin mails.
type SendResult = { ok: boolean, skipped?: boolean, error?: string }
type Locale = 'tr' | 'en'
import { MAIL, OWNER, BRAND } from "./config/appEnv";
import { getTranslations } from "next-intl/server";
const RESEND_API_KEY = process.env.RESEND_API_KEY || ''
 const from =
   process.env.MAIL_FROM ||
   `${MAIL.fromName} <${MAIL.fromEmail}>`

 // Admin e-postaları (öncelik: ADMIN_NOTIFY_EMAILS → ADMIN_EMAILS → ADMIN_EMAIL → MAIL.adminNotify → OWNER.email)
 const adminList = (() => {
   const arr: string[] = []
   const csv =
     process.env.ADMIN_NOTIFY_EMAILS ||
     process.env.ADMIN_EMAILS || ""
   const many = csv.split(",").map(s => s.trim()).filter(Boolean)
   if (many.length) arr.push(...many)
   const single = (process.env.ADMIN_EMAIL || "").trim()
   if (single) arr.push(single)
   if (!arr.length && MAIL.adminNotify?.length) arr.push(...MAIL.adminNotify)
   if (!arr.length && OWNER.email) arr.push(OWNER.email)
   return Array.from(new Set(arr))
 })()

export function hasMailConfig() {
  return !!(RESEND_API_KEY && from)
}

async function sendEmailRaw(to: string | string[], subject: string, html?: string, text?: string, idemKey?: string): Promise<SendResult> {
  if (!hasMailConfig()) return { ok:false, skipped:true }
  const payload: any = { from, to, subject }
  if (html) payload.html = html
  if (text) payload.text = text

  const headers: Record<string,string> = {
    'Authorization': `Bearer ${RESEND_API_KEY}`,
    'Content-Type': 'application/json'
  }
  if (idemKey) headers['Idempotency-Key'] = idemKey

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  })
  if (!res.ok) {
    const body = await res.text().catch(()=> '')
    return { ok:false, error:`Resend ${res.status}: ${body}` }
  }
  return { ok:true }
}



function render(template: string, vars: Record<string,string|undefined|null>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] ?? '').toString())
}

 export async function sendWelcomeEmail(toEmail: string, locale: Locale, fullName?: string|null): Promise<SendResult> {
   const t = await getTranslations({ locale, namespace: "mail" })
  const subject = t('welcome.subject', { brandName: locale === 'en' ? BRAND.nameEN : BRAND.nameTR })
   const html = render(t('welcome.bodyHtml'), { name: fullName ? ', ' + fullName : '' })
   return sendEmailRaw(toEmail, subject, html, undefined, `welcome-${locale}-${toEmail}`)

}

export async function sendAdminNewUser(details: {
  email: string
  locale: Locale
  fullName?: string|null
  accountType?: 'individual'|'corporate'|string|null
  organizationName?: string|null
}): Promise<SendResult> {
  if (!adminList.length) return { ok:false, skipped:true }
   const { email, fullName, accountType, organizationName, locale } = details
  const t = await getTranslations({ locale, namespace: "mail" })
   const text = render(t('admin.text'), {
     email,
     fullName: fullName || '-',
     accountType: (accountType || '-') as string,
    organizationName: organizationName || '-'
  })
   return sendEmailRaw(adminList, t('admin.subject'), undefined, text, `admin-new-user-${locale}-${email}`)

}

export async function sendWelcomeAndAdmin(
  toEmail: string,
  locale: Locale,
  fullName?: string|null,
  extra?: { accountType?: 'individual'|'corporate'|string|null, organizationName?: string|null }
): Promise<{ ok: boolean, skipped?: boolean, errors?: string[] }> {
  if (!hasMailConfig()) return { ok:false, skipped:true }
  const errs: string[] = []
  const r1 = await sendWelcomeEmail(toEmail, locale, fullName)
  if (!r1.ok && !r1.skipped) errs.push(r1.error || 'welcome failed')
  const r2 = await sendAdminNewUser({ email: toEmail, locale, fullName, accountType: extra?.accountType, organizationName: extra?.organizationName || null })
  if (!r2.ok && !r2.skipped) errs.push(r2.error || 'admin failed')
  return { ok: errs.length === 0, errors: errs.length ? errs : undefined }
}
