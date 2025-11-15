export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

/* ---------------- Supabase admin client ---------------- */
function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Supabase env değişkenleri eksik (URL veya SERVICE_ROLE_KEY yok).')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

/* ---------------- Yardımcılar ---------------- */
const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

async function lookupUserIdByEmail(supabase: ReturnType<typeof createClient>, email?: string) {
  if (!email) return null
  const candidates: { table: string; idCol: string; emailCol: string }[] = [
    { table: 'profiles', idCol: 'id', emailCol: 'email' },
    { table: 'app_users', idCol: 'id', emailCol: 'email' },
    { table: 'workers', idCol: 'user_id', emailCol: 'email' },
  ]
  for (const c of candidates) {
    try {
      const { data, error } = await supabase
        .from(c.table as any)
        .select(`${c.idCol}`)
        .eq(c.emailCol, email)
        .limit(1)
      if (!error && data && data.length > 0) {
        const id = String((data as any)[0][c.idCol] || '')
        if (UUID_RX.test(id)) return id
      }
    } catch {}
  }
  try {
    const { data, error } = await supabase
      .from('auth.users' as any)
      .select('id, email')
      .eq('email', email)
      .limit(1)
    if (!error && data && data.length > 0) {
      const id = String((data as any)[0]['id'] || '')
      if (UUID_RX.test(id)) return id
    }
  } catch {}
  return null
}

function mapOpenAIError(err: any) {
  const msg = (err?.error?.message || err?.message || '').toString().toLowerCase()
  const type = (err?.error?.type || '').toString()
  const status = Number(err?.status || err?.error?.status || 0)

  const quotaHit =
    type === 'insufficient_quota' ||
    msg.includes('insufficient_quota') ||
    msg.includes('billing') ||
    msg.includes('payment') ||
    msg.includes('quota')

  if (quotaHit) {
    return {
      http: 402,
      code: 'quota_exceeded',
      display: '⚠️ OpenAI kullanım limitiniz dolmuş (kuota/ödeme limiti). Taslak üretilemedi.',
    }
  }

  const rateLimited =
    type === 'rate_limit_exceeded' ||
    (status === 429 && !quotaHit) ||
    msg.includes('rate limit') ||
    msg.includes('too many requests')

  if (rateLimited) {
    return {
      http: 429,
      code: 'rate_limited',
      display: '⚠️ OpenAI hız limiti aşıldı. Birkaç saniye sonra tekrar deneyin.',
    }
  }

  return {
    http: 500,
    code: 'openai_error',
    display:
      '⚠️ GPT taslak üretimi sırasında beklenmeyen bir hata oluştu. Biraz sonra tekrar deneyin.',
  }
}

