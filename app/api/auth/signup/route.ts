
import { NextResponse } from "next/server"
import { APP_DOMAINS, BRAND, MAIL } from "../../../../lib/config/appEnv";
import { verifyCaptcha } from "@/lib/security/captcha";                       // NEW
import { isDisposableEmail, disposablePolicy } from "@/lib/security/disposable"; // NEW
import { scoreTextSpam, isTextSuspicious } from "@/lib/security/spam";          // NEW
export const dynamic = "force-dynamic"


type Body = {
  email: string
  password: string
  fullName?: string | null
  accountType?: "individual" | "corporate" | string | null
  orgName?: string | null
  lang?: "tr" | "en" | string | null // if provided (tr/en), will override detection
  next?: string | null
}

function getEnv(name: string, required = true) {
  const v = process.env[name]
  if (!v && required) throw new Error(`missing_env:${name}`)
  return v || ""
}

function header(req: Request, key: string) {
  return (req.headers.get(key) || "").trim()
}

function currentHost(req: Request) {
  const h = header(req, "x-forwarded-host") || header(req, "host") || ""
  // use first host if proxy chain provided, strip port
  const first = h.split(",")[0].trim()
  return first.split(":")[0].toLowerCase()
}

function hostnameOf(urlStr: string): string {
  try {
    const u = new URL(urlStr)
    return (u.hostname || "").toLowerCase()
  } catch {
    return ""
  }
}

function inferLangFromHost(req: Request, bodyLang?: string | null): "tr" | "en" {
  // 0) Explicit override from body if valid
  const bl = (bodyLang || "").toLowerCase()
  if (bl === "tr" || bl === "en") return bl as any

  const host = currentHost(req)

  // 1/2) ENV base URL hosts (support both naming schemes)
  const enEnv = process.env.APP_BASE_URL_EN || process.env.NEXT_PUBLIC_SITE_URL_EN || ""
  const trEnv = process.env.APP_BASE_URL_TR || process.env.NEXT_PUBLIC_SITE_URL_TR || ""
  const enHost = hostnameOf(enEnv)
  const trHost = hostnameOf(trEnv)

  if (enHost && host === enHost) return "en"
  if (trHost && host === trHost) return "tr"

  // 3/4) Known prod domains
  if (APP_DOMAINS.en && (host === APP_DOMAINS.en || host.endsWith(APP_DOMAINS.en))) return "en"
  if (APP_DOMAINS.primary && (host === APP_DOMAINS.primary || host.endsWith(APP_DOMAINS.primary))) return "tr"

  // 5/6) Local dev defaults
  if (host === "127.0.0.1") return "en"
  if (host === "localhost") return "tr"

  // 7) Fallback
  return "tr"
}

 function resolveBaseUrl(lang: "tr" | "en", req: Request) {
  // 1) Dile göre env’den canonical tenant URL’i seç
  const envUrl =
    lang === "en"
      ? (process.env.APP_BASE_URL_EN ||
         process.env.NEXT_PUBLIC_SITE_URL_EN ||
         "")
      : (process.env.APP_BASE_URL_TR ||
         process.env.NEXT_PUBLIC_SITE_URL_TR ||
         process.env.NEXT_PUBLIC_BASE_URL ||
         "");

  if (envUrl) {
    try {
      const u = new URL(envUrl);
      // host + protokolü normalize et, sondaki slash’i at
      return `${u.protocol}//${u.host}`.replace(/\/$/, "");
    } catch {
      return envUrl.replace(/\/$/, "");
    }
  }

  // 2) Env yoksa host header’a düş
  const host = currentHost(req);
  if (host) {
    const proto =
      (header(req, "x-forwarded-proto") || "https").split(",")[0].trim() || "https";
    return `${proto}://${host}`;
  }

  // 3) Origin fallback
  const origin = header(req, "origin");
  if (origin) return origin.replace(/\/$/, "");

  // 4) Son çare: local
  return "http://localhost:3000";
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
  // Hardened suffix/equality check without relying on String.endsWith
  if (!allowedCsv) return true
  const fd = String(fromDomain || "").toLowerCase().trim()
  if (!fd) return false
  const allowed = allowedCsv.toLowerCase().split(",").map(s => s.trim()).filter(Boolean)
  if (!allowed.length) return true

  for (const domRaw of allowed) {
    const dom = String(domRaw || "").toLowerCase().trim()
    if (!dom) continue
    if (fd === dom) return true
    if (fd.length > dom.length) {
      const tail = fd.slice(-dom.length)
      if (tail === dom) return true
      const tail2 = fd.slice(-(dom.length + 1))
      if (tail2 === "." + dom) return true
    }
  }
  return false
}

