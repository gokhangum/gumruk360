// app/api/ask/create/route.ts
import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import { supabaseAdmin } from "@/lib/supabaseAdmin"


function parseIntSafe(v: any, def=0) {
  const n = Number.parseInt(String(v), 10)
  return Number.isFinite(n) ? n : def
}
function clamp010(n: any) { return Math.max(0, Math.min(10, Number(n) || 0)) }

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const {
      title, description, isUrgent, pages = 0,
	  difficulty_score = 0,
      gpt_confidence   = 0,
      k_technical_difficulty = 0,
      k_expertise_required = 0,
      k_workload = 0,
      k_risk_level = 0,
      k_doc_review = 0,
      k_multi_docs = 0,
      k_foreign_language = 0,
      k_legal_refs = 0,
      k_calculation_need = 0,
      k_time_pressure = 0,
      k_data_cleaning = 0,
      k_cross_border = 0,
      k_industry_specific = 0,
      k_misc_complexity = 0,
	  est_hours,
      est_days_normal,
      est_days_urgent,
      total_score,
    } = body || {}

    if (!title || typeof title !== "string" || title.trim().length < 3) {
      return NextResponse.json({ ok: false, error: "title_too_short" }, { status: 400 })
    }

    // 1) Oturum
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get: async (name: string) => (await cookies()).get(name)?.value, } }
    )
    const { data: { user }, error: uerr } = await supabase.auth.getUser()
    if (uerr || !user) {
      return NextResponse.json({ ok: false, error: "session_not_found" }, { status: 401 })
    }

    // 2) Skorlar
    const scores = [
      clamp010(k_technical_difficulty),
      clamp010(k_expertise_required),
      clamp010(k_workload),
      clamp010(k_risk_level),
      clamp010(k_doc_review),
      clamp010(k_multi_docs),
      clamp010(k_foreign_language),
      clamp010(k_legal_refs),
      clamp010(k_calculation_need),
      clamp010(k_time_pressure),
      clamp010(k_data_cleaning),
      clamp010(k_cross_border),
      clamp010(k_industry_specific),
      clamp010(k_misc_complexity),
    ]
    const baseSum = scores.reduce((a,b)=>a+b,0) // 0..140
    const extra = Math.floor(parseIntSafe(pages)/10) // 10 sayfa ~ +1
    const totalScore = Math.max(0, Math.min(100, Math.round(((baseSum + extra) / 140) * 100)))

    // 3) İlk sipariş mi? (owner_id veya user_id)
    const { count, error: cntErr } = await supabaseAdmin
      .from("questions")
      .select("*", { count: "exact", head: true })
      .or(`owner_id.eq.${user.id},user_id.eq.${user.id}`)
    if (cntErr) {
      return NextResponse.json({ ok:false, error:"Sayaç okunamadı.", detail: cntErr.message, code: cntErr.code }, { status: 500 })
    }
    const isFirstOrder = (count || 0) === 0

    // 4) Fiyat (legacy endpoint: dış bağımlılığı kaldır — nötr pricing)
     const pricing = {
      estHours: 0,
      estDaysNormal: 0,
       estDaysUrgent: 0,
      baseHourly: 0,
     minFee: 0,
     priceRaw: 0,
      priceFinal: 0,
      firstTimeMultiplier: 1,
     urgentMultiplier: isUrgent ? 1.2 : 1,
      slaDueAt: new Date(),
    } as const

