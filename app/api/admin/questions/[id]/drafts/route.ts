// app/api/admin/questions/[id]/drafts/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../../../lib/supabase/serverAdmin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Row = { id: string, version: number, content: string, created_at: string }
type ApiOk<T> = { ok: true; data: T }
type ApiErr = { ok: false; error?: string; display?: string }

// Basit UUID doğrulama
const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

async function lookupUserIdByEmail(email: string): Promise<string | null> {
  if (!email) return null
  const candidates = [
    { table: 'profiles', idCol: 'id', emailCol: 'email' },
    { table: 'users', idCol: 'id', emailCol: 'email' },
    { table: 'app_users', idCol: 'id', emailCol: 'email' },
    { table: 'workers', idCol: 'user_id', emailCol: 'email' },
  ] as const
  for (const c of candidates) {
  try {
      const { data, error } = await supabaseAdmin
        .from(c.table as any)
      .select(c.idCol)
      .eq(c.emailCol, email)
       .limit(1)

      if (!error && data && data.length > 0) {
        const id = String((data as any)[0][c.idCol] || '')
        if (UUID_RX.test(id)) return id
      }
    } catch {}
  }
  return null
}

function resolveEmailAndUuidParts(urlStr: string, body?: any) {
  const url = new URL(urlStr)
  const email = url.searchParams.get('email')?.trim() || body?.email?.toString()?.trim() || ''
  const createdByUuid =
    body?.created_by_uuid?.toString()?.trim() ||
    body?.createdByUuid?.toString()?.trim() ||
    process.env.ADMIN_FALLBACK_USER_ID?.trim() ||
    ''
  return { email, createdByUuid }
}

// GET: En son taslak (latest)
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: questionId } = await ctx.params
    if (!questionId) return NextResponse.json({ ok:false, error: 'question_id missing' }, { status: 400 })

    const { data, error } = await supabaseAdmin
      .from('answer_drafts')
      .select('id, question_id, content, content_html, version, created_at')
      .eq('question_id', questionId)
      .order('version', { ascending: false })
      .limit(1)

    if (error) return NextResponse.json({ ok:false, error: error.message }, { status: 500 })
    const row = Array.isArray(data) && data.length ? (data[0] as Row) : null
    if (!row) return NextResponse.json({ ok:false, error: 'not_found' }, { status: 404 })

    return NextResponse.json({ ok: true, data: row } satisfies ApiOk<Row>)
  } catch (err: any) {
    return NextResponse.json({ ok:false, error: err?.message || 'server_error' }, { status: 500 })
  }
}

// POST: Taslak kaydet
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: questionId } = await ctx.params
    if (!questionId) return NextResponse.json({ ok:false, display: 'question_id missing' }, { status: 400 })

    const body = await req.json().catch(() => ({} as any))
    let content: any = body?.content ?? ''
    const model: string | null = body?.model?.toString?.() || null
    let content_html: string | null = body?.content_html?.toString?.() || null
    if (typeof content !== 'string') {
      try { content = JSON.stringify(content) } catch { content = String(content ?? '') }
    }
    content = String(content ?? '').trim()
    if (!content) return NextResponse.json({ ok:false, display: 'empty content' }, { status: 400 })

    const { email, createdByUuid } = resolveEmailAndUuidParts(req.url, body)

    // created_by öncelik sırası: body.created_by_uuid → email → env.ADMIN_FALLBACK_USER_ID
    let created_by: string | null = null
    if (createdByUuid && UUID_RX.test(createdByUuid)) {
      created_by = createdByUuid
    } else {
      created_by = await lookupUserIdByEmail(email)
      if (!created_by && UUID_RX.test(String(process.env.ADMIN_FALLBACK_USER_ID || ''))) {
        created_by = String(process.env.ADMIN_FALLBACK_USER_ID)
      }
    }

    if (!created_by) {
      const hint = 'Lütfen URL’de ?email=<adminEmail> gönderin veya ADMIN_FALLBACK_USER_ID env değişkenini ayarlayın.'
      return NextResponse.json({ ok:false, display: `created_by bulunamadı. ${hint}` }, { status: 400 })
    }

    // Son versiyon
    const { data: last } = await supabaseAdmin
      .from('answer_drafts')
      .select('version')
      .eq('question_id', questionId)
      .order('version', { ascending: false })
      .limit(1)
    const nextVersion = (Array.isArray(last) && last.length ? Number((last as any)[0].version) : 0) + 1
    // HTML fallback: ensure content_html is saved if provided, otherwise derive minimal HTML
    if (!content_html || content_html.trim() === '') {
      try {
        const t = (content ?? '').toString()
        content_html = t ? t.replace(/\n/g, '<br/>') : ''
      } catch { content_html = '' }
    }

    const insertPayload: any = {
      question_id: questionId,
      content,
      content_html: content_html ?? null,
      version: nextVersion,
      created_by,
    }
    if (model) insertPayload.model = model

    const { data: ins, error: insErr } = await supabaseAdmin
      .from('answer_drafts')
      .insert(insertPayload)
      .select('id')
      .limit(1)

    if (insErr) {
      return NextResponse.json({ ok:false, display: `DB hatası: ${insErr.message}` }, { status: 500 })
    }

    const draftId = Array.isArray(ins) && ins.length ? (ins[0] as any).id : null

    // Audit log
    try {
      await supabaseAdmin.from('audit_logs').insert({
        action: 'save_draft',
        resource_type: 'answer_drafts',
        resource_id: draftId,
        question_id: questionId,
        actor_role: 'admin',
        actor_user_id: created_by,
        event: 'draft_saved',
        payload: { version: nextVersion, length: content.length, model },
      } as any)
    } catch { /* ignore */ }

    return NextResponse.json({ ok:true, data: { id: draftId, version: nextVersion } } satisfies ApiOk<{id:string|null, version:number}>, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ ok:false, display: err?.message || 'server_error' }, { status: 500 })
  }
}