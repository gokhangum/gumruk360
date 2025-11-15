export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/serverAdmin'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idOrSlug } = await params
  const supa = supabaseAdmin

  const query = supa.from('worker_cv_profiles')
    .select('id, worker_user_id, display_name, hourly_rate_tl, languages, tags, slug')
    .limit(1)

  let data
  if (/^[0-9a-fA-F-]{36}$/.test(idOrSlug)) {
    const { data: rows, error } = await query.eq('id', idOrSlug)
    if (error) return NextResponse.json({ ok:false, error: error.message }, { status: 500 })
    data = rows?.[0]
  } else {
    const { data: rows, error } = await query.eq('slug', idOrSlug)
    if (error) return NextResponse.json({ ok:false, error: error.message }, { status: 500 })
    data = rows?.[0]
  }

  if (!data) return NextResponse.json({ ok:false, error:'not_found' }, { status: 404 })

  return NextResponse.json({ ok:true, consultant: data })
}