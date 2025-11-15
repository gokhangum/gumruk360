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

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isEmail(v: any): v is string {
  return typeof v === 'string' && v.includes('@') && v.length <= 320
}

/** Objede her seviyede email benzeri değer ara (maks derinlik: 3) */
function deepFindEmail(row: any, depth = 0): string | null {
  if (!row || depth > 3) return null
  if (typeof row === 'string') return isEmail(row) ? row.trim() : null
  if (Array.isArray(row)) {
    for (const it of row) {
      const f = deepFindEmail(it, depth + 1)
      if (f) return f
    }
    return null
  }
  if (typeof row === 'object') {
    for (const [k, v] of Object.entries(row)) {
      // email anahtarlarını öncele
      if (k.toLowerCase().includes('email') && isEmail(v)) {
        return String(v).trim()
      }
    }
    // Diğer alanlarda da deneyelim
    for (const [_k, v] of Object.entries(row)) {
      const f = deepFindEmail(v, depth + 1)
      if (f) return f
    }
  }
  return null
}

 async function lookupEmailById(
   supabase: ReturnType<typeof getAdminClient>,
  id?: string | null
 ) {

  const uid = (id || '').toString().trim()
  // ID alanı zaten e-posta olabilir
  if (isEmail(uid)) return uid
  if (!UUID_RX.test(uid)) return null

  const tries: Array<{ table: string; idCol: string; emailCol: string }> = [
    { table: 'profiles', idCol: 'id', emailCol: 'email' },
    { table: 'users', idCol: 'id', emailCol: 'email' },
    { table: 'app_users', idCol: 'id', emailCol: 'email' },
    { table: 'customers', idCol: 'id', emailCol: 'email' },
    { table: 'contacts', idCol: 'id', emailCol: 'email' },
    { table: 'workers', idCol: 'user_id', emailCol: 'email' },
  ]

  for (const t of tries) {
    try {
      const { data, error } = await supabase
        .from(t.table as any)
        .select(`${t.emailCol}`)
        .eq(t.idCol, uid)
        .limit(1)
      if (!error && data && data.length) {
        const e = String((data as any)[0][t.emailCol] || '')
        if (isEmail(e)) return e.trim()
      }
    } catch {
      // tablo yoksa sessiz geç
    }
  }
  return null
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const questionId = String((await params)?.id || '').trim()
    if (!questionId) {
      return NextResponse.json({ ok: false, display: 'missing_question_id' }, { status: 400 })
    }

    const supabase = getAdminClient()

    // Şemadan bağımsız güvenli yaklaşım: '*' ile oku
    const { data: q, error } = await supabase
      .from('questions')
      .select('*')
      .eq('id', questionId)
      .single()

    if (error || !q) {
      return NextResponse.json({ ok: false, display: 'Soru bulunamadı.' }, { status: 404 })
    }

    // 1) Satır içinde doğrudan/nested email ara
    const inline = deepFindEmail(q)
    if (inline) {
      return NextResponse.json({ ok: true, data: { email: inline, source: 'questions_row' } })
    }

    // 2) Muhtemel ID alanlarını dene → e-posta
    const idKeys = [
      'created_by',
      'user_id',
      'owner_id',
      'customer_id',
      'asker_id',
      'asked_by_id',
      'contact_id',
      'requester_id',
    ]

    for (const k of idKeys) {
      const candidate = await lookupEmailById(supabase, (q as any)[k])
      if (candidate) {
        return NextResponse.json({ ok: true, data: { email: candidate, source: k } })
      }
    }

    // Bulunamadı
    return NextResponse.json(
      { ok: false, display: 'İstek sahibi e-posta bulunamadı.' },
      { status: 404 }
    )
  } catch (err: any) {
    return NextResponse.json({ ok: false, display: err?.message || 'server_error' }, { status: 500 })
  }
}
