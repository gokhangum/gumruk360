// Clean final version — /api/ask/auto
// - Uses internal admin pricing API
// - Overrides hourly with worker's hourly_rate_tl via supabaseAdmin (service role)
// - No status filter
// - Debug log only when NODE_ENV !== 'production'
// - Response shape unchanged: { ok, question, pricing }

import { NextResponse } from "next/server"
import { supabaseAuthServer as supabaseAuth } from "@/lib/supabaseAuth"
import { supabaseServer } from "@/lib/supabaseServer"
import { supabaseAdmin } from "@/lib/supabase/serverAdmin"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function round50(n: number) { return Math.round(n / 50) * 50 }
 function toInt(v: any, def = 0) {
   const n = parseInt(String(v ?? ""), 10)
   return Number.isFinite(n) ? n : def
 }
 function clamp010(n: any) { return Math.max(0, Math.min(10, Number(n) || 0)) }
function pickDefaultOwnerForTenant(tenantCode: string | null, rawEnv?: string | null): string | null {
  if (!rawEnv) return null

  // Eski stil: tek UUID ise direkt dön
  if (!rawEnv.includes(":") && !rawEnv.includes(",")) {
    return rawEnv
  }

  const parts = rawEnv.split(",")

  // Tenant kodu yoksa (ör: local host eşleşmedi), multi formatta ilk geçerli UUID'i dön
  if (!tenantCode) {
    for (const part of parts) {
      const v = part.trim()
      if (!v) continue
      const idx = v.indexOf(":")
      if (idx === -1) continue
      const id = v.slice(idx + 1).trim()
      if (id && id.length >= 10) {
        return id
      }
    }
    return null
  }

  // Tenant kodu varsa: o koda karşılık gelen UUID'i bul
  for (const part of parts) {
    const v = part.trim()
    if (!v) continue
    const [code, id] = v.split(":").map(s => s.trim())
    if (!code || !id) continue
    if (code === tenantCode && id.length >= 10) {
      return id
    }
  }

  return null
}

 
async function callAdminPricing(origin: string, payload: any) {
  const base = process.env.INTERNAL_BASE_URL || origin
  const url = base.replace(/\/$/, "") + "/api/admin/gpt-pricing/estimate"

  const headers: Record<string,string> = { "content-type": "application/json" }
  const key = process.env.INTERNAL_API_KEY
  if (!key) throw Object.assign(new Error("INTERNAL_API_KEY missing"), { code: "missing_internal_key" })
  headers["x-internal-key"] = String(key)

  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload), cache: "no-store" })
  if (!res.ok) {
    const t = await res.text().catch(() => "")
    throw Object.assign(new Error("admin_gpt_module_unavailable: " + t), { code: "admin_gpt_module_unavailable" })
  }
  const data = await res.json()
  const details = data?.details ?? data
  if (!details || typeof details !== "object") {
    throw Object.assign(new Error("invalid_admin_response"), { code: "invalid_admin_response" })
  }
  return { details, price_final: data?.price_final ?? details?.price_final }
}

function normalizePricing(details: any, isUrgent: boolean) {
  const estHours = Number(details.hours) || 2
  const hourly = Number(details.hourly) || 1200
  const urgentMultiplierCfg = Number(details.urgent_multiplier ?? 1.5)
  const urgentMultiplier = isUrgent ? urgentMultiplierCfg : 1
  const minPrice = Number(details.min_price) || 1600

  const hoursPerDayNormal = Number(details.hours_per_day_normal) || 4
  const hoursPerDayUrgent = Number(details.hours_per_day_urgent) || 6

  const estDaysNormal = Number(details.normal_days) || Math.max(1, Math.ceil(estHours / hoursPerDayNormal))
  const estDaysUrgent = Number(details.urgent_days) || Math.max(1, Math.ceil(estHours / hoursPerDayUrgent))

  const raw = estHours * hourly * urgentMultiplier
  const priceRaw = Math.max(minPrice, raw)
  const priceFinal = Number(details.price_final) || Math.max(minPrice, round50(priceRaw))

// Target delivery: gün -> saat*24, yuvarlama yok. Baz zaman = pricing hesap anı (şimdi).
const totalHoursNormal = estDaysNormal * 24;
const totalHoursUrgent = estDaysUrgent * 24;
const hoursToAdd = isUrgent ? totalHoursUrgent : totalHoursNormal;
// Millisaniye eklerken en yakın milisaniyeye yuvarlama (süre hesabında saat yuvarlaması yok)
const due = new Date(Date.now() + Math.round(hoursToAdd * 60 * 60 * 1000));

  return {
    estHours,
    estDaysNormal,
    estDaysUrgent,
    baseHourly: hourly,
    minFee: minPrice,
    urgentMultiplier,
    priceRaw,
    priceFinal,
    slaDueAt: due.toISOString(),
  }
}