/* ---------------- Handler ---------------- */
export async function POST(req: Request) {
  try {
   const supabase = getAdminClient()
    const url = new URL(req.url)
    const adminEmail = (url.searchParams.get('email') || '').trim()
     const body = await req.json().catch(() => ({} as any))
   const { title, description } = body || {}
    const qpId = (url.searchParams.get('id') || url.searchParams.get('question_id') || '').trim()
    const questionId = qpId || String((body as any)?.question_id || '').trim()

    if (!questionId) {
      return NextResponse.json(
        { ok: false, code: 'missing_question_id', display: 'question_id gerekiyor.' },
        { status: 400 }
      )
    }

    const key = process.env.OPENAI_API_KEY?.trim()
    if (!key) {
      return NextResponse.json(
        {
          ok: false,
          code: 'missing_openai_key',
          display: '⚠️ OPENAI_API_KEY tanımlı değil — GPT taslak üretimi devre dışı.',
        },
        { status: 400 }
      )
    }

    // Soru var mı?
    const { data: q, error: qErr } = await supabase
      .from('questions')
      .select('id, title, description')
      .eq('id', questionId)
      .single()
    if (qErr || !q) {
      return NextResponse.json(
        { ok: false, code: 'question_not_found', display: 'Soru bulunamadı.' },
        { status: 404 }
      )
    }

    // Versiyon belirle
    let nextVersion = 1
    const { data: lastVer } = await supabase
      .from('answer_drafts')
      .select('version')
      .eq('question_id', questionId)
      .order('version', { ascending: false })
      .limit(1)
    if (lastVer && lastVer.length) {
      const v = Number(lastVer[0].version || 0)
      nextVersion = Number.isFinite(v) && v > 0 ? v + 1 : 1
    }

    // OpenAI çağrısı — müşteri sorusuna doğrudan cevap + belirli format
    const openai = new OpenAI({ apiKey: key })
    let content = ''
    try {
      const effectiveTitle = (title || q.title || '').toString()
      const effectiveDesc = (description || q.description || '').toString()

      const prompt = [
        'Aşağıdaki KONU müşteri sorusudur. Gümrük mevzuatı danışmanı gibi NET ve UYGULANABİLİR bir cevap ver.',
        'Cevap Türkçe olacak ve şu formatta yazılacak:',
        '',
        '## Kısa Yanıt',
        '- 1–3 cümlede doğrudan sonuç.',
        '',
        '## Detaylı Yanıt (Adım Adım)',
        '- Adım 1, Adım 2… net yönergeler.',
        '',
        '## İlgili Mevzuat',
        '- Mevzuat adı – madde no: 1–2 cümle açıklama.',
        '',
        '## Belgeler & İşlemler (Checklist)',
        '- [ ] Gerekli belgenin adı — kısa not',
        '',
        '## Riskler / Dikkat Edilecekler',
        '- Potansiyel riskler ve tipik hatalar.',
        '',
        '## Sonraki Adımlar & Önerilen Zamanlama',
        '- Ne, kim, ne zaman (kısa plan).',
        '',
        'KONU (Müşteri sorusu):',
        `Başlık: ${effectiveTitle || '-'}`,
        `Açıklama: ${effectiveDesc || '-'}`,
      ].join('\n')

      const resp = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a meticulous customs consultant assistant. Respond in Turkish, with structured, actionable steps.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
      })

      content = (resp?.choices?.[0]?.message?.content || '').toString().trim()
      if (!content) throw new Error('Empty completion content')
    } catch (err: any) {
      const mapped = mapOpenAIError(err)
      return NextResponse.json(
        { ok: false, code: mapped.code, display: mapped.display },
        { status: mapped.http }
      )
    }

    // Sabit uyarıyı alta ekle
    const disclaimer = '\n\n---\nverilen görüşler bağamaz. Özelge alın'
    const contentWithDisclaimer = (content || '').trim() + disclaimer

    // created_by → UUID (email veya fallback env)
    let created_by: string | null = null
    const envFallback = (process.env.ADMIN_FALLBACK_USER_ID || '').trim()
    if (envFallback && UUID_RX.test(envFallback)) {
      created_by = envFallback
    }
    if (!created_by) {
      created_by = await lookupUserIdByEmail(supabase as any, adminEmail)
    }
    if (!created_by) {
      return NextResponse.json(
        {
          ok: false,
          code: 'created_by_missing',
          display:
            'Taslak kaydı için created_by bulunamadı. URL’de ?email=<adminEmail> gönderin veya ADMIN_FALLBACK_USER_ID (UUID) env değişkenini tanımlayın.',
        },
        { status: 400 }
      )
    }

    // Taslağı DB'ye yaz
    const { error: insErr } = await supabase.from('answer_drafts').insert({
      question_id: questionId,
      version: nextVersion,
      content: contentWithDisclaimer,
      model: 'gpt-4o-mini',
      created_by,
    })

    if (insErr) {
      return NextResponse.json(
        { ok: false, code: 'db_insert_error', display: `Taslak kaydedilemedi: ${insErr.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ok: true,
      data: { question_id: questionId, version: nextVersion, content: contentWithDisclaimer },
      display: 'Taslak üretildi ve kaydedildi.',
    })
  } catch (err: any) {
    const mapped = mapOpenAIError(err)
    return NextResponse.json(
      { ok: false, code: mapped.code, display: mapped.display },
      { status: mapped.http }
    )
  }
}
