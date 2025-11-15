// app/api/payments/paytr/initiate/route.ts
import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/serverAdmin"
import { resolveTenantFromHost } from "@/lib/tenant"
import { paytrInitiate } from "@/lib/payments/paytr"
import { APP_DOMAINS, BRAND, MAIL } from "@/lib/config/appEnv";
export const runtime = "nodejs"

type OrderRow = {
  id: string
  tenant_id: string | null
  user_id: string | null
  amount: number | null // KURUŞ
  currency: string | null
  status: string
  question_id: string | null
  created_at: string
}

function getClientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for")
  if (xf) {
    const first = xf.split(",")[0]?.trim()
    if (first) return first
  }
  const xr = req.headers.get("x-real-ip")
  if (xr) return xr
  return "127.0.0.1"
}

async function getTenantIdByCode(code: string | null) {
  if (!code) return null
  const { data } = await supabaseAdmin
    .from("tenants")
    .select("id")
    .eq("code", code)
    .maybeSingle()
  return data?.id ?? null
}

function validAmount(a: any): a is number {
  const n = Number(a)
  return Number.isFinite(n) && n > 0
}

/** "1234,56" veya "1234.56" gibi TL değerlerini KURUŞ'a çevirir */
function tlToCents(v: any): number | null {
  if (v == null) return null
  let s = String(v).trim()
  if (!s) return null
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".")
  } else if (s.includes(",")) {
    s = s.replace(",", ".")
  }
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  const cents = Math.round(n * 100)
  return cents > 0 ? cents : null
}

/** Sorudan SLA/teklif tutarını al: önce price_final_tl, yoksa price_tl (TRY varsay) */
function pickSlaFromQuestion(q: any): { amount_cents?: number; currency?: string } {
  if (!q || typeof q !== "object") return {}
  const finalCents = tlToCents((q as any).price_final_tl)
  const baseCents = tlToCents((q as any).price_tl)
  const amount_cents = validAmount(finalCents) ? finalCents : validAmount(baseCents) ? baseCents : undefined
  return { amount_cents, currency: "TRY" }
}

/** Ad/telefon/adresi çeşitli kaynaklardan toparla, boş dönme */
async function resolveBuyerInfo(params: {
  payload: any
  order: OrderRow
}): Promise<{ name: string; phone: string; address: string }> {
  const { payload, order } = params

  // 1) payload
  let name = (payload?.user_name ?? payload?.name ?? "").toString().trim()
  let phone = (payload?.user_phone ?? payload?.phone ?? "").toString().trim()
  let address = (payload?.user_address ?? payload?.address ?? "").toString().trim()

  // 2) profiles
  if (order.user_id) {
    try {
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("full_name, name, phone, address")
        .eq("id", order.user_id)
        .maybeSingle()
      if (prof) {
        if (!name) name = (prof.full_name || prof.name || "").toString().trim()
        if (!phone) phone = (prof.phone || "").toString().trim()
        if (!address) address = (prof.address || "").toString().trim()
      }
    } catch {}
  }

  // 3) questions
  if (order.question_id) {
    try {
      const { data: q } = await supabaseAdmin
        .from("questions")
        .select("contact_name, name, phone, address")
        .eq("id", order.question_id)
        .maybeSingle()
      if (q) {
        if (!name) name = (q.contact_name || q.name || "").toString().trim()
        if (!phone) phone = (q.phone || "").toString().trim()
        if (!address) address = (q.address || "").toString().trim()
      }
    } catch {}
  }

  // 4) auth metadata
  if (order.user_id && !name) {
    try {
      const { data: u } = await (supabaseAdmin as any).auth?.admin?.getUserById(order.user_id)
      const meta = u?.user?.user_metadata || {}
      name =
        (meta.full_name || meta.name || `${u?.user?.email?.split("@")[0]}` || "").toString().trim()
    } catch {}
  }

  // 5) fallback
  if (!name || name.length < 2) name = (BRAND.nameTR ? `${BRAND.nameTR} Müşterisi` : "Müşteri")
  if (!phone || phone.replace(/\D/g, "").length < 10) phone = "05555555555"
  if (!address || address.length < 10) address = "Yerel Test Adresi, İstanbul"

  return { name, phone, address }
}

