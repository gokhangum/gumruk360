// app/api/worker/questions/[id]/revise-complete/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/serverAdmin'
import { supabaseAuthServer as supabaseAuth } from "@/lib/supabaseAuth"

type Params = { id: string }

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {

  try {
    const p = await ctx.params
const questionId = p?.id
    if (!questionId) {
      return NextResponse.json({ ok: false, error: 'missing question id' }, { status: 200 })
    }

    // 1) Kimlik (worker: oturum zorunlu)
    const auth = await supabaseAuth()
    const { data: u } = await auth.auth.getUser()
    const uid = u?.user?.id
    if (!uid) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 200 })
    }

    // 2) İçerik
    const body = await req.json().catch(() => ({} as any))
    let content = String(body?.content ?? '')

    if (!content.trim()) {
      // Son taslak fallback
      const latest = await supabaseAdmin
        .from('answer_drafts')
        .select('id, content')
        .eq('question_id', questionId)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle()
      const fallback = latest.data
      if (fallback?.content) content = String(fallback.content)
    }

    if (!content.trim()) {
      return NextResponse.json({ ok: false, error: 'draft content empty' }, { status: 200 })
    }

    // 3) Son revizyon_no’yu bul → +1
    const probe = await supabaseAdmin
      .from('revisions')
      .select('revision_no')
      .eq('question_id', questionId)
      .order('revision_no', { ascending: false })
      .limit(1)
      .maybeSingle()

    const nextNo = (probe.data?.revision_no ?? 0) + 1

    // 4) Revizyon ekle (şemaya uygun alanlarla)
    const ins = await supabaseAdmin
      .from('revisions')
      .insert({
        question_id: questionId,
        revision_no: nextNo,
        content: content,
        // created_at DB default,
        // created_by / author_email / summary gibi alanlar yoksa YAZMAYIN
      })
      .select('id, revision_no')
      .single()

    if (ins.error) {
      return NextResponse.json({ ok: false, error: ins.error.message }, { status: 200 })
    }

    // 5) Durumu completed yap
    const upd = await supabaseAdmin
      .from('questions')
      .update({ answer_status: 'completed' })
      .eq('id', questionId)
      .select('id, answer_status')
      .single()

    if (upd.error) {
      // revizyon yazıldı ama status güncellenemedi
      return NextResponse.json(
        { ok: true, mode: 'worker', revision_no: nextNo, warning: 'status not updated' },
        { status: 200 }
      )
    }

    return NextResponse.json({ ok: true, mode: 'worker', revision_no: nextNo }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 200 })
  }
}
