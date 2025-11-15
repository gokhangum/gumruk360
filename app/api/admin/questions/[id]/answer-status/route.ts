// app/api/admin/questions/[id]/answer-status/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../../../lib/supabase/serverAdmin'
import { assertAdmin } from '../../../../../../lib/auth/requireAdmin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
   const { searchParams } = new URL(req.url)
    const email = searchParams.get('email')
   await assertAdmin(req)

    const p = await ctx.params
    const id = p?.id
    const body = await req.json().catch(() => ({}))
    const answer_status = String(body?.answer_status || '')

    const allowed = new Set(['drafting', 'in_review', 'sent', 'completed', 'reopened'])
    if (!allowed.has(answer_status)) {
      return NextResponse.json({ ok: false, error: 'Invalid answer_status' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('questions')
      .update({ answer_status })
      .eq('id', id)
      .select('id, answer_status')
      .single()

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, data })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'unknown error' }, { status: 500 })
  }
}
