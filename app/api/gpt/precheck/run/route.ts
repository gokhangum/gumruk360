/* app/api/gpt/precheck/run/route.ts
 * Katman-1 Precheck API
 * - Input: { question_id: string, text?: string, locale?: 'tr'|'en' }
 * - Output: { ok, status: 'passed'|'meaningless'|'non_customs'|'error', confidence, result }
 * - Side effects:
 *    - Updates public.questions: precheck_result, precheck_status, precheck_confidence, precheck_topics
 *    - Inserts into public.audit_logs with event='precheck.run'
 *
 * Not: Mevcut işleyiş, layout veya butonlara dokunmaz. Sadece yeni endpoint.
 */

import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { supabaseAdmin } from "@/lib/supabase/serverAdmin"

type PrecheckResp = {
  is_meaningful: boolean
  is_customs_related: boolean
  confidence: number // 0..1 tercih edildi
  topics?: string[]
  reasoning?: string
}

const DEFAULT_THRESHOLDS = {
  meaningful_confidence_min: 0.70,
  customs_related_confidence_min: 0.70,
}

async function callOpenAIForPrecheck(questionText: string, locale: 'tr'|'en'|'auto' = 'auto'): Promise<PrecheckResp> {
  // Basit ve güvenli bir JSON çıktı şablonu isteyen prompt.
  // OpenAI SDK import edilmeden fetch ile çağırıyoruz (vendor lock azaltımı).
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set")

 const system =

"You are a customs consultant. Evaluate whether the user's question is (i) meaningful and (ii) related to customs regulations. Return only JSON. Keep the response strictly as a JSON object without any extra text.";

  const user = `Question:
${questionText}

Return a STRICT JSON object with keys: is_meaningful (boolean), is_customs_related (boolean), confidence (number 0..1), topics (string[]), reasoning (string). Do not include extra text.`

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ]
    })
  })

  if (!resp.ok) {
    const err = await resp.text().catch(() => "")
    throw new Error(`OpenAI error: ${resp.status} ${err}`)
  }
  const data = await resp.json()
  const content = data?.choices?.[0]?.message?.content || "{}"
  let parsed: any
  try { parsed = JSON.parse(content) } catch {
    // Eski modeller bazen JSON dışına çıkar; minimum default.
    parsed = { is_meaningful: true, is_customs_related: true, confidence: 1.0, topics: [] }
  }
  return {
    is_meaningful: !!parsed.is_meaningful,
    is_customs_related: !!parsed.is_customs_related,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
    topics: Array.isArray(parsed.topics) ? parsed.topics.filter((x: any) => typeof x === "string") : undefined,
    reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : undefined,
  }
}

export async function POST(req: Request) {
  const h = await headers()
  const ua = h.get("user-agent") || undefined
  const ip = h.get("x-forwarded-for") || h.get("cf-connecting-ip") || undefined

  try {
    const body = await req.json().catch(() => ({}))
    const question_id: string | undefined = body?.question_id
    const text: string | undefined = body?.text
    const locale: 'tr'|'en'|'auto' = body?.locale || 'auto'

    if (!question_id && !text) {
      return NextResponse.json({ ok: false, error: "MISSING_INPUT", detail: "question_id veya text gereklidir." }, { status: 400 })
    }

    const supa = supabaseAdmin

    // Soru metni yoksa DB'den çek
    let qText = text
    if (!qText && question_id) {
      const { data: qrow, error: qerr } = await supa
        .from("questions")
        .select("id, title, description")
        .eq("id", question_id)
        .maybeSingle()
      if (qerr) throw qerr
      if (!qrow) return NextResponse.json({ ok: false, error: "NOT_FOUND", detail: "Question not found." }, { status: 404 })
      qText = (qrow.description || qrow.title || "").trim()
    }

    if (!qText) {
      return NextResponse.json({ ok: false, error: "EMPTY_TEXT", detail: "empty_text" }, { status: 400 })
    }

    // Feature flag: kapalıysa doğrudan passed
    if (process.env.PRECHECK_V1_ENABLED === "false") {
      if (question_id) {
        await supa.from("questions").update({
          precheck_result: { skipped: true, reason: "flag_off" },
          precheck_status: "passed",
          precheck_confidence: 1.0,
          precheck_topics: null,
        }).eq("id", question_id)
        await supa.from("audit_logs").insert({
          event: "precheck.run",
          resource_type: "question",
          resource_id: question_id,
          question_id: question_id,
          payload: { skipped: true, reason: "flag_off" },
          ip, user_agent: ua,
          actor_role: "system",
          action: "run",
        })
      }
      return NextResponse.json({ ok: true, status: "passed", confidence: 1.0, result: { skipped: true } })
    }

    // OpenAI çağrısı
    const ai = await callOpenAIForPrecheck(qText!, locale)

    // Eşikler (ileride admin tablosundan okunacak)
    const thresholds = DEFAULT_THRESHOLDS

    let status: "passed"|"meaningless"|"non_customs"
    if (!ai.is_meaningful || ai.confidence < thresholds.meaningful_confidence_min) {
      status = "meaningless"
    } else if (!ai.is_customs_related || ai.confidence < thresholds.customs_related_confidence_min) {
      status = "non_customs"
    } else {
      status = "passed"
    }

    // DB yazımı (varsa)
    if (question_id) {
      await supa.from("questions").update({
        precheck_result: ai,
        precheck_status: status,
        precheck_confidence: ai.confidence,
        precheck_topics: ai.topics || null,
      }).eq("id", question_id)
      await supa.from("audit_logs").insert({
        event: "precheck.run",
        resource_type: "question",
        resource_id: question_id,
        question_id: question_id,
        payload: { thresholds, ai, status },
        ip, user_agent: ua,
        actor_role: "system",
        action: "run",
      })
    }

    return NextResponse.json({ ok: true, status, confidence: ai.confidence, result: ai })
  } catch (e: any) {
    // Hata durumunda audit (question_id varsa)
    try {
      const body = await req.json().catch(() => ({}))
      const question_id = body?.question_id
      if (question_id) {
        await supabaseAdmin.from("audit_logs").insert({
          event: "precheck.run",
          resource_type: "question",
          resource_id: question_id,
          question_id: question_id,
          payload: { error: String(e?.message || e) },
          ip, user_agent: ua,
          actor_role: "system",
          action: "error",
        })
        await supabaseAdmin.from("questions").update({
          precheck_result: { error: String(e?.message || e) },
          precheck_status: "error",
          precheck_confidence: null,
          precheck_topics: null,
        }).eq("id", question_id)
      }
    } catch {}
    return NextResponse.json({ ok: false, error: "PRECHECK_ERROR", detail: String(e?.message || e) }, { status: 500 })
  }
}
