export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

function json(ok: boolean, data: any = {}, status = 200) {
  return NextResponse.json({ ok, ...data }, { status })
}

export async function HEAD() { return new NextResponse(null, { status: 204 }) }
export async function OPTIONS() { return new NextResponse(null, { status: 204 }) }

 export async function PATCH(
  req: NextRequest,
   context: { params: Promise<{ id: string }> }
 ) {
   const { id } = await context.params
  if (!id) return json(false, { error: 'id gerekli' }, 400)

  try {
    const supabase = getAdminClient()
    if (!supabase) return json(false, { error: 'Supabase environment eksik' }, 500)

    const body = await req.json().catch(() => ({}))
    const action = body?.action as 'activate'|'archive'
    if (!action) return json(false, { error: 'action gerekli' }, 400)

    const { data: row, error: readErr } = await supabase
      .from('gpt_answer_profile_versions')
      .select('id, profile_id, status')
      .eq('id', id)
      .maybeSingle()
    if (readErr) return json(false, { error: `Versiyon okunamadı: ${readErr.message}` }, 500)
    if (!row?.id) return json(false, { error: 'Versiyon bulunamadı' }, 404)

    if (action === 'activate') {
      const { error: archErr } = await supabase
        .from('gpt_answer_profile_versions')
        .update({ status: 'archived' })
        .eq('profile_id', row.profile_id)
        .neq('id', row.id)
      if (archErr) return json(false, { error: `Diğer versiyonlar arşivlenemedi: ${archErr.message}` }, 500)

      const { error: pubErr } = await supabase
        .from('gpt_answer_profile_versions')
        .update({ status: 'published' })
        .eq('id', row.id)
      if (pubErr) return json(false, { error: `Aktifleştirme başarısız: ${pubErr.message}` }, 500)

      try { await supabase.from('audit_logs').insert({ action: 'gpt.version.activated', resource_type: 'gpt_answer_profile_versions', resource_id: row.id, event: 'updated', metadata: { profile_id: row.profile_id }, actor_role: 'system' } as any) } catch {}
      return json(true, { id: row.id })
    }

    const { error: updErr } = await supabase
      .from('gpt_answer_profile_versions')
      .update({ status: 'archived' })
      .eq('id', row.id)
    if (updErr) return json(false, { error: `Arşivleme başarısız: ${updErr.message}` }, 500)

    try { await supabase.from('audit_logs').insert({ action: 'gpt.version.archived', resource_type: 'gpt_answer_profile_versions', resource_id: row.id, event: 'updated', metadata: { profile_id: row.profile_id }, actor_role: 'system' } as any) } catch {}
    return json(true, { id: row.id })
  } catch (e: any) {
    return json(false, { error: String(e?.message || e) }, 500)
  }
}

export async function DELETE(
 _req: NextRequest,
 context: { params: Promise<{ id: string }> }
 ) {
   const { id } = await context.params
  if (!id) return json(false, { error: 'id gerekli' }, 400)


  try {
    const supabase = getAdminClient()
    if (!supabase) return json(false, { error: 'Supabase environment eksik' }, 500)

    const { data: row, error: readErr } = await supabase
      .from('gpt_answer_profile_versions')
      .select('id, profile_id, status')
      .eq('id', id)
      .maybeSingle()
    if (readErr) return json(false, { error: `Versiyon okunamadı: ${readErr.message}` }, 500)
    if (!row?.id) return json(false, { error: 'Versiyon bulunamadı' }, 404)

    // GÜNCEL: draft VEYA archived silinebilir
    if (row.status !== 'draft' && row.status !== 'archived') {
      return json(false, { error: 'Yalnızca taslak (draft) veya arşivli (archived) versiyon silinebilir' }, 400)
    }

    // İlişkili blokları temizle (tablo yoksa yoksay)
    const { error: delBlocksErr } = await supabase
      .from('gpt_profile_blocks')
      .delete()
      .eq('profile_version_id', row.id)
    if (delBlocksErr && (delBlocksErr as any).code !== '42P01') { // tablo yoksa yoksay
      return json(false, { error: `Bloklar silinemedi: ${delBlocksErr.message}` }, 500)
    }

    const { error: delErr } = await supabase
      .from('gpt_answer_profile_versions')
      .delete()
      .eq('id', row.id)
    if (delErr) return json(false, { error: `Versiyon silinemedi: ${delErr.message}` }, 500)

    try { await supabase.from('audit_logs').insert({ action: 'gpt.version.deleted', resource_type: 'gpt_answer_profile_versions', resource_id: row.id, event: 'deleted', metadata: { profile_id: row.profile_id }, actor_role: 'system' } as any) } catch {}

    return json(true, { id: row.id })
  } catch (e: any) {
    return json(false, { error: String(e?.message || e) }, 500)
  }
}