export async function POST(req: Request) {
  try {
    const origin = new URL(req.url).origin

    // Auth
    const auth = await supabaseAuth()
    const { data: u, error: ue } = await auth.auth.getUser()
    if (ue || !u?.user) return NextResponse.json({ ok:false, error:"auth_required" }, { status: 401 })
    const uid = u.user.id

    // Form
    const form = await req.formData()
    const title = String(form.get("title") || "").trim()
    const description = String(form.get("description") || "")
    const isUrgent = String(form.get("isUrgent") || "false") === "true"
    const pages = Math.max(0, parseInt(String(form.get("pages") ?? "0"), 10) || 0)
    const assignedToRaw = String(form.get("assignedTo") || "")
    const assignedTo = assignedToRaw && assignedToRaw.length >= 10 ? assignedToRaw : null
    const difficulty_score      = toInt(form.get("difficulty_score"), 0)
    const gpt_confidence        = toInt(form.get("gpt_confidence"), 0)
    const k_technical_difficulty= clamp010(form.get("k_technical_difficulty"))
    const k_expertise_required  = clamp010(form.get("k_expertise_required"))
    const k_workload            = clamp010(form.get("k_workload"))
    const k_risk_level          = clamp010(form.get("k_risk_level"))
    const k_doc_review          = clamp010(form.get("k_doc_review"))
    const k_multi_docs          = clamp010(form.get("k_multi_docs"))
    const k_foreign_language    = clamp010(form.get("k_foreign_language"))
    const k_legal_refs          = clamp010(form.get("k_legal_refs"))
    const k_calculation_need    = clamp010(form.get("k_calculation_need"))
    const k_time_pressure       = clamp010(form.get("k_time_pressure"))
    const k_data_cleaning       = clamp010(form.get("k_data_cleaning"))
    const k_cross_border        = clamp010(form.get("k_cross_border"))
    const k_industry_specific   = clamp010(form.get("k_industry_specific"))
    const k_misc_complexity     = clamp010(form.get("k_misc_complexity"))
    const est_hours             = toInt(form.get("est_hours"), 0)
    const est_days_normal       = toInt(form.get("est_days_normal"), 0)
    const est_days_urgent       = toInt(form.get("est_days_urgent"), 0)
    // Tenant-based default owner fallback (mapped by tenants.code -> user id)
   let defaultOwnerId: string | null = null
     if (!assignedTo) {
     try {
         const urlObj = new URL(req.url)
        const rawHost = (req.headers.get("x-forwarded-host") || urlObj.host || "").toLowerCase()
         let host = rawHost.trim()
         // Birden fazla değer geldiyse (x-forwarded-host: "a.com, b.com") ilkini al
       if (host.includes(",")) host = host.split(",")[0].trim()
       // Port’u at (aaa.com:3000 -> aaa.com)
         if (host.includes(":")) host = host.split(":")[0]
        // Basit IPv6 normalizasyonu (lib/tenant.ts ile uyumlu)
         if (host.startsWith("[") && host.includes("]")) {
          const end = host.indexOf("]")
          host = host.slice(1, end) + host.slice(end + 1)
       }
 
       const { data: td, error: tdErr } = await supabaseAdmin
          .from("tenant_domains")
           .select("host, tenant_id, tenants:tenant_id ( code )")
         .eq("host", host)
          .maybeSingle()

         if (!tdErr) {
          const tenantCode = (td as any)?.tenants?.code ?? null
          defaultOwnerId = pickDefaultOwnerForTenant(
             tenantCode,
           process.env.DEFAULT_QUESTION_OWNER_ID ?? null,
           )
         }
       } catch {
        // Sessiz fallback: defaultOwnerId null kalır, altta global env fallback’i de var
       }
     }

    // Admin GPT pricing
	    // Form'daki dosyalardan attachmentsMeta üret
    const filesField = form.getAll("files") || []
    const attachmentsMeta = filesField
      .map((f: any) => ({
        name: String((f as any)?.name || ""),
        size: Number((f as any)?.size || 0),
        type: String((f as any)?.type || "") || "application/octet-stream",
      }))
      .filter(m => m.name)

    const questionForGpt = [title, description].map(v => v.trim()).filter(Boolean).join("\n\n")
    const payload = { question: questionForGpt, isUrgent, attachmentsMeta }
    const { details } = await callAdminPricing(origin, payload)

    // Hourly override (worker -> pricing_versions -> admin default)
    let hourlyFromSelection: number | null = null
    let workerHourlyRead: number | null = null
    let activeBaseHourlyRead: number | null = null
    let hourlySource: "worker" | "pricing_versions" | "admin_default" | null = null

    try {
      const sb = await supabaseServer()

      if (assignedTo) {
        const { data: wprof, error: werr } = await supabaseAdmin
          .from("worker_cv_profiles")
          .select("hourly_rate_tl")
          .eq("worker_user_id", assignedTo)
          .maybeSingle()
        if (!werr) {
          const hv = Number(wprof?.hourly_rate_tl)
          workerHourlyRead = Number.isFinite(hv) ? hv : null
          if (workerHourlyRead != null && workerHourlyRead > 0) {
            hourlyFromSelection = workerHourlyRead
            hourlySource = "worker"
          }
        }
      }

      if (hourlyFromSelection == null) {
        const { data: pv, error: perr } = await sb
          .from("pricing_versions")
          .select("base_hourly_rate")
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
        if (!perr) {
          const hv = Number(pv?.base_hourly_rate)
          activeBaseHourlyRead = Number.isFinite(hv) ? hv : null
          if (activeBaseHourlyRead != null && activeBaseHourlyRead > 0) {
            hourlyFromSelection = activeBaseHourlyRead
            hourlySource = "pricing_versions"
          }
        }
      }

      if (hourlyFromSelection != null) {
        details.hourly = hourlyFromSelection
      } else {
        hourlySource = "admin_default"
      }
    } catch {}

    const finalHourly = Number(details?.hourly ?? NaN) || null
    if (process.env.NODE_ENV !== "production") {
      try {
       
      } catch {}
    }

    // Normalize & DB insert
    const pricing = normalizePricing(details, isUrgent)
    const estHoursInt = Math.round(Number(pricing.estHours) || 0)
    const estDaysNormalInt = Math.round(Number(pricing.estDaysNormal) || 0)
    const estDaysUrgentInt = Math.round(Number(pricing.estDaysUrgent) || 0)
    const priceRawInt = Math.round(Number(pricing.priceRaw) || 0)
    const priceFinalInt = Math.round(Number(pricing.priceFinal) || 0)

    const sb = await supabaseServer()
    const insertRow = {
      title,
      description,
      user_id: uid,
      is_urgent: isUrgent,
      pages,
     est_hours: (est_hours || estHoursInt),
      est_days_normal: (est_days_normal || estDaysNormalInt),
      est_days_urgent: (est_days_urgent || estDaysUrgentInt),
      price_tl: priceRawInt,
      price_final_tl: priceFinalInt,
      currency: "TRY",
      sla_due_at: pricing.slaDueAt,
      pricing,
      assigned_to:
        assignedTo
        ?? defaultOwnerId
        ?? pickDefaultOwnerForTenant(null, process.env.DEFAULT_QUESTION_OWNER_ID ?? null),
	       difficulty_score,
      gpt_confidence,
      k_technical_difficulty,
      k_expertise_required,
      k_workload,
      k_risk_level,
      k_doc_review,
      k_multi_docs,
      k_foreign_language,
      k_legal_refs,
      k_calculation_need,
      k_time_pressure,
      k_data_cleaning,
      k_cross_border,
      k_industry_specific,
      k_misc_complexity,
    }
    const { data: q, error } = await sb.from("questions").insert([insertRow]).select("id").maybeSingle()
    if (error) return NextResponse.json({ ok:false, error:error.message }, { status: 400 })
		// [EKLE] — Snapshot yaz ve işaretçiyi iliştir
try {
  const perMap = (details as any)?.perCriterion_map ?? {};
  const snapRow: any = {
    question_id: q?.id,
    pricing_version_id: (details as any)?.version_id ?? null,
    is_urgent: !!isUrgent,

    est_hours: Number(details?.hours ?? null),
    normal_days: Number(details?.normal_days ?? null),
    urgent_days: Number(details?.urgent_days ?? null),
    hours_per_day_normal: Number(details?.hours_per_day_normal ?? null),
    hours_per_day_urgent: Number(details?.hours_per_day_urgent ?? null),

    base_hourly_tl: Number(details?.hourly ?? null),
    min_price_tl: Number(details?.min_price ?? null),
    rounding_step: Number(details?.rounding_step ?? null),
    urgent_multiplier: Number(details?.urgent_multiplier ?? null),

    price_normal_tl: Number(details?.price_normal ?? null),
    price_urgent_tl: Number(details?.price_urgent ?? null),
    // details.price_final varsa onu, yoksa insertRow.price_final_tl'yi kullan
    price_final_tl: (details?.price_final ?? insertRow?.price_final_tl ?? null),

    // Stabil k_* kolonları (0..10)
    k_technical_difficulty: toInt(perMap?.k_technical_difficulty, 0),
    k_expertise_required:   toInt(perMap?.k_expertise_required,   0),
    k_workload:             toInt(perMap?.k_workload,             0),
    k_risk_level:           toInt(perMap?.k_risk_level,           0),
    k_doc_review:           toInt(perMap?.k_doc_review,           0),
    k_multi_docs:           toInt(perMap?.k_multi_docs,           0),
    k_foreign_language:     toInt(perMap?.k_foreign_language,     0),
    k_legal_refs:           toInt(perMap?.k_legal_refs,           0),
    k_calculation_need:     toInt(perMap?.k_calculation_need,     0),
    k_time_pressure:        toInt(perMap?.k_time_pressure,        0),
    k_data_cleaning:        toInt(perMap?.k_data_cleaning,        0),
    k_cross_border:         toInt(perMap?.k_cross_border,         0),
    k_industry_specific:    toInt(perMap?.k_industry_specific,    0),
    k_misc_complexity:      toInt(perMap?.k_misc_complexity,      0),

    details_json: (details ?? null),
    per_criterion: (details as any)?.perCriterion ?? null,
    per_criterion_map: perMap ?? null,
  };

  const { data: snap, error: snapErr } =
    await supabaseAdmin.from("question_pricing_estimates").insert([snapRow]).select("id").maybeSingle();
if (snapErr) console.error("SNAP_ERR_insert_snapshot", snapErr);
  if (!snapErr && snap?.id && q?.id) {
    await sb.from("questions")
      .update({ last_pricing_estimate_id: snap.id })
      .eq("id", q.id);
  }
} catch (e) {
   console.error("SNAP_EXCEPTION", e);
 }

    // 5.1) USD/EUR/... gösterim ise kilit alanlarını yaz
    try {
      const { resolveTenantCurrency, fxBaseTry, computeLockedFromTRY } =
        await import("@/lib/fx/resolveTenantCurrency");
      const { headers } = await import("next/headers");
      const host = (await headers()).get("host") ?? null;

      // Not: burada auth kullanıcısı 'uid' olarak üstte tanımlıdır (insertRow.owner_id / user_id ile aynı)
      const resolved = await resolveTenantCurrency({ userId: uid, host });
      const cur = (resolved?.currency ?? "TRY").toUpperCase();

      if (cur !== "TRY") {
        const { rate, asof } = await fxBaseTry(cur);
        if (Number.isFinite(rate) && rate > 0) {
          const locked = computeLockedFromTRY({
            tryAmount: priceFinalInt, // insertRow.price_final_tl
            baseCurrency: cur,
            fxRateBaseTry: rate,
            multiplier: Number(resolved?.pricing_multiplier ?? 1),
          });

          const patch: any = {
            price_final_usd: cur === "USD" ? locked : 0,
            price_usd_rate_used: cur === "USD" ? rate : null,
            price_usd_asof: cur === "USD" ? (asof ?? null) : null,
          };

       if (q?.id) {
       await sb.from("questions").update(patch).eq("id", q.id);
     }

        }
      }
    } catch (e) {
      
    }

    return NextResponse.json({ ok: true, question: q, pricing })
  } catch (e: any) {
    return NextResponse.json({ ok:false, error:String(e?.message || e) }, { status: 500 })
  }
}
