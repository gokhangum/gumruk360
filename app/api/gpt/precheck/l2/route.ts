/* app/api/gpt/precheck/l2/route.ts
 * Katman-2 (Eksik Bilgi/Belge) Precheck API
 * - Input (POST): { question_id: string, locale?: 'tr'|'en' }
 * - Output: { ok, status: 'ok'|'error', result }
 * - Side effects:
 *    - Updates public.questions.precheck_result JSONB (merges "level2" düğümü)
 *    - Inserts into public.audit_logs with event='precheck.l2.run'
 *
 * Not: Mevcut layout/akışa dokunmaz. Tek başına çağrılabilir.
 */

import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { supabaseAdmin } from "@/lib/supabase/serverAdmin"
import { APP_DOMAINS } from "@/lib/config/appEnv";
// --- Apply visibility settings for L2 groups ---

async function applyL2Visibility(domain: string, locale: string, result: any) {
  try {
    const { data: s } = await supabaseAdmin
      .from("gpt_precheck_settings")
      .select("l2_visible_groups")
      .eq("domain", domain)
      .eq("locale", locale)
      .maybeSingle();

    const vg = s?.l2_visible_groups || { required: true, should: true, info: true };

    // Normalize helper to clear various shapes
    function clearGroup(res: any, key: 'required'|'should'|'info') {
      if (!res) return;
      // shape A: result.required/should/info
      if (Array.isArray(res[key])) res[key] = [];
      // shape B: result.groups.required/should/info
      if (res.groups && Array.isArray(res.groups[key])) res.groups[key] = [];
      // shape C: result.missing.required/should/info
      if (res.missing && Array.isArray(res.missing[key])) res.missing[key] = [];
      // shape D: result.items?.[key]
      if (res.items && Array.isArray(res.items[key])) res.items[key] = [];
    }

    if (result) {
      if (vg.required === false) clearGroup(result, 'required');
      if (vg.should === false) clearGroup(result, 'should');
      if (vg.info === false) clearGroup(result, 'info');
    }
  } catch {}
}


type L2Result = {
  status: 'ok'|'error',
  confidence?: number|null,
  missing?: {
    required: Array<{ key: string, label_tr?: string, label_en?: string, reason_tr?: string, reason_en?: string, source?: string }>,
    should: Array<{ key: string, label_tr?: string, label_en?: string, reason_tr?: string, reason_en?: string, source?: string }>,
    info: Array<{ key: string, label_tr?: string, label_en?: string, reason_tr?: string, reason_en?: string, source?: string }>,
  },
  notes_to_pricing?: string|null,
  attachments_scan?: Record<string, any> | null,
  reasoning?: string | null
}

function detectDomain(h: Headers) {
  const host = h.get("x-forwarded-host") || h.get("host") || ""
  return host.split(":")[0] || APP_DOMAINS.primary
}

async function getSettings(domain: string, locale: 'tr'|'en'|'auto') {
   const loc = (locale === 'auto')
     ? (APP_DOMAINS.en && domain.endsWith(APP_DOMAINS.en) ? "en" : "tr")
     : locale
  const { data, error } = await supabaseAdmin
    .from("gpt_precheck_settings")
    .select("*")
    .eq("domain", domain)
    .eq("locale", loc)
    .maybeSingle()
  if (error) throw error
  return { settings: data, locale: loc as 'tr'|'en' }
}

const DEFAULT_PROMPT_TR = `
AŞAĞIDAKİ GÖREVİ KESİNLİKLE SADECE JSON ÜRETEREK YAP.
Sen bir gümrük danışmanısın. Kullanıcının sorusu ve ekleri verilecek.
Amacın: Sorunun gümrük açısından **cevap üretmek için** gerekli bilgi/belge/unsurlarının **tam olup olmadığını** serbestçe değerlendirmek;
eksikleri önem derecesine göre üç gruba ayırmak:
- "required": Eksikse cevap sağlıklı üretilemez (mutlaka tamamlanmalı)
- "should": Eksikse olur ama tamamlanırsa kalite/sürat artar
- "info": Bilgilendirici/nice-to-have

Tamamen kendi uzmanlığınla karar ver. Konu-spesifik sabit bir kontrol listesine bağlı kalma.
Soru metninden ve varsa eklerden yararlan. Varsayımlardan kaçın. Somut eksikleri işaretle.

SADECE şu JSON yapısını döndür (başka metin yazma):
{
  "status": "ok",
  "confidence": <0..1>,
  "missing": {
    "required": [ { "key": "origin", "label_tr": "Menşe", "label_en": "Country of origin", "reason_tr": "GTİP/vergi rejimi için zorunlu", "reason_en": "Needed for HS/duty regime", "source": "text|attachment:filename#page" } ],
    "should": [],
    "info": []
  },
  "notes_to_pricing": "",
  "attachments_scan": {},
  "reasoning": ""
}`.trim()

