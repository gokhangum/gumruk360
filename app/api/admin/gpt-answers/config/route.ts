// app/api/admin/gpt-answers/config/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase env eksik (URL veya SERVICE_ROLE_KEY yok).')
  return createClient(url, key, { auth: { persistSession: false } })
}

export async function GET() {
  try {
    const supabase = getAdminClient()

    // Aktif profil (yoksa boş dön)
    const { data: prof, error: profErr } = await supabase
      .from('gpt_answer_profiles')
      .select('id,name,description,is_active')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

    // Tablolar yoksa ilk kurulum: boş state dön
    if (profErr?.message?.toLowerCase?.().includes('relation') || profErr?.code === '42P01') {
      return NextResponse.json({ ok: true, profile: null, version: null, blocks: [], library: [] })
    }
    if (profErr) return NextResponse.json({ ok: false, error: profErr.message }, { status: 500 })

    if (!prof) {
      return NextResponse.json({ ok: true, profile: null, version: null, blocks: [], library: [] })
    }

    // Yayındaki sürüm
    const { data: ver, error: verErr } = await supabase
      .from('gpt_answer_profile_versions')
      .select('*')
      .eq('profile_id', prof.id)
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (verErr) return NextResponse.json({ ok: false, error: verErr.message }, { status: 500 })

    // Sürüm blokları
    const { data: blocks, error: blocksErr } = await supabase
      .from('gpt_profile_blocks')
      .select('id, sort_order, enabled, params, gpt_prompt_blocks (id,key,title,body,lang,metadata)')
      .eq('profile_version_id', ver?.id || '')
      .order('sort_order', { ascending: true })
    if (blocksErr) return NextResponse.json({ ok: false, error: blocksErr.message }, { status: 500 })

    // Kütüphane
    const { data: lib, error: libErr } = await supabase
      .from('gpt_prompt_blocks')
      .select('id,scope,tenant_id,key,title,lang,metadata')
      .order('title', { ascending: true })
    if (libErr) return NextResponse.json({ ok: false, error: libErr.message }, { status: 500 })

    return NextResponse.json({ ok: true, profile: prof, version: ver || null, blocks: blocks || [], library: lib || [] })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getAdminClient()
    const body = await req.json().catch(() => ({}))
    const { profile_id, version_id, updates } = body || {}
    if (!profile_id || !version_id) {
      return NextResponse.json({ ok: false, error: 'profile_id ve version_id zorunlu' }, { status: 400 })
    }

    const { error } = await supabase
      .from('gpt_answer_profile_versions')
      .update({
        model: updates?.model,
        temperature: updates?.temperature,
        max_tokens: updates?.max_tokens,
        top_p: updates?.top_p,
        strict_citations: updates?.strict_citations,
        add_legal_disclaimer: updates?.add_legal_disclaimer,
        rag_mode: updates?.rag_mode,
        rag_params: updates?.rag_params || {},
        output_schema: updates?.output_schema || {},
        style: updates?.style, // <<< EKLENDİ
      })
      .eq('id', version_id)

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}
