export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import { createClient } from "@supabase/supabase-js"

const BUCKET = 'attachments'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase env eksik (URL veya SERVICE_ROLE_KEY).')
  return createClient(url, key, { auth: { persistSession: false } })
}

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

async function getQuestionOwnerId(admin: ReturnType<typeof getAdminClient>, questionId: string) {
  const { data, error } = await admin.from('questions').select('user_id').eq('id', questionId).maybeSingle()
  if (error) throw new Error(error.message)
  return (data as any)?.user_id as string | null
}

async function audit(event: string, payload: any) {
  try {
    await getAdminClient().from('audit_logs').insert(payload)
  } catch {}
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const form = await req.formData()
    const questionId = String(form.get("questionId") || "").trim()
    if (!questionId) return NextResponse.json({ ok: false, error: "missing_question_id" }, { status: 400 })

    // Varsayılan ve izin verilen tek hedef: cevap ekleri (alt liste)
    const rawScope = String(form.get("scope") || "answer").toLowerCase()
    if (rawScope !== 'answer') {
      return NextResponse.json({ ok: false, error: "scope_answer_only" }, { status: 400 })
    }

    let files = form.getAll("files") as unknown as File[]
    if (!files.length) {
      const maybe = form.getAll("file") as unknown as File[]
      if (maybe?.length) files = maybe
    }
    if (!files.length) return NextResponse.json({ ok: false, error: "file_not_found" }, { status: 400 })

    const admin = getAdminClient()
    const ownerId = await getQuestionOwnerId(admin, questionId)
    if (!ownerId) return NextResponse.json({ ok: false, error: "owner_not_found" }, { status: 404 })

    const results: any[] = []
    for (const f of files) {
      const safe = String(f.name || 'file').replace(/[^\w\-. ]+/g, '_')
      const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safe}`
      const path = `${ownerId}/${questionId}/answers/${unique}`

      const up = await admin.storage.from(BUCKET).upload(
        path,
        Buffer.from(await (f as any).arrayBuffer()),
        { contentType: (f as any).type || 'application/octet-stream', upsert: false }
      )
      if (up.error) {
        results.push({ ok: false, name: f.name, error: up.error.message })
        continue
      }

      results.push({ ok: true, name: safe, path })

      await audit('answer_attachment_uploaded', {
        actor_id: user.id,
        actor_user_id: user.id,
        actor_role: 'user',
        action: 'upload',
        resource_type: 'attachment',
        resource_id: null,
        question_id: questionId,
        event: 'answer_attachment_uploaded',
        payload: {
          bucket: BUCKET,
          object_path: path,
          file_name: safe,
          file_size: (f as any).size ?? null,
          scope: 'answer',
        }
      })
    }

    const failures = results.filter(r => !r.ok).length
    if (failures) return NextResponse.json({ ok: false, uploaded: results }, { status: 207 })
    return NextResponse.json({ ok: true, uploaded: results }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: 'Beklenmeyen hata.', detail: String(e?.message || e) }, { status: 500 })
  }
}
