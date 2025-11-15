// app/api/admin/questions/[id]/send/preview/route.ts
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { supabaseAdmin } from '@/lib/supabase/serverAdmin'
import { renderAnswerEmailHTML } from '@/lib/email/template'
import { BRAND } from "@/lib/config/appEnv"
async function getSessionUser() {
  const cookieStore = await cookies()
  const supa = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n: string) => cookieStore.get(n)?.value } }
  )
  const { data: { user }, error } = await supa.auth.getUser()
  if (error || !user) return null
  return user
}

async function assertWorkerOrAdmin(uid: string) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', uid)
    .maybeSingle()
  if (error) throw new Error('role_check_failed')
  const role = (data as any)?.role
  if (role !== 'admin' && role !== 'worker') {
    const e = new Error('unauthorized')
    ;(e as any).status = 403
    throw e
  }
}

async function buildPreview(questionId: string) {
  // soru
  const { data: q, error: qErr } = await supabaseAdmin
    .from('questions')
    .select('id, title, user_id')
    .eq('id', questionId)
    .maybeSingle()
  if (qErr) throw new Error(qErr.message || 'question_fetch_failed')
  if (!q) throw new Error('question_not_found')

  // en son taslak
  const { data: d, error: dErr } = await supabaseAdmin
    .from('answer_drafts')
    .select('version, content')
    .eq('question_id', questionId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (dErr) throw new Error(dErr.message || 'draft_fetch_failed')

  // alıcı (profiles → auth)
  let toEmail = ''
  try {
    const { data: prof } = await supabaseAdmin
      .from('profiles')
      .select('email')
      .eq('id', q.user_id)
      .maybeSingle()
    toEmail = (prof as any)?.email || ''
  } catch {}
  if (!toEmail && (supabaseAdmin as any)?.auth?.admin?.getUserById) {
    try {
      const res = await (supabaseAdmin as any).auth.admin.getUserById(q.user_id)
      toEmail = res?.data?.user?.email || toEmail
    } catch {}
  }

 const subject = `${BRAND.nameTR} Yanıtı – ${q.title || 'Sorunuz'}`
  const text = (d as any)?.content || ''
  const html = renderAnswerEmailHTML('tr', q.title || `${BRAND.nameTR} Yanıtı`, text)

  return { toEmail, subject, html }
}

async function handle(_req: Request, params: Promise<{ id: string }>) {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ ok: false, error: 'login_required' }, { status: 401 })
    await assertWorkerOrAdmin(user.id)
  const p = await params;
  const id = p?.id;

    const { toEmail, subject, html } = await buildPreview(id)
    return NextResponse.json({ ok: true, data: { toEmail, subject, html } })
  } catch (e: any) {
    const status = e?.status || (e?.message === 'unauthorized' ? 403 : 500)
    return NextResponse.json({ ok: false, error: e?.message || 'unexpected_error' }, { status })
  }
}

// İki methodu da destekle: GET ve POST → 405 biter
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(req, ctx.params)
}
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(req, ctx.params)
}
