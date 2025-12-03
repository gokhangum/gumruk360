// lib/payments/paytr.ts
import crypto from "crypto"

/** PayTR token isteği için giriş tipi (kuruş bazında) */
export type PaytrInitInput = {
  merchant_oid: string
  email: string
  user_ip: string
  amount: number            // Kuruş
  currency: string          // "TRY"
  user_name?: string
  user_address?: string
  user_phone?: string
  basket_json?: string      // JSON.stringify([["Hizmet", "24.00", 1]])
  no_installment?: boolean  // true => 1
  max_installment?: number  // 0 => sınırsız
  paytr_test_mode?: number  // 1/0
  lang?: "tr" | "en"
  meta_order_id?: string 
  base_url?: string  
  tenantCode?: "tr" | "en"
}

/** Env okuma (trim) */
function env(name: string, optional = false): string {
  const v = process.env[name]
  if (!v || !v.trim()) {
    if (optional) return ""
    throw new Error(`Missing env ${name}`)
  }
  return v.trim()
}

/** Basit yardımcılar */
function toInt(v: any, def = 0): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : def
}
function toFlag(v: any): 0 | 1 {
  if (v === true || v === 1 || v === "1") return 1
  return 0
}
 
 type TenantCode = "tr" | "en"
 
 function getPaytrEnvByTenant(tenantCode?: TenantCode) {
   const code: TenantCode = (tenantCode || "tr") as TenantCode

  if (code === "en") {
    return {
      merchantId: env("PAYTR_MERCHANT_ID_EN"),
       merchantKey: env("PAYTR_MERCHANT_KEY_EN"),
     merchantSalt: env("PAYTR_MERCHANT_SALT_EN"),
     }
   }

  // Varsayılan: Gümrük360 (TR) mağazası
  return {
    merchantId: env("PAYTR_MERCHANT_ID"),
    merchantKey: env("PAYTR_MERCHANT_KEY"),
     merchantSalt: env("PAYTR_MERCHANT_SALT"),
  }
 }
 
 function getPaytrEnvByMerchantId(merchantId: string) {
   const trId = env("PAYTR_MERCHANT_ID")
  const enId = env("PAYTR_MERCHANT_ID_EN", /*optional*/ true)

  if (merchantId && enId && merchantId === enId) {
     return {
      merchantId: enId,
      merchantKey: env("PAYTR_MERCHANT_KEY_EN"),
      merchantSalt: env("PAYTR_MERCHANT_SALT_EN"),
    }
  }

  // Varsayılan veya eşleşmeyen durumlarda TR mağazası kullanılsın
  return {
    merchantId: trId,
    merchantKey: env("PAYTR_MERCHANT_KEY"),
    merchantSalt: env("PAYTR_MERCHANT_SALT"),
 }
 }

