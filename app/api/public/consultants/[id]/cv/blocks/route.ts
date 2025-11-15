export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/serverAdmin'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { searchParams } = new URL(req.url)
  const lang = (searchParams.get('lang') || 'tr') as 'tr'|'en'
  const visible = searchParams.get('visible')

  const supa = supabaseAdmin
  let q = supa
    .from('worker_cv_blocks')
    .select('block_type, body_rich, order_no, is_visible, lang')
    .eq('worker_user_id', id)
    .eq('lang', lang)
    .order('order_no', { ascending: true })

  if (visible === '1' || visible === 'true') {
    q = q.eq('is_visible', true)
  }

  const { data, error } = await q
  if (error) return NextResponse.json({ ok:false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok:true, blocks: data })
}