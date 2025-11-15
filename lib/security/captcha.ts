// lib/security/captcha.ts
export type CaptchaProvider = "turnstile" | "hcaptcha";

export async function verifyCaptcha(
  token: string,
  remoteip?: string | null
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const provider = (process.env.CAPTCHA_PROVIDER || "turnstile") as CaptchaProvider;
  const secret = process.env.CAPTCHA_SECRET_KEY || "";
  if (!secret) return { ok: false, reason: "captcha_not_configured" };
  if (!token) return { ok: false, reason: "captcha_token_missing" };

  try {
    if (provider === "turnstile") {
      const resp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret, response: token, remoteip: remoteip || "" }),
      });
      const data = await resp.json();
      return data.success ? { ok: true } : { ok: false, reason: "turnstile_fail" };
    } else {
      const resp = await fetch("https://hcaptcha.com/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret, response: token, remoteip: remoteip || "" }),
      });
      const data = await resp.json();
      return data.success ? { ok: true } : { ok: false, reason: "hcaptcha_fail" };
    }
  } catch {
    return { ok: false, reason: "captcha_network_error" };
  }
}