const DEFAULT_PROMPT_EN = `
STRICTLY OUTPUT JSON ONLY.
You are a customs consultant. Given the user's question and any attachments,
decide whether the information/documents are sufficient to produce a reliable customs answer.
Freely assess and categorize *missing* items into three groups by your best judgement (no fixed checklist):
- "required": Without these, a reliable answer cannot be produced.
- "should": Helpful and quality/speed would improve.
- "info": Nice-to-have informational items.

Avoid assumptions; point to concrete gaps from text or attachments when possible.

Return ONLY this JSON shape (no extra text):
{
  "status": "ok",
  "confidence": <0..1>,
  "missing": {
    "required": [ { "key": "origin", "label_tr": "Menşe", "label_en": "Country of origin", "reason_tr": "GTİP/vergi regime", "reason_en": "Needed for HS/duty regime", "source": "text|attachment:filename#page" } ],
    "should": [],
    "info": []
  },
  "notes_to_pricing": "",
  "attachments_scan": {},
  "reasoning": ""
}`.trim()

async function callOpenAIForL2(prompt: string, questionText: string, locale: 'tr'|'en') : Promise<L2Result> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set")

  const system = (locale === 'tr')
    ? "Sadece JSON üreten yardımcı. JSON dışı hiçbir şey yazma."
    : "You return ONLY JSON. Do not add any extra text."

  const user = `${prompt}

### INPUT QUESTION:
${questionText}`

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
        { role: "user", content: user }
      ]
    })
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`OPENAI_ERROR: ${text}`)
  }
  const j = await resp.json()
  const content = j?.choices?.[0]?.message?.content ?? "{}"
  let parsed: any = {}
  try {
    parsed = JSON.parse(content)
  } catch {
    // parse error → minimal safe object
    parsed = { status: "error", reasoning: "JSON_PARSE_ERROR" }
  }

  // normalize
  const norm: L2Result = {
    status: (parsed?.status === "ok") ? "ok" : "error",
    confidence: typeof parsed?.confidence === "number" ? parsed.confidence : null,
    missing: {
      required: Array.isArray(parsed?.missing?.required) ? parsed.missing.required : [],
      should: Array.isArray(parsed?.missing?.should) ? parsed.missing.should : [],
      info: Array.isArray(parsed?.missing?.info) ? parsed.missing.info : [],
    },
    notes_to_pricing: parsed?.notes_to_pricing ?? null,
    attachments_scan: parsed?.attachments_scan ?? null,
    reasoning: typeof parsed?.reasoning === "string" ? parsed.reasoning : null,
  }
  return norm
}

export async function POST(req: Request) {
  try {
    const h = await headers()
    const domain = detectDomain(h)
    const body = await req.json().catch(() => ({}))
    const question_id: string | undefined = body?.question_id
    const locale: 'tr'|'en'|'auto' = body?.locale || 'auto'

    if (!question_id) {
      return NextResponse.json({ ok: false, error: "MISSING_INPUT", detail: "question_id gereklidir." }, { status: 400 })
    }

    // question text
    const { data: qrow, error: qerr } = await supabaseAdmin
      .from("questions")
      .select("id, title, description, precheck_result")
      .eq("id", question_id)
      .maybeSingle()
    if (qerr) throw qerr
    if (!qrow) return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 })
    const questionText = (qrow.description || qrow.title || "").trim()

    const { settings, locale: effLocale } = await getSettings(domain, locale)

    const basePrompt = (settings?.l2_prompt && String(settings.l2_prompt).trim().length > 0)
      ? String(settings.l2_prompt)
      : (effLocale === 'tr' ? DEFAULT_PROMPT_TR : DEFAULT_PROMPT_EN)

    // Call OpenAI
    const l2 = await callOpenAIForL2(basePrompt, questionText, effLocale)

    // Merge into precheck_result.level2
    const merged = {
      ...(qrow.precheck_result || {}),
      level2: {
        ...l2,
        l2b_run: true,
      }
    }

    await supabaseAdmin.from("questions").update({
      precheck_result: merged
    }).eq("id", question_id)

    // audit
    try {
      await supabaseAdmin.from("audit_logs").insert({
        event: "precheck.l2.run",
        resource_type: "question",
        resource_id: question_id,
        payload: { status: l2.status, confidence: l2.confidence, counts: {
          required: l2?.missing?.required?.length || 0,
          should: l2?.missing?.should?.length || 0,
          info: l2?.missing?.info?.length || 0,
        }},
        action: "run",
        actor_role: "system",
      })
    } catch {}

    const _h = await headers();
    const _domain = detectDomain(_h);
   const _locale = (body?.locale || '').toLowerCase()
     || (APP_DOMAINS.en && _domain.endsWith(APP_DOMAINS.en) ? 'en' : 'tr');
    await applyL2Visibility(_domain, _locale, l2);
    
    return NextResponse.json({ ok: true, status: "ok", result: l2 })
  } catch (e: any) {
    try {
      await supabaseAdmin.from("audit_logs").insert({
        event: "precheck.l2.run",
        resource_type: "system",
        resource_id: null,
        payload: { error: String(e?.message || e) },
        action: "error",
        actor_role: "system",
      })
    } catch {}
    return NextResponse.json({ ok: false, error: "PRECHECK_L2_ERROR", detail: String(e?.message || e) }, { status: 500 })
  }
}
