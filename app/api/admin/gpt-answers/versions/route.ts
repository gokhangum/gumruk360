export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

function json(ok: boolean, data: any = {}, status = 200) {
  return NextResponse.json({ ok, ...data }, { status })
}

export async function HEAD() { return new NextResponse(null, { status: 204 }) }
export async function OPTIONS() { return new NextResponse(null, { status: 204 }) }

export async function GET(req: NextRequest) {
  try {
    const supabase = getAdminClient()
    if (!supabase) return json(false, { error: 'Supabase environment eksik' }, 500)

    const url = new URL(req.url)
    const givenProfileId = url.searchParams.get('profile_id') || undefined
    let profileId: string | undefined = givenProfileId

    if (!profileId) {
      const { data: active, error: activeErr } = await supabase
        .from('gpt_answer_profiles')
        .select('id')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle()
      if (activeErr) {
        if ((activeErr as any).code === '42P01') return json(true, { rows: [] })
        return json(false, { error: `Aktif profil sorgu hatası: ${activeErr.message}` }, 500)
      }
      if (active?.id) profileId = active.id
    }

    let query = supabase
      .from('gpt_answer_profile_versions')
      .select('id, profile_id, version_tag, status, model, temperature, max_tokens, top_p, strict_citations, add_legal_disclaimer, rag_mode, style, created_at')
      .order('created_at', { ascending: false })

    if (profileId) query = query.eq('profile_id', profileId)

    const { data, error } = await query

    if (error) {
      if ((error as any).code === '42P01') return json(true, { rows: [] })
      return json(false, { error: `Versiyon sorgu hatası: ${error.message}` }, 500)
    }

    return json(true, { rows: data ?? [] })
  } catch (e: any) {
    return json(false, { error: String(e?.message || e) }, 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getAdminClient()
    if (!supabase) return json(false, { error: 'Supabase environment eksik' }, 500)

    const body = await req.json().catch(() => ({} as any))
    let { profile_id, version_tag, base_version_id } = body || {}

    if (!profile_id) {
      const { data: active } = await supabase
        .from('gpt_answer_profiles')
        .select('id')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle()
      if (active?.id) profile_id = active.id
      if (!profile_id) {
        const { data: anyProf } = await supabase
          .from('gpt_answer_profiles')
          .select('id')
          .limit(1)
          .maybeSingle()
        if (anyProf?.id) profile_id = anyProf.id
      }
      if (!profile_id) return json(false, { error: 'profile_id bulunamadı (aktif profil yok)' }, 400)
    }

    if (!version_tag) return json(false, { error: 'version_tag gerekli' }, 400)

    let payload: any = {
      profile_id,
      version_tag,
      status: 'draft',
      model: 'gpt-4.1-mini',
      temperature: 0.2,
      max_tokens: 1024,
      top_p: 1,
      strict_citations: true,
      add_legal_disclaimer: true,
      rag_mode: 'off',
      style: 'teknik',
    }

    if (base_version_id) {
      const { data: base, error: baseErr } = await supabase
        .from('gpt_answer_profile_versions')
        .select('*')
        .eq('id', base_version_id)
        .maybeSingle()
      if (baseErr) return json(false, { error: `Baz versiyon okunamadı: ${baseErr.message}` }, 500)
      if (base) {
        payload = {
          ...payload,
          model: base.model ?? payload.model,
          temperature: base.temperature ?? payload.temperature,
          max_tokens: base.max_tokens ?? payload.max_tokens,
          top_p: (base as any).top_p ?? payload.top_p,
          strict_citations: base.strict_citations ?? payload.strict_citations,
          add_legal_disclaimer: base.add_legal_disclaimer ?? payload.add_legal_disclaimer,
          rag_mode: base.rag_mode ?? payload.rag_mode,
          style: (base as any).style ?? payload.style,
        }
      }
    }

    const { data: created, error: insErr } = await supabase
      .from('gpt_answer_profile_versions')
      .insert([payload])
      .select('id, profile_id')
      .maybeSingle()

    if (insErr) return json(false, { error: `Versiyon oluşturma hatası: ${insErr.message}` }, 500)
    if (!created?.id) return json(false, { error: 'Versiyon oluşturulamadı' }, 500)

    try { await supabase.from('audit_logs').insert({ action: 'gpt.version.created', resource_type: 'gpt_answer_profile_versions', resource_id: created.id, event: 'created', metadata: { profile_id, version_tag, base_version_id }, actor_role: 'system' } as any) } catch {}

    return json(true, { id: created.id, profile_id: created.profile_id })
  } catch (e: any) {
    return json(false, { error: String(e?.message || e) }, 500)
  }
}
