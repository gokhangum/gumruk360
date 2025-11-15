// app/api/payments/paytr/with-credits/route.ts
import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/serverAdmin"
import { supabaseServer } from "@/lib/supabase/server"
import { resolveTenantFromHost } from "@/lib/tenant"
import { logAudit } from "@/lib/audit"
import { GET as PriceGET } from "@/app/api/public/subscription-settings/price/route"
export const runtime = "nodejs"

async function getPrimaryOrgId(supabase: Awaited<ReturnType<typeof supabaseServer>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: rows } = await supabase
    .from("organization_members")
    .select("org_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1);
  return rows && rows[0] ? rows[0].org_id : null;
}

export async function POST(req: Request) {
  try {
    const origin = new URL(req.url).origin
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || origin
 const host = new URL(baseUrl).host
 const cookie = req.headers.get("cookie") ?? ""
    const body = await req.json().catch(() => ({} as any))
    const credits = Number(body?.credits || 0)
    const scopeTypeRaw = String(body?.scope_type || "user")
    const scope_type: "user" | "org" = scopeTypeRaw === "org" ? "org" : "user"

    if (!credits || credits <= 0) {
      return NextResponse.json({ ok:false, error:"invalid_credits" }, { status: 400 })
    }

    const supabase = await supabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok:false, error:"unauthorized" }, { status: 401 })

    const org_id = scope_type === "org" ? await getPrimaryOrgId(supabase) : null
    if (scope_type === "org" && !org_id) {
      return NextResponse.json({ ok:false, error:"org_not_found" }, { status: 400 })
    }

     let unit_price_lira: number | null = null
     let totalLiraFinal: number | null = null
     try {
       const pricingUrl = new URL(
         `/api/public/subscription-settings/price?scope_type=${encodeURIComponent(scope_type)}&credits=${encodeURIComponent(String(credits))}`,
         baseUrl
       ).toString()
 
       // Aynı route'un GET fonksiyonunu doğrudan çağırıyoruz (network yok).
       const resp = await PriceGET(new Request(pricingUrl, { headers: { cookie } }))
       let priceJson: any = {}
       try {
         priceJson = await resp.json()
       } catch {
         priceJson = {}
       }
 
       unit_price_lira =
         (typeof priceJson?.unit_price_lira === "number") ? priceJson.unit_price_lira :
         (typeof priceJson?.data?.unit_price_lira === "number") ? priceJson.data.unit_price_lira :
         null
 
       const total_lira: number | null =
         (typeof priceJson?.total_lira === "number") ? priceJson.total_lira :
         (typeof priceJson?.data?.total_lira === "number") ? priceJson.data.total_lira :
         null

       totalLiraFinal = (total_lira == null && unit_price_lira != null) ? (unit_price_lira * credits) : total_lira
 
       if (!resp.ok || totalLiraFinal == null) {
         return NextResponse.json({ ok:false, error:"pricing_failed", detail: "price endpoint missing total_lira" }, { status: 400 })
       }
     } catch (err:any) {
       return NextResponse.json({ ok:false, error:"pricing_failed", detail: String(err?.message || err) }, { status: 400 })
     }


    const total_kurus = Math.round(totalLiraFinal * 100)

    // Tenant
    const tenant = await (async () => { try { return await resolveTenantFromHost(host) } catch { return null } })()
    const tenant_id = (tenant as any)?.id ?? null

    // Create order (pending)
    const meta: any = { kind:"credit_purchase", credits, scope_type }
    if (org_id) meta.org_id = org_id
    if (typeof unit_price_lira === "number") meta.unit_price_lira = unit_price_lira
     const admin = (typeof (supabaseAdmin as any) === "function") ? await (supabaseAdmin as any)() : (supabaseAdmin as any)
     const ins = await admin
       .from("orders")
      .insert({
        tenant_id,
        user_id: user.id,
        amount: total_kurus,
        currency: "TRY",
        status: "pending",
        provider: "paytr",
        provider_ref: null,
        meta,
      } as any)
      .select("id")
      .single()

    if (ins.error || !ins.data?.id) {
   return NextResponse.json({ ok:false, error:"order_insert_failed", detail: ins.error?.message ?? null }, { status: 500 })

    }

    const orderId: string = ins.data.id

    // Audit (resource_type NOT NULL zorunlu)
try {
      await logAudit({
       user_id: user.id,
      action: "credits.order_created",
       payload: {
         tenant_id,
        resource_type: "order",
         resource_id: orderId,
          order_id: orderId,
          credits,
        total_kurus,
         scope_type,
         org_id,
          unit_price_lira,
       },
      })
  } catch {}

    // Redirect to checkout
    const url = `/checkout/${orderId}`
    return NextResponse.json({
      ok: true,
      data: { gateway:"paytr", mode:"iframe", token:null, order_id: orderId },
      url
    }, { status: 200 })
  } catch (e:any) {
    return NextResponse.json({ ok:false, error:"with_credits_failed", detail: String(e?.message || e) }, { status: 500 })
  }
}
