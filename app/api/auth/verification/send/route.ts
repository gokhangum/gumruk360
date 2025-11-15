import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { APP_DOMAINS, BRAND, MAIL } from "../../../../../lib/config/appEnv";

// Minimal Resend client (avoid extra deps)
async function sendWithResend({ from, to, subject, html }: { from: string, to: string, subject: string, html: string }) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false, error: "mail_not_configured" }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ from, to, subject, html }),
  })
  if (!res.ok) {
    const t = await res.text().catch(()=> "")
    return { ok: false, error: `resend_failed(${res.status})`, detail: t }
  }
  return { ok: true }
}

function resolveLocale(req: Request) {
// 1) Domain based (prod): ENV EN domain ise 'en'
   const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").toLowerCase()
   if (APP_DOMAINS.en && (host === APP_DOMAINS.en || host.endsWith(APP_DOMAINS.en))) return "en"

  // 2) Query override for local tests: ?lang=en|tr
  try {
    const u = new URL(req.url)
    const lang = u.searchParams.get("lang")
    if (lang === "en" || lang === "tr") return lang
  } catch {}

  // 3) Header override for local tests
  const forced = (req.headers.get("x-lang") || "").toLowerCase()
  if (forced === "en" || forced === "tr") return forced

  // Default TR
  return "tr"
}

function templates(locale: "tr" | "en", confirmUrl: string) {
  if (locale === "en") {
    return {
      subject: "Confirm your email",
      from: process.env.MAIL_FROM_EN || `${BRAND.nameEN} <${MAIL.fromEmail}>`,
      html: `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.6">
        <h1 style="margin:0 0 12px">Confirm your email</h1>
        <p>Click the button below to verify your email and complete your sign‑up.</p>
        <p style="margin:24px 0">
          <a href="${confirmUrl}" style="display:inline-block;padding:10px 16px;border-radius:8px;border:1px solid #0a7;border-color:#0a7;text-decoration:none">
            Verify Email
          </a>
        </p>
        <p>If the button doesn’t work, copy and paste this link into your browser:</p>
        <p><a href="${confirmUrl}">${confirmUrl}</a></p>
        <hr style="margin:24px 0;border:none;border-top:1px solid #eee" />
        <p style="color:#666;font-size:12px">If you didn’t request this, you can ignore this email.</p>
      </div>`,
    }
  }
  return {
    subject: "E‑posta adresinizi doğrulayın",
    from: process.env.MAIL_FROM_TR || `${BRAND.nameTR} <${MAIL.fromEmail}>`,
    html: `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.6">
      <h1 style="margin:0 0 12px">E‑posta adresinizi doğrulayın</h1>
      <p>Aşağıdaki butona tıklayarak e‑posta adresinizi doğrulayın ve kaydınızı tamamlayın.</p>
      <p style="margin:24px 0">
        <a href="${confirmUrl}" style="display:inline-block;padding:10px 16px;border-radius:8px;border:1px solid #0a7;border-color:#0a7;text-decoration:none">
          E‑postayı Doğrula
        </a>
      </p>
      <p>Buton çalışmazsa bu bağlantıyı kopyalayıp tarayıcınıza yapıştırın:</p>
      <p><a href="${confirmUrl}">${confirmUrl}</a></p>
      <hr style="margin:24px 0;border:none;border-top:1px solid #eee" />
      <p style="color:#666;font-size:12px">Bu isteği siz başlatmadıysanız görmezden gelebilirsiniz.</p>
    </div>`,
  }
}

export async function POST(req: Request) {
  try {
    const { email } = await req.json().catch(()=> ({} as any))
    if (!email) return NextResponse.json({ ok:false, error:"missing_email" }, { status: 400 })

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ ok:false, error:"supabase_not_configured" }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })
const origin = new URL(req.url).origin
    // 1) Generate a signup confirmation link (admin, no auto-mail from Supabase)
   const { data, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
     email,
     options: {
     redirectTo: `${origin}/auth/confirm?next=/redirect/me`,
      },
 })

    if (error || !data?.properties?.action_link) {
      return NextResponse.json({ ok:false, error:"link_generation_failed", detail: error?.message }, { status: 500 })
    }

    const actionLink = data.properties.action_link

    // 2) Locale & template
    const loc = resolveLocale(req) as "tr" | "en"
    const t = templates(loc, actionLink)

    // 3) Send email via Resend
    const sendRes = await sendWithResend({ from: t.from, to: email, subject: t.subject, html: t.html })
    if (!sendRes.ok) {
      return NextResponse.json({ ok:false, error: sendRes.error, detail: (sendRes as any).detail }, { status: 500 })
    }

    return NextResponse.json({ ok:true, locale: loc })
  } catch (e:any) {
    return NextResponse.json({ ok:false, error:"unexpected", detail: e?.message || String(e) }, { status: 500 })
  }
}
