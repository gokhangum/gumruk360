// app/api/auth/login/route.ts
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { supabaseAdmin as admin } from "@/lib/supabase/admin";
import { verifyCaptcha } from "@/lib/security/captcha";

export async function POST(req: Request) {
  const hdrs = await headers();
  const url = new URL(req.url);
  const ip =
    hdrs.get("x-forwarded-for")?.split(",")[0].trim() ||
    hdrs.get("x-real-ip") ||
    "0.0.0.0";
  const ua = hdrs.get("user-agent") || "";
  const nowIso = new Date().toISOString();

  const WINDOW_SECONDS = Number(process.env.LOGIN_WINDOW_SECONDS || 600);
  const MAX_PER_WINDOW = Number(process.env.LOGIN_MAX_PER_WINDOW || 10);
  const REQUIRE_CAPTCHA_AFTER = Number(process.env.LOGIN_REQUIRE_CAPTCHA_AFTER || 5);
  const LOCK_MINUTES = Number(process.env.LOGIN_LOCK_MIN || 15);

  const { email, password } = await req.json().catch(() => ({ email: "", password: "" }));
  const lowerEmail = String(email || "").toLowerCase();

  // pencere sayımı
  const windowStartIso = new Date(Date.now() - WINDOW_SECONDS * 1000).toISOString();
  const { count: attemptCount } = await admin
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("event", "login_attempt")
    .eq("ip", ip)
    .eq("target", lowerEmail)
    .gte("created_at", windowStartIso);

  const attempts = attemptCount || 0;
  const needCaptcha = attempts >= REQUIRE_CAPTCHA_AFTER;

  if (attempts >= MAX_PER_WINDOW) {
    await admin.from("audit_logs").insert([{
      event: "login_attempt",
      action: "deny",
      resource_type: "auth",
      resource_id: null,
      ip, user_agent: ua, created_at: nowIso,
      target: lowerEmail,
      metadata: { host: url.host, reason: "rate_limited", lock_min: LOCK_MINUTES }
    }]);
    return NextResponse.json(
      { ok: false, error: "rate_limited", retry_after_minutes: LOCK_MINUTES },
      { status: 429 }
    );
  }

  // Captcha gerekliyse doğrula
  if (needCaptcha) {
    const cap = hdrs.get("x-captcha-token") || "";
    const v = await verifyCaptcha(cap, ip);
    if (!v.ok) {
      await admin.from("audit_logs").insert([{
        event: "login_attempt",
        action: "deny",
        resource_type: "auth",
        resource_id: null,
        ip, user_agent: ua, created_at: nowIso,
        target: lowerEmail,
        metadata: { host: url.host, reason: "captcha_required" }
      }]);
      return NextResponse.json({ ok: false, error: "captcha_required" }, { status: 403 });
    }
  }

  await admin.from("audit_logs").insert([{
    event: "login_attempt",
    action: "try",
    resource_type: "auth",
    resource_id: null,
    ip, user_agent: ua, created_at: nowIso,
    target: lowerEmail,
    metadata: { host: url.host }
  }]);

  // Sunucu tarafı login (anon key ile)
  const cookieStore = await cookies(); // <-- DİKKAT: await
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options?: Parameters<typeof cookieStore.set>[2]) {
          // Next 15: cookies().set(name, value, options)
          cookieStore.set(name, value, options);
        },
        remove(name: string, options?: Parameters<typeof cookieStore.set>[2]) {
          // Tercihen delete, yoksa maxAge:0 ile sil
          if (typeof (cookieStore as any).delete === "function") {
            (cookieStore as any).delete(name, options);
          } else {
            cookieStore.set(name, "", { ...(options || {}), maxAge: 0 });
          }
        },
      },
    }
  );

  const { data, error } = await supabase.auth.signInWithPassword({ email: lowerEmail, password });
  if (error) {
    await admin.from("audit_logs").insert([{
      event: "login_attempt",
      action: "deny",
      resource_type: "auth",
      resource_id: null,
      ip, user_agent: ua, created_at: nowIso,
      target: lowerEmail,
      metadata: { host: url.host, reason: "invalid_credentials" }
    }]);
    return NextResponse.json({ ok: false, error: "invalid_credentials" }, { status: 401 });
  }

  const access_token = data.session?.access_token || null;
  const refresh_token = data.session?.refresh_token || null;

  await admin.from("audit_logs").insert([{
    event: "login_attempt",
    action: "allow",
    resource_type: "auth",
    resource_id: data.user?.id || null,
    ip, user_agent: ua, created_at: nowIso,
    target: lowerEmail,
    metadata: { host: url.host }
  }]);

  return NextResponse.json({ ok: true, access_token, refresh_token });
}
