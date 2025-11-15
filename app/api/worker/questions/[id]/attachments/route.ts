export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

const BUCKET = 'attachments'

type ApiItem = { name: string; path: string; url: string | null; size: number | null; created_at?: string | null }

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase env eksik (URL veya SERVICE_ROLE_KEY).')
  return createClient(url, key, { auth: { persistSession: false } })
}

async function getSessionUser() {

const supa = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    cookies: {
      get: async (name: string) => (await cookies()).get(name)?.value,
      set: async (name: string, value: string, options?: CookieOptions) => {
        const c = await cookies();
        c.set(name, value, options as any);
      },
      remove: async (name: string, options?: CookieOptions) => {
        const c = await cookies();
        c.set(name, '', { ...(options as any), maxAge: 0 });
      },
    },
  }
)

  const { data: { user } } = await supa.auth.getUser()
  return user
}

async function assertWorkerOrAdmin(sb: SupabaseClient) {
  const user = await getSessionUser()
  if (!user) throw Object.assign(new Error('unauthorized'), { status: 401 })
  const { data, error } = await sb.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (error) throw Object.assign(new Error('profile_error'), { status: 500 })
  const role = (data as any)?.role
  if (role !== 'worker' && role !== 'admin') throw Object.assign(new Error('forbidden'), { status: 403 })
  return user
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
  const { data, error } = await sb.storage.from(BUCKET).list(dir, { sortBy: { column: 'name', order: 'asc' } })
  if (error) return []
  return data || []
}

async function getOwnerId(sb: SupabaseClient, questionId: string) {
  const { data, error } = await sb.from('questions').select('user_id').eq('id', questionId).maybeSingle()
  if (error) throw new Error(error.message)
  return (data as any)?.user_id as string | null
}

// ------------------------- GET: list -------------------------
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const questionId = String(id || '')
    if (!questionId) return NextResponse.json({ ok: false, display: 'missing_question_id' }, { status: 400 })

    const sb = adminClient()
    await assertWorkerOrAdmin(sb)

    const url = new URL(req.url)
    const scope = (url.searchParams.get('scope') || 'answer').toLowerCase() as 'question' | 'answer'

    const ownerId = await getOwnerId(sb, questionId).catch(() => null)

    const flatBase = scope === 'question' ? `${questionId}` : `${questionId}/answers`
    const nestedBase = ownerId ? (scope === 'question' ? `${ownerId}/${questionId}` : `${ownerId}/${questionId}/answers`) : null

    const items: ApiItem[] = []

    // flat
    const fl = await listDir(sb, flatBase)
    for (const it of fl) {
      if (scope === 'question' && it?.name?.toLowerCase?.() === 'answers') continue
      const mapped = mapListItem(flatBase, it)
      const signed = await signUrl(sb, mapped.path)
      if (!signed) continue
      mapped.url = signed
      items.push(mapped)
    }

    // nested (ownerId partitioned)
    if (nestedBase) {
      const nl = await listDir(sb, nestedBase)
      for (const it of nl) {
        if (scope === 'question' && it?.name?.toLowerCase?.() === 'answers') continue
        const mapped = mapListItem(nestedBase, it)
        const signed = await signUrl(sb, mapped.path)
        if (!signed) continue
        mapped.url = signed
        items.push(mapped)
      }
    }

    // unique by path
    const uniq = new Map<string, ApiItem>()
    for (const it of items) uniq.set(it.path, it)
    return NextResponse.json({ ok: true, data: Array.from(uniq.values()) })
  } catch (err: any) {
    const status = err?.status || 500
    return NextResponse.json({ ok: false, display: err?.message || 'server_error' }, { status })
  }
}

// ------------------------- POST: upload (only answers) -------------------------
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const questionId = String(id || '')
    if (!questionId) return NextResponse.json({ ok: false, display: 'missing_question_id' }, { status: 400 })

    const sb = adminClient()
    const user = await assertWorkerOrAdmin(sb)

    const form = await req.formData()
    const files = form.getAll('files')
    if (!files || files.length === 0) return NextResponse.json({ ok: false, display: 'file_not_found' }, { status: 400 })

    const uploaded: ApiItem[] = []
    for (const file of files) {
      if (!(file instanceof Blob)) continue
      const name = (file as any).name || 'file'
      const safe = name.replace(/[^a-zA-Z0-9._-]+/g, '_')
      const path = `${questionId}/answers/${safe}`
      const { error: upErr } = await sb.storage.from(BUCKET).upload(path, file, { upsert: true })
      if (upErr) return NextResponse.json({ ok: false, display: 'upload_error' }, { status: 500 })
      const url = await signUrl(sb, path)
      uploaded.push({ name: safe, path, url, size: (file as any).size ?? null })
    }
    return NextResponse.json({ ok: true, data: uploaded }, { status: 201 })
  } catch (err: any) {
    const status = err?.status || 500
    return NextResponse.json({ ok: false, display: err?.message || 'server_error' }, { status })
  }
}

// ------------------------- DELETE: remove (answers only) -------------------------
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const questionId = String(id || '')
    if (!questionId) return NextResponse.json({ ok: false, display: 'missing_question_id' }, { status: 400 })

    const sb = adminClient()
    await assertWorkerOrAdmin(sb)

    const url = new URL(req.url)
    const path = url.searchParams.get('path') || ''
    if (!path) return NextResponse.json({ ok: false, display: 'invalid_path' }, { status: 400 })

    const parts = path.split('/').filter(Boolean)
    const qi = parts.indexOf(questionId)
    const ai = parts.indexOf('answers')
    const looksValid = qi !== -1 && ai !== -1 && ai === qi + 1
    if (!looksValid) return NextResponse.json({ ok: false, display: 'invalid_path' }, { status: 400 })

    const { error } = await sb.storage.from(BUCKET).remove([path])
    if (error) return NextResponse.json({ ok: false, display: 'delete_error' }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    const status = err?.status || 500
    return NextResponse.json({ ok: false, display: err?.message || 'server_error' }, { status })
  }
}
