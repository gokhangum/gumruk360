// app/api/admin/questions/[id]/revisions/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/serverAdmin'
import { isAdmin } from '@/lib/auth/requireAdmin'

type Params = { id: string }

function normalizeRow(r: any) {
  const revNo = typeof r.revision_no === 'number' ? r.revision_no : r.version ?? null
  const ver   = typeof r.version === 'number' ? r.version : r.revision_no ?? null
  const sum   = r.summary ?? (r.content ? String(r.content).replace(/\s+/g, ' ').trim().slice(0, 160) : null)
  return {
    id: r.id,
    question_id: r.question_id,
    revision_no: revNo,
    version: ver,
    summary: sum,
    source: r.source ?? null,
    created_by: r.created_by ?? null,
    created_at: r.created_at ?? null,
    content: r.content ?? null,
  }
}

async function hasColumn(col: string) {
  const probe = await supabaseAdmin.from('revisions').select(col).limit(1)
  return !probe.error
}

export async function GET(req: NextRequest, ctx: { params: Promise<Params> }) {
  const p = await ctx.params
  const questionId = p?.id
  const url = new URL(req.url)
  const adminEmail = url.searchParams.get('email') || ''

  if (!questionId) return NextResponse.json({ ok: false, error: 'Missing question id' }, { status: 400 })
  if (adminEmail && !isAdmin(adminEmail)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  // ---- Tek içerik: rid / no
  const rid = url.searchParams.get('rid')
  const no  = url.searchParams.get('no')
  if (rid || no) {
    let q = supabaseAdmin.from('revisions').select('*').eq('question_id', questionId).limit(1)
    if (rid) q = q.eq('id', rid)
    else     q = q.eq('revision_no', Number(no))
    const { data, error } = await q.maybeSingle()
    if (error)  return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    if (!data)  return NextResponse.json({ ok: false, error: 'revision not found' }, { status: 404 })
    return NextResponse.json({ ok: true, data: normalizeRow(data) })
  }

  // ---- İki içerik: left/right (id) veya leftNo/rightNo (revision_no)
  const left    = url.searchParams.get('left')
  const right   = url.searchParams.get('right')
  const leftNo  = url.searchParams.get('leftNo')
  const rightNo = url.searchParams.get('rightNo')

  if ((left && right) || (leftNo && rightNo)) {
    let q = supabaseAdmin.from('revisions').select('*').eq('question_id', questionId)
    if (left && right) {
      q = q.in('id', [left, right])
    } else {
      q = q.in('revision_no', [Number(leftNo), Number(rightNo)])
    }
    const { data, error } = await q
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

    const map: Record<string, any> = {}
    for (const r of data || []) {
      const n = normalizeRow(r)
      map[r.id] = n
      if (typeof n.revision_no === 'number') map[`no:${n.revision_no}`] = n
    }

    const leftData  = left ? map[left] : map[`no:${Number(leftNo)}`]
    const rightData = right ? map[right] : map[`no:${Number(rightNo)}`]
    if (!leftData || !rightData) return NextResponse.json({ ok: false, error: 'revision not found' }, { status: 404 })

    return NextResponse.json({ ok: true, left: leftData, right: rightData })
  }

  // ---- Liste (kolonları otomatik tespit et)
  const hasRevNo = await hasColumn('revision_no')
  // version kolonu olmayabilir; varsa sonra normalize ederiz
  const selectCols = ['id', 'question_id', 'summary', 'source', 'created_by', 'created_at']
  if (hasRevNo) selectCols.push('revision_no')
  // 'version' kolonu *varsa* çekeriz, yoksa hiç dokunmayız
  if (await hasColumn('version')) selectCols.push('version')

  const { data, error } = await supabaseAdmin
    .from('revisions')
    .select(selectCols.join(','))
    .eq('question_id', questionId)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const rows = (data || [])
    .map(normalizeRow)
    .sort((a: any, b: any) => (b.revision_no ?? 0) - (a.revision_no ?? 0))

  return NextResponse.json({ ok: true, data: rows })
}
