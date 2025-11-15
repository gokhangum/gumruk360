export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Supabase env eksik (URL veya SERVICE_ROLE_KEY yok).')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {

  try {
    const { id: questionId } = await params
    if (!questionId) {
      return NextResponse.json({ error: 'question_id missing' }, { status: 400 })
    }

    const supabase = getAdminClient()

    // Öncelik: revision_no → version → created_at
    let rev: any = null

    // 1) revision_no varsa en büyük olanı
    {
      const { data, error } = await supabase
        .from('revisions')
        .select('id, question_id, content, revision_no, created_at')
        .eq('question_id', questionId)
        .order('revision_no', { ascending: false })
        .limit(1)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      rev = data && data.length ? data[0] : null
    }

    // 2) revision_no yoksa version’a göre
    if (!rev) {
      const { data, error } = await supabase
        .from('revisions')
        .select('id, question_id, content, version, created_at')
        .eq('question_id', questionId)
        .order('version', { ascending: false })
        .limit(1)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      rev = data && data.length ? data[0] : null
    }

    // 3) created_at’e göre (son çare)
    if (!rev) {
      const { data, error } = await supabase
        .from('revisions')
        .select('id, question_id, content, created_at')
        .eq('question_id', questionId)
        .order('created_at', { ascending: false })
        .limit(1)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      rev = data && data.length ? data[0] : null
    }

    if (!rev) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }

    return NextResponse.json({
      ok: true,
      data: {
        id: rev.id,
        question_id: rev.question_id,
        content: rev.content,
        created_at: rev.created_at,
        source: 'revision',
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'server_error' }, { status: 500 })
  }
}
