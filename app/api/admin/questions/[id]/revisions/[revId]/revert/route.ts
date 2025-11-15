// app/api/admin/questions/[id]/revisions/[revId]/revert/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/serverAdmin'
import { isAdmin } from '@/lib/auth/requireAdmin'

type Params = { id: string; revId: string }

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
}
function isNumeric(v: string) {
  return /^\d+$/.test(v)
}
const fail = (msg: string) => NextResponse.json({ ok: false, error: msg }, { status: 200 })

function makeSummary(text: string, limit = 160) {
  const s = (text || '').replace(/\s+/g, ' ').trim()
  return s.slice(0, limit)
}

async function ingestToRevisions(opts: {
  questionId: string
  content: string
  contentHtml?: string | null
  createdBy: string
  suggestedSeq?: number | null
}) {
  const { questionId, content, contentHtml = null, createdBy, suggestedSeq = null } = opts

  // erişim kontrolü
  const ping = await supabaseAdmin.from('revisions').select('id').limit(1)
  if (ping.error) return { ok: false as const, reason: ping.error.message }

  const summary = makeSummary(content)

  // revision_no var mı?
  const probeNo = await supabaseAdmin
    .from('revisions')
    .select('revision_no')
    .eq('question_id', questionId)
    .limit(1)

  const hasNo = !probeNo.error

  if (hasNo) {
    let nextNo: number
    if (suggestedSeq != null) nextNo = suggestedSeq
    else {
      const v = await supabaseAdmin
        .from('revisions')
        .select('revision_no')
        .eq('question_id', questionId)
        .order('revision_no', { ascending: false })
        .limit(1)
        .maybeSingle()
      nextNo = (v.data?.revision_no ?? 0) + 1
    }

    const ins = await supabaseAdmin.from('revisions').insert({
      question_id: questionId,
      content,
	  content_html: contentHtml ?? null,
      revision_no: nextNo,
      summary,
      source: 'revert',
      created_by: createdBy,
    } as any)
    if (ins.error) return { ok: false as const, reason: ins.error.message }
    return { ok: true as const, revision_no: nextNo }
  }

  // fallback: version
  const probeVer = await supabaseAdmin.from('revisions').select('version').limit(1)
  if (!probeVer.error) {
    let nextVersion: number
    if (suggestedSeq != null) nextVersion = suggestedSeq
    else {
      const v = await supabaseAdmin
        .from('revisions')
        .select('version')
        .eq('question_id', questionId)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle()
      nextVersion = (v.data?.version ?? 0) + 1
    }

    const ins = await supabaseAdmin.from('revisions').insert({
      question_id: questionId,
      content,
	  content_html: contentHtml ?? null,
      version: nextVersion,
      summary,
      source: 'revert',
      created_by: createdBy,
    } as any)
    if (ins.error) return { ok: false as const, reason: ins.error.message }
    return { ok: true as const, version: nextVersion }
  }

  return { ok: false as const, reason: 'revisions tablosu şema uyumsuz' }
}

// questions tablosunda mevcutsa draft işaretçisini güncelle
async function updateQuestionDraftPointer(questionId: string, draftId: string) {
  const tried: string[] = []
  const updated: string[] = []

  for (const col of ['answer_draft_id', 'draft_id', 'current_draft_id']) {
    tried.push(col)
    try {
      const { error } = await supabaseAdmin
        .from('questions')
        .update({ [col]: draftId } as any)
        .eq('id', questionId)
      if (!error) updated.push(col)
    } catch {
      // kolon yoksa / hata varsa geç
    }
  }
  return { tried, updated }
}

