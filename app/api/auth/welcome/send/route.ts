export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0
import { NextRequest, NextResponse } from "next/server"
import { APP_DOMAINS, BRAND } from "../../../../../lib/config/appEnv"
function safeURL(u?: string | null) { try { return u ? new URL(u) : null } catch { return null } }
function hostOf(u?: string | null) { const x = safeURL(u); return x ? (x.host || "").toLowerCase() : "" }

function resolveLocale(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get("lang")
    if (q === "en" || q === "tr") return q
  } catch {}
  const forced = (req.headers.get("x-lang") || "").toLowerCase()
  if (forced === "en" || forced === "tr") return forced

  const reqHost = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").toLowerCase()
  const enBaseHost = hostOf(process.env.APP_BASE_URL_EN)
  const trBaseHost = hostOf(process.env.NEXT_PUBLIC_BASE_URL)

  if (enBaseHost && reqHost === enBaseHost) return "en"
  if (trBaseHost && reqHost === trBaseHost) return "tr"
  if (APP_DOMAINS.en && (reqHost === APP_DOMAINS.en || reqHost.endsWith(APP_DOMAINS.en))) return "en"
  return "tr"
}

function pickSiteBase(locale: "tr" | "en") {
  if (locale === "en" && process.env.APP_BASE_URL_EN) return process.env.APP_BASE_URL_EN
  if (locale === "tr" && process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL
  return process.env.PUBLIC_SITE_URL || "http://localhost:3000"
}

function extractEmail(addr: string) {
  const m = String(addr||"").match(/<\s*([^>]+@[^>]+)\s*>/)
  if (m && m[1]) return m[1].trim()
  return String(addr||"").trim().replace(/^"+|"+$/g, "")
}
function domainOfEmail(addr: string) {
  const email = extractEmail(addr)
  const parts = email.split("@")
  return (parts[1] || "").toLowerCase().replace(/>\s*$/,"").trim()
}
function domainAllowed(fromDomain: string, allowedCsv: string) {
  if (!allowedCsv) return true
  const allowed = allowedCsv.toLowerCase().split(",").map(s => s.trim()).filter(Boolean)
  if (!allowed.length) return true
  return allowed.some(dom => fromDomain === dom || fromDomain.endsWith("." + dom))
}

async function sendWithResend({ from, to, subject, html, replyTo }: { from: string, to: string | string[], subject: string, html: string, replyTo?: string }) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false, error: "mail_not_configured" }

  const recipients = Array.isArray(to) ? to : [to]
  const body: any = { from, to: recipients, subject, html }
  if (replyTo) body.reply_to = replyTo

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  })

  const text = await res.text().catch(()=> "")
  if (!res.ok) {
    return { ok: false, status: res.status, error: `resend_failed(${res.status})`, detail: text }
  }
  return { ok: true, status: res.status, provider: "resend" }
}

function buildUserTemplate(locale: "tr" | "en", dashboardUrl: string, fullName?: string | null) {
  if (locale === "en") {
    return {
      subject: `Welcome to ${BRAND.nameEN}`,
      html: `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.6">
        <h1 style="margin:0 0 12px">Welcome${fullName ? ", " + fullName : ""}!</h1>
        <p>Your email has been verified successfully. You're all set.</p>
        <p>Use the button below to go to your dashboard and start your first request.</p>
        <p style="margin:24px 0">
          <a href="${dashboardUrl}" style="display:inline-block;padding:10px 16px;border-radius:8px;border:1px solid #0a7;text-decoration:none">
            Go to Dashboard
          </a>
        </p>
        <p>If the button doesn’t work, copy and paste this link:</p>
        <p><a href="${dashboardUrl}">${dashboardUrl}</a></p>
      </div>`,
    }
  }
  return {
    subject: `${BRAND.nameTR}’a hoş geldiniz`,
    html: `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.6">
      <h1 style="margin:0 0 12px">Hoş geldiniz${fullName ? ", " + fullName : ""}!</h1>
      <p>E-posta adresiniz başarıyla doğrulandı. Artık hazırsınız.</p>
      <p>Panelinize gitmek ve ilk talebinizi başlatmak için aşağıdaki butona tıklayın.</p>
      <p style="margin:24px 0">
        <a href="${dashboardUrl}" style="display:inline-block;padding:10px 16px;border-radius:8px;border:1px solid #0a7;text-decoration:none">
          Panele Git
        </a>
      </p>
      <p>Buton çalışmazsa şu bağlantıyı kopyalayıp yapıştırın:</p>
      <p><a href="${dashboardUrl}">${dashboardUrl}</a></p>
    </div>`,
  }
}