const insertPayload = {
  user_id: user.id,
  owner_id: user.id,
  title,
  description,
  is_urgent: !!isUrgent,
  pages: Number(pages) || 0,

  // Skor/metrik alanları
  difficulty_score: Number(difficulty_score) || 0,
  gpt_confidence:   Number(gpt_confidence)   || 0,

  k_technical_difficulty: Number(k_technical_difficulty) || 0,
  k_expertise_required:   Number(k_expertise_required)   || 0,
  k_workload:             Number(k_workload)             || 0,
  k_risk_level:           Number(k_risk_level)           || 0,
  k_doc_review:           Number(k_doc_review)           || 0,
  k_multi_docs:           Number(k_multi_docs)           || 0,
  k_foreign_language:     Number(k_foreign_language)     || 0,
  k_legal_refs:           Number(k_legal_refs)           || 0,
  k_calculation_need:     Number(k_calculation_need)     || 0,
  k_time_pressure:        Number(k_time_pressure)        || 0,
  k_data_cleaning:        Number(k_data_cleaning)        || 0,
  k_cross_border:         Number(k_cross_border)         || 0,
  k_industry_specific:    Number(k_industry_specific)    || 0,
  k_misc_complexity:      Number(k_misc_complexity)      || 0,

  ...(est_hours       !== undefined ? { est_hours:       Number(est_hours) } : {}),
  ...(est_days_normal !== undefined ? { est_days_normal: Number(est_days_normal) } : {}),
  ...(est_days_urgent !== undefined ? { est_days_urgent: Number(est_days_urgent) } : {}),
  ...(total_score     !== undefined ? { total_score:     Number(total_score) } : {}),

  // (mevcut kodunda olan diğer alanlar: price_tl, price_final_tl, currency, sla_due_at, pricing, assigned_to vs)
}
 const { data: q, error: qerr } = await supabaseAdmin
  .from("questions")
  .insert(insertPayload)
  .select("id, price_final_tl")
  .maybeSingle()
    if (qerr) {
      return NextResponse.json({ ok:false, error:"question_create_failed", detail: qerr.message, code: qerr.code }, { status: 500 })
    }
  // 5.1) USD/EUR/... gösterim ise kilit alanlarını yaz
  try {
    const { resolveTenantCurrency, fxBaseTry, computeLockedFromTRY } =
      await import("@/lib/fx/resolveTenantCurrency");

    // host fallback için Request header kullan
    const host = req.headers.get("host") ?? null;

    // 1) Kullanıcı tenant'ını çöz (öncelik: profiles.tenant_key -> tenants.code; fallback: host -> tenants.primary_domain)
    const resolved = await resolveTenantCurrency({ userId: user.id, host });
    const cur = (resolved?.currency ?? "TRY").toUpperCase();

    // Sadece TRY dışı ise (örn. USD/EUR/...) kilit yaz
    if (cur !== "TRY") {
      // 2) 1 BASE = ? TRY (TCMB)
      const { rate, asof } = await fxBaseTry(cur);
      if (Number.isFinite(rate) && rate > 0) {
        // 3) TL → BASE, multiplier uygula ve tamsayıya yuvarla
        const locked = computeLockedFromTRY({
          tryAmount: pricing.priceFinal,
          baseCurrency: cur,
          fxRateBaseTry: rate,
          multiplier: Number(resolved?.pricing_multiplier ?? 1),
        });

        // 4) Şimdilik USD alanlarını kullanıyoruz (talebin gereği)
        const patch: any = {
          price_final_usd: cur === "USD" ? locked : 0,
          price_usd_rate_used: cur === "USD" ? rate : null,
          price_usd_asof: cur === "USD" ? (asof ?? null) : null,
        };
     if (q?.id) {
         await supabaseAdmin.from("questions").update(patch).eq("id", q.id)
       }
      }
    }
  } catch (e) {
   
  }

    // 6) Audit
   if (q && q.id) {
      const { error: aerr } = await supabaseAdmin.from("audit_log").insert({
       actor_id: user.id,
       question_id: q.id,
       event_type: "created",
        data: {
        pricing,
         total_score: totalScore,
          pages: parseIntSafe(pages, 0),
          is_urgent: !!isUrgent,
          is_first_order: isFirstOrder
        }
      })
       if (aerr) throw aerr
    }

    return NextResponse.json({ ok: true, question: q, pricing }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ ok:false, error:"Beklenmeyen hata.", detail:String(e?.message || e) }, { status: 500 })
  }
}
