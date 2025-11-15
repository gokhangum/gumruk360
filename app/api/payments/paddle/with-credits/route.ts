// app/api/payments/paddle/with-credits/route.ts
import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/serverAdmin"
import { supabaseServer } from "@/lib/supabase/server"
import { resolveTenantFromHost } from "@/lib/tenant"
import { logAudit } from "@/lib/audit"
import { createCheckoutViaTransaction, getEnv } from "@/lib/payments/paddle"
import { headers } from "next/headers"
export const runtime = "nodejs"

async function getPrimaryOrgId(supabase: Awaited<ReturnType<typeof supabaseServer>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: rows } = await supabase
    .from("organization_members")
    .select("org_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
  return rows?.[0]?.org_id ?? null
}

export async function POST(req: Request) {

  try {
    const url = new URL(req.url)
    const hdrs = await headers()
    const host = hdrs.get("x-forwarded-host") || hdrs.get("host") || url.host
    const proto = hdrs.get("x-forwarded-proto") || url.protocol.replace(":", "") || "http"
    const baseUrl = `${proto}://${host}`
    const supabase = await supabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const credits = Number(body?.credits ?? 0)
    const scope_type = (body?.scope_type === "org" ? "org" : "user") as "user" | "org"
    if (!(credits > 0)) {
      
      return NextResponse.json({ ok: false, error: "invalid_credits" }, { status: 400 })
    }

    const org_id = scope_type === "org" ? await getPrimaryOrgId(supabase) : null
    if (scope_type === "org" && !org_id) {
     
      return NextResponse.json({ ok: false, error: "org_not_found" }, { status: 400 })
    }

    let currency = "USD"
    let unit_price_ccy: number | null = null
    let total_ccy: number | null = null

    const snap = (body?.pricing_snapshot || null) as null | {
      currency?: string; unit_price_ccy?: number | null; total_ccy?: number | null
    }
    if (snap) {
      currency = String(snap.currency || "").trim().toUpperCase() || "USD"
      unit_price_ccy = snap.unit_price_ccy != null ? Number(snap.unit_price_ccy) : null
      total_ccy = snap.total_ccy != null ? Number(snap.total_ccy) : null 
    }

    if (!(total_ccy && total_ccy > 0 && currency === "USD")) {
      try {
        const pricingUrl = new URL(
          `/api/public/subscription-settings/price?scope_type=${encodeURIComponent(scope_type)}&credits=${encodeURIComponent(String(credits))}`,
          baseUrl
        ).toString()
       
        const resp = await fetch(pricingUrl, { cache: "no-store" })
        const data = await resp.json()
       
        if (!resp.ok) throw new Error(data?.error || "pricing_failed")
        currency = String(data?.currency || "USD").trim().toUpperCase()
        unit_price_ccy = data?.unit_price_ccy != null ? Number(data.unit_price_ccy) : null
        total_ccy = data?.total_ccy != null ? Number(data.total_ccy) : null
      } catch (e:any) {
        
        return NextResponse.json({ ok:false, error:"pricing_failed", detail:String(e?.message||e) }, { status:400 })
      }
    }

    if (String(currency).trim().toUpperCase() !== "USD") {
      
      return NextResponse.json({ ok:false, error:"currency_not_usd" }, { status:400 })
    }
    if (total_ccy == null) {
      
      return NextResponse.json({ ok:false, error:"total_ccy_missing" }, { status:400 })
    }

  const admin = (typeof (supabaseAdmin as any) === "function") ? await (supabaseAdmin as any)() : (supabaseAdmin as any)

   let tenant_id: string | null = null
   try {
      const { code } = resolveTenantFromHost(host)
   const { data: tenantRow } = await admin
      .from("tenants")
       .select("id")
      .eq("code", code)
       .maybeSingle()
     tenant_id = (tenantRow as any)?.id ?? null
    } catch {
      tenant_id = null
    }
    const amount_cents = Math.round(Number(total_ccy) * 100)
    const meta: any = { kind: "credit_purchase", credits, scope_type, unit_price_ccy }
    if (org_id) meta.org_id = org_id

    const ins = await admin
      .from("orders")
      .insert({
        tenant_id,
        user_id: user.id,
        amount: amount_cents,
        currency: "USD",
        status: "pending",
        provider: "paddle",
        meta,
      })
      .select("id")
      .single()

    if (ins.error || !ins.data?.id) {
  
      return NextResponse.json({ ok: false, error: "order_insert_failed", detail: ins.error?.message }, { status: 500 })
    }
    const orderId = String(ins.data.id)
  

    const returnUrl = new URL(`/checkout/${orderId}/return`, baseUrl).toString()
    const cancelUrl = new URL(`/checkout/${orderId}/cancel`, baseUrl).toString()
    const email = user.email || undefined
    const { transaction_id } = await createCheckoutViaTransaction({
      amountCents: amount_cents,
      currency: "USD",
      email,
      orderId,
      metadata: { scope_type, credits },
      returnUrl,
      cancelUrl,
      quantity: credits,
      productName: "Buy Credits",
    })

    try {
      // Şemanız NOT NULL 'action' istiyorsa, action alanını logAudit içinde doğru doldurun.
   await logAudit({
       action: "paddle_checkout_created",
       payload: { orderId, transaction_id, tenant_id, amount_cents, currency, credits, scope_type },
   })
    } catch(e) {

    }

    const env = getEnv()

    return NextResponse.json({
      ok: true,
      data: { gateway: "paddle", mode: "overlay", checkout_url: null, transaction_id, order_id: orderId, server_env: env.env },
      url: `/checkout/${orderId}`,
    })
  } catch (e: any) {
  
    return NextResponse.json({ ok: false, error: "with_credits_failed", detail: String(e?.message || e) }, { status: 500 })
  }
}
