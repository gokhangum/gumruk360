// app/api/admin/gpt-answers/versions/activate/route.ts
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

export async function POST(req: NextRequest) {
  try {
    const supabase = getAdminClient()
    const { version_id } = await req.json()

    if (!version_id) return NextResponse.json({ error: 'version_id gerekli' }, { status: 400 })

    const { data: ver, error: e1 } = await supabase
      .from('gpt_answer_profile_versions')
      .select('id,profile_id')
      .eq('id', version_id)
      .maybeSingle()
    if (e1 || !ver) return NextResponse.json({ error: e1?.message || 'version bulunamadı' }, { status: 404 })

    await supabase
      .from('gpt_answer_profile_versions')
      .update({ status: 'archived' })
      .eq('profile_id', ver.profile_id)
      .eq('status', 'published')

    const { error: e2 } = await supabase.from('gpt_answer_profile_versions').update({ status: 'published' }).eq('id', version_id)
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
