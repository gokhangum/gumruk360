// app/api/admin/revisions/[revId]/revert/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/serverAdmin'
import { isAdmin } from '@/lib/auth/requireAdmin'

type RouteCtx = { params: Promise<{ revId: string }> }
const fail = (msg: string) => NextResponse.json({ ok: false, error: msg }, { status: 200 })
const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v)
const isNumeric = (v: string) => /^\d+$/.test(v)

export async function POST(req: NextRequest, { params }: RouteCtx) {
  const { revId } = await params
  const url = new URL(req.url)
  const adminEmail = url.searchParams.get('email') || ''
  const qid = url.searchParams.get('qid') || '' // varsa kullanırız

  if (!revId) return fail('Missing revId')
  if (adminEmail && !isAdmin(adminEmail)) return fail('Unauthorized')

  // 1) revizyonun question_id'sini bul
  let questionId: string | null = null

  if (isUuid(revId)) {
    const { data, error } = await supabaseAdmin
      .from('revisions')
      .select('question_id')
      .eq('id', revId)
      .maybeSingle()
    if (error) return fail(error.message)
    if (!data) return fail('Revision not found')
    questionId = (data as any).question_id
  } else if (isNumeric(revId)) {
    // Sayı ise: qid varsa onun içinde ara; yoksa global arama (belirsizse hata)
    if (qid) {
      // Önce revision_no
      let row: any = null
      let qry = await supabaseAdmin
        .from('revisions')
        .select('id, question_id')
        .eq('question_id', qid)
        .eq('revision_no', Number(revId))
        .maybeSingle()
      if (!qry.error && qry.data) row = qry.data
      if (!row) {
        // Fallback: version
        const alt = await supabaseAdmin
          .from('revisions')
          .select('id, question_id')
          .eq('question_id', qid)
          .eq('version', Number(revId))
          .maybeSingle()
        if (alt.error) {/* yoksay */}
        row = alt.data ?? null
      }
      if (!row) return fail('Revision not found')
      questionId = row.question_id
      // Artık asıl endpoint'e yönlendirelim
      const proxied = new URL(`/api/admin/questions/${questionId}/revisions/${revId}/revert`, url.origin)
      if (adminEmail) proxied.searchParams.set('email', adminEmail)
      const res = await fetch(proxied.toString(), { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      return NextResponse.json(json, { status: 200 })
    } else {
      // qid yoksa: aynı revision_no birden çok soruda olabilir
      const { data, error } = await supabaseAdmin
        .from('revisions')
        .select('id, question_id')
        .eq('revision_no', Number(revId))
      if (error) return fail(error.message)
      if (!data || data.length === 0) return fail('Revision not found')
      if (data.length > 1) return fail('Ambiguous revision_no; provide ?qid=<question_id>')
      questionId = (data[0] as any).question_id
      const proxied = new URL(`/api/admin/questions/${questionId}/revisions/${revId}/revert`, url.origin)
      if (adminEmail) proxied.searchParams.set('email', adminEmail)
      const res = await fetch(proxied.toString(), { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      return NextResponse.json(json, { status: 200 })
    }
  } else {
    return fail('Invalid revision identifier')
  }
}
