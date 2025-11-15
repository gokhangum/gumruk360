// lib/security/disposable.ts
const STATIC_DOMAINS = new Set<string>([
  // hızlı başlangıç için birkaç örnek; listeyi genişletebilirsin
  "mailinator.com",
  "guerrillamail.com",
  "10minutemail.com",
  "temp-mail.org",
  "tempmailo.com",
  "yopmail.com",
  "burnermail.io",
  "getnada.com",
]);

export function disposablePolicy() {
  // reject | challenge | allow
  const p = String(process.env.DISPOSABLE_EMAIL_POLICY || "challenge").toLowerCase();
  return p === "reject" || p === "allow" ? p : "challenge";
}

export function isDisposableEmail(email?: string | null) {
  const m = String(email || "").toLowerCase().match(/@([^@]+)$/);
  if (!m) return false;
  const domain = m[1].trim();
  return STATIC_DOMAINS.has(domain);
}