function buildAdminTemplate(locale: "tr" | "en", siteBase: string, payload: { email: string; fullName?: string | null }) {
  if (locale === "en") {
    return {
      subject: "New user verified",
      html: `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.6">
        <h2 style="margin:0 0 12px">New user verified</h2>
        <p>Email: <strong>${payload.email}</strong>${payload.fullName ? " | Name: <strong>"+payload.fullName+"</strong>" : ""}</p>
        <p>Open admin panel to review.</p>
        <p style="margin:24px 0">
          <a href="${siteBase.replace(/\/+$/,'')}/admin" style="display:inline-block;padding:10px 16px;border-radius:8px;border:1px solid #0a7;text-decoration:none">
            Open Admin
          </a>
        </p>
      </div>`,
    }
  }
  return {
    subject: "Yeni kullanıcı doğrulandı",
    html: `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.6">
      <h2 style="margin:0 0 12px">Yeni kullanıcı doğrulandı</h2>
      <p>E-posta: <strong>${payload.email}</strong>${payload.fullName ? " | Ad Soyad: <strong>"+payload.fullName+"</strong>" : ""}</p>
      <p>İncelemek için yönetici panelini açın.</p>
      <p style="margin:24px 0">
        <a href="${siteBase.replace(/\/+$/,'')}/admin" style="display:inline-block;padding:10px 16px;border-radius:8px;border:1px solid #0a7;text-decoration:none">
          Yönetim Panelini Aç
        </a>
      </p>
    </div>`,
  }
}

async function handleSend(req: NextRequest, email: string, fullName?: string | null) {
  const loc = resolveLocale(req) as "tr" | "en"
  const siteBase = pickSiteBase(loc)
  const dashboardUrl = siteBase.replace(/\/+$/,'') + "/dashboard"

  const from = loc === "en" ? (process.env.RESEND_FROM_EN || "") : (process.env.RESEND_FROM_TR || "")
  if (!from) return { ok:false, error:"from_address_missing", hint:`Set ${loc==="en"?"RESEND_FROM_EN":"RESEND_FROM_TR"}` }

  const allowedCsv = process.env.RESEND_ALLOWED_DOMAINS || ""
  const fromDomain = domainOfEmail(from)
  if (!domainAllowed(fromDomain, allowedCsv)) {
    return { ok:false, error:"from_domain_not_allowed", hint:`Parsed from domain '${fromDomain}' not allowed. RESEND_ALLOWED_DOMAINS='${allowedCsv}'` }
  }

  // DEV bypass (no external call, always "success")
  if ((process.env.DEV_EMAIL_BYPASS || "") === "1") {
    return { ok:true, locale: loc, dev_delivery: true, note: "DEV_EMAIL_BYPASS=1", attempted_to: [email] }
  }

  // 1) Send to user
  const userTpl = buildUserTemplate(loc, dashboardUrl, fullName || null)
  const resUser = await sendWithResend({ from, to: email, subject: userTpl.subject, html: userTpl.html, replyTo: process.env.RESEND_REPLY_TO || undefined })
  if (!resUser.ok) {
    return { ok:false, target:"user", error: resUser.error, detail: (resUser as any).detail, status: (resUser as any).status }
  }

  // 2) Send to admin list (CSV)
  const adminCsv = (process.env.ADMIN_EMAILS || process.env.ADMIN_NOTIFY_EMAILS || "").trim()
  let adminMeta: any = null
  if (adminCsv) {
    const adminList = adminCsv.split(",").map(s => s.trim()).filter(Boolean)
    if (adminList.length) {
      const adminTpl = buildAdminTemplate(loc, siteBase, { email, fullName: fullName || null })
      const resAdmin = await sendWithResend({ from, to: adminList, subject: adminTpl.subject, html: adminTpl.html, replyTo: process.env.RESEND_REPLY_TO || undefined })
      adminMeta = resAdmin.ok ? { admin_ok:true } : { admin_ok:false, admin_error: resAdmin.error, admin_detail: (resAdmin as any).detail, admin_status: (resAdmin as any).status }
    }
  }

  return { ok:true, locale: loc, ...(adminMeta || {}) }
}

export async function POST(req: NextRequest) {
  try {
    const { email, fullName } = await req.json().catch(()=> ({} as any))
    if (!email) return NextResponse.json({ ok:false, error:"missing_email" }, { status: 400 })

    const result = await handleSend(req, email, fullName || null)
    if (!result.ok) {
      
      return NextResponse.json(result as any, { status: 500 })
    }
    return NextResponse.json(result as any)
  } catch (e:any) {
   
    return NextResponse.json({ ok:false, error:"unexpected", detail: e?.message || String(e) }, { status: 500 })
  }
}

// GET test mode: /api/auth/welcome/send?email=you@domain&lang=en
console.log("[welcome/send][ENTRY]", new Date().toISOString());

export async function GET(req: NextRequest) {
  try {
    const email = req.nextUrl.searchParams.get("email")
    const fullName = req.nextUrl.searchParams.get("name")
    if (!email) return NextResponse.json({ ok:false, error:"missing_email" }, { status: 400 })

    const result = await handleSend(req, email, fullName)
    if (!result.ok) {
      
      return NextResponse.json(result as any, { status: 500 })
    }
    return NextResponse.json(result as any)
  } catch (e:any) {
    
    return NextResponse.json({ ok:false, error:"unexpected", detail: e?.message || String(e) }, { status: 500 })
  }
}
