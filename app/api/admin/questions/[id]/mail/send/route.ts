export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const BUCKET = 'attachments'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase env eksik (URL veya SERVICE_ROLE_KEY yok).')
  return createClient(url, key, { auth: { persistSession: false } })
}

function ensureEnv(...keys: string[]) {
  const miss = keys.filter((k) => !process.env[k])
  if (miss.length) {
    throw new Error(`Eksik env: ${miss.join(', ')}`)
  }
}

function escapeHtml(s: string) {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

 export async function POST(
   req: NextRequest,
   context: { params: Promise<{ id: string }> }
 ) {
   try {
    const { id } = await context.params
    const questionId = String(id || '')
   if (!questionId) {

      return NextResponse.json({ ok: false, display: 'missing_question_id' }, { status: 400 })
    }

    // RESEND yapılandırması
    ensureEnv('RESEND_API_KEY', 'RESEND_FROM')
    const resend = new Resend(process.env.RESEND_API_KEY!)

    // İstek gövdesi
    const body = await req.json().catch(() => ({}))
    const to = (body?.to || '').toString().trim()
    const cc = (body?.cc || '').toString().trim()
    const subject = (body?.subject || '').toString().trim() || `Yanıt - ${questionId}`
    const content = (body?.content || '').toString()
    const replyTo = (body?.reply_to || body?.replyTo || '').toString().trim()
    const attach: Array<{ path: string; name?: string }> = Array.isArray(body?.attachments)
      ? body.attachments
      : []

    if (!to) return NextResponse.json({ ok: false, display: 'Alıcı (to) gerekli.' }, { status: 400 })
    if (!content) return NextResponse.json({ ok: false, display: 'İçerik boş olamaz.' }, { status: 400 })

    // Supabase Storage'dan ekleri indir
    const supabase = getAdminClient()
    const attachments: Array<{ filename: string; content: Buffer }> = []

    for (const a of attach) {
      if (!a?.path || !a.path.startsWith(`${questionId}/`)) continue
      const { data, error } = await supabase.storage.from(BUCKET).download(a.path)
      if (error || !data) continue
      const buf = Buffer.from(await data.arrayBuffer())
      const filename = a.name || a.path.split('/').pop() || 'ek'
      attachments.push({ filename, content: buf })
    }

    // Resend ile gönder
    const res = await resend.emails.send({
      from: process.env.RESEND_FROM!, // ör: "Gümrük360 <no-reply@senindomainin.com>"
      to,
      cc: cc || undefined,
      subject,
      text: content,
      html: `<pre style="white-space:pre-wrap;font:14px/1.5 ui-monospace,Consolas,monospace">${escapeHtml(
        content
      )}</pre>`,
      attachments: attachments.length ? attachments : undefined,
      replyTo: replyTo || undefined,
    })

    if ((res as any)?.error) {
      const msg = (res as any).error?.message || 'Resend gönderim hatası'
      return NextResponse.json({ ok: false, display: msg }, { status: 500 })
    }

    return NextResponse.json({ ok: true, data: { id: (res as any).data?.id || null } })
  } catch (err: any) {
    return NextResponse.json({ ok: false, display: err?.message || 'server_error' }, { status: 500 })
  }
}