/**
 * PayTR — Token Alma
 * Notlar:
 *  - Basket alanı PayTR’da BASE64(JSON) olarak istenir; burada otomatik encode edilir.
 *  - TEST modunu .env’de PAYTR_TEST_MODE=1 ile ya da input.paytr_test_mode ile açabilirsin.
 *  - MOCK_PAYTR=1 ise gerçek isteği atlamayı sağlar (lokal akış için).
 *  - merchant_ok_url / merchant_fail_url ZORUNLU; NEXT_PUBLIC_BASE_URL üzerinden kuruyoruz.
 */
 export async function paytrInitiate(input: PaytrInitInput): Promise<{ token: string }> {
  const { merchantId: MERCHANT_ID, merchantKey: MERCHANT_KEY, merchantSalt: MERCHANT_SALT } =
   getPaytrEnvByTenant(input.tenantCode)

  const TEST_MODE = toInt(process.env.PAYTR_TEST_MODE ?? input.paytr_test_mode ?? 0)
  const MOCK      = toFlag(process.env.MOCK_PAYTR)

  // Base URL — dönüş adresleri için
  const BASE = input.base_url || env("NEXT_PUBLIC_BASE_URL", /*optional*/ true) || "http://localhost:3000"
  const okUrl   = `${BASE}/checkout/${encodeURIComponent(input.merchant_oid)}/return?status=success`
  const failUrl = `${BASE}/checkout/${encodeURIComponent(input.merchant_oid)}/return?status=failed`

  // Basket'i hazırla (PayTR: base64(JSON))
  const basketJson =
    input.basket_json ||
    JSON.stringify([["Hizmet", (input.amount / 100).toFixed(2), 1]])
  const user_basket = Buffer.from(basketJson).toString("base64")

  const no_installment  = toFlag(input.no_installment)
  const max_installment = toInt(input.max_installment ?? 0)
  const lang            = (input.lang || "tr") as "tr" | "en"
  const timeout_limit   = 30 // dakika (makul varsayılan)
  const debug_on        = TEST_MODE ? 1 : 0

  // PayTR hash bileşimi (dokümana göre):
  // HMAC-SHA256(key=MERCHANT_KEY, data = merchant_id + user_ip + merchant_oid + email +
  // payment_amount + user_basket + no_installment + max_installment + currency + test_mode + MERCHANT_SALT)
  const data =
    MERCHANT_ID +
    input.user_ip +
    input.merchant_oid +
    input.email +
    String(input.amount) +
    user_basket +
    String(no_installment) +
    String(max_installment) +
    input.currency +
    String(TEST_MODE)

  const paytr_token = crypto
    .createHmac("sha256", MERCHANT_KEY)
    .update(data + MERCHANT_SALT)
    .digest("base64")

  // MOCK: Lokal akışta gerçek PayTR çağrısını atla
  if (MOCK) {
    return { token: "MOCK_PAYTR_TOKEN_" + crypto.randomBytes(6).toString("hex") }
  }

  // Gerçek istek
  const body = new URLSearchParams({
    merchant_id: MERCHANT_ID,
    user_ip: input.user_ip,
    merchant_oid: input.merchant_oid,
    email: input.email,
    payment_amount: String(input.amount), // kuruş
    user_name: input.user_name || "",
    user_address: input.user_address || "",
    user_phone: input.user_phone || "",
    user_basket, // base64(JSON)
    no_installment: String(no_installment),
    max_installment: String(max_installment),
    currency: input.currency,
    test_mode: String(TEST_MODE),
    paytr_token,
    merchant_ok_url: okUrl,
    merchant_fail_url: failUrl,
    timeout_limit: String(timeout_limit),
    debug_on: String(debug_on),
    lang,
  })

  const res = await fetch("https://www.paytr.com/odeme/api/get-token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    // Node runtime
    cache: "no-store",
  })

  type PaytrResp = { status?: string; token?: string; reason?: string }
  let json: PaytrResp | null = null
  try {
    json = (await res.json()) as PaytrResp
  } catch {
    const txt = await res.text()
    throw new Error(`paytr_token_parse_error: ${res.status} ${res.statusText} :: ${txt.slice(0, 200)}`)
  }

  if (!json || json.status !== "success" || !json.token) {
    // Hata mesajını üst katmana taşıyalım (route.ts "paytr_init_failed" map ediyorsa reason'ı loglar)
    throw new Error(`paytr_token_error: ${json?.reason || `${res.status} ${res.statusText}`}`)
  }

  return { token: json.token }
}
 /**
  * PayTR — Webhook Doğrulama
  * base64( HMAC_SHA256(key=MERCHANT_KEY, data=merchant_oid + status + total_amount + MERCHANT_SALT) )
 */
 export function verifyPaytrWebhook(
  params: Record<string, string | undefined>,
   merchantId?: string,
 ): boolean {
   const { merchantKey: MERCHANT_KEY, merchantSalt: MERCHANT_SALT } = merchantId
    ? getPaytrEnvByMerchantId(merchantId)
     : getPaytrEnvByTenant()

   const hash = params.hash || ""
   const concat =
     (params.merchant_oid || "") +
    (params.status || "") +
    (params.total_amount || "") +
     MERCHANT_SALT
 
   const calc = crypto.createHmac("sha256", MERCHANT_KEY).update(concat).digest("base64")
  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(calc))
   } catch {
    return false
  }
 }

