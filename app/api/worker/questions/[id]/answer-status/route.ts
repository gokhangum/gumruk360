// app/api/worker/questions/[id]/answer-status/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse, NextRequest } from "next/server"
import { supabaseAdmin } from '@/lib/supabase/serverAdmin'
import { supabaseAuthServer as supabaseAuth } from "@/lib/supabaseAuth"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await supabaseAuth()
    const { data: u } = await auth.auth.getUser()
    if (!u?.user?.id) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 200 })

    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const answer_status = String(body?.answer_status || '')

    if (!id || !answer_status) return NextResponse.json({ ok: false, error: 'missing fields' }, { status: 200 })

    const { data, error } = await supabaseAdmin
      .from('questions')
      .update({ answer_status })
      .eq('id', id)
      .select('id, answer_status')
      .single()

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 })
    return NextResponse.json({ ok: true, data })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'unknown error' }, { status: 200 })
  }
}