export async function POST(req: Request) {
  try {
    const host = req.headers.get("host") || ""
    const { code: tenantCode } = resolveTenantFromHost(host)
    const payload = await req.json().catch(() => ({} as any))

    // UI bazen orderId, bazen questionId, bazen de sadece id gönderiyor
    const idAny: string | undefined =
      payload?.orderId || payload?.order_id || payload?.questionId || payload?.question_id || payload?.id
    if (!idAny || typeof idAny !== "string") {
      return NextResponse.json({ ok: false, error: "order_not_found" }, { status: 404 })
    }

    // 1) Önce id'yi ORDER olarak dene
    let order: OrderRow | null = null
    {
      const { data, error } = await supabaseAdmin
        .from("orders")
        .select("id, tenant_id, user_id, amount, currency, status, question_id, created_at")
        .eq("id", idAny)
        .maybeSingle()
      if (error) {
        
        return NextResponse.json({ ok: false, error: "order_select_failed" }, { status: 500 })
      }
      order = (data as OrderRow) ?? null
    }

    // 2) Order yoksa: idAny'yi QUESTION kabul et
    if (!order) {
      const questionId = idAny
      const tenantId = await getTenantIdByCode(tenantCode)

      // a) Bu soruya bağlı en yeni PENDING order var mı?
      if (!order) {
        const { data, error } = await supabaseAdmin
          .from("orders")
          .select("id, tenant_id, user_id, amount, currency, status, question_id, created_at")
          .eq("question_id", questionId)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(1)
        if (error) {
          
          return NextResponse.json({ ok: false, error: "order_select_failed" }, { status: 500 })
        }
        if (data && (data as OrderRow[]).length > 0) {
          order = (data as OrderRow[])[0]
        }
      }

      // b) Yoksa, SORU’dan SLA/teklif (price_final_tl → price_tl) ile yeni pending order oluştur
      if (!order) {
        // Soru ve user_id
        let qRow: any | null = null
        try {
          const { data: q } = await supabaseAdmin
            .from("questions")
            .select("id, user_id, price_tl, price_final_tl")
            .eq("id", questionId)
            .maybeSingle()
          qRow = q ?? null
        } catch {
          qRow = null
        }
        const qUserId: string | null = qRow?.user_id ?? null

        const picked = pickSlaFromQuestion(qRow)
        if (validAmount(picked.amount_cents)) {
          const { data: created, error: insErr } = await supabaseAdmin
            .from("orders")
            .insert({
              tenant_id: tenantId,
              question_id: questionId,
              user_id: qUserId,
              amount: picked.amount_cents,        // KURUŞ — SLA’dan
              currency: picked.currency || "TRY",
              status: "pending",
              provider: "paytr",
            } as any)
            .select("id, tenant_id, user_id, amount, currency, status, question_id, created_at")
            .single()
          if (insErr) {
           
            return NextResponse.json({ ok: false, error: "order_create_failed" }, { status: 500 })
          }
          order = created as OrderRow
        }
      }

      // c) Hâlâ yoksa, aynı soru için en yeni HERHANGİ order’dan (DB) türet
      if (!order) {
        const { data, error } = await supabaseAdmin
          .from("orders")
          .select("id, tenant_id, user_id, amount, currency, status, question_id, created_at")
          .eq("question_id", questionId)
          .order("created_at", { ascending: false })
          .limit(1)
        if (error) {
          
          return NextResponse.json({ ok: false, error: "order_select_failed" }, { status: 500 })
        }
        if (data && (data as OrderRow[]).length > 0) {
          const template = (data as OrderRow[])[0]
          if (validAmount(template.amount)) {
            const { data: created, error: insErr } = await supabaseAdmin
              .from("orders")
              .insert({
                tenant_id: template.tenant_id ?? (await getTenantIdByCode(tenantCode)),
                question_id: questionId,
                user_id: template.user_id ?? null,
                amount: template.amount,           // DB’den (kuruş)
                currency: template.currency || "TRY",
                status: "pending",
                provider: "paytr",
              } as any)
              .select("id, tenant_id, user_id, amount, currency, status, question_id, created_at")
              .single()
            if (insErr) {
              
              return NextResponse.json({ ok: false, error: "order_create_failed" }, { status: 500 })
            }
            order = created as OrderRow
          }
        }
      }

      // d) Son kontrol
      if (!order) {
        return NextResponse.json({ ok: false, error: "amount_missing" }, { status: 400 })
      }
    }

    // 3) Buraya gelindiyse elimizde kesin bir order var
    const amount = Number(order.amount || 0) // KURUŞ — SLA/DB
    const currency = order.currency || "TRY"
    if (!validAmount(amount)) {
      return NextResponse.json({ ok: false, error: "amount_missing" }, { status: 400 })
    }

    // E-posta: payload.email > auth admin > fallback
    let email: string | undefined = payload?.email
    if (!email && order.user_id) {
      try {
        const { data: u } = await (supabaseAdmin as any).auth?.admin?.getUserById(order.user_id)
        email = u?.user?.email || undefined
      } catch {}
    }
    if (!email) email = MAIL.fromEmail

    // Ad/telefon/adres — ZORUNLU (PayTR)
    const buyer = await resolveBuyerInfo({ payload, order })

    const user_ip = getClientIp(req)
    const lang: "tr" | "en" =
      (APP_DOMAINS.en && (host === APP_DOMAINS.en || host.endsWith(APP_DOMAINS.en))) ? "en" : "tr"

    // Sepet (opsiyonel)
    const basket_json =
      payload?.basket_json || JSON.stringify([["Hizmet", (amount / 100).toFixed(2), 1]])

    // ⚠️ PAYTR merchant_oid: alfa-sayısal şart → order.id’yi temizle
    const merchantOid = order.id.replace(/[^a-zA-Z0-9]/g, "")

    // Bu merchantOid’i siparişe kaydediyoruz ki webhook’ta eşleşebilelim
    await supabaseAdmin
      .from("orders")
      .update({ provider: "paytr", provider_ref: merchantOid })
      .eq("id", order.id)

    const { token } = await paytrInitiate({
      merchant_oid: merchantOid,
      meta_order_id: order.id,   // dönüş URL’si için gerçek orderId’yi kullan
      email,
      user_ip,
      amount,           // KURUŞ — SLA/DB
      currency,
      lang,
      // Zorunlu paytr bilgiler
      user_name: buyer.name,
      user_phone: buyer.phone,
      user_address: buyer.address,
      no_installment: true,
      max_installment: 0,
      basket_json,
    })

    return NextResponse.json({ ok: true, orderId: order.id, token })
  } catch (e: any) {
    const msg = String(e?.message || e)
    
    return NextResponse.json(
      { ok: false, error: "paytr_init_failed", detail: msg },
      { status: 500 },
    )
  }
}
