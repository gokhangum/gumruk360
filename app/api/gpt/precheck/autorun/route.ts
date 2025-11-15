// app/api/gpt/precheck/autorun/route.ts
/* Autorun: L1 → (L2) zinciri
 * strictness=0 iken L2 tamamen kapatılır (çağrılmaz), passed döner.
 * Yanıt: { ok, status, confidence, result, l1, l2, auto:{ l2Enabled, l2Pass, ... } }
 */
import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { supabaseAdmin } from "@/lib/supabase/serverAdmin"
import { APP_DOMAINS } from "@/lib/config/appEnv";
function getBaseURL(h: Headers) {
  const proto = h.get("x-forwarded-proto") || "http"
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000"
  return `${proto}://${host}`
}

function detectDomain(h: Headers) {
  const host = h.get("x-forwarded-host") || h.get("host") || ""
  return host.split(":")[0] || APP_DOMAINS.primary
}

type L2Policy = { mode: "required_only"|"required_and_should", should_max: number, strictness: number }

async function getL2Policy(domain: string, locale: string): Promise<L2Policy> {
  try {
    const { data, error } = await supabaseAdmin
      .from("gpt_precheck_settings")
      .select("l2_pass_policy, l2_strictness")
      .eq("domain", domain)
      .eq("locale", locale)
      .maybeSingle()
    if (error) throw error
    const pp = (data?.l2_pass_policy as any) || { mode: "required_only", should_max: 0 }
    const mode: "required_only"|"required_and_should" = (pp?.mode === "required_and_should") ? "required_and_should" : "required_only"
    const should_max = (typeof pp?.should_max === "number" && pp.should_max >= 0) ? Math.floor(pp.should_max) : 0
    const strictness = (typeof data?.l2_strictness === "number") ? Math.max(0, Math.min(3, Math.floor(data.l2_strictness))) : 1
    return { mode, should_max, strictness }
  } catch {
    return { mode: "required_only", should_max: 0, strictness: 1 }
  }
}

function extractMissing(l2: any) {
  return (l2?.result?.missing || l2?.result?.groups || l2?.result?.items || { required: [], should: [], info: [] })
}

function computeCounts(missing: any) {
  const req = Array.isArray(missing?.required) ? missing.required.length : 0
  const sh  = Array.isArray(missing?.should)   ? missing.should.length   : 0
  const inf = Array.isArray(missing?.info)     ? missing.info.length     : 0
  return { required: req, should: sh, info: inf }
}

function computePass(counts: {required:number, should:number}, policy: {mode:"required_only"|"required_and_should", should_max:number}) {
  if (policy.mode === "required_and_should") return counts.required === 0 && counts.should <= policy.should_max
  return counts.required === 0
}

function transformByStrictness(missing: any, strictness: number) {
  const m = {
    required: Array.isArray(missing?.required) ? [...missing.required] : [],
    should: Array.isArray(missing?.should) ? [...missing.should] : [],
    info: Array.isArray(missing?.info) ? [...missing.info] : [],
  }
  let promoted = 0
  if (strictness <= 1) return { ...m, promoted }
  if (strictness >= 3) {
    promoted = m.should.length
    m.required.push(...m.should)
    m.should = []
    return { ...m, promoted }
  }
  // strictness == 2
  const critical = /(teknik|technical|çizim|drawing|tolerans|datasheet|broşür|brosur|catalog|katalog|spec|şartname|sartname|foto|photo|msds|coo|origin|menş|mense|certificate|sertifika)/i
  const keep: any[] = []
  for (const it of m.should) {
    const text = `${it?.key||""} ${it?.label_tr||""} ${it?.label_en||""}`
    if (critical.test(text)) { m.required.push(it); promoted++ } else { keep.push(it) }
  }
  m.should = keep
  return { ...m, promoted }
}

export async function POST(req: Request) {
  const h = await headers()
  const base = getBaseURL(h)
  try {
    const body = await req.json().catch(() => ({}))
    const question_id: string | undefined = body?.question_id
    const locale: 'tr'|'en' = (body?.locale === 'en') ? 'en' : 'tr'
    if (!question_id) {
      return NextResponse.json({ ok: false, status: "error", error: "MISSING_INPUT", detail: "question_id gereklidir." })
    }

    // 1) L1
    let l1Json: any = null
    try {
      const l1Res = await fetch(`${base}/api/gpt/precheck/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question_id, locale }),
        cache: "no-store",
      })
      l1Json = await l1Res.json().catch(() => ({}))
      if (!l1Res.ok || !l1Json?.ok) {
        return NextResponse.json({ ok: false, status: "error", error: "L1_FAILED", l1: l1Json || null })
      }
    } catch (e:any) {
      return NextResponse.json({ ok: false, status: "error", error: "L1_EXCEPTION", detail: String(e?.message || e) })
    }

    const top: any = {
      ok: true,
      status: l1Json?.status || "ok",
      confidence: l1Json?.confidence ?? 0,
      result: l1Json?.result || null,
      l1: l1Json,
      l2: null,
      auto: {}
    }

    // 1.5) POLICY & STRICTNESS
    const domain = detectDomain(h)
    const policy = await getL2Policy(domain, locale)

    // STRICTNESS=0 → L2 kapalı, kısa devre
    if (policy.strictness === 0) {
      top.auto = {
        l2Enabled: false,
        l2Pass: true,
        l2Counts: { required: 0, should: 0, info: 0 },
        l2Policy: policy,
        l2PolicyEffective: policy,
        l2PromotedCount: 0,
        l2MissingEffective: { required: [], should: [], info: [] }
      }
      return NextResponse.json(top)
    }

    // 2) L2 (çalıştır)
    let l2Json: any = null
    try {
      const l2Res = await fetch(`${base}/api/gpt/precheck/l2`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question_id, locale }),
        cache: "no-store",
      })
      l2Json = await l2Res.json().catch(() => ({}))
      top.l2 = l2Json
    } catch (e:any) {
      top.l2 = { ok: false, status: "error", error: "L2_EXCEPTION", detail: String(e?.message || e) }
    }

    // 2.5) SIKILIK TERFİSİ + GEÇME HESABI
    try {
      const originalMissing = extractMissing(top.l2)
      const t = transformByStrictness(originalMissing, policy.strictness)
      const effMissing = { required: t.required, should: t.should, info: t.info }
      const effCounts = computeCounts(effMissing)
      const l2Pass = computePass(effCounts, policy)
      top.auto = {
        ...(top.auto || {}),
        l2Enabled: true,
        l2Pass,
        l2Counts: effCounts,
        l2Policy: policy,
        l2PolicyEffective: policy,
        l2PromotedCount: t.promoted || 0,
        l2MissingEffective: effMissing
      }
    } catch {}

    return NextResponse.json(top)
  } catch (e:any) {
    return NextResponse.json({ ok: false, status: "error", error: "AUTORUN_ERROR", detail: String(e?.message || e) })
  }
}
