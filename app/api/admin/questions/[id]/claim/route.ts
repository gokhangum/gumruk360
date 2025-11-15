// app/api/admin/questions/[id]/claim/route.ts
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
    const action = String(body?.action || '')

    let claim_status: 'none' | 'pending' | 'approved'
    if (action === 'approve') claim_status = 'approved'
    else if (action === 'pending') claim_status = 'pending'
    else if (action === 'reset' || action === 'reject') claim_status = 'none'
    else return NextResponse.json({ ok: false, error: 'Invalid action' }, { status: 400 })

    const { data, error } = await supabaseAdmin
      .from('questions')
      .update({ claim_status })
      .eq('id', id)
      .select('id, claim_status')
      .single()

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, data })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'unknown error' }, { status: 500 })
  }
}
