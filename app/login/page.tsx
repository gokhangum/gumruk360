"use client";
import { useEffect, useState, FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useTranslations, useLocale } from "next-intl";

export default function LoginPage() {
  const sp = useSearchParams();
  const next = sp.get("next") || "/redirect/me";
  const supabase = createClientComponentClient();

  const [email, setEmail] = useState(""); 
  const [password, setPassword] = useState(""); 
  const [status, setStatus] = useState<"idle"|"sending"|"error">("idle"); 
  const [message, setMessage] = useState<string|null>(null);
const [loginOpen, setLoginOpen] = useState<boolean|null>(null)

const t = useTranslations("auth.login");
const locale = useLocale();
const isTr = locale === "tr";



  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (mounted && session) window.location.href = next;
    })();
    return () => { mounted = false; };
  }, [supabase, next]);
  useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        const r = await fetch('/api/public/auth-flags', {
          cache: 'no-store',
          headers: { Accept: 'application/json' }
        });
        const raw = await r.text().catch(() => '');
        let j: any = {};
        try { j = JSON.parse(raw || '{}'); } catch {}
        const data = j.data ?? j;
        if (!canceled) setLoginOpen(!!data?.login_open);
      } catch {
        if (!canceled) setLoginOpen(true);
      }
    })();
    return () => { canceled = true; };
  }, []);

function mapError(errMsg: string): string {
  const lower = (errMsg || "").toLowerCase();

  // Supabase tipikleri
  if (lower.includes("invalid login credentials") || lower.includes("invalid email or password")) {
    return t("errors.invalidCredentials");
  }
  if (lower.includes("email not confirmed")) {
    return t("errors.emailNotConfirmed");
  }
  return errMsg || t("errors.loginFailed");
}


  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("sending"); setMessage(null);
	    if (loginOpen === false) { setStatus("error"); setMessage(isTr ? "Giriş şuanda kapalıdır." : "Login is currently disabled."); return }

    try {
      if (typeof window !== 'undefined') localStorage.setItem('g360_email', email);

      // Sunucu tarafı login (rate-limit & captcha kontrolü API'de)
      const resp = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const j = await resp.json().catch(() => ({}));
      if (!resp.ok || !j?.ok) {
        throw new Error(j?.error || "login_failed");
      }

      // API dönen token'lar
      const access_token: string | null = j?.access_token ?? null;
      const refresh_token: string | null = j?.refresh_token ?? null;


      // 1) Set server cookies
      if (access_token && refresh_token) {
        try {
          await fetch("/api/auth/set-session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ access_token, refresh_token })
          });
        } catch {}
      }

      // 2) Onboarding
      if (access_token) {
        try {
          await fetch("/api/onboarding/finish", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${access_token}`
            },
            body: JSON.stringify({ token: access_token })
          });
        } catch {}
      }

      window.location.href = next;
    } catch (err:any) {
      setStatus("error"); 
      setMessage(mapError(err?.message || ''));
    } finally {
      if (status !== "error") setStatus("idle");
    }
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4 border rounded-xl p-6">
        <h1 className="text-xl font-semibold">{t("title")}</h1>

        <form onSubmit={onSubmit} className="space-y-3">
          <input type="email" required placeholder={t("email")} value={email} onChange={e => { setEmail(e.target.value); if (typeof window!=='undefined') localStorage.setItem('g360_email', e.target.value); }} className="w-full border rounded-lg p-3"/>

          <input type="password" required placeholder={t("password")} value={password} onChange={e => setPassword(e.target.value)} className="w-full border rounded-lg p-3"/>
<div className="text-right"><a href="/reset-password" className="text-sm underline">{t("forgot")}</a></div>

          <button type="submit" disabled={status==="sending" || loginOpen===false} className="w-full rounded-lg p-3 border bg-black text-white disabled:opacity-60">
   {status==="sending"
    ? t("loggingIn")
     : (loginOpen===false
         ? (isTr ? "Giriş şuanda kapalıdır." : "Login is currently disabled.")
         : t("login"))}
</button>

        </form>
        {message && <p className={`text-sm ${status==="error"?"text-red-600":"text-green-600"}`}>{message}</p>}
  <p className="text-sm text-gray-600">
  {t("noAccount")} <a className="underline" href="/signup">{t("signup")}</a>
</p>

      </div>
    </div>
  );
}
