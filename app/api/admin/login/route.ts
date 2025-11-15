export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { supabaseAdmin as admin } from "@/lib/supabase/admin"  // YOL DÜZELTİLDİ + alias

import { verifyCaptcha } from "@/lib/security/captcha"        // NEW: Turnstile/hCaptcha doğrulama

export async function POST(req: Request) {
	  const url = new URL(req.url);
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "0.0.0.0";
  const ua = req.headers.get("user-agent") || "";
  const nowIso = new Date().toISOString();

  // Audit log için temel kayıt
  const baseLog = {
    event: "admin_login_attempt",
    ip,
    user_agent: ua,
    created_at: nowIso,
    metadata: { host: url.host },
  };

  // Eşikler (env üzerinden yönetilir)
  const MAX_ATTEMPTS = Number(process.env.ADMIN_LOGIN_MAX_ATTEMPTS || 10);
  const LOCK_MINUTES = Number(process.env.ADMIN_LOGIN_LOCK_MIN || 15);
  const REQUIRE_CAPTCHA_AFTER = Number(process.env.ADMIN_LOGIN_REQUIRE_CAPTCHA_AFTER || 5);

  // 10 dk pencerede IP bazlı deneme sayısı

  const { data: attempts, error: qErr } = await admin.rpc("count_audit_window", {
    p_event: "admin_login_attempt",
    p_ip: ip,
    p_window_seconds: 600,
  });

  const attemptsCount = qErr ? 0 : (attempts || 0);

  // RATE LIMIT: eşik aşıldı → 429 + audit 'deny:rate_limited'
  if (attemptsCount >= MAX_ATTEMPTS) {
    try {
      await admin.from("audit_logs").insert([{
        ...baseLog,
        action: "deny",
        resource_type: "admin_login",
        resource_id: null,
        metadata: { ...baseLog.metadata, reason: "rate_limited", lock_min: LOCK_MINUTES }
      }]);
    } catch {}
    return NextResponse.json(
      { ok: false, error: "rate_limited", retry_after_minutes: LOCK_MINUTES },
      { status: 429 }
    );
  }

  // CAPTCHA: eşik yaklaştı/aşıldı → token zorunlu ve doğrulanmalı
  if (attemptsCount >= REQUIRE_CAPTCHA_AFTER) {
    const cap = req.headers.get("x-captcha-token") || "";
    const v = await verifyCaptcha(cap, ip);
    if (!v.ok) {
      try {
        await admin.from("audit_logs").insert([{
          ...baseLog,
          action: "deny",
          resource_type: "admin_login",
          resource_id: null,
          metadata: { ...baseLog.metadata, reason: "captcha_required" }
        }]);
      } catch {}
      return NextResponse.json({ ok: false, error: "captcha_required" }, { status: 403 });
    }
  }


  const secret = process.env.ADMIN_SECRET
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "server_misconfigured" },
      { status: 500 }
    )
  }

  let provided: string | null = null
  const ct = req.headers.get("content-type") || ""
  // baseLog yukarıda oluşturuldu (satır 18 civarı)


  try {
    if (ct.includes("application/json")) {
      const b = await req.json()
      provided = b?.secret ?? null
    } else if (ct.includes("application/x-www-form-urlencoded")) {
      const form = await req.formData()
      provided = (form.get("secret") as string) ?? null
    } else {
      const u = new URL(req.url)     // 'url' ile çakışmaması için isim değişti
      provided = u.searchParams.get("secret")
    }

  } catch {
    // ignore
  }
    // Deneme (try) logu
  try {
    await admin.from("audit_logs").insert([{
      ...baseLog,
      action: "try",
      resource_type: "admin_login",
      resource_id: null
    }]);
  } catch {}

  if (!provided || provided !== secret) {
  await admin.from("audit_logs").insert([{
    ...baseLog,
    action: "deny",
    resource_type: "admin_login",
    resource_id: null,
    metadata: { ...baseLog.metadata, reason: "invalid_secret" }
  }]);

    return NextResponse.json({ ok: false, error: "invalid_secret" }, { status: 401 })
  }
await admin.from("audit_logs").insert([{
  ...baseLog,
  action: "allow",
  resource_type: "admin_login",
  resource_id: null
}]);
  const res = NextResponse.json({ ok: true })
  res.cookies.set({
    name: "admin_secret",
    value: secret,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12, // 12 saat
  })
  return res
}
