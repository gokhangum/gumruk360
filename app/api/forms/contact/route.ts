// app/api/forms/contact/route.ts
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { supabaseAdmin as admin } from "@/lib/supabase/admin";
import { verifyCaptcha } from "@/lib/security/captcha";
import { scoreTextSpam, isTextSuspicious } from "@/lib/security/spam";
import { isDisposableEmail, disposablePolicy } from "@/lib/security/disposable";

export async function POST(req: Request) {
  const hdrs = await headers();
  const ip =
    hdrs.get("x-forwarded-for")?.split(",")[0].trim() ||
    hdrs.get("x-real-ip") || "0.0.0.0";
  const ua = hdrs.get("user-agent") || "";
  const url = new URL(req.url);
  const nowIso = new Date().toISOString();

  const { name, email, message, subject } = await req.json().catch(() => ({} as any));
  const lowerEmail = String(email || "").toLowerCase();

  // Basit alan doğrulama
  if (!lowerEmail || !message) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  // Rate-limit (IP başına 10dk içinde 5 deneme)
  const WINDOW_SECONDS = Number(process.env.CONTACT_WINDOW_SECONDS || 600);
  const MAX_PER_WINDOW = Number(process.env.CONTACT_MAX_PER_WINDOW || 5);
  const windowStartIso = new Date(Date.now() - WINDOW_SECONDS * 1000).toISOString();
  const { count: attemptCount } = await admin
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("event", "contact_submit")
    .eq("ip", ip)
    .gte("created_at", windowStartIso);

  if ((attemptCount || 0) >= MAX_PER_WINDOW) {
    await admin.from("audit_logs").insert([{
      event: "contact_submit",
      action: "deny",
      resource_type: "form",
      resource_id: null,
      ip, user_agent: ua, created_at: nowIso,
      metadata: { host: url.host, reason: "rate_limited" }
    }]);
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  // Disposable & spam sinyalleri
  const policy = disposablePolicy();
  const isDisp = isDisposableEmail(lowerEmail);
  const score = scoreTextSpam(String(message || ""));
  const suspicious = isTextSuspicious(score);

  // Captcha zorunluluğunu tetikle
  let needCaptcha = suspicious || (isDisp && policy !== "allow");
  if (needCaptcha) {
    const cap = hdrs.get("x-captcha-token") || "";
    const v = await verifyCaptcha(cap, ip);
    if (!v.ok) {
      await admin.from("audit_logs").insert([{
        event: "contact_submit",
        action: "deny",
        resource_type: "form",
        resource_id: null,
        ip, user_agent: ua, created_at: nowIso,
        metadata: { host: url.host, reason: isDisp ? "disposable" : "spam", score }
      }]);
      return NextResponse.json({ ok: false, error: "captcha_required" }, { status: 403 });
    }
  }

  if (isDisp && policy === "reject") {
    await admin.from("audit_logs").insert([{
      event: "contact_submit",
      action: "deny",
      resource_type: "form",
      resource_id: null,
      ip, user_agent: ua, created_at: nowIso,
      metadata: { host: url.host, reason: "disposable_reject" }
    }]);
    return NextResponse.json({ ok: false, error: "disposable_email_rejected" }, { status: 422 });
  }

  // TRY log
  await admin.from("audit_logs").insert([{
    event: "contact_submit",
    action: "try",
    resource_type: "form",
    resource_id: null,
    ip, user_agent: ua, created_at: nowIso,
    metadata: { host: url.host, suspicious, score }
  }]);

  // (Burada: talebi DB'ye yazabilir, e-posta gönderebilir vs.)
  // await admin.from("contact_messages").insert([...])

  // ALLOW log
  await admin.from("audit_logs").insert([{
    event: "contact_submit",
    action: "allow",
    resource_type: "form",
    resource_id: null,
    ip, user_agent: ua, created_at: nowIso,
    metadata: { host: url.host }
  }]);

  return NextResponse.json({ ok: true });
}
