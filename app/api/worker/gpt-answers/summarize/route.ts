// app/api/admin/gpt-answers/summarize/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase env eksik (URL veya SERVICE_ROLE_KEY yok).')
  return createClient(url, key, { auth: { persistSession: false } })
}

type SummarizeInput = {
  text_md: string                 // mevcut taslak (Markdown)
  lang?: 'tr' | 'en'              // dil (varsayılan: TR domain -> 'tr', EN domain -> 'en')
  target_ratio?: number           // 0..1 (örn. 0.65 = %35 kısalt)
  keep_citations?: boolean        // [Kaynak: ...] gibi atıfları koru (vars: true)
  model?: string                  // vars: 'gpt-4.1-mini'
  temperature?: number            // vars: 0.2
  max_tokens?: number             // vars: 1024
}

function looksLikeCode(s: string): boolean {
  const patterns = [
    /```/m, /\bexport\s+const\b/m, /\bimport\s+.*from\b/m, /\bNext(Request|Response)\b/m,
    /\bcreateClient\(/m, /app\/api\/.*\/route\.ts/m, /\bmodule\.exports\b/m, /<\w+>.*<\/\w+>/m
  ]
  return patterns.some(r => r.test(s))
}

function buildPrompt(input: Required<Pick<SummarizeInput, 'text_md' | 'lang'>> & {
  target_ratio: number
  keep_citations: boolean
}) {
  const langName = input.lang === 'en' ? 'English' : 'Turkish'
  const railNoCode =
    'NEVER output code, filenames, paths, imports, exports, or any TypeScript/JavaScript. ' +
    'Do not include backticks or fenced code blocks. ' +
    'Reply only with end-user prose in Markdown.'

  const keepCitesTxt = input.keep_citations
    ? (input.lang === 'en'
        ? 'Preserve all bracketed citations (e.g., [Source: ...]) exactly as they appear. Keep them attached to the end of the relevant paragraphs.'
        : 'Tüm köşeli parantez içindeki atıfları (örn. [Kaynak: ...]) aynen koruyun ve ilgili paragrafların sonunda tutun.')
    : (input.lang === 'en'
        ? 'Remove bracketed citations if any exist.'
        : 'Varsa köşeli parantezli atıfları kaldırın.')

  const ratioTxt = input.lang === 'en'
    ? `Shorten the text by about ${(1 - input.target_ratio) * 100 | 0}% while preserving structure, headings and bullet points.`
    : `Metni yaklaşık %${(1 - input.target_ratio) * 100 | 0} kısaltın; yapı, başlıklar ve madde işaretlerini koruyun.`

  const noNewClaims = input.lang === 'en'
    ? 'Do not add any new claims; only compress and clarify what is already present.'
    : 'Yeni iddialar eklemeyin; yalnızca mevcut içeriği sıkıştırın ve netleştirin.'

  const system =
    `You are a careful legal/editor assistant writing in ${langName}. ${railNoCode}`

  const user = [
    ratioTxt,
    keepCitesTxt,
    noNewClaims,
    '',
    '--- ORIGINAL START ---',
    input.text_md,
    '--- ORIGINAL END ---',
  ].join('\n')

  return { system, user }
}

function approxPrice(model: string): { inPerMTok: number; outPerMTok: number } | null {
  const key = model.toLowerCase()
  if (key.includes('4.1-mini') || key.includes('4o-mini')) return { inPerMTok: 0.15, outPerMTok: 0.60 }
  if (key.includes('4.1') || key.includes('4o')) return { inPerMTok: 5.0, outPerMTok: 15.0 }
  return null
}

async function callOpenAI(params: {
  model: string
  temperature: number
  max_tokens: number
  system: string
  user: string
}) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
  const resp = await openai.chat.completions.create({
    model: params.model,
    temperature: params.temperature,
    max_tokens: params.max_tokens,
    messages: [
      { role: 'system', content: params.system },
      { role: 'user', content: params.user },
    ],
  })
  const text = (resp.choices?.[0]?.message?.content || '').toString()
  const usage = (resp as any)?.usage || {}
  return {
    text,
    promptTokens: usage?.prompt_tokens || 0,
    completionTokens: usage?.completion_tokens || 0,
  }
}

export async function POST(req: NextRequest) {
  try {
    // (Opsiyonel) prod’da gizli başlıkla koruyabilirsiniz:
    const secret = process.env.ADMIN_INTERNAL_SECRET
    if (secret && req.headers.get('x-internal-secret') !== secret) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    const supabase = getAdminClient()
    const body = await req.json().catch(() => ({})) as SummarizeInput

    const text_md = (body.text_md || '').toString().trim()
    if (!text_md) return NextResponse.json({ ok: false, error: 'text_md gerekli' }, { status: 400 })

    // Dil varsayımı: hostname'e bakmıyoruz; çağıran UI gönderecek
    const lang = body.lang === 'en' ? 'en' : 'tr'
    const target_ratio = (typeof body.target_ratio === 'number' && body.target_ratio > 0 && body.target_ratio < 1)
      ? body.target_ratio : 0.65   // ≈ %35 kısalt
    const keep_citations = body.keep_citations !== false

    const model = body.model || 'gpt-4.1-mini'
    const temperature = typeof body.temperature === 'number' ? body.temperature : 0.2
    const max_tokens = typeof body.max_tokens === 'number' ? body.max_tokens : 1024

    const { system, user } = buildPrompt({ text_md, lang, target_ratio, keep_citations })

    // 1. deneme
    const first = await callOpenAI({ model, temperature, max_tokens, system, user })
    let finalText = first.text
    let promptTokens = first.promptTokens
    let completionTokens = first.completionTokens

    // Kod benzeri içerik geldiyse tek düzeltme denemesi
    if (looksLikeCode(finalText)) {
      const repairUser = user + '\n\nIMPORTANT: Previous output looked like code. Reply AGAIN using ONLY natural-language prose (Markdown allowed), no file paths or code blocks.'
      const second = await callOpenAI({ model, temperature, max_tokens, system, user: repairUser })
      if (!looksLikeCode(second.text) && second.text.trim().length > 0) {
        finalText = second.text
        promptTokens += second.promptTokens
        completionTokens += second.completionTokens
      } else {
        finalText = lang === 'en'
          ? 'The summary looked invalid (code-like). Please try again.'
          : 'Özet geçersiz göründü (kod benzeri). Lütfen yeniden deneyin.'
      }
    }

    // (Opsiyonel) kayıt — tablo yoksa sessiz geç
    try {
      await supabase.from('gpt_runs_answer').insert({
        question_text: '[SUMMARY]',
        lang, style: null,
        strict_citations: keep_citations,
        legal_disclaimer: false,
        rag_mode: 'off',
        rag_used: false,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        result_md: finalText,
        sources: []
      } as any)
    } catch {}

    const price = approxPrice(model)
    const cost = price
      ? (promptTokens / 1_000_000) * price.inPerMTok + (completionTokens / 1_000_000) * price.outPerMTok
      : null

    return NextResponse.json({
      ok: true,
      data: { text: finalText, tokens: { prompt: promptTokens, completion: completionTokens }, cost_usd: cost, model }
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}