async function sendWithResend({ from, to, subject, html, replyTo }: { from: string, to: string, subject: string, html: string, replyTo?: string }) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false, error: "mail_not_configured" }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({ from, to, subject, html, reply_to: replyTo }),
  })
  const text = await res.text().catch(()=> "")
  if (!res.ok) return { ok:false, status: res.status, error:`resend_failed(${res.status})`, detail: text }
  let id: string | null = null
  try { const j = JSON.parse(text); id = j?.id || j?.data?.id || null } catch {}
  return { ok:true, id }
}

export async function POST(req: Request) {
  const startedAt = Date.now()
  try {
    const body = (await req.json().catch(() => ({}))) as Body
    const email = (body.email || "").trim().toLowerCase()
    const password = (body.password || "").toString()
    const fullName = (body.fullName || "").trim() || null
    const accountType = (body.accountType || "individual") as string
    const orgName = (body.orgName || "").trim() || null

    // LANG by host/env with optional override from body.lang
    const lang: "tr" | "en" = inferLangFromHost(req, body.lang as any)

    const next = (body.next || "/redirect/me").toString()

    if (!email) return NextResponse.json({ ok: false, error: "missing_email" }, { status: 400 })
    if (!password) return NextResponse.json({ ok: false, error: "missing_password" }, { status: 400 })

    const baseUrl = resolveBaseUrl(lang, req)
    const redirectUrl = new URL("/auth/confirm", baseUrl)
    redirectUrl.searchParams.set("e", email)
    redirectUrl.searchParams.set("lang", lang)
    redirectUrl.searchParams.set("next", next)

    // Supabase Admin
    const { createClient } = await import("@supabase/supabase-js")
    const supabaseUrl = getEnv("NEXT_PUBLIC_SUPABASE_URL")
    const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY")
    const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
const origin_host = currentHost(req)
     const metadata: Record<string, any> = {
       full_name: fullName,
       account_type: accountType,
       organization_name: orgName,
       lang,
       origin_host, // <-- kritik: tetikleyici bu değeri kullanıyor
     }
 // --- RATE LIMIT & CAPTCHA (soft block) ---
     const nowIso = new Date().toISOString();
     const url = new URL(req.url);
     const ip =
       req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
       req.headers.get("x-real-ip") ||
       "0.0.0.0";
     const ua = req.headers.get("user-agent") || "";

     const WINDOW_SECONDS = Number(process.env.SIGNUP_WINDOW_SECONDS || 600);
     const MAX_PER_WINDOW = Number(process.env.SIGNUP_MAX_PER_WINDOW || 5);
     const REQUIRE_CAPTCHA_AFTER = Number(process.env.SIGNUP_REQUIRE_CAPTCHA_AFTER || 3);

     // Pencere başı deneme sayısı (audit_logs üzerinden)
     const windowStartIso = new Date(Date.now() - WINDOW_SECONDS * 1000).toISOString();
     const { count: attemptCount } = await admin
       .from("audit_logs")
       .select("id", { count: "exact", head: true })
       .eq("event", "signup_attempt")
       .eq("ip", ip)
       .gte("created_at", windowStartIso);

     const attempts = attemptCount || 0;
     const needCaptcha = attempts >= REQUIRE_CAPTCHA_AFTER;
     if (attempts >= MAX_PER_WINDOW) {
       return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
     }

  // Captcha zorunluluğu (yumuşak blok)
  if (needCaptcha) {
    const cap = req.headers.get("x-captcha-token") || "";
    if (!cap) {
      return NextResponse.json({ ok: false, error: "captcha_required" }, { status: 403 });
    }
    const v = await verifyCaptcha(cap, ip);
    if (!v.ok) {
      return NextResponse.json({ ok: false, error: "captcha_failed" }, { status: 403 });
    }
  }


     // Deneme logu (try)
     await admin.from("audit_logs").insert([{
       event: "signup_attempt",
       action: "try",
       resource_type: "auth",
       resource_id: null,
       ip,
       user_agent: ua,
       created_at: nowIso,
       metadata: { host: url.host, lang, origin_host }
     }]);
    // Generate SIGNUP link
    const options: any = { data: metadata, redirectTo: redirectUrl.toString(), emailRedirectTo: redirectUrl.toString() }
    const { data, error } = await admin.auth.admin.generateLink({
      type: "signup",
      email,
      password,
      options,
    })
    if (error) {
      const msg = (error as any)?.message || "generate_link_failed"
      try {
        await admin.from("audit_logs").insert([{
          event: "signup_attempt",
          action: "deny",
          resource_type: "auth",
          resource_id: null,
          ip: ip || null,
          user_agent: ua || null,
          created_at: nowIso,
          metadata: { host: url.host, reason: msg, lang, origin_host }
        }]);
      } catch {}
      return NextResponse.json({ ok: false, error: `generate_link_failed:${msg}` }, { status: 500 })
    }


    const confirmUrl: string = (data as any)?.properties?.action_link || redirectUrl.toString()

    // Pre-create organization & membership for corporate accounts (before email verification)
    let createdOrgId: string | null = null;
    try {
      if (accountType === "corporate" && orgName) {
        const newUserId: string | null =
          ((data as any)?.user?.id as string) ||
          (((data as any)?.user && (data as any).user.id) as string) ||
          null;

        if (newUserId) {
          // 1) Create organization
          const { data: orgRow, error: orgErr } = await admin
            .from("organizations")
            .insert({ name: orgName })
            .select("id")
            .single();

          if (orgErr) {
            
          } else if (orgRow?.id) {
            createdOrgId = orgRow.id as string;

            // 2) Add owner membership for the new user
            const { error: memErr } = await admin
              .from("organization_members")
              .insert({ org_id: createdOrgId, user_id: newUserId, org_role: "owner", status: "active" });

            if (memErr) {
              
            }

            // 3) Audit (best effort)
            try {
              await admin.from("audit_logs").insert({
                action: "create",
                event: "org.created",
                resource_type: "organization",
                resource_id: createdOrgId,
                actor_role: "system",
                actor_user_id: newUserId,
                payload: { name: orgName }
              });
            } catch (auditErr) {
              
            }
          }
        } else {
          
        }
      }
    } catch (preErr) {
      
    }

    // Send email via Resend
    const from =
       lang === "en"
         ? (process.env.RESEND_FROM_EN || `${BRAND.nameEN} <${MAIL.fromEmail}>`)
         : (process.env.RESEND_FROM_TR || `${BRAND.nameTR} <${MAIL.fromEmail}>`)
     if (!from) {
       return NextResponse.json({ ok:false, error:`from_missing_fallback` }, { status: 400 })
     }
    const allowedCsv = process.env.RESEND_ALLOWED_DOMAINS || ""
    const fromDomain = domainOfEmail(from)
    if (!domainAllowed(fromDomain, allowedCsv)) {
      return NextResponse.json({ ok:false, error: `from_domain_not_allowed: RESEND_ALLOWED_DOMAINS='${allowedCsv}'` }, { status: 400 })
    }

    const subject = lang === "en" ? "Confirm your signup" : "Kaydınızı doğrulayın"
    const cta = lang === "en" ? "Confirm email" : "E-postayı doğrula"
    const pre = lang === "en"
      ? "Click the button below to confirm your email address."
      : "E-posta adresinizi doğrulamak için aşağıdaki butona tıklayın."
    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.6">
        <h2>${subject}</h2>
        <p>${pre}</p>
        <p style="margin:20px 0">
          <a href="${confirmUrl}" style="display:inline-block;padding:10px 16px;background:#0a7;color:#fff;border-radius:8px;border:1px solid #0a7;text-decoration:none">${cta}</a>
        </p>
        <p style="font-size:12px;color:#666">If the button does not work, copy & paste this link:</p>
        <p style="font-size:12px;word-break:break-all;color:#666">${confirmUrl}</p>
      </div>
    `

    const sendRes = await sendWithResend({
      from,
      to: email,
      subject,
      html,
      replyTo: process.env.RESEND_REPLY_TO || undefined,
    })
   if (!sendRes.ok) {
      try {
        await admin.from("audit_logs").insert([{
          event: "signup_attempt",
          action: "deny",
          resource_type: "auth",
          resource_id: null,
          ip: ip || null,
          user_agent: ua || null,
          created_at: nowIso,
          metadata: { host: url.host, reason: "mail_send_failed", status: (sendRes as any).status, lang, origin_host }
        }]);
      } catch {}
      return NextResponse.json({ ok:false, error: "mail_send_failed", status: (sendRes as any).status }, { status: 500 })
    }

    try {
       // --- SPAM / DISPOSABLE SİNYALLERİ (ek güvenlik) ---
  const lowerEmail = email; // zaten lower-case aldık
  const dispPolicy = disposablePolicy();
  const isDisp = isDisposableEmail(lowerEmail);

  // form metninden sinyal (varsa)
  const candidateText =
    String((metadata && (metadata.message || metadata.msg || metadata.bio || "")) || "");
  const spamScore = scoreTextSpam(candidateText);
  const suspicious = candidateText ? isTextSuspicious(spamScore) : false;

  // Disposable politika
  if (isDisp) {
    if (dispPolicy === "reject") {
      await admin.from("audit_logs").insert([{
        event: "signup_attempt",
        action: "deny",
        resource_type: "auth",
        resource_id: null,
        ip, user_agent: ua, created_at: nowIso,
        metadata: { host: url.host, reason: "disposable_reject", lang, origin_host }
      }]);
      return NextResponse.json({ ok: false, error: "disposable_email_rejected" }, { status: 422 });
    }
    // challenge (Captcha zorunlu)
    const cap = req.headers.get("x-captcha-token") || "";
    const v = await verifyCaptcha(cap, ip);
    if (!v.ok) {
      return NextResponse.json({ ok: false, error: "captcha_required" }, { status: 403 });
    }
  }

  // Metin şüpheli ise challenge uygula
  if (suspicious) {
    const cap = req.headers.get("x-captcha-token") || "";
    const v = await verifyCaptcha(cap, ip);
    if (!v.ok) {
      await admin.from("audit_logs").insert([{
        event: "signup_attempt",
        action: "deny",
        resource_type: "auth",
        resource_id: null,
        ip, user_agent: ua, created_at: nowIso,
        metadata: { host: url.host, reason: "spam_suspected", spam: spamScore, lang, origin_host }
      }]);
      return NextResponse.json({ ok: false, error: "captcha_required" }, { status: 403 });
    }
  }

  // Deneme logu (try)
  await admin.from("audit_logs").insert([{
    event: "signup_attempt",
    action: "try",
    resource_type: "auth",
    resource_id: null,
    ip,
    user_agent: ua,
    created_at: nowIso,
    metadata: { host: url.host, lang, origin_host }
  }]);

    } catch {}
    return NextResponse.json({ ok:true, lang })
  } catch (err: any) {
    
    const msg: string = err?.message || "unexpected_error"
    if (msg.startsWith("missing_env:")) {
      return NextResponse.json({ ok: false, error: msg }, { status: 500 })
    }
    return NextResponse.json({ ok: false, error: `unexpected:${msg}` }, { status: 500 })
  } 
}
