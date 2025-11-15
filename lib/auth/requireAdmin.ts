// lib/auth/requireAdmin.ts

/**
 * Admin kontrolü:
 * 1) Request tabanlı: Header/Cookie/Query ile ADMIN_SECRET
 * 2) E-posta tabanlı: ADMIN_EMAILS (virgüllü liste) ile basit whitelist (geri uyumluluk)
 */

function parseCookie(headerVal: string | null, name: string): string | null {
  if (!headerVal) return null
  const cookies = headerVal.split(";").map((v) => v.trim())
  for (const c of cookies) {
    const [k, ...rest] = c.split("=")
    if (k === name) return rest.join("=") || ""
  }
  return null
}

/** Request içinden admin mi? (secret temelli) */
export function isAdminRequest(req?: Request): boolean {
  const expected = process.env.ADMIN_SECRET
  if (!expected) return false

  // Header
  const h = req?.headers?.get("x-admin-secret")
  if (h && h === expected) return true

  // Cookie
  const ck = req?.headers?.get("cookie") ?? null
  const c = parseCookie(ck, "admin_secret")
  if (c && c === expected) return true

  // DEV: query
  if (process.env.NODE_ENV !== "production" && req?.url) {
    try {
      const url = new URL(req.url)
      const q = url.searchParams.get("admin_secret")
      if (q && q === expected) return true
    } catch { /* ignore */ }
  }

  return false
}

/** E-posta whitelist (geri uyumluluk: bazı sayfalarda isAdmin(email) çağrısı var) */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const raw = process.env.ADMIN_EMAILS || ""
  if (!raw.trim()) return false
  const allow = raw.split(",").map(s => s.trim().toLowerCase()).filter(Boolean)
  return allow.includes(email.toLowerCase())
}

/** Aşırı yükleme: isAdmin(req) VEYA isAdmin(email) */
export function isAdmin(arg?: Request | string | null): boolean {
  if (typeof arg === "string" || arg == null) {
    return isAdminEmail(arg as any)
  }
  return isAdminRequest(arg as Request)
}

 /** Admin değilse throw */
 export async function requireAdmin(req?: Request): Promise<void> {
  let ok = false

  // 1) SECRET tabanlı kontrol (header/cookie/query ile ADMIN_SECRET)
 ok = isAdmin(req as any)

 // 2) E-posta tabanlı kontrol (URL query: ?email=...) + ADMIN_EMAILS
  if (!ok && req?.url) {
    try {
     const url = new URL(req.url)
      const email = url.searchParams.get("email")
     if (email && isAdmin(email)) {
        ok = true
      }
    } catch { /* ignore */ }
 }
 
 if (!ok) throw new Error("unauthorized")
 }

 /** Alias */
 export async function assertAdmin(req?: Request): Promise<void> {
   return requireAdmin(req)
 }