export async function POST(req: Request, ctx: { params: Promise<Params> }) {
  const p = await ctx.params
  const questionId = p?.id
  const revId = p?.revId

  const url = new URL(req.url)
  const adminEmail = url.searchParams.get('email') || ''

  if (!questionId || !revId) return fail('Missing ids')
  if (adminEmail && !isAdmin(adminEmail)) return fail('Unauthorized')

  // 1) Revert edilecek revizyonun içeriğini bul
  let content: string | null = null
  let contentHtml: string | null = null
  try {
    if (isUuid(revId)) {
      const { data, error } = await supabaseAdmin
        .from('revisions')
        .select('id, question_id, content, content_html')
        .eq('question_id', questionId)
        .eq('id', revId)
        .maybeSingle()
      if (error) return fail(error.message)
      if (!data) return fail('Revision not found')
      content = String((data as any).content ?? '')
      contentHtml = (data as any).content_html ?? null
    } else if (isNumeric(revId)) {
      let row: any = null
      const byNo = await supabaseAdmin
        .from('revisions')
        .select('id, question_id, content, content_html, revision_no')
        .eq('question_id', questionId)
        .eq('revision_no', Number(revId))
        .maybeSingle()
      if (!byNo.error && byNo.data) row = byNo.data
      if (!row) {
        const byVer = await supabaseAdmin
          .from('revisions')
          .select('id, question_id, content, content_html, version')
          .eq('question_id', questionId)
          .eq('version', Number(revId))
          .maybeSingle()
        row = byVer.data ?? null
      }
      if (!row) return fail('Revision not found')
      content = String(row.content ?? '')
  contentHtml = row.content_html ?? null
    } else {
      return fail('Invalid revision identifier')
    }
  } catch (e: any) {
    return fail(String(e?.message || e))
  }

  // 2) created_by zinciri
  let assignedTo: string | null = null
  try {
    const { data } = await supabaseAdmin
      .from('questions')
      .select('assigned_to')
      .eq('id', questionId)
      .single()
    assignedTo = (data as any)?.assigned_to ?? null
  } catch {
    assignedTo = null
  }

  const { data: adminUser } = await supabaseAdmin
    .schema('auth')
    .from('users')
    .select('id')
    .eq('email', adminEmail)
    .maybeSingle()

  let profileUser: { id: string } | null = null
  try {
    const pr = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', adminEmail)
      .maybeSingle()
    profileUser = pr.data ?? null
  } catch {
    profileUser = null
  }

  const envOwner = process.env.DEFAULT_DRAFT_OWNER_ID || ''
  const createdBy =
    adminUser?.id || profileUser?.id || assignedTo || (envOwner ? envOwner : null)

  if (!createdBy) {
    return fail(
      'created_by üretilemedi. Çözüm: admin e-postasını auth.users/profiles’a ekleyin; soruya assigned_to atayın; ya da .env.local içine DEFAULT_DRAFT_OWNER_ID=<UUID> koyun.'
    )
  }

  // 3) Yeni draft versiyonu
  const { data: vRow, error: vErr } = await supabaseAdmin
    .from('answer_drafts')
    .select('version')
    .eq('question_id', questionId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (vErr) return fail(vErr.message)
  const nextVersion = (vRow?.version ?? 0) + 1

  // 4) Yeni draft (model: revert)
  const { data: dRow, error: dErr } = await supabaseAdmin
    .from('answer_drafts')
    .insert({
      question_id: questionId,
      content: content ?? '',
      content_html: contentHtml ?? null,
      version: nextVersion,
      model: 'revert',
      created_by: createdBy,
    })
    .select('id')
    .single()
  if (dErr) return fail(dErr.message)

  // 4.1) Soru üzerindeki işaretçiyi (varsa) yeni taslağa yönelt
  const bind = await updateQuestionDraftPointer(questionId, dRow.id)

  // 5) Aynı içeriği revizyona da ingest et → en üste çıksın
  const ing = await ingestToRevisions({
    questionId,
    content: content ?? '',
    createdBy,
    suggestedSeq: null,
	contentHtml: contentHtml ?? null,
  })

  return NextResponse.json(
    {
      ok: true,
      mode: 'revert',
      draft_id: dRow.id,
      version: nextVersion,                 // answer_drafts versiyonu
      draft_bound_columns: bind.updated,   // hangi kolon(lar) güncellendi
      revision_ingested: ing.ok,
      revision_no: (ing as any).revision_no ?? null,
      revision_version: (ing as any).version ?? null,
      revision_error: !ing.ok ? ing.reason : undefined,
    },
    { status: 200 }
  )
}
