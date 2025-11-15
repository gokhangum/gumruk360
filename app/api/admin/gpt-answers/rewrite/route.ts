// app/api/admin/gpt-answers/rewrite/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

type EvidenceItem = { label: string; excerpt?: string }

type RewriteInput = {
  paragraph_md: string          // seçili paragraf
  context_md?: string           // tüm taslak (bağlam için)
  lang?: 'tr'|'en'
  // Not: Admin ayarlarına sadık kalmak için burada stil/strict override etmiyoruz.
  sources?: EvidenceItem[]      // varsa RAG kaynakları
  mode?: 'soften'|'harden'|'bulletize'|'regenerate'
}

function looksLikeCode(s: string): boolean {
  const patterns = [
    /```/m, /\bexport\s+const\b/m, /\bimport\s+.*from\b/m, /\bNext(Request|Response)\b/m,
    /\bcreateClient\(/m, /app\/api\/.*\/route\.ts/m, /\bmodule\.exports\b/m, /<\w+>.*<\/\w+>/m
  ]
  return patterns.some(r => r.test(s))
}

function buildPrompt(input: Required<Pick<RewriteInput,'paragraph_md'|'lang'>> & {
  context_md?: string
  sources?: EvidenceItem[]
  mode: NonNullable<RewriteInput['mode']>
}) {
  const langName = input.lang === 'en' ? 'English' : 'Turkish'

  const modeTxt = (() => {
    switch (input.mode) {
      case 'soften':
        return input.lang === 'en'
          ? 'Soften definitive claims into qualified language without losing substance.'
          : 'Kesin ifadeleri yumuşat, anlamı koru ve kayıtlı/ihtiyatlı dil kullan.'
      case 'harden':
        return input.lang === 'en'
          ? 'Strengthen clarity and directness, while keeping legal caution.'
          : 'Anlamı netleştir ve doğrudanlaştır; hukukî ihtiyatı koru.'
      case 'bulletize':
        return input.lang === 'en'
          ? 'Convert into concise bullet points.'
          : 'Kısa ve öz madde işaretlerine dönüştür.'
      default:
        return input.lang === 'en' ? 'Regenerate with better flow.' : 'Akışı iyileştirerek yeniden yaz.'
    }
  })()

  const sourcesBlock = (input.sources && input.sources.length)
    ? (input.lang === 'en'
        ? ['Sources:', ...input.sources.map(s=>`- ${s.label}${s.excerpt?': '+s.excerpt:''}`)].join('\n')
        : ['Kaynaklar:', ...input.sources.map(s=>`- ${s.label}${s.excerpt?': '+s.excerpt:''}`)].join('\n'))
    : ''

  const railNoCode =
    'NEVER output code, filenames, paths, imports/exports, or any TypeScript/JavaScript. ' +
    'Do not include backticks or fenced code blocks. Reply only with natural-language Markdown.'

  const system = `You are a senior customs/legal editor writing in ${langName}. ${railNoCode}`

  const user = [
    modeTxt,
    '',
    input.context_md ? (input.lang==='en' ? 'Context (full draft):' : 'Bağlam (tam taslak):') : '',
    input.context_md || '',
    input.lang==='en' ? 'Rewrite this paragraph:' : 'Şu paragrafı yeniden yaz:',
    '--- PARAGRAPH START ---',
    input.paragraph_md,
    '--- PARAGRAPH END ---',
    '',
    sourcesBlock
  ].filter(Boolean).join('\n')

  return { system, user }
}

function approxPrice(model: string): { inPerMTok: number; outPerMTok: number } | null {
  const key = model.toLowerCase()
  if (key.includes('4.1-mini') || key.includes('4o-mini')) return { inPerMTok: 0.15, outPerMTok: 0.60 }
  if (key.includes('4.1') || key.includes('4o')) return { inPerMTok: 5.0, outPerMTok: 15.0 }
  return null
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(()=> ({})) as RewriteInput

    const paragraph = (body.paragraph_md || '').toString().trim()
    if (!paragraph) return NextResponse.json({ ok:false, error: 'paragraph_md gerekli' }, { status: 400 })

    const lang = body.lang === 'en' ? 'en' : 'tr'
    const mode = body.mode || 'regenerate'

    const { system, user } = buildPrompt({
      paragraph_md: paragraph,
      lang,
      context_md: body.context_md,
      sources: body.sources || [],
      mode
    })

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
    const model = process.env.GPT_ANSWER_MODEL || 'gpt-4.1-mini'
    const temperature = Number(process.env.GPT_ANSWER_TEMP ?? 0.2)
    const max_tokens = Number(process.env.GPT_ANSWER_MAXTOK ?? 512)

    const resp = await openai.chat.completions.create({
      model, temperature, max_tokens,
      messages: [{ role:'system', content: system }, { role:'user', content: user }]
    })

    let text = (resp.choices?.[0]?.message?.content || '').toString()
    const usage = (resp as any)?.usage || {}
    if (looksLikeCode(text)) {
      // tek onarım denemesi
      const repair = await openai.chat.completions.create({
        model, temperature, max_tokens,
        messages: [
          { role:'system', content: system },
          { role:'user', content: user + '\n\nIMPORTANT: Your previous output looked like code. Reply again using only natural-language Markdown.' }
        ]
      })
      const t2 = (repair.choices?.[0]?.message?.content || '').toString()
      if (t2.trim()) text = t2
    }

    const price = approxPrice(model)
    const cost = price
      ? ((usage?.prompt_tokens||0) / 1_000_000) * price.inPerMTok + ((usage?.completion_tokens||0) / 1_000_000) * price.outPerMTok
      : null

    return NextResponse.json({
      ok: true,
      data: {
        text,
        tokens: { prompt: usage?.prompt_tokens||0, completion: usage?.completion_tokens||0 },
        cost_usd: cost,
        model
      }
    })
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: String(e?.message || e) }, { status: 500 })
  }
}
