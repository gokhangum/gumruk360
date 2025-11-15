export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const BUCKET = 'attachments'

type ApiItem = {
  name: string
  path: string
  url: string | null
  size: number | null
  created_at?: string | null
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase env eksik (URL veya SERVICE_ROLE_KEY).')
  return createClient(url, key, { auth: { persistSession: false } })
}

async function signUrl(sb: SupabaseClient, path: string, exp = 3600) {
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, exp)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}

function mapListItem(prefix: string, it: any): ApiItem {
  const path = `${prefix}/${it.name}`
  const size = (it?.metadata && typeof it.metadata.size === 'number') ? it.metadata.size : null
  return { name: it.name, path, url: null, size, created_at: it?.created_at ?? null }
}

async function listDir(sb: SupabaseClient, dir: string) {
  const { data, error } = await sb.storage.from(BUCKET).list(dir, { limit: 2000, sortBy: { column: 'created_at', order: 'desc' } })
  if (error || !data) return []
  return data.filter((x: any) => x && typeof x.name === 'string')
}

async function getOwnerId(sb: SupabaseClient, questionId: string) {
  const { data, error } = await sb.from('questions').select('user_id').eq('id', questionId).maybeSingle()
  if (error) throw new Error(error.message)
  return (data as any)?.user_id as string | null
}

// ------------------------- GET: list -------------------------
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
  const questionId = String(id || '')
    if (!questionId) return NextResponse.json({ ok: false, display: 'missing_question_id' }, { status: 400 })

    const url = new URL(req.url)
    const scope = (url.searchParams.get('scope') || 'answer').toLowerCase() as 'question' | 'answer'

    const sb = adminClient()
    const ownerId = await getOwnerId(sb, questionId).catch(() => null)

    const flatBase = scope === 'question' ? `${questionId}` : `${questionId}/answers`
    const nestedBase = ownerId ? (scope === 'question' ? `${ownerId}/${questionId}` : `${ownerId}/${questionId}/answers`) : null

    const allItems: ApiItem[] = []

    // 1) Düz dizin
    const dl = await listDir(sb, flatBase)
    for (const it of dl) {
      // KLASÖR 'answers' ise (yalnız question scope’unda) atla
      if (scope === 'question' && it?.name?.toLowerCase?.() === 'answers') continue
      const mapped = mapListItem(flatBase, it)
      const signed = await signUrl(sb, mapped.path)
      if (!signed) continue // klasör vb. - hiç göstermeyelim
      mapped.url = signed
      allItems.push(mapped)
    }

    // 2) Nested dizin (varsa)
    if (nestedBase) {
      const nl = await listDir(sb, nestedBase)
      for (const it of nl) {
        if (scope === 'question' && it?.name?.toLowerCase?.() === 'answers') continue
        const mapped = mapListItem(nestedBase, it)
        const signed = await signUrl(sb, mapped.path)
        if (!signed) continue
        mapped.url = signed
        if (!allItems.some(x => x.path === mapped.path)) allItems.push(mapped)
      }
    }

    allItems.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    return NextResponse.json({ ok: true, data: allItems })
  } catch (err: any) {
    return NextResponse.json({ ok: false, display: err?.message || 'server_error' }, { status: 500 })
  }
}

// ------------------------- POST: upload (cevap ekleri) -------------------------
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: questionId } = await params
    if (!questionId) return NextResponse.json({ ok: false, display: 'missing_question_id' }, { status: 400 })

    const sb = adminClient()
    const form = await req.formData()
    let files = form.getAll('files') as File[]
    if (!files?.length) files = form.getAll('file') as File[]
    if (!files?.length) return NextResponse.json({ ok: false, display: 'Dosya seçilmedi.' }, { status: 400 })

    const uploaded: any[] = []
    for (const file of files) {
      const safe = String(file.name || 'file').replace(/[^\w\-. ]+/g, '_')
      const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safe}`
      const path = `${questionId}/answers/${unique}`

      const { error: upErr } = await sb.storage.from(BUCKET).upload(path, Buffer.from(await (file as any).arrayBuffer()), {
        contentType: (file as any).type || 'application/octet-stream',
        upsert: false,
      })
      if (upErr) return NextResponse.json({ ok: false, display: `Yükleme hatası: ${upErr.message}` }, { status: 500 })

      const url = await signUrl(sb, path)
      uploaded.push({ name: safe, path, url, size: (file as any).size ?? null })
    }

    return NextResponse.json({ ok: true, data: uploaded }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ ok: false, display: err?.message || 'server_error' }, { status: 500 })
  }
}

// ------------------------- DELETE: remove (sadece cevap ekleri) -------------------------
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const p = await ctx.params
    const questionId = String(p?.id || '')
    if (!questionId) return NextResponse.json({ ok: false, display: 'missing_question_id' }, { status: 400 })

    const url = new URL(req.url)
    const path = url.searchParams.get('path') || ''

    if (!path) return NextResponse.json({ ok: false, display: 'Geçersiz path' }, { status: 400 })
    const parts = path.split('/').filter(Boolean)
    const qi = parts.indexOf(questionId)
    const ai = parts.indexOf('answers')
    const looksValid = qi !== -1 && ai !== -1 && ai === qi + 1
    if (!looksValid) return NextResponse.json({ ok: false, display: 'Geçersiz path' }, { status: 400 })

    const sb = adminClient()
    const { error } = await sb.storage.from(BUCKET).remove([path])
    if (error) return NextResponse.json({ ok: false, display: `Silme hatası: ${error.message}` }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ ok: false, display: err?.message || 'server_error' }, { status: 500 })
  }
}
