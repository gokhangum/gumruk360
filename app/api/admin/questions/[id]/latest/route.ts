export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase env missing')
  return createClient(url, key, { auth: { persistSession: false } })
}

// Handle Next 15.5 params possibly being a Promise
type CtxParams = { params: { id: string } } | { params: Promise<{ id: string }> }

export async function GET(_: Request, ctx: CtxParams) {
  try {
    const raw = (ctx as any)?.params
    const p = typeof raw?.then === 'function' ? await (raw as any) : raw
    const id: string | undefined = p?.id
    if (!id) return NextResponse.json({ ok: false, error: 'Missing question id' }, { status: 400 })

    const supa = adminClient()

    // Latest draft by created_at
    const { data: d, error: dErr } = await supa
      .from('answer_drafts')
      .select('id, question_id, content, content_html, version, created_at')
      .eq('question_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (dErr && dErr.code !== 'PGRST116') {
      return NextResponse.json({ ok: false, error: dErr.message }, { status: 500 })
    }

    // Latest revision by created_at
    const { data: r, error: rErr } = await supa
      .from('revisions')
      .select('id, question_id, content, content_html, revision_no, created_at')
      .eq('question_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (rErr && rErr.code !== 'PGRST116') {
      return NextResponse.json({ ok: false, error: rErr.message }, { status: 500 })
    }

    // Choose newer by created_at
    const pick = (() => {
      if (d && r) return (new Date(d.created_at) > new Date(r.created_at)) ? { ...d, source: 'draft' as const } : { ...r, source: 'revision' as const }
      if (d) return { ...d, source: 'draft' as const }
      if (r) return { ...r, source: 'revision' as const }
      return null
    })()

    return NextResponse.json({ ok: true, data: pick })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'server_error' }, { status: 500 })
  }
}
