// app/api/admin/gpt-answers/blocks/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase env eksik (URL veya SERVICE_ROLE_KEY yok).')
  return createClient(url, key, { auth: { persistSession: false } })
}

/**
 * Body:
 * {
 *   "profile_version_id": "uuid",
 *   "items": [
 *     { "block_id": "uuid", "sort_order": 1, "enabled": true, "params": { ... } },
 *     ...
 *   ]
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = getAdminClient()
    const body = await req.json().catch(() => ({}))
    const { profile_version_id, items } = body || {}

    if (!profile_version_id || !Array.isArray(items)) {
      return NextResponse.json({ ok: false, error: 'profile_version_id ve items zorunlu' }, { status: 400 })
    }

    // Versiyon var mı?
    const { data: ver, error: verErr } = await supabase
      .from('gpt_answer_profile_versions')
      .select('id, profile_id')
      .eq('id', profile_version_id)
      .maybeSingle()

    if (verErr) return NextResponse.json({ ok: false, error: verErr.message }, { status: 500 })
    if (!ver) return NextResponse.json({ ok: false, error: 'profile_version bulunamadı' }, { status: 404 })

    // Eski blokları temizle
    const del = await supabase
      .from('gpt_profile_blocks')
      .delete()
      .eq('profile_version_id', profile_version_id)
    if (del.error) return NextResponse.json({ ok: false, error: del.error.message }, { status: 500 })

    // Yeni blokları ekle (items boşsa sadece silmiş oluruz)
    if (items.length) {
      const rows = items.map((it: any, idx: number) => ({
        profile_version_id,
        block_id: it.block_id,
        sort_order: Number(it.sort_order ?? idx + 1),
        enabled: Boolean(it.enabled ?? true),
        params: it.params ?? {},
      }))
      const ins = await supabase.from('gpt_profile_blocks').insert(rows)
      if (ins.error) return NextResponse.json({ ok: false, error: ins.error.message }, { status: 500 })
    }

    // (opsiyonel) audit log — tablo yoksa sessiz geç
    try {
      await supabase.from('audit_logs').insert({
        action: 'gpt.answers.blocks.update',
        payload: { profile_version_id, count: items.length },
      } as any)
    } catch {}

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}
